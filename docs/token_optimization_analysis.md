# Anya Token 消耗与 LLM 调用优化分析

## 当前状态量化

先看每次 `Agent.run()` 的固定 token 开销：

| 层级 | 字节数 | 估算 Token | 备注 |
|------|--------|-----------|------|
| SOUL.md | 4,301 | ~1,200 | 每次必带 |
| RULES.md | 6,296 | ~1,700 | 每次必带 |
| USER.md | 1,047 | ~300 | 每次必带 |
| MEMORY.md | 2,823 | ~800 | 每次必带 |
| Skill Index (30个) | ~800 | ~200 | 改为分类索引后 |
| Security + Caps | ~500 | ~140 | 每次必带 |
| **System Prompt 固定开销** | **~15K** | **~4,300** | **每次 LLM 调用都付** |

再看一个典型练习流程的 **额外** token：

| 阶段 | LLM 调用次数 | 额外 Token (per call) | 说明 |
|------|-------------|----------------------|------|
| `/new` → planner | 2-3 | +2K | skill_view(planner) + persist(coach_context) + tg_msg |
| 用户点击 `listening-dictation` | 2-3 | +5K | skill_view(listening-dictation) + tts + tg_msg |
| 用户答完听写 | 1-2 | +1K | persist(logPractice) + tg_msg |
| 用户点击"换一个练习" | 2-3 | +5K | **上下文已包含完整听写历史** |
| 切换到 writing-builder | 2-3 | +6K | skill_view(writing-builder) + 历史全带 |

> [!CAUTION]
> **核心问题**：从听力练习切换到写作练习时，整个听力对话历史（包括 TTS 音频路径、skill_view 返回的完整 SKILL.md 内容、persist 的 JSON 结果）都留在 session 上下文中。对写作练习来说这些全是**无效 token**。

---

## 🔴 问题 1：Session 上下文污染（最大浪费源）

### 当前行为

```
Session: tg:12345 (一直复用，除非 /new 或 /kill)

Turn 1:  /new → planner → skill_view(planner) → persist(coach_context) → tg_msg(menu)
Turn 2:  [callback] listening-dictation → skill_view(listening-dictation) → tts → tg_msg  
Turn 3:  用户答题 → persist(logPractice) → tg_msg(反馈)
Turn 4:  "换一个练习" → skill_view(planner) → persist(coach_context) → tg_msg(menu)
Turn 5:  [callback] writing-builder → skill_view(writing-builder) → tg_msg
         ↑ 此时 messages 数组包含 Turn 1-4 所有内容（~30+ messages, ~15K+ tokens）
```

**Turn 5 的写作练习不需要 Turn 2-3 的听力对话**。但因为同一个 session，全部带进了 prompt。

### 已实现方案：Skill 切换 → 新建 Session

当 callback 命中一个已知 skill slug 时，`TelegramAdapter` 自动 `createSession()` 并设置 `active_skill`：

```typescript
// TelegramAdapter callback handler
if (isSkillSwitch) {
  const newSid = await createSession(sessionKey);
  await setActiveSkill(newSid, data);  // 持久化到 session
  runOpts.sessionId = newSid;          // 新 session，旧历史不带入
}
```

优点：
- 持久化：旧历史留在上一个 session，后续轮次也不会重新加载
- 新 session 干净启动，`active_skill` 已预设
- `Agent.run()` 从 session 读取 `active_skill`，注入 system prompt
- 用户无感（不需要手动 `/new`）

> [!NOTE]
> `RunOptions` 保留了 `historyWindow` / `contextSummary` 作为通用能力，
> 但 skill 切换场景统一使用 `createSession()` 以确保持久性。

---

## 🔴 问题 2：skill_view 每次全文加载（~5-8K token/次）

### 当前行为

每次 LLM 决定执行一个 skill，它都会调用 `skill_view` 读取完整的 `SKILL.md`（3-8K 字节）。这个内容会作为 tool result 留在 messages 中，**后续每轮 loop 都会重复发送给 LLM**。

典型 skill 大小：
- `listening-dictation`: 7,993 bytes (~2,200 tokens)
- `profile-manager`: 6,361 bytes (~1,800 tokens)
- `placement-quick`: 5,504 bytes (~1,500 tokens)

### 已实现方案：Session 级 Active Skill + System Prompt 注入

`sessions` 表增加 `active_skill` 列。Skill 生命周期跟着 session 走：

```
1. skill_view("listening-dictation") 被调用
2. Agent 检测到 getSkill() 存在 → setActiveSkill(sessionId, "listening-dictation")
3. 同时把 skill body 注入当前 messages[0] (system prompt)
4. tool result 替换为短确认: [Skill "listening-dictation" loaded]
5. 下一轮 Agent.run() → getActiveSkill(sessionId) → 从 loader 重新读取 body → 注入 system prompt
```

优点：
- Agent 是 per-message 的临时实例，但 active skill 持久化在 session 中
- Skill body 在 system prompt 中（有 prompt cache 加持），不在 messages 中累积
- 切换 skill 时自动替换
- Tool result 是短确认，不会在历史中占 2-8K token

---

## 🟡 问题 3：Tool Result 过大

### 当前行为

某些 tool 返回大量 JSON，全部留在 messages 中：

| Tool | 典型返回大小 | 说明 |
|------|-------------|------|
| `persist(coach_context)` | 2-5K | 包含 summary、due_words、due_tasks 完整 JSON |
| `skill_view` | 3-8K | 完整 SKILL.md |
| `persist(study_summary)` | 1-3K | 详细统计 |
| `web_search` | 3-10K | 多条搜索结果 |

这些在当前 turn 有用，但**下一个 turn 就变成了历史噪音**。

### 解法

#### A. Tool Result 自动截断（对历史中的旧结果）

在 `sanitizeHistory` 或 `truncateHistory` 中，对超过阈值的旧 tool result 做截断：

```typescript
function trimOldToolResults(history: Message[]): Message[] {
  // 只保留最近 N 条 tool result 的完整内容
  // 更早的 tool results 截断到 200 chars + "[truncated]"
  const KEEP_RECENT = 6; // 保留最近 6 条完整
  const MAX_OLD_CHARS = 200;
  
  let toolCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'tool') {
      toolCount++;
      if (toolCount > KEEP_RECENT && history[i].content && history[i].content.length > MAX_OLD_CHARS) {
        history[i] = {
          ...history[i],
          content: history[i].content.substring(0, MAX_OLD_CHARS) + '\n[...truncated]'
        };
      }
    }
  }
  return history;
}
```

#### B. `persist` 返回精简确认

当前 `persist` 返回完整的操作结果 JSON，但 LLM 通常只需要确认成功：

```json
// 现在
{"success": true, "activity_id": 42, "inserted": 3, "data": {...完整数据...}}

// 优化后
{"ok": true, "saved": 3}
```

---

## 🟡 问题 4：Planner → Skill 的双重 LLM 调用

### 当前行为

用户点击菜单按钮时的 LLM 调用链：

```
[callback] listening-dictation
  → LLM Call 1: 识别 callback → 调用 skill_view(listening-dictation)
  → LLM Call 2: 读取 skill_view 结果 → 生成 TTS + tg_msg
  → LLM Call 3: (如果需要额外 tool) persist + tg_msg
```

每个 callback 至少 **2 次 LLM 调用**（一次理解意图 + 调用 skill_view，一次执行 skill）。

### 已实现方案：Session Active Skill + System Prompt 注入

当 callback 命中已知 skill slug 时，TelegramAdapter 新建 session 并设置 `active_skill`，
`Agent.run()` 启动时从 session 读取 active skill 并注入 system prompt。

```typescript
// TelegramAdapter: 新建 session + 预设 active skill
if (isSkillSwitch) {
  const newSid = await createSession(sessionKey);
  await setActiveSkill(newSid, data);
  runOpts.sessionId = newSid;
}

// Agent.run(): 从 session 读取 active skill → 注入 system prompt
const activeSkillName = getActiveSkill(sessionId);
if (activeSkillName) {
  const skill = getSkill(activeSkillName);
  if (skill) {
    systemPrompt += `\n\n## Active Skill Instructions\n\n${skill.body}`;
  }
}
```

LLM 仍可能调用 `skill_view` 来确认或切换 skill，此时 Agent 会更新 session 的 `active_skill`
并将 tool result 替换为短确认。这样 LLM 第一次调用就已有 skill 指令（在 system prompt 中），
但不会阻止 LLM 主动加载其他 skill。

---

## 🟡 问题 5：Skill Index 30 个 × 每次

### 当前行为

`buildSkillIndex()` 在**每次** `buildSystemPrompt()` 调用时，把 30 个 skill 的 `name + description` 全部放入 system prompt。大约 700 token。

### 解法

#### A. 按活跃场景过滤

根据当前上下文只注入相关 skills：

```typescript
function buildSkillIndex(activeCategory?: string): string {
  const skills = loadSkills();
  
  // 如果在练习模式中，只显示相关 skills
  if (activeCategory === 'listening') {
    // 只显示 listening-* skills + planner + 通用 skills
  }
  
  // 否则显示全部
}
```

#### B. 分层索引

System prompt 中只放**类别**（6-7 行），具体 skill 列表通过 `skill_view` 按需获取：

```
## Available Skill Categories
- listening (5 skills) — 精听、跟读、数字、播客、泛听
- speaking (3 skills) — 跟读、自由说、复述
- reading (2 skills) — 深读、泛读
- writing (2 skills) — 造句、改写
- support (4 skills) — 词汇复习、诊断、规划、建档

Use `skill_view` with a category or skill name to load details.
```

从 ~700 token 减到 ~150 token。

---

## 🟢 问题 6：Compression 策略优化

### 当前行为

`ContextCompressor` 在 token 接近上限时才触发（`0.8 × 400K = 320K`）。对于 mini 模型 400K 上下文，这意味着可能**永远不会触发**，所有历史永远在上下文中。

### 解法

不要只看 context window limit，还要看**成本/延迟阈值**：

```typescript
shouldCompress(messages, estimatedTokens, contextLimit) {
  // 原有: 接近模型限制时压缩
  if (estimatedTokens > contextLimit * this.thresholdRatio) return true;
  
  // 新增: 超过"经济阈值"时也压缩（减少不必要的 token 消耗）
  const ECONOMIC_THRESHOLD = 30_000; // 30K tokens = 开始累积无效历史
  if (estimatedTokens > ECONOMIC_THRESHOLD && messages.length > 30) return true;
  
  return false;
}
```

---

## 优先级排序

| 优先级 | 问题 | 预估节省 | 复杂度 | 已实现方案 |
|--------|------|---------|--------|--------|
| 🔴 P0 | Session 上下文污染 | 10-20K token/次切换 | 中 | Skill 切换 → createSession() |
| 🔴 P0 | skill_view 全文留在 messages | 5-8K token/每个 skill | 中 | Session active_skill + system prompt 注入 + 短确认 |
| 🟡 P1 | Tool result 过大 | 3-5K token/turn | 低 | trimOldToolResults (最近 6 条保留) |
| 🟡 P1 | Callback → Skill 双重调用 | 1 次 LLM 调用/次切换 | 低 | Active skill 预设 → system prompt 已包含指令 |
| 🟡 P2 | Skill Index 30 个全带 | ~500 token/call | 低 | 分类索引 (30行 → 2行) |
| 🟢 P3 | Compression 只看上限 | 长对话节省大量 | 低 | 经济阈值 (60K/50) |

---

## 用户场景全链路优化对比

### 场景：听力练习 → 切换到写作练习

**优化前：**
```
LLM Call 1: [4.8K system + 0K history] = 4.8K input → skill_view(planner)
LLM Call 2: [4.8K system + 8K history] = 12.8K → persist + tg_msg(menu)
LLM Call 3: [4.8K system + 14K history] = 18.8K → skill_view(listening)  
LLM Call 4: [4.8K system + 22K history] = 26.8K → tts + tg_msg
... 3 turns of practice ...
LLM Call 8: [4.8K system + 40K history] = 44.8K → "换一个"
LLM Call 9: [4.8K system + 45K history] = 49.8K → skill_view(planner)
LLM Call 10: [4.8K system + 52K history] = 56.8K → persist + tg_msg(menu)
LLM Call 11: [4.8K system + 58K history] = 62.8K → skill_view(writing)
LLM Call 12: [4.8K system + 66K history] = 70.8K → tg_msg(作文题)

总 input tokens: ~350K+
```

**优化后（已实现）：**
```
LLM Call 1: [4.3K system + 0K history] = 4.3K → skill_view 注入 system prompt
LLM Call 2: [8K system + 3K history] = 11K → persist + tg_msg(menu)
--- 用户点击 listening-dictation → createSession + setActiveSkill ---
LLM Call 3: [10K system + 0K history] = 10K → tts + tg_msg (新 session, active skill 在 system prompt)
... 3 turns of practice (tool results auto-trimmed) ...
LLM Call 6: [10K system + 8K history] = 18K → "换一个"
LLM Call 7: [4.3K system + 10K history] = 14.3K → skill_view(planner) + persist + tg_msg(menu)
--- 用户点击 writing-builder → createSession + setActiveSkill ---
LLM Call 8: [10K system + 0K history] = 10K → tg_msg(作文题)

总 input tokens: ~80K
节省: ~77% token
节省: ~4 次 LLM 调用 (12 → 8)
```

> [!IMPORTANT]
> 上述优化的本质是：**对话上下文应该跟着"任务"走，而不是跟着"聊天窗口"走**。每次 skill 切换本质上是一个新任务，通过 `createSession()` 实现真正的上下文隔离，而 session 级 `active_skill` 字段确保 SKILL.md 指令在新 session 中通过 system prompt 持续注入。

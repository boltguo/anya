# Anya Architecture

> **Anya** 是一个个人 AI Agent，通过 CLI 和 Telegram 与用户交互，支持多模型、多工具、持久记忆和可扩展的 Skill 系统。

---

## 项目定位

Anya 是一个 **个人 mini agent**，核心特点：

- 支持 CLI REPL 和 Telegram Bot 两种交互方式
- 基于 ReAct (Reason + Act) 循环执行任务
- 内置文件、Shell、搜索、记忆等工具
- 通过 Skill 系统进行领域扩展
- 支持 Gemini 和 OpenAI 双模型
- 语音输入 (STT) + 语音输出 (TTS) + 图片理解 (Vision)
- 定时任务 (Cron) 主动触达

---

## 系统分层

```
┌──────────────────────────────────────────────────────┐
│  Entry Layer                                          │
│  CLI (bin/anya.ts)  │  Telegram (gateway)  │  Cron    │
├──────────────────────────────────────────────────────┤
│  Command Layer                                        │
│  chat  │  init  │  model  │  config  │  gateway       │
├──────────────────────────────────────────────────────┤
│  Agent Core                                           │
│  Agent.run() ← ReAct Loop                             │
│  ├─ promptBuilder (SOUL + RULES + Memory + Skills)    │
│  ├─ history (truncation + sanitization)               │
│  ├─ contextCompressor (LLM-based summarization)       │
│  └─ errorClassifier (retry / rotate / compress)       │
├──────────────────────────────────────────────────────┤
│  Provider Layer              │  Tool Layer             │
│  ├─ Gemini (@google/genai)   │  ├─ read/write/list_dir │
│  ├─ OpenAI (Codex SSE)       │  ├─ shell               │
│  ├─ credentialPool (rotate)  │  ├─ web_search (Tavily)  │
│  └─ registry (model→provider)│  ├─ memory_update        │
│                              │  ├─ skill_manage/view    │
│                              │  ├─ tg (Telegram 富交互) │
│                              │  ├─ tts (Edge TTS)       │
│                              │  └─ clarify              │
├──────────────────────────────────────────────────────┤
│  Adapter Layer                                        │
│  ├─ CliAdapter (chalk + inquirer)                     │
│  └─ TelegramAdapter                                  │
│     ├─ TelegramAdapter (Bot 生命周期 + handler 路由)  │
│     └─ SessionAdapter (per-turn 出站队列 + 去重)      │
├──────────────────────────────────────────────────────┤
│  Storage & Foundation                                 │
│  SQLite (sessions/messages) │ config │ logger │ paths  │
└──────────────────────────────────────────────────────┘
```

---

## 核心链路：ReAct Loop

Anya 的核心是 `Agent.run()`，实现标准的 ReAct 循环：

1. **加载会话** — 从 SQLite 读取历史消息
2. **组装 Prompt** — SOUL + RULES + Memory + Skills + Security + 时间
3. **截断 + 清洗** — 历史消息截断、Gemini 格式清洗
4. **调用 LLM** — 通过 Provider 发送请求
5. **处理响应**：
   - 如果是 **Tool Calls** → 逐个执行 → 结果回写消息链 → 回到第 4 步
   - 如果是 **Text** → 最终回复 → 存库 → 结束
6. **异常恢复** — errorClassifier 分类 → 重试 / 压缩 / 轮换 key

单次 run 最多执行 `max_react_loops` 次循环（默认 25），超出后返回警告。

---

## Provider 设计

### 双 Provider 架构

| Provider | SDK | 认证方式 | 特殊能力 |
|----------|-----|---------|---------|
| **Gemini** | `@google/genai` | API Key (支持多 key 轮换) | Thinking tokens, implicit cache |
| **OpenAI** | 手写 SSE | OAuth Device Grant | Codex Responses API |

### Credential Pool

支持多 API Key 轮换，当某个 key 遇到限流/计费错误时自动切换到下一个：

- 每个 key 有状态：`active` / `cooldown` / `exhausted`
- 限流后自动 cooldown 3 分钟
- 计费错误标记为 exhausted 直到手动重置

### Error Classifier

将原始 API 错误转换为结构化的 `ClassifiedError`：

| 错误类型 | HTTP 状态码 | 处理策略 |
|---------|-----------|---------|
| `rate_limit` | 429 | 退避重试 + 轮换 key |
| `auth` | 401/403 | 刷新 token → 轮换 key |
| `billing` | 402 | 轮换 key |
| `context_overflow` | 400 (特定消息) | 压缩上下文后重试 |
| `server_error` | 500/502 | 退避重试 |
| `overloaded` | 503/529 | 退避重试 |
| `timeout` | - | 重试 |

---

## Tool 系统

### 注册机制

工具在模块加载时通过 `register()` 注册到全局 Map。Agent 运行时通过 `getToolSchemas()` 获取 LLM function declarations，通过 `dispatch()` 执行。

### 平台过滤

非 Telegram 环境下自动过滤 `tg` 工具，节省 prompt tokens。

### 内置工具一览

| 工具 | 作用 | 安全机制 |
|------|------|---------|
| `read_file` / `write_file` / `list_dir` | 文件系统操作 | 路径沙箱 (allowed_paths) |
| `shell` | 执行命令 | 命令审批 + allowlist |
| `web_search` | 网络搜索 | Tavily SDK, 24h 缓存 |
| `memory_update` | 更新长期记忆 | 写入 ~/.anya/memories/ |
| `skill_manage` / `skill_view` | 管理/查看技能 | 限定 ~/.anya/skills/ |
| `tg` | Telegram 富交互 | 仅 Telegram 平台可用 |
| `tts` | 文本转语音 | Edge TTS (免费) |
| `clarify` | 向用户发起选择 | 平台原生 UI |

### Tool → Skill 关系

- **Tools** = 原子能力 (读文件、执行命令、发消息)
- **Skills** = 领域工作流 (SKILL.md 描述的多步骤流程)
- Agent 在运行时用 tools 来执行 skills 定义的流程

---

## Adapter 设计

### 接口定义

```typescript
interface Adapter {
  platform: 'cli' | 'telegram';
  reply(content: string): Promise<void>;
  showToolCall?(name: string, args: Record<string, unknown>): void;
  showToolResult?(name: string, result: string, isError: boolean): void;
  requestApproval(description: string): Promise<'allow' | 'deny' | 'always'>;
}
```

### Telegram 适配器架构

Telegram 使用两层设计：

- **TelegramAdapter** — 单例，持有 grammy Bot 实例，管理长轮询生命周期
  - 注册 `/start`、`/new` 命令
  - 路由 text / voice / photo / callback_query
  - voice → 下载 → Groq Whisper STT → Agent
  - photo → 下载 → Gemini Vision → Agent
  - callback → 分流 (approval / choice / agent input)

- **TelegramSessionAdapter** — 每个 turn 创建一个，实现 `Adapter` 接口
  - 所有出站 TG API 调用通过单并发 `PQueue` 串行执行
  - `hasSentContent` 去重：tg tool 已发消息时跳过最终 reply
  - `autoReplyTo`：首条消息自动 reply-to 用户消息
  - `statusMessage`：工具执行时显示/编辑单条状态消息
  - `taggedMessages`：支持 tag→messageId 映射，后续 edit/pin/reply

---

## Context Compression

当上下文 token 数超过阈值（默认 75% context window）时触发压缩：

1. **保护区**：头部 3 条 + 尾部 8 条消息不压缩
2. **中间区**：先截断过长的 tool result（>2000 字符）
3. **LLM 摘要**：用当前模型生成结构化摘要（Goal / Progress / Decisions / Pending / Key Data）
4. **替换**：中间区替换为一条 `[Previous conversation summary]` 消息
5. **兜底**：如果摘要 LLM 调用失败，使用提取式 fallback

最多压缩 3 次。Context overflow 错误也会触发压缩而非直接失败。

---

## Storage

### SQLite (node:sqlite)

- **sessions** 表：`id`, `key`, `title`, `created_at`, `updated_at`
- **messages** 表：`id`, `session_id`, `role`, `content`, `tool_call_id`, `tool_name`, `tool_calls_json`, `raw_parts_json`, `created_at`
- WAL 模式，写冲突时 `Atomics.wait` 重试（最多 3 次）

### 文件系统

```
~/.anya/
├── config.json          # 配置文件
├── auth.json            # OpenAI OAuth tokens (chmod 600)
├── memories/
│   ├── USER.md          # 用户画像（agent 主动更新）
│   └── MEMORY.md        # agent 笔记
├── skills/              # Skill 文件 (SKILL.md)
├── soul/
│   ├── SOUL.md          # 人格设定
│   └── RULES.md         # 操作规则
├── data/
│   ├── sessions.db      # SQLite 数据库
│   └── search/          # 搜索结果缓存
├── logs/                # pino 日志 (daily rotation, 10MB max)
├── cron/
│   └── jobs.json        # 定时任务定义
└── cache/               # TTS 音频 / 语音下载缓存
```

---

## Prompt 组装

`buildSystemPrompt()` 按顺序拼接：

1. **SOUL.md** — 人格定义（fallback 到 config.agent.personality）
2. **RULES.md** — 操作规则
3. **Timestamp** — 当前时间
4. **Memory** — USER.md + MEMORY.md
5. **Skills Index** — 已安装 skill 的名称 + 触发条件
6. **Security** — 路径沙箱 + 命令审批规则
7. **Platform Capabilities** — 根据已启用工具动态生成（TTS、Vision 等）

文件使用 mtime 缓存（30s TTL），避免每次 LLM 调用都重新读盘。

---

## Cron 系统

- `jobs.json` 定义定时任务（cron 表达式 + prompt + 目标平台）
- `CronScheduler` 使用 `croner` 库调度
- 每个 job 执行时创建独立 Agent + Adapter 实例
- 支持 CLI 和 Telegram 两种投递目标

---

## 代码统计

| 指标 | 数值 |
|------|------|
| 文件数 | 72 个 .ts 文件 |
| 总行数 | ~8,800 行 |
| 纯代码 | ~5,700 行 |
| 注释 | ~1,900 行 |

### 按模块分布

| 模块 | 纯代码行 | 职责 |
|------|---------|------|
| agent/ | ~960 | Agent 核心、ReAct 循环、上下文压缩、错误分类 |
| adapters/ | ~1,020 | CLI + Telegram 适配 |
| tools/ | ~1,100 | 8 个内置工具 |
| commands/ | ~1,050 | CLI 命令 (chat, init, config, gateway) |
| providers/ | ~760 | Gemini + OpenAI + credential pool |
| lib/ | ~1,030 | 基础设施 (TTS, STT, Vision, auth, logger, paths) |
| config/ | ~470 | 配置 schema + loader + defaults |
| storage/ | ~300 | SQLite session store |
| skills/ | ~210 | Skill 加载 + YAML 解析 |
| cron/ | ~270 | 定时任务调度 |

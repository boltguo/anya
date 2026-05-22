# Telegram Render Envelope 设计方案

> 目的：把 Telegram 消息编排从 LLM 的多轮工具调用下沉到 adapter / renderer 层，减少 ReAct loop、降低 token 消耗，并让语音、文字、按钮、隐藏文字、reaction 等交互原语走稳定模板。
>
> **状态**：第一阶段已上线。`tg_msg type="render"` + Agent terminal 短路已合入；[listening-dictation](../src/skills/bundled/english/listening-dictation/SKILL.md) 和 [speaking-shadowing](../src/skills/bundled/english/speaking-shadowing/SKILL.md) 已迁移；旧 type 全部保留。生产日志确认听力出题 5→3 loop、反馈 3→2 loop。后续工作（adapter 合并、代码层 react、模板化、迁移其它 skill）见 §11。

## 1. 背景

英语练习 skill 通过 `tg_msg` 工具逐步发送 Telegram 消息。例如一次听力出题原本是：

1. LLM 调用 `persist recent_practice` / `coach_context` 读取上下文。
2. LLM 调用 `tts` 生成音频。
3. LLM 调用 `tg_msg type="voice"` 发送音频。
4. LLM 调用 `tg_msg type="keyboard"` 发送题面和按钮。
5. LLM 再跑一轮，返回 `tools=0`，Agent 才结束本 turn。

这个流程可用，但有两个问题：

- **LLM 在做消息编排**：先发语音、再发按钮、再结束，都是固定 UI 流程，不应该每次交给模型决策。
- **工具结果后需要空跑确认**：Agent 主循环在工具执行后总是回到 LLM，只有下一轮没有 tool call 才 return。因此最后一个 `tg_msg` 后通常还有一次空跑 loop。

迁移前的实测数据（旧链路）：

| 阶段 | loop | token |
| --- | ---: | ---: |
| 出题：读上下文、TTS、发 voice、发 keyboard、空跑结束 | 5 | 约 51k-60k |
| 答题：评分入库、发反馈、空跑结束 | 3 | 约 33k-37k |
| 合计 | 8 | 约 84k-97k |

目标不是先追求极限压 token，而是先把固定消息发送链路模板化，减少 loop 和降低出错率。

## 2. 当前 Telegram 能力

`tg_msg` 当前支持的所有 type（**旧 type 全部保留**，render 是新增项）：

| 类型 | 能力 | 当前适用场景 |
| --- | --- | --- |
| `text` | 发送普通文本 | 写作反馈、阅读说明、提示 |
| `voice` | 发送 OGG/Opus native voice bubble，可带 caption | 听力、跟读、口语示范 |
| `audio` | 发送音频文件，可带 caption | 长音频、播客类内容 |
| `document` | 发送文件，可带 caption | 导出资料 |
| `keyboard` | 文本 + inline keyboard | 题面、反馈、下一题按钮 |
| `quiz` | Telegram quiz poll | 客观选择题 |
| `edit` | 编辑已有消息，可更新按钮 | 单词卡 reveal、倒计时、分页 |
| `delete` | 删除消息 | 清理状态消息或隐藏内容 |
| `react` | 给消息加 reaction | 轻量正确 / 完成反馈（独立用已不推荐，见 §6.4） |
| `countdown` | 倒计时消息，内部定时 edit | 阅读 / skim 限时 |
| `paginate` | 长文本分页 + 按钮 | 阅读材料、长报告 |
| `render` | **新增**。一次工具调用串联 react + media + text + buttons，可标 `terminal` 终止 turn | 任何"voice+按钮"、"反馈+按钮"、"反馈+react+按钮"组合 |

Telegram API 允许 media 消息携带 caption 和 inline keyboard，理论上可以合并为单条 Telegram 消息：

| 组合 | TG API 可行 | 当前 render 实现 |
| --- | --- | --- |
| voice + caption | 可行 | 已支持（无 buttons 时） |
| voice + inline buttons | 可行 | **本期未实现**（renderer 拆成 voice + keyboard 两条 TG 消息） |
| voice + caption + inline buttons | 可行 | **本期未实现**（同上） |
| text + inline buttons | 可行 | 已支持（走 `sendKeyboard`） |
| 很长文本放进 voice caption | 受 1024 字符限制 | 通过"有 buttons 时不挂 caption"规避，前期无自动拆分 |
| reaction 和消息发送同一 API | 不可行（reaction 独立 API） | renderer 同一工具调用内顺序执行 |

合并为单条 TG 消息属于后续优化，见 §11。

## 3. 核心思路

`tg_msg type="render"`：LLM 只提交一份结构化消息描述，renderer 负责拆成具体 Telegram API 调用。

```text
LLM -> tg_msg type="render" 一次工具调用
        |
        v
parse envelope (||spoiler|| / react / media / text / buttons)
        |
        v
actions[] = react -> sendVoice/sendAudio/sendDocument -> sendKeyboard/sendMessage
        |
        v
adapter outboundQueue 串行执行（复用现有 sendXxx 方法，不改 adapter 签名）
        |
        v
return { ok: true, message_ids, sent_content: true, terminal: <as requested> }
```

这和现有 `paginate` 思想一致：LLM 给出抽象内容，adapter 负责客户端侧细节。**关键差异**：本期 render 内部完全复用旧 adapter 方法，不扩展 `sendVoice` 签名，不引入新底层 API；语音和按钮目前会落成 2 条 TG 消息，靠 PQueue 保证顺序。

## 4. 为什么不会乱序

`TelegramSessionAdapter` 已有统一队列：

```ts
private outboundQueue = new PQueue({ concurrency: 1 });
```

renderer 内部所有动作继续走 adapter 的 `enqueue` 路径，保证：

- 先 reaction 再消息，或先消息再 reaction，顺序可控。
- 先 voice 再 keyboard，顺序稳定。
- 多条拆分消息不会和其他发送动作交错。
- 倒计时 / edit 等异步动作仍由 adapter 层统一管理。

render envelope 不需要绕过现有队列，只是把多次 LLM 工具调用合并成一次工具调用。

## 5. 接口

结构化 JSON 工具参数，不引入 DSL。DSL 是 future enhancement（§11）。

### 5.1 `tg_msg type="render"` envelope

```json
{
  "type": "render",
  "react": {
    "target": "user",
    "emoji": "👍"
  },
  "media": {
    "type": "voice",
    "url": "/Users/bolt/.anya/data/audio/tts/tts_123.ogg"
  },
  "text": "来，听听这一句。把你听到的英文打出来。\n\n实在听不出：||The app needs an update.||",
  "buttons": [
    ["🐢 慢速播放|dict_slow", "😵 太难了|dict_easier"]
  ],
  "reply_to": "user",
  "tag": "dict_prompt",
  "terminal": true
}
```

字段含义：

| 字段 | 说明 |
| --- | --- |
| `react` | 可选。`{"target":"user"|tag|message_id,"emoji":"👍"}`。renderer 先发 reaction 再发主消息。reaction API 失败被吞掉，不影响后续发送 |
| `media` | 可选。`{"type":"voice"|"audio"|"document","url":"/path"}` |
| `text` | 主文本。支持 `||spoiler||` 简写（单行、内部不含 `\|`） |
| `buttons` | inline keyboard，沿用 `[["label|callback"]]` 格式 |
| `reply_to` | 可选。`"user"` 表示回复当前用户消息；也可填 tag 或 message_id |
| `tag` | 可选。记录消息 ID（绑定到 render 的第一条主消息），供后续 edit / reply |
| `terminal` | 可选，默认 `false`。为 `true` 时 Agent 在工具成功后直接结束本 turn |

工具结果：

```json
{
  "ok": true,
  "message_ids": [12345, 12346],
  "sent_content": true,
  "terminal": true
}
```

`message_ids` 反映实际发出的 TG 消息条数（当前 voice+buttons 场景是 2）。`terminal` 由调用方传入，原样回传给 Agent。

### 5.2 字段组合的渲染行为

| `react` | `media` | `text` | `buttons` | 实际 TG 消息 |
| :---: | :---: | :---: | :---: | --- |
| ✓ | — | — | — | 仅 reaction（API 调用，不算"消息"） |
| — | voice | — | — | 1 条 voice（无 caption） |
| — | voice | ✓ | — | 1 条 voice（text 作为 caption） |
| — | voice | ✓ | ✓ | **2 条**：voice（无 caption）+ keyboard（text + buttons） |
| — | — | ✓ | ✓ | 1 条 keyboard |
| — | — | ✓ | — | 1 条 text |
| ✓ | voice | ✓ | ✓ | reaction + 2 条主消息 |

规则简化：**有 buttons 时，text 一律走 `sendKeyboard`**，media 不挂 caption。这样不需要 caption 长度检测，逻辑稳定，代价是 voice/buttons 场景多一条 TG 消息（接受的 trade-off，§11 改进）。

## 6. 渲染规则

### 6.1 Spoiler

`||hidden text||` → `<tg-spoiler>hidden text</tg-spoiler>`。正则单行非贪婪、内部不含 `|`：

```ts
/\|\|([^\n|]+?)\|\|/g
```

保留现有 `<tg-spoiler>...</tg-spoiler>` 写法（不会被二次替换）。

### 6.2 Media + Text + Buttons

实际实现（本期）：

- `buttons` 存在 → media 不挂 caption；media 先发，text+buttons 走 `sendKeyboard`。
- `buttons` 不存在但有 `text` → text 作为 media 的 caption（一条消息）。
- 无 `media`、有 `buttons` → 走 `sendKeyboard(text, buttons)`。
- 无 `media`、无 `buttons` → 走 `sendMessage(text)`。

注：caption 长度兜底（>1024 字符自动拆分为 media + text）属于后续工作（§11）。

### 6.3 Reaction

`react` 是独立 Telegram API，但**不应成为独立 LLM tool call**。

约定：

- 反馈类消息：在 envelope 内带 `react`（先发 reaction 再发反馈）。
- 出题类消息：一般不 react。
- 全对、通过、完成等场景由 skill 文档约定 emoji 表（示例：accuracy = 1.0 → 🔥；≥ PASS → 👍；< PASS 省略 react）。
- 旧的 `tg_msg type="react"` 调用保留可用，但已迁移 skill 文档明令禁止把它用于反馈链路（会多一个 LLM loop）。

### 6.4 Terminal

`terminal=true` 且 `sent_content=true` 时，工具返回：

```json
{ "ok": true, "sent_content": true, "terminal": true, "message_ids": [...] }
```

Agent 主循环看到 `terminal=true` 后**先把 assistant + tool message 写入 history**，再 `saveMessages`，然后直接 return —— 不再请求下一次 LLM 来确认 `tools=0`。

注意：不能简单地"遇到 tg_msg 就停"。有些合法流程需要同一轮内连续执行多个工具，例如：

```text
tts -> tg_msg voice -> tg_msg keyboard
```

因此**只在工具结果明确带 `terminal: true` 时短路**，不按工具名硬停。terminal 默认 `false`，必须 skill 显式声明。

## 7. 对现有练习链路的影响（迁移后实测）

### 7.1 听力出题

旧：

| loop | 动作 |
| ---: | --- |
| 0 | `persist recent_practice` / `coach_context` |
| 1 | `tts` |
| 2 | `tg_msg voice` |
| 3 | `tg_msg keyboard` |
| 4 | 空跑结束 |

新（已上线，session `c64baef0` 实测）：

| loop | 动作 |
| ---: | --- |
| 0 | `persist recent_practice` / `coach_context` |
| 1 | `tts` |
| 2 | `tg_msg render`：voice + text + buttons + `terminal:true` → 终止 |

5 loop → **3 loop**，达成预期。

### 7.2 听力反馈

旧：

| loop | 动作 |
| ---: | --- |
| 0 | `persist practice` |
| 1 | `tg_msg keyboard` |
| 2 | 空跑结束 |

新（实测）：

| loop | 动作 |
| ---: | --- |
| 0 | `persist practice` |
| 1 | `tg_msg render`：`react`（🔥/👍）+ 反馈 + buttons + `terminal:true` → 终止 |

3 loop → **2 loop**，达成预期。

### 7.3 Speaking 出题

旧：5 loop。新（已写入 SKILL.md，待运行验证）：

| loop | 动作 |
| ---: | --- |
| 0 | 读 recent / context |
| 1 | `tts` 示例句 |
| 2 | `tg_msg render`：voice + 指令 + 按钮 + `terminal:true` |

预期 5 → 3 loop。

### 7.4 Speaking 通过反馈（pass）

旧：4 loop。新：

| loop | 动作 |
| ---: | --- |
| 0 | `pron_assess` |
| 1 | `persist practice` |
| 2 | `tg_msg render`：`react`（🔥/👍）+ 反馈 + buttons + `terminal:true` |

预期 4 → 3 loop。

### 7.5 Speaking 纠音失败 / 再练 coaching

旧：6 loop（`pron_assess` → `tts` 纠音 → `persist` → `voice` → `text` → 空跑）。新：

| loop | 动作 |
| ---: | --- |
| 0 | `pron_assess` |
| 1 | `tts` 纠音示范（slow rate） |
| 2 | `persist practice` |
| 3 | `tg_msg render`：coaching voice + 反馈/纠音 text + `terminal:true`（无 buttons，强制再练） |

预期 6 → 4 loop。注：当前 render 在"voice + text"场景仍是 1 条工具调用对应 2 条 TG 消息（voice + 文本），LLM 视角已经压平。

## 8. 实施计划与状态

### Phase 1：新增 `tg_msg type="render"`（工具层）— ✅ 已完成

- 在 [tools/telegram.ts](../src/tools/telegram.ts) 新增 `case 'render'` 分支；所有旧 case 完整保留。
- 支持 `react`, `media`, `text`, `buttons`, `terminal`, `reply_to`, `tag`。
- `applySpoiler` helper 处理 `||spoiler||` → `<tg-spoiler>`。
- 工具结果带 `message_ids` 和 `terminal`。
- 工具 schema description 同步更新。

### Phase 2：Agent 支持 terminal tool — ✅ 已完成

- [Agent.run](../src/agent/Agent.ts) 解析 `tg_msg` 工具结果，提取 `parsed.terminal`。
- 命中 terminal 时：先 push assistant + tool message → `degradeForStorage` → `saveMessages` → return。
- 严格按显式 `terminal: true` 短路，不按工具名硬停。
- 保留 `tgSent` / `max_react_loops` / 非 terminal 旧行为，向后兼容。

### Phase 3：迁移高频 skill — ✅ 第一批已完成

已迁移：

1. [listening-dictation](../src/skills/bundled/english/listening-dictation/SKILL.md) — State A 出题、State B `dict_slow`、State C 反馈全部改 render；Hard Rule 5/7 改写。
2. [speaking-shadowing](../src/skills/bundled/english/speaking-shadowing/SKILL.md) — State A 出题、State B `speak_slow`/`speak_hard`、State C（pass 与 fail 两条路径）、State F retry 全部改 render；Hard Rule 3/9/10 改写。

未迁移（继续走旧 type，本期不动）：vocab-review、vocab-topic、reading-skim-drill、listening-shadowing、speaking-roleplay 等其它 skill。

**Phase 3 暂未做 adapter 扩展**（即"voice + buttons 合并成单条 TG 消息"），按用户决策走渐进路线。

### 实测验证

生产日志 session `c64baef0`（迁移后）：

- 听力出题：3 loop ✅
- 听力反馈：2 loop（含 `react: 🔥`，envelope 内嵌）✅
- 单题听力（出题 + 反馈）：5 loop（基线 8）✅
- terminal 短路生效：render tool_result 后无下一轮 LLM
- `||...||` spoiler 简写：LLM 已主动使用
- envelope 内 react：未观察到任何独立 `tg_msg type="react"` 调用

## 9. 模板化方向（未实现）

render envelope 是基础能力。下一步可以把高频消息做成模板，进一步减少 skill 文案和模型编排：

| 模板 | 输入字段 | 输出 |
| --- | --- | --- |
| `dictation_prompt` | `audio_path`, `sentence`, `buttons`, `tag` | voice/caption/buttons |
| `dictation_feedback` | `accuracy`, `prompt`, `response`, `errors`, `buttons` | reaction + feedback keyboard |
| `shadowing_prompt` | `audio_path`, `sentence`, `buttons` | voice/caption/buttons |
| `shadowing_feedback_pass` | scores, sentence, translation, buttons | reaction + feedback |
| `shadowing_feedback_retry` | scores, weak_word, coaching_audio, coaching_text | coaching voice + text |
| `vocab_card` | word, ipa, meaning, audio, buttons | voice + card + buttons |
| `reading_page` | title, pages, buttons | paginate |

长期理想结构：

```text
LLM: 生成语义字段 / 评分 / 错误诊断
Renderer: 按模板生成 Telegram 消息
Adapter: 处理 Telegram API 限制、队列、拆分、fallback
Agent: terminal render 后直接结束 turn
```

## 10. 风险与边界（实施记录）

| 风险 | 实际处理 |
| --- | --- |
| 一个 render 在 voice+buttons 场景下产生 2 条 TG 消息，UX 不如单条紧凑 | 接受为本期 trade-off。loop 收益是主要目标。后续做 adapter 扩展时再合并为单条 |
| caption 超长（>1024）但又没 buttons 会被 TG 拒绝 | render 内 caption 只在"无 buttons"时挂 media 上；超长场景由 skill 控制（短则挂 caption，长则不带 media 走纯 text），前期无自动拆分 |
| terminal 误停导致后续工具被丢 | 只在 `tg_msg` 工具结果显式带 `terminal: true` 时短路；其它工具结果完全不参与短路判断 |
| Spoiler `\|\|...\|\|` 与 markdown 表格 `\|` 冲突 | 正则 `/\|\|([^\n|]+?)\|\|/g` 限定单行内、内部不含 `\|` |
| history 缺消息导致下一轮 LLM 看到孤立 tool_call | terminal 短路前必须 push 完 assistant + toolMsg 再 `saveMessages`（已实现） |
| reaction API 失败 | render case 内对 `tg.react` 包 try/catch，吞掉异常，不影响主消息发送 |
| 旧 skill 受影响 | 全部旧 type 完整保留，未迁移 skill 行为零变化 |

## 11. 后续计划（按优先级）

### 11.1 第二批 skill 迁移（中优先级）

按"调用频率 × 复杂度"排序的候选：

1. **vocab-review** —— SRS 每卡都跑，调用最频繁；流程固定，迁移成本低。需同时验证 `tg_msg type="edit"`（reveal）与 render 的协同。
2. **listening-shadowing** —— 与 listening-dictation 同构（voice + buttons），迁移模板可直接复用。
3. **vocab-topic** / **reading-skim-drill** —— 涉及 `countdown` + 后续 keyboard，需先决定是把 countdown 纳入 render 还是保持独立。
4. **speaking-roleplay** / **speaking-freetalk** —— voice + react 组合，迁移逻辑直接。

### 11.2 Adapter 扩展：voice + caption + buttons 合一（高优先级，UX 提升）

目标：让 voice 消息能同时挂 caption 和 inline keyboard，render 在该场景下从 2 条 TG 消息降为 1 条。

实现要点：

- `SendMessageOptions` 增加 `buttons?: string[][]` 字段。
- `sendVoice` / `sendAudio` / `sendDocument` 内部：若 `opts.buttons` 存在，复用现有 `string[][]` → grammy `InlineKeyboard` 的逻辑（从 `sendKeyboard` 抽出 `buildInlineKeyboard(buttons)` 私有方法），传给 `reply_markup`。
- caption 长度兜底：常量 `MAX_MEDIA_CAPTION = 1024`，封装 `sendMediaWithCaption(type, url, caption, buttons, opts)` 给三个 media 方法共用；超长则降级为先发不带 caption 的 media，再 `sendKeyboard(text, buttons)`。
- 全部仍走 `enqueue()`，保证 PQueue 串行。
- render case 改为优先调用扩展后的 `sendVoice(url, caption, { buttons })` —— skill 文档无需改动。

### 11.3 高频消息模板化（中优先级）

按 §9 的模板表，把 `dictation_prompt` / `dictation_feedback` / `shadowing_prompt` 等做成新工具或 render 的 `template` 字段。LLM 只传语义字段（accuracy / sentence / errors），renderer 拼好整段 text、buttons、react。优势：

- skill 文案进一步缩短（不再写 `tg_msg render {...}` JSON 草稿）。
- 反馈风格统一，便于 A/B 测试和品牌一致性。
- 翻译错误键 → 中文（学习者可读）的逻辑收敛到一处。

### 11.4 countdown / paginate 纳入 render（低优先级）

目前 `countdown` 和 `paginate` 是独立 type。后续可以让 render 支持 `countdown: { seconds, expire_text }` 和 `pages: [...]` 字段，进一步统一接口。迁移 reading-skim-drill / vocab-topic 时一起做。

### 11.5 DSL 简写（低优先级，按需）

§5.1 的 JSON 已经够用。若 skill 作者反馈"写 JSON 太冗长"，可以加 Hermes 风格 DSL 解析层：

```text
[REACT user 👍]
[MEDIA voice "/abs/path.ogg"]
[TEXT]
…
[BUTTONS]
🐢 慢速播放 | dict_slow
[TERMINAL]
```

实现上 DSL 只是 parser，最终归一化为同一份 envelope，便于校验和工具 schema 暴露。

## 12. 预期收益与实测

| 场景 | 基线 loop | 目标 loop | 实测 loop |
| --- | ---: | ---: | ---: |
| 听力出题 | 5 | 3 | **3** ✅ |
| 听力反馈 | 3 | 2 | **2** ✅ |
| 单题听力（合计） | 8 | 5 | **5** ✅ |
| speaking 出题 | 5 | 3 | 待验证 |
| speaking pass feedback | 4 | 2–3 | 待验证 |
| speaking retry feedback | 6 | 4 | 待验证 |

token 也会下降，但更重要的是延迟下降和行为稳定：

- 减少空跑确认（每个 turn 省 ~1 个 LLM 调用，约 2–7 秒）。
- 减少 LLM 决定消息顺序（无需 prompt 反复约束"先 voice 再 keyboard"）。
- 降低 `voice` / `keyboard` 拆分导致的 prompt 复杂度。
- reaction 不再为一个点赞单独消耗 LLM loop。

## 13. 结论

Telegram 消息发送已经成为 anya 的领域 adapter 能力，而不再是每个 skill 用自然语言反复约束 LLM。

本期已落地：

1. ✅ `tg_msg type="render"`
2. ✅ `terminal=true` 去掉最后空跑
3. ✅ reaction 并入 render envelope（高频反馈链路）
4. ✅ `||spoiler||` 简写
5. ✅ listening-dictation / speaking-shadowing 迁移
6. ✅ 听力单题从 8 loop 压到 5 loop

下一步重点（§11）：

1. adapter 扩展（voice+caption+buttons 合并为单条 TG 消息，UX 改善）
2. 迁移 vocab-review、listening-shadowing 等高频 skill
3. 高频消息模板化

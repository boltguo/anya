# Telegram Render Envelope 设计方案

> 目的：把 Telegram 消息编排从 LLM 的多轮工具调用下沉到 adapter / renderer 层，减少 ReAct loop、降低 token 消耗，并让语音、文字、按钮、隐藏文字、reaction 等交互原语走稳定模板。

## 1. 背景

当前英语练习 skill 通过 `tg_msg` 工具逐步发送 Telegram 消息。例如一次听力出题通常是：

1. LLM 调用 `persist recent_practice` / `coach_context` 读取上下文。
2. LLM 调用 `tts` 生成音频。
3. LLM 调用 `tg_msg type="voice"` 发送音频。
4. LLM 调用 `tg_msg type="keyboard"` 发送题面和按钮。
5. LLM 再跑一轮，返回 `tools=0`，Agent 才结束本 turn。

这个流程可用，但有两个问题：

- **LLM 在做消息编排**：先发语音、再发按钮、再结束，都是固定 UI 流程，不应该每次交给模型决策。
- **工具结果后需要空跑确认**：当前 Agent 主循环在工具执行后总是回到 LLM，只有下一轮没有 tool call 才 return。因此最后一个 `tg_msg` 后通常还有一次空跑 loop。

最新日志里的正常听力题大致是：

| 阶段 | 当前 loop | token |
| --- | ---: | ---: |
| 出题：读上下文、TTS、发 voice、发 keyboard、空跑结束 | 5 | 约 51k-60k |
| 答题：评分入库、发反馈、空跑结束 | 3 | 约 33k-37k |
| 合计 | 8 | 约 84k-97k |

目标不是先追求极限压 token，而是先把固定消息发送链路模板化，减少 loop 和降低出错率。

## 2. 当前 Telegram 能力

当前 `tg_msg` 支持以下类型：

| 类型 | 能力 | 当前适用场景 |
| --- | --- | --- |
| `text` | 发送普通文本 | 写作反馈、阅读说明、提示 |
| `voice` | 发送 OGG/Opus native voice bubble，可带 caption | 听力、跟读、口语示范 |
| `audio` | 发送音频文件，可带 caption | 长音频、播客类内容 |
| `document` | 发送文件，可带 caption | 导出资料 |
| `keyboard` | 文本 + inline keyboard | 题面、反馈、下一题按钮 |
| `quiz` | Telegram quiz poll | 客观选择题，当前很多 skill 暂时禁用 |
| `edit` | 编辑已有消息，可更新按钮 | 单词卡 reveal、倒计时、分页 |
| `delete` | 删除消息 | 清理状态消息或隐藏内容 |
| `react` | 给消息加 reaction | 轻量正确 / 完成反馈 |
| `action` | typing / record_voice 等 chat action | 状态提示 |
| `countdown` | 倒计时消息，内部定时 edit | 阅读 / skim 限时 |
| `paginate` | 长文本分页 + 按钮 | 阅读材料、长报告 |

Telegram API 本身允许 media 消息携带 caption 和 inline keyboard。因此这些可以合并为单条 Telegram 消息：

| 组合 | 是否可行 |
| --- | --- |
| voice + caption | 可行 |
| voice + inline buttons | 可行 |
| voice + caption + inline buttons | 可行 |
| audio + caption + inline buttons | 可行 |
| document + caption + inline buttons | 可行 |
| text + inline buttons | 可行 |
| 多个 voice 文件在一条消息里 | 不适合，通常应拆成多条 |
| 很长文本放进 voice caption | 受 Telegram caption 长度限制，需自动拆分 |
| reaction 和消息发送同一 API | 不可行，reaction 是独立 API，但可由 renderer 同一工具调用内部顺序执行 |

## 3. 核心思路

新增一个 render envelope：LLM 只提交一份结构化消息描述，renderer 负责拆成具体 Telegram API 调用。

```text
LLM -> tg_msg type="render" 一次工具调用
        |
        v
parse / normalize envelope
        |
        v
actions[] = react / sendVoice / sendKeyboard / edit / ...
        |
        v
adapter outboundQueue 串行执行
        |
        v
return { ok: true, sent_content: true, terminal: true }
```

这和现有 `paginate` 的思想一致：LLM 给出抽象内容，adapter 负责客户端侧细节。

## 4. 为什么不会乱序

`TelegramSessionAdapter` 已经有统一队列：

```ts
private outboundQueue = new PQueue({ concurrency: 1 });
```

只要 renderer 内部所有动作继续走 adapter 的 `enqueue` 路径，就能保证：

- 先 reaction 再消息，或先消息再 reaction，顺序可控。
- 先 voice 再 keyboard，顺序稳定。
- 多条拆分消息不会和其他发送动作交错。
- 倒计时 / edit 等异步动作仍由 adapter 层统一管理。

因此 render envelope 不需要绕过现有队列，只是把多次 LLM 工具调用合并成一次工具调用。

## 5. 推荐接口

优先实现结构化 JSON，不建议先做完全自由的 `[MEDIA]` 文本 DSL。DSL 可以作为语法糖，但内部应归一化为 JSON envelope。

### 5.1 `tg_msg type="render"`

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
| `react` | 可选。发送 reaction，不应让 LLM 为点赞单独跑一个工具调用 |
| `media` | 可选。`voice` / `audio` / `document` |
| `text` | 主文本。支持 `||spoiler||` 简写 |
| `buttons` | inline keyboard，沿用当前 `label|callback` 格式 |
| `reply_to` | 可选。`user` 表示回复当前用户消息 |
| `tag` | 可选。记录消息 ID，供后续 edit / reply |
| `terminal` | 可选。为 true 时，Agent 在工具成功后直接结束本 turn |

### 5.2 DSL 语法糖

如果希望 skill 文案更接近 Hermes 的写法，可以额外支持一个 `template` 字段：

```text
[REACT user 👍]
[MEDIA voice "/Users/bolt/.anya/data/audio/tts/tts_123.ogg"]
[TEXT]
来，听听这一句。把你听到的英文打出来。

实在听不出：||The app needs an update.||
[BUTTONS]
🐢 慢速播放 | dict_slow
😵 太难了 | dict_easier
[TERMINAL]
```

但实现上建议先把它 parse 成同一个 render envelope，再执行。

原因：

- callback data 里可能包含特殊字符。
- 文件路径、文本、按钮都容易出现分隔符冲突。
- JSON schema 更适合工具参数校验。

## 6. 渲染规则

### 6.1 Spoiler

支持：

```text
||hidden text||
```

转换为：

```html
<tg-spoiler>hidden text</tg-spoiler>
```

同时保留现有 `<tg-spoiler>...</tg-spoiler>` 写法。

### 6.2 Media + Text + Buttons

优先尝试发成单条 media 消息：

```text
sendVoice(url, caption=text, reply_markup=buttons)
```

如果 caption 超限或格式不适合：

1. 先发 media。
2. 再发 `sendKeyboard(text, buttons)`。

这个拆分由 renderer 决定，不需要 LLM 再发一次 `tg_msg`。

### 6.3 Text + Buttons

无 media 时：

```text
sendKeyboard(text, buttons)
```

如果没有 buttons：

```text
sendMessage(text)
```

### 6.4 Reaction

`react` 是独立 Telegram API，但不应成为独立 LLM tool call。

建议在 renderer 内部处理：

- 反馈类消息：先 react 用户消息，再发反馈。
- 出题类消息：一般不 react。
- 全对、通过、完成等固定场景可以由模板或代码层自动决定 reaction。

例如：

```text
if accuracy === 1:
  react(user, "🔥")
else if accuracy >= 0.8:
  react(user, "👍")
```

### 6.5 Terminal

当 envelope 标记 `terminal=true` 且发送成功时，工具返回：

```json
{
  "ok": true,
  "sent_content": true,
  "terminal": true
}
```

Agent 主循环看到 `terminal=true` 后直接保存消息并 return，不再请求下一次 LLM 来确认 `tools=0`。

注意：不能简单地“遇到 tg_msg 就停”。有些合法流程需要同一轮内连续执行多个工具，例如：

```text
tts -> tg_msg voice -> tg_msg keyboard
```

因此应由工具结果或参数明确表示 terminal，而不是按工具名硬停。

## 7. 对现有练习链路的影响

### 7.1 听力出题

当前：

| loop | 动作 |
| ---: | --- |
| 0 | `persist recent_practice` / `coach_context` |
| 1 | `tts` |
| 2 | `tg_msg voice` |
| 3 | `tg_msg keyboard` |
| 4 | 空跑结束 |

引入 `render terminal` 后：

| loop | 动作 |
| ---: | --- |
| 0 | `persist recent_practice` / `coach_context` |
| 1 | `tts` |
| 2 | `tg_msg render`：voice + caption + buttons，terminal 结束 |

预期：出题阶段从 5 loop 降到 3 loop。

### 7.2 听力反馈

当前：

| loop | 动作 |
| ---: | --- |
| 0 | 评分并 `persist practice` |
| 1 | `tg_msg keyboard` |
| 2 | 空跑结束 |

优化后：

| loop | 动作 |
| ---: | --- |
| 0 | 评分并 `persist practice` |
| 1 | `tg_msg render`：reaction + feedback + buttons，terminal 结束 |

预期：反馈阶段从 3 loop 降到 2 loop。

### 7.3 Speaking 出题

当前：

| loop | 动作 |
| ---: | --- |
| 0 | 读 recent/context |
| 1 | `tts` 示例句 |
| 2 | `tg_msg voice` |
| 3 | `tg_msg keyboard` |
| 4 | 空跑结束 |

优化后同听力：可降到 3 loop。

### 7.4 Speaking 纠音失败

当前可能是：

| loop | 动作 |
| ---: | --- |
| 0 | `pron_assess` |
| 1 | `tts` 纠音示范 |
| 2 | `persist practice` |
| 3 | `tg_msg voice` |
| 4 | `tg_msg text` |
| 5 | 空跑结束 |

优化后：

| loop | 动作 |
| ---: | --- |
| 0 | `pron_assess` |
| 1 | `tts` 纠音示范 |
| 2 | `persist practice` |
| 3 | `tg_msg render`：纠音 voice + caption/text + terminal |

如果 caption 可承载说明，可从 6 loop 降到 4 loop。若说明太长，renderer 内部拆成 voice + text，两条 Telegram API，但仍只有一次 LLM 工具调用。

## 8. 模板化方向

render envelope 是基础能力。下一步可以把高频消息做成模板，进一步减少 skill 文案和模型编排。

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

## 9. 和 Hermes 风格的关系

Hermes 风格的 `[MEDIA]`、`[REACT]`、`||word||` 有两个优点：

- LLM 输出短，表达直观。
- 把消息编排交给 runtime，而不是让模型逐个调用发送工具。

aouo 可以吸收这个思路，但不必完全照搬自由文本协议。

推荐策略：

1. 工具参数层使用结构化 JSON，稳定可校验。
2. 对 skill 作者可选提供 DSL 简写。
3. DSL 只是一层 parse sugar，最终归一化为 render envelope。

## 10. 实施计划

### Phase 1：扩展 adapter 能力

- 给 `SendMessageOptions` 增加 `buttons?: string[][]`。
- 给 `sendVoice` / `sendAudio` / `sendDocument` 支持 inline keyboard。
- 确保 media + caption + buttons 走同一个 `outboundQueue`。
- 增加 caption 长度检测，超限时 fallback 为 media + text/keyboard。

### Phase 2：新增 `tg_msg type="render"`

- 在 `tools/telegram.ts` 新增 `render` 分支。
- 支持 `react`, `media`, `text`, `buttons`, `terminal`, `reply_to`, `tag`。
- 支持 `||spoiler||` 转换。
- 返回 `terminal` 字段。

### Phase 3：Agent 支持 terminal tool

- 在 `Agent.run` 执行工具后解析工具结果。
- 若最后一个工具结果 `{ terminal: true, sent_content: true }`：
  - 将 assistant tool call 和 tool result 写入 history。
  - 保存 messages。
  - 直接 return。
- 保留非 terminal 旧行为，避免破坏现有技能。

### Phase 4：迁移高频 skill

优先迁移：

1. `listening-dictation` 出题。
2. `listening-dictation` 反馈。
3. `speaking-shadowing` 出题。
4. `speaking-shadowing` pass / retry feedback。

迁移后用日志确认：

- `tg_new_menu` / `tg_nav` 仍然 0 LLM。
- 听力出题阶段从 5 loop 降到 3 loop。
- 听力反馈阶段从 3 loop 降到 2 loop。
- speaking 出题阶段从 5 loop 降到 3 loop。

## 11. 风险与边界

| 风险 | 处理 |
| --- | --- |
| caption 超长 | renderer 自动拆分 |
| media + buttons 某些客户端显示差异 | 保留 fallback：media + keyboard 两条 |
| terminal 误停，漏掉后续工具 | 只在显式 `terminal=true` 时短路 |
| DSL 解析冲突 | 优先 JSON；DSL 仅作为可选输入 |
| reaction API 失败 | 不影响主消息发送，记录 warning 即可 |
| history 丢失发给用户的文本 | render 工具结果需返回 sent preview，或像当前 `tg_msg` 一样保存 sent text 摘要 |

## 12. 预期收益

按最近日志估算：

| 场景 | 当前 | 优化后目标 |
| --- | ---: | ---: |
| 听力出题 | 5 loop | 3 loop |
| 听力反馈 | 3 loop | 2 loop |
| 正常听力一题 | 8 loop | 5 loop |
| speaking 出题 | 5 loop | 3 loop |
| speaking pass feedback | 4 loop 左右 | 2-3 loop |
| speaking retry feedback | 6 loop 左右 | 4 loop |

token 也会下降，但更重要的是延迟下降和行为稳定：

- 减少空跑确认。
- 减少 LLM 决定消息顺序。
- 降低 `voice` / `keyboard` 拆分导致的 prompt 复杂度。
- reaction 不再为一个点赞单独消耗 LLM loop。

## 13. 结论

Telegram 消息发送应该成为 aouo 的领域 adapter 能力，而不是每个 skill 用自然语言反复约束 LLM。

短期最值得做的是：

1. `tg_msg type="render"`。
2. media + caption + buttons 合并发送。
3. `terminal=true` 去掉最后空跑。
4. reaction 并入 render envelope，由代码层调用 API。

这能把听力单题从当前约 8 loop 压到约 5 loop，同时保持 Telegram 消息顺序稳定、模板可复用、skill 文案更短。

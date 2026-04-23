# Telegram 消息链路完整分析

> 本文档覆盖 Anya Telegram Bot 从消息接收到回复发送的完整生命周期。

---

## 1. 总体架构

```mermaid
graph TD
    TG["Telegram Server"] -->|long-polling| BOT["grammy Bot"]
    BOT --> TA["TelegramAdapter<br/>(Singleton)"]
    TA -->|per-request| TSA["TelegramSessionAdapter"]
    TSA --> AGENT["Agent.run()"]
    AGENT --> PROVIDER["OpenAI Codex"]
    AGENT --> TOOLS["Tool Registry"]
    TOOLS -->|tg tool| TSA
    TSA -->|outbound queue| TG

    style TA fill:#f9f,stroke:#333
    style TSA fill:#bbf,stroke:#333
```

**两层 Adapter 设计**：

| 层 | 类 | 生命周期 | 职责 |
|---|---|---------|------|
| Singleton | `TelegramAdapter` | 进程生命周期 | Bot 实例、命令注册、消息路由、共享状态 |
| Per-request | `TelegramSessionAdapter` | 单次用户消息 | Adapter 接口实现、出站队列、状态窗口 |

---

## 2. 启动流程

```mermaid
sequenceDiagram
    participant CLI as anya gateway start
    participant GW as gateway.ts
    participant TA as TelegramAdapter
    participant Bot as grammy Bot
    participant TG as Telegram API

    CLI->>GW: runGatewayStart(foreground?)
    GW->>GW: isServiceRunning()?
    alt 后台模式
        GW->>GW: spawn detached child<br/>→ gateway.log
        GW->>GW: process.exit(0)
    else 前台模式
        GW->>GW: writePid("gateway")
        GW->>TA: new TelegramAdapter(config)
        TA->>Bot: new Bot(bot_token)
        GW->>TA: start()
        TA->>TA: registerAllTools()
        TA->>TA: loadSkills()
        TA->>Bot: setMyCommands([/new, /kill, ...skills])
        TA->>Bot: 注册 handlers
        TA->>Bot: bot.start()
        Bot->>TG: getUpdates (long-polling)
        TG-->>Bot: Updates stream
    end
```

**Handler 注册顺序**（优先级从高到低）：
1. `/start` — 欢迎消息
2. `/new` — 创建新会话
3. `/kill` — 强制停止 + 清空
4. 动态 skill commands（如 `/init`, `/practice`）
5. `message:text` — 文本消息
6. `message:voice` — 语音消息
7. `message:photo` — 图片消息
8. `callback_query:data` — 按钮回调

---

## 3. 文本消息处理流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant TG as Telegram
    participant Bot as grammy Bot
    participant TA as TelegramAdapter
    participant TSA as SessionAdapter
    participant Agent as Agent.run()
    participant LLM as OpenAI Codex
    participant Tools as Tool Registry
    participant DB as SQLite

    User->>TG: 发送文本
    TG->>Bot: message:text event
    Bot->>TA: handler(ctx)

    Note over TA: 1. 审批拦截检查
    TA->>TA: tryResolveApproval(text)?
    alt 是审批回复 (✅/❌/🔓)
        TA->>TA: resolve pending approval
        TA-->>User: (无回复)
    else 正常消息
        Note over TA: 2. 入队串行处理
        TA->>TA: enqueuePerChat(chatId, task)

        Note over TA: 3. 鉴权
        TA->>TA: check allowed_user_ids
        alt 未授权
            TA-->>User: ⛔ Unauthorized
        else 已授权
            Note over TA: 4. 创建会话 Adapter
            TA->>TSA: new SessionAdapter(ctx, bot, ...)
            TA->>Agent: new Agent(config, adapter)

            Note over TSA: 5. 发送"思考中"状态
            TSA->>TG: reply("🤔 Thinking...")
            Note over TSA: statusMessageId = msg.id

            Note over TA: 6. 启动 typing 指示器
            TA->>TG: sendChatAction("typing")<br/>每 4 秒重复

            Note over Agent: 7. ReAct 循环
            Agent->>DB: getOrCreateSession("tg:chatId")
            Agent->>DB: loadMessages(sessionId)
            Agent->>Agent: truncateHistory + sanitizeHistory
            Agent->>Agent: buildSystemPrompt(config)
            Agent->>Agent: timestampedInput

            loop ReAct Loop (max 20)
                Agent->>LLM: chat(messages, toolSchemas)
                LLM-->>Agent: response

                alt Tool Calls
                    Agent->>TSA: showToolCall(name, args)
                    TSA->>TG: editMessage(statusId, "⏳ Reading file...")
                    Agent->>Tools: dispatch(toolName, args)
                    Tools-->>Agent: result
                    Agent->>TSA: showToolResult(name, result)
                    TSA->>TG: editMessage(statusId, "🤔 Thinking...")
                    Note over Agent: 继续循环
                else Text Response
                    Agent->>DB: saveMessages(newMessages)
                    Agent-->>TA: RunResult{content, tgSent}
                end
            end

            Note over TA: 8. 发送最终回复
            alt tgSent == false && content
                TA->>TSA: reply(content)
                TSA->>TSA: splitMarkdownForTelegram(4000)
                TSA->>TSA: markdownToTelegramHtml(segment)
                TSA->>TG: sendMessage(html, parse_mode: HTML)
                Note over TSA: fallback: stripMarkdown → plain text
            end

            Note over TA: 9. 清理
            TSA->>TG: deleteMessage(statusMessageId)
            TA->>TA: clearInterval(typingIndicator)
        end
    end
```

---

## 4. 语音消息处理流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant TG as Telegram
    participant TA as TelegramAdapter
    participant Groq as Groq Whisper
    participant Agent as Agent.run()

    User->>TG: 发送语音消息
    TG->>TA: message:voice event

    Note over TA: 1. 下载语音文件
    TA->>TG: getFile() → file_path
    TA->>TG: fetch(file URL)
    TA->>TA: 写入 ~/.anya/data/audio/voice/voice_xxx.ogg

    Note over TA: 2. 语音转文字
    TA->>Groq: transcribeAudio(audioPath, config)
    Groq-->>TA: {transcript, success}

    alt 转写失败
        TA-->>User: 🎤 Could not recognize speech
    else 转写成功
        Note over TA: 3. 构造 Agent 输入
        TA->>TA: input = "[Voice message | audio_path: xxx]\n\"transcript\""
        TA->>TA: trackStt(duration)
        TA->>TA: enqueuePerChat → handleIncoming(ctx, input)
        TA->>Agent: 同文本消息流程
    end
```

**关键设计**：输入中嵌入 `audio_path`，使下游 `pron_assess` 工具可以直接引用原始音频文件。

---

## 5. 图片消息处理流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant TG as Telegram
    participant TA as TelegramAdapter
    participant Gemini as Gemini Vision
    participant Agent as Agent.run()

    User->>TG: 发送图片 (可带 caption)
    TG->>TA: message:photo event

    Note over TA: 1. 下载最高分辨率图片
    TA->>TG: getFile(photo[-1].file_id)
    TA->>TG: fetch(file URL)
    TA->>TA: 写入 ~/.anya/data/images/received/photo_xxx.jpg

    Note over TA: 2. Gemini Vision 分析
    TA->>Gemini: analyzeImage(imagePath, config, caption)
    Gemini-->>TA: {description, success}

    alt 分析失败
        TA-->>User: 🖼️ Could not analyze image
    else 分析成功
        Note over TA: 3. 构造 Agent 输入
        TA->>TA: input = "[User sent photo + caption]\n[Vision: description]"
        TA->>TA: enqueuePerChat → handleIncoming(ctx, input)
        TA->>Agent: 同文本消息流程
    end
```

**注意**：图片不会被删除（保留审计记录），与语音文件处理不同。

---

## 6. Callback Query 处理流程

```mermaid
flowchart TD
    CB["callback_query:data"] --> ACK["answerCallbackQuery()"]
    ACK --> CHECK{data 类型?}

    CHECK -->|"choice_*"| CHOICE["解析 choice ID"]
    CHOICE --> RESOLVE_C["resolve pendingChoice"]
    RESOLVE_C --> EDIT_C["editMessageText + selectedText"]

    CHECK -->|"nav:*"| NAV["客户端页面导航"]
    NAV --> MENU_PAGE["getNavPage(data)"]
    MENU_PAGE --> EDIT_NAV["editMessageText + keyboard"]

    CHECK -->|"menu"| MAIN["getMainMenu()"]
    MAIN --> EDIT_MENU["editMessageText + main keyboard"]

    CHECK -->|其他| GENERIC["通用回调"]
    GENERIC --> AUTH{"鉴权检查"}
    AUTH -->|未授权| IGNORE["忽略"]
    AUTH -->|已授权| LABEL["提取按钮文字"]
    LABEL --> MARK["editMessage: 原文 + → 选项"]
    MARK --> ENQUEUE["enqueuePerChat"]
    ENQUEUE --> AGENT["Agent.run('[callback] data')"]

    style NAV fill:#afa,stroke:#333
    style GENERIC fill:#ffa,stroke:#333
```

**三种回调类型**：

| 前缀 | 处理方式 | 是否触发 Agent |
|------|---------|--------------|
| `choice_*` | 解析 pendingChoice promise | ❌ |
| `nav:*` | 客户端翻页（skillMenu.ts） | ❌ |
| 其他 | 作为 `[callback] data` 送入 Agent | ✅ |

---

## 7. 出站消息队列

```mermaid
flowchart LR
    subgraph SessionAdapter
        Q["PQueue<br/>concurrency: 1"]
        Q --> S1["sendMessage"]
        Q --> S2["sendPhoto"]
        Q --> S3["sendAudio"]
        Q --> S4["sendVoice"]
        Q --> S5["sendKeyboard"]
        Q --> S6["sendQuiz"]
        Q --> S7["editMessage"]
        Q --> S8["sendForceReply"]
        Q --> S9["sendReplyKeyboard"]
        Q --> S10["removeKeyboard"]
        Q --> S11["editKeyboard"]
        Q --> S12["sendDice"]
        Q --> S13["react"]
        Q --> S14["pin"]
    end

    S1 --> TG["Telegram API"]
    S2 --> TG
    S3 --> TG
```

**设计要点**：

- **PQueue concurrency=1** — 所有 TG API 调用严格串行，保证消息顺序
- **Smart Reply** — 本轮第一条消息自动 reply_to 用户原始消息，后续不 reply（避免回复链刷屏）
- **hasSentContent 去重** — tg tool 发过内容后，`reply()` 不再重复发送
- **HTML fallback** — parse_mode=HTML 失败自动降级为 stripMarkdown 纯文本

---

## 8. 状态窗口 (Status Window)

```mermaid
stateDiagram-v2
    [*] --> Thinking: sendThinking()
    Thinking --> ToolExec: showToolCall()
    ToolExec --> Thinking: showToolResult()
    Thinking --> ToolExec: showToolCall()
    ToolExec --> Thinking: showToolResult()
    Thinking --> Deleted: cleanupStatus()
    ToolExec --> Deleted: cleanupStatus()
    Deleted --> [*]
```

**始终只有一条状态消息**，通过 `editMessageText` 原地更新：

| 阶段 | 显示内容 |
|------|---------|
| 初始 | `🤔 Thinking...` |
| read_file | `⏳ 📄 Reading file...` |
| shell | `⏳ 💻 Running command...` |
| web_search | `⏳ 🔍 Searching...` |
| tts | `⏳ 🔊 Generating audio...` |
| image_gen | `⏳ 🖼️ Generating image...` |
| db | `⏳ 🗄️ Querying database...` |
| 工具完成 | `🤔 Thinking...`（重置） |
| 最终 | 删除状态消息 |

---

## 9. tg Tool 统一调度

Agent 通过 `tg` 工具与 Telegram 交互，所有 14 种操作合并为单个工具声明：

```mermaid
flowchart TD
    AGENT["Agent (LLM)"] -->|"tg tool call"| TG_TOOL["tools/telegram.ts"]
    TG_TOOL --> SWITCH{type?}

    SWITCH --> T1["text → sendMessage"]
    SWITCH --> T2["photo → sendPhoto"]
    SWITCH --> T3["audio → sendAudio"]
    SWITCH --> T4["voice → sendVoice"]
    SWITCH --> T5["keyboard → sendKeyboard"]
    SWITCH --> T6["quiz → sendQuiz"]
    SWITCH --> T7["force_reply → sendForceReply"]
    SWITCH --> T8["reply_keyboard → sendReplyKeyboard"]
    SWITCH --> T9["remove_keyboard → removeKeyboard"]
    SWITCH --> T10["edit → editMessage"]
    SWITCH --> T11["edit_keyboard → editKeyboard"]
    SWITCH --> T12["dice → sendDice"]
    SWITCH --> T13["react → react"]
    SWITCH --> T14["pin → pin"]

    T1 --> TSA["SessionAdapter"]
    T5 --> TSA
    T10 --> TSA
```

**Tag 系统**：工具可通过 `tag` 参数标记消息，后续用 tag 引用编辑/pin/react，无需记住 message_id。

---

## 10. Markdown → Telegram HTML 转换

```mermaid
flowchart TD
    MD["LLM Markdown 输出"] --> SPLIT["splitMarkdownForTelegram<br/>(maxLen=4000)"]
    SPLIT --> SEGMENT["每个 segment"]
    SEGMENT --> MARKED["marked.parse()<br/>(标准 HTML)"]
    MARKED --> PROTECT["保护 pre>code 块"]
    PROTECT --> HEADING["h1-h6 → b 加粗"]
    HEADING --> INLINE["strong→b, em→i, del→s"]
    INLINE --> LIST["ul→bullet, ol→numbered"]
    LIST --> BQ["blockquote 保留 expandable"]
    BQ --> BR["br→\\n, hr→━━━"]
    BR --> P["strip p wrapper"]
    P --> STRIP["移除非白名单标签"]
    STRIP --> RESTORE["恢复 code 块"]
    RESTORE --> TRIM["压缩空行"]
    TRIM --> HTML["Telegram HTML"]

    HTML --> SEND["sendMessage<br/>parse_mode: HTML"]
    SEND -->|失败| FALLBACK["stripMarkdown → 纯文本"]
```

**Telegram 白名单标签**：`b`, `i`, `u`, `s`, `code`, `pre`, `a`, `blockquote`, `tg-spoiler`, `tg-emoji`

---

## 11. Per-Chat 串行队列

```mermaid
sequenceDiagram
    participant U as 用户
    participant TA as TelegramAdapter
    participant Q as chatQueue[chatId]

    U->>TA: 消息 A
    TA->>Q: enqueue(taskA)
    Note over Q: taskA 开始执行

    U->>TA: 消息 B (紧接着)
    TA->>Q: enqueue(taskB)
    Note over Q: taskB 等待 taskA 完成

    Note over Q: taskA 完成
    Note over Q: taskB 开始执行
    Note over Q: taskB 完成
    Note over Q: queue 清空
```

**为什么需要**：同一个 chat 的两条消息如果并发执行 `Agent.run()`，会竞争同一个 `tg:<chatId>` session 的历史记录，导致消息交错和状态窗口冲突。

---

## 12. 审批流程 (Shell / File)

```mermaid
sequenceDiagram
    participant Agent as Agent
    participant Tool as Shell Tool
    participant TSA as SessionAdapter
    participant TG as Telegram
    participant User as 用户
    participant TA as TelegramAdapter

    Agent->>Tool: dispatch("shell", {cmd: "rm -rf ..."})
    Tool->>TSA: requestApproval("Agent wants to run: rm -rf ...")
    TSA->>TG: reply("🔐 Approval Required", ReplyKeyboard)
    Note over TG: [✅ Allow] [❌ Deny] [🔓 Always Allow]

    User->>TG: 点击 "✅ Allow"
    TG->>TA: message:text "✅ Allow"
    TA->>TA: tryResolveApproval("✅ Allow")
    TA->>TSA: resolve promise → 'allow'
    TSA-->>Tool: 'allow'
    Tool->>Tool: 执行命令
    Tool-->>Agent: result

    Note over TSA: 超时 5 分钟 → 自动 deny
```

---

## 13. Skill Menu 导航

```mermaid
flowchart TD
    SKILL["Skill SKILL.md<br/>command: true"] -->|"/init"| CMD["Bot command handler"]
    CMD --> NEW["createSession()"]
    NEW --> AGENT["Agent.run('[/command: init]')"]
    AGENT -->|tg keyboard| MENU["InlineKeyboard 菜单"]

    MENU -->|"nav:writing"| NAV["skillMenu.ts"]
    NAV --> JSON["templates/menu.json"]
    JSON --> PAGE["getNavPage()"]
    PAGE --> EDIT["editMessageText + 新 keyboard"]
    Note over EDIT: 纯客户端翻页，无 Agent 调用

    MENU -->|"start_writing"| CB["callback_query"]
    CB --> AGENT2["Agent.run('[callback] start_writing')"]
    Note over AGENT2: 需要 Agent 处理的回调
```

**menu.json 格式**：
```json
{
  "main": {
    "text": "🎯 Pick a skill",
    "buttons": [
      ["📝 Writing|nav:writing", "🗣️ Speaking|nav:speaking"],
      ["📖 Reading|nav:reading", "🎧 Listening|nav:listening"]
    ]
  },
  "writing": {
    "text": "📝 Writing Practice",
    "buttons": [
      ["Brainstorm|start_brainstorm", "Full Task|start_full_task"],
      ["← Back|nav:main"]
    ]
  }
}
```

---

## 14. 错误处理

```mermaid
flowchart TD
    ERR["Agent.run() 抛异常"] --> FORMAT["formatTgError(error)"]
    FORMAT --> CHECK{错误类型?}

    CHECK -->|"429/RESOURCE_EXHAUSTED"| RATE["⚠️ API rate limit reached"]
    CHECK -->|"401/403/API_KEY_INVALID"| AUTH["⚠️ API key invalid or expired"]
    CHECK -->|"500/502/503"| SERVER["⚠️ API service unavailable"]
    CHECK -->|其他| GENERIC["⚠️ 截断消息 (200 chars)"]

    RATE --> SEND["ctx.reply(message)"]
    AUTH --> SEND
    SERVER --> SEND
    GENERIC --> SEND

    Note over SEND: link_preview disabled
```

**HTML 发送 fallback 链**：
1. `sendMessage(html, parse_mode: HTML)` — 首选
2. `sendMessage(stripMarkdown(text))` — HTML 解析失败
3. 日志记录 `tg_reply_dropped` — 最终失败

---

## 15. 关键文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| [TelegramAdapter.ts](../src/adapters/telegram/TelegramAdapter.ts) | 484 | Bot 生命周期、命令注册、消息路由 |
| [SessionAdapter.ts](../src/adapters/telegram/SessionAdapter.ts) | 568 | 每请求 Adapter、出站队列、状态窗口 |
| [telegram.ts (tool)](../src/tools/telegram.ts) | 247 | 统一 tg 工具（14 种 type） |
| [telegram.ts (entry)](../src/adapters/telegram.ts) | 33 | 公共导出 |
| [skillMenu.ts](../src/adapters/telegram/skillMenu.ts) | 146 | 多页 InlineKeyboard 导航 |
| [markdown.ts](../src/adapters/telegram/markdown.ts) | 80 | Markdown 分割与剥离 |
| [tgFormat.ts](../src/lib/tgFormat.ts) | 95 | Markdown → Telegram HTML |
| [errors.ts](../src/adapters/telegram/errors.ts) | 35 | 错误格式化 + typing 指示器 |
| [types.ts](../src/adapters/telegram/types.ts) | 26 | 共享类型定义 |
| [gateway.ts](../src/commands/gateway.ts) | 154 | 进程管理（start/stop/restart/logs） |

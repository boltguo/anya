# Architecture Diagrams

本文档包含 Anya 的架构图和流程图，配合 [architecture.md](./architecture.md) 阅读。

---

## 1. 系统总体架构

```mermaid
graph TB
  subgraph Entry["Entry Layer"]
    CLI["CLI (bin/anya.ts)"]
    TG["Telegram Bot"]
    CRON["Cron Scheduler"]
  end

  subgraph Commands["Command Layer"]
    CHAT["chat"]
    INIT["init"]
    GW["gateway"]
    CONFIG["config"]
    MODEL["model"]
  end

  subgraph AgentCore["Agent Core"]
    AGENT["Agent.run()"]
    PROMPT["promptBuilder"]
    HISTORY["history sanitize/truncate"]
    COMPRESS["contextCompressor"]
    ERRCLASS["errorClassifier"]
  end

  subgraph Providers["Provider Layer"]
    REGISTRY["Provider Registry"]
    GEMINI["GeminiProvider"]
    OPENAI["OpenAIProvider"]
    POOL["CredentialPool"]
  end

  subgraph Tools["Tool Layer"]
    TOOLREG["Tool Registry"]
    FILE["read/write/list_dir"]
    SHELL["shell"]
    SEARCH["web_search"]
    MEM["memory_update"]
    SKILL["skill_manage/view"]
    TGTOOL["tg"]
    TTS["tts"]
    CLARIFY["clarify"]
  end

  subgraph Adapters["Adapter Layer"]
    CLIADAPTER["CliAdapter"]
    TGADAPTER["TelegramAdapter"]
    SESSADAPTER["SessionAdapter"]
  end

  subgraph Storage["Storage & Foundation"]
    SQLITE[("SQLite")]
    FS["Config / Memory / Skills"]
    LOGGER["Logger (pino)"]
  end

  CLI --> CHAT
  CLI --> INIT
  CLI --> CONFIG
  CLI --> MODEL
  TG --> GW
  CRON --> AGENT

  CHAT --> AGENT
  GW --> TGADAPTER
  TGADAPTER --> SESSADAPTER
  SESSADAPTER --> AGENT

  AGENT --> PROMPT
  AGENT --> HISTORY
  AGENT --> COMPRESS
  AGENT --> REGISTRY
  AGENT --> TOOLREG
  AGENT --> SQLITE

  REGISTRY --> GEMINI
  REGISTRY --> OPENAI
  GEMINI --> POOL
  OPENAI -.-> POOL

  TOOLREG --> FILE
  TOOLREG --> SHELL
  TOOLREG --> SEARCH
  TOOLREG --> MEM
  TOOLREG --> SKILL
  TOOLREG --> TGTOOL
  TOOLREG --> TTS
  TOOLREG --> CLARIFY

  AGENT --> CLIADAPTER
  AGENT --> SESSADAPTER
  AGENT --> ERRCLASS

  PROMPT --> FS
  MEM --> FS
  SKILL --> FS
```

---

## 2. ReAct 循环流程

```mermaid
flowchart TD
  INPUT["User Input"] --> SESSION["Load/Create Session"]
  SESSION --> LOAD["Load + Truncate + Sanitize History"]
  LOAD --> BUILD["Build System Prompt"]
  BUILD --> COMPRESS{"Token count > 75% limit?"}

  COMPRESS -->|yes| DO_COMPRESS["Compress middle zone via LLM summary"]
  DO_COMPRESS --> LLM
  COMPRESS -->|no| LLM["Call Provider (Gemini / OpenAI)"]

  LLM --> ERR{"API Error?"}
  ERR -->|yes| CLASSIFY["errorClassifier"]
  CLASSIFY --> RETRY{"Retryable?"}
  RETRY -->|yes, rotate| ROTATE["Rotate credential"] --> LLM
  RETRY -->|yes, compress| DO_COMPRESS
  RETRY -->|no| THROW["Throw to caller"]

  ERR -->|no| RESP{"Response Type"}
  RESP -->|"Tool Calls"| EXEC["Execute tools via dispatch()"]
  EXEC --> FEEDBACK["Show tool call/result via adapter"]
  FEEDBACK --> APPEND["Append assistant + tool messages"]
  APPEND --> COMPRESS

  RESP -->|"Text (final)"| SAVE["Save all new messages to SQLite"]
  SAVE --> REPLY["Reply via adapter"]
  REPLY --> DONE["Return RunResult"]

  style DO_COMPRESS fill:#fff3cd
  style CLASSIFY fill:#f8d7da
```

---

## 3. Telegram 消息处理流程

```mermaid
flowchart TD
  USER["Telegram User"] --> UPDATE["Incoming Update"]

  UPDATE --> TYPE{"Message Type"}
  TYPE -->|"/start, /new"| CMD["Handle Command"]
  TYPE -->|text| TEXT["Extract text"]
  TYPE -->|voice| VOICE["Download .ogg"]
  TYPE -->|photo| PHOTO["Download image"]
  TYPE -->|callback_query| CB["Callback Dispatcher"]

  VOICE --> STT["Groq Whisper STT"]
  STT --> WRAP_V["Wrap: [语音消息: transcript]"]

  PHOTO --> VISION["Gemini Vision"]
  VISION --> WRAP_P["Wrap: [图片分析: description]"]

  TEXT --> HANDLE["handleIncoming()"]
  WRAP_V --> HANDLE
  WRAP_P --> HANDLE

  CB --> CB_TYPE{"Prefix?"}
  CB_TYPE -->|"approval_*"| RESOLVE_A["Resolve pendingApproval"]
  CB_TYPE -->|"choice_*"| RESOLVE_C["Resolve pendingChoice"]
  CB_TYPE -->|other| CB_AGENT["Build input: [callback] data"]
  CB_AGENT --> HANDLE

  HANDLE --> AUTH{"User authorized?"}
  AUTH -->|no| REJECT["Reply: Unauthorized"]
  AUTH -->|yes| TYPING["Start typing indicator"]
  TYPING --> CREATE["Create SessionAdapter + Agent"]
  CREATE --> RUN["Agent.run()"]
  RUN --> RESULT{"result.tgSent?"}
  RESULT -->|yes| CLEANUP["Cleanup status message"]
  RESULT -->|no| FINAL["sessionAdapter.reply()"]
  FINAL --> CLEANUP
```

---

## 4. SessionAdapter 出站队列

```mermaid
flowchart TD
  subgraph Callers["Who calls"]
    TOOLS["tg tool"]
    REPLY["adapter.reply()"]
    STATUS["showToolCall/Result"]
  end

  TOOLS --> ENQ["enqueue(fn)"]
  STATUS --> ENQ
  REPLY --> WAIT["Wait for queue to drain"]
  WAIT --> CHECK{"hasSentContent?"}

  ENQ --> QUEUE["PQueue (concurrency=1)"]

  QUEUE --> API["TG API Call"]
  API --> TRACK["trackMessage(id, tag?)"]
  TRACK --> SET_SENT["hasSentContent = true"]

  CHECK -->|yes| CLEANUP_ONLY["Delete status message only"]
  CHECK -->|no| SEND_FINAL["Convert markdown → MarkdownV2"]
  SEND_FINAL --> SPLIT["Split at 4000 chars"]
  SPLIT --> SEND["Send segments (fallback to plain text)"]
  SEND --> CLEANUP_ONLY

  style QUEUE fill:#d4edda
```

---

## 5. Credential Pool 轮换

```mermaid
stateDiagram-v2
  [*] --> active: register(key)

  active --> active: API call succeeds
  active --> cooldown: rate_limit (429)
  active --> cooldown: auth error (401/403)
  active --> exhausted: billing error (402)

  cooldown --> active: 3 min timeout
  exhausted --> [*]: Manual reset only

  note right of active
    current() returns this key
  end note

  note right of cooldown
    Skipped by current()
    Next active key is selected
  end note
```

---

## 6. Context Compression 流程

```mermaid
flowchart LR
  MSGS["Messages Array"] --> SPLIT["Split into zones"]

  SPLIT --> HEAD["Head (first 3 msgs)"]
  SPLIT --> MIDDLE["Middle zone"]
  SPLIT --> TAIL["Tail (last 8 msgs)"]

  MIDDLE --> TRIM["Trim tool results > 2000 chars"]
  TRIM --> SUMMARIZE["LLM: Generate structured summary"]
  SUMMARIZE --> SUMMARY["Summary message"]

  HEAD --> RESULT["Compressed: head + summary + tail"]
  SUMMARY --> RESULT
  TAIL --> RESULT

  SUMMARIZE -.->|"LLM failed"| FALLBACK["Extractive fallback"]
  FALLBACK --> SUMMARY

  style HEAD fill:#d4edda
  style TAIL fill:#d4edda
  style MIDDLE fill:#fff3cd
```

---

## 7. Prompt 组装

```mermaid
flowchart LR
  SOUL["SOUL.md"] --> PROMPT["System Prompt"]
  RULES["RULES.md"] --> PROMPT
  TIME["Current Timestamp"] --> PROMPT
  USER_MEM["USER.md"] --> MEMORY["Memory Section"]
  AGENT_MEM["MEMORY.md"] --> MEMORY
  MEMORY --> PROMPT
  SKILLS["Skill Index"] --> PROMPT
  SECURITY["Security Rules"] --> PROMPT
  CAPS["Platform Capabilities"] --> PROMPT

  PROMPT --> AGENT["Agent.run()"]
  INPUT["User Message"] --> AGENT

  style SOUL fill:#e8daef
  style RULES fill:#d5f5e3
  style MEMORY fill:#fdebd0
  style SKILLS fill:#d6eaf8
```

---

## 8. Error Recovery 策略

```mermaid
flowchart TD
  ERROR["API Error"] --> EXTRACT["Extract HTTP status code"]
  EXTRACT --> CLASSIFY{"Status Code"}

  CLASSIFY -->|429| RATE["rate_limit"]
  CLASSIFY -->|401/403| AUTH["auth"]
  CLASSIFY -->|402| BILLING["billing"]
  CLASSIFY -->|400 + overflow msg| OVERFLOW["context_overflow"]
  CLASSIFY -->|500/502| SERVER["server_error"]
  CLASSIFY -->|503/529| OVERLOAD["overloaded"]
  CLASSIFY -->|timeout/ECONNRESET| TIMEOUT["timeout"]
  CLASSIFY -->|other| UNKNOWN["unknown"]

  RATE --> ROTATE_RETRY["Rotate key + retry"]
  AUTH --> REFRESH["Refresh token → rotate → retry"]
  BILLING --> ROTATE_ABORT["Rotate key (may exhaust all)"]
  OVERFLOW --> COMPRESS_RETRY["Compress context + retry"]
  SERVER --> BACKOFF["Exponential backoff retry"]
  OVERLOAD --> BACKOFF
  TIMEOUT --> BACKOFF
  UNKNOWN --> BACKOFF

  style OVERFLOW fill:#fff3cd
  style RATE fill:#fde2e2
  style COMPRESS_RETRY fill:#fff3cd
```

---

## 9. 数据流：从用户输入到最终回复

```mermaid
sequenceDiagram
  participant U as User
  participant A as Adapter (CLI/TG)
  participant AG as Agent
  participant P as Provider
  participant T as Tool Registry
  participant S as SQLite

  U->>A: Send message
  A->>AG: run(input, sessionKey)
  AG->>S: Load session + history
  AG->>AG: Build system prompt
  AG->>AG: Sanitize + truncate history

  loop ReAct Loop
    AG->>P: chat(messages, tools, config)
    P-->>AG: LLM Response

    alt Tool Calls
      AG->>A: showToolCall()
      AG->>T: dispatch(toolName, args)
      T-->>AG: Tool result
      AG->>A: showToolResult()
      Note over AG: Append to messages, continue loop
    else Text Response
      AG->>S: Save new messages
      AG->>A: reply(content)
      A-->>U: Display response
    end
  end
```

---

## 10. 目录结构与模块关系

```
src/
├── agent/                  # Agent 核心
│   ├── Agent.ts            # ReAct 循环主体
│   ├── types.ts            # Message, Adapter, ToolDefinition 等类型
│   ├── promptBuilder.ts    # System Prompt 组装
│   ├── history.ts          # 截断 + Gemini 格式清洗
│   ├── contextCompressor.ts # LLM 摘要压缩
│   ├── contextEngine.ts    # 压缩引擎接口
│   └── errorClassifier.ts  # API 错误分类
│
├── providers/              # LLM Provider 层
│   ├── base.ts             # LLMProvider 接口
│   ├── registry.ts         # model → provider 路由
│   ├── gemini.ts           # Gemini SDK 实现
│   ├── openai.ts           # OpenAI Codex SSE 实现
│   ├── openai/             # OpenAI 子模块 (retry, stream, transform)
│   └── credentialPool.ts   # 多 key 轮换池
│
├── tools/                  # 工具层
│   ├── registry.ts         # 注册 + 分发
│   ├── fileTools.ts        # 文件系统
│   ├── shellTool.ts        # 命令执行
│   ├── webSearch.ts        # Tavily 搜索
│   ├── memoryTools.ts      # 长期记忆
│   ├── skillTools.ts       # Skill CRUD
│   ├── telegramTools.ts    # TG 统一交互
│   ├── tts.ts              # 文本转语音
│   └── clarifyTools.ts     # 用户选择
│
├── adapters/               # 平台适配
│   ├── base.ts             # 抽象基类
│   ├── cli.ts              # CLI REPL
│   └── telegram/           # Telegram 适配
│       ├── TelegramAdapter.ts   # Bot 生命周期
│       ├── SessionAdapter.ts    # Per-turn 队列
│       ├── markdown.ts          # Markdown 分割/剥离
│       ├── errors.ts            # 错误格式化
│       └── types.ts             # TG 类型定义
│
├── config/                 # 配置系统
│   ├── defaults.ts         # AnyaConfig 接口 + 默认值
│   ├── schema.ts           # Zod 校验 schema
│   └── loader.ts           # 三层 merge (defaults + file + env)
│
├── storage/                # 持久化
│   ├── db.ts               # SQLite 单例 (WAL mode)
│   └── sessionStore.ts     # Session/Message CRUD
│
├── lib/                    # 基础设施
│   ├── paths.ts            # 所有文件路径常量
│   ├── logger.ts           # pino 结构化日志
│   ├── approval.ts         # 路径沙箱 + 命令审批
│   ├── auth.ts             # OpenAI OAuth Device Grant
│   ├── stt.ts              # Groq Whisper STT
│   ├── tts.ts              # Edge TTS + ffmpeg 转码
│   ├── vision.ts           # Gemini Vision
│   ├── tgFormat.ts         # Markdown → MarkdownV2
│   └── pidfile.ts          # 进程管理 PID 文件
│
├── skills/                 # Skill 系统
│   ├── loader.ts           # 加载 + 缓存 + index 生成
│   └── parser.ts           # YAML frontmatter 解析
│
├── cron/                   # 定时任务
│   ├── jobs.ts             # Job 定义 + CRUD
│   └── scheduler.ts        # croner 调度器
│
├── commands/               # CLI 命令
│   ├── chat.ts             # 交互式聊天
│   ├── init.ts             # 初始化向导
│   ├── model.ts            # 模型切换
│   ├── gateway.ts          # TG bot 进程管理
│   └── config/             # 配置子命令
│
└── index.ts                # 公共 API 导出
```

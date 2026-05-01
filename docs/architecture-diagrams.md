# Architecture Diagrams

本文档基于当前源码实现，展示真实的数据流、模块关系和关键运行流程。

阅读建议：图上方的说明解释这张图在讲什么，节点名对应源码中的模块/函数名，按"输入 → 处理 → 输出"去看。

---

## 1. 总体架构

**一句话理解：所有入口（CLI/Telegram）最终都汇聚到 `Agent.run()`，统一调度工具、技能和本地数据，所有运行态数据落在 `~/.anya/`。**

```mermaid
graph TB
  subgraph Entry["入口层 / Entry Layer"]
    BIN["bin/anya.ts\nCLI 总入口"]
    CLI["CLI Commands\n命令入口"]
    GWCMD["gateway command\n网关命令"]
  end

  subgraph Runtime["运行时层 / Runtime Layer"]
    AGENT["Agent.run()\n统一执行核心"]
    TGADAPTER["TelegramAdapter\nTelegram 顶层网关"]
    TGSESSION["TelegramSessionAdapter\n单轮会话适配器"]
  end

  subgraph Core["核心服务 / Core Services"]
    PROMPT["promptBuilder\n系统提示词组装"]
    HISTORY["history\n历史截断与清洗"]
    COMPRESS["contextCompressor\n长上下文压缩"]
    ERR["errorClassifier\n错误分类"]
    PROVIDER["GeminiProvider\n唯一主 LLM Provider\n(Gemini REST API)"]
    TOOLS["Tool Registry\n10 个内置工具"]
    SKILLS["Skill Loader\n技能加载与索引"]
  end

  subgraph Data["运行时数据 / ~/.anya"]
    CONFIG["config.json\n主配置"]
    MEM["memories/\nRULES.md, USER.md, MEMORY.md"]
    SKDIR["skills/\n技能目录"]
    STORE["data/store/\nstate.db (+ vocab.db, learner.db)"]
    MEDIA["data/\naudio/, images/, search/, cache/"]
    LOGS["logs/ + run/\n日志与 PID"]
  end

  BIN --> CLI
  BIN --> GWCMD

  CLI --> AGENT
  GWCMD --> TGADAPTER
  TGADAPTER --> TGSESSION
  TGSESSION --> AGENT


  AGENT --> PROMPT
  AGENT --> HISTORY
  AGENT --> COMPRESS
  AGENT --> ERR
  AGENT --> PROVIDER
  AGENT --> TOOLS

  PROMPT --> MEM
  PROMPT --> SKILLS
  SKILLS --> SKDIR

  TOOLS --> STORE
  TOOLS --> MEDIA
  AGENT --> STORE
  CLI --> CONFIG
  Runtime --> LOGS
```

---

## 2. 游泳池数据流：从用户输入到最终回复

**本图展示全链路：用户输入 → Adapter → Agent → Provider → Tools → SQLite → 最终回复。**

```mermaid
sequenceDiagram
  participant User as User
  participant Adapter as Adapter (CLI/TG)
  participant Agent as Agent Core
  participant Provider as Gemini Provider
  participant Tools as Tool Registry
  participant DB as SQLite (state.db)

  User->>Adapter: 发送消息
  Adapter->>Agent: run(input, sessionKey)
  Agent->>DB: getOrCreateSession()
  Agent->>DB: loadMessages(sessionId)
  Agent->>Agent: truncateHistory() + sanitizeHistory()
  Agent->>Agent: buildSystemPrompt(config)
  Note over Agent: 时间戳注入用户消息（非 system prompt）保持 system prompt 稳定，最大化 prompt cache hit

  loop ReAct 循环 (max_react_loops)
    Agent->>Agent: 检查上下文长度 (preflight)
    Agent->>Provider: chat(messages, toolSchemas, config)
    Provider-->>Agent: LLM 响应
    alt 模型发出 Tool Calls
      Agent->>Tools: dispatch(toolName, args)
      Tools-->>Agent: ToolDispatchResult
      Note over Agent: 追加 tool result 到 messages，继续循环
    else 模型给出文本回复
      Agent->>DB: saveMessages(newMessages only)
      Agent->>Adapter: reply(content)
      Adapter->>User: 发送回复
    end
  end
```

---

## 3. CLI 启动与命令分发

**用户敲 `anya ...` 以后，命令是怎么被分发到具体实现的。长期交互依靠 `gateway`。**

```mermaid
flowchart TD
  START["anya 命令"] --> BIN["bin/anya.ts\nCLI 解析入口"]
  BIN --> PARSE["Commander parse()\n解析命令行参数"]
  PARSE --> CMD{"Which command?"}

  CMD -->|init| INIT["runInit()\n初始化 ~/.anya/"]
  CMD -->|config| CONFIG["registerConfig()\n配置子命令"]
  CMD -->|doctor| DOCTOR["registerDoctor()\n环境体检"]
  CMD -->|skills| SKILLS["registerSkills()\n技能管理"]
  CMD -->|gateway| GATEWAY["registerGateway()\nTelegram 网关命令"]
  CMD -->|sessions| SESSIONS["registerSessions()\n会话查询"]
  CMD -->|export| EXPORT["registerDataTransfer()\n打包 ~/.anya/ 为 tar.gz"]
  CMD -->|usage| USAGE["runUsage()\n查看使用统计"]
```

---

## 4. Agent ReAct 主循环

**这是系统最核心的一张图，描述 `Agent.run()` 如何反复调用模型、执行工具、再继续推理。**

```mermaid
flowchart TD
  INPUT["input + sessionKey\n当前输入 + 会话标识"] --> SESSION["getOrCreateSession()\n获取或创建 session"]
  SESSION --> LOAD["loadMessages(sessionId)\n读取历史消息"]
  LOAD --> TRUNCATE["truncateHistory(maxHistory)\n截断过长历史"]
  TRUNCATE --> SANITIZE["sanitizeHistory()\n清洗历史格式"]
  SANITIZE --> SYSPROMPT["buildSystemPrompt(config)\n构建系统提示词"]
  SYSPROMPT --> ASSEMBLE["system + history + [timestamp] user input\n拼完整消息数组"]
  ASSEMBLE --> LOOP_START["ReAct 循环开始 loop=0"]

  LOOP_START --> PREFLIGHT{"estimateTokens()\n接近 context_window?"}
  PREFLIGHT -->|"yes, count < 3"| COMPRESS["ContextCompressor.compress()\n压缩上下文"]
  COMPRESS --> PROVIDER
  PREFLIGHT -->|no| PROVIDER["provider.chat(messages, toolSchemas, config)\n调用大模型"]

  PROVIDER --> APIERR{"API error?"}
  APIERR -->|"shouldCompress + count < 3"| COMPRESS
  APIERR -->|fatal| THROW["throw 上层处理"]

  APIERR -->|no error| RESP{"toolCalls?\n模型是否要调工具?"}
  RESP -->|yes| TOOLMSG["Append assistant tool-call msg\n写入消息链"]
  TOOLMSG --> DISPATCH["dispatch(toolName, args, context)\n执行工具"]
  DISPATCH --> APPEND["Append tool result msg\n写回工具结果"]
  APPEND --> LOOP_START

  RESP -->|no| FINAL["assistant final content\n最终文本回复"]
  FINAL --> SAVE["saveMessages(sessionId, newMessages only)\n只保存本轮新增消息"]
  SAVE --> RETURN["RunResult { content, sessionId, toolCallCount, tgSent }"]
```

---

## 5. System Prompt 组装

**每次 `Agent.run()` 开始时，system prompt 的构建顺序（来自 `promptBuilder.ts`）。**

注意：时间戳被放入用户消息而非 system prompt，以保持 system prompt 稳定，最大化 Gemini 的 prompt cache 命中率。

```mermaid
flowchart LR
  P1["1. config.agent.personality\nAgent 人格设定"] --> PROMPT["System Prompt\n最终系统提示词"]
  P1B["   config.user.native_language\n用户母语上下文（若配置）"] --> PROMPT
  P2["2. memories/RULES.md\n操作规则"] --> PROMPT
  P3["3. memories/USER.md\n用户画像"] --> MEMSEC["Memory 区块"]
  P3B["   memories/MEMORY.md\nAgent 笔记"] --> MEMSEC
  MEMSEC --> PROMPT
  P4["4. buildSkillIndex()\n技能索引（轻量）"] --> PROMPT
  P5["5. Security 约束\nallowed_paths 规则"] --> PROMPT
  P6["6. Platform Capabilities\n按 enabled tools 动态生成"] --> PROMPT

  style MEMSEC fill:#fdebd0
  style P4 fill:#d6eaf8
  style P6 fill:#d5f5e3
```

---

## 6. Tool Registry 与执行链

**tool 如何注册、模型如何看见、`dispatch()` 如何执行。**

当前内置工具：`file`、`webSearch`、`memory`、`skill`、`clarify`、`telegram`、`tts`、`pronAssess`、`db`、`resetContext` 等。

```mermaid
flowchart TD
  IMPORTS["registerAllTools()\nPromise.all 动态加载工具模块"] --> REG["Map of toolName to ToolDefinition\n工具注册表"]

  REG --> SCHEMAS["getToolSchemas(config, isTelegram)\n生成给模型看的 schema"]
  REG --> EXEC["dispatch(name, args, context)\n按名执行工具"]

  SCHEMAS -->|"非 Telegram 时隐藏 tg 工具"| MODEL["Visible to LLM\n模型可见工具列表"]
  MODEL --> CALL["LLM emits tool_call\n模型声明调用"]
  CALL --> EXEC

  EXEC --> FOUND{"tools.get(name)?"}
  FOUND -->|no| ERR1["Unknown tool error"]
  FOUND -->|yes| RUN["tool.execute(args, context)\n执行工具代码"]
  RUN --> OK["ToolDispatchResult isError=false\n成功"]
  RUN --> FAIL["catch error, isError=true\n失败（不 throw）"]
```

---

## 7. Telegram 网关处理流程

**TelegramAdapter 收到不同类型消息后的处理链路。每个 chat 有独立的串行队列（chatQueue），防止同一会话并发竞争。**

```mermaid
flowchart TD
  UPDATE["Telegram Bot update"] --> TYPE{"Update type?"}

  TYPE -->|command| CMD["/start /new /kill\n或 skill 快捷命令"]
  TYPE -->|text| TEXT["message:text"]
  TYPE -->|voice| VOICE["message:voice"]
  TYPE -->|photo| PHOTO["message:photo"]
  TYPE -->|callback_query| CALLBACK["callback_query:data"]

  TEXT --> INPUT["raw text input"]

  VOICE --> DLV["download .ogg to VOICE_DIR"]
  DLV --> STT["transcribeAudio()\nGroq Whisper STT"]
  STT --> VINPUT["text + audio_path 注入"]

  PHOTO --> DLP["download to IMAGE_RECEIVED_DIR"]
  DLP --> PINPUT["caption + native image file\n作为多模态输入注入"]

  CALLBACK --> CBTYPE{"callback prefix?"}
  CBTYPE -->|"approval_*"| APPROVAL["resolve pendingApproval"]
  CBTYPE -->|"choice_*"| CHOICE["resolve pendingChoice"]
  CBTYPE -->|"nav_*"| NAV["isNavCallback()\nskill 菜单翻页"]
  CBTYPE -->|other| CINPUT["wrap as callback input"]

  INPUT --> HANDLE["handleIncoming()\n统一入口"]
  VINPUT --> HANDLE
  PINPUT --> HANDLE
  CINPUT --> HANDLE

  HANDLE --> AUTH{"allowed_user_ids?"}
  AUTH -->|no| REJECT["reply unauthorized"]
  AUTH -->|yes| QUEUE["chatQueue per chatId\n串行化同一 chat 的请求"]
  QUEUE --> SESSION["new TelegramSessionAdapter\n创建单轮适配器"]
  SESSION --> AGENT["Agent.run(input, sessionKey)"]
  AGENT --> TGSENT{"result.tgSent?"}
  TGSENT -->|yes| CLEAN["cleanup status message only"]
  TGSENT -->|no| REPLY["adapter.reply(final text)"]
  REPLY --> CLEAN
```

---

## 8. TelegramSessionAdapter 出站串行化

**为什么 Telegram 发消息不会乱序，以及 tool 发过消息后最终 reply 不会重复。**

```mermaid
flowchart TD
  subgraph Sources["消息来源"]
    FINAL["reply()\n最终回复"]
    TGTOOL["tg tool\n工具主动发消息"]
    STATUS["showToolCall/showToolResult\n状态提示"]
  end

  FINAL --> CHECK{"hasSentContent?"}
  CHECK -->|yes| SKIP["跳过，避免重复发送"]
  CHECK -->|no| FORMAT["markdownToTelegramHtml + splitMarkdownForTelegram\n格式化并拆分长消息"]
  FORMAT --> QUEUE

  TGTOOL --> QUEUE["outboundQueue\nPQueue concurrency=1\n严格串行"]
  STATUS --> QUEUE

  QUEUE --> SEND["Telegram Bot API call"]
  SEND --> TRACK["trackMessage(message_id, tag?)\n更新 taggedMessages"]
  TRACK --> STATE["更新 hasSentContent, lastSentMessageId\n首条回复 hasRepliedToUser = smart reply-to"]
```

---

## 9. 配置加载机制

**配置是三层叠加：内置默认值 → 用户配置文件 → 环境变量，最终产出单例。**

```mermaid
flowchart TD
  D["DEFAULT_CONFIG\n内置默认值"] --> MERGE["deepMerge\n深度合并，数组直接替换"]
  FILE{"~/.anya/config.json\n存在?"} -->|yes| READ["readFileSync + JSON.parse"]
  FILE -->|no| MERGE
  READ --> VALIDATE["Zod safeParse\n结构校验，警告 + 继续运行"]
  VALIDATE --> MERGE
  MERGE --> ENV["applyEnvOverrides()\nANYA_GEMINI_API_KEY\nANYA_TAVILY_API_KEY\nANYA_TELEGRAM_BOT_TOKEN\nANYA_LOG_LEVEL"]
  ENV --> FINAL["AnyaConfig singleton\n内存单例，不重复 IO"]
```

---

## 10. 会话持久化模型

**一轮 Agent 执行结束后，消息如何落到 SQLite。只写本轮新增消息，不重写全量历史。**

```mermaid
flowchart TD
  RUN["Agent.run() 开始"] --> GET["getOrCreateSession(sessionKey)\n返回 sessionId"]
  GET --> LOAD["loadMessages(sessionId)\n同步读历史"]
  LOAD --> LOOP["Agent ReAct 循环\n收集 newMessages"]
  LOOP --> SAVE["saveMessages(sessionId, newMessages)\n只写本轮新增"]

  SAVE --> TX["BEGIN TRANSACTION"]
  TX --> INS["INSERT messages with seq\n按顺序插入"]
  INS --> META["UPDATE sessions updated_at, message_count"]
  META --> COMMIT["COMMIT"]

  SAVE -.->|"database is locked"| RETRY["withWriteRetry()\n线性退避 200/400/600ms + jitter\n最多 3 次重试"]
  RETRY --> TX
```

---

## 11. Skill 加载与使用路径

**skill 从 bundled 资产 → 用户目录 → 扫描索引 → 注入 prompt → 按需加载全文的完整路径。**

```mermaid
flowchart LR
  INIT["anya init"] --> COPY["src/skills/bundled/**\n复制到 ~/.anya/skills/.bundled/"]
  COPY --> SCAN["loadSkills()\n递归扫描 SKILL.md\nmtime 缓存，文件改动自动失效"]
  SCAN --> INDEX["buildSkillIndex()\n只提取 name + description\n轻量索引字符串"]
  INDEX --> PROMPT["注入 system prompt\n模型先知道有哪些技能"]
  PROMPT --> MODEL["LLM 感知技能列表"]
  MODEL --> VIEW["skill_view / readSkillFile()\n按需加载 SKILL.md 全文\n或 templates/, references/ 附件"]
  VIEW --> EXEC["工具执行技能流程"]
```

---

## 12. 运行时数据目录结构

**`~/.anya/` 完整目录布局，来自 `src/lib/paths.ts` 定义。**

```mermaid
graph TD
  HOME["~/.anya\n运行时根目录\nANYA_HOME 环境变量可覆盖"] --> CFG["config.json"]
  HOME --> SCHEMA["config.schema.json"]
  HOME --> MEM["memories/"]
  HOME --> SK["skills/"]
  HOME --> DATA["data/"]
  HOME --> LOGS["logs/"]
  HOME --> RUN["run/\nPID 文件"]

  MEM --> RULES["RULES.md\nAgent 操作规则"]
  MEM --> USER["USER.md\n用户画像"]
  MEM --> MEMORY["MEMORY.md\nAgent 笔记"]

  SK --> BUNDLED[".bundled/\nanya init 复制的内置技能"]


  DATA --> STORE["store/\nSQLite 数据库"]
  DATA --> SEARCH["search/\n搜索缓存"]
  DATA --> CACHE["cache/\n通用缓存"]
  DATA --> AUDIO["audio/"]
  DATA --> IMAGES["images/"]

  STORE --> STATEDB["state.db\n会话与消息历史"]
  STORE --> OTHERDB["vocab.db / learner.db / ...\ndb tool 按需创建\n可用 skill templates sql 初始化"]

  AUDIO --> AVOICE["voice/\n用户语音下载"]
  AUDIO --> ATTS["tts/\n生成音频"]

  IMAGES --> RECEIVED["received/\nTelegram 收到的图片"]
```

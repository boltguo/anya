# Architecture Diagrams

本文档按当前源码实现更新，展示真实的数据流、模块关系和关键运行流程。

配合 [`architecture.md`](./architecture.md) 阅读。

阅读建议：

- 每张图上方先看「这张图在讲什么」
- 再看图里的英文节点名，它们基本都对应源码里的模块/函数名
- 如果英文不直观，我已经在每张图下面补了中文解释，按“输入 → 处理 → 输出”去看就行

---

## 1. 当前总体架构

**这张图在讲什么：**

- 最上层是进程/命令入口
- 中间是运行时核心：Agent、Telegram、Cron
- 再下面是核心服务：Prompt、Provider、Tools、Skills
- 最下面是 `~/.anya/` 运行时数据

```text
一句话理解：不同入口最终都会汇聚到 Agent，再去调用工具、技能和本地数据。
```

```mermaid
graph TB
  subgraph Entry["入口层 / Entry Layer"]
    BIN["bin/anya.ts\nCLI 总入口"]
    CLI["CLI Commands\n命令入口"]
    GWCMD["gateway command\n网关命令"]
    CRONCMD["cron command\n定时任务命令"]
  end

  subgraph Runtime["运行时层 / Runtime Layer"]
    AGENT["Agent.run()\n统一执行核心"]
    TGADAPTER["TelegramAdapter\nTelegram 顶层网关"]
    TGSESSION["TelegramSessionAdapter\n单轮会话适配器"]
    CRONADAPTER["CronAdapter\n定时任务适配器"]
    SCHED["CronScheduler\n调度器"]
  end

  subgraph Core["核心服务 / Core Services"]
    PROMPT["promptBuilder\n系统提示词组装"]
    HISTORY["history\n历史清洗与截断"]
    COMPRESS["contextCompressor\n长上下文压缩"]
    ERR["errorClassifier\n错误分类"]
    PROVIDER["OpenAIProvider\n唯一主 LLM Provider"]
    TOOLS["Tool Registry\n工具注册与调度"]
    SKILLS["Skill Loader\n技能加载器"]
  end

  subgraph RuntimeData["运行时数据 / ANYA_HOME"]
    CONFIG["config.json\n主配置"]
    MEM["memories/*.md\n记忆文件"]
    SKDIR["skills/\n技能目录"]
    STATE["data/store/state.db\n会话数据库"]
    DBS["vocab.db / learner.db / others\n业务数据库"]
    CACHE["audio / images / search cache\n缓存与媒体"]
    LOGS["logs/\n日志"]
    CRONJOBS["cron/jobs.json\n定时任务定义"]
  end

  BIN --> CLI
  BIN --> GWCMD
  BIN --> CRONCMD

  CLI --> AGENT
  GWCMD --> TGADAPTER
  TGADAPTER --> TGSESSION
  TGSESSION --> AGENT

  CRONCMD --> SCHED
  SCHED --> CRONADAPTER
  CRONADAPTER --> AGENT

  AGENT --> PROMPT
  AGENT --> HISTORY
  AGENT --> COMPRESS
  AGENT --> ERR
  AGENT --> PROVIDER
  AGENT --> TOOLS

  PROMPT --> MEM
  PROMPT --> SKILLS
  SKILLS --> SKDIR

  TOOLS --> DBS
  TOOLS --> CACHE
  AGENT --> STATE
  CLI --> CONFIG
  TGADAPTER --> CONFIG
  SCHED --> CRONJOBS
  Runtime --> LOGS
```

**怎么看：**

- `bin/anya.ts` 是所有命令的入口
- 真正干活的是 `Agent.run()`
- `Agent.run()` 依赖 Prompt、Provider、Tools、Skills
- 所有长期状态最终都落到 `~/.anya/` 里

---

## 2. CLI 启动与命令分发

**这张图在讲什么：**

- 用户敲 `anya ...` 以后，命令是怎么被分发到具体实现的
- 这里的 `chat` 不代表主产品入口，只是本地 smoke test 路径

```mermaid
flowchart TD
  START["User runs anya\n用户执行命令"] --> BIN["bin/anya.ts\nCLI 解析入口"]
  BIN --> PARSE["Commander parse()\n解析命令行参数"]
  PARSE --> CMD{"Which command?\n用户调用了哪个命令?"}

  CMD -->|init| INIT["runInit()\n初始化 ~/.anya/"]
  CMD -->|chat| CHAT["runChat()\n本地 smoke test"]
  CMD -->|config| CONFIG["registerConfig subtree\n配置子命令"]
  CMD -->|gateway| GATEWAY["registerGateway subtree\nTelegram 网关命令"]
  CMD -->|cron| CRON["registerCron subtree\n定时任务命令"]
  CMD -->|sessions| SESSIONS["registerSessions subtree\n会话查询命令"]
  CMD -->|skills| SKILLS["registerSkills subtree\n技能管理命令"]
  CMD -->|usage| USAGE["runUsage()\n查看使用统计"]
```

**怎么看：**

- `init` 是初始化环境
- `chat` 只是本地快速测试链路
- 真正长期运行主要是 `gateway` 和 `cron`

---

## 3. Agent ReAct 主循环

**这张图在讲什么：**

- 这是整个系统最核心的一张图
- 它描述 `Agent.run()` 每次接到输入后，如何反复调用模型、执行工具、再继续推理

```mermaid
flowchart TD
  INPUT["input + sessionKey\n当前输入 + 会话标识"] --> SESSION["Resolve or create session\n找到或创建 session"]
  SESSION --> LOAD["loadMessages(sessionId)\n读取历史消息"]
  LOAD --> TRUNCATE["truncateHistory()\n截断过长历史"]
  TRUNCATE --> SANITIZE["sanitizeHistory()\n清洗历史格式"]
  SANITIZE --> PROMPT["buildSystemPrompt()\n构建系统提示词"]
  PROMPT --> ASSEMBLE["system + history + user input\n拼完整消息数组"]
  ASSEMBLE --> CHECK["Need preflight compression?\n上下文是否过长?"]

  CHECK -->|yes| COMPRESS["ContextCompressor.compress()\n先压缩上下文"]
  COMPRESS --> PROVIDER
  CHECK -->|no| PROVIDER["provider.chat(...)\n调用大模型"]

  PROVIDER --> APIERR{"API error?\n调用是否报错?"}
  APIERR -->|yes + compressable| COMPRESS
  APIERR -->|yes + fatal| THROW["throw\n直接抛错"]

  APIERR -->|no| RESP{"toolCalls?\n模型是否要调工具?"}
  RESP -->|yes| TOOLMSG["Append assistant tool-call msg\n先把工具调用写入消息链"]
  TOOLMSG --> DISPATCH["dispatch(tool, args)\n执行工具"]
  DISPATCH --> APPEND["Append tool result msg\n写回工具结果"]
  APPEND --> CHECK

  RESP -->|no| FINAL["assistant final content\n得到最终文本回复"]
  FINAL --> SAVE["saveMessages(newMessages)\n保存本轮新增消息"]
  SAVE --> RETURN["RunResult\n返回结果"]
```

**怎么看：**

- 如果模型要调用工具，就不会立刻结束
- 工具结果会回写消息链，再继续问模型
- 直到模型给出真正最终答案，才结束这一轮

---

## 4. System Prompt 组装

**这张图在讲什么：**

- 每次 `Agent.run()` 开始时，system prompt 是由哪些部分拼起来的

```mermaid
flowchart LR
  PERSONA["config.agent.personality\nAgent 人格设定"] --> PROMPT["System Prompt\n最终系统提示词"]
  RULES["memories/RULES.md\n全局规则"] --> PROMPT
  NOW["Current ISO timestamp\n当前时间"] --> PROMPT
  USER["memories/USER.md\n用户画像"] --> MEMSEC["Memory Section\n记忆区块"]
  MEMORY["memories/MEMORY.md\nAgent 记忆"] --> MEMSEC
  MEMSEC --> PROMPT
  SKIDX["buildSkillIndex()\n技能索引"] --> PROMPT
  SEC["Security Rules\n安全约束"] --> PROMPT
  CAPS["Tool-based Platform Capabilities\n平台能力说明"] --> PROMPT

  style MEMSEC fill:#fdebd0
  style SKIDX fill:#d6eaf8
  style CAPS fill:#d5f5e3
```

**怎么看：**

- Prompt 不是只靠一段固定 system message
- 它是把人格、规则、时间、记忆、技能索引、安全策略拼出来的

---

## 5. Tool Registry 与执行链

**这张图在讲什么：**

- tool 是怎么注册进去的
- 模型看见 tool schema 后，如何真正调用到本地代码

```mermaid
flowchart TD
  IMPORTS["registerAllTools() dynamic imports\n动态加载所有内置工具"] --> REG["Map<toolName, ToolDefinition>\n工具注册表"]
  REG --> SCHEMAS["getToolSchemas(config, isTelegram)\n生成给模型看的工具 schema"]
  REG --> EXEC["dispatch(name, args, context)\n按名字执行工具"]

  SCHEMAS --> MODEL["Visible to LLM\n模型可见工具"]
  MODEL --> CALL["LLM emits tool call\n模型发起工具调用"]
  CALL --> EXEC

  EXEC --> FOUND{"Tool exists?\n工具是否存在?"}
  FOUND -->|no| ERR1["Unknown tool error\n未知工具"]
  FOUND -->|yes| RUN["tool.execute(args, context)\n执行工具代码"]
  RUN --> OK["ToolDispatchResult isError=false\n成功结果"]
  RUN --> FAIL["Catch error -> isError=true\n失败结果"]
```

**怎么看：**

- 模型不会直接执行本地代码
- 它只能“声明想调哪个工具”
- 真正执行动作的是 `dispatch()`

---

## 6. Telegram 网关处理流程

**这张图在讲什么：**

- Telegram 收到不同类型消息后，如何被包装成 Agent 输入

```mermaid
flowchart TD
  UPDATE["Telegram update\n收到 Telegram 更新"] --> TYPE{"Update type\n消息类型?"}

  TYPE -->|command| CMD["/start /new /kill /skill-cmd\n命令"]
  TYPE -->|text| TEXT["message:text\n文本消息"]
  TYPE -->|voice| VOICE["message:voice\n语音消息"]
  TYPE -->|photo| PHOTO["message:photo\n图片消息"]
  TYPE -->|callback_query| CALLBACK["callback_query:data\n按钮回调"]

  TEXT --> INPUT["raw text input\n直接文本输入"]

  VOICE --> DOWNLOADV["download ogg -> VOICE_DIR\n下载语音文件"]
  DOWNLOADV --> STT["transcribeAudio()\n语音转文字"]
  STT --> VINPUT["inject transcript + audio_path\n注入转写文本与音频路径"]

  PHOTO --> DOWNLOADP["download image -> IMAGE_RECEIVED_DIR\n下载图片"]
  DOWNLOADP --> VISION["analyzeImage()\n图片分析"]
  VISION --> PINPUT["inject caption + vision description\n注入 caption 与视觉描述"]

  CALLBACK --> CBTYPE{"callback prefix\n回调前缀?"}
  CBTYPE -->|approval_*| APPROVAL["resolve pending approval\n处理授权结果"]
  CBTYPE -->|choice_*| CHOICE["resolve pending choice\n处理选项结果"]
  CBTYPE -->|other| CINPUT["wrap as callback input\n包装成普通输入"]

  INPUT --> HANDLE["handleIncoming()\n统一入口处理"]
  VINPUT --> HANDLE
  PINPUT --> HANDLE
  CINPUT --> HANDLE

  HANDLE --> AUTH{"authorized user?\n用户是否有权限?"}
  AUTH -->|no| REJECT["reply unauthorized\n拒绝访问"]
  AUTH -->|yes| SESSION["new TelegramSessionAdapter\n创建单轮适配器"]
  SESSION --> AGENT["Agent.run()\n进入 Agent 主流程"]
  AGENT --> TGSENT{"tg tool already sent?\n工具是否已发消息?"}
  TGSENT -->|yes| CLEAN["cleanup status only\n只清理状态消息"]
  TGSENT -->|no| REPLY["adapter.reply(final text)\n补发最终文本"]
  REPLY --> CLEAN
```

**怎么看：**

- Telegram 不同类型输入，最后都会被转换成字符串上下文
- 然后统一喂给 `Agent.run()`

---

## 7. TelegramSessionAdapter 出站串行化

**这张图在讲什么：**

- 为什么 Telegram 发消息不会乱序
- 为什么 tool 发过消息后，最终 reply 不会重复发一遍

```mermaid
flowchart TD
  subgraph Sources["消息来源 / Message sources"]
    FINAL["reply()\n最终回复"]
    TGTOOL["tg tool\n工具主动发消息"]
    STATUS["showToolCall / showToolResult\n状态提示"]
  end

  FINAL --> QUEUE["PQueue(concurrency=1)\n串行发送队列"]
  TGTOOL --> QUEUE
  STATUS --> QUEUE

  QUEUE --> SEND["Telegram Bot API call\n调用 Telegram 发送接口"]
  SEND --> TRACK["trackMessage(message_id, tag?)\n记录消息 ID"]
  TRACK --> STATE["update hasSentContent / lastSentMessageId\n更新发送状态"]

  FINAL --> CHECK{"hasSentContent?\n是否已经发过内容?"}
  CHECK -->|yes| SKIP["skip duplicate final reply\n跳过重复最终回复"]
  CHECK -->|no| FORMAT["markdownToTelegramV2 + split\n格式化并拆分长消息"]
  FORMAT --> SEND
```

**怎么看：**

- `PQueue(1)` 保证所有出站动作按顺序执行
- `hasSentContent` 保证不会“工具发一遍 + 最终回复再发一遍”

---

## 8. Cron 调度与结果投递

**这张图在讲什么：**

- 定时任务如何从 `jobs.json` 被加载、触发、执行、投递

```mermaid
flowchart TD
  JOBS["cron/jobs.json\n任务定义文件"] --> LOAD["loadJobs().filter(enabled)\n读取启用任务"]
  LOAD --> SYNC["syncJobs() every 60s\n每 60 秒同步一次"]
  SYNC --> REGISTER["Create/refresh Cron instances\n创建或刷新调度实例"]
  REGISTER --> FIRE["job trigger fires\n任务触发"]
  FIRE --> EXEC["executeJob(job)\n执行任务"]
  EXEC --> AGENT["Agent.run(job.prompt, newSession=true)\n让 Agent 跑任务 prompt"]
  AGENT --> RESULT["result.content\n得到执行结果"]
  RESULT --> DELIVER{"deliver_to\n投递到哪里?"}
  DELIVER -->|telegram| TG["sendMessage via Bot API\n发到 Telegram"]
  TG --> LINK["write mirrored messages to tg session history\n回写 Telegram 会话历史"]
  RESULT --> HISTORY["write cron history json\n写执行历史"]
```

**怎么看：**

- Cron 本质上也是调用 `Agent.run()`
- 只是输入不是用户即时消息，而是 job 里的 prompt

---

## 9. 配置加载与迁移

**这张图在讲什么：**

- 配置不是简单读一个 JSON 文件，而是默认值、配置文件、环境变量三层叠加

```mermaid
flowchart TD
  DEFAULT["DEFAULT_CONFIG\n内置默认配置"] --> MERGE["deepMerge\n深度合并"]
  FILE{"config.json exists?\n配置文件存在吗?"} -->|yes| READ["read + JSON.parse\n读取并解析 JSON"]
  FILE -->|no| MERGE
  READ --> MIGRATE["migrateConfig()\n迁移旧版本配置"]
  MIGRATE --> VALIDATE["Zod safeParse\n结构校验"]
  VALIDATE --> MERGE
  MERGE --> ENV["applyEnvOverrides()\n应用环境变量覆盖"]
  ENV --> FINAL["AnyaConfig singleton\n最终运行配置"]

  MIGRATE -.-> OLD1["google -> gemini\n旧字段迁移"]
  MIGRATE -.-> OLD2["legacy provider shape -> new shape\n旧结构转新结构"]
```

**怎么看：**

- 最终生效配置不是只看 `config.json`
- 还会被环境变量覆盖

---

## 10. 会话持久化模型

**这张图在讲什么：**

- 一轮 Agent 执行结束后，消息是怎么落到 SQLite 里的

```mermaid
flowchart TD
  RUN["Agent run\n一次 Agent 执行"] --> GET["getOrCreateSession()\n获取或创建会话"]
  GET --> LOAD["loadMessages(sessionId)\n读取历史消息"]
  LOAD --> LOOP["Agent loop\n执行主循环"]
  LOOP --> NEWMSGS["collect newMessages only\n只收集本轮新增消息"]
  NEWMSGS --> SAVE["saveMessages(sessionId, newMessages)\n保存新增消息"]

  SAVE --> TX["BEGIN transaction\n开启事务"]
  TX --> INS["insert each message with seq\n按顺序写消息"]
  INS --> META["update sessions.updated_at + message_count\n更新会话元数据"]
  META --> COMMIT["COMMIT\n提交事务"]

  SAVE -.-> LOCK["database is locked\n数据库锁冲突"]
  LOCK -.-> RETRY["withWriteRetry() linear backoff\n线性退避重试"]
```

**怎么看：**

- 历史消息先读出来
- 本轮新消息单独收集
- 最后统一事务写入，避免半写半不写

---

## 11. Skill 加载与使用路径

**这张图在讲什么：**

- skills 从仓库 bundled 资源，到最终进入 prompt、被 Agent 感知和调用的路径

```mermaid
flowchart LR
  INIT["anya init\n初始化"] --> COPY["copy src/skills/bundled -> ~/.anya/skills/.bundled\n复制内置技能"]
  COPY --> SCAN["loadSkills() scan SKILL.md recursively\n递归扫描技能文件"]
  SCAN --> INDEX["buildSkillIndex()\n构建技能索引"]
  INDEX --> PROMPT["Injected into system prompt\n注入系统提示词"]
  PROMPT --> MODEL["Model becomes aware of skill names/descriptions\n模型先知道有哪些技能"]
  MODEL --> VIEW["skill_view / skill file read on demand\n按需读取技能详情"]
  VIEW --> EXEC["Use tools to execute skill workflow\n用工具执行技能流程"]
```

**怎么看：**

- skill 不会一上来全文塞进 prompt
- 先给模型看 skill index，真的需要时再加载细节

---

## 12. IELTS Skill Runtime 专项流程图

**这张图在讲什么：**

- Learner 在 Telegram 里发来的消息，如何进入 IELTS 相关 skill
- 单词、练习、定时任务这三大块如何和 `memory` / `db` / `tts` / `tg` 联动

```mermaid
flowchart TD
  USER["Learner message on Telegram\n学习者在 Telegram 发消息"] --> ROUTE{"Intent\n意图识别"}

  ROUTE -->|单词 / lookup| WORDS["words skill\n单词技能"]
  ROUTE -->|阅读 / 听力 / 口语 / 写作| PRACTICE["practice skill\n练习技能"]
  ROUTE -->|初始化 / 建档| INIT["init skill\n初始化技能"]
  ROUTE -->|定时任务| CRON["cron ielts skill\nIELTS 定时任务技能"]

  INIT --> MEMREAD["read/write memories\n读写全局记忆"]
  INIT --> DBINIT["db -> learner/vocab schema or records\n初始化学习数据库"]

  WORDS --> WDB["db name=vocab\n访问词汇数据库"]
  WDB --> WORDSTATE{"Word exists?\n数据库里已有这个词吗?"}
  WORDSTATE -->|yes| CARD["reuse definition/example/audio_path\n复用已存释义/例句/音频"]
  WORDSTATE -->|no| GEN["LLM generate meaning/example/collocations\n生成释义/例句/搭配"]
  GEN --> TTS["tts generate segmented audio\n生成分段单词音频"]
  TTS --> SAVEAUDIO["persist audio_path\n保存音频路径"]
  SAVEAUDIO --> CARD
  CARD --> TG["tg send voice + word card + keyboard\n发语音 + 单词卡 + 按钮"]
  TG --> EVENT["db write word_events + counters\n写事件与统计计数"]

  PRACTICE --> PROFILE["read USER.md / MEMORY.md\n读取学习者画像与记忆"]
  PROFILE --> LDB["db name=learner\n访问 learner 数据库"]
  LDB --> CONTENT["build task / question / assessment\n构建题目/任务/评估"]
  CONTENT --> INTERACT["tg / clarify / tts / pron_assess\n与用户交互"]
  INTERACT --> RESULT["write learner progress / errors / scores\n写学习记录/错误/分数"]

  CRON --> SEED["cron-word-seed / cron-review / briefing\n定时播种/复习/briefing"]
  SEED --> VDB["db read vocab / learner\n读取词汇与学习数据"]
  VDB --> PUSH["tg deliver briefing or review task\n推送 briefing 或复习任务"]

  RESULT --> TRANSFER{"Need vocab transfer?\n是否需要词汇迁移升级?"}
  TRANSFER -->|yes| XFER["update vocab mastery / transfer_level\n提升词汇掌握度/迁移等级"]
  TRANSFER -->|no| DONE["turn complete\n本轮结束"]
  XFER --> DONE
  EVENT --> DONE
```

**怎么看：**

- `words` 主要围绕 `vocab.db`
- `practice` 主要围绕 `learner.db`
- 所有对用户的输出仍主要通过 `tg`、`tts`、`clarify` 等工具完成

---

## 13. 数据目录关系

**这张图在讲什么：**

- `~/.anya/` 目录内部最重要的层级关系

```mermaid
graph TD
  HOME["~/.anya\n运行时根目录"] --> CFG["config.json\n主配置"]
  HOME --> MEM["memories/\n记忆文件"]
  HOME --> SK["skills/\n技能目录"]
  HOME --> CRON["cron/\n定时任务目录"]
  HOME --> DATA["data/\n核心数据目录"]
  HOME --> LOGS["logs/\n日志"]
  HOME --> RUN["run/\nPID 与进程状态"]

  DATA --> STORE["store/\nSQLite 数据库"]
  DATA --> IELTS["ielts/\nIELTS 专项目录"]
  DATA --> SEARCH["search/\n搜索缓存"]
  DATA --> CACHE["cache/\n通用缓存"]
  DATA --> AUDIO["audio/\n音频目录"]
  DATA --> IMG["images/\n图片目录"]

  STORE --> STATE["state.db\n会话与消息"]
  STORE --> VOCAB["vocab.db\n单词数据库"]
  STORE --> LEARNER["learner.db\n学习者数据库"]

  AUDIO --> VOICE["voice/\n用户语音"]
  AUDIO --> TTS["tts/\n生成音频"]

  IMG --> RECEIVED["received/\n收到的图片"]
  IMG --> GENERATED["generated/\n生成的图片"]
```

**怎么看：**

- `store/` 里是最关键的结构化数据库
- `audio/` 和 `images/` 主要是媒体与缓存

---

style OVERFLOW fill:#fff3cd
style RATE fill:#fde2e2
style COMPRESS_RETRY fill:#fff3cd

````

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
````

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

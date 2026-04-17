# Anya Architecture

> 本文基于当前代码库实际实现更新，覆盖 CLI、Agent Core、Telegram Gateway、Cron、Tools、Skills、Storage 与数据流。

---

## 1. 项目概览

Anya 是一个以 TypeScript 构建的个人 AI Agent 运行时，目标不是做通用聊天壳，而是提供一个 **可持续运行、可持久化、可扩展、可迁移** 的个人代理系统。

当前项目具备这些核心特征：

- **统一 Agent Core**：CLI、Telegram、Cron 共用同一套 `Agent.run()` ReAct 循环
- **单 Provider 抽象**：当前实际 LLM Provider 为 OpenAI Codex Responses API，但接口层保留 Provider 抽象
- **工具驱动执行**：文件、数据库、Shell、记忆、TTS、图片生成、Telegram 富交互等都通过 Tool Registry 暴露给模型
- **Skill 驱动领域能力**：通过 `SKILL.md` 为 Agent 提供结构化领域工作流，当前仓库重点包含 IELTS 系列技能
- **本地持久化优先**：配置、记忆、技能、SQLite 数据、缓存、日志全部落在 `~/.anya/`
- **多入口一致性**：CLI、Telegram Bot、Cron 只是入口不同，核心决策和能力模型一致

---

## 2. 当前代码结构与职责分层

从仓库实现看，系统可以分成 8 层：

1. **Entry / Process Layer**
2. **Command Layer**
3. **Adapter Layer**
4. **Agent Core Layer**
5. **Provider Layer**
6. **Tool & Skill Layer**
7. **Storage / Runtime Foundation Layer**
8. **Bundled Domain Assets Layer**

### 2.1 Entry / Process Layer

入口位于：

- `bin/anya.ts`

职责：

- 作为 CLI 可执行入口
- 初始化 Commander 命令树
- 屏蔽 `node:sqlite` 的实验性 warning
- 动态加载具体命令实现

这一层只负责任务分发，不包含业务逻辑。

### 2.2 Command Layer

主要位于：

- `src/commands/`
- `bin/commands/`

职责：

- 暴露用户可调用命令
- 承担配置初始化、网关控制、Cron 管理、Session 查询、数据迁移等 CLI 管理功能
- 为 Agent 运行准备上下文，但不承载 Agent 决策逻辑

重要命令包括：

- `chat`：本地 smoke test 入口，用于验证 Agent 主链路是否可用
- `init`：初始化 `~/.anya/` 目录、默认配置、RULES、memory、bundled skills
- `config`：配置查看与编辑
- `gateway`：Telegram 网关进程管理
- `cron`：定时任务管理与调度控制
- `sessions`：会话查询
- `dataTransfer`：备份/迁移类能力
- `usage`：API 使用统计

### 2.3 Adapter Layer

主要位于：

- `src/adapters/telegram/`

职责：

- 将平台输入包装成统一 Agent 输入
- 将 Agent 输出落到不同平台的发送协议中
- 处理平台特有能力，如 Telegram 的 callback、voice、photo、reply keyboard、inline keyboard

当前显式实现最完整的是 Telegram Adapter。CLI 侧更多是通过 command 直接驱动 Agent，而不是独立的复杂 adapter 子系统。

### 2.4 Agent Core Layer

主要位于：

- `src/agent/Agent.ts`
- `src/agent/promptBuilder.ts`
- `src/agent/contextCompressor.ts`
- `src/agent/history.ts`
- `src/agent/errorClassifier.ts`
- `src/agent/contextEngine.ts`

这是整个项目的核心执行引擎，负责：

- 会话加载
- Prompt 组装
- 历史截断与清洗
- ReAct 循环
- 工具调用编排
- API 错误恢复
- 长上下文压缩
- 最终消息落库

### 2.5 Provider Layer

主要位于：

- `src/providers/openai.ts`
- `src/providers/openai/stream.ts`
- `src/providers/openai/transform.ts`

虽然旧文档中仍保留 Gemini/OpenAI 双 Provider 叙事，但当前代码实现里：

- `getProvider()` 实际固定返回 `OpenAIProvider`
- 上游 API 为 **ChatGPT Codex Responses API**
- 接口层仍保持 `LLMProvider` 抽象，便于以后重新扩展多 provider

### 2.6 Tool & Skill Layer

主要位于：

- `src/tools/`
- `src/tools/registry.ts`
- `src/skills/loader.ts`
- `src/skills/parser.ts`
- `src/skills/bundled/`

职责分工：

- **Tool**：原子执行能力
- **Skill**：领域流程知识与提示资产

当前内置工具由 `registerAllTools()` 一次性加载注册，包括：

- `file`
- `shell`
- `webSearch`
- `memory`
- `skill`
- `clarify`
- `telegram`
- `tts`
- `imageGen`
- `pronAssess`
- `db`

### 2.7 Storage / Runtime Foundation Layer

主要位于：

- `src/storage/`
- `src/lib/paths.ts`
- `src/lib/logger.ts`
- `src/lib/auth.ts`
- `src/lib/usage.ts`
- `src/lib/pidfile.ts`
- `src/config/`

职责：

- 统一路径布局
- SQLite 会话持久化
- PID 文件与守护进程状态
- OAuth / token 管理
- 使用量统计
- 配置加载、校验、迁移
- 日志输出

### 2.8 Bundled Domain Assets Layer

主要位于：

- `src/skills/bundled/ielts/**`

这是项目的业务重点，已从散技能集合升级为完整的 7.0-7.5 能力跃迁系统：

- **数据底座**：`learner.db`（samples / errors / subcap_scores / daily_tasks / mock_sessions / stage_transitions）+ `vocab.db`（words + paraphrase_groups）
- **诊断大脑** (`assessment`)：4 模式（daily light / weekly deep / biweekly focus / on-demand），subcap 雷达 + 稳定性指标 + 根因三分类 + Active Driver
- **路径调度** (`orchestrator`)：A/B/C 路径 + 4 阶段（diagnose / breakthrough / integrate / sprint）+ 每日 3 任务调度 + 认知负荷预算
- **训练执行**：Writing（+ sentence-lab + 3 层反馈）/ Speaking（+ 素材库 + OEE/五要素）/ Listening（+ note-taking + 6 类认知错因）/ Reading（+ argument-map + attitude-scan）
- **词汇系统** (`words`)：chunk / pattern / paraphrase_group / personal_error 五种 item_kind + 全技能自动沉淀
- **整合验证** (`mock-exam`)：full / biweekly / weekly 三模式 + 迁移分析 + 稳定性评分 + 阶段跃迁检查
- **定时生态**：08:00 orchestrator / 08:30 briefing / 20:00 deep assessment (周日) / 21:00 word review / 22:00 light assessment

这些能力不是通过硬编码业务流程堆在 Agent 里，而是由 Skill 文档 + Tool + DB + Cron 组合构成闭环。

---

## 3. 真实运行架构

### 3.1 总体关系

从实现上看，当前架构可以概括为：

- `bin/anya.ts` 负责命令入口
- 命令层根据场景启动 Agent、Gateway 或 Scheduler
- `Agent` 作为统一运行时使用 Prompt + History + Tools + Provider 进行循环推理
- `TelegramAdapter` 和 `CronAdapter` 负责平台交付
- `sessionStore` 负责会话持久化
- `paths.ts` 管理所有 `~/.anya/` 目录约定

### 3.2 `~/.anya/` 是运行时中心

所有运行态数据都围绕 `ANYA_HOME` 组织。当前实际目录定义来自 `src/lib/paths.ts`：

```text
~/.anya/
├── config.json
├── config.schema.json
├── auth.json
├── memories/
│   ├── RULES.md
│   ├── USER.md
│   └── MEMORY.md
├── skills/
│   └── .bundled/
├── cron/
│   ├── jobs.json
│   └── history/
├── data/
│   ├── store/
│   │   ├── state.db
│   │   ├── vocab.db
│   │   └── learner.db
│   ├── ielts/
│   │   ├── profile/
│   │   └── learn/
│   ├── search/
│   ├── cache/
│   ├── audio/
│   │   ├── voice/
│   │   └── tts/
│   └── images/
│       ├── received/
│       └── generated/
├── logs/
└── run/
```

这说明 Anya 的设计原则是：

- 代码仓库负责程序
- `~/.anya/` 负责用户环境与状态
- 技能、记忆、数据库、缓存是运行态的一部分

---

## 4. Agent Core 深度分析

## 4.1 `Agent.run()` 的职责边界

`src/agent/Agent.ts` 中的 `Agent.run()` 是整个系统的统一执行入口。它完成：

1. 根据 `sessionKey` 获取或创建 session
2. 从 SQLite 加载历史消息
3. 对历史做截断与 provider 兼容清洗
4. 调用 `buildSystemPrompt()` 组装系统提示
5. 将 system + history + 当前 user input 拼成消息数组
6. 在最大 loop 限制内执行 ReAct 循环
7. 若模型发出 tool calls，则执行并把 tool 结果回写消息链
8. 若模型直接给出文本，则保存消息并返回
9. 若发生 context overflow，则尝试压缩并恢复
10. 若超过最大循环次数，则返回 fallback 警告

### 4.2 ReAct Loop 的关键机制

关键字段：

- `max_react_loops`
- `context_window`
- `compressionCount`
- `totalToolCalls`
- `tgSent`

这些字段共同控制：

- 最多可调用几轮 LLM
- 何时触发上下文压缩
- 当前轮是否已经通过 `tg` 发送了消息
- 最终返回给调用方的执行统计

### 4.3 新消息落库策略

Agent 不会重复写入整段历史，而是：

- 启动时只读旧 history
- 当前 run 期间维护 `newMessages`
- 最终只把本轮新增消息写入 SQLite

这个设计避免了重复写历史，也让 Session 存储成本更可控。

---

## 5. Prompt 组装机制

`src/agent/promptBuilder.ts` 反映了系统提示词的真实来源。

当前 Prompt 结构按顺序由以下部分组成：

1. `config.agent.personality`
2. `RULES.md`
3. 当前时间戳
4. `USER.md` + `MEMORY.md`
5. Skills Index
6. Security 规则
7. Platform Capabilities

### 5.1 Prompt Builder 的几个重要特征

- **文件带 mtime + TTL 缓存**，避免每次都读盘
- **Skills 不是全文注入**，而是先注入技能索引
- **Platform Capabilities 按 enabled tools 动态注入**
- **记忆文件是全局注入**，不是按具体 skill 临时读取

### 5.2 与旧文档相比的关键变化

旧文档中写的是 “IELTS Profile 注入 `data/ielts/profile/USER.md + MEMORY.md`”。

当前实际实现为：

- Prompt Builder 直接读取 `memories/USER.md` 与 `memories/MEMORY.md`
- IELTS 相关 profile 数据目录在 `paths.ts` 中仍存在，但不是 Prompt Builder 当前直接读取源

这说明当前架构已经从“仅 IELTS learner profile”演进到“更通用的 agent memory 注入”。

---

## 6. Provider 层现状

### 6.1 实际情况：当前只有 OpenAI Provider 在运行

`src/providers/openai.ts` 表明：

- `LLMProvider` 接口仍保留
- `OpenAIProvider` 是唯一具体实现
- `getProvider()` 始终返回同一个 `_provider`

因此当前系统是：

- **Provider abstraction 还在**
- **Multi-provider runtime 目前不在代码中生效**

### 6.2 OpenAI Provider 的工作方式

当前 Provider 通过 Codex Responses API：

- 将内部消息转换为 Responses API 所需的 `instructions + input`
- 将工具 schema 转换为 Responses API tools 格式
- 使用 SSE 流式消费输出
- 在 auth 错误时尝试刷新 Codex token
- 使用 `p-retry` 做可重试错误恢复

### 6.3 错误恢复协作

Provider 与 `errorClassifier` 协作完成：

- auth refresh
- retry / abort
- 结构化错误日志

Agent 本身进一步接住 `shouldCompress` 类型错误并触发 Context Compression。

---

## 7. Tool Registry 与工具系统

### 7.1 注册机制

工具通过 `register()` 注册到全局 `Map<string, ToolDefinition>`。

`registerAllTools()` 使用动态 import 一次性加载所有内置工具，避免旧式 side-effect import 混乱。

### 7.2 调度机制

模型返回 tool call 后，Agent 调用：

- `getToolSchemas()`：把当前 enabled tools 转为模型可见 schema
- `dispatch()`：执行指定工具

`dispatch()` 负责：

- 工具存在性校验
- 调用日志
- 耗时统计
- 异常捕获
- 统一 `ToolDispatchResult`

### 7.3 平台过滤

`getToolSchemas(config, isTelegram)` 会在非 Telegram 场景下隐藏 `tg` 工具，减少 prompt 成本。

这是一个很实用的架构细节：

- tool registry 是全局的
- tool visibility 是按平台裁剪的

---

## 8. Skill 系统分析

### 8.1 Skill Loader 的三级能力

`src/skills/loader.ts` 提供三类能力：

1. **索引加载**：扫描 `SKILLS_DIR` 下所有 `SKILL.md`
2. **按名获取 skill**：用于精确读取
3. **列出/读取 skill 附件文件**：支持 `templates/`、`references/` 等资源

### 8.2 当前技能组织方式

当前代码仓库内提供 bundled skills，`init` 时会复制到用户目录：

- `src/skills/bundled/**` → `~/.anya/skills/.bundled/**`

这意味着：

- 仓库提供内置技能资产
- 用户运行环境中的 skills 才是 Agent 实际读取源
- 技能可以后续被扩展、覆盖、增量新增

### 8.3 Skill 与 Tool 的关系

- Skill 提供策略与流程
- Tool 提供执行原子能力
- Prompt 只先注入 skill 索引，真正执行前再通过 `skill_view`/附属文件读取细节

这是“轻索引 + 按需加载”的设计。

### 8.4 IELTS 能力跃迁系统

IELTS 技能群已从独立散技能升级为闭环能力系统，包含三层架构：

#### 数据底座层

- `learner.db`：samples（含 rewrite chain 追踪 parent_sample_id / prompt_hash）、errors（16 key taxonomy + root cause tags）、subcap_scores（25 个子能力 key）、daily_tasks、mock_sessions、stage_transitions
- `vocab.db`：words（5 种 item_kind）、paraphrase_groups / paraphrase_members
- Schema 管理：直接更新 `.sql` 模板 + 重传 `.db` 文件，无需迁移脚本

#### 诊断与调度层

- **Assessment**（诊断大脑）：daily light (22:00 silent) / weekly deep (周日 20:00 报告) / biweekly focus / on-demand。输出 subcap 雷达、稳定性指标（mean/std/trough）、根因分布、Active Driver
- **Orchestrator**（路径调度中枢）：A/B/C 路径决策 + 4 阶段判定 + 每日负荷预算 + 今日 3 任务调度 + 阶段跃迁守门
- **触发约定**：所有 skill 间调用统一使用显式 callback（如 `orchestrator:run`），禁止隐式链调用

#### 训练执行层闭环

每个训练 skill 完成后：写 samples + errors + subcap_scores → 沉淀表达到 vocab.db → 标记 daily_tasks.completed → 持久化难度反馈到 feedback JSON → 元认知自评用 force_reply 记 gap

#### Cron 时序

| 时间 | Job | 说明 |
|---|---|---|
| 07:15 | word-seed | 静默补库 |
| 08:00 | orchestrator | 生成今日 3 任务 |
| 08:30 | briefing | 推送晨报 + 任务仪表盘 |
| 20:00 | assessment-deep | 周日周报 + orchestrator:run 按钮 |
| 21:00 | word-review | 推送复习 |
| 22:00 | assessment-light | 静默更新 MEMORY |

---

## 9. Telegram 子系统分析

### 9.1 TelegramAdapter 是顶层网关管理器

`src/adapters/telegram/TelegramAdapter.ts` 负责：

- 初始化 grammy `Bot`
- 注册命令
- 动态注册 skill commands
- 路由 text / voice / photo / callback query
- 为每个 turn 创建 `TelegramSessionAdapter`
- 调用 `Agent.run()`

### 9.2 Telegram 输入处理链路

#### 文本消息

- 收到文本
- 检查是否是 approval reply
- 调用 `handleIncoming()`

#### 语音消息

- 下载 Telegram voice 文件到 `VOICE_DIR`
- 调用 `transcribeAudio()` 做 STT
- 将 transcript 包装成带 `audio_path` 的输入文本
- 再交给 Agent

#### 图片消息

- 下载图片到 `IMAGE_RECEIVED_DIR`
- 调用 `analyzeImage()` 生成视觉描述
- 将 caption + vision description 包装后交给 Agent

#### Callback Query

分流为：

- approval resolve
- choice resolve
- 普通 callback 重新包装为 Agent 输入

### 9.3 SessionAdapter 是每轮出站控制器

`src/adapters/telegram/SessionAdapter.ts` 的设计非常关键：

- 每个 turn 一个 adapter 实例
- 所有 TG API 调用统一进入 `PQueue(concurrency=1)`
- 维护单条可编辑的 status message
- 首条回复支持智能 reply-to 原始用户消息
- 使用 `hasSentContent` 防止最终文本和 `tg` tool 双重发送

这让 Telegram 的平台侧行为具有强一致性。

---

## 10. Cron 子系统分析

### 10.1 调度器职责

`src/cron/scheduler.ts` 使用 `croner` 提供长期运行调度。

调度器负责：

- 读取 `jobs.json`
- 为每个 enabled job 生成独立 `Cron` 实例
- 定期同步 jobs 文件，支持热更新
- 执行时创建独立 Agent 运行任务 prompt
- 把结果投递到 Telegram

### 10.2 CronAdapter 设计

Cron 不需要复杂交互，因此提供一个极轻量 `CronAdapter`：

- `reply()` 只累计文本结果
- `requestApproval()` 永远返回 `allow`

说明 cron 任务被设计为无人值守执行路径。

当前默认注册了 6 个 cron job：

| ID | 名称 | 时间 | 投递 | 说明 |
|---|---|---|---|---|
| `cron_orchestrator` | Daily Task Generation | 08:00 每天 | cli (silent) | 生成今日 3 任务到 daily_tasks |
| `cron_briefing` | Daily Briefing | 08:30 每天 | telegram | 晨报 + 任务仪表盘 |
| `cron_assessment` | Weekly Deep Assessment | 20:00 周日 | telegram | 周报 + 路径刷新按钮 |
| `cron_word_seed` | Word Inventory Seed | 07:15 每天 | cli (silent) | 补充 queued_new 词库 |
| `cron_word_review` | Daily Word Review | 21:00 每天 | telegram | 复习推送 |
| `cron_assessment_light` | Daily Light Assessment | 22:00 每天 | cli (silent) | 更新 MEMORY bands/errors |

### 10.3 Cron 与会话系统的连接

当结果投递到 Telegram 后，还会尝试把 cron 结果补写进对应 Telegram session：

- user 侧写一条 `[定时任务: name]`
- assistant 侧写真正结果

这保证 Telegram 用户在会话历史中能看到定时投递痕迹。

---

## 11. 配置系统分析

### 11.1 加载优先级

`src/config/loader.ts` 当前加载顺序是：

1. `DEFAULT_CONFIG`
2. `~/.anya/config.json`
3. 环境变量覆盖

### 11.2 关键特征

- 深度 merge
- Zod 校验，但以“警告 + 继续运行”为主
- 自动迁移旧配置版本
- 支持 env override
- 维护内存单例 `_config`

### 11.3 配置迁移现实意义

代码里保留了从：

- `google` → `gemini`
- 老 `provider.gemini/openai` 结构 → 新结构

的迁移逻辑。

这证明项目正在持续演进，文档不应再把旧版 provider 结构描述成“当前事实”，而应明确区分：

- 历史兼容字段
- 当前运行字段

---

## 12. Storage 与持久化策略

### 12.1 Session Store

`src/storage/sessionStore.ts` 是当前对话持久化核心。

它管理：

- session 的创建/查找
- message 顺序写入
- session 标题更新
- recent sessions 列表
- message 搜索

### 12.2 并发策略

写入使用 `withWriteRetry()`：

- 遇到 `database is locked` 时线性退避 + jitter
- 最多重试 3 次
- SQLite 配合 WAL 使用

这使 CLI、Telegram、Cron 多进程/多入口访问同一个数据库时仍能保持基本稳定。

### 12.3 DB Tool 与业务数据库

除了 `state.db` 外，业务上还通过 `db` tool 动态访问：

- `vocab.db`
- `learner.db`
- 其它技能定义的数据库

`db` tool 支持首次打开时自动扫描 skill `templates/` 下的 `<name>.sql` 进行 schema 初始化。

这个机制非常适合 skill 自带数据库模型。

---

## 13. 初始化流程分析

`src/commands/init.ts` 展示了 Anya 首次启动的真实引导逻辑。

初始化会：

1. 创建目录结构
2. 写默认 `config.json`
3. 复制 `config.schema.json`
4. 初始化 `USER.md` / `MEMORY.md`
5. 初始化 cron jobs
6. 初始化 `RULES.md`
7. 复制 bundled skills 到 `~/.anya/skills/.bundled`

这说明：

- 仓库不是直接在项目根目录跑数据
- 用户环境目录才是产品运行的核心状态空间

---

## 14. 当前架构的几个关键设计判断

### 14.1 优点

#### 统一核心，入口多态

CLI、Telegram、Cron 都复用同一个 Agent Core，这让行为一致性较高。

#### Skill 化而非业务硬编码

把 IELTS 逻辑放进 Skill 与数据库模板里，便于后续继续增加教育场景或其它垂类场景。

#### 本地优先持久化

用户对记忆、技能、日志、数据库拥有完全可迁移的本地状态。

#### Telegram 适配细节成熟

SessionAdapter 的串行队列、状态消息与内容去重机制做得比较扎实。

#### Cron 与会话联动

主动触达任务不是孤立系统，而是能回写会话上下文。

### 14.2 当前文档最容易误导的地方

旧文档中这些内容已经不再准确：

- “Gemini + OpenAI 双 provider 当前并行生效”
- “Prompt 直接注入 `data/ielts/profile/USER.md` 与 `MEMORY.md`”
- “只有 8 个 built-in tools”
- “项目仍以 Gemini 为主 provider”
- “命令层存在 `model` 命令”

这些都需要基于当前源码修正。

---

## 15. 建议的阅读顺序

如果新维护者要快速理解项目，建议按以下顺序看源码：

1. `bin/anya.ts`
2. `src/agent/Agent.ts`
3. `src/agent/promptBuilder.ts`
4. `src/tools/registry.ts`
5. `src/providers/openai.ts`
6. `src/storage/sessionStore.ts`
7. `src/adapters/telegram/TelegramAdapter.ts`
8. `src/adapters/telegram/SessionAdapter.ts`
9. `src/cron/scheduler.ts`
10. `src/skills/loader.ts`
11. `src/lib/paths.ts`

---

## 16. 总结

Anya 当前已经从“一个有 Gemini/OpenAI 描述的实验性 agent CLI”演进成：

- 一个以 `~/.anya/` 为中心的本地 agent runtime
- 一个以 `Agent.run()` 为统一执行核心的多入口代理系统
- 一个以 Tool Registry + Skill 文档 + SQLite 数据为支柱的可扩展平台
- 一个在 Telegram 学习场景下尤其成熟的个人教育型 agent 框架

如果后续继续演进，最值得重点关注的方向会是：

- Provider 抽象是否恢复真正多实现
- CLI adapter 是否也演进为与 Telegram 对称的平台抽象
- Skill 生态是否从 IELTS 扩大到更多个人工作流
- 记忆体系是否进一步从全局 memory 扩展到更细粒度 profile/context 模型

配套流程图请见：[`docs/architecture-diagrams.md`](./architecture-diagrams.md)

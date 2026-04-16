# Runtime Data Layout

本文档专门说明 `~/.anya/` 的运行时数据布局、各目录职责，以及数据库之间的分工。

实现来源以 `src/lib/paths.ts`、`src/storage/`、`src/tools/db.ts`、`src/commands/init.ts` 为准。

---

## 1. 总览

Anya 的所有运行态数据默认都放在：

- `~/.anya/`

如果设置了环境变量 `ANYA_HOME`，则会改用对应路径。

运行时目录完整关系如下：

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

---

## 2. 顶层文件与目录职责

### 2.1 `config.json`

主配置文件。

内容包括：

- `provider.model`
- Telegram 配置
- tools 开关
- shell 安全策略
- STT / TTS / Azure / Gemini 配置
- advanced 参数

这是运行时最重要的静态配置入口。

### 2.2 `config.schema.json`

配置 schema，用于：

- 编辑器补全
- 配置结构说明

不直接存业务数据。

### 2.3 `auth.json`

用于保存认证相关状态，当前主要服务于 OpenAI / Codex 登录态。

这是 provider 访问所需的本地授权状态文件。

---

## 3. `memories/`：全局记忆层

### 3.1 `memories/RULES.md`

Agent 操作规则文件。

作用：

- 进入 system prompt
- 约束 Agent 的行为方式
- 作为全局运行规则层

### 3.2 `memories/USER.md`

全局用户画像。

通常存放：

- 用户背景
- 偏好
- 学习目标
- 长期稳定信息

### 3.3 `memories/MEMORY.md`

全局 agent memory。

通常存放：

- 当前阶段结论
- 长期上下文摘要
- 教学或交互策略

### 3.4 为什么这些文件重要

`promptBuilder` 会直接把这些文件注入 system prompt。

所以它们属于：

- **高价值、低体量、强上下文影响** 的运行时数据

---

## 4. `skills/`：Skill 资产层

`skills/` 存放 Agent 可以使用的技能定义。

### 4.1 `.bundled/`

这是初始化时从仓库复制过去的内置技能。

例如：

- IELTS 单词 skill
- IELTS 口语/写作/阅读/听力 skill
- cron-briefing
- database skill

### 4.2 Skill 目录里常见内容

- `SKILL.md`
- `templates/*.md`
- `templates/*.sql`
- `references/*.md`
- `menu.json`

### 4.3 运行作用

Skill 本身不存用户状态，但会定义：

- 工作流
- 生成模板
- 数据库初始化 SQL
- 教学/执行规则

---

## 5. `cron/`：定时任务层

### 5.1 `cron/jobs.json`

定时任务定义文件。

每个 job 通常包含：

- `id`
- `name`
- `schedule`
- `prompt`
- `deliver_to`
- `enabled`

它决定 CronScheduler 要执行哪些任务。

### 5.2 `cron/history/`

定时任务执行历史。

通常按 job + timestamp 写入 JSON 记录，记录：

- jobId
- jobName
- executedAt
- toolCalls
- contentLength

用于追踪任务执行情况，但不是完整业务结果存储中心。

---

## 6. `data/`：核心持久化数据层

`data/` 是运行态最重要的业务数据目录。

它包含 5 类数据：

1. SQLite 数据库
2. IELTS 专项目录
3. 搜索缓存
4. 音频缓存
5. 图片缓存

---

## 7. `data/store/`：SQLite 数据库目录

这是最关键的数据目录之一。

所有数据库都放在：

- `~/.anya/data/store/`

### 7.1 `state.db`

系统级对话数据库。

主要职责：

- 保存 sessions
- 保存 messages
- 为 CLI / Telegram / Cron 提供统一会话历史
- 支持 sessions list / search

可理解为：

> Agent 的“对话事件总账本”

### 7.2 `vocab.db`

IELTS 词汇数据库。

主要职责：

- 存放单词主表
- 存放词汇学习状态
- 存放 spaced review 所需字段
- 存放 lookup / review / save / transfer 等事件

典型内容包括：

- word
- definition
- chinese
- ipa
- pos
- collocations
- example_en / example_cn
- audio_path
- mastery
- transfer_level
- lookup_count / review_count / success_count / fail_count

可理解为：

> IELTS 单词子系统的核心数据库

### 7.3 `learner.db`

IELTS 学习者数据库。

主要职责：

- 存放练习记录
- 存放错误样本
- 存放学习统计
- 存放题目/训练/评估相关结构化数据

可理解为：

> IELTS 学习进度与训练数据中心

### 7.4 其它数据库

通过 `db` tool，还可以按需创建其他 `<name>.db`。

规则是：

- 数据库名会映射到 `data/store/<name>.db`
- 首次创建时会尝试扫描 skill `templates/` 下的 `<name>.sql`
- 若找到则自动初始化 schema

这意味着数据库能力是 **skill 可扩展** 的。

---

## 8. `data/ielts/`：IELTS 专项目录

### 8.1 `data/ielts/profile/`

这是预留给 IELTS 专项 profile 数据的目录。

目前路径常量仍保留：

- `USER.md`
- `MEMORY.md`

但当前主 prompt 注入实际读取的是 `memories/USER.md` 和 `memories/MEMORY.md`。

因此这个目录更像：

- IELTS 域内的扩展资料目录
- 历史设计兼容位
- 可继续利用的垂类 profile 空间

### 8.2 `data/ielts/learn/`

用于 IELTS 学习过程中的附加文件或日志沉淀空间。

它不是当前主对话数据库，而更像业务学习过程侧的数据落点。

---

## 9. `data/search/`：搜索缓存

用于 `web_search` 的结果缓存。

目的：

- 降低重复搜索成本
- 减少外部 API 请求
- 提升重复查询响应速度

这是典型的可重建缓存，不属于核心真值数据。

---

## 10. `data/cache/`：通用缓存

这是一个泛用缓存目录，用于未来或其它模块放置临时缓存数据。

它与搜索缓存、音频缓存、图片缓存并列，但更通用。

---

## 11. `data/audio/`：音频数据

### 11.1 `data/audio/voice/`

保存从 Telegram 下载下来的用户语音。

主要用途：

- STT 转写
- pronunciation assessment
- 会话内复用原始音频路径

### 11.2 `data/audio/tts/`

保存生成的 TTS 音频。

主要用途：

- 单词学习音频缓存
- 语音回复缓存
- 复用已生成音频，避免重复生成

对 `words` 这类 skill 来说，这个目录尤其重要，因为 `audio_path` 会回写进数据库。

---

## 12. `data/images/`：图片数据

### 12.1 `data/images/received/`

存放用户发来的图片。

主要用途：

- vision 分析前的本地落盘
- 供后续工具链访问图像路径

### 12.2 `data/images/generated/`

存放模型生成的图片。

主要用途：

- `image_gen` 产物落盘
- 再通过 `tg` 工具发给 Telegram 用户

---

## 13. `logs/`：日志层

存放运行日志。

主要包括：

- gateway 运行日志
- agent / tool / provider 调用日志
- 错误日志

这部分用于：

- 调试
- 故障排查
- 运行审计

---

## 14. `run/`：进程状态层

用于保存后台服务 PID 等运行时状态文件。

主要服务于：

- `gateway start/stop/status`
- `cron start/stop`

它不保存业务数据，只保存当前进程控制信息。

---

## 15. 哪些数据是“真值”，哪些是“缓存”

### 真值数据

这些数据一旦丢失，会真正影响 Agent 的长期状态：

- `config.json`
- `auth.json`
- `memories/`
- `skills/`
- `cron/jobs.json`
- `data/store/state.db`
- `data/store/vocab.db`
- `data/store/learner.db`

### 可重建数据

这些目录更多是缓存或派生结果：

- `data/search/`
- `data/cache/`
- `data/audio/voice/`（部分场景可重建，部分不可）
- `data/audio/tts/`
- `data/images/received/`
- `data/images/generated/`
- `logs/`
- `cron/history/`

---

## 16. 从运行职责看三类数据库

可以把当前数据库职责概括成三层：

### 16.1 Agent Runtime DB

- `state.db`

负责：

- 会话
- 消息
- 对话历史

### 16.2 IELTS Vocabulary DB

- `vocab.db`

负责：

- 单词库存
- 熟练度
- review 计划
- 单词事件
- 音频路径

### 16.3 IELTS Learner Progress DB

- `learner.db`

负责：

- 学习记录
- 训练结果
- 错误与统计
- 更广义的 learner 状态

---

## 17. 对维护者最有用的理解方式

如果只记一句话，可以记成：

> `~/.anya/` 不是简单配置目录，而是整个 Anya 产品的本地运行时文件系统。

其中：

- `memories/` 负责高层上下文
- `skills/` 负责能力模板
- `data/store/*.db` 负责结构化真值数据
- `audio/` / `images/` / `search/` 负责媒体与缓存
- `logs/` / `run/` 负责运维与进程状态

---

## 18. 相关阅读

- [`README.md`](../README.md)
- [`architecture.md`](./architecture.md)
- [`architecture-diagrams.md`](./architecture-diagrams.md)

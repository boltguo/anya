# RFC: Pack 架构 — `@aouo/core` + Domain Packs

> 📌 **品牌迁移说明**：项目原名 `Anya`（取自《间谍过家家》角色），出于版权风险考量，开源前重命名。
> 命名约定：
> - **产品 / 品牌名**：`aouo`（短、独特、indie 风）
> - **域名**：`aouoai.com` ✅ + `aouo.ai` ✅（主入口走 `aouo.ai`，`aouoai.com` 301 重定向）
> - **npm scope**：`@aouo/*` ✅（已持有 npm 组织 `aouo`，直接发包）
> - **GitHub org**：`aouoai` ✅（已持有；`aouo` 已被人占）— 仓库地址形如 `github.com/aouoai/core`
> - **配置目录**：`~/.aouo/`
> - **Agent 角色名**：`aouo` 自身（产品 = 角色，无独立人格名）
>
> 本 RFC 中现存代码路径（如 `src/skills/bundled/...`）保持原样，等 Phase 1 重构时统一改名。

| Status | Draft v0.1 |
| --- | --- |
| Owner | aouos |
| Created | 2026-05-11 |
| Target v0.1 release | T+4 weeks（重构落地 + 开源就绪） |
| Relates to | [`docs/short-video-strategy.md`](short-video-strategy.md) — 内容策略；[`docs/launch-plan.md`](launch-plan.md) — 上线节奏 |

## 0. 一句话 thesis

> **把当前耦合的项目（原名 Anya）拆成 `@aouo/core`（agent 基础设施，0 业务）+ `@aouo/<domain>` packs（垂直领域知识 + skill 集），让"Domain Companion 是一种独立架构层"从论点变成可装可拆的工程实现。**

### 0.1 双层 framing

| 受众 | Framing | 用在哪 |
| --- | --- | --- |
| 学习者 | Domain Companion | Ep1、短视频、学习者主页 |
| 开发者 | OS for vertical AI agents | Ep2-8、YouTube、docs |

OS 对位映射：

| OS | aouo |
| --- | --- |
| Kernel | `@aouo/core` |
| Syscall | core API（`persist` / `chat` / `cron` / `skill_view` / `tool_call`） |
| 文件系统 | `~/.aouo/` + `study.db` |
| 进程 | session / skill 调用 |
| App | Pack |
| App 权限 | manifest 的 `capabilities` 声明 |
| 多任务 | 多 pack 并存按上下文激活 |
| 共享库 | core adapter + support skills |
| Home dir | `~/.aouo/`（SOUL / USER / MEMORY / 自建 skills） |
| App Store | pack 注册机制（v0.4+） |

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **彻底解耦 agent 主循环和英语 skill 系统**——agent 代码里出现 "english"、"vocab"、"CEFR" 等 domain 词条 = 设计失败
2. **定义清晰的 Pack Spec**——任何遵守 spec 的 pack 都能装上 core 立刻跑（菜单、定级、画像、练习闭环全工作）
3. **跨 pack 数据契约**——多 pack 共存时数据可聚合（如 ielts pack 装上自动汇入 english 画像；fitness pack 数据隔离）
4. **Fast-path / LLM-path 分离**——deterministic 的事（菜单 / i18n / 模板）不走 LLM，省 token 提响应
5. **开源就绪**——core 和 english pack 经过 spec 检验后可分别开源，作为 reference implementation

### 1.2 Non-Goals

- **不**做插件市场 / 远程下载（v0.1 只支持本地 npm 安装或目录 drop-in）
- **不**抽象到能跑任何 LLM provider（保持 OpenAI / Anthropic 兼容即可，不做 LiteLLM 层）
- **不**做 Web UI（v0.1 仍以 Telegram 为唯一 adapter；多 adapter 留 v0.2）
- **不**写企业级 migration runner（schema 版本管理用最朴素的 `schema.sql` + 启动校验，不上 Prisma / drizzle）
- **不**重写已有 27 个英语 skill 的内容——只搬位置、改导入路径

---

## 2. 当前状态分析

### 2.1 现有目录的耦合分布

| 路径 | 性质 | 目标归属 |
| --- | --- | --- |
| `src/agent/` | 主循环、上下文压缩、注册中心 | `@aouo/core` |
| `src/adapters/telegram/` | TG 协议适配 + skillMenu 加载 | `@aouo/core` |
| `src/providers/openai/` | LLM provider 抽象 | `@aouo/core` |
| `src/tools/persist.ts` | persist API + schema 校验 | `@aouo/core`（**schema 不内置 english**） |
| `src/tools/cron.ts` | cron 注册 + tick | `@aouo/core` |
| `src/tools/tg_msg.ts` (telegram.ts) | 统一发消息 tool | `@aouo/core` |
| `src/tools/memory.ts` `file.ts` `clarify.ts` `tts.ts` `webSearch.ts` `db.ts` `registry.ts` `skill.ts` | 通用工具 | `@aouo/core` |
| `src/tools/pronAssess.ts` | **Azure 发音评分** | `@aouo/english`（domain tool） |
| `src/storage/` `src/lib/` `src/config/` `src/commands/` | 基础设施 | `@aouo/core` |
| `src/domain/helpers.ts` | 通用工具 | `@aouo/core` |
| `src/domain/practice.ts` | `samples` 表 read/write | **拆**：API → core；english 专属字段 → english pack |
| `src/domain/profile.ts` `progress.ts` `session.ts` `vocabulary.ts` | 英语训练领域逻辑 | `@aouo/english`（domain logic） |
| `src/skills/bundled/english/*` | 27 个 skill | `@aouo/english` |
| `src/skills/bundled/support/data-contract/` | 当前是 english 专属 schema | `@aouo/english`（pack 自带 schema） |
| `src/skills/bundled/support/band-descriptors/` | CEFR / IELTS 描述 | `@aouo/english`（domain knowledge） |

### 2.2 已知耦合点（spike 阶段必须先点亮）

- `persist.ts` 现在硬编码了 `subcap_scores` / `errors[]` / `vocabulary` 等英语领域字段——必须改成 schema-aware
- `Agent.ts` 主循环是否引用了任何 english-specific 决策？需 grep `english` / `cefr` / `vocab`
- `domain/practice.ts` 的 `recentPractice` 函数被 listening-dictation 等 skill 直接调用——pack 内部访问 core 还是要做 API 中介？
- TG `skillMenu.ts` 当前扫描 `SKILLS_DIR`——重构后改为扫描 pack manifests
- `MEMORY.md` / `USER.md` / `SOUL.md` / `RULES.md` 这些 markdown state 文件位置：哪些属于 core、哪些属于 pack？暂定 `SOUL` / `RULES` 由 pack 提供（pack 决定 agent 人格），`MEMORY` / `USER` 是 core 管理但 schema 由 pack 注入

---

## 3. 架构总览

### 3.0 概念模型：Pack = Skill Bundle + Plugin

> **Domain Pack 不是"一组 skill"，也不是"一个 plugin"，而是两者的合体**——
> - **Skill Bundle 这一面**：pack 装着 N 个 SKILL.md（用户可触达的功能模块）
> - **Plugin 这一面**：pack 同时扩展 core 的运行时——自定义 tools / DB schema / fast-path 路由 / cron jobs / 自己的 MEMORY 和 USER 状态文件 / 自己的 i18n 文案

只有"两面齐全"才算一个完整 pack。只有 skill 而没有 schema + state 文件 → 是 plugin 缺了数据闭环；只有 plugin 扩展而没有 skill → 没用户面无意义。**这种 hybrid 的特征本身就是 Domain Companion 与通用 framework + plugin 系统的关键区别**——通用 framework 的 plugin 只能扩展能力，做不出"持久学习画像"。

### 3.1 分层

```
┌─────────────────────────────────────────────────────────────┐
│                       Application                            │
│       (用户跑的二进制 / Telegram bot 实例)                   │
└────────────────────────────┬────────────────────────────────┘
                             │ loads
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
┌───────▼────────┐   ┌──────▼────────┐    ┌──────▼────────┐
│  @aouo/english │   │ @aouo/ielts   │    │ @aouo/japanese│  ← Domain Packs
│  (27 skills)   │   │ (extends      │    │ (待开发)       │
│                │   │   english)    │    │                │
└───────┬────────┘   └──────┬────────┘    └──────┬────────┘
        │                    │                     │
        └────────────────────┼─────────────────────┘
                             │ depends on
                  ┌──────────▼──────────┐
                  │     @aouo/core      │  ← 0 业务逻辑
                  │  Agent runtime +    │
                  │  TG adapter + Tools │
                  │  + Persist API +    │
                  │  Pack loader        │
                  └─────────────────────┘
```

### 3.2 启动时序

```
1. App boot
2. core 启动 → 读 ~/.aouo/config.yml 拿到 enabled packs 列表
3. core 调 PackLoader：
   a. 解析每个 pack 的 pack.yml manifest
   b. 校验依赖（ielts depends_on english → english 必须在列表里）
   c. 跑 schema migrations（每个 pack 的 schema.sql）
   d. 注册 fast-path 路由（menu.json / i18n）
   e. 注册 skills 到 SkillRegistry
   f. 注册 domain-specific tools（如 pronAssess）
4. core 启动 TG adapter，开始接收消息
5. core 启动 cron tick（60s）
6. 用户消息到达 → SkillRouter 决定走哪个 skill → Agent.ts 主循环
```

### 3.3 仓库布局

**Pack = 纯文件夹**（markdown + sql + yaml），不发 npm。Core 是唯一的 npm 包 `aouo`。

```
github.com/aouoai/aouo                ← 单仓（Apache-2.0）
├── src/                              core runtime（TG adapter, tools, persist, cron, loader）
├── packs/                            ← 官方包内置（v0.1–v0.3 跟 core 同发版）
│   ├── english/
│   ├── notes/
│   └── x-poster/
├── docs/                             VitePress 站（→ aouo.ai）
│   ├── .vitepress/
│   ├── index.md                      首页 = 落地页
│   ├── getting-started/
│   ├── concepts/
│   ├── build-your-pack/
│   └── api/
├── examples/                         社区 pack 模板
├── package.json                      name: aouo, bin.aouo
├── README.md                         含 ## Acknowledgments to Hermes
├── LICENSE                           Apache-2.0
└── CONTRIBUTING.md

github.com/aouoai/aouo-pro            ← 私有，pro packs 文件夹（闭源）
└── packs/{english-pro, ielts, ...}/

github.com/aouoai/aouo-cloud          ← 私有，SaaS hosting（v0.5+）
```

**npm 发布**：单包 `aouo`（`npm install -g aouo`），binary 名也是 `aouo`。`@aouo` scope 保留给未来需要 native 模块的官方扩展（如 `@aouo/cli-plugin-headless-browser`）。

**社区 pack 分发**：作者 push 到自己的 GitHub 仓库，遵循 §4 的 pack 文件夹格式。安装：

```bash
aouo install aouoai/notes              # github shorthand
aouo install github.com/foo/my-pack    # 完整 URL
aouo install ./local-pack              # 本地路径，开发用
aouo list / aouo remove <name> / aouo update <name>
```

实现：tar 下载 + 解压到 `~/.aouo/packs/<name>/`，无 git，无 node_modules。

**版本管理**：core 一个 semver；官方 pack 跟 core 同发版（v0.1–v0.3），不单独打版本号。社区 pack 自管版本，pack.yaml 声明 `requires_core: ">=0.2.0"`，core 启动时校验。

---

## 4. Pack Spec v1

### 4.0 状态文件归属（关键设计修订）

> **Core 只管 SOUL + RULES，其他全是 pack 的事。**

| 文件 | 归属 | 性质 |
| --- | --- | --- |
| `SOUL.md` | **`@aouo/core`** | 唯一、universal——agent 的身份/人格底色（如"我是 <agent-name>，一个垂直陪伴 agent"，具体角色名待定，见 §17），所有 pack 共享，不可被 pack 覆盖 |
| `RULES.md` | **`@aouo/core`** | 唯一、universal——agent 的行为/工具调用规则（如"必须走 persist 不能直 SQL"），所有 pack 共享 |
| `USER.md` | **pack-owned**（可选） | pack 自己管理 domain-specific 用户信息（如 english pack 存"用户的英语目标 / 学习偏好 / 时间投入"） |
| `MEMORY.md` | **pack-owned**（可选） | pack 自己管理 domain-specific 学习画像（如 english pack 存 CEFR 评估、各维度分数） |

**关键含义**：
1. **如果一个 pack 不创建 USER/MEMORY，core 不会强制要求**——简单 pack（如纯工具型 pack）可以不存学习状态
2. **多 pack 共存时 USER/MEMORY 各管各的**——english pack 的 MEMORY.md 不污染 fitness pack 的状态
3. **Core 启动只需要 SOUL.md 和 RULES.md 就能跑**——它们定义了 agent 是谁、如何行事，与任何 domain 无关
4. **跨 pack 用户信息**（如时区、姓名、首选语言）走 `~/.aouo/config.yml` 由 core 持有，不进 USER.md

存储路径：
```
~/.aouo/
├── SOUL.md                          ← core-owned
├── RULES.md                         ← core-owned
├── config.yml                       ← core-owned（universal facts）
├── packs/                           ← pack 内容（markdown / sql / yaml）
│   ├── english/
│   │   ├── pack.yaml
│   │   ├── USER.md                  ← english pack-owned
│   │   ├── MEMORY.md                ← english pack-owned
│   │   └── skills/...
│   └── notes/
│       └── ...
└── data/                            ← pack 数据隔离区
    ├── english.db                   ← pack 名 = db 名
    └── notes.db
```

**数据隔离强约束**（v0.1）：

- 每个 pack 只能读写 `data/<self>.db`，db 名 = pack 名
- 禁止 `ATTACH DATABASE` 跨库；`persist` / `db` 工具内部按当前 active pack 自动选 db，pack 拿不到别 pack 的 db handle
- 跨 pack 数据 v0.2+ 再说：通过 pack.yaml `depends_on: [english]` 声明 → core 给只读权限

---

每个 domain pack 必须是一个目录或 npm 包，**根目录布局如下**：

```
@aouo/<pack-name>/
├── pack.yml              ← REQUIRED manifest
├── menu.json             ← REQUIRED（fast-path UI）
├── schema.sql            ← REQUIRED（domain 的表 / 字段扩展；空文件也行）
├── templates/
│   ├── USER.md.tmpl      ← OPTIONAL（pack 首次启用时的 USER.md 初值）
│   └── MEMORY.md.tmpl    ← OPTIONAL（pack 首次启用时的 MEMORY.md 初值）
├── i18n/
│   ├── zh-CN.json        ← REQUIRED（至少一种语言）
│   └── en-US.json        ← OPTIONAL
├── skills/
│   ├── onboarding/       ← REQUIRED（每个 pack 必须有一个 onboarding skill，类似 placement-quick）
│   │   └── SKILL.md
│   ├── aggregator/       ← REQUIRED（周期画像快照，类似 learner-state）
│   │   └── SKILL.md
│   ├── planner/          ← OPTIONAL（路由 skill；缺省由 core 提供）
│   ├── coach/            ← OPTIONAL
│   └── <其他实际 skill>/  ← N 个练习模块
├── tools/                ← OPTIONAL（domain-specific tools）
│   └── *.ts
└── tests/                ← 推荐但非强制
```

> 注：原 v0.0 草案里的 `soul.md` / `rules.md` 已**移出 pack 布局**——它们是 core-owned，pack 不应该提供。

### 4.1 `pack.yml` Manifest

```yaml
# pack.yaml
name: english
version: 1.0.0
display_name: "English Coach"
description: "听 / 说 / 读 / 写 / 词 5 维英语训练 pack"
requires_core: ">=0.1.0"

# Pack 提供的 skill 列表（必须和 skills/ 目录对应）
provided_skills:
  - onboarding           # 必备
  - aggregator           # 必备
  - planner              # 可选
  - listening-dictation
  - listening-shadowing
  - vocab-review

# Fast-path 路由
fast_paths:
  menu: ./menu.json
  i18n: ./i18n/zh-CN.json

# 数据库声明（pack 私有，db 名 = pack 名）
schema:
  file: ./schema.sql
  owned_tables:
    - samples
    - words
    - daily_plan
    - srs_reviews

# Persist 数据契约
persist_contract:
  skill_type_prefix: english.
  required_fields:
    - skill_type
    - session_id
    - response
  optional_fields:
    - subcap_scores
    - errors
    - metadata
  subcap_keys:
    - listening.gist
    - listening.detail
    - vocab.recall

# Cron 定时任务
cron_defaults:
  - id: morning-reading
    schedule: "0 8 * * *"
    skill: daily-article
    enabled_by_default: false
```

### 4.2 必备 Slot 详细规范

#### `menu.json`（fast-path UI 导航）

**Core 不走 LLM**，直接读路径。已有的 `src/adapters/telegram/skillMenu.ts` 重构为：

```typescript
// core/src/packs/fastpath.ts
function loadMenus(packs: Pack[]): MenuRegistry {
  const registry = new MenuRegistry();
  for (const pack of packs) {
    const menu = JSON.parse(readFileSync(pack.path + '/menu.json'));
    registry.merge(pack.name, menu);  // 合并多个 pack 菜单（ielts 装上后扩展 english 菜单）
  }
  return registry;
}
```

Pack 的 `menu.json` 已经是当前格式（`{ page: { text, buttons[][] } }`），无需改动。

#### `schema.sql`（DB migration）

启动时 core 校验：
- 在 `~/.aouo/data/<pack>.db` 上跑 `schema.sql`
- pack 声明的 `owned_tables` 必须在 `schema.sql` 里 CREATE
- 第一次运行：直接 `CREATE`；后续运行：core 用 SQLite `PRAGMA table_info` 比对，缺列就 ADD COLUMN

不上专业 migration 工具。**v0.1 不支持表结构破坏性变更**（drop column / rename column）——pack 改 schema 必须 bump major version + 走重建。

#### `skills/onboarding/`

每个 pack 必须有 onboarding。Core 在用户首次启用一个新 pack 时调度它，类似 placement-quick。

合约：
- Skill 必须输出一个 JSON 进 `user_profile` 表（通过 persist API）
- 字段名 pack 自定义，但必须包含 `<pack>_level` 或 `<pack>_initial_assessment`
- Core 在 menu 主页通过"该 pack 是否完成 onboarding"决定是否展示该 pack 的子菜单

#### `skills/aggregator/`

周期画像快照。Core 提供调度，pack 决定算法。

合约：
- 输入：core 给定时间窗口（默认 14 天）+ pack 的 sample rows
- 输出：写 `MEMORY.md` 的某一节（pack 自己命名，如 `## English Profile`），或写 `pack_profile` 表
- Core 每 N 天调一次（默认 7 天），或在每次 onboarding/重大事件后强制调一次

### 4.3 可选 Slot

| Slot | 缺省行为 |
| --- | --- |
| `skills/planner/` | Core 提供默认 LLM-routing：根据 `triggers.md` 配置在 menu 里查关键字 |
| `skills/coach/` | Core 不主动提供；如果 pack 有，启用 |
| `templates/USER.md.tmpl` / `templates/MEMORY.md.tmpl` | 缺省 pack 不创建 USER/MEMORY（不需要持久学习状态的 pack 可省） |

> **Pack 不带 JS**：所有 tool（包括 domain-specific 如 `pronAssess`）由 core 提供。pack 想用的 tool 必须先在 core 落地。

> SOUL.md / RULES.md **不再是 pack-level slot**——它们由 core 统一提供，所有 pack 必须遵守。

### 4.4 Skill 文件格式

保持现有 `SKILL.md` 格式不变（frontmatter + Markdown body）。新增一个 frontmatter 字段：

```markdown
---
name: listening-dictation
pack: english              # 新增：标识所属 pack
description: "..."
---
```

Core 加载时校验 `pack` 字段和当前 pack 名一致。Skill 之间通过 `pack:skill` 限定符引用（避免不同 pack 的同名 skill 冲突）。

### 4.5 Resolution Rules

#### 4.5.1 目录布局

```
~/.aouo/
├── SOUL.md                            core-owned
├── RULES.md                           core-owned
├── memory/
│   ├── USER.md                        global
│   └── MEMORY.md                      global
├── skills/                            用户自建 skill 池
│   └── <skill-name>/SKILL.md
├── packs/
│   ├── english/
│   │   ├── pack.yaml
│   │   ├── soul-additions.md          可选
│   │   ├── memory/MEMORY.md           pack-local
│   │   ├── skills/<skill>/SKILL.md
│   │   └── cache/
│   └── notes/...
└── data/
    ├── english.db                     pack 名 = db 名
    └── notes.db
```

#### 4.5.2 Skill 解析优先级

```
1. ~/.aouo/skills/<name>/                       用户自建（override pack）
2. ~/.aouo/packs/<active-pack>/skills/<name>/   当前 pack
3. core 内置 support skills
```

用户自建可完全 override pack 同名 skill。**v0.1 不支持跨 pack skill 调用**。

#### 4.5.3 Memory 写入 scope

| 内容 | 位置 | 读取范围 |
| --- | --- | --- |
| 用户身份 / 偏好 / 时区 / 母语 | `~/.aouo/memory/USER.md` | 所有 pack |
| Pack 学习状态 / 训练 history | `~/.aouo/packs/<pack>/memory/MEMORY.md` | 该 pack 独占 |
| Pack 临时 cache | `~/.aouo/packs/<pack>/cache/` | 该 pack |
| Pack 业务数据 | `~/.aouo/data/<pack>.db` | 该 pack 独占（禁 ATTACH） |

判定：换 pack 仍成立 → global；不成立 → pack-local。

#### 4.5.4 SOUL / RULES 注入顺序

```
~/.aouo/SOUL.md
  + packs/<active-pack>/soul-additions.md
~/.aouo/RULES.md
  + packs/<active-pack>/rules-additions.md
```

Pack 只可追加，不可覆盖。

---

## 5. Core API Surface

### 5.1 Persist API（pack 唯一允许的 DB 入口）

```typescript
// @aouo/core/persist
interface PersistAPI {
  // 写 sample 行（pack 通用）
  practice(payload: PracticePayload): Promise<{ sample_id: string }>;

  // 读最近练习（pack scoped — pack 只能读自己 pack 的 samples）
  recentPractice(opts: {
    pack: string;
    skill_type?: string;
    limit?: number;
  }): Promise<Sample[]>;

  // 读跨 pack 用户画像
  coachContext(opts: { days?: number; packs?: string[] }): Promise<CoachContext>;

  // 词汇相关（如果 pack 声明了 vocab 表）
  wordUpsert(payload: WordUpsertPayload): Promise<void>;
  wordReview(payload: WordReviewPayload): Promise<void>;
  dueWords(opts: { limit?: number }): Promise<Word[]>;

  // pack 自定义查询（escape hatch — 走 schema 校验后的安全 SQL）
  query(opts: { pack: string; query_name: string; params: any }): Promise<any>;
}
```

**重要**：persist API 内部根据调用方 pack 的 manifest 做 **schema 校验** —— 比如 english pack 调 `practice` 时，`skill_type` 必须以 `english.` 开头；`errors[].key` 必须在 english 的 `error-keys.md` 白名单内。

### 5.2 Tool Registry

```typescript
interface ToolRegistry {
  register(tool: Tool): void;
  resolve(name: string): Tool | undefined;
  list(): Tool[];
}
```

Core 一次性注册所有 tools（`tg_msg`, `persist`, `cron`, `memory`, `file`, `tts`, `webSearch`, `clarify`, `skill`, 以及 domain-specific 如 `pronAssess`）。Pack 不带 JS，不自注册 tool。

### 5.3 Cron API

```typescript
interface CronAPI {
  register(opts: {
    pack: string;
    id: string;
    schedule: string;      // cron 表达式
    handler: () => Promise<void>;
  }): void;

  list(pack?: string): CronJob[];
  enable(id: string): void;
  disable(id: string): void;
}
```

Pack 启动时注册自己的 cron jobs；用户可在 menu 里启用 / 禁用。

### 5.4 Memory API（修订后）

```typescript
interface MemoryAPI {
  // === Core-owned，所有 pack 共享，pack 只读 ===
  readSoul(): string;
  readRules(): string;
  readConfig(): UserConfig;        // 通用 user facts: name / timezone / locale

  // === Pack-owned，scoped 到调用方 pack ===
  // pack 只能读写自己目录下的 USER.md / MEMORY.md
  readUser(pack: string): string | null;       // null = pack 没创建该文件
  writeUser(pack: string, content: string): Promise<void>;

  readMemory(pack: string): string | null;
  writeMemory(pack: string, content: string): Promise<void>;

  // 更新 MEMORY.md 某一节（保留 section 边界）
  updateMemorySection(pack: string, section: string, content: string): Promise<void>;
}
```

**语义**：
- `SOUL.md` / `RULES.md` 是 **core-owned，universal，只读**——pack 加载时拼进 system prompt，pack 自己不能改
- `USER.md` / `MEMORY.md` 是 **pack-owned，per-pack scoped**——存在 `~/.aouo/packs/<pack>/` 下；pack 第一次启用时可以从 `templates/USER.md.tmpl` 初始化，但**不创建也合法**
- 跨 pack 用户事实（姓名/时区/首选语言）走 `~/.aouo/config.yml`，core 持有，所有 pack 只读

**Core 启动最小依赖**：
- ✅ 必须：`SOUL.md` + `RULES.md` + `config.yml`
- ❌ 不必须：任何 pack 的 USER/MEMORY（pack 决定是否需要）

这意味着——**core 本身不知道"用户在学英语"，它只知道"我是 <agent-name>，要遵守这些规则"**。学习这件事完全是 pack 的语义。

### 5.5 Pack Loader 接口

```typescript
interface PackLoader {
  scan(dir: string): PackManifest[];
  validate(manifest: PackManifest): ValidationResult;
  load(pack: PackManifest): Promise<LoadedPack>;
  unload(pack: string): Promise<void>;
}
```

### 5.6 Capability Model

#### 5.6.1 Capability 清单（v0.1）

| Capability | 含义 | 典型宿主 |
| --- | --- | --- |
| `chat` | chat adapter（TG / Lark / Web） | 全部 |
| `cron` | 定时回调 | Server / 长进程 |
| `browser` | Playwright + 登录态 Chrome | 桌面 |
| `browser-headless` | Headless Chromium，无登录态 | Server / SaaS |
| `clipboard` | 系统剪贴板 | 桌面 |
| `imap` | IMAP 邮件 | 全部 |
| `fs-local` | 宿主任意目录 | 自部署 only |
| `notify-os` | 系统通知 | 桌面 |
| `audio-record` | 录音 | 桌面 / 移动 |

Core 维护 registry，pack 不可私自扩展，要加先 PR core spec。

#### 5.6.2 Manifest 声明

```yaml
name: "@aouo/x-poster"
capabilities:
  required: [chat]
  optional: [browser, clipboard]

skills:
  - x-draft-thread:
      requires: [chat]
  - x-engagement-review:
      requires: [browser]
      fallback: x-engagement-import
  - x-auto-copy:
      requires: [clipboard]
```

#### 5.6.3 启动时序

```
1. Host 探测自身 capability 集
2. Pack load 比对 required：缺则拒装
3. 每个 skill 检查 requires：满足 → 注册；否则 fallback；都没 → 不注册
4. 菜单 = host capability ∩ pack skill
```

#### 5.6.4 部署矩阵（X pack）

| 部署 | capability | 表现 |
| --- | --- | --- |
| Mac/Win + 登录 Chrome | chat+browser+clipboard | 满血 |
| Linux 桌面 + 登录 Chrome | 同上 | 满血 |
| Linux VPS | chat+cron+browser-headless | Chat-relay |
| SaaS（多租户） | chat+cron | Chat-relay |
| 手机 TG | chat | Chat-relay |

#### 5.6.5 安全模型

- Manifest capability = 最大权限上限
- 安装时弹一次确认；拒绝 = host 视角下该 capability 不存在
- Pack 运行时由 core enforce

---

## 6. Fast-path Dispatcher（关键设计）

### 6.1 原则

> **Deterministic 的事走 fast-path，creative 的事走 LLM。**

Pack manifest 的 `fast_paths` 字段声明哪些路径不走 LLM。Core 启动时把这些路径注册到 dispatcher，触发时直接命中：

| 类型 | 触发 | 处理 |
| --- | --- | --- |
| Menu 按钮 | TG callback `nav:<page>` | core 读 menu.json，直接返回页面 keyboard，**0 LLM 调用** |
| i18n 模板 | skill 请求 `t('vocab.intro')` | core 读 i18n json 返回字符串 |
| 静态命令 | 用户发 `/help` `/status` | core 路由到固定 handler |

### 6.2 当前节省估算

主菜单导航现在估计每次还在走 LLM（agent 主循环触发 `tg_msg`）——重构后这块直接 short-circuit，**主菜单导航零 LLM 成本**。

按高活跃用户每天 20 次菜单跳转、每次约 800 tokens 估算，单用户日节省 16K tokens。低估也有 5–8K。

---

## 7. Pack 数据隔离规则

### 7.1 一 pack 一 db

```
~/.aouo/data/
├── english.db
├── notes.db
└── x-poster.db
```

| 规则 | 说明 |
| --- | --- |
| db 名 | 等于 pack name |
| 创建 | core 启动 PackLoader 时按 pack 的 `schema.sql` 创建 |
| 访问 | `persist` / `db` 工具按当前 active pack 自动选 db，pack 拿不到别 db handle |
| ATTACH | 禁用，core 在工具层拦截 |
| 共享数据 | 无。需要跨 pack 的用户级数据（时区、母语、姓名）走 `~/.aouo/config.yml` 或 `~/.aouo/memory/USER.md` |

### 7.2 跨 pack（v0.2+，目前不实现）

未来语义：pack.yaml `depends_on: [english]` → core 给 ielts 一个 english.db 的**只读** connection。继承画像（`extends`）/ 并列（`parallel`）的细节等真有第二个语言 pack 时再定。

v0.1 不写代码，留 hook。

---

## 8. 迁移计划

### Phase 0 — Spike（Week 1，关键验证）

目标：**回答"这事能不能干"，不写最终代码**。

任务：
1. **`agent.ts` grep 审计**：列出主循环里所有 domain 词条（english / cefr / vocab / band 等）的引用点
2. **`persist.ts` schema 审计**：列出哪些字段是 english 硬编码，画一张 "硬编码 vs 通用" 对照表
3. **Menu 解耦原型**：把 `skillMenu.ts` 改成接受 pack 数组而不是扫目录；本地复刻一个 english pack 目录
4. **Persist 改 schema-aware 试点**：persist API 接受一个 `pack` 参数，根据 pack manifest 校验字段
5. **写 spike 报告**：列出哪些预期外的耦合（一定会有），重新估算 Phase 1-3 的工时

**Deliverable**：`docs/pack-spike-report.md`，800–1500 字，回答：
- 主循环是否真的零 domain 知识？还差什么？
- Persist 改造的最大风险点？
- 4 周计划现实吗？需要延长到 6 周？

### Phase 1 — Core 抽离（Week 2）

任务：
1. 单仓结构定型：
   ```
   aouo/                       ← 项目重命名（见 §17 Rebrand TODO）
   ├── src/                    ← core runtime
   ├── packs/
   │   └── english/            ← 文件夹，无 package.json
   └── package.json            ← name: aouo
   ```
2. 把 §2.1 表里 "core" 行的代码集中到 `src/`
3. domain tool（如 `pronAssess`）留在 core 的 `src/tools/`
4. Persist API schema-aware 改造（按 active pack 路由到 `data/<pack>.db`）
5. Pack Loader v0（扫 `packs/<name>/`，读 `pack.yaml`）
6. 跑通：core 无任何 pack 时能启动（只有 TG echo bot 能力）

**Deliverable**：core 能独立启动；hello-world 文件夹 pack 验证 loader

### Phase 2 — English Pack 抽离（Week 3）

任务：
1. 把 §2.1 表里所有 "english pack" 行的 markdown / sql / yaml 搬到 `packs/english/`
2. 写 `packs/english/pack.yaml`、`packs/english/schema.sql`（从当前 `templates/study.sql` 提取）
3. 改 27 个 SKILL.md 加 `pack: english` frontmatter
4. 改 menu.json 适配新 pack-scoped 路由
5. 跑通：core + english 完整复刻当前功能
6. **回归测试**：用真实使用 5 个场景（cron / freetalk / SRS / 阅读 / 日记）验证行为不变

**Deliverable**：当前所有功能在新架构下零退化

### Phase 3 — 第二 pack + 安装命令（Week 4）

任务：
1. 实现 `aouo install <github>` / `list` / `remove` / `update`：tar 下载 + 解压到 `~/.aouo/packs/`
2. **第二 pack 候选**：`notes` PoC（最便宜，纯长记忆 demo），4–6 个 skill
3. 写开源就绪文档：`README.md` / `CONTRIBUTING.md` / `LICENSE`（Apache-2.0）
4. 把 pack-architecture.md 升级为 v1.0 Spec

**Deliverable**：v0.1 release candidate；core + english + notes 准备开源；`aouo install` 命令跑通

---

## 9. Spike Week 任务清单（Phase 0 详化）

> 这是开工第一天就要按此跑的清单。一项一项打勾，每项 0.5–1 天。

- [ ] 在 `anya/` 根目录跑 `grep -rni "english\|cefr\|ielts\|vocab\|band" src/agent/ src/adapters/ src/providers/ src/tools/ src/storage/ src/lib/ src/config/ src/commands/` —— 列出所有非 pack 目录里的 domain 词条
- [ ] 把上一步结果按"必须删 / 改成 generic / 接受残留"三档分类，写进 spike report
- [ ] `grep` 找出所有从 skill 里直接 import `src/domain/*` 的位置；判断每个调用是否能走 persist API 中介
- [ ] `persist.ts` 列出所有 action（practice / recent_practice / word_upsert 等）和硬编码字段，标注哪些是 english-specific
- [ ] 写一个 `pack.yml` parser 原型（用 yaml 库 + Zod 校验），跑通对 `english/pack.yml`（你先手写一份）的解析
- [ ] 在 `src/adapters/telegram/skillMenu.ts` 添加 `loadFromPacks(packs: PackManifest[])` 函数，跑通"只读 1 个 pack 的 menu.json"
- [ ] 用 `agent.ts` 跑一遍完整对话 ，确认主循环代码确实零 domain 知识（如有不确定的地方记进 spike report）
- [ ] 写 `docs/pack-spike-report.md`：结论是 "go" / "extend timeline to 6 weeks" / "abandon"

---

## 10. Pack Ecosystem Roadmap（规划中的 pack 路线图）

### 10.1 产品哲学

> **"我想干什么，那就装什么包。"**
>
> Core 是不变的基础设施；每个垂直领域用一个独立 pack 实现。
> 想学英语 → 装 english pack；想健身 → 装 fitness pack；想记账 → 装 finance pack。
> 多个 pack 共存时数据按 pack 隔离，画像互不污染（除非声明 `depends_on` 继承关系）。

Pack 架构落地后，按"个人想干什么 → 装什么包"的逻辑横向扩展。下面是前 3 个 pack 的具体设计 + 候选池——同时也是 Pack Spec v1 在不同 domain 跑通的实证清单。

### 10.2 v0.1 — `@aouo/english`（已存在，重构中）

当前 27 skill 的英语训练包，作为重构后 Pack Spec 的 reference implementation。详见 §2.1 / §8 Phase 2。

### 10.3 v0.2 — `@aouo/fitness`（健身陪伴）

**为什么是第二个**：与 english 差异**最大**的 stress-test 标的——无 ASR/TTS 核心需求、无 SRS、schema 完全不同。如果 Pack Spec 在它上面跑得通，spec 的通用性就实证了。

**五要素映射**：

| 要素 | English 实现 | Fitness 实现 |
| --- | --- | --- |
| 长记忆 | CEFR + 错题归类 | 训练历史 + 体测进度 + 受伤记录 |
| 主动触达 | 早 8 点早读 cron | 训练日早 7 点提醒 + 训练后记录 nudge |
| 多 skill 体系 | 27 skill 听说读写词 | 训练计划 / 动作 / 营养 / 复盘 / 拉伸 |
| 数据闭环 | samples + subcap_scores | 训练记录 + RM 估算 + 进度曲线 |
| 内置评估 | placement-quick → CEFR 子带 | 体测 → 五维体能图 + 1RM 基准 |

**核心 skill 列表（草案 8–10 个）**：

| Skill | 必备 / 可选 | 作用 |
| --- | --- | --- |
| `onboarding-body-check` | 必备 | 体测 + 1RM 估算 + 受伤史 + 目标设定 |
| `aggregator-progress-report` | 必备 | 月度进步报告（力量曲线 / 容量 / PR） |
| `workout-log` | 主力 | 训练记录（语音口报或快捷按钮） |
| `plan-generator` | 主力 | 周期化训练计划（力量 / 增肌 / 减脂 / 维持） |
| `exercise-coach` | 主力 | 动作示范 + 标准纠正 + 替代动作 |
| `nutrition-log` | 主力 | 饮食记录 + 蛋白质 / 热量监控 |
| `recovery-tracker` | 辅助 | 睡眠 / 酸痛 / HRV 自评 |
| `mobility-drill` | 辅助 | 拉伸 / 活动度训练 |
| `pr-celebration` | 辅助 | PR 自动检测 + 庆祝（情绪价值） |
| `injury-care` | 辅助 | 疼痛追踪 + 计划自动调整 |

**Schema 草案**：

```sql
workouts(id, date, type, duration_min, perceived_effort, note)
sets(workout_id, exercise_id, weight_kg, reps, rpe, set_order)
body_metrics(date, weight_kg, body_fat_pct, measurements_json)
prs(exercise_id, weight_kg, reps, date, workout_id)
exercises(id, name, category, modality, video_url)
plans(id, start_date, type, weekly_split_json)
```

**Cron defaults**：
- 训练日早 7 点提醒（根据 `plan-generator` 动态排期）
- 训练后 30 min 记录 nudge
- 周日 20 点 weekly review
- 月末 progress report

**Stress-test 价值**：
1. **完全无 voice 需求** → 验证 core 在 voice-light pack 下稳定
2. **无 SRS** → 验证 SRS 是真的可选（不是 spec 必备）
3. **Schema 跨 domain** → 验证 persist API 真的 schema-agnostic
4. **Placement concept 不同**（CEFR 是认知，1RM 是体能） → 验证 placement 抽象的普适性

### 10.4 v0.3 — `@aouo/finance`（财务记账陪伴）

**为什么是第三个**：商业价值最高的 stress-test。受众付费意愿强（财务管理是经典 SaaS 品类），数据敏感性反而是"本地 / 离线"卖点。Cron-heavy + schema-dense → 验证 core 在数据密集型 pack 下的稳定性。

**五要素映射**：

| 要素 | Finance 实现 |
| --- | --- |
| 长记忆 | 多月支出 trend + 收入流稳定性 + 净值曲线 |
| 主动触达 | 晚 22 点记账提醒 + 周日复盘 + 月初净值快照 |
| 多 skill 体系 | 记账 / 预算 / 投资 / 净值 / 债务 / 税务 |
| 数据闭环 | 交易入库 → 月度 trend → 下月预算建议 |
| 内置评估 | 财务体检 → 储蓄率 / 紧急金 / 投资比例评分 |

**核心 skill 列表**：

| Skill | 必备 / 可选 | 作用 |
| --- | --- | --- |
| `onboarding-financial-checkup` | 必备 | 财务体检（收入 / 支出大类 / 储蓄 / 债务 / 风险偏好） |
| `aggregator-monthly-review` | 必备 | 月度财务报告（净值变化 / 储蓄率 / 类别 trend） |
| `quick-entry` | 主力 | 快速记账（语音 / 文字 → 自动归类） |
| `category-coach` | 主力 | 消费类别合理性辅导 |
| `budget-tracker` | 主力 | 预算 vs 实际 + 超支预警 |
| `savings-review` | 辅助 | 储蓄率周报 |
| `investment-log` | 主力 | 投资记录 + 持仓 + 收益追踪 |
| `net-worth-snapshot` | 辅助 | 每月净值快照 |
| `debt-tracker` | 辅助 | 信用卡 / 贷款监控 |
| `tax-season-prep` | 辅助 | 年终税务提醒（按用户地区） |

**Schema 草案**：

```sql
transactions(id, date, amount, category_id, account_id, note)
accounts(id, name, type, balance, currency)
categories(id, name, parent_id, type)  -- type: income / expense / transfer
budgets(category_id, amount, period_type, period_start)
investments(id, asset_name, quantity, cost_basis, current_value, updated_at)
net_worth_snapshots(date, total, breakdown_json)
debts(id, name, balance, interest_rate, min_payment, due_date)
```

**Cron defaults**：
- 每日 22 点记账 nudge（缺记一天就推）
- 每周日 21 点 weekly review
- 每月 1 日 09 点净值快照 + 月度报告

**Stress-test 价值**：
1. **数据敏感** → 验证 pack 隔离 + 本地优先存储
2. **Cron-heavy** → 验证多 cron 协同（日 / 周 / 月）
3. **数据密集**（每天 5–20 条 transaction） → 验证 persist API 写入吞吐
4. **商业化路径明确** → 验证 pro pack 模式：可推 `finance-pro` 含税务 / 多账户报表 / 投资分析

### 10.5 候选 pack 池（v0.4+，待优先级排序）

未来可能但未确定的 pack：

| Pack | 一句话定位 | Stress-test 价值 | 实施难度 |
| --- | --- | --- | --- |
| `@aouo/coding` | 算法练习 + code review + 错题间隔复习 | 高（X 开发者受众直接转化 + 天然 dogfood） | 中 |
| `@aouo/notes` | 笔记捕获（gist / 文章 / 摘录）+ AI 自动分类 + RAG Q&A + 周综合；含读书笔记 source_type | 高（纯长记忆 demo + 通用知识捕获，单 pack 投入产出比最高） | 低 |
| `@aouo/journal` | 日记 + AI 提问 + 月/年回顾（偏私人/情绪，与 notes 互补） | 中 | 低 |
| `@aouo/japanese` | 日语学习（复用 english 结构） | 中（验证 pack 模板复制） | 中 |
| `@aouo/sleep` | 睡眠习惯 + 早起打卡 + 优化建议 | 中（cron-only domain 极端测试） | 低 |
| `@aouo/habit` | 通用习惯追踪，可被其他 pack 依赖 | 中（验证 pack-as-dependency） | 低 |
| `@aouo/job-hunt` | 简历迭代 + 面试练习 + 投递追踪 | 中（依赖 english pack，验证跨 pack 调用） | 中 |
| `@aouo/founder` | solo founder OKR + 留存 + 实验追踪 | 中（自吃狗粮 + indie hacker 受众） | 中 |
| `@aouo/dating` | 约会复盘 + 社交焦虑 reframe | 中（话题边缘 = 内容传播） | 中 |
| `@aouo/parenting` | 育儿日记 + 发育里程碑追踪 | 中（长尾大盘） | 高（合规风险） |
| `@aouo/cooking` | 食谱推荐 + 食材清单 + 营养联动 fitness | 低（缺持续陪伴特征） | 中 |
| `@aouo/cto-coach` | 创业陪伴 / 决策辅导 / 周复盘 | 中（与 founder 重叠，可合并） | 高 |
| `@aouo/x-poster` | X 发推草稿陪伴 | 高（验证 capability 降级 + 外部 effector） | 中 |

**v0.4+ 推荐顺序**：`coding` → `notes` → `journal`。前 3 个 official pack（含 english）跑通"复制粘贴开发模式"后再上新垂类。

每个候选 pack 进入 roadmap 前必须通过 §10.6 sanity check。

#### 10.5.1 `@aouo/x-poster` 草案

**功能**：mirror 用户历史推文风格，每天早 9 推 N 条草稿到 chat，用户挑一条复制发出。Browser scrape 历史 + 读 engagement，无 browser 时走 archive 导入 + 用户手动同步 engagement。

**五要素映射**：

| 要素 | 实现 |
| --- | --- |
| 长记忆 | `x_posts` 表 → EMA 风格画像 |
| 主动触达 | Cron：早 9 推 N 条草稿 |
| 多 skill | style-mirror / draft-thread / reply-suggest / engagement-review |
| 数据闭环 | 用户选了哪条 + engagement → 反喂 style EMA |
| 内置评估 | 草稿 quality score（topic fit / tone / hashtag） |

**Skill 列表**：

| Skill | Capability |
| --- | --- |
| `x-style-mirror` | `chat` or `imap` |
| `x-draft-thread` | `chat` |
| `x-reply-suggest` | `chat` |
| `x-engagement-review` | `browser`，fallback `x-engagement-import` |
| `x-auto-copy` | `clipboard` |

**Schema**：

```sql
x_posts(id, posted_at, text, kind, likes, replies, reposts, impressions)
x_drafts(id, generated_at, text, kind, score, picked, sent_to_chat_at)
x_persona(updated_at, voice_summary, taboo_list_json, topic_map_json, style_ema_json)
```

**Ship 模式**：draft-only。README / 网站 footer 写：

> `@aouo/x-poster` ships in **draft-only mode** by default. The pack does **not**, and the official repository does **not support, document, or accept PRs that enable** automated publishing to X. Users who modify their local installation to bypass this default do so entirely at their own risk and are solely responsible for compliance with X's terms of service.

### 10.6 Pack 选型心法（给自己 + 未来社区）

> 候选 pack 必须答这 5 题才能进 roadmap：

1. **能不能 daily dogfood？** 一周不用就忘 = 不是 Companion，是工具
2. **五要素是不是都成立？** 缺一就掉到浅层 AI 应用层
3. **数据闭环能否真的驱动行为？** 写完就完的数据库不是闭环，是日志
4. **领域知识够深吗？** SKILL.md 写不出 8–10 个细分场景的领域不够"垂直"
5. **跑 12 个月还想做吗？** Companion 护城河靠时间堆，三分钟热度的 domain 不要碰

### 10.7 与 short-video-strategy.md 的对接

每 ship 一个新 pack 都是 thesis 实证素材：

| 版本 | Pack | 视频素材 |
| --- | --- | --- |
| v0.1 | english | ep1 Flagship + ep2–7 架构拆解 |
| v0.2 | fitness | 单期 6–8min B 站："我把同一套架构搬到了健身——重构日记 + spec 验证" |
| v0.3 | finance | 单期 6–8min："第三个垂直 domain 上线——证明 thesis 不止两个数据点" |
| v0.4+ | 看反馈 | 每个新 pack 都是抖音 30s 切片素材 |

**关键叙事**：每加一个 pack，§1.3 护城河论证就被验证一次。"我用三个完全不同的领域跑通了同一套 spec" 比 "我做了个英语 app" 强 10 倍。

---

## 11. Open Questions

1. ~~**MEMORY.md 多 pack 共存**~~ → **已决议**（§4.0）：每个 pack 自己一份 `~/.aouo/packs/<pack>/MEMORY.md`，core 不持有；不需要状态的 pack 可以不创建
2. **Cron 互斥**：english 早 8 点早读 + fitness 早 8 点活动提醒——是合并发还是各发各的？v0.1 各发各的（用户自己处理），v0.2 加冲突检测
3. **Skill 跨 pack 调用**：english 的 `coach` skill 能不能调 `fitness:learner-state`？v0.1 不允许（pack 隔离），v0.2 再说
4. **测试基础设施**：spike 期间是否同时铺单测？v0.1 倾向"先重构通过手测，单测留 v0.2"——但 persist API 的 schema 校验必须有单测
5. **配置文件格式**：pack.yml 用 YAML 还是 TOML？YAML 更易读但有空格陷阱；倾向 YAML + 严格 Zod 校验
6. **English pack 是否真要拆 IELTS 子 pack**：还是直接做"English with IELTS mode"开关？v0.1 用 `@aouo/ielts depends_on english` 验证 pack 间继承机制 ——后续可以再调整

---

## 12. Out of Scope（v0.1 明确不做）

- Multi-language UI（v0.1 只支持 zh-CN + en-US）
- Pack 远程下载 / 插件市场
- Web UI / 移动端 adapter
- 多 LLM provider 抽象层（保持 OpenAI / Anthropic 即可）
- 企业级 migration runner（破坏性 schema 变更不支持）
- Pack 沙箱 / 权限控制（v0.1 信任所有本地 pack）
- 自动化 CI / 单元测试覆盖率门禁

---

## 13. 时间表汇总

| 周 | Phase | 关键产出 | Go/No-Go 决策点 |
| --- | --- | --- | --- |
| W1 | Phase 0 Spike | `pack-spike-report.md` | spike 结论决定是否继续 |
| W2 | Phase 1 Core | `@aouo/core` 可独立启动 | core 跑通 hello-world pack |
| W3 | Phase 2 English | core + english 复刻当前所有功能 | 5 场景回归测试通过 |
| W4 | Phase 3 Validate | ielts PoC + 开源就绪文档 | v0.1 RC 可发布 |

---

## 14. 与 short-video-strategy.md 的接口

- §1.3 护城河论证 → 用本 RFC 的 §4 Pack Spec + §7 数据契约作为代码支撑，不再是"空谈"
- §1.4 多 domain 复用 → 用 §8 Phase 3 的 ielts pack 作为第一份实证
- §8 流量承接 → 重构期间用"重构日记"系列承接，4 周后切回 GitHub Star CTA
- 全系列 ep1 录制时间表 → 推迟到 Phase 2 结束（W3 末），用干净架构当核心叙事

---

## 15. References

- 现有数据契约：[`src/skills/bundled/support/data-contract/SKILL.md`](../src/skills/bundled/support/data-contract/SKILL.md)
- 现有 menu 加载逻辑：[`src/adapters/telegram/skillMenu.ts`](../src/adapters/telegram/skillMenu.ts)
- 现有 Agent 主循环：[`src/agent/Agent.ts`](../src/agent/Agent.ts)
- 短视频策略：[`docs/short-video-strategy.md`](short-video-strategy.md)
- Token 优化分析：[`docs/token_optimization_analysis.md`](token_optimization_analysis.md)
- 架构图：[`docs/architecture-diagrams.md`](architecture-diagrams.md)

---

## 16. Rebrand TODO（Anya → aouo 重命名清单）

> 出于版权风险（Anya 是《间谍过家家》角色名），项目重命名为 `aouo`。下面是必须完成的迁移清单，**应该在 Phase 1 重构同期处理**（避免 npm 发布后再改名）。

### 16.1 命名敲定

- [x] 产品 / 品牌名：`aouo`
- [x] 主域名：`aouo.ai` ✅ + `aouoai.com` ✅（`aouoai.com` → `aouo.ai` 301 重定向）
- [x] npm scope：`@aouo` ✅（已持有 npm 组织 `aouo`）
- [x] GitHub org：`aouoai` ✅（已持有；`aouo` 被占用，不可得）— mismatch 可接受，参见 Anthropic / LangChain 同类做法
- [x] Agent 角色名：`aouo` 自身 ✅（产品 = 角色，无独立人格名；SOUL 写简版通用助手，pack 内可视需要引入子角色）

### 16.2 Handle 抢占（详见 [`launch-plan.md` §2](launch-plan.md)）

- [x] **Twitter / X**：`@aouo_ai` ✅（`@aouoai` 被占，落定下划线版本对齐域名）
- [x] GitHub：`github.com/aouoai` ✅
- [x] npm scope：`@aouo` ✅
- [x] 抖音 / 视频号 / 小红书 / B 站 / TikTok / YouTube：`aouoai` ✅
- [ ] 邮箱：`hello@aouo.ai`（购域名后用 Cloudflare Email Routing 配置）

### 16.3 代码内重命名（Phase 1 同期）

- [ ] 项目根目录：`anya/` → `aouo/`
- [ ] `package.json` name 字段
- [ ] `~/.anya/` 配置路径 → `~/.aouo/`
- [ ] SOUL.md：把 "Anya" 角色名换成新角色名
- [ ] RULES.md：检查是否有 "Anya" 引用
- [ ] 所有 SKILL.md：检查是否有 "Anya" 引用（user-facing 文案里有 "Anya 帮你..." 之类的）
- [ ] 所有 i18n 文案：替换 "Anya" → 新角色名
- [ ] 数据库表名 / 字段：检查有无 anya 前缀（应该没有，但 grep 一下）
- [ ] 日志 namespace：`agentLogger` 的 service name
- [ ] CLI binary 名：从 `anya` 改成 `aouo`

### 16.4 文档与素材

- [ ] [`docs/pack-architecture.md`](pack-architecture.md) — ✅ 已更新（本文件）
- [ ] [`docs/short-video-strategy.md`](short-video-strategy.md) — 待更新
- [ ] [`docs/architecture-diagrams.md`](architecture-diagrams.md) — 检查图标 / 名字
- [ ] [`docs/qa.md`](qa.md) — 检查
- [ ] README（如果有）

### 16.5 风险与时机

- **重命名 = 失去现存粉丝/印象 = 0**（因为现在没粉丝，正是改名零成本时刻）
- **拖到开源后改名 = 灾难**：丢 backlinks / 丢 Star 历史 / 媒体记不住
- **现在改 = 0 成本最佳窗口**

---

## 17. 决策记录

| 决策 | 选择 | 替代方案 | 理由 |
| --- | --- | --- | --- |
| 单仓库 vs 多仓库 | 单仓 + 内置官方 packs | 多个独立 npm repo | core API 变更可原子 PR |
| **Pack 格式** | **纯文件夹**（markdown + sql + yaml） | npm package / 子模块 | 0 编译，零门槛社区作者 |
| **Pack 分发** | **tar 下载 + 解压到 `~/.aouo/packs/`**；`aouo install <github>` | npm install / git submodule | 不依赖 npm；任何 GitHub 仓都能当 pack 仓 |
| **数据隔离** | **一 pack 一 db（`data/<pack>.db`），禁 ATTACH** | 单一 DB + pack 列 / 共享表 | 简单可推断；跨 pack v0.2+ 通过 depends_on 显式放开 |
| **npm 包名** | **`aouo` 单包**（CLI + runtime） | `@aouo/cli` scope / monorepo 多包 | 单名干净；scope 留给未来 native 扩展 |
| 跨 pack v0.1 | 不实现 | 全开 / 隐式可读 | 默认隔离；以后开放比反过来容易 |
| Pack 自定义 tools | 不允许 pack 自带 JS；所需 tool 一律走 core | pack 可 ship custom_tools.ts | 安全 + pack 纯数据 + 0 编译目标一致 |
| Schema 管理 | `schema.sql` + 启动校验 | Prisma / drizzle migration | v0.1 不上重型工具，可控 |
| Manifest 格式 | YAML + Zod 校验 | JSON / TOML | 可读性 + 类型安全 |
| LLM provider 抽象 | 保持现状（OpenAI/Anthropic） | LiteLLM | v0.1 不扩散关注点 |
| **SOUL/RULES 归属** | **core-owned，universal** | pack 可 override | 保持 agent 人格在跨 pack 切换时一致 |
| **USER/MEMORY 归属** | **pack-owned，可选** | core 管理 sections | 多 pack 数据完全隔离 |
| **Pack 概念模型** | **Skill Bundle + Plugin 合体** | 纯 plugin / 纯 skill list | 同时承载用户面（skill）+ 数据闭环 |
| Lineage acknowledgment | 公开致谢 [Hermes](https://github.com/yacineMTB/hermes)（README + footer + Ep8 开场） | 不致谢 | 开源社交契约 |
| 对外 framing | 双层：学习者 = Domain Companion；开发者 = OS / Apps（§0.1） | 单一 framing | 两套话术分受众 |
| 分层文件系统解析 | skill PATH 优先级 + memory scope + SOUL 只追加（§4.5） | 全 pack 隔离 / 全 global | 用户自建可 override pack |
| Capability tiering | required / optional + skill-level requires / fallback（§5.6） | 不做 capability 模型 | 跨部署形态自动降级 |
| `@aouo/x-poster` ship 模式 | draft-only；官方仓不支持 auto-publish PR | 直接 ship 自动发推 | ToS 安全；fork 自负 |
| 官方 pack 住哪 | v0.1–v0.3 内置主仓 `packs/<name>/`，稳了再独立 | 一上来就独立仓 | 联调快，不分散精力 |
| Docs 站位置 + 技术栈 | `/docs` 与 `/packs` 同级，VitePress 单站，home = 落地页（§3.3 + launch-plan §4） | 独立 docs 仓 / 独立营销站 | 早期不分流流量 |
| `notes` 范围 | 合并 reading 进 notes（source_type 区分） | notes / reading 分两个 pack | 写笔记和读书摘录本质是一回事 |

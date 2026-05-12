# aouo Launch Plan — 4-Phase 上线节奏

| Status | Active |
| --- | --- |
| Created | 2026-05-11 |
| Owner | aouoai (originally aouos) |
| Relates to | [`pack-architecture.md`](pack-architecture.md) — 技术 RFC，[`short-video-strategy.md`](short-video-strategy.md) — 内容策略 |

## 0. 文档分工

三份核心文档各管一块，互相引用：

| 文档 | 管什么 |
| --- | --- |
| [`pack-architecture.md`](pack-architecture.md) | **技术架构** — Pack Spec、Core API、迁移代码计划 |
| [`short-video-strategy.md`](short-video-strategy.md) | **内容策略** — ep1-8 系列、护城河论证、CTA |
| **本文档** | **上线节奏** — 品牌、网站、文档、handle 抢占、整体时序 |

---

## 1. 品牌资产盘点（截至 2026-05-11）

| 资产 | 名称 | 状态 |
| --- | --- | --- |
| 产品 / 品牌名 | `aouo` | ✅ 确定 |
| 主域名 | `aouoai.com` | ✅ 已持有 |
| 备用 / 主入口 | `aouo.ai` | ✅ 已持有 |
| npm scope | `@aouo` | ✅ 已持有 npm 组织 |
| GitHub org | `aouoai` | ✅ 已持有（`aouo` 被占） |
| Twitter / X | `@aouo_ai` | ✅ 已注册（`@aouoai` 被占，落定 `@aouo_ai`） |
| 抖音 | `aouoai` | ✅ 已注册 |
| 视频号 | `aouoai` | ✅ 已注册 |
| 小红书 | `aouoai` | ✅ 已注册 |
| B 站 | `aouoai` | ✅ 已注册 |
| TikTok | `aouoai` | ✅ 已注册 |
| YouTube | `aouoai` | ✅ 已注册 |
| Agent 角色名（原 Anya） | `aouo`（产品=角色，无独立人格名） | ✅ 已定 |
| 邮箱 | `hello@aouo.ai` | ⏳ Cloudflare Email Routing 待配置 |

**关键观察**：**aouoai 在主流社媒平台全部锁定**（抖音 / 视频号 / 小红书 / B 站 / TikTok / YouTube）；X 因 `@aouoai` 被占，落定 `@aouo_ai`（与主域名 `aouo.ai` 对齐）。npm `@aouo` 是唯一短形式异常点（行业标准做法，Anthropic / LangChain 都是 GitHub org 和 npm scope 不对称）。

---

## 2. Phase A — 品牌 & Handle 锁定（Week 0，本周）

### 2.1 已完成

- [x] npm 组织 `@aouo` 注册
- [x] `aouoai.com` 注册
- [x] GitHub `github.com/aouoai`
- [x] 抖音 / 视频号 / 小红书 / B 站 / TikTok / YouTube 均锁定 `aouoai`
- [x] X / Twitter：`@aouo_ai`

### 2.2 待做（≤ 1 天）

- [ ] Cloudflare DNS 配置：
  - [ ] `aouo.ai` 作为主入口
  - [ ] `aouoai.com` 301 redirect → `aouo.ai`（避免 SEO 分流）
  - [ ] Email Routing：`hello@aouo.ai` 转发到私人邮箱
- [x] Agent 角色名：`aouo` 自身（无独立人格名，SOUL 走简版助手）✅
- [x] `aouo.ai` 域名 ✅
- [x] X handle：`@aouo_ai` ✅

### 2.3 X (Twitter) Handle

`@aouoai` 在 X 上被占——已落定 `@aouo_ai`。视觉接近域名 `aouo.ai`，与品牌主域名一致性强。所有对外资料（视频片尾、网站 footer、bio link）统一写 `@aouo_ai`。

---

## 3. Phase B — 代码内重命名（Week 1，与 Spike 同期）

详见 [`pack-architecture.md` §16.3](pack-architecture.md)。核心步骤：

1. 新建空仓库 `github.com/aouoai/aouo`
2. 本地 `mv anya/ aouo/`
3. 全局 grep `anya|Anya|ANYA`，每处决定保留 / 替换
4. 改 `package.json` name、`~/.anya/` → `~/.aouo/`、CLI binary 名
5. **写迁移脚本**：用户从旧 `~/.anya/` 自动复制到 `~/.aouo/`，保护现有学习数据
6. 一次性 commit → push 新仓库

**关键时机**：放在 Pack 重构 Phase 1 同一周内完成——新写的 core / english pack 代码直接用新名字，避免命名两次替换。

---

## 4. Phase C — 网站（Week 2–4）

**核心决策**：**docs 即落地页，落地页即 docs**，统一一个 VitePress 站点，部署到 `aouo.ai`。不分独立 holding page / marketing page / docs subdomain。

**仓库位置**：主仓 `aouoai/aouo` 根目录下 `/docs`（与 `/packages` 同级，不进 `apps/`）。详见 [`pack-architecture.md` §3.3](pack-architecture.md)。

**技术栈**：
- **首选 VitePress**：home 布局 + 文档主题原生支持，构建快，Vue 生态成熟
- 备选 Astro Starlight：若后续 home 想做重交互（live demo / 复杂动效），可平移迁移
- 部署：**Cloudflare Pages**（免费 + 国内可访问）+ `aouo.ai` 主域名 + `aouoai.com` 301 重定向

### 4.1 v0.1 站点（Week 2，1 天）

VitePress 站首页 = 落地页（默认 home layout）：

**首页（`/`）内容**：
- Hero：一句话定位 "**aouo** — Your Domain Companion" / 副标题 "长程陪伴 AI，每天进步一点"
- Action 按钮：`Get Started`（→ `/docs/getting-started`）/ `GitHub`（→ `github.com/aouoai/aouo`）
- Features grid：长记忆 / 主动触达 / 多 skill / 数据闭环 / 内置评估（五要素）
- Ep1 视频嵌入 / placeholder
- "什么是 Domain Companion" 1 段（取自 [`short-video-strategy.md` §1.1](short-video-strategy.md)）
- 等待列表（邮箱收集）—— **Tally** 或 **Notion form** 嵌入
- 社交 footer：X / 抖音 / 视频号 / 小红书 / B 站 / TikTok / YouTube

**docs 区（`/docs`，v0.1 阶段仅占位）**：
- Getting Started（占位 "v0.1 上线后激活"）
- Concepts（占位）
- Build Your Pack（占位）

**预估**：6–8 小时（VitePress 模板 + home 自定义 + 内容填充 + DNS）。

### 4.2 v0.2 站点扩展（Week 4，3 天）

同一个 VitePress 站继续叠：
- Home 加 **Domain Companion thesis 长版**（从 [`short-video-strategy.md` §1.3](short-video-strategy.md) 改写）
- Home 加视频系列入口（ep1, ep2 ...）
- Home 加 "Pricing 待开放" + 收意向 form
- Home 加 "造你自己的 Domain Companion" 开发者 pitch（链向 `/docs/build-your-pack`）
- docs 区填充 Getting Started + Concepts 初稿

### 4.3 v0.3 站点完善（开源后 1 周）

继续同一站，把 docs 章节完整：

**Docs 章节**：
- Getting Started（5 分钟跑通）
- Concepts（Pack Spec / SOUL/RULES / 五要素 / OS 隐喻 / Capability 模型）
- Build Your Pack（开发者向，是 thesis 实证）
- API Reference（core / persist / cron / chat adapter）
- Pack Catalog（official packs + community packs 列表）

### 4.4 何时分拆 `docs.aouo.ai`？

**触发条件**（任一满足）：
- 营销页面有强交互需求，VitePress home layout 已经 hack 不动
- 开 paid tier，营销页需要 A/B 测试 + 转化优化设计，与文档读者画像冲突
- 国际化（i18n）需求让 docs 树超 100 页，nav 变重

**触发前**：保持单站。早期流量分流是负价值——观众看完 thesis 直接进 Getting Started 才是高转化路径。

---

## 5. Phase D — 文档体系（Week 5+）

按读者优先级排：

| 文档 | 时机 | 工时 | 读者 |
| --- | --- | --- | --- |
| `README.md` | 开源前 1 周 | 1 天 | 所有人首屏 |
| `docs/user-guide.md` | 开源前 | 2 天 | 终端用户 |
| `docs/build-your-pack.md` | 开源后第 2 周 | 3 天 | 想造 pack 的开发者（**最重要**——是 thesis 实证文档） |
| API Reference | 持续 | 长期 | 写 pack 的人 |
| `CONTRIBUTING.md` | 开源后 | 1 天 | PR 提交者 |
| `CHANGELOG.md` | 每版本 | 长期 | 升级用户 |

---

## 6. 待决策清单（阻塞项）

### 6.1 Agent 角色名 ✅ 已定

**决策**：方向 1——产品 = 角色，agent 自称 `aouo`，无独立人格名。

**理由**：
- 启动期不背 character branding 包袱，先把 thesis（Domain Companion）打稳
- 后续如果做角色化（视频中"我和 X 的一周"叙事），可在 packs 内独立引入 sub-agent persona（如 `@aouo/english` 内的英语教练角色），不影响产品主名
- SOUL.md 简化为通用助手 prompt（已落地 `src/config/SOUL.template.md`），去掉 Spy×Family 衍生设定

### 6.2 变现路径主押方向

参见 [`short-video-strategy.md` §8](short-video-strategy.md)：
- SaaS 托管 / Pro packs / 课程 / 私享圈 / B2B 咨询

**建议**：v0.1 上线时**至少押 1 个**主路径（Pro packs 最轻，托管最重）。Week 4 之前决策。

---

## 7. Master Timeline（整合三份文档）

| 周 | 品牌 / 上线（本文档） | 技术 / 重构（[pack RFC](pack-architecture.md)） | 内容 / 视频（[strategy](short-video-strategy.md)） |
| --- | --- | --- | --- |
| **W0**（本周） | Phase A 完成；DNS / Email Routing 配置 | — | — |
| **W1** | Phase B 代码重命名 | Phase 0 Spike + 写 spike report | 开始 5–7 天密集使用素材积累 |
| **W2** | Phase C v0.1 站点（VitePress + home 落地页）上线 | Phase 1 `@aouo/core` 抽离 | 继续素材；ep1 分镜起草 |
| **W3** | README 起草 | Phase 2 `@aouo/english` 抽离；回归测试 | ep2-8 outline 完整 |
| **W4** | Phase C v0.2 站点扩展（thesis 长版 + 视频入口 + pricing 占位）；决定变现主路径 | Phase 3 ielts PoC；开源就绪 | ep1 录制 |
| **W5** | 用户文档；公布开源 | 开源 v0.1 release | ep1 剪辑 + 钉子评论素材 |
| **W6** | docs 章节填充（同站 `/docs` 路径） | 开始 fitness pack 设计 | **ep1 发布**（全平台分发）|
| **W7+** | Phase D 持续完善 | fitness pack 实现 | ep2 录制，按周更 |

---

## 8. 风险与缓解

- **W0 阻塞项已清空**（域名 / handle / 角色名全部敲定）；剩下只剩变现路径选择与 Cloudflare 配置体力活。
- **网站晚于 ep1 = 灾难**：观众点链接 404 等于流量浪费。v0.1 站点必须先于 ep1 发布。
- **代码重命名拖到开源后 = 二次成本**：必须在开源前完成。
- **变现路径选错 = 现金流断流**：你已经全职，runway 有限——v0.1 上线时至少要有 1 条 paywall（哪怕只是"Pro pack 待开放" + 邮箱列表也行）。

---

## 9. References

- [`pack-architecture.md`](pack-architecture.md) — 技术架构 RFC
- [`short-video-strategy.md`](short-video-strategy.md) — 内容策略与 ep1-8 系列规划
- [`architecture-diagrams.md`](architecture-diagrams.md) — 现有架构图
- [`qa.md`](qa.md) — 自问自答

---

## 10. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-05-11 | v0.1 初稿：4-phase 计划落地，整合三份文档时序，记录品牌资产盘点 |

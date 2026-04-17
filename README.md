# Anya

> 用 IELTS 的优质训练内容，提升真实英语能力。

## 项目定位

Anya 不是一个“刷题器”，也不应该是一个“考官机器人”。

这个项目的更合理定位是：一个运行在 Telegram 上的陪伴式英语私教。它借用 IELTS 在听、说、读、写上的高质量题型设计、训练颗粒度和评分框架，但目标不是把学习者推入持续的模考、定级、算分压力，而是让学习者通过科学训练，真实地变强。

理想效果是：

- 日常体验像私教陪练，而不是考试监考
- 训练内容仍然足够专业，保留 IELTS 的方法论价值
- 英语能力先提升，考试成绩随后自然跟上
- 最终达到“无心插柳柳成荫”：不是为了分数而学，但去考也能拿高分

## 目标中的产品形态

Anya 应该更像这样：

- 第一次进入时，先开始一小段真实练习，而不是先被“测一轮”
- 系统通过几次自然互动，逐步感知水平，而不是一次性死板定级
- 默认首页是“今天可以怎么练”，而不是“你现在几分、该走哪条路径”
- 反馈以“下一步怎么更自然、更清楚、更地道”为主，而不是“你这次是 5.5 还是 6.0”
- IELTS 被当成高质量训练素材库和能力框架，而不是项目本身的气质

一句话说，这个仓库的方向应该是：

**IELTS-inspired English coaching, not IELTS-pressure machinery.**

## Agent 架构

运行链路可以概括成：

`Telegram / CLI 输入 → Agent → tools / skills → SQLite → assessment 汇总 → MEMORY.md → 下一轮按当前水平出题`

更细一点：

1. 用户从 Telegram 或 CLI 进入
2. `Agent` 读取系统 prompt、`USER.md`、`MEMORY.md`、已安装 skills 索引
3. 模型根据请求决定调用哪个 skill / tool
4. 练习类 skill 把原始证据写进 `learner.db` / `vocab.db`
5. `assessment` 在手动或定时触发时分析这些学习数据，回写 `MEMORY.md`
6. 后续 `practice-*` skill 再按 `MEMORY` 里的 band / weak dimensions / adaptive controls 控制难度和支架

这套结构的关键分工是：

- 训练 skill 负责“产生日志和样本”
- `assessment` 负责“聚合分析并更新 MEMORY”
- `MEMORY` 负责“给下一轮训练提供难度控制和学习画像”

## Skills 职责

当前真正可用、带 `SKILL.md` 的 IELTS skills 有这些：

- `init`
  首次 onboarding。收集最小用户档案，做轻量水平校准，写入 `USER.md` / `MEMORY.md`，然后把用户送进训练菜单。
- `practice`
  训练总入口。负责展示训练菜单，把用户路由到听说读写或词汇模块。
- `practice-writing`
  写作训练。负责 brainstorming、TEEL、sentence-lab、full-task、rewrite loop、错误记录和写作样本落库。
- `practice-speaking`
  口语训练。负责 shadowing、guided QA、cue card、role-play、retell、发音反馈和口语样本落库。
- `practice-reading`
  阅读训练。负责 flash-skim、sentence anatomy、argument map、attitude scan、ext-reading 和阅读样本落库。
- `practice-listening`
  听力训练。负责 sound drill、dictation、short clip、question type、note-taking、ext-listening 和听力样本落库。
- `words`
  词汇系统。负责 lookup、learn、review、chunk/pattern/paraphrase group、SRS 事件和 `vocab.db` 更新。
- `assessment`
  专门的学习数据分析器。它负责读取 `learner.db` 里的最近练习数据，重新估算 band、weak dimensions、profile，并更新 `MEMORY.md`。
- `database`
  数据层参考 skill。提供 `learner.db` / `vocab.db` 的 schema 和常用 SQL 写法，方便其他 skill 一致地读写数据库。
- `cron-briefing`
  每日学习推送。根据当前 band、薄弱项、兴趣和近期学习状态生成 briefing、文章、音频和轻量 follow-up。
- `cron-word-seed`
  静默词库补货。根据当前水平往 `vocab.db` 里补 `queued_new` 词项。
- `cron-word-review`
  每日单词复习推送。只推已经进入学习系统的词，不引入未学新词。
- `cron-assessment-light`
  日常静默同步。定时调用 `assessment` 的轻量模式，把近期练习结果同步进 `MEMORY.md`。
- `cron-assessment-deep`
  周度深度重算。定时调用 `assessment` 的深度模式，更完整地刷新 `MEMORY.md`。

## 代码结构

- `src/agent`
  Agent 主循环、prompt 拼装、上下文压缩、历史记录
- `src/adapters/telegram`
  Telegram Bot、菜单、语音/图片消息接入
- `src/tools`
  `db`、`memory`、`tts`、`pron_assess`、`web_search`、`image_gen` 等工具
- `src/storage`
  SQLite 会话与消息存储
- `src/skills/bundled/ielts/init`
  初始化、用户档案、轻量水平校准
- `src/skills/bundled/ielts/practice*`
  听说读写四项训练技能
- `src/skills/bundled/ielts/words`
  词汇与词块系统
- `src/skills/bundled/ielts/assessment`
  学习数据分析、MEMORY 同步、light/deep assessment
- `src/skills/bundled/ielts/database`
  learner/vocab SQLite schema 与查询参考
- `src/cron`
  每日 briefing、词汇推送、assessment 定时同步

## 数据分工

项目里最重要的几个数据面分别是：

- `USER.md`
  稳定用户档案：身份、目标、兴趣、学习偏好。
- `MEMORY.md`
  派生学习状态：IELTS bands、weak dimensions、adaptive controls、profile blocks。这个文件不是手工评分表，而是训练控制面板。
- `learner.db`
  练习事实数据：`samples`、`errors`、`subcap_scores` 等。这里存原始训练证据。
- `vocab.db`
  词汇与 SRS 数据：`words`、`word_events`、`paraphrase_groups` 等。
- `state.db`
  Agent 会话历史和消息存档。

当前推荐的数据职责是：

- 练习 skill 只写 `learner.db` / `vocab.db`
- `assessment` 专门分析数据库并更新 `MEMORY.md`
- 训练难度由 `MEMORY.md` 驱动，而不是每个 skill 各自维护一套水平状态

## 总结

Anya 最有前途的地方，不是把 IELTS 做得更像考试，而是把 IELTS 的优质训练方法，做成一个低压力、长期主义、真实有效的英语成长系统。

如果这个方向成立，那么高分不会消失，只是它不再被放在学习体验的正中央。

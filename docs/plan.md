# Anya IELTS Hermes Skills 重构简版计划

日期：2026-04-23

## 1. 核心结论

这次重构的目标，不是继续给现有 `practice-*` 和 `assessment` 里叠模式，而是把整个 IELTS 能力升级成两层清晰结构：

- `ielts/`：用户可感知的 Hermes skill 包，负责路由、画像、状态、初测、教练、听说读写词汇能力。
- `support/`：内部支持层，负责数据契约、定时任务、词汇维护等，不直接承担教学界面。

这次目录采用你现在更偏好的“完整平铺前缀结构”：

- `ielts-router`
- `profile-manager`
- `speaking-exam`
- `reading-explain`
- `vocab-testme`

也就是说：

- 物理目录不再压缩成 `shared/ speaking/ reading/ ...` 这种嵌套树。
- 物理目录完整展开，靠统一前缀表达 track。
- 运行时再通过 manifest 表达 `track / role / mode / visibility`。

一句话目标：

> 把 IELTS 从“几个大 skill”重构成“一个完整的 Hermes skill 包 + 一个独立 support 层”。

---

## 2. 当前已有结构分析

当前 `src/skills/bundled/ielts/` 已有这些能力：

- `init`
- `practice`
- `practice-speaking`
- `practice-listening`
- `practice-reading`
- `practice-writing`
- `words`
- `assessment`
- `database`
- `cron-briefing`
- `cron-word-seed`
- `cron-word-review`

### 2.1 当前结构的主要问题

- `practice-speaking / listening / reading / writing` 粒度过粗，一个 skill 里混了 exam、practice、explain、eval 多种职责。
- `assessment` 同时承担初测、校准、状态维护、分析、推荐，已经过载。
- `init` 混合了建档、初测、导流，后续很难扩成 `quick/full placement` 两条线。
- `words` 是大系统，但目前仍是单块 skill，不利于拆出 review、contextual、topic、testme。
- `database` 和 `cron-*` 本质是 support 能力，不应继续和教学 skill 放在同一层。

### 2.2 当前结构为什么不能继续直接扩

如果继续在现在结构上往里加：

- `reading-skim-drill`
- `listening-mapdrill`
- `writing-guided`
- `vocab-testme`

最后会出现这些问题：

- 新能力没有稳定归属。
- prompt 暴露越来越混乱。
- Telegram 菜单越来越难组织。
- learner state 更新责任越来越不清楚。
- support 和教学能力继续混在一起。

所以，当前最该先做的不是继续堆模式，而是先重定目录和职责边界。

---

## 3. 现有结构 vs 新结构

| 现在已有             | 新结构归属                                                                                                                                                                                          | 调整原因                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `init`               | `profile-manager` + `placement-quick` + `placement-full` + `ielts-router`                                                                                                                           | 建档、初测、导流应拆开                     |
| `practice`           | `ielts-router` + `coach-passive`                                                                                                                                                                    | 用户说“开始练”本质是路由和被动教练响应     |
| `practice-speaking`  | `speaking-exam` + `speaking-freetalk` + `speaking-shadowing` + `speaking-repeat` + `speaking-roleplay` + `speaking-explain` + `speaking-azure-score`                                                | 口语内部模式差异大，必须拆                 |
| `practice-listening` | `listening-exam` + `listening-dictation` + `listening-shadowing` + `listening-prediction` + `listening-numberdrill` + `listening-mapdrill` + `listening-explain`                                    | 听力应按能力点和题型拆开                   |
| `practice-reading`   | `reading-exam` + `reading-timed` + `reading-untimed` + `reading-typetrain` + `reading-skim-drill` + `reading-vocab-extract` + `reading-explain`                                                     | 阅读要区分考试、计时、专项、讲解、抽词     |
| `practice-writing`   | `writing-exam` + `writing-task1-academic` + `writing-task1-general` + `writing-task2` + `writing-guided` + `writing-rewrite` + `writing-sentence-drill` + `writing-collocation` + `writing-explain` | 写作要按 task 和训练模式拆开               |
| `words`              | `vocab-review` + `vocab-contextual` + `vocab-topic` + `vocab-testme`                                                                                                                                | 词汇至少拆成复习、抽词、话题、主动测试     |
| `assessment`         | `learner-state` + `placement-quick` + `placement-full` + `coach-proactive` + `coach-passive`                                                                                                        | 评估、状态、推荐、主动提醒不能继续混成一块 |
| `database`           | `support/ielts-data-contract`                                                                                                                                                                       | 属于内部数据契约                           |
| `cron-briefing`      | `support/ielts-cron-briefing`                                                                                                                                                                       | 属于内部自动化                             |
| `cron-word-seed`     | `support/ielts-cron-word-seed`                                                                                                                                                                      | 属于内部自动化                             |
| `cron-word-review`   | `support/ielts-cron-word-review`                                                                                                                                                                    | 属于内部自动化                             |

这张表的结论很直接：

> 现有 skill 不是没用，而是颗粒度和职责边界不对，应该拆分后重新归位。

---

## 4. 推荐的新目录结构

下面是推荐的完整结构。这里不再压缩，而是按你的要求完整展开。

```text
ielts/
├── README.md                                                     # 整个 IELTS Hermes skill 包总说明；介绍命名规则、调用关系、数据流、首发范围

├── ielts-router/                                                 # 总路由；根据用户请求决定进入 exam / practice / explain / placement / coach
│   ├── SKILL.md                                                  # 路由规则：如何识别“考试”“练习”“评估”“讲解”“复盘”
│   └── assets/
│       ├── routing-rules.md                                      # 路由条件表；不同输入映射到哪个 skill
│       └── handoff-map.md                                        # skill 之间的交接图；一个 skill 结束后建议交给谁

├── profile-manager/                                              # 用户档案管理；目标分、考试类型、考试日期、学习偏好、可用时间
│   ├── SKILL.md                                                  # 负责读取和更新用户画像
│   └── assets/
│       ├── profile-schema.md                                     # 用户档案字段定义
│       └── goal-fields.md                                        # 目标类字段说明；target band、exam date、weekly hours 等

├── learner-state/                                                # 用户当前学习状态；当前估计 band、弱项、最近趋势、难度层级
│   ├── SKILL.md                                                  # 负责维护 learner state，供 coach / explain / placement / recommend 读取
│   └── assets/
│       ├── learner-state-schema.md                               # learner_state 的统一结构
│       └── update-rules.md                                       # 每次练习/考试后如何更新状态

├── placement-quick/                                              # 快速初测；约 10 分钟，混合式诊断
│   ├── SKILL.md                                                  # 给新用户快速估计当前水平和优先弱项
│   └── assets/
│       ├── placement-quick-blueprint.md                          # 快测蓝图；抽样哪些能力
│       └── placement-quick-output.md                             # 快测输出格式；估分、弱项、建议起点

├── placement-full/                                               # 完整初测；比 quick 更重，做更完整的基线建立
│   ├── SKILL.md                                                  # 用更完整的测试建立初始基线
│   └── assets/
│       ├── placement-full-blueprint.md                           # 完整初测蓝图；如何覆盖听说读写词汇
│       └── placement-full-output.md                              # 完整初测输出格式；更详细的诊断结果

├── coach-proactive/                                              # 主动教练；监控状态并主动打断、提醒、推荐下一步
│   ├── SKILL.md                                                  # 当 learner state 或表现触发阈值时主动介入
│   └── assets/
│       ├── proactive-triggers.md                                 # 触发条件；连续低表现、长期未复习、明显进步等
│       └── proactive-messages.md                                 # 主动提醒/建议的表达模板

├── coach-passive/                                                # 被动教练；用户主动问时才出手
│   ├── SKILL.md                                                  # 只在用户请求“帮我分析/建议/规划”时响应
│   └── assets/
│       ├── passive-qa-patterns.md                                # 常见问法模板
│       └── coach-response-templates.md                           # 回答模板；建议、复盘、安排行动

├── speaking-exam/                                                # 口语考试模式；完整 Part 1 -> Part 2 -> Part 3
│   ├── SKILL.md                                                  # 负责完整 speaking mock；计时、追问、评分、输出 band 风格反馈
│   └── assets/
│       ├── part1-topic-bank.md                                   # Part 1 题库；家乡、工作、学习、兴趣等
│       ├── part2-cue-cards.md                                    # Part 2 cue card 题库
│       ├── part3-topic-bank.md                                   # Part 3 深度追问题库
│       └── speaking-rubric.md                                    # speaking exam 评分模板；fluency / LR / GRA / pronunciation

├── speaking-freetalk/                                            # 自由表达；不严格按 exam 流程，围绕题目自由说
│   ├── SKILL.md                                                  # 负责开放式口语输出练习
│   └── assets/
│       ├── freetalk-topics.md                                    # 自由表达题库
│       └── freetalk-feedback.md                                  # 自由表达反馈模板

├── speaking-shadowing/                                           # 跟读；听示范 -> 跟读 -> 对比发音、节奏、韵律
│   ├── SKILL.md                                                  # 负责 speaking shadowing 训练
│   └── assets/
│       ├── shadowing-scripts.md                                  # 跟读文本素材
│       └── shadowing-feedback.md                                 # 跟读反馈模板；重音、停顿、连读、韵律

├── speaking-repeat/                                              # 复述；听一句/一段后立即复述
│   ├── SKILL.md                                                  # 负责复述训练；侧重短时记忆、流畅度、信息保留
│   └── assets/
│       ├── repeat-materials.md                                   # 复述素材；句子、短段落、描述性内容
│       └── repeat-rules.md                                       # 复述评分规则；完整度、准确度、流畅度

├── speaking-roleplay/                                            # 情景对话；机场/餐厅/酒店/面试/问路等
│   ├── SKILL.md                                                  # 负责 roleplay 训练；更偏真实交流场景
│   └── assets/
│       ├── roleplay-scenarios.md                                 # 情景库；按主题和难度组织
│       └── roleplay-patterns.md                                  # 对话模板；常用表达、追问套路、场景目标

├── speaking-explain/                                             # 讲解模式；把一次口语输出的问题讲明白
│   ├── SKILL.md                                                  # 深度解释扣分点、卡顿点、表达问题、发音问题
│   └── assets/
│       ├── speaking-explain-template.md                          # 讲解模板；问题 -> 原句 -> 原因 -> 改法
│       └── speaking-error-taxonomy.md                            # 口语错误分类；停顿、短答、空泛、错音等

├── speaking-azure-score/                                         # 底层能力；调 Azure Speech / Pronunciation Assessment
│   ├── SKILL.md                                                  # 只负责调用 Azure 并返回结构化分数，不直接教学
│   └── assets/
│       ├── azure-request-contract.md                             # 请求 Azure 的输入协议；音频、脚本、模式、语言
│       └── azure-score-schema.md                                 # 返回结构；accuracy / fluency / completeness / prosody / word errors

├── listening-exam/                                               # 听力考试模式；完整 4 sections
│   ├── SKILL.md                                                  # 负责完整 listening mock；按 section 推进并计分
│   └── assets/
│       ├── listening-sections.md                                 # 4 sections 的结构说明
│       ├── listening-question-types.md                           # 听力题型说明；填空、选择、地图、匹配等
│       └── listening-score-rules.md                              # 听力换分规则

├── listening-dictation/                                          # 听写；分段逐句听写
│   ├── SKILL.md                                                  # 负责听写练习；提升辨音、拼写、细节捕捉
│   └── assets/
│       ├── dictation-materials.md                                # 听写素材；按难度和场景组织
│       └── dictation-feedback.md                                 # 听写反馈模板；拼写、漏词、连读误判等

├── listening-shadowing/                                          # 听力跟读；复用 speaking-shadowing 的训练逻辑
│   ├── SKILL.md                                                  # 负责 listening shadowing；重点在“听懂后模仿”
│   └── assets/
│       ├── listening-shadowing-materials.md                      # 听力跟读素材；偏短句、对话、播报
│       └── listening-shadowing-rules.md                          # 和 speaking-shadowing 的差异说明；更强调听觉输入

├── listening-prediction/                                         # 预判训练；先看题，预测答案类型，再听
│   ├── SKILL.md                                                  # 训练“听前预判”能力；先预测是数字、日期、人名、地点等
│   └── assets/
│       ├── prediction-prompts.md                                 # 预测提示模板
│       └── answer-type-rules.md                                  # 答案类型规则；数字/日期/名词/拼写等

├── listening-numberdrill/                                        # 数字/日期/拼写专项；雅思高频失分点
│   ├── SKILL.md                                                  # 负责数字、日期、时间、拼写的专项训练
│   └── assets/
│       ├── numberdrill-materials.md                              # 数字/日期/拼写素材库
│       └── spelling-rules.md                                     # 拼写和格式规则

├── listening-mapdrill/                                           # 地图题专项；方向词、空间关系词
│   ├── SKILL.md                                                  # 负责地图题专项训练
│   └── assets/
│       ├── mapdrill-materials.md                                 # 地图题练习素材
│       └── direction-phrases.md                                  # 方向词和空间词库；north, opposite, behind 等

├── listening-explain/                                            # 错题讲解；对听力错误做归因分析
│   ├── SKILL.md                                                  # 深入解释某次听力错误为什么发生
│   └── assets/
│       ├── listening-explain-template.md                         # 讲解模板；错因、证据、正确定位方式
│       └── listening-error-taxonomy.md                           # 听力错误分类；干扰项、拼写、漏听、预判失败等

├── reading-exam/                                                 # 阅读考试模式；3 篇文章，60 分钟完整
│   ├── SKILL.md                                                  # 负责完整 reading mock；Academic / General 均可在 mode 中区分
│   └── assets/
│       ├── reading-question-types.md                             # 阅读题型说明；TFNG、matching、completion 等
│       ├── reading-modes.md                                      # Academic / General 的区别说明
│       └── reading-score-rules.md                                # 阅读换分规则

├── reading-timed/                                                # 单篇计时练习；强化时间管理
│   ├── SKILL.md                                                  # 负责单 passage 限时训练
│   └── assets/
│       ├── timed-passages.md                                     # 计时阅读素材
│       └── timed-rules.md                                        # 限时规则；时长、题量、节奏建议

├── reading-untimed/                                              # 非计时阅读；侧重理解和分析
│   ├── SKILL.md                                                  # 负责慢读、理解、结构分析型训练
│   └── assets/
│       ├── untimed-passages.md                                   # 非限时阅读素材
│       └── comprehension-prompts.md                              # 理解引导问题；主旨、结构、逻辑、作者意图

├── reading-typetrain/                                            # 题型专项；TFNG / matching / completion 等
│   ├── SKILL.md                                                  # 负责按题型做专项训练
│   └── assets/
│       ├── type-bank.md                                          # 各题型素材入口表
│       └── type-strategies.md                                    # 各题型策略说明；如何定位、排除、核对

├── reading-skim-drill/                                           # 略读专项；90 秒 skim passage 后答主旨题
│   ├── SKILL.md                                                  # 训练 skim 主旨、段落功能和全局把握
│   └── assets/
│       ├── skim-materials.md                                     # 略读练习素材
│       └── skim-rules.md                                         # 略读规则；时间限制、关注点、主旨题模板

├── reading-vocab-extract/                                        # 做完阅读后抽取生词并写入 vocabulary.db
│   ├── SKILL.md                                                  # 负责从 passage 和错题中提取生词、短语、同义替换
│   └── assets/
│       ├── extract-rules.md                                      # 抽词规则；什么词该进 db，什么词不该进
│       └── extract-output.md                                     # 输出结构；word / phrase / context / source passage

├── reading-explain/                                              # 阅读错题讲解；深度归因
│   ├── SKILL.md                                                  # 解释某题为什么错、原文证据在哪里、为什么会被干扰
│   └── assets/
│       ├── reading-explain-template.md                           # 讲解模板；题目 -> 原文 -> 错因 -> 正解
│       └── reading-error-taxonomy.md                             # 阅读错误分类；定位慢、同义替换识别失败、审题失误等

├── writing-exam/                                                 # 写作考试模式；Task 1 + Task 2 计时
│   ├── SKILL.md                                                  # 负责完整 writing mock
│   └── assets/
│       ├── writing-modes.md                                      # Academic / General 的区别说明
│       ├── writing-task-types.md                                 # Task 1 / Task 2 类型说明
│       └── writing-rubric.md                                     # 写作评分模板；TR/TA, CC, LR, GRA

├── writing-task1-academic/                                       # 单独练 Academic Task 1；图表/地图/流程图
│   ├── SKILL.md                                                  # 负责图表题单项训练
│   └── assets/
│       ├── task1-academic-types.md                               # line/bar/pie/table/map/process 类型说明
│       └── task1-academic-patterns.md                            # 常见写法、overview 模板、数据比较模板

├── writing-task1-general/                                        # 单独练 General Task 1；书信
│   ├── SKILL.md                                                  # 负责 GT 书信训练
│   └── assets/
│       ├── task1-general-types.md                                # formal / semi-formal / informal 类型说明
│       └── task1-general-patterns.md                             # 书信开头、目的段、结尾模板

├── writing-task2/                                                # 单独练 Task 2；议论文/讨论文等
│   ├── SKILL.md                                                  # 负责 task2 单项训练
│   └── assets/
│       ├── task2-types.md                                        # opinion / discussion / problem-solution 等
│       └── task2-structures.md                                   # 各类文章结构模板

├── writing-guided/                                               # 带提纲写作；AI 先给结构，学员填充
│   ├── SKILL.md                                                  # 适合低分段用户；降低空白页压力
│   └── assets/
│       ├── guided-outline-templates.md                           # 提纲模板；引导写作骨架
│       └── guided-prompts.md                                     # 填充提示；每段该写什么

├── writing-rewrite/                                              # 改写；把 band 5 样文改到 band 7
│   ├── SKILL.md                                                  # 负责改写升级训练
│   └── assets/
│       ├── rewrite-samples.md                                    # band 5 样文素材
│       └── rewrite-targets.md                                    # 改写目标；词汇、结构、衔接、语法升级点

├── writing-sentence-drill/                                       # 句子专项；不写整篇，只操练高质量句子
│   ├── SKILL.md                                                  # 负责复杂句型、从句、条件句、让步句等训练
│   └── assets/
│       ├── sentence-patterns.md                                  # 句型模板
│       └── sentence-drills.md                                    # 句子练习素材

├── writing-collocation/                                          # 搭配专项；写作前给搭配库，写完检查是否用上
│   ├── SKILL.md                                                  # 负责 topic collocation 的输入与使用检查
│   └── assets/
│       ├── collocation-bank.md                                   # 按话题分类的写作搭配库
│       └── usage-check-rules.md                                  # 使用检查规则；用了没、用对没、是否自然

├── writing-explain/                                              # 写作讲解；每个扣分点定位到原句
│   ├── SKILL.md                                                  # 深入解释作文问题；定位原句并给修改建议
│   └── assets/
│       ├── writing-explain-template.md                           # 讲解模板；原句 -> 问题 -> 为什么扣分 -> 如何改
│       └── writing-error-taxonomy.md                             # 写作错误分类；跑题、空泛、衔接差、词不达意、语法错误等

├── vocab-review/                                                 # 单词复习；SM-2 / SRS 间隔复习
│   ├── SKILL.md                                                  # 负责单词复习调度
│   └── assets/
│       ├── srs-rules.md                                          # 间隔复习规则
│       └── review-output.md                                      # 复习输出结构；记住/模糊/忘了等状态

├── vocab-contextual/                                             # 从本人做过的题里抽生词；强调“上下文中学词”
│   ├── SKILL.md                                                  # 负责从阅读、听力、写作、口语中抽取用户真实遇到的词
│   └── assets/
│       ├── contextual-rules.md                                   # 抽词规则；如何记录语境、搭配、出处
│       └── contextual-output.md                                  # 输出结构；word / context / translation / source

├── vocab-topic/                                                  # 按话题成块学词；教育、科技、环境、健康等
│   ├── SKILL.md                                                  # 负责 topic-based vocab 学习
│   └── assets/
│       ├── topic-banks.md                                        # 话题词汇库
│       └── topic-study-rules.md                                  # 话题学习规则；成组输入、成组回忆、成组输出

└── vocab-testme/                                                 # 主动考核；“考考我最近学的词”
    ├── SKILL.md                                                  # 负责主动测词；从近期学习记录里抽测
    └── assets/
        ├── testme-rules.md                                       # 出题规则；回忆、造句、搭配、同义改写
        └── testme-output.md                                      # 测评输出结构；对词掌握情况做判断
```

### 4.1 support 层完整结构

`support/` 是内部支持层，不面向用户，不直接承担教学对话。

```text
support/
├── ielts-data-contract/                                          # 数据契约层；统一 learner.db / vocab.db / learner_state 的读写规范
│   ├── SKILL.md                                                  # 只定义 schema、字段、query 约定，不直接教学
│   └── assets/
│       ├── learner-db-schema.md                                  # learner.db 表结构；samples / errors / subcap_scores 等
│       ├── vocab-db-schema.md                                    # vocab.db 表结构；words / word_events / srs 字段等
│       ├── learner-state-io.md                                   # learner_state 的读写协议；谁能写、谁只读
│       └── query-cookbook.md                                     # 常用查询模板；给 explain / coach / placement 复用

├── ielts-cron-briefing/                                          # 周期性 briefing；推送近期表现、提醒、回顾
│   ├── SKILL.md                                                  # 负责生成和发送 briefing
│   └── assets/
│       ├── briefing-rules.md                                     # 触发频率、静默策略、摘要逻辑
│       └── briefing-templates.md                                 # briefing 模板；日报、周报、复盘摘要

├── ielts-cron-word-seed/                                         # 自动补词；把新词、搭配、同义替换补进待学队列
│   ├── SKILL.md                                                  # 负责向词汇系统补充新素材
│   └── assets/
│       ├── seed-rules.md                                         # 选词规则；按近期错题、话题、频率、重要度补词
│       └── seed-sources.md                                       # 词源来源；reading passage / listening transcript / writing topics 等

└── ielts-cron-word-review/                                       # 复习推送；把该复习的词按优先级推送给用户
    ├── SKILL.md                                                  # 负责从复习队列中选词并发送复习任务
    └── assets/
        ├── review-pick-rules.md                                  # 抽词规则；遗忘概率、优先级、最近错误权重
        └── review-message-templates.md                           # 推送模板；单词卡、搭配卡、主动测试卡
```

---

## 5. 运行时设计

虽然物理目录采用完整平铺前缀结构，但运行时仍然必须有强元数据，不然只是换目录名。

建议每个 skill manifest 至少包含：

```yaml
id: ielts.reading.typetrain
name: reading-typetrain
title: Reading Type Training

package: ielts
track: reading
role: practice
mode: typetrain
visibility: public

surfaces:
  prompt_index: true
  telegram_command: false
  telegram_menu: true
  cron_entry: false
```

### 5.1 建议固定字段

- `package`：`ielts` 或 `support`
- `track`：`router / profile / state / placement / coach / speaking / listening / reading / writing / vocab / support`
- `role`：`exam / practice / explain / eval / infra / cron / contract`
- `mode`：更细的模式，例如 `shadowing / repeat / timed / typetrain / mapdrill / rewrite`
- `visibility`：`public / guided / internal / hidden`

### 5.2 这次为什么用平铺前缀结构

因为你现在更看重两点：

- 一眼看目录时，能直接看到完整能力版图。
- 新增 skill 时，文件路径稳定，不需要频繁改层级。

所以这里采用：

- 物理目录平铺但用统一前缀命名。
- 运行时靠 manifest 补回结构语义。

---

## 6. 暴露策略

### 6.1 `public`

适合直接进 prompt index 或 Telegram 菜单：

- `speaking-exam`
- `speaking-freetalk`
- `speaking-shadowing`
- `speaking-repeat`
- `speaking-roleplay`
- `listening-exam`
- `listening-dictation`
- `listening-shadowing`
- `listening-prediction`
- `listening-numberdrill`
- `listening-mapdrill`
- `reading-exam`
- `reading-timed`
- `reading-untimed`
- `reading-typetrain`
- `reading-skim-drill`
- `writing-exam`
- `writing-task1-academic`
- `writing-task1-general`
- `writing-task2`
- `writing-guided`
- `writing-rewrite`
- `writing-sentence-drill`
- `writing-collocation`
- `vocab-review`
- `vocab-contextual`
- `vocab-topic`
- `vocab-testme`

### 6.2 `guided`

适合系统判断需要时再进入：

- `placement-quick`
- `placement-full`
- `coach-proactive`
- `coach-passive`
- `speaking-explain`
- `listening-explain`
- `reading-explain`
- `writing-explain`

### 6.3 `internal` / `hidden`

只供系统内部调度：

- `ielts-router`
- `profile-manager`
- `learner-state`
- `speaking-azure-score`
- `support/ielts-data-contract`
- `support/ielts-cron-*`

---

## 7. 迁移顺序

### Step 1：先升级 manifest 和 loader

- 引入 `id / package / track / role / mode / visibility`
- `skill_view` 支持按 `id` 读取
- promptBuilder 支持按 `visibility` 和 `surface` 过滤

### Step 2：建立新目录骨架

- 建立完整的 `ielts/` 平铺结构
- 建立完整的 `support/` 结构
- 先放 `README.md / SKILL.md / assets` 占位文件

### Step 3：把旧 skill 逐步迁入新结构

- `init` -> `profile-manager + placement-quick/full + ielts-router`
- `assessment` -> `learner-state + coach-proactive + coach-passive`
- `practice-speaking` -> `speaking-*`
- `practice-listening` -> `listening-*`
- `practice-reading` -> `reading-*`
- `practice-writing` -> `writing-*`
- `words` -> `vocab-*`

### Step 4：最后切 support 层

- `database` -> `support/ielts-data-contract`
- `cron-briefing` -> `support/ielts-cron-briefing`
- `cron-word-seed` -> `support/ielts-cron-word-seed`
- `cron-word-review` -> `support/ielts-cron-word-review`

---

## 8. 当前最值得先做的事

如果现在马上动代码，我建议顺序是：

1. 先做 manifest 设计和 loader 升级。
2. 再把 `ielts-router / profile-manager / learner-state` 这三个核心基础 skill 做出来。
3. 然后优先拆 `reading / listening / writing / vocab`。
4. 最后再处理 support 层和 cron 迁移。

当前最不该先做的事是：

- 先大改数据库。
- 先推翻 Agent Core。
- 先一次性删光旧 skill。

---

## 9. 最终判断

这次重构的本质，不是把 `practice-reading` 拆成几个子 skill 这么简单，而是把整个 IELTS 系统正式升级成：

- 一个完整的 `ielts/` Hermes skill 包
- 一个独立的 `support/` 内部支持层
- 一套明确的运行时 manifest 语义

按这个方向走，后面继续加 IELTS 能力、加其他考试包、加更多教练策略，结构都会稳定很多。

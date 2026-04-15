# IELTS 技能体系评估与升级方案

## 1. 结论

当前 `src/skills/bundled/ielts` 这套设计，已经具备一个不错的 MVP 骨架：

- 有完整的入口层：`start / practice`
- 有能力层：`listening / reading / writing / speaking / flashcard`
- 有运营层：`daily / planner / assessment`
- 有数据层：`data`
- 有统一人格与路由层：`SOUL.ielts.md`

如果把目标定义为“做一个能陪用户每天练一点、能记住用户、能持续打卡的 IELTS 学习助手”，这套方案是可行的。

如果把目标定义为“做一个真正能帮助用户持续提分，并且在 Band 4.0 到 7.5+ 不同层级都有效的雅思备考系统”，当前方案还不够。问题不在于模块数量不够，而在于：

1. 诊断不够细，导致后续训练分层不准。
2. 听说读写都偏向“一轮题目 + 一次反馈”，缺少分技能拆解。
3. 反馈没有形成“立刻纠错 -> 立即重做 -> 延迟复习”的闭环。
4. 难度调节过粗，只按大致 band 走，不够动态。
5. 数据层能存结果，但还不足以支撑精细化教学决策。

一句话总结：

当前版本适合作为“有记忆的 IELTS 练习机器人”，不适合作为“完整的、可持续提分的 IELTS 教学系统”。它是个好底座，但离真正成熟的产品还差一轮系统化打磨。

---

## 2. 现有 Skills 盘点与可行性判断

| 模块 | 当前作用 | 可行性判断 | 主要问题 |
|---|---|---|---|
| `start` | 建档 + 初始测评 | 有必要，但测评过粗 | 主要依赖短写作估计整体水平，无法真实区分听说读写 |
| `practice` | 训练入口菜单 | 可行 | 只是路由层，没有问题 |
| `writing` | 出题 -> 写作 -> 4D评分 -> Top3纠错 | 可行，但偏单轮 | 缺少审题、提纲、改写、二次提交等关键步骤 |
| `speaking` | Part 1/2/3 口语练习 | 可行，但偏 exam simulation | 缺少跟读、复述、对话、发音微练等多模式 |
| `reading` | 阅读短文 + 3题 | 可行，但深度不足 | 题型覆盖太少，300 词固定长度不合理 |
| `listening` | TTS 音频 + 答题 + transcript | 可行，但还不是真正的听力体系 | 缺少精听、听写、辨音、同义替换、题型训练 |
| `flashcard` | 单词卡 + SRS | 可行，但偏识别 | 生产性使用太弱，和写作口语迁移不够 |
| `assessment` | 日评 / 周评 / 手动测评 | 思路正确 | 目前可推导的字段多，但底层数据并不足以可靠支撑 |
| `planner` | 周计划 | 有价值 | 计划颗粒度偏粗，没有落到“题型/子技能”层 |
| `daily` | 日常 brief | 有价值 | 还像运营提醒，不像真正的微训练 |
| `data` | learner/vocab 数据存储 | 必要 | 目前字段设计还不够支撑精细训练 |
| `SOUL.ielts.md` | 角色、路由、记忆规则 | 很重要 | 角色层不错，但教学规则还不够精细 |

### 可行性总判断

这套 skills 的结构设计本身是合理的，甚至是有扩展性的。真正需要补的是：

- 从“单轮练习”升级到“能力训练链”
- 从“总体 band”升级到“子技能画像”
- 从“出题”升级到“分层训练 + 复盘闭环”

---

## 3. 当前方案最需要打磨的地方

## 3.1 教学设计层面的不足

### 1. 初始测评不够像真正的 placement test

`start` 里目前的初测逻辑主要是：

- 3 句英文写作
- 2 个语法题
- 2 个词汇题
- 再把 `Writing` 结果外推到 `Listening / Reading / Speaking`

这在产品早期能跑通，但在教学上不够可靠。原因很简单：

- 一个用户写作 5.5，不代表听力 5.5
- 程序员、研究生这类用户经常出现“阅读高、听力中、口语低、写作偏弱”的不均衡画像
- 初测如果直接把 Overall 复制给四项，会导致后续训练选错难度

更合理的做法是：

1. 给出快速初测，只做初步分层。
2. 再用前 3 到 5 次正式练习进行校准。
3. 最终输出的是“band range + confidence”，而不是伪精确值。

也就是说，第一天应该说：

`当前估计 Speaking 4.5-5.0，信心中等；Reading 5.5-6.0，信心偏低，需要再测 2 次确认。`

而不是直接硬写死一个 `Speaking 5.0`。

### 2. 当前训练设计偏“考试任务”，不够“教学任务”

现在四项技能大多是：

1. 出一题
2. 用户做
3. 系统判
4. 给错误
5. 结束

这比较像刷题机器人，不像老师。

真正能提分的系统，必须把每个大技能拆成多个“可训练的微能力”。

例如 Speaking 不能只有 Part 1/2/3，还应拆成：

- 发音与语音习惯
- 句子扩展能力
- 观点展开能力
- 讲述时长控制
- 回答组织能力
- 修正与自救能力

Listening 也不能只是听完做题，还要拆成：

- 辨音
- 连读弱读识别
- 关键词捕捉
- 同义替换识别
- 听写
- 笔记
- 干扰项判断

### 3. 反馈没有形成“立刻重做”的闭环

当前很多 skill 在给完 Top 3 errors 后就结束了。这个设计不够强。

用户真正吸收一个错误，通常至少需要三步：

1. 知道自己哪里错了
2. 当场用对一次
3. 隔一段时间再用对一次

所以每次练习都应该变成：

1. 主任务
2. 反馈
3. 微型纠错 drill
4. 立即 redo
5. 加入延迟复习队列

如果没有第 3 和第 4 步，很多反馈只是“看懂了，但下次还错”。

### 4. 难度调节过粗

当前 `reading`、`listening`、`writing`、`speaking` 都有按 band 分层的思路，但还不够细。

真正需要调节的，不只是 band，而是多个维度：

| 技能 | 应调节的难度参数 |
|---|---|
| Speaking | 题目抽象度、回答目标时长、追问数量、是否给回答骨架、是否允许准备 |
| Listening | 语速、长度、说话人数量、口音、干扰项密度、题型、句法复杂度 |
| Reading | 篇幅、词汇覆盖率、段落复杂度、题型组合、限时压力、推理深度 |
| Writing | 题目抽象度、任务类型、字数目标、是否给提纲、是否先做段落训练 |

如果只有“Band 4-5、Band 5-6、Band 6-7”这种三级分层，很难真的做到个性化。

### 5. 词汇系统目前偏孤立

`flashcard` 已经有 SRS 思路，这是好的。

但当前更像：

- 看一个词
- 判断认识不认识
- 进数据库

这不够。

IELTS 词汇训练最重要的不是“看过”，而是：

1. 听得出来
2. 看得懂
3. 能在句子里选对
4. 能在口语里说出来
5. 能在写作里自然用出来

也就是说，单词系统应该从“识别型单词卡”升级为“迁移型词汇系统”。

### 6. 翻译出现得太容易

当前 `reading` 和 `listening` 都默认在做完题后给全文翻译。这对低水平用户有帮助，但如果对所有层级都如此，会带来依赖。

更合理的原则是：

- Band 4.0-5.0：允许双语支持，必要时给全文翻译
- Band 5.5-6.0：优先关键词释义和关键句解释，不默认整篇翻译
- Band 6.5+：只给证据定位和 paraphrase 解释，翻译按需提供

### 7. 目前对“时间”和“稳定性”的训练不够

IELTS 是强时间压力考试，尤其 Reading 和 Writing。

当前技能说明中，虽然偶尔提到时长，但整体上还没有把这些关键指标系统化：

- response time
- 完成时长
- 每分钟阅读量
- Part 2 实际说满时长
- 听力一次听懂率
- 写作 20 分钟 / 40 分钟稳定性

如果这些指标不进入数据层，系统只能知道“答得对不对”，却不知道“是否具备考试场景下的稳定输出能力”。

---

## 3.2 工程实现层面的不足

这一部分也很关键，因为很多教学设计虽然写在 skill 里，但底层实际上还支撑不了。

### 1. `assessment` 和 `planner` 想做的事情，比 `tracker_db.js` 现在能查到的更多

比如评估文档里提到了很多查询需求：

- 按 `since 7d` 统计 errors
- 按 category 聚合
- 按 skill 精确筛 Speaking/Reading/Listening
- 推断 question type 弱项

但当前 `tracker_db.js` 实际能提供的数据仍然比较有限，很多字段和查询能力不够用。

这意味着：

- 评估逻辑在文档上是完整的
- 在数据上却还没有完全落地

### 2. 文档和脚本接口存在不一致

从 skills 文档可以看出几个明显风险：

- 有的地方仍然写 `.py`，实际脚本已经是 `.js`
- `data/SKILL.md` 里的部分 `add-plan` 示例参数，与 `tracker_db.js` 真正支持的参数不一致
- `assessment` / `planner` 中描述的查询选项，并不完全对应现有 CLI

这类不一致会直接导致：

- 计划生成逻辑无法真正执行
- 自动评估可能写不出完整数据
- 后续开发者会误判系统能力边界

### 3. `flashcard` 的同步链路存在潜在阻塞

`flashcard/scripts/sync_word.js` 目前指向的 `vocab_db.js` 路径与当前 bundle 结构并不一致，这会让“先写 JSON 再同步到 vocab.db”这条链路存在失败风险。

如果这个链路不稳，会出现一个很糟糕的教学后果：

- 用户以为单词已经进入复习系统
- 实际并没有被纳入 SRS

这类问题虽然是工程 bug，但直接破坏学习闭环，优先级很高。

### 4. 目前 sample schema 还不够支撑精细教学

当前 `samples` 表已经有：

- `skill_type`
- `band_*`
- `feedback`
- `difficulty_switches`
- `translation`

这已经不错，但还不够。

至少还应该考虑扩展：

- `mode`：当前是 full task 还是 micro drill
- `question_type`：T/F/NG, form completion, cue card, Task 1 process 等
- `timed`：是否限时
- `duration_sec`
- `accuracy_raw`
- `response_length_words`
- `audio_meta`
- `accent`
- `speaker_count`
- `redo_count`
- `self_correction_count`
- `support_level`
- `difficulty_level`

没有这些字段，后面很多“个性化调度”都会变成拍脑袋。

---

## 4. 当前方案最值得保留的设计

虽然上面说了很多不足，但有几件事我认为必须保留，甚至应该强化。

### 1. `SOUL + memory + data` 的三层结构

这个结构非常对：

- `USER` 和 `MEMORY` 负责稳定画像
- `data` 负责真实练习记录
- skill 负责训练协议

这个设计比把所有状态都堆在记忆文件里要健康得多。

### 2. 写作和口语都用 4D IELTS 评分

这符合真实考试维度，应该继续保留。

但需要升级为：

- 4D 分数
- 证据句
- 核心问题标签
- 下一步微训练建议

### 3. 训练前读取 MEMORY 和 USER

这是做个性化训练的关键，不要去掉。

但现在还要再加一层：

- 不只读 `MEMORY`
- 还要读最近 3 到 5 次 session 的行为数据

也就是：

- MEMORY 负责长期画像
- recent samples 负责短期状态

### 4. 统一的训练流程模板

`training_flow.md` 的思路对，说明系统已经想往统一协议发展。

下一步不是推翻它，而是把它升级成：

1. 评估
2. 任务
3. 反馈
4. 纠错 drill
5. redo
6. 入库
7. 复习调度

---

## 5. 建议升级后的总学习闭环

我建议把整套 IELTS 系统重构为下面这条闭环：

1. 初始建档
2. 两阶段水平测试
3. 生成初始能力画像
4. 每日训练进入某个“子技能模式”
5. 练习后即刻反馈
6. 针对错误做 micro drill
7. 立即 redo 或 transfer
8. 把错误和表现写入 DB
9. 每周更新计划
10. 每两周做一次更完整的 checkpoint

### 每次训练的统一 Workflow

我建议所有 skills 统一采用下面这套主流程：

1. 读取 `USER + MEMORY + recent samples + recent errors`
2. 决定本次训练的 `skill + mode + difficulty`
3. 如果需要，做 30-90 秒预热
4. 执行主任务
5. 给出分数或准确率
6. 只讲最关键的 1 到 3 个问题
7. 立刻做针对性 mini drill
8. 让用户马上 redo
9. 将本次 session 的主任务和 redo 都记录
10. 把需要延迟复习的点写入计划或词汇系统

这个主流程一旦统一，所有技能的体验和数据口径都会稳定很多。

---

## 6. 初始水平测试应该怎么改

## 6.1 改成“两阶段测评”

### 阶段 A：快速分层

目标：5 到 8 分钟内知道用户大概在哪一档。

建议内容：

| 技能 | 任务 | 目的 |
|---|---|---|
| Speaking | 3 个 Part 1 简答 + 1 个 20 秒语音 | 看开口意愿、句长、基础流利度 |
| Listening | 2 个句子精听 + 1 段 25-35 秒短音频 | 看底层辨音和整体理解 |
| Reading | 120-180 词短文 + 3 题 | 看基础阅读和定位能力 |
| Writing | 60-90 词短段落 | 看基本句法和组织 |
| Lex/Grammar | 6-10 个自适应小题 | 看基础语言控制力 |

阶段 A 的目标不是精确出分，而是确定：

- Foundation：Band 4.5 以下
- Developing：Band 4.5-6.0
- Advancing：Band 6.0-7.0
- Refinement：Band 7.0+

### 阶段 B：校准测评

目标：在前 3 到 5 次真实训练中，补齐更准的技能画像。

做法：

1. 第 1 次 Speaking 必须尽量收语音，不只收文字。
2. 第 1 次 Listening 必须包含一句听写。
3. 第 1 次 Reading 必须包含定位题和推理题。
4. 第 1 次 Writing 不能只有自由写作，要看是否会组织段落。

最终第一周结束后，系统再把初始画像稳定下来。

## 6.2 初始画像不该只有 4 个 band

我建议初始画像至少包含：

| 维度 | 示例 |
|---|---|
| Overall range | 5.0-5.5 |
| Writing | 5.5 |
| Speaking | 4.5-5.0 |
| Listening | 5.0 |
| Reading | 6.0 |
| Vocabulary control | B1/B2 过渡 |
| Grammar control | 简单句稳定，复杂句不稳 |
| Fluency | moderate |
| Pronunciation risk | word stress / consonant cluster |
| Reading pace | slow / moderate / fast |
| Listening mode risk | digits, distractors, paraphrase |
| Writing risk | task response / cohesion / grammar |

### 6.3 初始测评输出应该这样写

不要输出单一结论，建议输出：

1. 当前 band 区间
2. 置信度
3. 四项最强和最弱
4. 第一周建议练什么

例如：

`当前估计 Overall 5.0-5.5，Reading 明显强于 Speaking。第一周先用低压口语 + 精听训练建立稳定输出。`

---

## 7. Speaking 训练的完整方案

当前 `speaking` 只有 exam-style 练习，这不够。口语应该拆成多个模式，并根据用户水平切换。

## 7.1 Speaking 应有的训练模式

### 模式 1：Shadowing / 跟读

适合：

- Band 4.5 以下
- 发音不稳
- 语速慢、句子不成型

目标：

- 模仿节奏
- 解决连读、重音、停顿
- 建立“完整句”的口腔记忆

### 模式 2：Guided Q&A / 引导式问答

适合：

- Band 4.5-5.5

目标：

- 从单句回答过渡到两三句回答
- 学会用 because / for example / however 展开

### 模式 3：Examiner Simulation / 考官模拟

适合：

- Band 5.5 以上

目标：

- 练 Part 1 / 2 / 3
- 控制时长
- 处理抽象问题

### 模式 4：Cue Card Build / 口语提纲构建

适合：

- Part 2 不会组织内容的人

目标：

- 学会用 4 点骨架说满 1 到 2 分钟

### 模式 5：Role-play / 对话练习

适合：

- 害怕开口
- 需要低压力练反应的人

目标：

- 让用户在互动里说完整句
- 训练 turn-taking 和即时反应

### 模式 6：Retell / 复述

适合：

- 从 Listening/Reading 向 Speaking 迁移

目标：

- 把输入转成输出
- 练 paraphrase 和信息组织

## 7.2 Speaking 的难度调节规则

| 水平 | 题目类型 | 目标回答时长 | 支架程度 | 追问数量 | 语言支持 |
|---|---|---|---|---|---|
| Band 3.5-4.5 | 熟悉话题，生活化 | 10-20 秒 | 高 | 0-1 | 中英双语 |
| Band 5.0-6.0 | 半熟悉话题，简单抽象 | 20-45 秒 | 中 | 1-2 | 以英文为主 |
| Band 6.5+ | 抽象、比较、社会议题 | 45-90 秒 | 低 | 2-4 | 基本全英文 |

### Speaking 升级条件

满足下面任意两条，可以升一级：

1. 连续 3 次回答达到目标时长的 80% 以上
2. Fluency 和 Grammar 连续两次不低于当前 level 预期
3. 追问下仍能保持基本连贯

### Speaking 降级条件

满足下面任意两条，应临时降一级：

1. 回答长度长期低于目标一半
2. 同一话题连续两次严重卡壳
3. 发音或语法错误多到影响理解

## 7.3 Speaking 的推荐 Workflow

1. 读取最近 5 次 speaking 数据，确定本次模式。
2. 如果用户近期低迷，先做 30 秒跟读热身。
3. 给出题目，并根据 level 决定是否提供回答骨架。
4. 用户用语音回答，文字只作为兜底。
5. 评分时除了 4D，还要记录：
   `answer_length / pause_load / self_correction / pronunciation_risk`
6. 反馈只抓最重要的 1 到 2 个问题。
7. 立刻做一个 micro drill。
8. 让用户马上 redo 同题或相近题。
9. 给一个更高 band 的短示范，但不能太长。
10. 把 redo 表现和第一次回答一起记录。

## 7.4 Speaking 的 micro drill 设计

### 跟读 drill

- 给一条 8-14 词标准句
- TTS 播放
- 用户跟读
- 系统只纠一个重点：重音、连读、尾音、停顿

### 扩展 drill

给用户一个基础句，让他扩成两句或三句。

例如：

- 原句：`I like studying at night.`
- 扩展目标：加原因和例子

### 重说 drill

用户刚刚说过的回答，不改题，只改一个问题点：

- 语法错，就重说正确版本
- 太短，就加一个例子
- 逻辑弱，就先说观点再解释

## 7.5 Speaking 特别建议

1. 低水平用户不要一上来就 full Part 3。
2. Text input 可以接受，但下一轮要优先拉回语音。
3. 每 3 到 4 次 speaking，至少安排 1 次 shadowing 或 retell。
4. Pronunciation 不能只给 IPA，要有可模仿的短音频。
5. 对高水平用户，要减少模板化表达，增加抽象追问。

---

## 8. Listening 训练的完整方案

当前 `listening` 的方向是对的，但还不是真正完整的听力体系。

IELTS 听力至少要覆盖三个层次：

1. Bottom-up：辨音、听词、听句
2. Mid-level：信息定位、同义替换、细节抓取
3. Top-down：主旨、结构、说话人意图

## 8.1 Listening 应有的训练模式

### 模式 1：Sound / Phrase Drill

适合：

- Band 4.5 以下
- 听不清词边界

目标：

- 解决连读、弱读、数字、日期、拼写

### 模式 2：Sentence Dictation

适合：

- Band 4.5-5.5

目标：

- 提升对句子骨架的抓取能力

### 模式 3：Short Clip Comprehension

适合：

- 所有 level

目标：

- 练 gist + detail

### 模式 4：Question Type Drill

适合：

- 备考阶段

目标：

- form completion
- note completion
- multiple choice
- matching
- map / labeling

### 模式 5：Lecture / Multi-speaker Simulation

适合：

- Band 6.0+

目标：

- 长音频处理
- 干扰项判断
- 转折信息捕捉

## 8.2 Listening 的难度调节规则

| 水平 | 语速 | 音频长度 | 说话人数量 | 句法复杂度 | 题目数量 |
|---|---|---|---|---|---|
| Band 3.5-4.5 | 90-110 wpm | 1 句到 30 秒 | 1 | 简单句为主 | 1-3 |
| Band 5.0-6.0 | 110-140 wpm | 40-80 秒 | 1-2 | 含从句与同义替换 | 3-5 |
| Band 6.5+ | 140-170 wpm | 90-180 秒 | 2-3 | 学术表达、转折密集 | 5-8 |

### Listening 复杂度决定因素

每次选题时，系统不应只看 band，还要看：

1. 最近 3 次是否总在细节题丢分
2. 用户更怕单人 monologue 还是多人对话
3. 用户是否经常被数字、拼写、专有名词卡住
4. 用户是否能处理 paraphrase

## 8.3 Listening 的推荐 Workflow

1. 读取 listening band、最近正确率、最近错题类型。
2. 决定本次模式：辨音、精听、短讲座、题型 drill 或模拟。
3. 如果是低水平用户，先给 0 到 1 个必要关键词，不要每次硬塞 3 个生词。
4. 第一遍先做 gist。
5. 第二遍做 detail。
6. 用户答题后，系统指出：
   - 错因是没听到
   - 还是听到了但没理解
   - 还是理解了但被干扰项带偏
7. 抽取 1 到 2 个关键句做 micro listening drill。
8. 再给 transcript。
9. 最后做一个 transfer 动作：
   - 复述一句
   - 补写一个空
   - 用听到的表达造句

## 8.4 Listening 的 micro drill 设计

### 精听回放

- 只截关键句
- 最多重复 2 到 3 次
- 用户写关键词或复述

### 听写 drill

适合低中段用户，尤其适合提升：

- 单词边界感
- 功能词识别
- 拼写

### Paraphrase drill

把原音频中的表达和题目中的 paraphrase 对齐，告诉用户：

- 音频说的是 `essential`
- 题干写的是 `necessary`

这是 IELTS 听力和阅读提分的关键能力。

## 8.5 Listening 特别建议

1. 不要默认所有听力都用 transcript 收尾。
2. 对高水平用户，先给 evidence line，不给整段翻译。
3. 每周至少安排一次 `dictation` 或 `keyword capture`。
4. 口音训练要循序渐进：
   - 先标准口音
   - 再英澳差异
   - 最后多口音混合
5. `harder / easier` 不应该只是长度变化，也应调整：
   - 语速
   - 干扰项
   - 题型
   - 说话人数

---

## 9. Reading 训练的完整方案

当前 `reading` 最大的问题是“只像在做一篇简化版短文题”，还不像真正的 IELTS 阅读训练。

IELTS 阅读至少要训练五件事：

1. 读得懂
2. 找得到
3. 识别 paraphrase
4. 在时间内完成
5. 按题型作答

## 9.1 Reading 应有的训练模式

### 模式 1：Short Passage Foundation

适合：

- Band 4.5 以下

目标：

- 稳定基础理解
- 建立 evidence 定位习惯

### 模式 2：Question-Type Drill

适合：

- 所有备考用户

目标：

- 专练 T/F/NG
- 专练 headings
- 专练 matching information
- 专练 summary completion

### 模式 3：Paraphrase Mapping

适合：

- Band 5.0-6.5

目标：

- 训练题目和原文的同义改写识别

### 模式 4：Timed Passage

适合：

- Band 5.5+

目标：

- 提升速度与稳定性

### 模式 5：Exam Mini-set

适合：

- 冲刺阶段

目标：

- 一次处理多个段落和多题型

## 9.2 Reading 的难度调节规则

| 水平 | 篇幅 | 段落数 | 题型 | 时间压力 | 翻译支持 |
|---|---|---|---|---|---|
| Band 3.5-4.5 | 120-220 词 | 2-3 | T/F/NG, fill, MC | 低 | 可提供 |
| Band 5.0-6.0 | 250-450 词 | 3-5 | 加入 matching / summary | 中 | 只给关键解释 |
| Band 6.5+ | 600-900 词 | 5-7 | 题型混合 | 高 | 默认不整篇翻译 |

### Reading 升级规则

用户连续 3 次满足以下条件，可以升难度：

1. 正确率 >= 80%
2. evidence 定位稳定
3. 完成时间在目标范围内

### Reading 降级规则

1. 连续两次低于 50%
2. 不是读不懂，而是完全找不到定位点
3. 被题型困住，而不是语言本身太难

这类情况要优先切回 question-type drill，而不是一味缩短文章。

## 9.3 Reading 的推荐 Workflow

1. 读取最近 reading session，判断是语言难度问题还是题型问题。
2. 决定本次用基础短文、题型 drill 还是 timed passage。
3. 给出阅读任务和答题要求。
4. 如果是限时模式，要明确时间。
5. 用户答题后，不只是判对错，还要指出：
   - evidence 在哪里
   - 题干如何 paraphrase 原文
   - 是理解错还是题型判断错
6. 做一个 paraphrase mini drill。
7. 如有必要，再给局部翻译或全文翻译。
8. 入库时记录：
   `question_type / timed / duration / evidence_accuracy`

## 9.4 Reading 特别建议

1. 不建议所有阅读都固定成 `300词 + 3题`。
2. 不建议长期默认提供全文翻译。
3. 对中文背景用户，T/F/NG 和 Heading matching 要单独建训练链。
4. 阅读速度必须单独记录，不然周评看不到进步。
5. 用户熟悉的科技题材不应一刀切禁用。

更好的策略是：

- 熟悉题材用于建立信心
- 中性题材用于过渡
- IELTS 常见社会/教育/环境题材用于正式训练

---

## 10. Writing 训练的完整方案

当前 `writing` 的骨架是对的，但还太像“批改作文”，不像“教写作”。

真正有效的雅思写作系统，不能只让用户反复写整篇作文，而要拆成多个训练单元。

## 10.1 Writing 应有的训练模式

### 模式 1：Sentence Clinic

适合：

- Band 4.5 以下
- 句子错误很多的人

目标：

- 稳定基本句型
- 训练时态、主谓一致、连接词

### 模式 2：Idea + Outline

适合：

- 知道单词但不会组织的人

目标：

- 审题
- 立场
- 段落提纲

### 模式 3：Paragraph Drill

适合：

- Band 5.0-6.0

目标：

- 写完整 body paragraph
- 训练 topic sentence, explanation, example

### 模式 4：Task 1 Drill

适合：

- 需要单独攻克图表写作的人

目标：

- overview
- data grouping
- comparison language

### 模式 5：Task 2 Full Essay

适合：

- Band 5.5+

目标：

- 完整 exam output

### 模式 6：Rewrite Clinic

适合：

- 所有人

目标：

- 把反馈转化成第二版文本

## 10.2 Writing 的难度调节规则

| 水平 | 任务形式 | 目标长度 | 支架程度 | 评分重点 |
|---|---|---|---|---|
| Band 3.5-4.5 | 句子 / 段落 | 50-120 词 | 高 | Grammar + clarity |
| Band 5.0-6.0 | 段落 / mini essay | 120-220 词 | 中 | structure + idea support |
| Band 6.5+ | full task | 150/250+ 词 | 低 | task response + precision + cohesion |

### 关于词汇注入

当前每次都默认注入 3 个词，这对低水平用户可能负担太重。

建议改成：

- 低水平：0 到 1 个 challenge word
- 中水平：1 到 2 个
- 高水平：2 到 3 个，但优先注入 collocation，不是单个孤词

## 10.3 Writing 的推荐 Workflow

1. 判断本次是 full task，还是某个子技能训练。
2. 先做审题：
   - 题型判断
   - 关键词
   - 立场或 overview
3. 让用户先产出提纲或结构。
4. 再让用户写正文。
5. 用 4D 评分，但反馈不能只给分数，要给证据。
6. 不只纠 Top 3 错误，还要指出：
   - 最大提分瓶颈是哪一维
   - 如果只改一件事，下次最该改什么
7. 立刻要求用户重写一个句子或一段。
8. 对高水平用户，再给 band-up example。
9. 记录初稿与改稿差异。

## 10.4 Writing 的微训练设计

### 审题 drill

系统只给题目，让用户判断：

- 这是 opinion / discussion / problem-solution 吗
- 需要几段
- 立场是什么

### Thesis drill

用户只写 introduction 的 thesis 句。

### Paragraph drill

用户只写一个 body paragraph，训练：

- topic sentence
- explanation
- example
- mini conclusion

### Rewrite drill

从自己的原文里抽一句做升级：

- 简单句 -> 复合句
- 笼统词 -> 更准确词
- 逻辑松散 -> 明确连接

## 10.5 Writing 特别建议

1. 不能只做 full Task 2。
2. Task 1 和 Task 2 应分别建成长线。
3. 写作提分最有效的环节之一是 rewrite，必须纳入正式 workflow。
4. 对 5.5 以下用户，先稳 grammar 和 paragraph，再追求“高级表达”。
5. 对 6.5 以上用户，重点应转向：
   - task response 的完整性
   - 精准词汇
   - 逻辑推进
   - 避免模板痕迹

---

## 11. Vocabulary / Flashcard 的完整方案

当前 `flashcard` 的方向是好的，但还停留在“认识/模糊/不认识”的识别层。

建议把词汇系统升级成 5 级路径：

1. Notice：第一次看到
2. Understand：知道意思
3. Recognize：下次看见能认出来
4. Produce：能在说写中用出来
5. Transfer：能在不同主题中自然迁移

## 11.1 推荐的词汇训练模式

### 模式 1：Recognition Card

现在已有，可以保留。

### 模式 2：Collocation Drill

例如：

- make a decision
- pose a threat
- play a crucial role

IELTS 中 collocation 比“背冷词”更重要。

### 模式 3：Gap-fill Retrieval

用户根据中文或语境填英文词。

### 模式 4：Speaking Transfer

要求用户在口语回答里用上目标词或词组。

### 模式 5：Writing Transfer

要求用户在一个句子或一段中自然使用。

## 11.2 Flashcard 的推荐 Workflow

1. 先检查 due words，不要只推新词。
2. 每轮最多 1 个新词 + 1 到 2 个复习词。
3. 新词展示时，除了 definition，还要有：
   - 高频 collocation
   - 一个 IELTS 风格例句
   - 一个用户兴趣相关例句
4. 用户做 recognition 后，不要就结束。
5. 下一步应该至少安排一个 production 行为：
   - 造句
   - 选搭配
   - 口语里用一次
6. 后续 speaking/writing 要优先复用最近学过的词。

## 11.3 词汇系统特别建议

1. 低水平用户不要追求生僻词。
2. 高频功能搭配优先于漂亮但低频的单词。
3. `production_count` 很重要，必须当核心指标。
4. 一个词只有在说或写中用出来，才算真正进入长期记忆。

---

## 12. Planner / Daily / Assessment 应该如何联动

这三个模块现在都有了，但还需要更紧密地联动。

## 12.1 Weekly Planner 应该输出什么

周计划不应该只写：

- primary focus: writing

而应该细化到：

- 主技能：Speaking
- 子技能：Part 2 development
- 核心问题：answer too short
- 训练组合：
  - 2 次 cue card build
  - 1 次 shadowing
  - 1 次 examiner simulation
  - 1 次 retell

更合理的计划字段包括：

| 字段 | 含义 |
|---|---|
| primary_skill | 本周主攻技能 |
| secondary_skill | 次重点技能 |
| primary_subskill | 具体子技能 |
| training_modes | 本周推荐模式组合 |
| weekly_target | 量化目标 |
| carry_over_errors | 需要持续盯的错误 |

## 12.2 Daily Briefing 不该只是“晨报”

建议把 `daily` 变成真正的 3 分钟微训练入口，轮换以下格式：

1. 一个词组 + 一个例句 + 让用户改写
2. 一句精听 + 让用户听写
3. 一个 reading paraphrase 对照
4. 一个 speaking warm-up question
5. 一个 writing thesis drill

这样 daily 才会真正服务提分，而不只是运营通知。

## 12.3 Assessment 应该输出什么

建议区分三种评估：

### 轻量日评

只做：

- 更新 streak
- 更新最近正确率
- 识别当天主要错误

### 周评

输出：

1. 四项走势
2. 各项主要瓶颈
3. 本周高频错误
4. 是否需要调难度
5. 下周训练组合

### 双周 checkpoint

更像正式小测，要包含：

- 四项 mini mock
- 上次到这次的变化
- band 区间变化
- confidence 变化

---

## 13. 推荐周计划模板

下面给出三个最实用的周计划模板。真正执行时，planner 不应直接照抄，而应根据 `target band / timeline / weakest subskill / recent fatigue` 做微调。

## 13.1 起点较低用户

适用人群：

- 当前 Overall 约 4.0-5.0
- 目标 5.5-6.0
- 主要问题是“不敢开口、句子不稳、听不清、读太慢”

### 推荐周结构

| 天 | 任务组合 | 核心目标 |
|---|---|---|
| Day 1 | Speaking shadowing + guided QA | 建立开口稳定性 |
| Day 2 | Listening dictation + short clip | 提升辨音和关键词抓取 |
| Day 3 | Reading short passage + T/F/NG | 建立定位习惯 |
| Day 4 | Writing sentence clinic + paragraph drill | 稳住语法与段落 |
| Day 5 | Speaking role-play + retell | 从输入迁移到输出 |
| Day 6 | Listening + Reading mixed review | 巩固本周错点 |
| Day 7 | 轻量 assessment + 下周计划 | 校准难度 |

### 时间分配建议

- Speaking：25%
- Listening：25%
- Reading：20%
- Writing：20%
- Vocabulary / review：10%

### 这一类用户的核心原则

1. 不要天天 full task。
2. 每天都要有短输出。
3. 每周至少 2 次跟读或听写。
4. 先建立稳定感，再追求速度和高级表达。

## 13.2 中段冲分用户

适用人群：

- 当前 Overall 约 5.5-6.5
- 目标 6.5-7.0
- 主要问题是“基础有了，但表现不稳定”

### 推荐周结构

| 天 | 任务组合 | 核心目标 |
|---|---|---|
| Day 1 | Writing Task 2 outline + full paragraph | 强化结构与展开 |
| Day 2 | Listening question-type drill | 强化题型稳定性 |
| Day 3 | Speaking cue card + redo | 提升时长与组织 |
| Day 4 | Reading timed passage | 提升速度与 evidence 定位 |
| Day 5 | Writing rewrite clinic | 把反馈转成产出 |
| Day 6 | Speaking examiner simulation + Part 3 | 提升抽象表达 |
| Day 7 | Mini checkpoint | 检查波动来源 |

### 时间分配建议

- 弱项技能：40%
- 次弱项技能：25%
- 维持技能：20%
- Vocabulary / review：15%

### 这一类用户的核心原则

1. 多做限时训练。
2. 多做题型专项。
3. 所有反馈都要跟 redo。
4. 强化 paraphrase、论证、Part 2/3 稳定性。

## 13.3 高分打磨用户

适用人群：

- 当前 Overall 约 6.5-7.5
- 目标 7.0-8.0
- 主要问题是“小错多、表达够但不够精、遇到压力波动”

### 推荐周结构

| 天 | 任务组合 | 核心目标 |
|---|---|---|
| Day 1 | Speaking Part 3 deep discussion | 提升抽象表达与逻辑推进 |
| Day 2 | Listening lecture / multi-speaker | 处理高密度信息 |
| Day 3 | Reading mixed set under time pressure | 稳住速度与正确率 |
| Day 4 | Writing Task 1 precision + Task 2 thesis | 提升精准度 |
| Day 5 | Writing full task + rewrite | 拉高上限 |
| Day 6 | Speaking pronunciation polish + retell | 压低小错误 |
| Day 7 | Full mini mock | 检查考试稳定性 |

### 这一类用户的核心原则

1. 不要把时间都花在背新词上。
2. 更要练稳定性、精准度、时间管理。
3. 反馈要从“大方向”转向“细微扣分点”。
4. 每周至少一次小型模拟，避免真实考试掉链子。

---

## 14. 数据结构与错误分类还需要补什么

## 14.1 `samples` 表建议增加字段

| 字段 | 用途 |
|---|---|
| `mode` | shadowing / dictation / full_task / paragraph / cue_card 等 |
| `question_type` | T/F/NG, form completion, Part 2, Task 1 line graph 等 |
| `topic` | 便于分析是否题材依赖 |
| `difficulty_level` | 当前实际难度 |
| `timed` | 是否限时 |
| `duration_sec` | 实际耗时 |
| `response_length_words` | 输出长度 |
| `accuracy_raw` | 例如 7/10 |
| `support_level` | 高/中/低支架 |
| `redo_count` | 是否做了二次纠错 |
| `self_correction_count` | 用户自我修正能力 |
| `accent` | listening 口音 |
| `speaker_count` | listening 说话人数 |
| `transcript_used` | 是否已看 transcript |
| `translation_used` | 是否看了翻译 |

## 14.2 错误 taxonomy 也应扩展

当前 taxonomy 适合 grammar / lexical / discourse 的一般归类，但对 IELTS 还不够细。

建议新增或细分：

### Listening

- `missed_number`
- `missed_spelling`
- `paraphrase_miss`
- `distractor_trap`
- `speaker_switch_confusion`

### Reading

- `tfng_logic_error`
- `heading_mismatch`
- `keyword_matching_error`
- `location_failure`
- `inference_overreach`

### Writing

- `task1_overview_missing`
- `task1_data_selection`
- `task2_position_unclear`
- `task2_support_insufficient`
- `cohesion_overlinking`

### Speaking

- `answer_underdeveloped`
- `hesitation_breakdown`
- `repair_failure`
- `part2_structure_weak`
- `part3_abstraction_gap`

这些标签一旦齐全，planner 才能真的推对子技能。

---

## 15. 推荐的落地优先级

## P0：必须先修，不修就会影响整体可行性

1. 修正文档与真实脚本接口不一致的问题。
2. 修复 `flashcard -> vocab.db` 的同步链路。
3. 明确 `assessment` 真正可依赖的数据字段和查询能力。
4. 把初始测评改成技能分层而不是整体外推。

## P1：最能提升教学效果的升级

1. 给 Speaking 增加 `shadowing / role-play / retell / cue-card build`
2. 给 Listening 增加 `dictation / paraphrase / question-type drill`
3. 给 Writing 增加 `outline / paragraph / rewrite clinic`
4. 给 Reading 增加 `question-type drill + timed mode`
5. 把“反馈后立刻 redo”变成统一标准流程

## P2：把系统从能用升级到好用

1. Planner 改成子技能级别
2. Daily 改成 3 分钟微训练
3. 基于最近表现自动调难度
4. 词汇系统与 speaking/writing 联动

## P3：冲刺高分用户时必须补的能力

1. Speaking Part 3 抽象讨论链
2. Listening 多口音与 lecture handling
3. Reading 多题型混合 + 强时间压力
4. Writing 高分表达精准度与逻辑推进

---

## 16. 我建议的最低可发布标准

如果想把这套 IELTS bundle 作为“完整学习系统”发布，我认为至少要满足下面这些条件：

1. 初测能输出技能分层，而不是只靠写作外推。
2. Speaking 至少有 4 种模式：
   `shadowing / guided QA / cue card / examiner simulation`
3. Listening 至少有 4 种模式：
   `dictation / short clip / question-type drill / mini simulation`
4. Reading 能区分题型训练和整篇训练。
5. Writing 不只有 full essay，还要有 paragraph 和 rewrite。
6. 词汇系统能跟 speaking/writing 联动。
7. 每次训练都有：
   `主任务 -> 反馈 -> micro drill -> redo -> 入库`
8. 周计划能细化到子技能，不只到大技能。
9. 评估报告里要给：
   `band range + confidence + top weaknesses + next actions`
10. 底层数据字段足够支撑以上能力。

---

## 17. 最后建议

从教育效果看，这套系统最值得做的不是“继续堆更多题”，而是做三件事：

1. 把诊断做细。
2. 把每个技能拆成真正可训练的子能力。
3. 把反馈做成闭环，而不是一次性点评。

如果按我上面的优先级推进，我会建议先走这条路线：

1. 修数据与接口一致性
2. 重做初始测评
3. 先把 Speaking 和 Listening 做成真正的多模式训练
4. 再把 Writing 和 Reading 从“刷题”升级为“分技能训练”
5. 最后再做 planner、daily、checkpoint 的智能联动

这样改完之后，这套 `src/skills/bundled/ielts` 就不再只是一个“会陪练的机器人”，而会更像一个真正有分层、有诊断、有提分逻辑的 IELTS 教练系统。

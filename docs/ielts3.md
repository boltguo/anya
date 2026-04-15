# 雅思智能教练 Anya (v3) - 终极教学系统重构与全链路执行蓝图

> **前言**：在充分吸收并推翻了之前粗颗粒度的分析（v1 & v2），并重新审视了《IELTS 技能体系深度改进方案》的核心精髓后，本版本（v3）不再仅仅停留在“指出问题”和“给出宏观方向”，而是**直接输出可被大语言模型（LLM Agent）和代码逻辑执行的底层 Workflow 与状态机（State Machine）定义**。
>
> 我们的目标是将 Anya 从“考试模拟器”彻底升级为具备“支架式教学（Scaffolding）”、“间隔重复（SR）”与“刻意练习（Deliberate Practice）”闭环的**自适应闭环教练**。

---

## 0. 核心架构跃迁：从“单步问答”到“10 步闭环训练流”

当前系统中所有技能（听说读写）的致命伤在于“给题 -> 判分 -> 结束”。为了实现真正意义上的提分，**所有的 `SKILL.md` 必须重构为统一的 10 步状态机（10-Step Adaptive Workflow）**：

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Context Loading    : 读取 USER + MEMORY + Recent 5 errors │
│ 2. Decision Engine    : 决定 训练模式(Mode) + 难度(Difficulty)│
│ 3. Warm-up (Optional) : 针对上节课弱项的 30 秒快测             │
│ 4. Scaffolded Input   : 提供支架支持（如：预给核心词/思维导图） │
│ 5. Main Task          : 执行主任务（听/说/读/写）              │
│ 6. 4D Scoring & Diff  : 给分，并做错误高亮比对（Diff Highlight）│
│ 7. Focused Feedback   : 抓大放小，只针对 1-2 个核心瓶颈输出反馈  │
│ 8. Micro Drill        : 针对反馈问题，当场做 1 个微型针对性练习  │
│ 9. Forced Redo        : 强制重写/重录（Rewrite/Rerecord）      │
│ 10. Memory Sync       : 入库 `tracker_db` 并安排下一次 SRS 复习│
└─────────────────────────────────────────────────────────────┘
```

_注：第 8、9 步（Micro Drill 与 Forced Redo）是 v3 方案的绝对核心，没有重做，就没有教学。_

---

## 1. 🎯 初始测评 (Start): 两阶段自适应定级 (IRT)

彻底废弃“写三句话定四项分数”的荒谬逻辑。引入基于 IRT（项目反应理论）的**动态分层漏斗**。

### 阶段 A: 快速探底（5 分钟）- 确定 Band 大区间

- **Step 1: 词汇语法快筛（选择题）**
  - _机制_：初始推送 3 道 Band 5.5 难度的语法题（时态、从句）。全对升档推 Band 6.5（倒装、虚拟）；错题降档推 Band 4.5（基础时态）。
- **Step 2: 听写短击 (Dictation)**
  - _机制_：播放一句 15 词左右的英文短句，用户盲写。测定“单词边界感”和“拼写”。
- **Step 3: 影子口语 (Shadowing)**
  - _机制_：要求用户复述 Step 2 听到的句子。初步判定发音重音（Pronunciation risk）。

### 阶段 B: 校准期（前 3 次正式训练）

- 不在第一天给出死磕的分数，而是给出区间及置信度：
  - _输出范例_：“目前推测你的 Overall 处于 **5.0-5.5 (置信度：低)**。在接下来的3次正式听读写练习中，Anya 会不断收敛并确诊你的精准短板。”

---

## 2. 🗣️ 口语 (Speaking): 告别单口相声，引入“对抗与纠音”

口语绝不能一上来就丢 Part 2 题卡。按照水平切分训练模式：

### 模式矩阵 (Mode Matrix)

| 水平 (Band)   | 核心模式                             | 目标与指标                              | 支架程度 (Scaffolding)   |
| :------------ | :----------------------------------- | :-------------------------------------- | :----------------------- |
| **< 5.0**     | **Shadowing (影子跟读)** & Guided QA | 肌肉记忆，纠正重音与连读 (wanna, gonna) | 极高（给完整句子让其读） |
| **5.0 - 6.0** | **Cue Card Build (提纲构建)**        | 结构化输出，连续说满 45 秒              | 中等（给关键词骨架）     |
| **6.5+**      | **Mock & Probe (高压抗压模拟)**      | 抽象逻辑，流利度，长难句即兴表达        | 零（直接抛抽象社会议题） |

### 核心 Workflow 演示：Mock & Probe (针对 6.5+ 冲刺)

1.  **Anya 出题**："Do you think AI will eventually replace human teachers?"
2.  **用户回答 (语音 40s)**："I think so because AI is very smart and can answer everything quickly."
3.  **Anya 攻击性追问 (Interruption)**："Interesting point about speed. **However**, doesn't education also require emotional intelligence and empathy, which AI lacks? **How would you respond to that?**" (强制用户在压力下组织反驳)。
4.  **Micro Drill**：系统提取用户刚才结巴的地方，给出高分句型（e.g., "While it is true that... we cannot overlook the fact that..."），要求立刻用该句型重说一遍。

---

## 3. 🎧 听力 (Listening): 从“泛听做题”到“解码重构”

听不懂的本质是“发音解码失败（听不出连读/弱读）”和“同义替换（Paraphrase）未识别”。

### 模式矩阵 (Mode Matrix)

| 维度         | Band 3.5 - 4.5 (基础)       | Band 5.0 - 6.0 (进阶)        | Band 6.5+ (高阶)                  |
| :----------- | :-------------------------- | :--------------------------- | :-------------------------------- |
| **音频特征** | 30s，100wpm，标准发音，单人 | 60s，120wpm，含从句，双人    | 3分钟，150wpm，混合口音(英/澳/印) |
| **核心模式** | **Dictation (精听盲写)**    | **Short Clip Comprehension** | **Lecture Note-taking**           |
| **翻译策略** | 默认给全文翻译              | 只翻译出错的关键句           | **不给翻译**，只给 Evidence line  |

### 核心 Workflow 演示：Dictation & Paraphrase Drill

1.  **盲写任务**：TTS 播放：“The library closes at six o'clock on weekdays.” 用户输入文本。
2.  **Diff 对比高亮**：系统严苛对比。如果用户写了 "close at 6 o'clock"，系统高亮红色标注 `closes` (漏掉第三人称单数) 和 `six` (雅思听力拼写规范)。
3.  **同义替换 (Paraphrase Mapping)**：系统提问：“录音里说的是 `essential`，但题目选的是 `necessary`，你认为这两个词在此处是完美替换，还是有语境差别？” 引导用户建立同义词映射肌肉记忆。

---

## 4. 📖 阅读 (Reading): 提速与长难句外科手术

打破“只给 300 词短文答题”的安逸区，还原真实的考场时间压迫感。

### 模式矩阵 (Mode Matrix)

| 模式                              | 适用场景 / 痛点                   | 训练方式                                                     |
| :-------------------------------- | :-------------------------------- | :----------------------------------------------------------- |
| **Flash-Skimming (闪卡略读)**     | 逐字翻译，阅读速度极慢者          | 段落限时展示 30 秒，隐藏后强制选出 Heading (段落大意)。      |
| **Sentence Anatomy (长难句解剖)** | 遇复杂从句崩溃，T/F/NG 逻辑错位者 | 抽出文中的“毒瘤”长句，要求用户点选出【主语】和【核心谓语】。 |
| **Timed Exam (高压实战)**         | 备考冲刺期                        | 900 词完整篇幅，严格倒计时 15 分钟强行收卷。                 |

### 核心 Workflow 演示：长难句解剖 (Sentence Anatomy)

1.  **错题溯源**：用户某道题选错了。Anya 提取出导致该题错误的那个超长复合句。
2.  **枝干分离**：Anya 提问：“在这个句子里，'which was largely ignored by the committee' 是修饰谁的？”
3.  **苏格拉底反问**：针对 T/F/NG 错题，Anya 问：“你选了 False。但题目用的是 `some`，原文用的是 `the majority`，它们是绝对矛盾的，还是包含关系？”逼迫用户建立严密的逻辑链。

---

## 5. ✍️ 写作 (Writing): 废除裸写，建立“支架与重写”闭环

直接让学生写 250 词是对学习热情的抹杀。写作必须是“搭积木”的过程。

### 模式矩阵 (Mode Matrix)

| 阶段           | 核心模式                      | 痛点解决           | 交互逻辑                                                                                |
| :------------- | :---------------------------- | :----------------- | :-------------------------------------------------------------------------------------- |
| **冷启动**     | **Brainstorming (思路脑暴)**  | 拿到题目大脑空白   | 不允许写正文，只许用中文/简单英文列出 2 个支持论点。Anya 负责将其“翻译”为雅思高分词块。 |
| **段落微操**   | **TEEL Paragraph Drill**      | 逻辑散乱，不会举例 | 强制用户按 T(主题句)-E(解释)-E(举例)-L(总结) 的格式分别填空提交。                       |
| **全篇与闭环** | **Forced Rewrite (强制重写)** | 看完批改下次还错   | **不重写完不准下课**。                                                                  |

### 核心 Workflow 演示：Forced Rewrite Loop

1.  **输出初稿**：用户在经过脑暴后，输出了一段 100 词的 Body Paragraph。
2.  **4D 评分与高压反馈**：Anya 给出 5.5 分。点评：“你的 Example 很好，但缺少连接词。此外，'bad' 这个词太低级。”
3.  **Micro Drill**：“在修改之前，用 'detrimental' 替换 'bad'，造一个句子。”
4.  **强制重写**：“现在，带着新的连接词 (Consequently) 和高级词汇 (detrimental)，**把整个段落重写一遍发给我**。”
5.  **AI 对比验收**：如果达到 6.5 水平，Anya 庆祝（Waku Waku）并结束 Session；如果不行，继续打回。

---

## 6. 🧠 词汇 (Vocab & Flashcard): 生产性迁移体系

孤立的闪卡没有意义，词汇必须在听说读写中流动。

- **Level 1 (Notice - 闪卡识别)**：了解单词 `inevitable` (不可避免的)。
- **Level 2 (Collocation - 搭配快练)**：选择题 `_____ consequence` (填入 inevitable)。
- **Level 3 (Speaking Transfer - 口语迁移)**：在口语 Mock 中，Anya 要求：“回答下个问题时，必须用上今天学的 `inevitable`”。如果不用，判定回答不合格。
- **Level 4 (Writing Transfer)**：在写作脑暴阶段，系统强制将该词作为“挑战词汇 (Challenge Word)”注入 prompt 中。

---

## 7. 🛠 数据底层与代码实现建议 (Action Plan for Engineering)

为支撑以上变态级的教学流，`tracker_db.js/py` 和数据协议必须扩容：

1.  **扩展 `samples` 数据表字段**：
    - 新增 `mode` (如：shadowing, dictation, full_task)
    - 新增 `question_type` (如：TFNG, part2, cue_card)
    - 新增 `duration_sec` (记录实际阅读/答题耗时)
    - 新增 `redo_count` (没有经历 redo 的 sample 权重应被降低)
2.  **扩充 Error Taxonomy (错误标签字典)**：
    - _Speaking_: `pronunciation_stress`, `hesitation_breakdown`, `part3_abstraction_gap`
    - _Reading_: `tfng_logic_error`, `heading_mismatch`, `sentence_anatomy_fail`
    - _Listening_: `distractor_trap`, `paraphrase_miss`, `missed_plural_s`
3.  **状态机引擎 (State Machine Engine)**：
    - 在 Node/TS 适配器层，引入 `state` 字段。例如用户处于 `AWAITING_REWRITE` 状态时，系统会拦截任何新指令，强制其完成当前段落的重写（Rewrite）。

**最终结论**：
按照本蓝图重构 `src/skills/bundled/ielts` 后，Anya 将拥有考官的毒辣眼光（精细诊断）、严师的压迫感（强制重写与追问）、以及慈母的耐心（支架式教学与影子跟读），真正成为不可替代的 AI 雅思私教。

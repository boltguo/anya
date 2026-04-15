# IELTS 技能体系深度改进方案 v2

> 基于对 `src/skills/bundled/ielts/` 全部 skill 文件的逐行分析，以雅思考官与英语教育专家视角撰写。
> 本文档不重复 `docs/ielts.md` 已覆盖的宏观结论，而是聚焦于**每一项练习的具体 workflow 设计**与**可落地的改进细节**。

---

## 0. 总体诊断：当前系统的核心矛盾

当前系统的骨架设计合理（SOUL + Memory + Data 三层、4D 评分、SRS 词汇），但存在一个贯穿所有技能的核心矛盾：

**系统在"出题—做题—判分"的考试模拟模式上做得不错，但在"教学"维度严重不足。**

具体表现为：

1. **没有分技能训练路径**：Speaking 只有 Part 1/2/3，没有跟读、复述、对话等基础训练模式
2. **反馈是终点而非起点**：给完 Top 3 errors 就结束，没有"立即重做"闭环
3. **难度调节只有一个轴**：按 band 粗分三档，实际应调节的维度有 5-8 个
4. **初始测评外推不可靠**：用写作分数代替全技能画像
5. **词汇系统孤立**：flashcard 和听说读写之间缺乏迁移训练
6. **时间维度缺失**：IELTS 是强时间压力考试，但系统不追踪任何时间指标

以下按训练流程顺序，逐项给出具体改进方案。

---

## 1. 初始水平测试（start）

### 1.1 当前问题

- 只用 3 句写作 + 4 道选择题，就推导出四项 band，信度极低
- 程序员用户极易出现"阅读 6.0 / 口语 4.0"的典型不均衡画像，单一外推会让所有后续训练选错难度
- 没有置信度概念，输出的是伪精确的单值分数

### 1.2 改进方案：两阶段测评

#### 阶段 A：快速定位（5-8 分钟）

目标不是精确出分，而是确定用户属于哪个大档：

| 层级 | Band 范围 | 特征 |
|---|---|---|
| Foundation | 3.5-4.5 | 基础句型不稳，听不清单词边界 |
| Developing | 4.5-6.0 | 能表达但不够流利，听读有理解但不准 |
| Advancing | 6.0-7.0 | 基本功扎实，需要精准度和稳定性 |
| Refinement | 7.0+ | 追求高分细节打磨 |

**具体测试任务：**

```
Step 1 — Speaking 快测（90 秒）
  - 3 个 Part 1 简答题（文字回答即可）
  - 如果用户愿意，1 段 20 秒语音
  → 判断：开口意愿、句长、基础语法、流利度层级

Step 2 — Listening 快测（90 秒）
  - 2 个独立句子精听（TTS 播放，用户写出听到的关键词）
  - 1 段 25-35 秒短音频 + 1 个大意题
  → 判断：底层辨音能力、整体理解层级

Step 3 — Reading 快测（2 分钟）
  - 120-180 词短文 + 3 题（T/F/NG 1题 + 填空 1题 + 选择 1题）
  → 判断：基础阅读理解、信息定位能力

Step 4 — Writing 快测（2 分钟）
  - 写 60-90 词短段落（给定话题，不限题型）
  → 判断：基本句法、组织能力、词汇水平

Step 5 — Lex/Grammar 自适应测试（2 分钟）
  - 6-10 个选择题，根据答对情况动态调整难度
  - 覆盖：时态、主谓一致、冠词、从句、搭配
  → 判断：语言控制力的精确层级
```

**阶段 A 输出格式：**

```
当前估计：
- Overall: 5.0-5.5（置信度：中）
- Speaking: 4.5-5.0（置信度：低，仅文字回答）
- Listening: 5.0-5.5（置信度：中）
- Reading: 5.5-6.0（置信度：中）
- Writing: 5.0（置信度：中）
- 语法控制力：简单句稳定，复合句不稳
- 词汇控制力：B1/B2 过渡

注意：以上为初步估计，前 3-5 次正式训练后系统会校准至更准确的画像。
```

关键点：**必须输出区间 + 置信度，不输出伪精确单值。**

#### 阶段 B：校准期（前 1-2 周的正式训练）

在用户开始正式训练后，通过前 3-5 次真实练习补齐画像：

```
规则：
1. 第 1 次 Speaking 必须尝试收语音，不只收文字
2. 第 1 次 Listening 必须包含至少 1 句听写
3. 第 1 次 Reading 必须包含定位题 + 推理题
4. 第 1 次 Writing 必须观察段落组织能力，不只看语法

校准完成条件：
- 四项技能各完成至少 2 次正式练习
- 每项的 band 估计区间收窄到 ±0.5 以内
- 此时将 confidence 标记为"高"，画像正式稳定
```

### 1.3 初始画像数据结构

应至少包含以下维度（写入 MEMORY.md）：

| 维度 | 示例值 | 说明 |
|---|---|---|
| Overall range | 5.0-5.5 | 区间而非单值 |
| Speaking band | 4.5-5.0 | 独立评估 |
| Listening band | 5.0-5.5 | 独立评估 |
| Reading band | 5.5-6.0 | 独立评估 |
| Writing band | 5.0 | 独立评估 |
| Vocabulary CEFR | B1/B2 过渡 | 词汇控制力 |
| Grammar control | 简单句稳定，复合句不稳 | 语法描述 |
| Fluency | moderate | 口语流利度 |
| Pronunciation risk | word_stress, consonant_cluster | 发音风险点 |
| Reading pace | slow / moderate / fast | 阅读速度 |
| Listening risk | digits, paraphrase | 听力易失分点 |
| Writing risk | cohesion, grammar | 写作瓶颈维度 |
| confidence | low / medium / high | 画像可靠程度 |

---

## 2. Speaking 训练完整方案

### 2.1 当前问题

- 只有 Part 1/2/3 考官模拟一种模式
- 对 Band 4.5 以下的用户，直接 Part 2/3 难度过高，容易产生挫败感
- 缺少跟读、复述、对话等基础能力建设模式
- 反馈给完就结束，没有立即重做
- 难度调节只区分 Part 类型，不调节回答时长、支架程度、追问强度

### 2.2 训练模式分层设计

#### 模式 1：Shadowing / 跟读

**适用水平：** Band 3.5-5.0，或发音/流利度明显弱于其他维度的用户

**Workflow：**

```
1. 系统根据用户 band 选择一句 8-14 词的标准句
   - Band 3.5-4.5：简单句，生活话题
     例：「I usually spend my weekends visiting local markets with my family.」
   - Band 5.0-5.5：含从句或连接词
     例：「Although I prefer studying alone, I find group discussions quite useful for exam preparation.」

2. TTS 播放句子（标准语速，清晰发音）

3. 用户跟读（语音回复）

4. 系统只纠正 1 个最重要的发音/节奏问题：
   - 重音位置错误 → 标注正确重音 + TTS 对比
   - 连读缺失 → 示范连读片段 + TTS
   - 停顿位置不对 → 标注意群划分
   - 尾音吞掉 → 提醒并示范

5. 用户再跟读一次（redo）

6. 记录：sentence / pronunciation_issue / redo_quality
```

**每次 shadowing 持续 3-5 分钟，3-5 个句子为一组。**

#### 模式 2：Guided Q&A / 引导式问答

**适用水平：** Band 4.5-5.5

**Workflow：**

```
1. 系统给出 1 个简单的 Part 1 类问题
   例：「Do you prefer cooking at home or eating out?」

2. 如果用户 band < 5.0，提供回答骨架：
   「You can say: I prefer _____ because _____. For example, _____.」

3. 用户回答（语音优先，文字兜底）

4. 系统评估：
   - 回答是否完整（不只是 Yes/No）
   - 是否用了 because / for example 等展开词
   - 语法是否基本正确

5. 如果回答太短（< 2 句），系统引导扩展：
   「Good start! Can you add one reason why?」

6. 给出 1 个纠错点 + 1 个扩展示范

7. 用户重说一遍（redo）

8. 记录：question / answer_length / expansion_used / grammar_issues / redo
```

**目标：从单句回答过渡到 2-3 句有逻辑的回答。**

#### 模式 3：Examiner Simulation / 考官模拟

**适用水平：** Band 5.5+（这是当前已有的模式，但需要增强）

**增强点：**

```
1. 不再只给题 → 等回答 → 判分，而是加入追问：
   - Part 1：主问题 + 1-2 个自然追问
   - Part 2：cue card + follow-up question
   - Part 3：主问题 + 2-3 层递进追问（从具体到抽象）

2. 根据 band 调节追问深度：
   - Band 5.5-6.0：追问停留在"为什么"和"举例"
   - Band 6.5+：追问到"比较"、"推测"、"评价社会影响"

3. 反馈增加行为指标：
   - answer_length_seconds（回答时长）
   - pause_count（明显停顿次数）
   - self_correction_count（自我修正）
   - filler_usage（um, uh, like 等填充词频率）

4. 必须包含 redo 环节
```

#### 模式 4：Cue Card Build / 口语提纲构建

**适用水平：** Part 2 组织能力弱的用户

**Workflow：**

```
1. 系统给出一张 cue card

2. 不直接让用户说，先让用户花 1 分钟列出 4 个要点：
   - What it is / Who
   - When / Where
   - Details / How
   - Why / Feelings

3. 系统检查提纲是否覆盖所有 bullet points

4. 如果缺失，引导补充

5. 用户根据提纲说 1-2 分钟

6. 系统评估：
   - 是否覆盖了所有要点
   - 时长是否达到 1 分钟以上
   - 过渡是否自然

7. 给出 1 个结构改进建议 + 1 个语言改进建议

8. 用户重说一遍（可以只重说薄弱的部分）

9. 记录：cue_card_topic / outline_quality / answer_duration / coverage / redo
```

#### 模式 5：Role-play / 对话练习

**适用水平：** 害怕开口、需要低压力练习反应速度的用户

**Workflow：**

```
1. 系统设定一个生活场景：
   - 在咖啡店点餐
   - 向同事介绍你的周末
   - 帮朋友推荐一部电影
   - 在旅行中问路

2. 系统扮演对话另一方，用户自然回应

3. 对话进行 4-6 轮

4. 系统不在对话中打断纠错，而是对话结束后统一反馈：
   - 表达是否自然
   - 是否有明显语法错误
   - 是否能维持对话（不只是单句回答）

5. 抽取 1-2 个最好的表达 + 1-2 个需要改进的表达

6. 记录：scenario / turn_count / response_naturalness / key_errors
```

#### 模式 6：Retell / 复述

**适用水平：** 所有水平（难度通过原材料复杂度调节）

**Workflow：**

```
1. 系统先给一段输入材料：
   - Band 4-5：2-3 句简单描述 + TTS 音频
   - Band 5-6：一段 80-120 词短文或 40 秒音频
   - Band 6+：一段 150-200 词文章或 60 秒音频/讲座片段

2. 用户用自己的话复述要点（语音优先）

3. 系统评估：
   - 信息完整度（是否覆盖主要内容）
   - paraphrase 能力（是否只是逐词重复）
   - 语言准确度

4. 对比原文和复述，指出：
   - 遗漏了什么关键信息
   - 哪些 paraphrase 做得好
   - 哪些地方可以用更好的表达

5. 让用户补充遗漏的部分（redo 部分内容）

6. 记录：source_type / source_length / coverage_score / paraphrase_quality / redo
```

### 2.3 Speaking 难度调节矩阵

| 维度 | Band 3.5-4.5 | Band 5.0-6.0 | Band 6.5+ |
|---|---|---|---|
| 话题类型 | 熟悉生活话题 | 半熟悉，简单抽象 | 抽象、社会议题、比较 |
| 目标回答时长 | 10-20 秒 | 20-45 秒 | 45-90 秒 |
| 支架程度 | 高（给回答框架） | 中（给关键词提示） | 低（不给提示） |
| 追问数量 | 0-1 | 1-2 | 2-4 |
| 语言支持 | 中英双语反馈 | 以英文为主 | 基本全英文 |
| 推荐模式 | shadowing + guided QA | guided QA + cue card + retell | examiner sim + role-play + retell |

### 2.4 Speaking 模式选择逻辑

```
每次进入 speaking 练习时：

1. 读取最近 5 次 speaking session 的数据
2. 判断当前状态：
   - 如果近期 fluency < 4.0 且 pronunciation 有多个 risk → 优先 shadowing
   - 如果近期 answer_length 持续低于目标 → 先 guided QA 再 examiner
   - 如果 Part 2 近 2 次覆盖度 < 60% → 安排 cue card build
   - 如果用户连续 3 次都是 examiner sim → 穿插 1 次 retell 或 role-play
   - 如果用户表现稳定 → 正常轮换模式
3. 用户也可以主动选择模式（通过 inline keyboard）
```

### 2.5 Speaking 升级 / 降级规则

**升级条件（满足任意 2 条）：**

1. 连续 3 次回答达到目标时长的 80% 以上
2. Fluency 和 Grammar 连续 2 次不低于当前 level 预期
3. 追问下仍能保持基本连贯

**降级条件（满足任意 2 条）：**

1. 回答长度长期低于目标一半
2. 同一话题连续 2 次严重卡壳
3. 发音或语法错误多到影响理解

**降级时系统应做的：**

- 临时切回低一级的模式（如从 examiner sim 切到 guided QA）
- 下次进入时给一个 30 秒 shadowing 热身
- 不告诉用户"你被降级了"，而是自然地调整难度

### 2.6 Speaking 的 Micro Drill 设计

每次主练习结束后，必须做至少 1 个 micro drill：

**跟读 drill：**
- 给一条 8-14 词标准句（从刚才的反馈中提取正确表达）
- TTS 播放 → 用户跟读 → 只纠 1 个重点

**扩展 drill：**
- 给用户刚才的一个短回答，让他扩展成 2-3 句
- 例：原句 `I like music.` → 目标：加原因 + 例子

**重说 drill：**
- 不换题，让用户重说刚才的回答，只改一个问题点
- 语法错 → 重说正确版本
- 太短 → 加一个例子
- 逻辑弱 → 先说观点再解释

---

## 3. Listening 训练完整方案

### 3.1 当前问题

- 只有一种模式：TTS 音频 + 3 题 + transcript
- 没有辨音、精听、听写等基础训练
- 难度调节只有语速和长度两个维度
- transcript 默认全给，高水平用户容易形成依赖
- 缺少"错因分析"——是没听到、还是听到了没理解、还是被干扰项带偏

### 3.2 训练模式分层设计

#### 模式 1：Sound & Phrase Drill / 辨音训练

**适用水平：** Band 3.5-5.0

**Workflow：**

```
1. 系统选择一组容易混淆的发音或短语：
   - 最小对立体：ship/sheep, bed/bad, three/tree
   - 连读短语：pick it up → /pɪkɪtʌp/
   - 弱读识别：I can do it → /aɪ kən du ɪt/（can 弱读）
   - 数字/日期：15 vs 50, 13th vs 30th

2. TTS 播放 → 用户写出听到的内容

3. 系统判断：
   - 正确 → 进入下一组
   - 错误 → 播放两个对比音 + IPA 标注
     例：你听到的是 /ʃɪp/ (ship)，不是 /ʃiːp/ (sheep)
   - 再听一次确认

4. 每组 5-8 个 item，3-5 分钟

5. 记录：confusion_pairs / accuracy / problem_sounds
```

#### 模式 2：Sentence Dictation / 听写

**适用水平：** Band 4.5-6.0

**Workflow：**

```
1. 系统根据 band 选择句子复杂度：
   - Band 4.5-5.0：8-12 词简单句
     例：「The library closes at six o'clock on weekdays.」
   - Band 5.0-5.5：12-18 词含从句
     例：「Although the weather was terrible, we decided to continue our journey to the coast.」
   - Band 5.5-6.0：18-25 词学术句
     例：「The research suggests that regular exercise can significantly reduce the risk of developing chronic diseases later in life.」

2. TTS 播放（只播 1 遍，自然语速）

3. 用户完整写出听到的句子

4. 系统逐词对比：
   - ✅ 完全正确的部分
   - ❌ 遗漏或错误的部分
   - 具体标注：功能词遗漏？拼写错误？词序错误？

5. 播放第 2 遍，让用户补充修正

6. 最终给出正确全文 + 关键难点标注
   例：「注意 'although' 后面的从句结构，以及 'continue' 后接 to do」

7. 每次 3-5 个句子

8. 记录：sentence_count / accuracy_rate / error_types（spelling / function_word / structure）
```

#### 模式 3：Short Clip Comprehension / 短音频理解

**这是当前已有的模式，但需要增强。**

**增强 Workflow：**

```
1. 第一遍听：只问 gist（大意）
   「What is the main topic of this conversation?」

2. 用户回答 gist

3. 第二遍听：问 detail（细节）
   2-3 个具体问题

4. 用户答题

5. 系统反馈时，不只判对错，还要分析错因：
   - 类型 A：没听到（missed）→ 播放关键句片段
   - 类型 B：听到了但没理解（comprehension gap）→ 解释表达含义
   - 类型 C：被干扰项带偏（distractor trap）→ 对比干扰项和正确答案

6. 做 micro drill：
   - 从错题中抽 1 个关键句，让用户复述或听写
   - 如果涉及 paraphrase，展示原文表达 vs 题目表达的对应关系

7. 最后给 transcript（根据 band 决定翻译策略，见 3.4）

8. 记录：audio_type / audio_length / gist_correct / detail_accuracy / error_causes
```

#### 模式 4：Question Type Drill / 题型专项

**适用水平：** 备考阶段所有用户

**Workflow：**

```
1. 系统选择一种 IELTS 听力题型：
   - Form/Note completion（表格/笔记填空）
   - Multiple choice
   - Matching
   - Map/Diagram labeling
   - Sentence completion

2. 先讲解该题型的答题策略（30 秒，只在用户首次练该题型时）：
   - Form completion：先看空格前后词，预测词性和内容
   - Multiple choice：先读选项，听时排除
   - Map labeling：先熟悉方位词

3. 给一段针对该题型设计的音频 + 对应题目

4. 用户答题

5. 反馈聚焦该题型特有的技巧：
   - Form completion：是否注意到拼写要求？是否注意到词数限制？
   - Multiple choice：是否被干扰选项误导？
   - Map：方位词是否听准？

6. 记录：question_type / accuracy / type_specific_errors
```

#### 模式 5：Lecture & Multi-speaker / 讲座与多人对话

**适用水平：** Band 6.0+

**Workflow：**

```
1. 生成 90-180 秒的学术讲座或多人讨论音频
   - 2-3 个说话人
   - 包含转折、让步、例证
   - 学术词汇和正式表达

2. 题目 5-8 个，混合题型

3. 用户答题前，给 30 秒预读题目时间

4. 一次性播放完整音频

5. 答题后反馈：
   - 转折信息是否捕捉到
   - 说话人观点是否区分正确
   - 学术表达是否理解

6. 记录：speaker_count / lecture_topic / accuracy / missed_transitions
```

### 3.3 Listening 难度调节矩阵

| 维度 | Band 3.5-4.5 | Band 5.0-6.0 | Band 6.5+ |
|---|---|---|---|
| 语速 | 90-110 wpm | 110-140 wpm | 140-170 wpm |
| 音频长度 | 单句 ~ 30秒 | 40-80 秒 | 90-180 秒 |
| 说话人数 | 1 | 1-2 | 2-3 |
| 句法复杂度 | 简单句为主 | 含从句和同义替换 | 学术表达、转折密集 |
| 题目数量 | 1-3 | 3-5 | 5-8 |
| 口音 | 标准发音 | 标准 + 轻微英式 | 英/澳/多口音混合 |
| transcript 策略 | 答题后提供全文+翻译 | 答题后提供全文，关键句翻译 | 先给 evidence line，翻译按需 |

### 3.4 翻译支持分级策略

这一点非常重要，当前系统对所有用户都默认给全文翻译，这会导致高水平用户产生依赖：

```
Band 4.0-5.0：
  - 答题后提供完整英文 transcript + 完整中文翻译
  - 关键词标注

Band 5.5-6.0：
  - 答题后提供完整英文 transcript
  - 只翻译关键句（用 spoiler 隐藏）
  - 生词释义而非整句翻译

Band 6.5+：
  - 答题后只提供英文 transcript
  - 标注 evidence line（答案出处）
  - 不默认翻译，用户主动请求才提供
```

### 3.5 Listening 模式选择逻辑

```
1. 读取最近 5 次 listening session
2. 判断：
   - 如果基础辨音错误多（数字、拼写、最小对立体）→ 安排 sound drill
   - 如果功能词和句子结构听不出 → 安排 dictation
   - 如果理解能力 OK 但特定题型丢分 → 安排 question type drill
   - 如果整体表现稳定 → 轮换 short clip 和 lecture
   - 每周至少 1 次 dictation（所有水平）
3. 用户也可以主动选择模式
```

---

## 4. Reading 训练完整方案

### 4.1 当前问题

- 固定 300 词 + 3 题，不符合 IELTS 真实阅读体验
- 题型覆盖太少，只有 T/F/NG、填空、选择
- 缺少 heading matching、summary completion、matching information 等关键题型
- 没有时间压力训练
- 全文翻译默认提供，高水平用户不应依赖
- 避开科技题材过于绝对（用户的舒适区可以用来建立信心）

### 4.2 训练模式分层设计

#### 模式 1：Short Passage Foundation / 短文基础

**适用水平：** Band 3.5-5.0

**Workflow：**

```
1. 生成 120-220 词短文
   - 2-3 个段落
   - 词汇控制在 B1-B2
   - 话题从用户兴趣出发（建立信心），逐步过渡到 IELTS 常见话题

2. 3 个基础题型：T/F/NG + fill-in + MC

3. 用户答题（不限时）

4. 反馈：
   - 判对错
   - 指出 evidence 在原文哪里（标注具体句子）
   - 对 T/F/NG 错误，解释判断逻辑：
     「题目说 X，原文说 Y，这不是矛盾，是 Not Given——因为原文没有讨论这个方面」

5. 全文翻译（spoiler 隐藏）

6. 记录：passage_length / question_types / accuracy / evidence_located
```

#### 模式 2：Question-Type Drill / 题型专项

**适用水平：** 所有备考用户

**Workflow：**

```
系统选择一种题型进行专项训练：

=== T/F/NG 专项 ===
- 给 2-3 个段落 + 5 个 T/F/NG 题
- 反馈时重点区分：
  - True vs Not Given 的区别（部分信息 vs 完全没提）
  - False 必须有明确矛盾
- 用 paraphrase 对照表展示题干与原文的对应

=== Heading Matching 专项 ===
- 给 4-5 个段落 + 6-7 个 heading 选项
- 反馈时指出：
  - 每段的核心句（通常在段首或段尾）
  - 干扰 heading 为什么不对

=== Summary Completion 专项 ===
- 给一段较长文章 + 一段带空格的摘要
- 反馈时指出：
  - 原文对应位置
  - 为什么是这个词而不是其他词（词性、搭配、语义）

=== Matching Information 专项 ===
- 给 4-5 段 + 5-6 个信息描述，匹配到段落
- 反馈时指出：
  - scanning 策略（先读描述中的关键词）
  - 原文中对应的 paraphrase

记录：question_type / total / correct / specific_errors
```

#### 模式 3：Paraphrase Mapping / 同义替换训练

**适用水平：** Band 5.0-6.5

**Workflow：**

```
1. 给一段 200-300 词文章

2. 不出传统题目，而是给 5-8 组 paraphrase 对照：
   - 原文表达 → 同义替换
   - 用户判断：这两个表达是否表达相同含义？

   例：
   原文：「a significant increase in population」
   替换：「a notable rise in the number of people」
   → Same / Different / Not Sure

3. 反馈时解释每组替换的逻辑：
   - significant ≈ notable（同义形容词）
   - increase ≈ rise（同义名词）
   - population ≈ the number of people（释义替换）

4. 这个能力是 IELTS 阅读和听力的核心能力之一

5. 记录：paraphrase_pairs / accuracy / missed_equivalences
```

#### 模式 4：Timed Passage / 限时阅读

**适用水平：** Band 5.5+

**Workflow：**

```
1. 根据 band 选择篇幅和时间限制：
   - Band 5.5-6.0：300-450 词，8-10 分钟
   - Band 6.0-6.5：450-650 词，12-15 分钟
   - Band 6.5+：650-900 词，15-20 分钟

2. 题目 5-8 个，混合题型

3. 开始计时（系统记录发题到收答的时间差）

4. 用户答题

5. 反馈增加时间维度：
   - 完成时间 vs 目标时间
   - 如果超时：是否需要提升 skimming/scanning 速度
   - 如果提前完成但错误多：是否太快没有细看

6. 不提供全文翻译（除非用户主动要求）
   - 只标注 evidence line + 关键词释义

7. 记录：passage_length / word_count / time_limit / actual_time / accuracy / question_types
```

#### 模式 5：Exam Mini-set / 考试模拟

**适用水平：** 冲刺阶段，Band 6.0+

**Workflow：**

```
1. 给一篇 700-900 词的完整 IELTS 风格文章
2. 13-14 个题目，3-4 种题型混合
3. 限时 20 分钟
4. 完整评分 + 详细题型分析
5. 记录全套数据
```

### 4.3 Reading 难度调节矩阵

| 维度 | Band 3.5-4.5 | Band 5.0-6.0 | Band 6.5+ |
|---|---|---|---|
| 篇幅 | 120-220 词 | 250-450 词 | 600-900 词 |
| 段落数 | 2-3 | 3-5 | 5-7+ |
| 题型 | T/F/NG, fill, MC | + matching, summary | 全题型混合 |
| 时间压力 | 无 | 中（给参考时间） | 高（严格限时） |
| 翻译支持 | 全文翻译 | 关键句释义 | 默认不翻译 |
| 词汇 | B1-B2 | B2-C1 | C1+ 学术词汇 |

### 4.4 Reading 题材策略

当前系统一刀切禁用科技/软件题材，这不合理。更好的策略是：

```
- 用户熟悉的题材（如科技）：用于建立信心和练习新题型
- 中性题材：过渡练习
- IELTS 高频考题题材（环境、教育、健康、历史、社会）：正式训练主力

比例建议：
- 前 2 周：熟悉题材 40% / 中性 30% / IELTS 核心 30%
- 第 3-6 周：熟悉 20% / 中性 30% / IELTS 核心 50%
- 第 7 周起：熟悉 10% / IELTS 核心 90%
```

---

## 5. Writing 训练完整方案

### 5.1 当前问题

- 只有"出一整篇题→写→判分→给 Top 3 错误"，更像批改而非教学
- 没有审题训练、提纲训练、段落训练等分步骤练习
- 没有 rewrite 环节（反馈后不要求用户修改）
- 对低水平用户直接要求 250 词 full essay 压力过大
- 词汇注入一律 3 个词，对低水平用户负担过重

### 5.2 训练模式分层设计

#### 模式 1：Sentence Clinic / 句子诊所

**适用水平：** Band 3.5-5.0

**Workflow：**

```
1. 系统给出一个话题和 3-5 个"问题句子"：
   - 主谓不一致：「The number of students are increasing.」
   - 时态错误：「Yesterday I go to the library.」
   - 冠词缺失：「Education is important factor.」
   - 连接词误用：「I like sports. Because it is healthy.」

2. 用户逐句修正

3. 系统判断：
   - ✅ 修正正确 → 解释为什么原句有问题
   - ❌ 修正不对 → 给出正确版本 + 规则解释
   - ⚠️ 部分正确 → 指出还遗漏了什么

4. 最后让用户自己写 2-3 个正确句子，使用本次训练的语法点

5. 记录：error_types_practiced / correction_accuracy / production_quality
```

#### 模式 2：Idea + Outline / 审题与提纲

**适用水平：** Band 4.5-6.0（知道单词但不会组织的用户）

**Workflow：**

```
1. 系统给出一个 Task 2 题目

2. 第一步只问审题：
   - 这是什么题型？（opinion / discussion / problem-solution / two-part）
   - 关键词是什么？
   - 你的立场是什么？

3. 系统检查审题是否正确：
   - 题型判断错 → 解释各题型的标志词
   - 关键词遗漏 → 指出被忽略的限定条件
   - 立场模糊 → 引导明确

4. 第二步：写提纲
   - Introduction：thesis statement
   - Body 1：main idea + support
   - Body 2：main idea + support
   - Conclusion

5. 系统检查提纲：
   - 是否回应了题目所有部分
   - 段落之间是否有逻辑推进
   - 每段是否有足够的支撑点

6. 不要求用户写全文，训练到此结束
   （如果用户想继续写，可以切换到 full task 模式）

7. 记录：task_type_recognition / outline_completeness / thesis_quality
```

#### 模式 3：Paragraph Drill / 段落训练

**适用水平：** Band 5.0-6.5

**Workflow：**

```
1. 系统给出一个话题 + 一个段落位置（Body 1 / Body 2 / Introduction / Conclusion）

2. 用户只写这一个段落（80-120 词）

3. 系统用 4D 维度评估这一段：
   - Topic sentence 是否清晰
   - Explanation 是否充分
   - Example 是否具体
   - Mini conclusion 是否有
   - 连接词使用是否恰当

4. 给出 1 个结构改进建议 + 1 个语言改进建议

5. 让用户重写这一段（rewrite drill）

6. 对比原版和改写版，指出改进了什么

7. 记录：paragraph_position / structure_score / language_score / rewrite_improvement
```

#### 模式 4：Task 1 Drill / 图表写作专项

**适用水平：** 需要单独攻克 Task 1 的用户

**Workflow：**

```
1. 系统给出一种图表类型的描述：
   - Line graph：描述趋势
   - Bar chart：描述比较
   - Pie chart：描述比例
   - Table：描述数据
   - Process diagram：描述流程
   - Map：描述变化

2. 用文字描述图表数据（无法显示真实图表，但可以用表格或文字描述数据）

3. 用户写 150+ 词

4. 评估重点：
   - Overview 是否到位（必须有，且在前面）
   - 数据选择是否合理（不能罗列所有数据）
   - 比较语言是否准确
   - 是否加入了不该有的个人观点

5. 对 Task 1 特有的错误类型给出针对性反馈：
   - overview 缺失 → 解释 overview 的作用和写法
   - 数据堆砌 → 示范如何分组和选择关键数据
   - 趋势描述不准 → 给出常用趋势表达

6. 记录：chart_type / overview_present / data_selection / comparison_language / band_scores
```

#### 模式 5：Task 2 Full Essay / 完整议论文

**适用水平：** Band 5.5+

**这是当前已有的模式，但需要增强：**

```
增强点：

1. 写之前先做审题确认（可选，不强制）：
   - 系统问用户：「这是什么题型？你的立场是什么？」
   - 如果用户不想做，直接跳过

2. 写完后的反馈升级：
   - 4D 评分保留
   - Top 3 errors 保留
   - 新增：最大提分瓶颈（4D 中最低的那一维）
   - 新增：「如果只改一件事，下次最该改什么」
   - 新增：证据句（从用户原文中引用具体句子说明问题）

3. 必须有 rewrite 环节：
   - 不要求重写全文
   - 选一个最有问题的段落让用户重写
   - 或者选一个最有代表性的错句让用户改写

4. band-up example 保留，但要与用户的具体错误对应
```

#### 模式 6：Rewrite Clinic / 改写诊所

**适用水平：** 所有水平

**Workflow：**

```
1. 从用户最近的写作练习中抽取 2-3 个有代表性的句子

2. 每个句子给出改写方向：
   - 简单句 → 复合句
   - 笼统词 → 更精确的词
   - 逻辑松散 → 加连接词
   - 重复表达 → 用同义替换

3. 用户改写

4. 系统对比原句、用户改写、理想改写

5. 如果用户改写比原句好但还有提升空间，再给一次机会

6. 记录：original_sentences / rewrite_quality / improvement_areas
```

### 5.3 Writing 难度调节矩阵

| 维度 | Band 3.5-4.5 | Band 5.0-6.0 | Band 6.5+ |
|---|---|---|---|
| 任务形式 | 句子 / 段落 | 段落 / mini essay | full task |
| 目标长度 | 50-120 词 | 120-220 词 | 150/250+ 词 |
| 支架程度 | 高（给框架和关键词） | 中（给方向提示） | 低（不给提示） |
| 评分重点 | Grammar + clarity | structure + idea support | task response + precision + cohesion |
| 词汇注入 | 0-1 个 | 1-2 个 | 2-3 个（优先 collocation） |
| 审题训练 | 简化版 | 完整版 | 快速版（用户已熟练） |

### 5.4 Writing 模式选择逻辑

```
1. 读取最近 5 次 writing session
2. 判断：
   - 如果 grammar band 持续 < 5.0 → 先 sentence clinic
   - 如果 task response band 低 → 先 idea + outline
   - 如果 coherence band 低 → 先 paragraph drill
   - 如果整体 band 稳定在 5.5+ → 可以做 full task
   - 每做 2-3 次 full task，穿插 1 次 rewrite clinic
   - Task 1 和 Task 2 交替训练
3. 用户也可以主动选择模式
```

---

## 6. Vocabulary / Flashcard 完整方案

### 6.1 当前问题

- 只有"看词卡→判断认识/模糊/不认识"一种模式
- 偏识别型训练，缺少生产型训练（造句、口语使用）
- 与听说读写的迁移联动不够
- 一次只学一个新词，效率可以但缺少复习机制的触发
- collocation 只在展示时出现，没有专项训练

### 6.2 词汇训练的 5 级路径

```
Level 1 — Notice：第一次遇到这个词（flashcard 展示）
Level 2 — Understand：知道意思和基本用法（定义 + 例句）
Level 3 — Recognize：在阅读/听力中能认出来（阅读/听力中标注）
Level 4 — Produce：能在说写中主动用出来（造句/口语使用）
Level 5 — Transfer：能在不同话题中自然迁移（跨话题使用）
```

### 6.3 训练模式设计

#### 模式 1：Recognition Card（现有，保留并增强）

**增强点：**

```
- 保持一次一词的设计
- 展示时除了 definition + IPA + 中文，增加：
  - 2-3 个高频 collocation（不只列出，标注使用场景）
  - 1 个 IELTS 风格例句
  - 1 个用户兴趣相关例句
- TTS 朗读保留 3 遍
```

#### 模式 2：Collocation Drill / 搭配训练

**Workflow：**

```
1. 从最近学过的词中选 1 个，给出搭配测试：

   例（目标词：significant）：
   选择正确的搭配：
   A. significant increase ✅
   B. significant damage ✅
   C. significant do ❌
   D. significant amount ✅

2. 或者填空形式：
   「There has been a _____ improvement in air quality.」
   选项：significant / wide / large / heavy

3. 每次 3-5 个搭配测试

4. 记录：word / collocation_tested / accuracy
```

#### 模式 3：Gap-fill Retrieval / 语境填词

**Workflow：**

```
1. 给出一个句子，关键词用空格替代：

   中文提示：「这个发现对医学研究有 _____(重大的) 影响。」
   答案：significant

   或纯英文语境：
   「The _____ of the study was to determine the effects of climate change.」
   答案：objective / purpose / aim

2. 用户填词

3. 系统判断：
   - 完全正确 → 进入下一题
   - 同义词也对 → 接受并展示原目标词
   - 错误 → 给出正确答案 + 解释

4. 记录：word / retrieval_success / alternative_used
```

#### 模式 4：Speaking Transfer / 口语迁移

**Workflow：**

```
1. 从最近学过的词中选 1-2 个

2. 给用户一个简单的口语问题，要求在回答中自然使用这些词：
   目标词：significant, contribute
   问题：「Do you think technology has changed education?」

3. 用户用语音或文字回答

4. 系统检查：
   - 目标词是否使用了
   - 使用是否自然（不是生硬塞入）
   - 搭配是否正确

5. 如果未使用或使用不当 → 给出示范句 + 让用户重说

6. 记录：target_words / used / natural / redo
```

#### 模式 5：Writing Transfer / 写作迁移

**Workflow：**

```
1. 从最近学过的词中选 2-3 个

2. 要求用户写 2-3 个句子，自然使用这些词：
   目标词：inevitable, consequence, mitigate
   话题：环境保护

3. 系统检查：
   - 每个目标词是否使用
   - 搭配是否正确
   - 句子语法是否正确
   - 使用是否自然

4. 反馈 + 改写建议

5. 记录：target_words / usage_quality / sentence_accuracy
```

### 6.4 Flashcard 改进 Workflow

```
1. 进入词汇练习时，先检查 due words（SRS 到期复习词）
2. 优先复习到期词，再学新词
3. 每轮结构：
   - 1-2 个复习词（recognition 或 retrieval）
   - 1 个新词（recognition card）
   - 1 个 production 练习（造句或口语使用）
4. 而非当前的"只学新词，不做 production"
```

### 6.5 词汇与听说读写的联动机制

```
联动规则：

1. writing / speaking 练习前的"词汇注入"：
   - 从 SRS 中选择即将到期 + 需要 production 练习的词
   - 注入到本次练习的话题中
   - 练习后检查用户是否使用了注入词 → 更新 SRS 中的 production_count

2. reading / listening 练习中的"词汇标注"：
   - 如果文章/音频中出现用户 SRS 中的词 → 标记为 exposure event
   - 如果出现用户不认识的高频词 → 练习后推荐加入词汇本

3. 跨技能迁移追踪：
   - 一个词在 flashcard 中学过 → 在 writing 中用过 → 在 speaking 中说过
   - 达到 3 种不同场景使用 → 标记为"已迁移"
```

---

## 7. Assessment 评估体系改进

### 7.1 当前问题

- 日评（Light）只更新 streak，信息太少
- 周评（Deep）数据依赖多但底层查询能力不够
- On-demand 测评的 4 个 mini-task 时间分配不合理（总共 10-15 分钟太短）
- 没有"双周 checkpoint"这一层级

### 7.2 三级评估体系

#### Level 1：日评（每日 22:00，静默）

```
执行内容：
1. 查询今日 samples
2. 如果无练习 → streak_days 置 0（或 -1）
3. 如果有练习 → 更新：
   - streak_days +1
   - EMA 更新各技能 band（α=0.3）
   - 识别今日主要错误类型
   - 更新 top_errors 列表

不发送任何消息给用户。
```

#### Level 2：周评（每周日 20:00，可见）

```
执行内容：
1. 查询 7 天 samples + errors
2. 计算各技能 band 走势（是进步、停滞还是退步）
3. 统计高频错误 top 5
4. 分析弱项维度变化
5. 评估难度是否需要调整
6. 触发 planner 生成下周计划

输出报告：
- 四项 band 走势图（文字版）
- 本周主要进步点
- 本周持续问题
- 下周训练重点建议
- 是否需要调整难度档位
```

#### Level 3：双周 Checkpoint（每两周一次，互动式）

```
执行内容：
1. 四项技能各做一个 mini mock：
   - Writing：限时 15 分钟写一个 Task 2 段落或短文
   - Reading：250-400 词文章 + 5 题，限时 8 分钟
   - Listening：60 秒音频 + 3-4 题
   - Speaking：Part 1（3 题）+ Part 2（1 题），鼓励语音

2. 与上次 checkpoint 对比：
   - band 变化
   - 弱项是否改善
   - 新出现的问题

3. 输出：
   - band range + confidence 变化
   - 最大进步项
   - 最大瓶颈项
   - 下两周建议调整
```

### 7.3 On-demand 测评改进

当前 10-15 分钟太短，建议调整为 20-25 分钟：

```
- Writing：5-8 分钟（120-180 词段落或短文）
- Reading：5-6 分钟（200-300 词 + 4-5 题）
- Listening：3-4 分钟（45-60 秒音频 + 3 题）
- Speaking：5-6 分钟（Part 1 × 3 + Part 2 × 1）
- 综合评估：2 分钟
```

---

## 8. Planner 周计划改进

### 8.1 当前问题

- 计划只细化到"技能"层级，没有细化到"子技能"和"训练模式"
- 没有量化目标
- 没有考虑用户疲劳度和时间约束

### 8.2 改进后的周计划结构

```yaml
week_start: "2026-04-20"
primary_skill: speaking
primary_subskill: Part 2 development
secondary_skill: listening
secondary_subskill: dictation accuracy
core_problem: speaking answers too short, listening function words missed
training_modes:
  - 2x cue_card_build
  - 1x shadowing
  - 1x examiner_simulation
  - 2x dictation
  - 1x short_clip
weekly_target:
  sessions: 5-7
  speaking_minutes: 40
  listening_minutes: 30
  writing_minutes: 20
  reading_minutes: 20
carry_over_errors:
  - sv_agreement (3 weeks, not resolved)
  - word_stress on 3-syllable words
difficulty_notes: "speaking 可以尝试升级到 Band 5.5 难度，listening 维持当前"
```

### 8.3 计划生成逻辑

```
1. 读取：
   - 最近 4 周 band 走势
   - 最近 2 周高频错误
   - 上周计划完成度
   - 用户目标和时间线

2. 决策逻辑：
   - primary_skill = band 最低 或 最近停滞最久的技能
   - secondary_skill = 高频错误最多的技能
   - 如果同一技能连续 3 周为 primary → 强制切换，避免倦怠
   - 如果用户考试 < 4 周 → 侧重弱项的高频考试模式
   - 如果用户考试 > 8 周 → 可以多安排基础能力建设

3. 训练模式分配：
   - 根据子技能问题选择对应模式
   - 每周至少：
     - 1 次 shadowing 或 dictation（基础功）
     - 2 次主技能训练
     - 1 次 rewrite 或 retell（迁移训练）
     - 1 次词汇 production 练习
```

---

## 9. Daily 微训练改进

### 9.1 当前问题

- 4 种格式（词汇/纠错/阅读/听力）偏"信息推送"，不够像真正的微训练
- 没有与周计划联动
- 用户参与度低（因为不需要深度回应）

### 9.2 改进后的 5 种微训练格式

每天 08:30 推送，控制在 3 分钟以内，但必须要求用户产出：

```
Format A — 词组造句：
  给一个词组 + 一个 IELTS 例句
  → 用户用这个词组写一个自己的句子
  → 系统点评搭配和语法

Format B — 精听一句：
  TTS 播放一个 10-15 词的句子
  → 用户听写
  → 系统逐词对比

Format C — Paraphrase 挑战：
  给两个表达，用户判断是否同义
  → 系统解释

Format D — Speaking 热身：
  1 个 Part 1 问题
  → 用户用 2-3 句回答（文字即可）
  → 系统简短反馈

Format E — Writing 微练：
  给一个 thesis statement 的半成品
  → 用户补完
  → 系统评估
```

**选择逻辑：**

```
- 按周计划的 primary_skill 权重分配
- 如果 primary_skill = speaking → Format D 出现频率 40%
- 如果 primary_skill = writing → Format E 出现频率 40%
- 如果 primary_skill = listening → Format B 出现频率 40%
- 不与前一天重复同一格式
- 如果用户 3+ 天未活跃 → 用最简单的格式（A 或 C），不给压力
```

---

## 10. 统一训练流程模板

所有技能（听说读写）应统一采用以下主流程：

```
┌─────────────────────────────────────────────────┐
│  Step 1: Context Loading                         │
│  读取 USER + MEMORY + recent 5 samples + errors │
├─────────────────────────────────────────────────┤
│  Step 2: Decision                                │
│  决定 skill + mode + difficulty                  │
│  （参考周计划 + 近期表现 + 用户选择）             │
├─────────────────────────────────────────────────┤
│  Step 3: Warm-up（可选，30-60秒）                │
│  如果用户近期该技能低迷 → 做一个简单热身          │
│  Speaking: 1句跟读                               │
│  Listening: 1句精听                              │
│  Writing: 1句改错                                │
│  Reading: 1组 paraphrase                         │
├─────────────────────────────────────────────────┤
│  Step 4: Main Task                               │
│  执行本次训练的主任务                             │
├─────────────────────────────────────────────────┤
│  Step 5: Scoring                                 │
│  给出分数/准确率                                  │
│  Writing/Speaking: 4D 评分                       │
│  Reading/Listening: 准确率 + 错因分析             │
├─────────────────────────────────────────────────┤
│  Step 6: Focused Feedback                        │
│  只讲最关键的 1-3 个问题                          │
│  附带证据句（从用户原文/回答中引用）              │
├─────────────────────────────────────────────────┤
│  Step 7: Micro Drill                             │
│  针对最重要的 1 个问题做 mini 练习                │
│  （跟读/改写/听写/paraphrase）                   │
├─────────────────────────────────────────────────┤
│  Step 8: Redo                                    │
│  让用户重做主任务的一部分                         │
│  （重说一段/重写一句/重听一句）                   │
├─────────────────────────────────────────────────┤
│  Step 9: Record                                  │
│  将主任务 + redo 结果一起写入 DB                  │
│  更新词汇 SRS（如果涉及注入词）                  │
├─────────────────────────────────────────────────┤
│  Step 10: Next Action                            │
│  Inline keyboard: 再来一次 / 换模式 / 回菜单     │
│  把需要延迟复习的点写入复习队列                   │
└─────────────────────────────────────────────────┘
```

**关键原则：Step 7（Micro Drill）和 Step 8（Redo）是当前系统最缺的，必须加入。**

没有这两步，反馈就是"看懂了但下次还错"。

---

## 11. 数据层改进

### 11.1 samples 表建议新增字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `mode` | text | shadowing / dictation / full_task / paragraph / cue_card / retell 等 |
| `question_type` | text | T/F/NG, form_completion, cue_card, Task_1_line_graph 等 |
| `topic` | text | 话题标签，便于分析题材依赖 |
| `difficulty_level` | text | foundation / developing / advancing / refinement |
| `timed` | boolean | 是否限时 |
| `duration_sec` | integer | 实际耗时（秒） |
| `response_length_words` | integer | 用户输出长度 |
| `accuracy_raw` | text | 例如 "7/10" |
| `support_level` | text | high / medium / low（支架程度） |
| `redo_count` | integer | 重做次数 |
| `self_correction_count` | integer | 自我修正次数 |
| `accent` | text | listening 口音 |
| `speaker_count` | integer | listening 说话人数 |
| `transcript_used` | boolean | 是否查看了 transcript |
| `translation_used` | boolean | 是否查看了翻译 |

### 11.2 错误 taxonomy 扩展

当前 taxonomy 覆盖语法/词汇/语篇/发音，但缺少 IELTS 特有的题型错误分类：

```
新增 Listening 错误分类：
- missed_number：数字听错
- missed_spelling：拼写听错
- paraphrase_miss：同义替换没识别
- distractor_trap：被干扰项误导
- speaker_switch_confusion：说话人切换时混淆

新增 Reading 错误分类：
- tfng_logic_error：T/F/NG 判断逻辑错误
- heading_mismatch：段落大意匹配错误
- keyword_matching_error：关键词定位错误
- location_failure：找不到信息位置
- inference_overreach：过度推理

新增 Writing 错误分类：
- task1_overview_missing：Task 1 缺少 overview
- task1_data_selection：数据选择不当
- task2_position_unclear：Task 2 立场不明确
- task2_support_insufficient：论证不充分
- cohesion_overlinking：连接词过度使用

新增 Speaking 错误分类：
- answer_underdeveloped：回答不够展开
- hesitation_breakdown：卡壳崩溃
- repair_failure：自我修正失败
- part2_structure_weak：Part 2 结构松散
- part3_abstraction_gap：Part 3 无法处理抽象问题
```

---

## 12. 落地优先级

### P0：不修则系统不可靠

1. **初始测评改为技能分层**，不再用写作外推全部技能
2. **修复文档与脚本接口不一致**（.py vs .js、参数不匹配）
3. **确保 flashcard → vocab.db 同步链路可靠**
4. **确认 assessment/planner 依赖的查询在 tracker_db.js 中都已实现**

### P1：最能提升教学效果

5. **Speaking 增加 shadowing / guided QA / retell / role-play / cue card build**
6. **Listening 增加 dictation / sound drill / question-type drill**
7. **Writing 增加 sentence clinic / outline / paragraph drill / rewrite clinic**
8. **Reading 增加 question-type drill / paraphrase mapping / timed mode**
9. **所有技能加入 micro drill + redo 闭环**（统一训练流程 Step 7-8）

### P2：从能用到好用

10. **Planner 改为子技能级别计划**
11. **Daily 改为 3 分钟微训练**（要求用户产出）
12. **翻译支持分级**（不再对所有水平都给全文翻译）
13. **词汇系统与听说读写联动**（production 追踪 + 跨技能迁移）
14. **samples 表扩展字段**（mode, question_type, duration_sec 等）

### P3：高分打磨

15. **Speaking Part 3 抽象讨论链**
16. **Listening 多口音 + lecture handling**
17. **Reading 多题型混合 + 强时间压力**
18. **Writing 高分精准度与去模板化训练**
19. **双周 checkpoint 机制**
20. **错误 taxonomy 扩展**（IELTS 题型特有错误分类）

---

## 13. 总结

当前 IELTS 技能体系的骨架设计是好的——三层架构（SOUL + Memory + Data）、4D 评分、SRS 词汇、统一路由都是正确的方向。

核心改进方向只有三个：

1. **把每个技能从"单一考试模拟"拆成"多模式分层训练"**
2. **把反馈从"终点"变成"起点"——加入 micro drill + redo 闭环**
3. **把难度调节从"按 band 三档"升级为"多维度动态调节"**

做完这三件事，这套系统就不再是"会陪练的刷题机器人"，而是一个真正能帮用户持续提分的 IELTS 教练系统。

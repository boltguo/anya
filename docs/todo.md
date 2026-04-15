# IELTS 教练系统升级 — 开发任务清单

> 对应 `docs/ielts.md` v4 蓝图的可执行任务拆解。
> 每个 Phase 内的任务按依赖顺序排列，前置任务完成后才能开始后续任务。

---

## Phase 1: 核心闭环 — Micro Drill + Forced Redo + 难度反馈

> **目标**: 让每次训练从"做完就走"变成"必须重做才能走"
> **优先级**: 最高 | **预估工作量**: 中等

### 1.1 tracker_db.js 扩展

- [ ] 在 `samples` 表新增字段:
  - `mode` TEXT — 训练模式 (shadowing/dictation/guided_qa/examiner_sim/teel_drill/full_task/sound_drill/short_clip/flash_skim/sentence_anatomy)
  - `question_type` TEXT — 题型 (TFNG/form_completion/cue_card/task1_process/multiple_choice/matching)
  - `duration_sec` INTEGER — 实际答题耗时
  - `redo_count` INTEGER DEFAULT 0 — 重做次数
  - `support_level` TEXT — 支架程度 (high/medium/low/none)
  - `difficulty_feedback` TEXT — 用户难度反馈 (too_hard/just_right/too_easy)
  - `audio_duration_sec` INTEGER — 听力音频时长
  - `response_length_words` INTEGER — 回答字数
  - `accent` TEXT — 口音类型
  - `speaker_count` INTEGER — 说话人数
- [ ] 新增 CLI 参数支持: `--mode`, `--question-type`, `--duration-sec`, `--redo-count`, `--support-level`, `--difficulty-feedback`
- [ ] 编写 migration 脚本: 对现有数据库做 ALTER TABLE 添加新字段 (带默认值)
- [ ] 更新 `data/SKILL.md` 文档，补充新字段的使用说明

### 1.2 Error Taxonomy 扩展

- [ ] 更新 `assessment/references/error_taxonomy.md`，新增以下分类:
  - Speaking: `pronunciation_stress`, `pronunciation_vowel`, `pronunciation_consonant`, `hesitation_breakdown`, `filler_overuse`, `part3_abstraction_gap`, `answer_too_short`, `self_correction_fail`
  - Listening: `minimal_pair_confusion`, `function_word_miss`, `paraphrase_miss`, `distractor_trap`, `spelling_error`, `missed_plural_s`, `number_confusion`, `connected_speech_fail`
  - Reading: `tfng_logic_error`, `heading_mismatch`, `sentence_anatomy_fail`, `detail_location_fail`, `speed_too_slow`, `inference_error`
  - Writing: `cohesion_missing`, `topic_sentence_weak`, `example_vague`, `word_choice_basic`, `task_response_off_topic`, `paragraph_structure_weak`

### 1.3 SOUL.ielts.md 路由扩展

- [ ] 在 `Message Routing > Skill Shortcuts` 表中新增:
  - `ck:feedback:too_hard` / `ck:feedback:just_right` / `ck:feedback:too_easy` → 记录到 tracker_db + 调整下次难度
  - 各技能模式选择回调 (见 ielts.md 第9.3节完整列表)
- [ ] 新增 `ck:show_translation` 回调 → 按需显示翻译
- [ ] 新增 `ck:report:detail` / `ck:report:plan` 回调

### 1.4 统一训练流模板升级

- [ ] 更新 `practice/references/training_flow.md`:
  - 原 9 步 → 扩展为 10 步 (加入 S8 Micro Drill + S9 Forced Redo)
  - 新增"难度反馈 inline keyboard"作为 S10 的标准结尾
  - 新增"翻译分级策略"说明
- [ ] 更新 `writing/SKILL.md`: 在 Step 7 后插入 Micro Drill + Forced Rewrite 步骤
- [ ] 更新 `speaking/SKILL.md`: 在 Step 7 后插入 Micro Drill + Redo 步骤
- [ ] 更新 `reading/SKILL.md`: 在 Step 6 后插入 Sentence Anatomy Drill (对错题)
- [ ] 更新 `listening/SKILL.md`: 在 Step 7 后插入 Micro Drill (关键句听写/复述)
- [ ] 所有 SKILL.md 的 "Next Step" keyboard 统一加上难度反馈按钮行

---

## Phase 2: Speaking 多模式体系

> **目标**: 口语从单一 Examiner Sim 升级为 6 模式分层
> **优先级**: 高 | **依赖**: Phase 1.1, 1.3

### 2.1 Shadowing 跟读模式

- [ ] 在 `speaking/SKILL.md` 新增 `## Mode: Shadowing` 完整 workflow:
  1. 读取 `MEMORY.pronunciation_weak` 定位薄弱发音
  2. 按 band 选句 (8-14词)
  3. `tts(rate:"-15%")` 播放目标句
  4. 发送提示 + `<tg-spoiler>` 隐藏文本
  5. 等待用户语音 → `pron_assess(audio_path, reference_text)` 评测
  6. 只纠正 1 个最重要问题 + `tts` 对比播放
  7. 用户再跟读一次 (redo) → 二次 `pron_assess`
  8. 记录: `mode=shadowing`, pronunciation_issue, redo_quality
  9. 3-5 句为一组
- [ ] 添加 `ck:speaking:shadowing` 回调路由

### 2.2 Guided QA 引导问答模式

- [ ] 在 `speaking/SKILL.md` 新增 `## Mode: Guided QA` 完整 workflow:
  1. 生成 Part 1 问题 (基于 USER.engage topics)
  2. band < 5.0 时提供回答骨架 ("You can say: I prefer ___ because ___")
  3. `tg(type:"force_reply")` 收集回答
  4. 评估: 完整性 + 展开词使用 + 语法
  5. 回答太短 → 引导扩展: "Can you add one reason why?"
  6. 1 个纠错 + 1 个扩展示范 + `tts` 正确版
  7. Forced Redo: 重说整个回答
  8. 记录: `mode=guided_qa`, answer_length, grammar_issues, redo
- [ ] 添加 `ck:speaking:qa` 回调路由

### 2.3 Cue Card Build 提纲构建模式

- [ ] 在 `speaking/SKILL.md` 新增 `## Mode: Cue Card Build` 完整 workflow:
  1. 给出 cue card
  2. 先让用户列 4 个要点 (force_reply) — 不直接开说
  3. 检查提纲覆盖度，引导补充
  4. 用户根据提纲说 1-2 分钟
  5. 评估覆盖度 + 时长 + 过渡自然度
  6. 1 个结构改进 + 1 个语言改进
  7. 用户重说薄弱部分 (redo)
  8. 记录: `mode=cue_card_build`, outline_quality, answer_duration, coverage, redo
- [ ] 添加 `ck:speaking:cuecard` 回调路由

### 2.4 Role-play 对话练习模式

- [ ] 在 `speaking/SKILL.md` 新增 `## Mode: Role-play` 完整 workflow:
  1. 设定生活场景 (咖啡店点餐/向同事介绍周末/帮朋友推荐电影/旅行问路)
  2. 系统扮演对话另一方，用户自然回应
  3. 对话 4-6 轮 (多轮 force_reply)
  4. 对话结束后统一反馈: 表达自然度 + 语法 + 对话维持能力
  5. 抽取 1-2 个好表达 + 1-2 个需改进的
  6. 记录: `mode=roleplay`, scenario, turn_count, response_naturalness, key_errors
- [ ] 添加 `ck:speaking:roleplay` 回调路由

### 2.5 Retell 复述模式

- [ ] 在 `speaking/SKILL.md` 新增 `## Mode: Retell` 完整 workflow:
  1. 给输入材料 (按 band 调复杂度: 2-3句 → 120词短文 → 200词文章/60s音频)
  2. 用户用自己的话复述 (语音优先)
  3. 评估: 信息完整度 + paraphrase 能力 + 语言准确度
  4. 对比原文和复述，指出遗漏/好的 paraphrase/可改进处
  5. 让用户补充遗漏部分 (partial redo)
  6. 记录: `mode=retell`, source_type, source_length, coverage_score, paraphrase_quality, redo
- [ ] 添加 `ck:speaking:retell` 回调路由

### 2.6 Examiner Sim 增强

- [ ] 更新现有 `speaking/SKILL.md` 的 Examiner 模式:
  - 加入追问机制: Part 1 (1-2追问), Part 3 (2-3层递进追问)
  - band >= 6.5 时使用攻击性追问 ("However, doesn't...?")
  - 反馈增加行为指标: answer_length_seconds, pause_count, self_correction_count, filler_usage
  - 加入 Micro Drill: 提取结巴处 → 给高分句型 → tts → 用户重说 → pron_assess
  - 记录新增: `mode=examiner_sim` + 行为指标字段

### 2.7 模式自动选择逻辑

- [ ] 在 `speaking/SKILL.md` Step 1 新增模式决策引擎:
  1. 读取最近 5 次 speaking session
  2. fluency < 4.0 且 pronunciation 多项 risk → Shadowing
  3. answer_length 持续低于目标 → Guided QA
  4. Part 2 覆盖度 < 60% → Cue Card Build
  5. 连续 3 次 Examiner Sim → 穿插 Retell/Role-play
  6. 默认 → Examiner Sim
- [ ] 展示推荐模式 + 允许用户通过 inline keyboard 自选

### 2.8 升级/降级规则

- [ ] 在 `speaking/SKILL.md` 新增升降级规则:
  - 升级 (满足任意2条): 连续3次达到时长80%+, Fluency/Grammar连续2次达标, 追问下保持连贯
  - 降级 (满足任意2条): 回答长度持续低于目标一半, 同话题连续2次严重卡壳, 错误多到影响理解
  - 降级时: 自然切回低阶模式 + 下次加 shadowing 热身 + 不明说"你被降级了"

---

## Phase 3: Listening 多模式体系

> **目标**: 听力从"泛听做题"升级为"解码重构"
> **优先级**: 高 | **依赖**: Phase 1.1, 1.3

### 3.1 Sound Drill 辨音训练

- [ ] 在 `listening/SKILL.md` 新增 `## Mode: Sound Drill` 完整 workflow:
  1. 读取 `MEMORY.listening_risk` 获取已知混淆音对
  2. 选择混淆组: 最小对立体(ship/sheep) / 连读(pick it up) / 弱读(can) / 数字(15/50)
  3. `tts` 播放目标音 → `tg(type:"quiz")` 选择题
  4. 答对 → react + 下一组; 答错 → tts 对比播放 + IPA 标注
  5. 5-8 组为一轮
  6. 记录: `mode=sound_drill`, confusion_pairs, accuracy
- [ ] 添加 `ck:listening:sound` 回调路由

### 3.2 Dictation 听写训练

- [ ] 在 `listening/SKILL.md` 新增 `## Mode: Dictation` 完整 workflow:
  1. 按 band 选句 (4.5-5.0: 8-12词 / 5.0-5.5: 12-18词 / 5.5-6.0: 18-25词)
  2. `tts` 播放 1 遍 (自然语速) → `force_reply` 收听写
  3. 逐词 Diff 对比: 标注功能词遗漏/拼写错误/词序错误
  4. `tts` 播放第 2 遍 → `force_reply` 收修正版本
  5. 给出正确全文 + 关键难点标注
  6. 如涉及同义替换 → quiz poll micro drill
  7. 3-5 句为一轮
  8. 记录: `mode=dictation`, accuracy_rate, error_types (spelling/function_word/structure)
- [ ] 添加 `ck:listening:dictation` 回调路由

### 3.3 Short Clip 增强 (两遍听 + 错因分析)

- [ ] 更新 `listening/SKILL.md` 现有模式为两遍听机制:
  1. 第 1 遍: 只问 gist (大意) → force_reply
  2. 第 2 遍: 问 detail (2-3个细节题) → force_reply
  3. 错因分析分三类:
     - A: 没听到 (missed) → 播放关键句片段
     - B: 听到没理解 (comprehension gap) → 解释含义
     - C: 被干扰项带偏 (distractor trap) → 对比干扰项 vs 正确答案
  4. Micro Drill: 从错题抽 1 个关键句 → 听写或复述
  5. 翻译分级 (见 3.5)
  6. 记录新增: gist_correct, detail_accuracy, error_causes

### 3.4 Question Type Drill 题型专项

- [ ] 在 `listening/SKILL.md` 新增 `## Mode: Question Type Drill`:
  1. 选题型: Form completion / Multiple choice / Matching / Map labeling / Sentence completion
  2. 首次练该题型 → 30s 答题策略讲解
  3. 播放针对性设计的音频 + 对应题目
  4. 反馈聚焦题型特有技巧
  5. 记录: `mode=question_type`, question_type, accuracy, type_specific_errors
- [ ] 添加 `ck:listening:type` 回调路由

### 3.5 翻译分级策略

- [ ] 更新所有 listening/reading SKILL.md 的翻译规则:
  - Band 4.0-5.0: 全文 + 全翻译 (`<tg-spoiler>`)
  - Band 5.5-6.0: 全文 + 只翻译关键句/生词释义
  - Band 6.5+: 只给 evidence line + `[显示翻译|ck:show_translation]` 按需请求

### 3.6 模式自动选择逻辑

- [ ] 在 `listening/SKILL.md` Step 1 新增模式决策引擎:
  1. 基础辨音错误多 → Sound Drill
  2. 功能词/句子结构听不出 → Dictation
  3. 特定题型丢分 → Question Type Drill
  4. 整体稳定 → 轮换 Short Clip / Lecture
  5. 每周至少 1 次 Dictation (所有水平)

---

## Phase 4: Writing 增强 + Reading 增强

> **目标**: 写作加入支架与重写闭环, 阅读加入长难句解剖
> **优先级**: 中 | **依赖**: Phase 1

### 4.1 Writing: Brainstorming 前置阶段

- [ ] 在 `writing/SKILL.md` band < 5.5 时强制加入 Brainstorming:
  1. 不允许直接写正文
  2. `force_reply`: "用中文/简单英文列出 2 个支持论点"
  3. Anya 将论点翻译为雅思高分词块 + 搭配
  4. 然后进入正式写作

### 4.2 Writing: TEEL 段落支架

- [ ] 在 `writing/SKILL.md` 新增 `## Mode: TEEL Drill`:
  1. 强制按 T(主题句)-E(解释)-E(举例)-L(总结) 分步填空
  2. 每步单独 `force_reply` 提交
  3. 每步给出即时反馈
  4. 组装完整段落后进入 4D 评分

### 4.3 Writing: Forced Rewrite 循环

- [ ] 在 `writing/SKILL.md` Step 7-9 改造为强制重写:
  1. 4D 评分后聚焦 1-2 个核心问题
  2. Micro Drill: 用高级词替换低级词 → 造句验证
  3. Forced Rewrite: 带着改进重写整个段落
  4. AI 对比验收: 初稿 vs 重写版
  5. 未达标 → 继续打回; 达标 → 庆祝结束
  6. **不重写完不准下课**

### 4.4 Writing: Task 1 图表题

- [ ] 在 `writing/SKILL.md` 新增 Task 1 支持:
  1. inline keyboard 选图表类型 (柱状图/折线图/饼图/地图/流程图)
  2. 生成图表描述或用 `tg(type:"photo")` 发送图片
  3. 注入图表描述高频词 (fluctuate, peak, plateau, account for)
  4. 150+ 词描述任务

### 4.5 Reading: Flash-Skimming 闪卡略读

- [ ] 在 `reading/SKILL.md` 新增 `## Mode: Flash-Skimming`:
  1. 生成 100-150 词段落
  2. `tg(type:"text", tag:"passage")` 展示段落
  3. 30 秒后 `tg(type:"edit", message_id:"passage")` 隐藏内容
  4. `tg(type:"quiz")` 选择 Heading
  5. 答错 → 重新展示 + 高亮关键信号词

### 4.6 Reading: Sentence Anatomy 长难句解剖

- [ ] 在 `reading/SKILL.md` 新增错题后的长难句解剖流程:
  1. 提取导致错误的长难句
  2. 苏格拉底提问: "which 从句修饰的是谁?" → `force_reply`
  3. 答错 → 给提示引导 ("去掉从句，剩下的是什么?")
  4. T/F/NG 题追问逻辑: "some vs the majority 是矛盾还是包含?" → `quiz`
  5. 记录: `sentence_anatomy_fail` / `tfng_logic_error`

### 4.7 Reading: 篇幅与题型扩展

- [ ] 更新 `reading/SKILL.md` 篇幅规则:
  - Band 4-5: 200 词 + 3 题
  - Band 5-6: 400 词 + 4 题
  - Band 6+: 600-900 词 + 6 题
- [ ] 扩展题型覆盖: T/F/NG, matching headings, form completion, short answer, multiple choice, sentence completion

---

## Phase 5: 词汇迁移 + 评估升级

> **目标**: 词汇从孤立闪卡升级为跨技能迁移, 评估更精细
> **优先级**: 中 | **依赖**: Phase 2, 3

### 5.1 Flashcard: 4 级迁移模型

- [ ] 更新 `flashcard/SKILL.md` Step 6 响应逻辑:
  - known → 进入 L2 搭配快练 (`tg(type:"quiz")` 选搭配)
  - vague → 展示完整释义 + tts 再读 → 进入 L2
  - unknown → 详细教学 (词根+近义词+例句) → 进入 L2
- [ ] 新增 `ck:word:save` 回调: 在任何对话中一键加入单词本
- [ ] 新增 `ck:word:review` 回调: 触发 SRS 复习
- [ ] 在 speaking/writing 的 vocab injection 步骤中, 强制注入最近学过的 L2+ 词汇作为挑战词

### 5.2 随时加词增强

- [ ] 更新 SOUL.ielts.md 的 "Single Word Lookup" 规则:
  - 词已存在 → 展示 SRS 状态 + `[复习|ck:word:review]` + `[使用记录|ck:word:history]`
  - 词不存在 → 展示单词卡 + TTS + `[加入单词本|ck:word:save]`

### 5.3 初始测评两阶段改造

- [ ] 重构 `start/SKILL.md` Phase 4 为五步独立测试:
  1. Speaking 快测: 3 个 Part 1 简答 + 可选语音 (pron_assess)
  2. Listening 快测: 2 句精听 (tts+force_reply) + 1 段短音频 (quiz)
  3. Reading 快测: 150 词 + 3 题混合
  4. Writing 快测: 60-90 词短段落
  5. 语法自适应: 6-10 道 quiz poll, 动态调难度
- [ ] 输出格式改为: 四项独立 band 区间 + 置信度 (非单一 Overall)
- [ ] 新增阶段 B 校准规则: 前 3-5 次训练自动收窄 band 区间

### 5.4 周报交互升级

- [ ] 更新 `assessment/SKILL.md` Deep 模式周报格式:
  - 上周 vs 本周对比表 + 趋势箭头
  - 最大进步 + 持续弱项
  - `tg(type:"pin")` 固定周报
  - inline keyboard: `[下周计划|ck:report:plan]` + `[详细数据|ck:report:detail]`

---

## Phase 6: 精细化打磨

> **目标**: 全面落地多维度难度调节和高级功能
> **优先级**: 后续迭代

### 6.1 多维度难度调节全面落地

- [ ] Speaking: 话题类型 + 目标回答时长 + 支架程度 + 追问数量 + 语言支持 → 按 band 矩阵自动配置
- [ ] Listening: 语速 + 音频长度 + 说话人数 + 句法复杂度 + 题目数量 + 口音 → 按 band 矩阵自动配置
- [ ] Reading: 篇幅 + 题型复杂度 + 限时压力 + 翻译策略 → 按 band 矩阵自动配置
- [ ] Writing: 题目抽象度 + 任务类型 + 字数目标 + 支架程度 → 按 band 矩阵自动配置

### 6.2 状态机引擎

- [ ] 在 SOUL.ielts.md 中引入 `state` 概念:
  - `AWAITING_REWRITE` — 拦截新指令，强制完成当前重写
  - `AWAITING_REDO` — 拦截新指令，强制完成当前重做
  - `IN_DICTATION` — 拦截非听写回复
- [ ] 考虑在 SessionAdapter 或 Agent 层实现状态持久化

### 6.3 口音多样化

- [ ] 研究 Edge TTS 可用的英式/澳式/印度英语 voice 列表
- [ ] 在 listening 的 Lecture 模式中, band 6.5+ 启用非标准口音
- [ ] `tts(voice:"en-GB-RyanNeural")` / `tts(voice:"en-AU-NatashaNeural")`

### 6.4 Task 1 图表题图片生成

- [ ] 研究使用 `imageGen` tool 或 mermaid/chart.js 生成图表图片
- [ ] 支持: 柱状图、折线图、饼图、表格、地图对比、流程图

### 6.5 Role-play 场景库

- [ ] 建立 `speaking/references/roleplay_scenarios.md`:
  - 生活场景: 购物/点餐/问路/看医生/银行办事
  - 工作场景: 会议讨论/项目汇报/同事聊天
  - 学术场景: 选课咨询/图书馆/导师沟通
  - 按 band 分级, 低 band 场景简单/高 band 场景复杂

### 6.6 SRS 复习调度与跨技能联动

- [ ] vocab_db 增加 `transfer_level` 字段 (1=notice / 2=collocation / 3=speaking / 4=writing)
- [ ] 当词汇在口语/写作中被成功使用 → 自动升级 transfer_level
- [ ] SRS 复习时, 根据 transfer_level 选择复习方式:
  - L1: 闪卡识别
  - L2: 搭配 quiz
  - L3: "回答下个口语问题时必须用上这个词"
  - L4: "写作中将此词注入为挑战词汇"

---

## 技术债务 & 修复项

> 在 v1 分析中发现的现有问题，应在对应 Phase 中顺带修复

- [ ] `flashcard/scripts/sync_word.js` 路径引用与当前 bundle 结构不一致 → Phase 5.1 时修复
- [ ] `data/SKILL.md` 中部分 `add-plan` 示例参数与 `tracker_db.js` 实际支持不一致 → Phase 1.1 时修复
- [ ] 部分文档仍写 `.py`，实际已迁移到 `.js` → Phase 1.4 时统一修复
- [ ] `vocab_db.js` 的 `inject` 命令参数需与文档对齐 → Phase 1.1 时修复

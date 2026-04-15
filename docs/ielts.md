# Anya IELTS 智能教练系统 — 终极实施蓝图 v4

> **综合 v1(宏观诊断) + v2(逐技能 Workflow) + v3(状态机与闭环) + 项目工程实际能力**，产出可直接指导开发的完整实施蓝图。
>
> 本文档从全局架构到每个功能的 Mermaid 流程图、Telegram 交互细节、Agent 工具链路，全部拉通。

---

## 0. 全局架构总览

### 0.1 系统分层架构

```mermaid
graph TB
    subgraph TG["Telegram 用户端"]
        U[用户] -->|text/voice/callback/photo| BOT[Grammy Bot]
    end

    subgraph ADAPTER["适配器层"]
        BOT --> TA[TelegramAdapter]
        TA --> SA[SessionAdapter]
        SA -->|"tg tool: keyboard/quiz/force_reply/voice/photo/audio/edit/react/pin"| U
    end

    subgraph AGENT["Agent 层"]
        SA --> AG[Agent.run]
        AG --> PB[PromptBuilder]
        PB --> SOUL[SOUL.ielts.md]
        PB --> SKILL[当前 SKILL.md]
        PB --> CTX[ContextEngine]
        CTX --> MEM[MEMORY.md]
        CTX --> USR[USER.md]
    end

    subgraph TOOLS["工具层"]
        AG --> TG_TOOL[tg tool]
        AG --> TTS[tts tool]
        AG --> PRON[pron_assess tool]
        AG --> SHELL[shell tool]
        AG --> MEM_TOOL[memory tool]
        AG --> SKILL_TOOL[skill_manage tool]
    end

    subgraph SKILLS["技能层 src/skills/bundled/ielts/"]
        direction LR
        SK_START[start] --> SK_PRACTICE[practice]
        SK_PRACTICE --> SK_SPEAKING[speaking]
        SK_PRACTICE --> SK_WRITING[writing]
        SK_PRACTICE --> SK_READING[reading]
        SK_PRACTICE --> SK_LISTENING[listening]
        SK_PRACTICE --> SK_FLASHCARD[flashcard]
        SK_PRACTICE --> SK_ASSESS[assessment]
        SK_DAILY[daily] -.->|cron 08:30| AG
        SK_ASSESS -.->|cron 22:00/Sun 20:00| AG
        SK_PLANNER[planner] -.->|triggered by assessment| AG
    end

    subgraph DATA["数据层"]
        SHELL --> TDB[tracker_db.js]
        SHELL --> VDB[vocab_db.js]
        TDB --> LDB[(learner.db)]
        VDB --> VOCDB[(vocab.db)]
        MEM_TOOL --> MEM_FILE[MEMORY.md]
        MEM_TOOL --> USR_FILE[USER.md]
    end
```

### 0.2 核心升级：10 步自适应训练流 (Universal Training Loop)

**所有训练技能（speaking/writing/reading/listening）统一遵循此闭环状态机。** 这是 v3 方案的核心，也是从"刷题机器人"升级为"教练系统"的关键。

```mermaid
stateDiagram-v2
    [*] --> S1_ContextLoad: 进入训练
    S1_ContextLoad --> S2_DecisionEngine: 读取 USER + MEMORY + recent errors
    S2_DecisionEngine --> S3_Warmup: 决定 mode + difficulty
    S3_Warmup --> S4_Scaffold: 可选热身(30s)
    S4_Scaffold --> S5_MainTask: 提供支架支持
    S5_MainTask --> S6_Scoring: 用户完成主任务
    S6_Scoring --> S7_Feedback: 4D评分 + Diff高亮
    S7_Feedback --> S8_MicroDrill: 聚焦1-2个核心瓶颈
    S8_MicroDrill --> S9_ForcedRedo: 针对性微型练习
    S9_ForcedRedo --> S10_MemorySync: 强制重写/重录
    S10_MemorySync --> [*]: 入库 + SRS调度

    note right of S8_MicroDrill: 没有重做就没有教学
    note right of S9_ForcedRedo: 用户必须完成才能结束
```

### 0.3 Telegram 交互能力矩阵

基于现有 `tg` tool 和 `SessionAdapter`，可用的 TG 原生交互：

| TG 交互类型 | Agent 工具调用 | 教学用途 |
|---|---|---|
| **Inline Keyboard** | `tg(type:"keyboard", buttons:[[...]])` | 练习选择、难度反馈、单词响应、模式切换 |
| **Quiz Poll** | `tg(type:"quiz", options:[...], correct:N)` | 语法题、词汇题、听力选择题（自动判分） |
| **Force Reply** | `tg(type:"force_reply", text:"...")` | 写作输入、听写输入、答题输入 |
| **Reply Keyboard** | `tg(type:"reply_keyboard", buttons:[[...]])` | 练习菜单、常用指令 |
| **Voice Message** | `tts(text:"...")` → 自动发送语音气泡 | 听力音频、发音示范、跟读目标音 |
| **Photo** | `tg(type:"photo", url:"...")` | 图表题（Task 1）、思维导图 |
| **Spoiler Text** | `<tg-spoiler>hidden</tg-spoiler>` | 答案隐藏、翻译延迟揭示、自测 |
| **Message Edit** | `tg(type:"edit", message_id:"tag")` | 更新进度、修改反馈 |
| **Reaction** | `tg(type:"react", emoji:"👍")` | 鼓励反馈、表情响应 |
| **Pin** | `tg(type:"pin", message_id:"tag")` | 固定本周计划、重点错误 |
| **Voice Input** | 用户发送语音 → STT 转写 + audio_path | 口语回答、跟读录音 |
| **Pronunciation Assessment** | `pron_assess(audio_path, reference_text)` | 跟读评测、口语发音分析 |

---

## 1. 初始测评 (start) — 两阶段自适应定级

### 1.1 问题诊断

当前 `start` 用 3 句写作 + 4 道选择题推导四项 band，信度极低。程序员用户极易出现"阅读6.0/口语4.0"的不均衡画像。

### 1.2 改进方案：两阶段测评

#### 阶段 A: 快速探底（5-8 分钟）

```mermaid
flowchart TD
    A[Phase 1-2 完成: 建档] --> B["Step 1: Speaking 快测 (90s)"]
    B --> B1["3个 Part1 简答 (force_reply)"]
    B1 --> B2["可选: 20s 语音 → pron_assess"]
    B2 --> C["Step 2: Listening 快测 (90s)"]
    C --> C1["tts 播放2个独立句子"]
    C1 --> C2["用户盲写 (force_reply)"]
    C2 --> C3["1段 30s 短音频 + 1个大意选择 (quiz)"]
    C3 --> D["Step 3: Reading 快测 (2min)"]
    D --> D1["150词短文 + 3题混合 (force_reply)"]
    D1 --> E["Step 4: Writing 快测 (2min)"]
    E --> E1["60-90词短段落 (force_reply)"]
    E1 --> F["Step 5: 语法自适应 (2min)"]
    F --> F1["6-10道 quiz poll, 动态调难度"]
    F1 --> G["输出: 四项 band 区间 + 置信度"]

    style G fill:#f9f,stroke:#333,stroke-width:2px
```

**Telegram 交互细节：**

- Step 1: `tg(type:"force_reply")` 收集文字 → 可选 `pron_assess` 分析语音
- Step 2: `tts` 播放句子 → `tg(type:"force_reply")` 收听写 → `tg(type:"quiz")` 大意题
- Step 3: `tg(type:"text")` 发长文 → `tg(type:"force_reply")` 收答案
- Step 5: 连续 `tg(type:"quiz")` 自适应推题，全对升难，错了降难

**输出格式：**

```
📊 初始评估（置信度: 中）

| 技能 | 估计区间 | 置信度 |
|---|---|---|
| Speaking | 4.5-5.0 | 低 (仅文字) |
| Listening | 5.0-5.5 | 中 |
| Reading | 5.5-6.0 | 中 |
| Writing | 5.0-5.5 | 中 |

⚠️ 前3-5次正式训练后会校准到更精确的画像
```

末尾附带 inline keyboard:

```
[KEYBOARD:
✍️ 开始写作=ck:writing | 🗣️ 开始口语=ck:speaking
📖 开始阅读=ck:reading | 🎧 开始听力=ck:listening
]
```

#### 阶段 B: 校准期（前 3-5 次正式训练）

- 每项技能完成至少 2 次正式练习后，band 区间收窄到 ±0.5
- 置信度标记为"高"，画像正式稳定
- 校准期间每次训练结束时，用 inline keyboard 收集用户感受：

```
[KEYBOARD:
😰 太难了=ck:feedback:too_hard | 👌 刚好=ck:feedback:just_right | 🥱 太简单=ck:feedback:too_easy
]
```

---

## 2. 口语 (Speaking) — 6 模式分层训练体系

### 2.1 模式矩阵总览

```mermaid
flowchart LR
    subgraph LOW["Band 3.5-5.0"]
        M1[Shadowing 跟读]
        M2[Guided QA 引导问答]
    end
    subgraph MID["Band 5.0-6.0"]
        M3[Cue Card Build 提纲构建]
        M4[Role-play 对话练习]
        M5[Retell 复述]
    end
    subgraph HIGH["Band 6.0+"]
        M6[Examiner Sim 考官模拟]
        M5b[Retell 进阶]
    end

    LOW --> MID --> HIGH
```

| 模式 | Band | 支架程度 | TG 交互核心 | Agent 工具 |
|---|---|---|---|---|
| **Shadowing** | < 5.0 | 极高 | voice + inline keyboard | `tts` + `pron_assess` |
| **Guided QA** | 4.5-5.5 | 高 | force_reply + keyboard | `tts` |
| **Cue Card Build** | 5.0-6.0 | 中 | force_reply + keyboard | `tts` |
| **Role-play** | 4.5-6.0 | 中 | 多轮 force_reply | `tts` |
| **Retell** | all | 按材料调 | voice + force_reply | `tts` + `pron_assess` |
| **Examiner Sim** | 5.5+ | 低/零 | voice + keyboard (追问) | `tts` + `pron_assess` |

### 2.2 Shadowing 跟读 — 详细 Workflow

**核心工具链**：`tts` → 用户语音回复 → `pron_assess(audio_path, reference_text)` → 反馈 → 再跟读

```mermaid
flowchart TD
    START[进入 Shadowing] --> CTX["S1: 读取 MEMORY + recent errors
    获取 pronunciation_weak 字段"]
    CTX --> PICK["S2: 选句 (8-14词)
    Band<4.5: 简单生活句
    Band 5.0: 含从句"]
    PICK --> TTS1["S3: tts 播放目标句
    rate: '-15%' (稍慢)"]
    TTS1 --> PROMPT["S4: tg(type:'text')
    '🎤 听完后跟读这个句子，发语音给我'
    + tg-spoiler 隐藏文本"]
    PROMPT --> VOICE["S5: 等待用户语音回复"]
    VOICE --> ASSESS["S6: pron_assess(
      audio_path: 用户语音路径,
      reference_text: 目标句子
    )"]
    ASSESS --> FB["S7: 只纠正1个最重要问题
    - 重音错误 → 标注 + TTS 对比
    - 连读缺失 → 示范片段
    - 尾音吞掉 → 提醒"]
    FB --> REDO_TTS["S8: tts 播放正确版本
    高亮问题部分"]
    REDO_TTS --> REDO["S9: '再跟读一次，注意 X'
    tg(type:'force_reply')"]
    REDO --> ASSESS2["S10: pron_assess 二次评测"]
    ASSESS2 --> RECORD["S11: 记录到 tracker_db
    mode: shadowing
    pronunciation_issue + redo_quality"]
    RECORD --> NEXT{"继续下一句?"}
    NEXT -->|"3-5句一组"| PICK
    NEXT -->|"完成"| KB["tg(type:'keyboard')
    [🔁 再来一组|ck:speaking:shadowing]
    [🗣️ 试试问答|ck:speaking:qa]
    [🏠 返回|ck:menu]"]

    style ASSESS fill:#e1f5fe
    style ASSESS2 fill:#e1f5fe
```

**pron_assess 结果利用：**

```json
{
  "scores": {
    "accuracy": 78,
    "fluency": 65,
    "completeness": 90,
    "prosody": 55
  },
  "words": [
    { "word": "usually", "accuracy": 45, "error": "Mispronunciation" },
    { "word": "weekends", "accuracy": 82 }
  ]
}
```

Agent 根据 `words` 中 accuracy 最低的词定位问题，给出针对性 TTS 对比。

### 2.3 Guided QA 引导问答 — 详细 Workflow

```mermaid
flowchart TD
    START[进入 Guided QA] --> CTX["读取 band + USER interests"]
    CTX --> Q["生成 Part 1 问题
    (基于 engage topics)"]
    Q --> SCAFFOLD{"band < 5.0?"}
    SCAFFOLD -->|Yes| FRAME["提供回答骨架:
    'You can say: I prefer ___ because ___'"]
    SCAFFOLD -->|No| DIRECT["直接提问, 不给骨架"]
    FRAME --> SEND["tg(type:'force_reply')
    发送问题 + 骨架"]
    DIRECT --> SEND2["tg(type:'force_reply')
    发送问题"]
    SEND --> WAIT[等待用户回答 - 文字/语音]
    SEND2 --> WAIT
    WAIT --> EVAL["评估:
    - 是否完整 (非 Yes/No)
    - 是否有 because/for example
    - 语法基本正确"]
    EVAL --> SHORT{"回答 < 2句?"}
    SHORT -->|Yes| EXPAND["tg(type:'text')
    'Good start! Can you add one reason why?'
    tg(type:'force_reply')"]
    EXPAND --> WAIT2[等待扩展回答]
    WAIT2 --> EVAL
    SHORT -->|No| FB["1个纠错 + 1个扩展示范
    tts 播放正确版本"]
    FB --> REDO["'现在把整个回答重说一遍'
    tg(type:'force_reply')"]
    REDO --> RECORD["tracker_db: mode=guided_qa
    answer_length + grammar_issues + redo"]
    RECORD --> KB["tg(type:'keyboard')
    [🔁 再来一题|ck:speaking:qa]
    [⬆️ 试试考官模式|ck:speaking:exam]
    [🏠 返回|ck:menu]"]
```

### 2.4 Examiner Sim 考官模拟 — 增强版 Workflow (6.5+ 冲刺)

```mermaid
flowchart TD
    START[进入 Examiner Sim] --> CTX["读取 band + 近5次数据
    决定 Part 类型"]
    CTX --> PART{"选择 Part"}
    PART -->|Part 1| P1["3个日常问题 + 1-2追问"]
    PART -->|Part 2| P2["Cue Card + 1min准备"]
    PART -->|Part 3| P3["抽象社会议题 + 2-3层递进追问"]

    P1 --> SEND["tg(type:'text') 发送问题
    '🎤 发语音或文字回答'"]
    P2 --> SEND
    P3 --> SEND

    SEND --> RESP[等待用户回答]
    RESP --> PROBE{"band >= 6.5?"}
    PROBE -->|Yes| ATTACK["攻击性追问:
    'However, doesn't ... ?
    How would you respond?'"]
    PROBE -->|No| GENTLE["温和追问:
    'Can you give an example?'"]
    ATTACK --> RESP2[等待回应追问]
    GENTLE --> RESP2

    RESP2 --> SCORE["4D 评分:
    Fluency | Pronunciation
    Lexical | Grammar"]
    SCORE --> MICRO["Micro Drill:
    提取结巴处 → 给高分句型
    'While it is true that..., we cannot overlook...'"]
    MICRO --> TTS_DEMO["tts 播放高分句型"]
    TTS_DEMO --> REDO["'用这个句型重说一遍'
    tg(type:'force_reply')"]
    REDO --> ASSESS["pron_assess 评测重说版本"]
    ASSESS --> RECORD["tracker_db:
    mode=examiner_sim
    answer_length_sec + pause_count
    self_correction + filler_usage"]
    RECORD --> KB["tg(type:'keyboard')
    [🔁 继续|ck:speaking] [📊 看报告|ck:assessment]
    [🏠 返回|ck:menu]"]
```

### 2.5 Speaking 模式自动选择逻辑

```mermaid
flowchart TD
    ENTER[进入 Speaking] --> READ["读取最近5次 speaking session"]
    READ --> CHECK1{"fluency < 4.0 且
    pronunciation 多项 risk?"}
    CHECK1 -->|Yes| SHADOW[→ Shadowing]
    CHECK1 -->|No| CHECK2{"answer_length
    持续低于目标?"}
    CHECK2 -->|Yes| GUIDED[→ Guided QA]
    CHECK2 -->|No| CHECK3{"Part 2 覆盖度
    < 60% 近2次?"}
    CHECK3 -->|Yes| CUE[→ Cue Card Build]
    CHECK3 -->|No| CHECK4{"连续3次
    Examiner Sim?"}
    CHECK4 -->|Yes| RETELL[→ Retell 或 Role-play]
    CHECK4 -->|No| EXAM[→ Examiner Sim]

    SHADOW --> OVERRIDE
    GUIDED --> OVERRIDE
    CUE --> OVERRIDE
    RETELL --> OVERRIDE
    EXAM --> OVERRIDE

    OVERRIDE["展示推荐 + 允许用户选择
    tg(type:'keyboard')
    [推荐: 跟读|ck:speaking:shadowing]
    [自选: 问答|ck:speaking:qa]
    [自选: 考官|ck:speaking:exam]
    [自选: 复述|ck:speaking:retell]"]
```

### 2.6 难度反馈收集 (所有 Speaking 模式通用)

每次练习结束后，通过 inline keyboard 收集用户对难度的感受：

```
tg(type:"keyboard", text:"这次练习感觉怎么样？",
   buttons:[
     ["😰 太难了|ck:feedback:too_hard", "👌 刚好|ck:feedback:just_right", "🥱 太简单|ck:feedback:too_easy"],
     ["🗣️ 继续口语|ck:speaking", "🏠 返回菜单|ck:menu"]
   ])
```

回调处理：
- `ck:feedback:too_hard` → 下次降低一个难度档 + 增加支架
- `ck:feedback:just_right` → 保持当前难度
- `ck:feedback:too_easy` → 下次升高一个难度档 + 减少支架
- 写入 `tracker_db` 的 `difficulty_feedback` 字段

---

## 3. 听力 (Listening) — 5 模式解码重构体系

### 3.1 模式矩阵总览

```mermaid
flowchart LR
    subgraph LOW["Band 3.5-5.0"]
        L1[Sound Drill 辨音训练]
        L2[Dictation 听写]
    end
    subgraph MID["Band 5.0-6.0"]
        L3[Short Clip 短音频理解]
        L4[Question Type 题型专项]
    end
    subgraph HIGH["Band 6.0+"]
        L5[Lecture 讲座笔记]
        L4b[Question Type 进阶]
    end

    LOW --> MID --> HIGH
```

| 模式 | Band | 音频特征 | TG 交互核心 | Agent 工具 |
|---|---|---|---|---|
| **Sound Drill** | < 5.0 | 单词/短语对比 | quiz poll + tts 对比 | `tts` |
| **Dictation** | 4.5-6.0 | 8-25词单句 | force_reply + diff 高亮 | `tts` |
| **Short Clip** | 5.0-6.0 | 40-80s 对话 | force_reply + spoiler | `tts` |
| **Question Type** | all | 按题型设计 | quiz + force_reply | `tts` |
| **Lecture** | 6.0+ | 90-180s 学术 | force_reply + keyboard | `tts` |

### 3.2 Sound Drill 辨音训练 — 详细 Workflow

```mermaid
flowchart TD
    START[进入 Sound Drill] --> CTX["读取 MEMORY.listening_risk
    获取已知混淆音对"]
    CTX --> PICK["选择混淆组:
    - 最小对立体: ship/sheep
    - 连读: pick it up
    - 弱读: can /kən/ vs /kæn/
    - 数字: 15 vs 50"]
    PICK --> TTS1["tts 播放目标音/词"]
    TTS1 --> QUIZ["tg(type:'quiz')
    '你听到的是？'
    options: ['ship', 'sheep']
    correct: 0"]
    QUIZ --> CHECK{"答对?"}
    CHECK -->|Yes| NEXT["tg(type:'react', emoji:'✅')
    进入下一组"]
    CHECK -->|No| COMPARE["tts 分别播放两个对比音
    tg(type:'text'):
    '你听到的是 /ʃɪp/ (ship)
    不是 /ʃiːp/ (sheep)
    关键区别: 短元音 /ɪ/ vs 长元音 /iː/'"]
    COMPARE --> REPLAY["tg(type:'keyboard')
    [🔁 再听一次|ck:listening:replay]
    [➡️ 下一组|ck:listening:next]"]
    REPLAY --> TTS1
    NEXT --> COUNT{"完成5-8组?"}
    COUNT -->|No| PICK
    COUNT -->|Yes| RECORD["tracker_db:
    mode=sound_drill
    confusion_pairs + accuracy"]
    RECORD --> FB_KB["难度反馈 keyboard"]
```

### 3.3 Dictation 听写 — 详细 Workflow

```mermaid
flowchart TD
    START[进入 Dictation] --> CTX["读取 band 决定句子复杂度"]
    CTX --> PICK["选句:
    Band 4.5-5.0: 8-12词简单句
    Band 5.0-5.5: 12-18词含从句
    Band 5.5-6.0: 18-25词学术句"]
    PICK --> TTS1["tts 播放句子 - 只播1遍, 自然语速"]
    TTS1 --> INPUT["tg(type:'force_reply')
    '写出你听到的完整句子'"]
    INPUT --> DIFF["逐词 Diff 对比:
    标注: 功能词遗漏? 拼写? 词序?"]
    DIFF --> SHOW["tg(type:'text') 高亮结果:
    'The library ~close~→closes
    at ~6~→six o clock'"]
    SHOW --> TTS2["tts 播放第2遍
    '再听一次，补充你漏掉的部分'"]
    TTS2 --> INPUT2["tg(type:'force_reply')
    '修正后的版本'"]
    INPUT2 --> FINAL["给出正确全文 + 关键难点:
    '注意: closes 第三人称单数s
    雅思听力要求 six 拼写'"]
    FINAL --> PARAPHRASE{"涉及同义替换?"}
    PARAPHRASE -->|Yes| PARA_DRILL["同义替换 Micro Drill:
    tg(type:'quiz')
    '录音里的 essential 和题目的
    necessary 是完美替换还是有差别?'"]
    PARAPHRASE -->|No| RECORD
    PARA_DRILL --> RECORD["tracker_db:
    mode=dictation
    accuracy_rate + error_types"]
    RECORD --> NEXT{"完成3-5句?"}
    NEXT -->|No| PICK
    NEXT -->|Yes| FB_KB["难度反馈 keyboard"]
```

### 3.4 Short Clip 增强版 — 两遍听 + 错因分析

```mermaid
flowchart TD
    START[进入 Short Clip] --> GEN["生成 40-80s 音频脚本
    对话/独白/采访"]
    GEN --> TTS["tts 播放第1遍"]
    TTS --> GIST["tg(type:'force_reply')
    '第1遍: 这段对话主要在说什么?'"]
    GIST --> CHECK1[评估大意理解]
    CHECK1 --> TTS2["tts 播放第2遍"]
    TTS2 --> DETAIL["tg(type:'force_reply')
    '第2遍: 回答以下细节问题:
    1. ...  2. ...  3. ...'"]
    DETAIL --> SCORE[判分 + 错因分析]
    SCORE --> CAUSE{"错误类型?"}
    CAUSE -->|A: 没听到| REPLAY_CLIP["播放关键句片段
    tts播放关键句子"]
    CAUSE -->|B: 听到没理解| EXPLAIN["解释表达含义
    + 搭配用法"]
    CAUSE -->|C: 干扰项| COMPARE["对比干扰项 vs 正确答案
    用 tg-spoiler 隐藏正确答案"]
    REPLAY_CLIP --> MICRO
    EXPLAIN --> MICRO
    COMPARE --> MICRO
    MICRO["Micro Drill:
    从错题中抽1个关键句
    让用户听写或复述"]
    MICRO --> TRANSCRIPT{"band决定翻译策略"}
    TRANSCRIPT -->|"<5.0"| FULL_TL["全文 + 全翻译
    tg-spoiler包裹"]
    TRANSCRIPT -->|"5.0-6.0"| PARTIAL_TL["全文 + 关键句翻译"]
    TRANSCRIPT -->|"6.5+"| EVIDENCE["只给 evidence line
    不默认翻译"]
    FULL_TL --> RECORD
    PARTIAL_TL --> RECORD
    EVIDENCE --> RECORD
    RECORD["tracker_db:
    mode=short_clip
    gist_correct + detail_accuracy
    error_causes"]
    RECORD --> FB_KB["难度反馈 keyboard
    + 再听一遍|ck:listening:replay"]
```

### 3.5 翻译支持分级策略

| Band | Transcript | 翻译 | 实现方式 |
|---|---|---|---|
| 4.0-5.0 | 全文 | 全文中文翻译 | `<tg-spoiler>全文+翻译</tg-spoiler>` |
| 5.5-6.0 | 全文 | 只翻译关键句 + 生词释义 | 关键句用 `<tg-spoiler>` |
| 6.5+ | 标注 evidence line | 不默认翻译，按需请求 | inline keyboard: `[显示翻译\|ck:show_translation]` |

---

## 4. 阅读 (Reading) — 提速与长难句外科手术

### 4.1 模式矩阵

| 模式 | 适用场景 | 核心交互 |
|---|---|---|
| **Flash-Skimming** | 逐字翻译/阅读极慢 | 限时展示 → 隐藏 → quiz |
| **Sentence Anatomy** | 长难句崩溃/TFNG错位 | 标注主谓 → 苏格拉底追问 |
| **Standard Practice** | 常规训练 | 300-600词 + 混合题型 |
| **Timed Exam** | 备考冲刺 | 900词 + 15分钟限时 |

### 4.2 Flash-Skimming 闪卡略读 — 详细 Workflow

```mermaid
flowchart TD
    START[进入 Flash-Skimming] --> GEN["生成段落 100-150词"]
    GEN --> SHOW["tg(type:'text', tag:'passage')
    展示段落 + '30秒后隐藏'"]
    SHOW --> WAIT["等待30秒"]
    WAIT --> HIDE["tg(type:'edit', message_id:'passage')
    替换为 '时间到！段落已隐藏'"]
    HIDE --> QUIZ["tg(type:'quiz')
    '这段话的 Heading 是？'
    4个选项"]
    QUIZ --> CHECK{"答对?"}
    CHECK -->|Yes| NEXT["继续下一段"]
    CHECK -->|No| REVEAL["tg(type:'text')
    重新展示段落 + 高亮关键句
    '关键信号词是: however, primarily'"]
    REVEAL --> NEXT
    NEXT --> FB_KB
```

### 4.3 Sentence Anatomy 长难句解剖 — 详细 Workflow

```mermaid
flowchart TD
    START[用户某题答错] --> EXTRACT["提取导致错误的长难句"]
    EXTRACT --> SHOW["tg(type:'text')
    展示句子, 标注从句层次"]
    SHOW --> Q1["苏格拉底提问 (force_reply):
    'which was largely ignored...
    修饰的是谁?'"]
    Q1 --> CHECK{"回答正确?"}
    CHECK -->|Yes| Q2["递进提问:
    '整个句子的主语和核心谓语是?'"]
    CHECK -->|No| HINT["给提示:
    '试试把 which 从句去掉，
    剩下的部分是什么?'"]
    HINT --> Q1_RETRY["再次提问 (force_reply)"]
    Q1_RETRY --> CHECK
    Q2 --> TFNG{"涉及 T/F/NG 题?"}
    TFNG -->|Yes| LOGIC["逻辑追问:
    '你选了 False, 但题目用的是 some,
    原文用的是 the majority,
    它们是绝对矛盾还是包含关系?'
    tg(type:'quiz')"]
    TFNG -->|No| RECORD
    LOGIC --> RECORD["tracker_db:
    error_type: sentence_anatomy_fail
    或 tfng_logic_error"]
```

### 4.4 Standard Practice 增强版 Workflow

```mermaid
flowchart TD
    START[进入 Reading] --> CTX["S1: 读取 band + recent errors"]
    CTX --> DECIDE["S2: 决定篇幅 + 题型组合
    Band 4-5: 200词 + 3题
    Band 5-6: 400词 + 4题
    Band 6+: 600-900词 + 6题"]
    DECIDE --> GEN["S3: 生成文章 + 题目
    注入 vocab_db 挑战词汇"]
    GEN --> SEND["S4: tg(type:'text')
    文章 + 题目 + 限时提示"]
    SEND --> INPUT["tg(type:'force_reply')
    '回复你的答案'"]
    INPUT --> SCORE["S5: 判分 + 错因标注
    结果: 3/4 正确
    定位每个错题的原文证据"]
    SCORE --> WRONG{"有错题?"}
    WRONG -->|Yes| ANATOMY["S6: Sentence Anatomy
    对错题相关长难句解剖"]
    WRONG -->|No| SKIP["S6: 跳过解剖"]
    ANATOMY --> TRANSLATE{"S7: 翻译策略"}
    TRANSLATE -->|"band<5.5"| FULL["全文翻译 tg-spoiler"]
    TRANSLATE -->|"5.5-6.0"| PARTIAL["关键句翻译"]
    TRANSLATE -->|"6.5+"| EVIDENCE["evidence line only"]
    FULL --> RECORD
    PARTIAL --> RECORD
    EVIDENCE --> RECORD
    SKIP --> RECORD
    RECORD["S8: tracker_db:
    mode + question_types + accuracy + duration"]
    RECORD --> FB_KB["S9: 难度反馈 keyboard
    + 再来一篇|ck:reading
    + 返回|ck:menu"]
```

---

## 5. 写作 (Writing) — 支架与重写闭环

### 5.1 模式矩阵

| 阶段 | 模式 | 适用场景 | TG 交互 |
|---|---|---|---|
| **冷启动** | Brainstorming 思路脑暴 | 拿到题目大脑空白 | inline keyboard 选论点 |
| **段落微操** | TEEL Drill | 逻辑散乱/不会举例 | 分步 force_reply |
| **完整写作** | Full Task + Forced Rewrite | 常规训练 | force_reply + 重写循环 |

### 5.2 完整写作 Workflow（含 Brainstorming + Forced Rewrite）

```mermaid
flowchart TD
    START[进入 Writing] --> CTX["S1: 读取 band + weak_dimensions
    + recent writing errors"]
    CTX --> DECIDE["S2: 决定任务类型
    Task 1 图表 或 Task 2 议论
    + 难度 = band + 0.5"]
    DECIDE --> BRAIN_CHECK{"band < 5.5?"}

    BRAIN_CHECK -->|Yes| BRAIN["S3: Brainstorming 阶段
    tg(type:'force_reply')
    '先不写正文! 用中文/简单英文
    列出2个支持论点'"]
    BRAIN --> BRAIN_FB["Anya 将论点翻译为
    雅思高分词块 + 搭配
    tg(type:'text')"]
    BRAIN_FB --> TEEL["S4: TEEL 段落支架
    tg(type:'keyboard')
    [T 主题句|ck:writing:topic]
    [E 解释|ck:writing:explain]
    [E 举例|ck:writing:example]
    [L 总结|ck:writing:link]"]
    TEEL --> EACH_STEP["逐步 force_reply 收集
    每部分单独提交"]

    BRAIN_CHECK -->|No| DIRECT["S3: 直接出题
    tg(type:'force_reply')
    题目 + 挑战词汇"]

    EACH_STEP --> WRITE["S5: 用户提交完整段落/文章"]
    DIRECT --> WRITE

    WRITE --> SCORE["S6: 4D评分 + Diff高亮
    Task Response + Coherence
    Lexical + Grammar"]
    SCORE --> FB["S7: 聚焦反馈
    只抓1-2个核心瓶颈
    例: '缺连接词 + bad太低级'"]
    FB --> MICRO["S8: Micro Drill
    tg(type:'force_reply')
    '用 detrimental 替换 bad, 造一个句子'"]
    MICRO --> CHECK_MICRO["验证 micro drill"]
    CHECK_MICRO --> REWRITE["S9: Forced Rewrite
    tg(type:'force_reply')
    '带着新的连接词和高级词汇
    把整个段落重写一遍发给我'"]
    REWRITE --> COMPARE["S10: AI 对比验收
    初稿 vs 重写版"]
    COMPARE --> PASS{"达到 +0.5 band?"}
    PASS -->|Yes| CELEBRATE["tg(type:'react', emoji:'🎉')
    Waku Waku! 进步了!"]
    PASS -->|No| HINT["再给1个具体修改建议
    '试试在开头加 Consequently'"]
    HINT --> REWRITE
    CELEBRATE --> RECORD["tracker_db:
    mode=full_task / teel_drill
    redo_count + improvement_delta"]
    RECORD --> FB_KB["难度反馈 keyboard"]
```

### 5.3 Task 1 图表题特殊处理

```mermaid
flowchart TD
    T1[Task 1 选中] --> TYPE["选择图表类型:
    tg(type:'keyboard')
    [柱状图|ck:writing:bar]
    [折线图|ck:writing:line]
    [饼图|ck:writing:pie]
    [地图|ck:writing:map]
    [流程图|ck:writing:process]"]
    TYPE --> GEN["生成图表描述/图片
    tg(type:'photo') 发送图表"]
    GEN --> VOCAB["注入图表描述高频词:
    fluctuate, peak, plateau,
    account for, respectively"]
    VOCAB --> WRITE["tg(type:'force_reply')
    '描述这张图表, 150+词'"]
```

---

## 6. 单词 (Flashcard) — 生产性迁移体系

### 6.1 4 级迁移模型

```mermaid
flowchart LR
    L1["L1 Notice
    闪卡识别
    inline keyboard"] --> L2["L2 Collocation
    搭配快练
    quiz poll"]
    L2 --> L3["L3 Speaking Transfer
    口语迁移
    强制使用"]
    L3 --> L4["L4 Writing Transfer
    写作迁移
    挑战词汇注入"]

    style L1 fill:#e3f2fd
    style L2 fill:#bbdefb
    style L3 fill:#90caf9
    style L4 fill:#64b5f6
```

### 6.2 单词卡增强 Workflow

```mermaid
flowchart TD
    START[进入 Flashcard] --> CTX["读取 band/CEFR + USER interests"]
    CTX --> PICK["选词 - 检查 vocab_db 不重复"]
    PICK --> TTS["tts 播放: 'word ... word ... word'
    读3遍"]
    TTS --> CARD["tg(type:'text')
    'meticulous /metikjeles/
    tg-spoiler: adj. 一丝不苟的
    She is meticulous about records.'"]
    CARD --> KB["tg(type:'keyboard')
    [认识|ck:word:known]
    [模糊|ck:word:vague]
    [不认识|ck:word:unknown]
    [加入单词本|ck:word:save]
    [再来一个|ck:word:next]"]

    KB --> RESP{"用户响应"}
    RESP -->|known| COLLOC["L2: 搭配快练
    tg(type:'quiz')
    '___ consequence'
    options: inevitable, unavoidable, certain"]
    RESP -->|vague| EXPLAIN["展示完整释义 + 例句
    + tts 再读一遍
    然后进入 L2 搭配"]
    RESP -->|unknown| TEACH["详细教学:
    词根拆解 + 近义词对比
    + tts 慢速读 + 例句
    然后进入 L2 搭配"]
    RESP -->|save| SYNC["sync_word.js → vocab.db
    tg(type:'react', emoji:'check')
    继续当前流程"]
    RESP -->|next| PICK

    COLLOC --> SYNC_DB["vocab_db: 记录 quiz 结果"]
    EXPLAIN --> COLLOC
    TEACH --> COLLOC
    SYNC_DB --> TRANSFER{"本周口语/写作练习时"}
    TRANSFER --> INJECT["自动注入为挑战词汇
    L3/L4 迁移训练"]
```

### 6.3 随时加词功能

**用户在任何对话中发送一个英文单词** → SOUL.md 路由匹配 → 触发隐式查词 + 加入单词本:

```mermaid
flowchart TD
    WORD["用户发送: 'meticulous'"] --> LOOKUP["vocab_db lookup meticulous"]
    LOOKUP --> EXISTS{"已在单词本?"}
    EXISTS -->|Yes| SHOW["展示已有记录 + SRS 状态
    tg(type:'keyboard')
    [复习|ck:word:review]
    [使用记录|ck:word:history]"]
    EXISTS -->|No| CARD["展示单词卡 + TTS
    tg(type:'keyboard')
    [加入单词本|ck:word:save]
    [换一个|ck:word:next]"]
```

---

## 7. 难度反馈与自适应系统

### 7.1 统一难度反馈机制

**所有训练结束后**都附带难度反馈 inline keyboard，这是让系统真正"自适应"的关键：

```mermaid
flowchart TD
    END[训练结束] --> FB_KB["tg(type:'keyboard')
    [太难了|ck:feedback:too_hard]
    [刚好|ck:feedback:just_right]
    [太简单|ck:feedback:too_easy]"]

    FB_KB --> HARD["ck:feedback:too_hard"]
    FB_KB --> OK["ck:feedback:just_right"]
    FB_KB --> EASY["ck:feedback:too_easy"]

    HARD --> ADJ_DOWN["tracker_db: difficulty_feedback=too_hard
    下次: 降低难度参数
    - 语速降低 / 篇幅缩短
    - 增加支架 / 给骨架
    - 切换到低阶模式"]

    OK --> KEEP["保持当前难度
    继续轮换模式"]

    EASY --> ADJ_UP["tracker_db: difficulty_feedback=too_easy
    下次: 提高难度参数
    - 语速加快 / 篇幅增长
    - 减少支架
    - 切换到高阶模式"]
```

### 7.2 多维度难度调节矩阵

| 维度 | Speaking | Listening | Reading | Writing |
|---|---|---|---|---|
| **话题/内容** | 生活→社会→抽象 | 生活→学术 | 150词→900词 | 简单议题→抽象议题 |
| **时间压力** | 无→1min准备 | 自然语速→快速 | 无限→15min限时 | 无限→40min限时 |
| **支架程度** | 给骨架→给关键词→不给 | 2遍听→1遍听 | 给翻译→关键词→不给 | 脑暴+TEEL→直接写 |
| **追问/题量** | 0→1→3 | 1-3题→5-8题 | 3题→6题 | 无→段落重写 |
| **口音/复杂度** | - | 标准→英式→混合口音 | 简单句→长难句密集 | Task 2→Task 1混合 |

---

## 8. 评估与复习系统

### 8.1 三级评估体系

```mermaid
flowchart TD
    subgraph LIGHT["Light 每日22:00 静默"]
        L1[查询今日 samples] --> L2[EMA 更新 band]
        L2 --> L3[更新 Top Errors]
        L3 --> L4[写入 MEMORY.md]
    end

    subgraph DEEP["Deep 周日20:00 报告"]
        D1[查询7天数据] --> D2[全维度分析]
        D2 --> D3[更新所有 MEMORY 字段]
        D3 --> D4[触发 planner 生成周计划]
        D4 --> D5["发送周报 + pin"]
    end

    subgraph DEMAND["On-Demand 用户触发"]
        O1[4项快速测试] --> O2[对比历史数据]
        O2 --> O3[生成进步报告]
        O3 --> O4["inline keyboard:
        [详细报告|ck:report:detail]
        [本周计划|ck:report:plan]"]
    end
```

### 8.2 周报交互设计

```
本周学习报告 (4.7 - 4.13)

| 技能 | 上周 | 本周 | 趋势 |
|---|---|---|---|
| Speaking | 5.0 | 5.5 | up |
| Listening | 5.5 | 5.5 | same |
| Reading | 5.5 | 6.0 | up |
| Writing | 5.0 | 5.0 | same |

本周完成 12 次练习，连续打卡 7 天
最大进步: Speaking fluency
持续弱项: writing cohesion

[KEYBOARD:
下周计划=ck:report:plan | 详细数据=ck:report:detail
返回=ck:menu
]
```

---

## 9. 数据层扩展方案

### 9.1 tracker_db.js samples 表扩展

当前字段保留，新增以下字段：

| 新字段 | 类型 | 用途 |
|---|---|---|
| `mode` | TEXT | shadowing / dictation / guided_qa / examiner_sim / teel_drill / full_task / ... |
| `question_type` | TEXT | TFNG / form_completion / cue_card / task1_process / ... |
| `duration_sec` | INTEGER | 实际答题耗时（秒） |
| `redo_count` | INTEGER | 重写/重录次数（没有 redo 的 sample 权重降低） |
| `support_level` | TEXT | high / medium / low / none（支架程度） |
| `difficulty_feedback` | TEXT | too_hard / just_right / too_easy（用户反馈） |
| `audio_duration_sec` | INTEGER | 听力音频时长 |
| `response_length_words` | INTEGER | 用户回答字数 |
| `accent` | TEXT | standard / british / australian / mixed |
| `speaker_count` | INTEGER | 听力说话人数 |

### 9.2 errors 表扩展 Error Taxonomy

```
Speaking:
  pronunciation_stress, pronunciation_vowel, pronunciation_consonant,
  hesitation_breakdown, filler_overuse, part3_abstraction_gap,
  answer_too_short, self_correction_fail

Listening:
  minimal_pair_confusion, function_word_miss, paraphrase_miss,
  distractor_trap, spelling_error, missed_plural_s,
  number_confusion, connected_speech_fail

Reading:
  tfng_logic_error, heading_mismatch, sentence_anatomy_fail,
  detail_location_fail, speed_too_slow, inference_error

Writing:
  cohesion_missing, topic_sentence_weak, example_vague,
  word_choice_basic, task_response_off_topic, paragraph_structure_weak
```

### 9.3 新增回调路由 (SOUL.ielts.md 扩展)

```
难度反馈:
  ck:feedback:too_hard    → 记录 + 调难度
  ck:feedback:just_right  → 记录
  ck:feedback:too_easy    → 记录 + 调难度

Speaking 模式选择:
  ck:speaking:shadowing   → speaking (mode=shadowing)
  ck:speaking:qa          → speaking (mode=guided_qa)
  ck:speaking:exam        → speaking (mode=examiner_sim)
  ck:speaking:retell      → speaking (mode=retell)
  ck:speaking:roleplay    → speaking (mode=roleplay)

Listening 模式选择:
  ck:listening:sound      → listening (mode=sound_drill)
  ck:listening:dictation  → listening (mode=dictation)
  ck:listening:clip       → listening (mode=short_clip)
  ck:listening:type       → listening (mode=question_type)

Reading 模式选择:
  ck:reading:skim         → reading (mode=flash_skimming)
  ck:reading:anatomy      → reading (mode=sentence_anatomy)

Writing 模式选择:
  ck:writing:brain        → writing (mode=brainstorming)
  ck:writing:teel         → writing (mode=teel_drill)
  ck:writing:topic        → writing TEEL step T
  ck:writing:explain      → writing TEEL step E1
  ck:writing:example      → writing TEEL step E2
  ck:writing:link         → writing TEEL step L

单词扩展:
  ck:word:save            → flashcard (sync to db)
  ck:word:review          → flashcard (SRS review)
  ck:word:history         → flashcard (usage history)

其他:
  ck:show_translation     → 显示翻译
  ck:report:detail        → assessment (detailed view)
  ck:report:plan          → planner (show plan)
```

---

## 10. 实施优先级与阶段规划

### Phase 1: 核心闭环 (最高优先级)

**目标：让每次训练都有"重做"环节，形成最小闭环**

1. 统一训练流模板：在所有 SKILL.md 中加入 S8(Micro Drill) + S9(Forced Redo) 步骤
2. 难度反馈 inline keyboard：所有训练结束后附带 `ck:feedback:*` 按钮
3. tracker_db.js 扩展：新增 `mode`, `redo_count`, `difficulty_feedback` 字段
4. SOUL.ielts.md 路由扩展：新增所有 `ck:feedback:*` 回调

### Phase 2: Speaking 多模式 (高优先级)

**目标：口语从单一 Part 1/2/3 升级为 6 模式体系**

1. Shadowing 模式实现（`tts` + `pron_assess` 闭环）
2. Guided QA 模式实现（支架 + 扩展引导）
3. 模式自动选择逻辑
4. 模式选择 inline keyboard

### Phase 3: Listening 多模式 (高优先级)

**目标：听力从"泛听做题"升级为"解码重构"**

1. Sound Drill 辨音训练（quiz poll 对比）
2. Dictation 听写（Diff 高亮 + 二次修正）
3. Short Clip 增强（两遍听 + 错因分析）
4. 翻译分级策略

### Phase 4: 写作增强 + 阅读增强 (中优先级)

1. Brainstorming 前置阶段
2. TEEL 段落支架
3. Forced Rewrite 循环
4. Reading: Flash-Skimming + Sentence Anatomy

### Phase 5: 词汇迁移 + 评估升级 (中优先级)

1. 单词 4 级迁移模型
2. 随时加词功能增强
3. 初始测评两阶段改造
4. 周报交互升级

### Phase 6: 精细化打磨 (后续迭代)

1. 多维度难度调节矩阵全面落地
2. 状态机引擎（AWAITING_REWRITE 等状态拦截）
3. 口音多样化（英/澳/印）
4. Task 1 图表题图片生成
5. Role-play 场景库
6. SRS 复习调度与跨技能联动

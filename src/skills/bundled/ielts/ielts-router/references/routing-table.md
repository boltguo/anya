# Free-form → Skill Routing Table

Match the learner's phrasing, then invoke the target. If nothing matches, show the main menu.

## Track-only (no mode) → show the nav page

| Phrase | Page |
| ------ | ---- |
| 口语 / speaking | `nav:speaking` |
| 听力 / listening | `nav:listening` |
| 阅读 / reading | `nav:reading` |
| 写作 / writing / 作文 | `nav:writing` |
| 单词 / 词汇 / vocab | `nav:vocab` |
| 考试 / 模考 / exam / mock | `nav:exam` |
| 分析 / 诊断 / analysis | `nav:analysis` |

## Analysis intents

| Phrase | Skill |
| ------ | ----- |
| 模考成绩 / 历次考试 / exam analysis | `analysis-exam` |
| 学了多久 / 坚持 / 学习情况 / study stats | `analysis-study` |
| 哪里最弱 / 瓶颈 / 高频错误 / weakness | `analysis-weakness` |
| 下一步 / 接下来练什么 / 帮我规划 / recommend | `analysis-recommend` |
| 看看我水平 / 我现在几分 / sync / refresh | `learner-state` |
| 给点建议 / 建议 / 怎么练 / advice | `coach-passive` |

## Speaking modes

| Phrase | Skill |
| ------ | ----- |
| 跟读 / shadow | `speaking-shadowing` |
| 复述 / retell | `speaking-repeat` |
| 自由说 / freetalk | `speaking-freetalk` |
| 角色扮演 / roleplay / 情景 | `speaking-roleplay` |
| 讲解口语 / explain speaking | `speaking-explain` |
| 口语模考 / full speaking | `speaking-exam` |

## Listening modes

| Phrase | Skill |
| ------ | ----- |
| 听写 / dictation | `listening-dictation` |
| 预判 / prediction | `listening-prediction` |
| 听力跟读 | `listening-shadowing` |
| 数字 / 日期 / 拼写 | `listening-numberdrill` |
| 地图题 | `listening-mapdrill` |
| 讲解听力 / explain listening | `listening-explain` |
| 听力模考 / full listening | `listening-exam` |

## Reading modes

| Phrase | Skill |
| ------ | ----- |
| 限时阅读 / timed | `reading-timed` |
| 精读 / untimed | `reading-untimed` |
| 题型 / type | `reading-typetrain` |
| 略读 / skim | `reading-skim-drill` |
| 抽词 / 保存词 | `reading-vocab-extract` |
| 讲解阅读 / explain reading | `reading-explain` |
| 阅读模考 / full reading | `reading-exam` |

## Writing modes

| Phrase | Skill |
| ------ | ----- |
| Task 1 图表 / academic task 1 | `writing-task1-academic` |
| Task 1 信 / letter | `writing-task1-general` |
| Task 2 / 议论文 / essay | `writing-task2` |
| 带提纲 / guided | `writing-guided` |
| 改写 / rewrite | `writing-rewrite` |
| 句子专项 / sentence drill | `writing-sentence-drill` |
| 搭配 / collocation | `writing-collocation` |
| 讲解作文 / explain writing | `writing-explain` |
| 写作模考 / full writing | `writing-exam` |

## Vocab modes

| Phrase | Skill |
| ------ | ----- |
| 复习单词 / srs | `vocab-review` |
| 考考我 / test me | `vocab-testme` |
| 题源抽词 / contextual | `vocab-contextual` |
| 话题词汇 / topic vocab | `vocab-topic` |

## Special

- `/profile-manager` or `建档 / 改资料 / update profile` → `profile-manager`
- `今天 / 晨报 / daily briefing` → `ielts-cron-briefing` (surface today's package)

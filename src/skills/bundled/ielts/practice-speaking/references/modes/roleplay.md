# Mode: Role-play 对话练习

> Band 4.5-6.0 | Medium scaffolding | 4-6 turn natural dialogue

## S3 — Set Scene

Pick a life scenario (based on USER.md interests):

- 生活: 咖啡店点餐 / 向同事介绍周末 / 帮朋友推荐电影 / 旅行问路
- 工作: 会议讨论 / 项目汇报 / 同事聊天
- 学术: 选课咨询 / 图书馆 / 导师沟通

```
🎭 **Role-play: 咖啡店点餐**

我是咖啡店店员，你来点单。
Ready? I'll start:

"Hi there! Welcome to Bean & Brew. What can I get for you today?"

🎤 发语音或打字回答
```

## S4-S5 — Multi-turn Dialogue (4-6 turns)

System plays the other role. Each turn uses `tg(type:"force_reply")`.
Maintain natural conversation flow. Introduce small complications (e.g., "Sorry, we're out of oat milk today") to test resilience.

## S6 — Post-dialogue Feedback

After 4-6 turns, give unified feedback on:

- Expression naturalness
- Grammar accuracy
- Conversation maintenance ability

## S7 — Highlight

1-2 good expressions + 1-2 improvements needed.

## S8 — Micro Drill

Extract 1 awkward expression → provide a natural alternative → TTS.

## S9 — Forced Redo

```
tg(type:"force_reply", text:"重说你第3轮的回答，用更自然的表达")
```

## S10 — Record

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, band_overall, session_id) VALUES (datetime('now'), 'speaking', 'roleplay', ?, ?)" params='[null, "<session_id>"]'
```

Difficulty feedback keyboard.

---
name: cron-briefing
description: 'Personalized daily IELTS briefing with Active Driver alignment, today''s tasks, adapted article, audio, image, and pinned Telegram delivery'
---

# Daily Briefing — Driver-Aligned Learning Package

## Purpose

Deliver one pinned daily learning package that:
1. Shows today's orchestrator-generated tasks
2. Provides relevant content aligned to the current Active Driver
3. Can be revisited throughout the day

This is not a weekly warm-up or timetable. Scheduling is handled externally by cron. This skill only decides what to send and how to package it.

## When to Use

- Triggered by cron at **08:30 every day**
- Learner says "今天", "今日推送", "晨报", "daily briefing"

## Resources

- **Briefing package template**: `./templates/briefing_package.md`

## Protocol

1. **Gather learner context**
   - Read `MEMORY.md`: current band estimates, confidence, weak dimensions, adaptive controls, top errors, **Path type, Current Stage, Active Driver, Daily Load budget**
   - Read `USER.md`: hobbies, engage topics, avoid topics, motivation, preferred tone
   - Query recent learner activity:

   ```
   db name=learner sql="SELECT created_at, skill_type FROM samples ORDER BY created_at DESC LIMIT 20"
   db name=learner sql="SELECT created_at, skill_type, band_overall FROM samples WHERE skill_type IN ('daily_briefing','reading','listening','speaking','writing') ORDER BY created_at DESC LIMIT 20"
   ```

   - Query today's tasks:

   ```
   db name=learner sql="SELECT task_type, skill, mode, callback, load_score, completed FROM daily_tasks WHERE date = date('now') ORDER BY CASE task_type WHEN 'primary' THEN 1 WHEN 'review' THEN 2 WHEN 'consolidation' THEN 3 END"
   ```

   Use this to detect inactivity and avoid repeating the same theme or support level.

2. **Select today's topic — Driver-Aligned**
   - **Primary selection criterion**: Choose a topic that supports the current `Active Driver.primary_focus`
     - If driver is writing-focused → pick a topic good for essay discussion / opinion prompts
     - If driver is speaking-focused → pick a conversational topic with Part 2/3 potential
     - If driver is listening-focused → pick a topic suitable for audio narration
     - If driver is reading-focused → pick a topic with academic depth
   - Use `web_search` to find a timely article, news item, or explainer topic that overlaps with the learner's interests AND the driver focus
   - Prefer topics that are useful for IELTS discussion and writing:
     - education, technology, work and society, environment, health and lifestyle, culture and media
   - Avoid topics the learner dislikes or emotionally heavy stories unless the learner has shown clear interest
   - If no good fresh topic is available, fall back to an evergreen explainer article aligned to the learner's interests and level

3. **Adapt the topic to learner level**

   | Band range | Article length | Sentence style | Vocabulary load | Audio speed | Support |
   | ---------- | -------------- | -------------- | --------------- | ----------- | ------- |
   | `< 5.0`    | 180-260 words  | short, direct  | 3 core words    | `-15%`      | high    |
   | `5.0-6.0`  | 260-380 words  | mixed length   | 4-5 target words| `-5%`       | medium  |
   | `6.5+`     | 380-550 words  | natural, varied| 5-7 target words| `0%`        | low     |

   Adjust further using weak dimensions:
   - **Listening weak**: cleaner structure, fewer names/numbers, slower audio, key points preview
   - **Reading weak**: shorter paragraphs, explicit transitions, one-line summary per section
   - **Speaking weak**: add 2 discussion prompts after the article
   - **Writing weak**: add 2 reusable phrases and 1 short opinion prompt

4. **Build the daily package**
   - Create a concise English headline
   - Add a 1-2 sentence Chinese/English bridge explaining why today's topic matches the learner
   - Write the adapted article in English
   - Extract a `Today's Focus` box:
     - 3-7 key words/phrases
     - 1 sentence pattern or reusable chunk
     - 1 follow-up task chosen from speaking, writing, or reading/listening
   - **Today's Tasks Section** — if daily_tasks exist:

   ```
   📋 今日训练 (负荷预算: {{budget}})
   🔴 主项: {{primary_desc}} [开始={{primary_cb}}]
   🟡 复习: {{review_desc}} [开始={{review_cb}}]
   🟢 巩固: {{consolidation_desc}} [开始={{consolidation_cb}}]
   ```

   - Keep the package useful on its own even if the learner does not reply

5. **Generate media**
   - Use `image_gen` for one cover image that matches the headline and tone
   - Use `tts` to generate narration for the adapted article
   - Choose the TTS rate from the level table above
   - If media generation fails, still deliver the text package instead of aborting

6. **Send to Telegram**
   - Send the cover image with the short teaser and tag it as the day's main entry
   - Send the full article text
   - Send the audio
   - Send one lightweight action block:

   ```
   tg(type:"keyboard", text:"今天想怎么学这篇？", buttons:"[[\"🎧 再听一遍|briefing_audio\"],[\"🗣️ 聊聊这个话题|speaking\"],[\"✍️ 写一句观点|writing\"],[\"📚 加入单词本|word_save\"],[\"🎯 开始今日训练|practice\"]]")
   ```

   - `tg(type:"pin")` the main entry so the learner can revisit today's push quickly

7. **Record follow-up only when learner interacts**
   - If the learner replies, record the response via `db` tool (see `database` skill for queries) with `skill_type='daily_briefing'`
   - Offer word saving for target vocabulary
   - Do not force a quiz or forced reply in the default daily push

## Evening Check-in (Optional — 21:00)

If cron triggers an evening check-in:

1. Query today's completion:

```
db name=learner sql="SELECT COALESCE(SUM(load_score), 0) as consumed FROM samples WHERE created_at >= date('now') AND load_score > 0"
db name=learner sql="SELECT task_type, completed FROM daily_tasks WHERE date = date('now')"
```

2. Send a brief summary:

```
📊 今日小结

完成 {{completed}}/3 项任务
负荷: {{consumed}}/{{budget}}

{{encouragement_or_suggestion}}

明日预览: {{tomorrow_primary_hint}}
```

## Delivery Rules

1. **Do not read any weekly schedule.** This skill is driven by learner profile + Active Driver + current content, not a timetable.
2. **Cron owns the schedule.** The skill does not decide when to run.
3. **One core topic per day.** Do not mix multiple unrelated stories.
4. **Pin the entry message every time.** Today's briefing should be easy to find later.
5. **Text first, media second.** If image or audio fails, the briefing still goes out.
6. **Make it readable at first pass.** The learner should understand the main idea without opening a dictionary every line.
7. **Use real, current material when possible.** When adapting from a source, preserve the factual core while simplifying the language.
8. **Personalization beats novelty.** A slightly less trendy topic that matches the learner AND the Active Driver is better than a random headline.
9. **If absent for 3+ days**, use a lighter re-entry tone and a simpler topic.
10. **Avoid consecutive topic repetition.** Do not send two very similar briefings in a row.
11. **Driver alignment is mandatory.** The topic must support the current training focus.
12. **Include today's tasks** whenever daily_tasks exist — the briefing is the learner's morning dashboard.

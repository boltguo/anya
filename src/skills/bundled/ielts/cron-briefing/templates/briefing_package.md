# Daily Briefing Package

Use this file as the output contract for `daily_briefing/SKILL.md`.

The default delivery is a 3-part Telegram package:

1. Pinned entry message
2. Full article
3. Audio

## 1. Pinned Entry Message

Use `tg(type:"photo")` when an image is available. Otherwise use `tg(type:"text")`.

```md
🌤 <b>Today's Briefing</b>

<b>{{headline}}</b>

{{why_this_topic_fits_the_learner}}

<b>Today's focus</b>: {{focus_line}}
```

Keep this block short. It is the pinned entry, not the full lesson.

## 2. Full Article

```md
<b>{{headline}}</b>

{{adapted_article}}

<b>Key Words</b>
1. {{word_1}}: {{simple_gloss}}
2. {{word_2}}: {{simple_gloss}}
3. {{word_3}}: {{simple_gloss}}

<b>Useful Chunk</b>
{{reusable_phrase_or_sentence_pattern}}
```

Article guidance by level:

- `< 5.0`: 2 short paragraphs, clear topic sentence, Chinese bridge line allowed
- `5.0-6.0`: 2-3 paragraphs, simple paraphrase, moderate lexical lift
- `6.5+`: 3-4 paragraphs, richer transitions, more natural collocation

## 3. Audio Caption

```md
🔊 Audio version of today's briefing

Try this:
- First listen for the main idea
- Then listen again and notice {{focus_line}}
```

## 4. Follow-up Block

Choose one follow-up based on the learner's weakest current area.

### Speaking weak

```md
<b>Talk about it</b>
1. Do you agree with the idea in today's article?
2. How does this topic affect your daily life?
```

### Writing weak

```md
<b>Write one sentence</b>
Use this starter:
In my view, {{topic}} is important because ...
```

### Listening or Reading weak

```md
<b>Quick check</b>
What is the main idea of paragraph 2?
```

## 5. Image Prompt Guidance

Image prompt should be:

- concrete
- relevant to the article topic
- clean and editorial
- not cartoonish unless the learner profile strongly prefers playful visuals

Suggested prompt structure:

```text
Editorial illustration for an English learning daily briefing about {{topic}}. Clean composition, modern magazine style, optimistic and thoughtful mood, suitable as a Telegram cover image, {{aspect_ratio}}.
```

## 6. Audio Guidance

Default narration rules:

- use one clear English voice
- slow down for lower-level learners
- do not narrate the glossary unless it helps a low-band learner
- narration should match the adapted article, not the original source article

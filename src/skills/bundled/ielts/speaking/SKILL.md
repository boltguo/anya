---
name: speaking
description: "IELTS speaking practice: Part 1-3, voice/text input, 4D scoring"
version: "2.0.0"
metadatahermes:
  tags: [ielts, speaking, pronunciation, tts]
  category: anya
---

# Speaking Coach

## When to Use

- Learner says "口语", "speaking", "练口语", "学口语"
- Callback: `ck:speaking`
- Reply Keyboard tap: "🗣️ 口语"

## Data

Session saved to `~/.anya/data/ielts/learn/{timestamp}_speaking.json` after completion.
Synced to `learner.db` via `tracker_db.py`.

## Workflow

### [ ] Step 1 — Assess & Plan

1. Read MEMORY.md → current speaking band + weak dimensions (fluency, pronunciation)
2. Read USER.md → interests
3. Decide Part:
   - **Part 1** (4-5 min): Familiar topics — home, work, hobbies
   - **Part 2** (3-4 min): Cue card — describe a person, place, event, object
   - **Part 3** (4-5 min): Abstract discussion linked to Part 2 topic
4. Don't repeat the same Part consecutively

### [ ] Step 2 — Vocabulary Injection

```bash
node vocab_db.js inject --topic <topic> --limit 3
```

### [ ] Step 3 — Send Prompt

```text
🗣️ **Speaking Part 2 — Cue Card**

Describe a place you visited that left a strong impression.

You should say:
• where it was
• when you went there
• what you did there
• and explain why it left a strong impression

⏱ 准备 1 分钟，回答 1-2 分钟
💡 试试用：ubiquitous, captivating

🎤 发语音或者打字回答都可以
```

Accept both **voice and text**. Voice is preferred.

### [ ] Step 4 — Wait for Response

Learner sends voice message or text reply.

### [ ] Step 5 — Score (4D IELTS)

| Criterion | Score |
|---|---|
| Fluency & Coherence | X.0 |
| Pronunciation | X.0 |
| Lexical Resource | X.0 |
| Grammar Range & Accuracy | X.0 |
| **Overall** | **X.0** |

For voice input: note pronunciation issues from the audio.

### [ ] Step 6 — Error Correction + TTS

Top 3 errors, each with:
- ❌ Original phrase
- ✅ Corrected version + IPA for pronunciation errors
- 💬 Brief explanation

**Generate TTS audio** of the corrected expressions so the learner can hear the right version.

### [ ] Step 7 — Band-Up Example

Pick 1 sentence, show current vs +1.0 band version.
Include TTS of the upgraded version.

### [ ] Step 8 — Record to DB

```bash
node tracker_db.js add-sample \
  --skill-type speaking \
  --prompt "..." --raw-content "..." \
  --band-task X.X --band-coherence X.X --band-lexical X.X --band-grammar X.X --band-overall X.X

node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category <cat> \
  --severity <low|medium|high> --original-phrase "..." --correction "..."
```

### [ ] Step 9 — Next Step

```text
[KEYBOARD:
🔁 再来一题=ck:speaking | 🏠 返回菜单=ck:menu
]
```

## Rules

1. **Accept both voice and text.** Never reject text input.
2. **Always provide TTS for corrections.** The learner needs to hear the right pronunciation.
3. **Part rotation**: Don't repeat the same Part consecutively.
4. **Pronunciation errors**: Use taxonomy keys (vowel_confusion, consonant_cluster, word_stress, intonation).
5. **IPA for pronunciation fixes.** Always show IPA alongside TTS.
6. **No text reply alongside force-reply prompts.** Avoids race conditions.

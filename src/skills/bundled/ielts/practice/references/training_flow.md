# Shared Training Flow Reference

All four training skills (writing, speaking, reading, listening) share this common structure.
Each skill's SKILL.md contains the complete step-by-step checklist; this file documents shared conventions.

## Session Data

All session data saved to `~/.anya/data/ielts/learn/{timestamp}_{type}.json`.
Synced to `learner.db` via `tracker_db.py` after completion.

## Shared Step Template

| Step | Action |
|---|---|
| 1 | Assess level → read MEMORY.md + USER.md |
| 2 | Vocab injection → `vocab_db.py inject` |
| 3 | Generate & send prompt |
| 4 | Wait for learner response |
| 5 | Score (4D for writing/speaking, accuracy for reading/listening) |
| 6 | Error correction (Top 3 fixes) |
| 7 | Band-Up example (writing/speaking) or transcript (reading/listening) |
| 8 | Record to DB → `tracker_db.py add-sample` + `add-error` |
| 9 | Next step → `[KEYBOARD:]` with `ck:` callbacks |

## Scoring Dimensions

| Writing | Speaking |
|---|---|
| Task Response | Fluency & Coherence |
| Coherence & Cohesion | Pronunciation |
| Lexical Resource | Lexical Resource |
| Grammar Range & Accuracy | Grammar Range & Accuracy |

Reading and Listening use accuracy-based scoring (% correct → estimated band).

## Callback Routing

All next-step buttons use `ck:` prefix:

| Callback | Action |
|---|---|
| `ck:writing` | Start new writing exercise |
| `ck:speaking` | Start new speaking exercise |
| `ck:reading` | Start new reading exercise |
| `ck:listening` | Start new listening exercise |
| `ck:reading:harder` / `ck:reading:easier` | Adjust difficulty |
| `ck:listening:harder` / `ck:listening:easier` | Adjust difficulty |
| `ck:listening:replay` | Replay audio |
| `ck:menu` | Return to practice menu |

## Error Recording

All errors use taxonomy keys from `assessment/references/error_taxonomy.md`:

```bash
node tracker_db.js add-error \
  --sample-id <id> --recurrence-key <key> --category <cat> \
  --severity <low|medium|high> --original-phrase "..." --correction "..."
```

## Vocabulary Usage Tracking

When injected words are used (or encountered) in a session:

```bash
node vocab_db.js use <word> --event <exposure|production> --session-type <skill> --context "..."
```

# Cross-Skill Transfer

Other practice skills should only inject already learned words:

```
db name=vocab sql="SELECT word, definition FROM words WHERE topics LIKE ? AND mastery IN ('learning','known') AND transfer_level >= 2 ORDER BY is_user_word DESC, priority DESC, srs_due ASC LIMIT 2" params='["%<topic>%"]'
```

When used successfully:

```sql
-- speaking success
UPDATE words
SET transfer_level = CASE WHEN transfer_level < 3 THEN 3 ELSE transfer_level END,
    mastery = 'known',
    success_count = success_count + 1,
    last_result = 'speaking_transfer',
    last_seen_at = datetime('now'),
    updated_at = datetime('now')
WHERE word = ?;

-- writing success
UPDATE words
SET transfer_level = CASE WHEN transfer_level < 4 THEN 4 ELSE transfer_level END,
    mastery = 'mastered',
    success_count = success_count + 1,
    last_result = 'writing_transfer',
    last_seen_at = datetime('now'),
    updated_at = datetime('now')
WHERE word = ?;
```

## Transfer Levels (recap)

| Level | Meaning                                              |
| ----- | ---------------------------------------------------- |
| 0     | Only seeded, not introduced                          |
| 1     | Seen with meaning/example                            |
| 2     | Passed first active check, safe for collocation     |
| 3     | Used successfully in speaking                        |
| 4     | Used successfully in writing                         |

# Material Bank — Personal Experience Library

## Purpose

A persistent collection of the learner's real-life experiences, people, places, and objects that can be reused across multiple speaking prompts. This eliminates the cold-start problem in Part 2 and enables richer, more natural responses.

## Storage

Material bank entries are stored as `learner.db` samples with `skill_type='material_bank'`.

```
db name=learner sql="INSERT INTO samples (created_at, skill_type, prompt, raw_content, session_id) VALUES (datetime('now'), 'material_bank', ?, ?, ?)" params='["<category>", "<content_json>", "<session_id>"]'
```

The `prompt` field stores the category. The `raw_content` field stores a JSON with the material details.

## Categories

| Category | What to Store | Example |
|---|---|---|
| `place` | Name, location, what makes it special, personal connection | "Beihai Park: visited every Sunday as a child, peaceful lake…" |
| `person` | Name/role, relationship, key traits, memorable moments | "Grandma: taught me cooking, patient, funny stories about…" |
| `event` | When, where, who, what happened, how it felt | "First day at university: nervous, met my roommate…" |
| `object` | What it is, why it matters, story behind it | "My grandfather's watch: gift for 18th birthday…" |
| `hobby` | What, when started, why enjoy, achievements | "Photography: started in high school, love capturing…" |
| `opinion` | Topic, stance, main reasons, personal example | "Technology in education: generally positive, but…" |

## Content JSON Format

```json
{
  "category": "person",
  "label": "Grandma",
  "keywords": ["patient", "cooking", "storytelling"],
  "bullet_points": [
    "Taught me to cook traditional dishes",
    "Always had funny stories about her childhood",
    "Most patient person I know"
  ],
  "useful_for_topics": ["family", "respect", "tradition", "patience", "cooking"],
  "language_level": "B2"
}
```

## When to Collect

1. **After a good Part 2 response**: "Great story! Want me to save this for future use?"
2. **During init Phase 2**: Extract from learner's hobbies/interests
3. **From daily briefing interactions**: If the learner shares personal reactions

## When to Reference

1. **Part 2 prompts**: Check if any material matches the cue card topic
2. **Part 3 discussion**: Use stored opinions as a starting point for deeper analysis
3. **Cross-session**: "Last time you talked about your grandma — can you use that experience here too?"

## Query Examples

```
# Get all materials
db name=learner sql="SELECT prompt as category, raw_content FROM samples WHERE skill_type='material_bank' ORDER BY created_at DESC"

# Get materials for a specific category
db name=learner sql="SELECT raw_content FROM samples WHERE skill_type='material_bank' AND prompt = ? ORDER BY created_at DESC" params='["person"]'

# Search by keyword in content
db name=learner sql="SELECT prompt as category, raw_content FROM samples WHERE skill_type='material_bank' AND raw_content LIKE ? ORDER BY created_at DESC" params='["%cooking%"]'
```

## Rules

1. **Always ask before saving.** The learner controls their material bank.
2. **Keep entries concise.** Bullet points, not paragraphs.
3. **Tag with useful_for_topics.** This enables cross-topic matching.
4. **Never fabricate.** Only store what the learner actually shared.
5. **Maximum 30 entries.** Archive oldest if exceeded.

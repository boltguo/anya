# Routing Table (English Planner)

This table maps the user's natural language intents to specific training modules (Skills).

| Example User Intent | Target Skill | Notes |
| --- | --- | --- |
| "Test my level", "Assess me" | `placement-quick` | Basic baseline assessment for profile creation. |
| "Daily article", "今日阅读", "Read today's article" | `daily-article` | Daily authentic reading package with vocabulary harvest. |
| "Let's chat", "Freetalk", "Debate" | `speaking-freetalk` (open mode) | Free expression and impromptu debate. |
| "Roleplay", "情景对话", "Order food at a restaurant", "假设我在机场" | `speaking-freetalk` (scenario mode) | Scenario dialogue — Anya plays one side, speaks first in role; user replies. |
| "Quick discuss this article", "聊聊这篇文章" | `speaking-freetalk` (scenario mode, source-anchored) | Discussion anchored to a source passage; pass the passage as the scenario brief. |
| "Correct my pronunciation", "Shadowing" | `speaking-shadowing` | Pronunciation grading and shadowing practice. |
| "Listen and retell", "Retell what I heard" | `speaking-repeat` | Listen-then-retell input-to-output training. |
| "Dictation", "Listen closely to a paragraph" | `listening-dictation` | Core listening capability enhancement. |
| "Rhythm shadowing", "Chunk listening", "Follow the rhythm" | `listening-shadowing` | Listening rhythm and chunking, not pronunciation scoring. |
| "Numbers are too fast", "Dictate phone numbers" | `listening-numberdrill` | Practical daily life listening skills. |
| "Listen to a podcast", "Extensive listening" | `listening-podcast` | Grasping the main idea from audio context. |
| "Read an article carefully", "Deep reading", "精读" | `reading-deepdive` | Immersive reading and deep syntax analysis. |
| "Quickly grasp the main idea", "Skimming" | `reading-skim-drill` | Skimming and scanning practice. |
| "Write an essay", "Write a letter" | `writing-essay` | Comprehensive long-form writing. |
| "Make this sound native", "Rewrite my paragraph" | `writing-rewrite` | Practical rewriting and polishing. |
| "Practice complex sentences", "Grammar drill", "Build sentences" | `writing-builder` | Micro-level syntax and grammar gym. |
| "Review vocabulary", "Memorize words", "到期复习" | `vocab-review` | Core Spaced Repetition System (SRS) review. |
| "Learn words by topic", "Topic vocabulary" | `vocab-topic` | Topic-cluster vocabulary learning. |
| "Save this word", "What does this phrase mean?" | `vocab-review` | No standalone harvest skill — `vocab-review` ingests the word via `word_upsert` and surfaces it on the next due cycle. |
| "Show my progress", "Ability report" | `learner-state` | Data-driven current ability summary. |
| "Explain my mistake", "Why did I get this wrong?" | `error-clinic` | Unified error explanation across all skills. |

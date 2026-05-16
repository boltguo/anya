# Routing Table (English Planner)

This table maps the user's natural language intents to specific training modules (Skills).

| Example User Intent | Target Skill | Notes |
| --- | --- | --- |
| "Test my level", "Assess me" | `placement-quick` | Basic baseline assessment for profile creation. |
| "Daily article", "今日阅读", "Read today's article" | `daily-article` | Daily authentic reading package with vocabulary harvest. |
| "Let's chat", "Freetalk", "Debate" | `speaking-freetalk` | **Free expression and impromptu debate.** |
| "Correct my pronunciation", "Shadowing" | `speaking-shadowing` | Pronunciation grading and shadowing practice. |
| "Listen and retell", "Retell what I heard" | `speaking-repeat` | Listen-then-retell input-to-output training. |
| "Roleplay", "Order food at a restaurant" | `speaking-roleplay` | Practical situational dialogues. |
| "Dictation", "Listen closely to a paragraph" | `listening-dictation` | Core listening capability enhancement. |
| "Rhythm shadowing", "Chunk listening", "Follow the rhythm" | `listening-shadowing` | Listening rhythm and chunking, not pronunciation scoring. |
| "Numbers are too fast", "Dictate phone numbers" | `listening-numberdrill` | Practical daily life listening skills. |
| "Listen to a podcast", "Extensive listening" | `listening-podcast` | **Grasping the main idea from audio context.** |
| "Read an article carefully", "Deep reading" | `reading-deepdive` | **Immersive reading and deep syntax analysis.** |
| "Quickly grasp the main idea", "Skimming" | `reading-skim-drill` | Skimming and scanning practice. |
| "Let us discuss the news", "Read an interesting article" | `material-discussion` | Authentic material reading and casual discussion. |
| "Practice True/False/Not Given", "Question type drill" | `reading-typetrain` | Hidden from menu, but available for explicit question-type practice. |
| "Write an essay", "Write a letter" | `writing-essay` | Comprehensive long-form writing. |
| "I want to write my diary", "Journaling" | `writing-journal` | Low-pressure daily writing with stealth polishing. |
| "Make this sound native", "Rewrite my paragraph" | `writing-rewrite` | Practical rewriting and polishing. |
| "Practice complex sentences", "Grammar drill", "Build sentences" | `writing-builder` | **Micro-level syntax and grammar gym.** |
| "Review vocabulary", "Memorize words" | `vocab-review` | Core Spaced Repetition System (SRS) review. |
| "Learn words by topic", "Topic vocabulary" | `vocab-topic` | Topic-cluster vocabulary learning. |
| "Quiz me on yesterday's words" | `vocab-testme` | Active recall testing. |
| "Save this word", "What does this phrase mean?" | `vocab-harvest` | Save or harvest useful words/chunks into SRS. |
| "Show my progress", "Ability report" | `learner-state` | Data-driven current ability summary. |
| "Explain my mistake", "Why did I get this wrong?" | `error-clinic` | Unified error explanation across all skills. |
| "How am I doing?", "What's my weakness?" | `coach` | Unified progress review and study recommendation. |

## Hidden Directives (Accessible via explicit request)
- "Practice True/False/Not Given questions" -> `reading-typetrain` (hidden from menu, but triggerable).

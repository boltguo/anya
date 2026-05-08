# Routing Table (English Coach)

This table maps the user's natural language intents to specific training modules (Skills).

| Example User Intent | Target Skill | Notes |
| --- | --- | --- |
| "Test my level", "Assess me" | `placement-quick` | Basic baseline assessment for profile creation. |
| "Let's chat", "Freetalk", "Debate" | `speaking-freetalk` | **Free expression and impromptu debate.** |
| "Correct my pronunciation", "Shadowing" | `speaking-shadowing` | Pronunciation grading and shadowing practice. |
| "Roleplay", "Order food at a restaurant" | `speaking-roleplay` | Practical situational dialogues. |
| "Dictation", "Listen closely to a paragraph" | `listening-dictation` | Core listening capability enhancement. |
| "Numbers are too fast", "Dictate phone numbers" | `listening-numberdrill` | Practical daily life listening skills. |
| "Listen to a podcast", "Extensive listening" | `listening-podcast` | **Grasping the main idea from audio context.** |
| "Read an article carefully", "Deep reading" | `reading-deepdive` | **Immersive reading and deep syntax analysis.** |
| "Quickly grasp the main idea", "Skimming" | `reading-skim-drill` | Skimming and scanning practice. |
| "Let us discuss the news", "Read an interesting article" | `material-discussion` | Authentic material reading and casual discussion. |
| "Write an essay", "Write a letter" | `writing-essay` | Comprehensive long-form writing. |
| "I want to write my diary", "Journaling" | `writing-journal` | Low-pressure daily writing with stealth polishing. |
| "Make this sound native", "Rewrite my paragraph" | `writing-rewrite` | Practical rewriting and polishing. |
| "Practice complex sentences", "Grammar drill", "Build sentences" | `writing-builder` | **Micro-level syntax and grammar gym.** |
| "Review vocabulary", "Memorize words" | `vocab-review` | Core Spaced Repetition System (SRS) review. |
| "Quiz me on yesterday's words" | `vocab-testme` | Active recall testing. |
| "Explain my mistake", "Why did I get this wrong?" | `error-clinic` | Unified error explanation across all skills. |
| "How am I doing?", "What's my weakness?" | `coach` | Unified progress review and study recommendation. |

## Hidden Directives (Accessible via explicit request)
- "I want to do map listening questions" -> `listening-mapdrill` (Hidden from menu, but triggerable).
- "Practice True/False/Not Given questions" -> `reading-typetrain` (Hidden from menu, but triggerable).

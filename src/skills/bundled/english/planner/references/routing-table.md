# Routing Table (English Planner)

This table maps the user's natural language intents to specific training modules (Skills).

| Example User Intent | Target Skill | Notes |
| --- | --- | --- |
| "Test my level", "Assess me" | `placement-quick` | Basic baseline assessment for profile creation. |
| "Let's chat", "Freetalk", "Debate" | `speaking-freetalk` | **Free expression and impromptu debate.** |
| "Correct my pronunciation", "练发音", "不会读" | `speaking-shadowing` | Phoneme-level pronunciation clinic with Azure scoring. |
| "Listen and retell", "Retell what I heard" | `speaking-repeat` | Listen-then-retell input-to-output training. |
| "Roleplay", "Order food at a restaurant" | `speaking-roleplay` | Practical situational dialogues. |
| "Dictation", "Listen closely to a paragraph" | `listening-dictation` | Sentence-level intensive listening, transcription. |
| "跟读", "意群跟读", "Chunk listening" | `listening-chunkdrill` | Chunk-level listen-and-repeat for rhythm and decoding speed. |
| "Numbers are too fast", "Dictate phone numbers" | `listening-numberdrill` | Practical daily life listening skills. |
| "Listen to a podcast", "Extensive listening" | `listening-podcast` | **Grasping the main idea from audio context.** |
| "今日阅读", "读篇文章", "Article", "聊聊新闻" | `reading-article` | Fresh web-search content → generated article → Q&A + vocab harvest. |
| "Quickly grasp the main idea", "Skimming" | `reading-skim-drill` | Skimming and scanning practice. |
| "Write an essay", "Write a letter" | `writing-essay` | Comprehensive long-form writing. |
| "I want to write my diary", "Journaling" | `writing-journal` | Low-pressure daily writing with stealth polishing. |
| "Make this sound native", "Rewrite my paragraph" | `writing-rewrite` | Practical rewriting and polishing. |
| "Practice complex sentences", "Grammar drill", "Build sentences" | `writing-builder` | **Micro-level syntax and grammar gym.** |
| "Review vocabulary", "Memorize words", "考考我" | `vocab-review` | Core Spaced Repetition System (SRS) review with mixed cards. |
| "Learn words by topic", "Topic vocabulary" | `vocab-topic` | Topic-cluster vocabulary learning. |
| "Save this word", "What does this phrase mean?" | `vocab-harvest` | Save or harvest useful words/chunks into SRS. |
| "Show my progress", "Ability report" | `learner-state` | Data-driven current ability summary. |
| "Explain my mistake", "Why did I get this wrong?" | `error-clinic` | Unified error explanation across all skills. |

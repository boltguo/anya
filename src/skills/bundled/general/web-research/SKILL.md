---
name: web-research
description: Research a topic using web search and synthesize findings into a concise report
version: 1.0.0
tags: [research, web, search]
category: general
---

# When to Use

When the user asks to research a topic, find information about something, or wants a summary of current knowledge on a subject.

# Procedure

1. Break the user's question into 2-3 focused search queries
2. Use `web_search` for each query
3. Cross-reference results from multiple sources
4. Synthesize findings into a structured summary with:
   - Key facts
   - Different perspectives (if applicable)
   - Source attribution
5. If the user needs this for a project, use `memory_update` to save key findings

# Pitfalls

- Do not present a single search result as comprehensive truth
- Always check publication dates -- prefer recent sources for technology topics
- If search results conflict, present both sides rather than picking one

# Verification

Ask the user if the summary covers what they need, and offer to dive deeper into any specific aspect.

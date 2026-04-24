---
name: analysis-weakness
description: "Cross-session weakness detection — top recurring errors + weakest subcaps; owns the error + subcap taxonomies."
---

# Analysis — Weakness

Read-only. Aggregates `errors` + `subcap_scores` (default 14d) → top patterns + weak subcaps + root-cause mix. Owns the canonical taxonomies used by every other skill.

## When to Use

- `哪里最弱 / 瓶颈 / 高频错误 / weakness / 我总错的点`
- Callback `analysis-weakness`
- `coach-proactive` on `error_cluster`

## Canonical Assets (used package-wide)

- `assets/error-taxonomy.md` — every `errors.recurrence_key` must come from here
- `assets/subcap-catalog.md` — every `subcap_scores.subcap_key` must come from here
- `assets/weakness-detection-rules.md` — frequency tiers, persistence classification, bottleneck picker

## Workflow

1. Scope: default 14d, accept 7/14/30.
2. Pull top errors + weakest subcaps + prior-window comparison.
3. Classify each key with `root_cause` (language/cognitive/strategy) per taxonomy.
4. Apply detection rules — flag chronic / rising / fading.
5. Render report: Top 5 subcaps + Top 5 errors + root-cause distribution + persistence tags + Top 2 bottlenecks.
6. Hand off: `[🎯 针对瓶颈练|{{primary_callback}}]  [📋 下一步建议|analysis-recommend]  [🏠 nav:main]`.

Queries: `support/ielts-data-contract/references/queries.md`.

## Rules

1. **Read-only.**
2. **n ≥ 3 to trust a subcap.**
3. **Cite evidence** for every bottleneck claim.
4. **Own the taxonomy.** New `recurrence_key`? Add to `assets/error-taxonomy.md` first.
5. **Chronic ≠ rising** — show both.
6. **Hand off** to `analysis-recommend` for actions.

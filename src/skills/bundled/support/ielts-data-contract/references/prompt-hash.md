# `samples.prompt_hash` — canonical rule

Groups all rewrites of the same prompt so trend analysis works. Every writer of a `samples` row must compute it the same way.

## Algorithm

1. Take the **original prompt text only** — no answer, instructions, or templating.
2. Lowercase.
3. Strip all punctuation (regex `[^\p{L}\p{N}\s]`) and collapse whitespace to single spaces; trim.
4. Compute `sha1`.
5. Take the first **12 hex chars** → that's the hash.

## Reference (TypeScript)

```ts
import { createHash } from "crypto";

export function promptHash(prompt: string): string {
  const norm = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha1").update(norm).digest("hex").slice(0, 12);
}
```

## Rules

- Same prompt → same hash (invariant to punctuation / whitespace / case).
- A rewrite (`parent_sample_id IS NOT NULL`) **reuses** the original's `prompt_hash` — never recompute.
- Hash is for grouping, not identity. Collisions are tolerable.
- Prompt edited between attempts → start a new chain (new hash, no parent).

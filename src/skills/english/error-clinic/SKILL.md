---
name: error-clinic
description: "Focused error diagnosis: analyzes ALL recent mistakes in one LLM call, then presents them as paginated cards the user flips through without further LLM calls. Triggers for '错题', '为什么错了', '错在哪', 'explain my mistakes'."
---

# Error Clinic (Precision Mistake Diagnosis)

Batch error analysis with client-side pagination. Pulls ALL recent error patterns from `coach_context`, explains each with a before/after example and the underlying rule, then sends them as a **paginated message** — the user flips ⬅️/➡️ to browse error cards without any additional LLM calls.

## 1. When to Use

- User says: `错题`, `为什么错了`, `错在哪`, `explain my mistakes`, `最近哪里错了`
- Callback `error-clinic`
- Menu button `🔍 错题与答疑`

## 2. Workflow

### State A: Data Retrieval

1. Call `persist {"action":"coach_context","days":14,"limit":8}` to get `summary.errors`, `summary.subcaps`, and recent samples.
2. From `summary.errors`, collect **all error patterns** that:
   - Appeared in ≥ 2 samples (recurring, not one-off)
   - Have concrete `original` / `correction` pairs in the data
3. Sort by frequency (highest first). If no recurring errors exist, send a single `tg_msg type="render"` (text + buttons, no `url`): `text="🎉 最近没有反复出现的错误！继续练习攒数据吧。"` + `buttons=[["🧭 回主菜单|nav:main"]]` and stop.

### State B: Build Pages & Send

For each error, build one page using this template:

```
🔍 错题分析 ({n}/{total})

❌ {original_wrong} → ✅ {correction}
💡 {rule_name}: {1-line rule explanation in Chinese}

📝 类似的正确用法：
- {example_1}
- {example_2}

🎯 针对练习：{recommended_skill_name}
```

Where `recommended_skill_name` maps to:
- Grammar/verb errors → 句型构建 (writing-builder)
- Pronunciation errors → 发音跟读 (speaking-shadowing)
- Listening errors → 精听听写 (listening-dictation)
- Collocation errors → 话题词汇 (vocab-topic)

Concatenate all pages with `---PAGE---` delimiter and send via **ONE** `tg_msg type="paginate"`:

```json
{
  "type": "paginate",
  "text": "<page1 HTML>---PAGE---<page2 HTML>---PAGE---<page3 HTML>",
  "buttons": "[[\"✏️ 练一下这个规则|<drill_callback>\", \"🧭 回主菜单|nav:main\"]]"
}
```

The `drill_callback` in trailing buttons should route to the **first page's** recommended skill (since that's the highest-priority error). The adapter handles ⬅️/➡️ flipping automatically — each page flip is a message edit, zero LLM cost.

### Output Rules

- Each page ≤ 12 lines.
- Max 8 pages (cap at 8 most frequent errors). If fewer errors exist, fewer pages.
- If only 1 error exists, it still uses `paginate` (single page, no nav arrows shown).

## 3. Hard Rules

1. **One LLM call, all pages.** Generate ALL error card pages in a single response. The `paginate` type handles the rest client-side.
2. **Concrete examples mandatory.** Every error MUST show the user's actual wrong text and the correction. Never say "你的动词搭配有问题" without showing the specific instance.
3. **1-line rules.** Explain the grammar/pronunciation rule in ONE line of Chinese. No paragraphs, no sub-bullets.
4. **No raw keys.** Never show `verb_pattern`, `l1_transfer`, etc. Translate to Chinese:
   - `pronunciation_vowel` → 元音发音不稳
   - `pronunciation_consonant` → 辅音/词尾收音不清
   - `verb_pattern` / `verb_form_error` → 动词搭配/时态错误
   - `l1_transfer` → 中式英语/母语迁移
   - `function_word_miss` → 功能词（介词/冠词）漏听/漏写
   - `collocation_error` → 搭配不自然
   - Other keys → translate to short Chinese description
5. **Empathetic tone.** Treat errors as normal learning signals. Brief encouragement on page 1 (1 line max).
6. Use `persist` for reads; no raw DB. This skill is **read-only** — do not write any data.
7. **`---PAGE---` delimiter.** Pages MUST be separated by exactly `---PAGE---` (3 dashes, PAGE, 3 dashes). No other delimiter.
8. **`paginate` for the multi-page report; `render` for the empty-state fallback.**

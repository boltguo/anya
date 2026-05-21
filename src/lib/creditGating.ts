// lib/creditGating.ts — shared §2.3 credit gating algorithm.
//
// All listening-* and writing-* skills follow the same promotion / demotion
// streak math. The constants vary per skill (PASS, FAIL, STREAK) and the tier
// table varies (length bounds + dimension names), but the *walk* is identical:
//
//   walk recent_practice newest→oldest, skip redos (parent_sample_id != null):
//     promotion_credit = consecutive accuracy ≥ PASS
//     demotion_credit  = consecutive fail (< FAIL or completed=0)
//
// Library function, not a registered tool. Compound tools that need the
// computation import this directly; they then translate the structured
// decision into a tier + length for sentence generation.

export interface CreditGatingThresholds {
  PASS: number;        // accuracy ≥ PASS is a pass (e.g. 0.85 for shadowing)
  FAIL: number;        // accuracy < FAIL is a fail (e.g. 0.55 for shadowing)
  STREAK: number;      // passes/fails required to move (e.g. 2)
  length_step: number; // length delta inside a tier (e.g. 2)
}

export interface TierBounds {
  min: number;
  max: number;
}

export interface TierTable {
  beginner: TierBounds;
  intermediate: TierBounds;
  advanced: TierBounds;
}

export type TierName = 'beginner' | 'intermediate' | 'advanced';

export interface CreditGatingRow {
  accuracy: number | null;
  completed: number;                  // 1 finished, 0 abandoned
  parent_sample_id?: number | null;   // present = redo, skip from credit walk
}

export interface CreditGatingInput {
  rows: CreditGatingRow[];            // newest first
  thresholds: CreditGatingThresholds;
  tier_table: TierTable;
  current_tier: TierName;
  current_length: number;
}

export type CreditAction =
  | 'promote_tier'
  | 'demote_tier'
  | 'length_up'
  | 'length_down'
  | 'hold';

export interface CreditGatingOutput {
  promotion_credit: number;
  demotion_credit: number;
  action: CreditAction;
  next_tier: TierName;
  next_length: number;
}

const TIER_ORDER: TierName[] = ['beginner', 'intermediate', 'advanced'];

export function applyCreditGating(input: CreditGatingInput): CreditGatingOutput {
  const { rows, thresholds, tier_table, current_tier, current_length } = input;
  const { PASS, FAIL, STREAK, length_step } = thresholds;

  // Walk newest→oldest, skipping redo rows (intentional duplicate prompt_hash).
  let promotion_credit = 0;
  let demotion_credit = 0;
  let walkingPromo = true;
  let walkingDemo = true;

  for (const row of rows) {
    if (row.parent_sample_id != null) continue;

    const isAbandoned = row.completed === 0;
    const acc = row.accuracy ?? 0;
    const isFail = isAbandoned || acc < FAIL;
    const isPass = !isAbandoned && acc >= PASS;
    // hold = [FAIL, PASS) — pass through both walks unchanged

    if (walkingPromo) {
      if (isPass) promotion_credit++;
      else if (isFail) walkingPromo = false;
      // hold: keep walking, don't increment
    }
    if (walkingDemo) {
      if (isFail) demotion_credit++;
      else if (isPass) walkingDemo = false;
    }

    if (!walkingPromo && !walkingDemo) break;
  }

  const tierIdx = TIER_ORDER.indexOf(current_tier);
  const tierBounds = tier_table[current_tier];

  // Decision tree (mutually exclusive; promote first wins if both fire — but
  // by construction only one streak can be ≥ STREAK because they're mirror walks).
  let action: CreditAction = 'hold';
  let next_tier: TierName = current_tier;
  let next_length = current_length;

  // Smooth tier transitions: when crossing a tier boundary, advance by length_step
  // (not jumping to the new tier's min/max). This keeps the +1 word i+1 invariant
  // even across tier labels — the tier becomes a description of the language register,
  // not a discrete length jump.
  if (promotion_credit >= STREAK) {
    if (current_length >= tierBounds.max && tierIdx < TIER_ORDER.length - 1) {
      action = 'promote_tier';
      next_tier = TIER_ORDER[tierIdx + 1];
      next_length = current_length + length_step;
    } else if (current_length < tierBounds.max) {
      action = 'length_up';
      next_length = Math.min(current_length + length_step, tierBounds.max);
    }
    // else: at top tier ceiling — hold (no higher to go)
  } else if (demotion_credit >= STREAK) {
    if (current_length <= tierBounds.min && tierIdx > 0) {
      action = 'demote_tier';
      next_tier = TIER_ORDER[tierIdx - 1];
      next_length = Math.max(current_length - length_step, tier_table[next_tier].min);
    } else if (current_length > tierBounds.min) {
      action = 'length_down';
      next_length = Math.max(current_length - length_step, tierBounds.min);
    }
    // else: at beginner floor — hold (no lower to go)
  }

  return { promotion_credit, demotion_credit, action, next_tier, next_length };
}

// Default tier tables per category, exported for reuse across compound tools.
// Shadowing / dictation / podcast all share the same word-count bounds.
export const LISTENING_TIER_TABLE: TierTable = {
  beginner: { min: 5, max: 8 },
  intermediate: { min: 10, max: 15 },
  advanced: { min: 20, max: 30 },
};

// Default thresholds. Override per-skill as needed.
//
// Tuning notes (true i+1):
//   - STREAK=3 filters "lucky" passes (two-in-a-row can be coincidence; three is real).
//   - length_step=1 keeps each jump to a single new word/chunk.
//   - PASS=0.90 raises the bar so borderline passes (0.86-0.89) hold instead of promoting.
//   - FAIL=0.55 unchanged — only clear stumbles count as demotion-eligible.
export const SHADOWING_THRESHOLDS: CreditGatingThresholds = {
  PASS: 0.90,
  FAIL: 0.55,
  STREAK: 3,
  length_step: 1,
};

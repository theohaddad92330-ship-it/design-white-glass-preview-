/** The minimal shape the split needs — satisfied by both the full `UserCredits`
 *  and the lighter `UserCreditsSummary` the nav badge reads. */
type CreditBreakdownInput = {
  accounts_limit: number
  accounts_used: number
  topup_analyses?: number
}

/**
 * Splits the analyses balance into its two provable sources so the UI can stop
 * showing one opaque number (Théo restitution P0-07 — "clarifier le 39 crédits").
 *
 * The contract cleanly separates two things:
 *   - `accounts_limit` = the effective cap for the cycle = plan/trial quota PLUS
 *     any one-off top-up pack.
 *   - `topup_analyses` = the top-up part, which does NOT survive the monthly
 *     reset (it buys capacity for the current cycle only).
 * So `planIncluded = accounts_limit - topup` is what the plan/trial grants, and
 * `topup` is the one-off pack — a distinction that is always true from the
 * payload alone (no guessing which column an admin grant landed on).
 */
type CreditBreakdown = {
  /** Effective cap; null when unlimited (beta / enterprise). */
  total: number | null
  used: number
  /** Remaining analyses; null when unlimited. */
  remaining: number | null
  /** Analyses included by the plan or trial (cap minus the one-off pack). */
  planIncluded: number
  /** One-off top-up pack — expires at the next monthly reset. */
  topup: number
  isUnlimited: boolean
}

const UNLIMITED_THRESHOLD = 999_999

export function creditBreakdown(credits: CreditBreakdownInput): CreditBreakdown {
  const cap = credits.accounts_limit
  const isUnlimited = cap >= UNLIMITED_THRESHOLD
  const topup = Math.max(0, credits.topup_analyses ?? 0)
  const used = Math.max(0, credits.accounts_used)
  return {
    total: isUnlimited ? null : cap,
    used,
    remaining: isUnlimited ? null : Math.max(0, cap - used),
    // Never let a stale/oversized top-up push the included part negative.
    planIncluded: Math.max(0, cap - topup),
    topup,
    isUnlimited,
  }
}

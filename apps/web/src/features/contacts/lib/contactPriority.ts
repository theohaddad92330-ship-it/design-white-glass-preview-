/**
 * `contact.priority` is an ORDINAL RANK, not a score.
 *
 * The IA emits « priority: 1-5 (1 = priorite maximale) » (bellum_contacts.py) and
 * the contract pins it to `int().min(1).max(5)`. **1 is the best**, 5 the worst.
 *
 * It must never be rendered through a score widget: the account score circle
 * reads its input as a /10 where BIGGER is BETTER, so it painted the top
 * contact (1) red / almost-empty and the least relevant one (5) amber / fuller —
 * the exact inverse of the meaning, under a « Score » label.
 *
 * Do NOT confuse it with `contact.contact_score` (0-100, bigger = better), which
 * is a different measure with its own widget.
 */

export const PRIORITY_BEST = 1
export const PRIORITY_WORST = 5

export type PriorityTone = 'strong' | 'medium' | 'weak'

/** The rank when it sits on the contract's 1-5 ordinal scale, else ``null``.
 *  An out-of-range value is rejected rather than clamped: clamping would invent
 *  a rank the analysis never produced. */
export function normalizeContactPriority(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= PRIORITY_BEST && value <= PRIORITY_WORST ? value : null
}

/** Ascending comparator — rank 1 first. Unranked contacts sort last. */
export function comparePriority(a: number | null | undefined, b: number | null | undefined): number {
  const left = normalizeContactPriority(a)
  const right = normalizeContactPriority(b)
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left - right
}

/** Best-first ordering. Returns a new array — never sorts in place. */
export function sortByPriority<T extends { priority?: number | null }>(contacts: readonly T[]): T[] {
  return [...contacts].sort((a, b) => comparePriority(a.priority, b.priority))
}

/** Colour band for a rank, oriented the RIGHT way: rank 1 = strong. */
export function priorityTone(value: number | null | undefined): PriorityTone | null {
  const rank = normalizeContactPriority(value)
  if (rank === null) return null
  if (rank <= 2) return 'strong'
  if (rank === 3) return 'medium'
  return 'weak'
}

import type { RankedContact } from '@bellum/contracts'

type PassAheadReason = { key: string; points: number; otherPoints: number; max: number }

/**
 * LOIC-FIX2 O.3 — le critère qui fait passer `ranked` devant `next` : celui où l'écart de points est le plus grand,
 * lu sur les points RÉELS des deux personnes. Un axe non évalué d'un côté ne départage pas (on ne compare pas une
 * note à une absence), un critère qui ne fait que départager (joignabilité) n'entre pas, et sans écart positif on
 * ne dit rien : jamais une raison inventée. Égalité d'écart : le premier dans l'ordre des critères.
 */
export function passAheadReason(
  ranked: RankedContact,
  next: RankedContact,
  isTieBreaker: (axisKey: string) => boolean,
): PassAheadReason | null {
  let best: PassAheadReason | null = null
  let bestGap = 0
  for (const axis of ranked.axes) {
    if (isTieBreaker(axis.key) || axis.points === null) continue
    const other = next.axes.find(candidate => candidate.key === axis.key)
    if (!other || other.points === null) continue
    const gap = axis.points - other.points
    if (gap > bestGap) {
      bestGap = gap
      best = { key: axis.key, points: axis.points, otherPoints: other.points, max: axis.max }
    }
  }
  return best
}

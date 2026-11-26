import type { AutopilotPlan } from './discover-autopilot'
import { applyPlanToFilters } from './discover-autopilot-apply'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'

/**
 * #4530.2 / #4530.3 — le bouton « Ma cible ». Ce qu'il POSE dans le rail est mémorisé clé par clé, pour que
 * le second clic retire CES critères et pas ceux que l'utilisateur a posés lui-même entre-temps.
 */
type MyTargetPosed = Partial<UnifiedFilters>

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Pose la cible du profil dans le rail (`applyPlanToFilters`, la SEULE traduction plan → rail, GA-26) et rend
 * ce qui a réellement changé. Un plan qui ne vient pas du profil (repli marché) ne pose rien : « Ma cible »
 * ne devine jamais une cible.
 */
export function poseMyTarget(
  current: UnifiedFilters,
  plan: AutopilotPlan,
  chosenSectors?: readonly string[],
): { filters: UnifiedFilters; posed: MyTargetPosed } {
  if (plan.basisKey !== 'profile') return { filters: current, posed: {} }
  const filters = applyPlanToFilters(current, plan, chosenSectors)
  const posed: Record<string, unknown> = {}
  for (const key of Object.keys(filters) as (keyof UnifiedFilters)[]) {
    const before: unknown = current[key]
    const after: unknown = filters[key]
    if (same(before, after)) continue
    posed[key] = Array.isArray(after) && Array.isArray(before) ? after.filter(item => !before.includes(item)) : after
  }
  return { filters, posed: posed as MyTargetPosed }
}

/** Retire ce que `poseMyTarget` avait posé ; une valeur posée à la main depuis reste. */
export function retireMyTarget(current: UnifiedFilters, posed: MyTargetPosed): UnifiedFilters {
  const empty = emptyUnifiedFilters()
  const next: Record<string, unknown> = { ...current }
  for (const key of Object.keys(posed) as (keyof UnifiedFilters)[]) {
    const mine: unknown = posed[key]
    const now: unknown = current[key]
    if (Array.isArray(mine) && Array.isArray(now)) next[key] = now.filter(item => !mine.includes(item))
    else if (same(mine, now)) next[key] = empty[key]
  }
  return next as unknown as UnifiedFilters
}

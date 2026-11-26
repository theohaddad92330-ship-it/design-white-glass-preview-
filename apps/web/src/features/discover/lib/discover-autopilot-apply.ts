import type { AutopilotPlan } from './discover-autopilot'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'

/**
 * Recette 21/10 U.2 — « Appliquer ma cible » recopie TOUT ce que le plan pose, pas une liste écrite à la main
 * (qui oubliait chaque critère ajouté au plan : exclusions, catégories, niveaux de décision…).
 *
 * Règle : une clé que le plan POSE (valeur différente du rail vide) écrase le rail ; une clé qu'il ne pose pas
 * n'y touche pas — ce que l'utilisateur a saisi à la main (ville, texte libre, territoire) reste. Seuls les
 * secteurs sont toujours recopiés : la cible remplace la cible précédente. L'effectif ne l'est plus (#4529.9) :
 * le plan ne le pose pas, donc une taille ajoutée à la main survit.
 */
export function applyPlanToFilters(
  current: UnifiedFilters,
  plan: AutopilotPlan,
  chosenSectors?: readonly string[],
): UnifiedFilters {
  if (plan.basisKey !== 'profile') {
    return { ...current, signalSources: plan.filters.signalSources, sinceDays: plan.filters.sinceDays }
  }
  const empty = emptyUnifiedFilters()
  const next: UnifiedFilters = { ...current }
  const overwrite = <K extends keyof UnifiedFilters>(key: K) => {
    next[key] = plan.filters[key]
  }
  for (const key of Object.keys(plan.filters) as (keyof UnifiedFilters)[]) {
    if (JSON.stringify(plan.filters[key]) !== JSON.stringify(empty[key])) overwrite(key)
  }
  next.sectors = chosenSectors ? [...chosenSectors] : plan.filters.sectors
  return next
}

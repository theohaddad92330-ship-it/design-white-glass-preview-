import { parseHeadcountLabel, publishedHeadcount } from './discover-types'

/**
 * #5006 (Louis 31/10) — « hors cible » = MOINS DE 20 SALARIÉS, ce critère-là seulement. Lu sur la tranche d'effectif du
 * registre : toute la tranche sous 20. Effectif inconnu, nul ou illisible ⇒ `false` : on ne devine pas (GA-18/19).
 * Aucun filtre, rien de caché : le compte reste dans la liste, la marque DIT pourquoi.
 */
const TARGET_MIN_HEADCOUNT = 20

export function belowTargetHeadcount(label: string | null | undefined): boolean {
  if (!publishedHeadcount(label)) return false
  const bounds = parseHeadcountLabel(label ?? null)
  return bounds !== null && bounds[1] < TARGET_MIN_HEADCOUNT
}

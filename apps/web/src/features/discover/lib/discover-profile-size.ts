import type { IdealAccountProfile } from '@bellum/contracts'
import { HEADCOUNT_FOR_SIZE } from './discover-autopilot'
import { countActiveFilters, emptyUnifiedFilters, hasIntentSignals, type UnifiedFilters } from './discover-filters'
import type { HeadcountRange } from './discover-types'

/* ------------------------------------------------------------------ */
/*  DISCOVER-TAILLE T.1 — la taille VISÉE par le profil, par défaut.    */
/*                                                                     */
/*  Prod 19/10 : `/discover?sectors=nuclear`, profil « ETI », rendait   */
/*  dix entreprises à « 0 salarié ». Aucune notion de taille ne partait */
/*  dans la requête : la taille du profil ne pesait que quelques points */
/*  de score, sur ce que le registre avait déjà rendu — des coquilles.  */
/*                                                                     */
/*  Ici le profil COMPLÈTE le trou, VISIBLEMENT (GA-337) : la tranche   */
/*  est écrite dans le rail que l'écran affiche, une pastille la dit et */
/*  la retire en un clic. Jamais un effet qui s'exécute seul : c'est le */
/*  lancement d'une recherche qui l'applique.                           */
/* ------------------------------------------------------------------ */

/**
 * #4516.6 / #4516.7 (Louis 24/10) — la taille du profil est PROPOSÉE, jamais appliquée : aucune recherche (page,
 * tuile, piste rapide, texte libre, Laura → Découvrir, autopilote) ne pose de tranche ; la modale Taille s'ouvre vide
 * (« toutes les tailles »). Revient sur le lot T.1 du 19/10 (`9a5ba69c0d`), qui l'appliquait par défaut.
 *
 * Rend la taille à PROPOSER (une puce cliquable), ou `null` quand :
 *  - l'utilisateur l'a écartée (`declined`, `profileSize=off` dans l'URL — les liens enregistrés restent valides) ;
 *  - il a posé lui-même une tranche ou une catégorie — son filtre gagne toujours ;
 *  - le profil ne vise pas de taille (`all`, absent) — « toutes tailles » n'est pas un critère ;
 *  - la recherche est par signaux (la taille n'y filtre pas la source) ;
 *  - le rail n'a AUCUN autre critère structuré (une compétence seule n'appelle pas de taille).
 */
export function proposeProfileSize(
  filters: UnifiedFilters,
  icp: Pick<IdealAccountProfile, 'size'> | null | undefined,
  declined: boolean,
): IdealAccountProfile['size'] | null {
  if (declined || !icp) return null
  if (HEADCOUNT_FOR_SIZE[icp.size] === 'any') return null
  if (filters.headcount.length > 0 || filters.companyCategory.length > 0) return null
  if (hasIntentSignals(filters) || countActiveFilters(filters) === 0) return null
  if (structuredCriteria(filters, { zone: true }) === 0) return null
  return icp.size
}

/** La tranche d'effectif que pose le geste « Filtrer sur cette taille » (`'any'` : aucune). */
export function headcountForProfileSize(size: IdealAccountProfile['size']): HeadcountRange[] {
  const headcount: HeadcountRange | 'any' = HEADCOUNT_FOR_SIZE[size]
  return headcount === 'any' ? [] : [headcount]
}

/** Les critères STRUCTURÉS d'une recherche : ce qui reste quand on retire le texte de compétence. */
function structuredCriteria(filters: UnifiedFilters, keep: { zone: boolean }): number {
  const defaults = emptyUnifiedFilters()
  return countActiveFilters({
    ...filters,
    freetext: '',
    keywords: '',
    technologiesObserved: '',
    ...(keep.zone ? {} : { region: [], siteBasis: defaults.siteBasis }),
  })
}

import { matchingExpertises, type MarketContextMatch, type MarketMemoryCoverage } from '@bellum/contracts'

/* ------------------------------------------------------------------ */
/*  #1626 — le moteur « Contexte marché observé »                         */
/*  (`MarketMemoryService.searchByFilters`, existant depuis #1596.6-10),  */
/*  pas le registre ni les signaux : ses résultats n'ont pas la forme     */
/*  d'un `DiscoverCandidate` (pas de SIREN — la mémoire marché ne joint   */
/*  jamais d'identité, par doctrine).                                     */
/*  Lot K (31/10, revient sur #4632) — la section « Marché observé » de  */
/*  Découvrir est retirée ; ce module ne garde que le calcul réutilisé.   */
/*                                                                        */
/*  Doctrine tenue ici, et où :                                           */
/*   - aucune probabilité, aucun score 0-100 : `marketFitFor` DÉCOMPOSE    */
/*     (les expertises qui recoupent, nommées) et ne gradue qu'à partir de */
/*     ce compte, jamais d'un indice composite ;                          */
/*   - `MARKET_MEMORY_SCORING_ENABLED` reste FAUX : cette gradation ne     */
/*     l'utilise pas, elle réutilise `matchingExpertises` (le recoupement  */
/*     expertise déclarée × pile observée, déjà calculé pour le            */
/*     portefeuille et l'écran de lancement) — pas un second appariement ; */
/*   - « non mesuré » n'est jamais un score à zéro : voir `marketFitFor`.  */
/* ------------------------------------------------------------------ */

/** La requête TELLE QUE `companiesApi.marketContextSearch` l'envoie. */
export interface MarketContextQuery {
  technology?: string
  roleFamily?: string
  esn?: string
  location?: string
  employeeMin?: number
  employeeMax?: number
}

/** Le post-filtre « recours externe observé uniquement ». */
export function applyEsnOnlyFilter(
  matches: readonly MarketContextMatch[],
  esnOnly: boolean,
): readonly MarketContextMatch[] {
  if (!esnOnly) return matches
  return matches.filter(match => match.coverage.esnObserved.length > 0)
}

// Non exportés : consommés uniquement dans ce fichier (`marketFitFor`,
// `sortByCompatibility`). `pnpm lint:exports:types` (knip) refuse un type
// exporté qui n'a aucun consommateur hors de son propre fichier.
type MarketFitLabel = 'matched' | 'unmeasured'

interface MarketFit {
  label: MarketFitLabel
  /** Les expertises DÉCLARÉES qui recoupent la pile/les familles observées —
   *  la preuve décomposée que l'écran affiche à côté du libellé. Un score
   *  n'est jamais nu (doctrine) : c'est cette liste qui tient lieu d'axes. */
  matched: readonly string[]
}

/**
 * #1626 — LE « FIT MARCHÉ », SANS LA GRADATION QUE LE RETOUR DEMANDE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ ÉCART ASSUMÉ AU RETOUR, ET LA RAISON EST DÉJÀ DANS LE DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour #1626 écrit « Fit marché : Fort / Moyen / Non mesuré » — une
 * gradation à deux niveaux au-dessus de « non mesuré ». `MarketStructuralFitCard`
 * (#1635.4, `marketMemory:fit.noGrade`) a DÉJÀ tranché exactement cette
 * question, sur le MÊME recoupement (`matchingExpertises` entre expertises
 * déclarées et pile observée) : « Pas de gradation, et pas de score : dire
 * "forte affinité" demanderait de comparer chaque compte à des entreprises de
 * taille et de secteur voisins, ce qu'on ne sait pas encore faire. Un grand
 * groupe cite mécaniquement plus de technologies qu'une PME. » Compter deux
 * expertises recoupées plutôt qu'une ne mesure pas un fit plus FORT — ça peut
 * mesurer une entreprise plus GRANDE, qui cite mécaniquement plus de
 * technologies. Appliquer ici la gradation que #1635.4 refuse là-bas créerait
 * deux réponses différentes à la même question, à trois mois d'écart.
 *
 * Ce que cette fonction rend donc : DEUX états, jamais trois — measuré
 * (« recoupe vos expertises déclarées », les expertises NOMMÉES) ou non
 * mesuré. Le tri par « compatibilité » reste légitime (matched d'abord), il
 * ne prétend juste pas déjà savoir LEQUEL des comptes matched est le plus
 * compatible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » COUVRE DEUX CAS, PAR UN CHOIX EXPLICITE
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Rien à comparer : aucune expertise déclarée, ou le compte ne porte
 *    aucune pile/famille observée (doctrine GA-18/GA-19).
 * 2. Il y a une base de comparaison des deux côtés, et le recoupement est
 *    réellement nul. On ne distingue pas ce cas d'un « rien à comparer » :
 *    dans les deux cas, on ne PEUT pas affirmer un fit, et c'est la seule
 *    chose que « non mesuré » promet ici.
 */
export function marketFitFor(coverage: MarketMemoryCoverage, expertises: readonly string[]): MarketFit {
  const observed = [...coverage.observedStack.map(row => row.techno), ...coverage.roleFamilies.map(row => row.family)]
  if (expertises.length === 0 || observed.length === 0) return { label: 'unmeasured', matched: [] }

  const matched = matchingExpertises(observed, expertises)
  return matched.length > 0 ? { label: 'matched', matched } : { label: 'unmeasured', matched: [] }
}

const FIT_RANK: Record<MarketFitLabel, number> = { matched: 1, unmeasured: 0 }

/**
 * Tri « Compatibilité avec mon offre » (retour #1626) — LE SEUL tri de ce
 * panneau. Pas de score 0-100 : le rang vient de `marketFitFor`, déterministe
 * et décomposé ; à égalité, le nom départage pour que deux lectures rendent
 * toujours le même ordre.
 */
export function sortByCompatibility(
  matches: readonly MarketContextMatch[],
  expertises: readonly string[],
): MarketContextMatch[] {
  return [...matches].sort((a, b) => {
    const diff =
      FIT_RANK[marketFitFor(b.coverage, expertises).label] - FIT_RANK[marketFitFor(a.coverage, expertises).label]
    return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName)
  })
}

/**
 * #4632 — LE SORT ÉCRIT DES QUATRE PRÉRÉGLAGES DU PANNEAU RETIRÉ (`marketContextPresets()`, #1626).
 * Aucun n'a disparu sans phrase : un seul survit, comme préréglage du rail qui existait déjà ; les trois autres
 * sont retirés, chacun avec sa raison. `railPreset` nomme le préréglage du rail (`discover-presets.ts`).
 */
export const MARKET_CONTEXT_PRESET_FATES: ReadonlyArray<{
  id: 'externalRecourse' | 'largeAccounts' | 'dataRoles' | 'cloudEcosystem'
  railPreset?: 'externalRecourseObserved'
  why: string
}> = [
  {
    id: 'externalRecourse',
    railPreset: 'externalRecourseObserved',
    why: 'Repris : le rail porte déjà le préréglage « Recours externe observé » (#2165.30) ; le plancher de 250 salariés se coche dans « Taille ».',
  },
  {
    id: 'largeAccounts',
    why: 'Retiré : « 1 000 salariés et plus » est UNE tranche du filtre de taille unique (#4362) — un préréglage qui coche une seule case doublerait le champ (GA-26).',
  },
  {
    id: 'dataRoles',
    why: 'Retiré : « Data » est une valeur du champ « Famille de rôles observée », créé dans le rail ; posé seul il affine sans lancer, un préréglage promettrait une recherche qui ne part pas.',
  },
  {
    id: 'cloudEcosystem',
    why: 'Retiré : « Cloud » est une valeur du champ « Compétences » unique (#4316) ; le pré-écrire en préréglage referait le doublon que #4316 a retiré.',
  },
]

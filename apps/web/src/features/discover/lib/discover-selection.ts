import type { DiscoverCandidate } from './discover-types'

/* ------------------------------------------------------------------ */
/*  #2166.54 — sélection multiple des résultats comptes.                */
/*                                                                     */
/*  L'état vit dans `Discover.tsx` (un `Set<siren>`), pas ici : ces      */
/*  fonctions sont pures, pour que la case cochée et la barre de        */
/*  sélection lisent TOUJOURS le même calcul, jamais deux miroirs.       */
/* ------------------------------------------------------------------ */

/** Ajoute ou retire un SIREN — jamais de mutation de l'ensemble reçu. */
export function toggleSelected(selected: ReadonlySet<string>, siren: string): Set<string> {
  const next = new Set(selected)
  if (next.has(siren)) next.delete(siren)
  else next.add(siren)
  return next
}

/** Les candidats sélectionnés, dans l'ordre de la liste affichée. */
export function selectedCandidates(
  candidates: readonly DiscoverCandidate[],
  selected: ReadonlySet<string>,
): DiscoverCandidate[] {
  return candidates.filter(candidate => selected.has(candidate.siren))
}

interface DiscoverSelectionSplit {
  /** Porte déjà une fiche compte canonique (`accountId`) — une cible peut la référencer. */
  eligible: DiscoverCandidate[]
  /** #2166.55 / #2166.76 — aucune fiche à référencer encore : NOMMÉ, jamais tu. */
  ineligible: DiscoverCandidate[]
}

/**
 * #2166.55 / #2166.63 — une cible ne COPIE jamais une fiche, elle la
 * RÉFÉRENCE (`account_id`, `packages/contracts/src/schemas/target-list.ts`).
 * Un candidat de Découvrir qui n'est pas encore une fiche de l'espace n'a
 * donc rien à référencer : plutôt que de l'ajouter en silence sous une forme
 * qui n'existe pas, il est COMPTÉ à part et dit à l'écran — même règle que
 * `unresolvedNaf` / `withoutSignal`.
 */
export function splitSelectionByAccount(candidates: readonly DiscoverCandidate[]): DiscoverSelectionSplit {
  const eligible: DiscoverCandidate[] = []
  const ineligible: DiscoverCandidate[] = []
  for (const candidate of candidates) {
    if (candidate.accountId !== null) eligible.push(candidate)
    else ineligible.push(candidate)
  }
  return { eligible, ineligible }
}

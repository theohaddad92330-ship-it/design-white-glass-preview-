import type { DiscoverWidenAxis } from '@/features/discover/lib/discover-filters'
/**
 * #2614.2 — « dire "recherche incomplète" et proposer l'action qui la
 * complète » : une recherche qui trouve un ou deux comptes n'est ni un
 * échec (`DiscoverError`) ni un vide (`DiscoverEmpty`, qui a déjà sa propre
 * sortie « élargir »/« passer aux signaux ») — c'est un résultat réel, mais
 * trop mince pour être défendu devant un client. `matched` = le total
 * réellement trouvé par la recherche (`data.coverage.candidatesFound`),
 * jamais le nombre affiché après les affinages client (`visible.length`),
 * qui répond à une autre question (« combien mes filtres laissent-ils
 * passer ? », déjà couverte par `filtersNarrow`).
 *
 * Le SEUIL est un point de départ documenté, pas une décision produit
 * arbitrée — comme `DISCOVER_SPLIT_RESULT_THRESHOLD` (`discover-split-
 * suggestion.ts`), il vit à UN seul endroit (GA-26) plutôt que d'être
 * recopié à chaque appelant.
 */
export const DISCOVER_INCOMPLETE_SEARCH_THRESHOLD = 3

/** `null`/`0` ne sont jamais « incomplets » : `null` est une mesure absente
 *  (jamais devinée), `0` est l'état vide qui a déjà sa propre réponse. */
export function isSearchIncomplete(matched: number | null): boolean {
  if (matched === null) return false
  return matched > 0 && matched < DISCOVER_INCOMPLETE_SEARCH_THRESHOLD
}

/**
 * #2614.2 — mesuré en production le 21/09/2026 : trois recherches en texte
 * libre volontairement impossibles n'ont JAMAIS déclenché cette notice, quel
 * que soit le nombre réel de comptes trouvés. `coverage` (donc
 * `coverageCandidatesFound`) n'existe que sur le chemin BORNÉ (résolution de
 * signaux, `/discover/signals`) — `DiscoverRegistryResponse`
 * (`apps/ia/app/routers/discover.py`) ne le porte JAMAIS, et
 * `/discover/registry` est le chemin de TOUTE recherche en texte libre ou par
 * filtres classiques. Lire `matched` SEULEMENT sur `coverage.candidatesFound`
 * le condamnait donc à `null` sur ce chemin — la CONDITION était fausse,
 * jamais le texte de la notice.
 *
 * Le repli sur `rawCandidatesCount` (`data.candidates.length`, AVANT tout
 * filtre d'écran) est la seule mesure disponible sur ce chemin : jamais
 * devinée, jamais `visible.length` (qui répond à « que voit l'utilisateur
 * après SES filtres », pas « qu'a trouvé la recherche »).
 */
export function matchedCandidatesCount(
  coverageCandidatesFound: number | null | undefined,
  rawCandidatesCount: number,
): number {
  return coverageCandidatesFound ?? rawCandidatesCount
}

/**
 * #4429.4 (recette prod 23/10) — « 2 comptes trouvés — recherche incomplète » au-dessus d'une liste de 0.
 * Le bandeau annonce ce que l'écran peut MONTRER : les comptes masqués (qualification, déjà à toi, écartés)
 * ne comptent pas, et `null` (rien à annoncer) quand il n'en reste aucun — l'état vide répond alors.
 * Quand la zone s'est élargie seule (`zoneWidened`), le geste manuel « Élargir la zone » est sans objet.
 */
export function incompleteSearchMatched(
  matched: number,
  hidden: number,
  zoneWidened: boolean,
  axis: DiscoverWidenAxis | null = null,
): number | null {
  if (zoneWidened && axis === 'zone') return null
  const shown = matched - hidden
  return shown > 0 ? shown : null
}

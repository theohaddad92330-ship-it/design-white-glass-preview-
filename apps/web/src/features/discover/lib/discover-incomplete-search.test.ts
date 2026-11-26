import { describe, expect, it } from 'vitest'
import {
  DISCOVER_INCOMPLETE_SEARCH_THRESHOLD,
  incompleteSearchMatched,
  isSearchIncomplete,
  matchedCandidatesCount,
} from './discover-incomplete-search'

/**
 * #2614.2 — « dire "recherche incomplète" et proposer l'action qui la
 * complète » : `aucun appelant trouvé` (`git grep "recherche incomplète"`
 * rendait rien avant ce lot). Le seuil est un point de départ documenté, pas
 * une décision produit arbitrée : il vit à UN seul endroit (GA-26).
 */
describe('isSearchIncomplete — #2614.2', () => {
  it('est vraie sous le seuil, dès qu’au moins un compte a été trouvé', () => {
    expect(isSearchIncomplete(1)).toBe(true)
    expect(isSearchIncomplete(DISCOVER_INCOMPLETE_SEARCH_THRESHOLD - 1)).toBe(true)
  })

  it('est fausse au seuil et au-delà', () => {
    expect(isSearchIncomplete(DISCOVER_INCOMPLETE_SEARCH_THRESHOLD)).toBe(false)
    expect(isSearchIncomplete(DISCOVER_INCOMPLETE_SEARCH_THRESHOLD + 10)).toBe(false)
  })

  it('n’est jamais vraie à zéro — c’est l’état vide (DiscoverEmpty) qui répond, pas celui-ci', () => {
    expect(isSearchIncomplete(0)).toBe(false)
  })

  it('reste fausse sans mesure (matched inconnu) — jamais un « incomplet » deviné', () => {
    expect(isSearchIncomplete(null)).toBe(false)
  })
})

/**
 * #2614.2 — mesuré en production le 21/09/2026 : trois recherches en texte
 * libre volontairement impossibles (« Fintech en Corse de moins de 10
 * salariés », « Aéronautique en Lozère », « sous-marins en Lozère ») n'ont
 * JAMAIS déclenché `IncompleteSearchNotice`, quel que soit le nombre réel de
 * comptes trouvés. Cause : `data.coverage` n'existe que sur le chemin BORNÉ
 * (résolution de signaux, `/discover/signals`) — `DiscoverRegistryResponse`
 * (`apps/ia/app/routers/discover.py`) ne le porte JAMAIS, et
 * `/discover/registry` est le chemin de TOUTE recherche en texte libre ou par
 * filtres classiques. `matched` lu SEULEMENT sur `coverage.candidatesFound`
 * valait donc toujours `null` sur ce chemin — la condition, jamais le texte.
 *
 * Le repli sur `rawCandidatesCount` (`data.candidates.length`, AVANT tout
 * filtre d'écran) est la seule mesure disponible sur ce chemin : jamais
 * devinée, jamais `visible.length` (qui répond à « que voit l'utilisateur
 * après SES filtres », pas « qu'a trouvé la recherche »).
 */
describe('matchedCandidatesCount — #2614.2', () => {
  it('préfère `coverage.candidatesFound` quand la recherche bornée le mesure', () => {
    expect(matchedCandidatesCount(2, 9)).toBe(2)
  })

  it('se replie sur le compte de candidats bruts quand `coverage` est absent (chemin registre)', () => {
    expect(matchedCandidatesCount(undefined, 2)).toBe(2)
  })

  it('un chemin registre sans aucun candidat reste à zéro — pas un « incomplet » deviné', () => {
    expect(matchedCandidatesCount(undefined, 0)).toBe(0)
  })
})

/**
 * #4429.4 (recette prod 23/10) — « 2 comptes trouvés — recherche incomplète » au-dessus d'une liste de 0 : les
 * deux comptes étaient masqués (qualification, déjà à toi, écartés). Le bandeau ne compte que ce que l'écran
 * peut MONTRER ; et quand la zone s'est élargie seule, il n'offre plus de geste manuel « Élargir la zone ».
 */
describe('incompleteSearchMatched — #4429.4', () => {
  it('ne compte pas les comptes masqués : 2 trouvés, 2 masqués → rien à annoncer', () => {
    expect(incompleteSearchMatched(2, 2, false)).toBeNull()
  })

  it('retire seulement les masqués : 2 trouvés dont 1 masqué → 1 compte', () => {
    expect(incompleteSearchMatched(2, 1, false)).toBe(1)
  })

  it('sans masqué, le compte est celui de la recherche (chemin d’avant)', () => {
    expect(incompleteSearchMatched(2, 0, false)).toBe(2)
  })

  it('la zone s’est élargie seule : le geste manuel « Élargir la zone » ne se propose plus', () => {
    expect(incompleteSearchMatched(2, 0, true, 'zone')).toBeNull()
    expect(incompleteSearchMatched(2, 0, true, 'headcount')).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from './discover-types'
import { selectedCandidates, splitSelectionByAccount, toggleSelected } from './discover-selection'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

/* #2166.54 — sélection multiple des résultats : une case par ligne, jamais un
 * état miroir — `toggleSelected` est la SEULE fonction qui décide qui est
 * dedans, pour que la ligne et la barre de sélection ne divergent jamais. */
describe('toggleSelected (#2166.54)', () => {
  it('ajoute un SIREN absent', () => {
    const next = toggleSelected(new Set(['a']), 'b')
    expect(next).toEqual(new Set(['a', 'b']))
  })

  it('retire un SIREN déjà présent', () => {
    const next = toggleSelected(new Set(['a', 'b']), 'b')
    expect(next).toEqual(new Set(['a']))
  })

  it('ne mute jamais l’ensemble reçu — témoin', () => {
    const original = new Set(['a'])
    toggleSelected(original, 'b')
    expect(original).toEqual(new Set(['a']))
  })
})

describe('selectedCandidates', () => {
  it('rend les candidats dont le SIREN est dans la sélection, dans l’ordre de la liste', () => {
    const a = candidate({ siren: '1', name: 'A' })
    const b = candidate({ siren: '2', name: 'B' })
    const c = candidate({ siren: '3', name: 'C' })
    expect(selectedCandidates([a, b, c], new Set(['3', '1']))).toEqual([a, c])
  })

  it('rend une liste vide quand rien n’est sélectionné — témoin', () => {
    expect(selectedCandidates([candidate()], new Set())).toEqual([])
  })
})

/*
 * #2166.55 / #2166.76 — « ajouter à une cible » réfère un COMPTE CANONIQUE
 * (`account_id`), jamais une copie : un candidat sans `accountId` n'a encore
 * aucune fiche à référencer. `splitSelectionByAccount` NOMME ce qui ne peut
 * pas être ajouté plutôt que de l'ignorer en silence — même règle que
 * `unresolvedNaf` / `withoutSignal` dans `discover-result-rows.ts`.
 */
describe('splitSelectionByAccount (#2166.55 / #2166.76)', () => {
  it('sépare les candidats avec fiche compte de ceux qui n’en ont pas', () => {
    const withAccount = candidate({ siren: '1', accountId: 'acc-1' })
    const withoutAccount = candidate({ siren: '2', accountId: null })
    const split = splitSelectionByAccount([withAccount, withoutAccount])
    expect(split.eligible).toEqual([withAccount])
    expect(split.ineligible).toEqual([withoutAccount])
  })

  it('rend deux listes vides sur une sélection vide — témoin', () => {
    expect(splitSelectionByAccount([])).toEqual({ eligible: [], ineligible: [] })
  })
})

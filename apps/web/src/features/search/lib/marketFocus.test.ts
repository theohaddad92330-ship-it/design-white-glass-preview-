import { describe, expect, it } from 'vitest'
import type { MarketPreview } from '@bellum/contracts'
import { focusSuggestions, rankByMarketPaths } from './marketFocus'

const PREVIEW: MarketPreview = {
  paths_observed: 41,
  esn_observed: 3,
  observed_stack: ['Data', 'Java', 'AWS'],
  role_families: ['Data', 'Développement', 'PMO'],
}

const DECLARED = ['Data / IA', 'Cloud AWS', 'Product']

describe('focusSuggestions — #1591.1, Profil ESN × mémoire marché', () => {
  it('marque « Recommandé » les expertises que le corpus retrouve sur ce compte', () => {
    expect(focusSuggestions(DECLARED, PREVIEW)).toEqual([
      { label: 'Data / IA', recommended: true },
      { label: 'Cloud AWS', recommended: true },
      { label: 'Product', recommended: false },
    ])
  })

  it('⚠️ sans compte sélectionné, RIEN n’est recommandé — une préférence n’est pas une observation', () => {
    expect(focusSuggestions(DECLARED, null).every(entry => !entry.recommended)).toBe(true)
    expect(focusSuggestions(DECLARED, undefined).every(entry => !entry.recommended)).toBe(true)
  })

  it('rend TOUTES les expertises déclarées, dans leur ordre — on marque, on ne filtre pas', () => {
    expect(focusSuggestions(DECLARED, PREVIEW).map(entry => entry.label)).toEqual(DECLARED)
  })

  it('sans expertise déclarée, la liste est vide plutôt que remplie d’un vocabulaire d’emprunt', () => {
    expect(focusSuggestions([], PREVIEW)).toEqual([])
  })

  it('un compte couvert SANS aucune observation ne recommande rien', () => {
    const vide = { ...PREVIEW, observed_stack: [], role_families: [] }
    expect(focusSuggestions(DECLARED, vide).every(entry => !entry.recommended)).toBe(true)
  })
})

describe('rankByMarketPaths — #1593.2, un départage, pas un second score', () => {
  const CHIPS = [{ n: 'SOCIETE GENERALE' }, { n: 'DECATHLON' }, { n: 'SAINT-GOBAIN' }]
  const nameOf = (c: { n: string }) => c.n

  it('remonte les entreprises que la mémoire marché couvre', () => {
    const paths = { DECATHLON: 41, 'SAINT-GOBAIN': 12, 'SOCIETE GENERALE': null }
    expect(rankByMarketPaths(CHIPS, nameOf, paths).map(r => r.suggestion.n)).toEqual([
      'DECATHLON',
      'SAINT-GOBAIN',
      'SOCIETE GENERALE',
    ])
  })

  it('⚠️ garde l’ordre DU SERVEUR entre deux non couvertes — l’écran ne bouge pas tout seul', () => {
    const paths = { DECATHLON: null, 'SAINT-GOBAIN': null, 'SOCIETE GENERALE': null }
    expect(rankByMarketPaths(CHIPS, nameOf, paths).map(r => r.suggestion.n)).toEqual(CHIPS.map(nameOf))
  })

  it('⚠️ une lecture ABSENTE laisse l’ordre du serveur intact — jamais un classement inventé', () => {
    expect(rankByMarketPaths(CHIPS, nameOf, undefined).map(r => r.suggestion.n)).toEqual(CHIPS.map(nameOf))
  })

  it('⚠️ une entreprise non couverte porte `null`, jamais `0`', () => {
    const ranked = rankByMarketPaths(CHIPS, nameOf, { DECATHLON: 41 })
    expect(ranked.find(r => r.suggestion.n === 'SOCIETE GENERALE')?.marketPaths).toBeNull()
  })
})

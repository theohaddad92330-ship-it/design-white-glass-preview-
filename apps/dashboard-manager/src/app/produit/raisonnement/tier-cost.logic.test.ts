import { describe, expect, it } from 'vitest'
import type { CostAggregate } from '@/lib/costs'
import { coutMoyenParAppel, libelleDuPalier, lignesDesPaliers } from './tier-cost.logic'

const ligne = (key: string, calls: number, cost_usd: number, untariffed = 0): CostAggregate => ({
  key,
  calls,
  units: 0,
  cost_usd,
  untariffed,
})

// #3861.R2 — coût par palier de raisonnement de Laura. La latence n'est pas persistée : l'écran le dit.
describe('libelleDuPalier — les trois noms de coût du tour, rien d’autre', () => {
  it('nomme les paliers connus', () => {
    expect(libelleDuPalier('bellum_chat_fast', 'fr')).toBe('Rapide')
    expect(libelleDuPalier('bellum_chat_deep', 'fr')).toBe('Approfondi')
    expect(libelleDuPalier('bellum_chat', 'fr')).toBe('Non routé (palier unique)')
    expect(libelleDuPalier('bellum_chat_deep', 'en')).toBe('Deep')
  })

  it('n’invente aucun libellé pour une clé inconnue : elle s’affiche telle quelle', () => {
    expect(libelleDuPalier('bellum_facts', 'fr')).toBe('bellum_facts')
  })
})

describe('coutMoyenParAppel — jamais un zéro fabriqué', () => {
  it('divise le coût tarifé par les appels', () => {
    expect(coutMoyenParAppel(ligne('bellum_chat_fast', 100, 2))).toBeCloseTo(0.02)
  })

  it('est null sans appel (non mesuré, pas 0)', () => {
    expect(coutMoyenParAppel(ligne('bellum_chat_fast', 0, 0))).toBeNull()
  })

  it('est null quand des lignes n’ont pas de prix : la moyenne serait un plancher trompeur', () => {
    expect(coutMoyenParAppel(ligne('bellum_chat_deep', 10, 1, 4))).toBeNull()
  })
})

describe('lignesDesPaliers — une absence ne fait aucune ligne', () => {
  it('ne garde que les paliers présents, dans l’ordre rapide → approfondi', () => {
    const lignes = lignesDesPaliers([ligne('bellum_chat_deep', 4, 1), ligne('bellum_chat_fast', 9, 1)], 'fr')
    expect(lignes.map(l => l.palier)).toEqual(['Rapide', 'Approfondi'])
  })

  it('liste vide ⇒ aucune ligne', () => {
    expect(lignesDesPaliers([], 'fr')).toEqual([])
  })

  it('ignore une clé hors paliers (garde : ne lit pas les prompts d’analyse)', () => {
    expect(lignesDesPaliers([ligne('bellum_facts', 1, 1)], 'fr')).toEqual([])
  })
})

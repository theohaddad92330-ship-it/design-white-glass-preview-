import type { AccountIntelligenceContextView, AccountIntelligenceRecommendation } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { accountOpeningStrategyView } from './accountOpeningStrategy'

/** Une recommandation minimale valide — seuls `id`/`label`/`provenance` varient
 *  d'un test à l'autre, le reste n'est pas le sujet de ce fichier. */
function recommendation(over: Partial<AccountIntelligenceRecommendation> = {}): AccountIntelligenceRecommendation {
  return {
    id: 'next-action',
    label: 'Hors sujet de ce test',
    detail: null,
    nature: 'observation',
    provenance: { source: 'dataforge', observedAt: '2026-08-01T00:00:00.000Z' },
    freshness: 'fresh',
    confidence: { level: 'single_source', corroborationCount: 1 },
    limit: 'not_a_commitment',
    check: 'confirm_with_contact',
    action: 'open_contacts',
    ...over,
  }
}

function context(
  over: Partial<Pick<AccountIntelligenceContextView, 'entryPaths' | 'recommendations'>> = {},
): Pick<AccountIntelligenceContextView, 'entryPaths' | 'recommendations'> {
  return {
    entryPaths: { state: 'unknown' },
    recommendations: [],
    ...over,
  }
}

describe('accountOpeningStrategyView — #2786/#2285.3 — Analyser et Score lisent le contexte canonique', () => {
  it('rend `unknown` quand ni une porte ni une narration n’ont gagné l’arbitrage', () => {
    expect(accountOpeningStrategyView(context())).toEqual({ state: 'unknown' })
  })

  it('rend `unknown` quand une AUTRE recommandation existe, mais pas celle d’ouverture', () => {
    expect(accountOpeningStrategyView(context({ recommendations: [recommendation({ id: 'main-risk' })] }))).toEqual({
      state: 'unknown',
    })
  })

  it('rend les points d’entrée NOMMÉS avec la source ET la date qui ont gagné l’arbitrage — DataForge par exemple', () => {
    const view = accountOpeningStrategyView(
      context({
        entryPaths: {
          state: 'known',
          value: [
            { label: 'DSI groupe', targetProfile: 'RSSI', justification: 'Décide seule des prestataires cloud.' },
            { label: 'Filiale paiement', targetProfile: null, justification: null },
          ],
          provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
        },
        // Une narration existe AUSSI dans le corpus (le modèle a une opinion),
        // mais une porte NOMMÉE a gagné l'arbitrage : la narration ne s'affiche
        // pas à côté — deux vérités sur « par où entrer » est le NO-GO de #2285.23.
        recommendations: [recommendation({ id: 'opening-strategy', label: 'Ignorée : une porte a gagné.' })],
      }),
    )
    expect(view).toEqual({
      state: 'known',
      source: 'dataforge',
      observedAt: '2026-08-20T00:00:00.000Z',
      narrative: null,
      entryPoints: [
        { label: 'DSI groupe', targetProfile: 'RSSI', justification: 'Décide seule des prestataires cloud.' },
        { label: 'Filiale paiement', targetProfile: null, justification: null },
      ],
    })
  })

  it('rend la narration du modèle SEULEMENT quand aucune porte n’a été nommée', () => {
    const view = accountOpeningStrategyView(
      context({
        entryPaths: { state: 'unknown' },
        recommendations: [
          recommendation({
            id: 'opening-strategy',
            label: 'Entrer par la filiale paiement, pas par le siège.',
            nature: 'inference',
            provenance: { source: 'inference', observedAt: '2026-08-30T09:00:00.000Z' },
          }),
        ],
      }),
    )
    expect(view).toEqual({
      state: 'known',
      source: 'inference',
      observedAt: '2026-08-30T09:00:00.000Z',
      narrative: 'Entrer par la filiale paiement, pas par le siège.',
      entryPoints: [],
    })
  })
})

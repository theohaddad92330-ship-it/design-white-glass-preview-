import { describe, expect, it } from 'vitest'
import { libelleOutil, libelleQuotaOutil } from './tool-quota-panel.logic'

describe('#2440.45 — une ligne de quota quotidien par outil', () => {
  it('dit la dépense du jour sur le quota, en dollars', () => {
    expect(libelleQuotaOutil({ tool: 'analysis', capUsd: 5, spentTodayUsd: 2, unpricedLines: 0, reached: false })).toBe(
      '2.00 $ sur 5.00 $ aujourd’hui',
    )
  })

  it('dit que le total est un PLANCHER quand des lignes ne sont pas tarifées (GA-64)', () => {
    expect(libelleQuotaOutil({ tool: 'analysis', capUsd: 5, spentTodayUsd: 2, unpricedLines: 3, reached: false })).toBe(
      'au moins 2.00 $ sur 5.00 $ aujourd’hui (3 lignes non tarifées exclues)',
    )
  })

  it('dit que le quota est atteint — au-delà, l’action est refusée', () => {
    expect(
      libelleQuotaOutil({ tool: 'enrichment', capUsd: 1, spentTodayUsd: 1, unpricedLines: 0, reached: true }),
    ).toBe('1.00 $ sur 1.00 $ aujourd’hui — atteint : l’outil est refusé jusqu’à minuit (UTC)')
  })

  it('nomme l’outil par son métier, et garde la clé pour un outil sans libellé', () => {
    expect(libelleOutil('analysis')).toBe('Analyse de compte')
    expect(libelleOutil('enrichment')).toBe('Enrichissement de contacts')
    expect(libelleOutil('need_play')).toBe('need_play')
  })
})

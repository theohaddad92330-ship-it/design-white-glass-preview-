import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { readDossierReliability } from '../useAccountOverviewData'
import { buildEvaluationViewData } from './evaluationViewData'

const account = (raw: Record<string, unknown>): Account => ({ id: 'a1', raw_analysis: raw }) as unknown as Account

// 14/10/2026 — le Score lisait `confidence.score` seul, la Vue d'ensemble aussi `data_confidence` :
// Orange affichait 58/100 d'un côté, « antérieure à la grille de fiabilité » de l'autre.
describe('Fiabilité du dossier — même source que la Vue d’ensemble', () => {
  it('lit data_confidence à la racine comme la Vue d’ensemble', () => {
    const data = buildEvaluationViewData(account({ data_confidence: 58 }))
    expect(data.confidence).toBe(58)
  })

  it('lit plan.data_confidence', () => {
    const data = buildEvaluationViewData(account({ plan: { data_confidence: 61 } }))
    expect(data.confidence).toBe(61)
  })

  it('reste null sans aucune fiabilité', () => {
    expect(buildEvaluationViewData(account({})).confidence).toBeNull()
  })

  it('exporte la lecture partagée', () => {
    expect(typeof readDossierReliability).toBe('function')
  })
})

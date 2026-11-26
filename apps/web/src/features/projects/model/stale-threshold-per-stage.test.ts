import { describe, expect, it } from 'vitest'
import type { StageSlaRow } from '@/features/settings/lib/stage-sla-api'
import { staleOf, staleThresholdsFor } from './stale-alert'

/**
 * #2170.43 — LE SEUIL DE STAGNATION DÉPEND DE L'ÉTAPE, ET L'ESPACE LE RÈGLE.
 *
 * « Le seuil dépend du stage et peut être réglé dans les Listes métier /
 * règles. » Le réglage par étape EXISTE déjà (`deal_stage_sla`, écran Règles →
 * Pipe) : ce test prouve que la carte et le filtre « vieillissantes » le LISENT,
 * au lieu de garder 7/14/30 figés pour toutes les étapes.
 *
 * ⚠️ Ce test SAIT DIRE NON : un `staleOf` qui ignore les réglages rend
 * `attention` à 10 jours sur une négociation réglée à 20 jours.
 */
const NOW = Date.parse('2026-10-31T12:00:00Z')
const enteredDaysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

const rows = (overrides: Partial<Record<StageSlaRow['stage'], number>>): StageSlaRow[] =>
  (['confirmed', 'qualified', 'profiles_submitted', 'negotiation'] as const).map(stage =>
    overrides[stage] === undefined
      ? { stage, slaDays: 7, isDefault: true }
      : { stage, slaDays: overrides[stage] ?? null, isDefault: false },
  )

describe('staleThresholdsFor — un réglage d’espace par étape', () => {
  it('garde 7/14/30 pour une étape que l’espace n’a pas réglée', () => {
    expect(staleThresholdsFor('negotiation', rows({}))).toEqual({ attention: 7, warning: 14, danger: 30 })
  })

  it('garde 7/14/30 quand le réglage n’est pas (encore) lu — jamais « aucun seuil »', () => {
    expect(staleThresholdsFor('negotiation', undefined)).toEqual({ attention: 7, warning: 14, danger: 30 })
  })

  it('dérive les trois paliers de la durée réglée : attention à la durée, orange au double, alerte au quadruple', () => {
    expect(staleThresholdsFor('negotiation', rows({ negotiation: 20 }))).toEqual({
      attention: 20,
      warning: 40,
      danger: 80,
    })
  })

  it('une étape hors pipe (piste détectée) garde ses paliers par défaut', () => {
    expect(staleThresholdsFor('detected', rows({ negotiation: 20 }))).toEqual({ attention: 7, warning: 14, danger: 30 })
  })
})

describe('staleOf — la carte et le filtre lisent le réglage', () => {
  it('une négociation réglée à 20 jours n’est PAS vieillissante à 10 jours', () => {
    const project = { stage: 'negotiation' as const, stage_entered_at: enteredDaysAgo(10) }
    expect(staleOf(project, NOW, rows({ negotiation: 20 }))).toBeNull()
    // Sans réglage, la même affaire l'est : c'est bien le réglage qui change la réponse.
    expect(staleOf(project, NOW)?.level).toBe('attention')
  })

  it('une étape réglée court (3 jours) passe en alerte au quadruple', () => {
    const project = { stage: 'qualified' as const, stage_entered_at: enteredDaysAgo(12) }
    expect(staleOf(project, NOW, rows({ qualified: 3 }))?.level).toBe('danger')
  })
})

import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_BATCH_ITEM_STATES,
  ANALYSIS_BATCH_MAX_ITEMS,
  ANALYSIS_BATCH_SOURCES,
  analysisBatchItemKey,
  batchItemStateFromAnalysis,
  createAnalysisBatchSchema,
  dedupeAnalysisBatchInputs,
  summarizeAnalysisBatch,
} from './analysis-batch.js'

/** #2293.5 / .6 — le LOT d'analyses : un parent, un sous-job par entreprise. */
describe('analysis-batch — contrat du lot multi-comptes (#2293)', () => {
  it('#2293.6 — nomme les huit états individuels de la demande, plus `needs_resolution` (#2283.32)', () => {
    expect(ANALYSIS_BATCH_ITEM_STATES).toEqual([
      'resolved',
      'to_confirm',
      'queued',
      'running',
      'partial',
      'done',
      'failed',
      'canceled',
      'needs_resolution',
    ])
  })

  it('#2293.3 — accepte les huit sources nommées (noms, identifiants, Mes cibles, Découvrir, portefeuille, import, Laura, recherche enregistrée)', () => {
    expect(ANALYSIS_BATCH_SOURCES).toEqual([
      'names',
      'identifiers',
      'target_list',
      'discover',
      'portfolio',
      'import',
      'laura',
      'saved_search',
    ])
  })

  it('refuse un lot vide et un lot au-delà de la limite', () => {
    const item = { name: 'Engie' }
    expect(createAnalysisBatchSchema.safeParse({ source: 'names', items: [] }).success).toBe(false)
    expect(
      createAnalysisBatchSchema.safeParse({
        source: 'names',
        items: Array.from({ length: ANALYSIS_BATCH_MAX_ITEMS + 1 }, () => item),
      }).success,
    ).toBe(false)
    expect(createAnalysisBatchSchema.safeParse({ source: 'names', items: [item] }).success).toBe(true)
    expect(createAnalysisBatchSchema.safeParse({ source: 'names', items: [{ name: 'X', siren: '12' }] }).success).toBe(
      false,
    )
  })

  it('#2922 — accepte un mode de contexte optionnel, et refuse une valeur hors énumération', () => {
    const item = { name: 'Engie' }
    expect(
      createAnalysisBatchSchema.safeParse({ source: 'names', items: [item], context_mode: 'one_off_mission' }).success,
    ).toBe(true)
    expect(createAnalysisBatchSchema.safeParse({ source: 'names', items: [item] }).success).toBe(true)
    expect(
      createAnalysisBatchSchema.safeParse({ source: 'names', items: [item], context_mode: 'mode_inconnu' }).success,
    ).toBe(false)
  })

  it('un doublon se reconnaît au SIREN, sinon au nom normalisé (casse, accents, ponctuation)', () => {
    expect(analysisBatchItemKey({ name: 'Société Générale' })).toBe(
      analysisBatchItemKey({ name: 'societe  generale.' }),
    )
    expect(analysisBatchItemKey({ name: 'A', siren: '552120222' })).toBe(
      analysisBatchItemKey({ name: 'B', siren: '552120222' }),
    )
    expect(analysisBatchItemKey({ name: 'Engie' })).not.toBe(analysisBatchItemKey({ name: 'Eiffage' }))
  })

  it('dedupe garde la première occurrence et COMPTE les doublons', () => {
    const { unique, duplicates } = dedupeAnalysisBatchInputs([
      { name: 'BPCE' },
      { name: 'Eiffage' },
      { name: 'bpce' },
      { name: 'Engie' },
      { name: 'EIFFAGE ' },
    ])
    expect(unique.map(i => i.name)).toEqual(['BPCE', 'Eiffage', 'Engie'])
    expect(duplicates).toBe(2)
  })

  describe('batchItemStateFromAnalysis — l’état d’un sous-job se LIT sur son analyse', () => {
    it('terminée → done ; annulée → canceled', () => {
      expect(batchItemStateFromAnalysis({ state: 'completed', phase: 'analysis_done', completedPhases: [] })).toBe(
        'done',
      )
      expect(batchItemStateFromAnalysis({ state: 'canceled', phase: null, completedPhases: [] })).toBe('canceled')
    })
    it('échouée SANS phase aboutie → failed ; AVEC des phases abouties → partial (#2478)', () => {
      expect(batchItemStateFromAnalysis({ state: 'failed', phase: null, completedPhases: [] })).toBe('failed')
      expect(batchItemStateFromAnalysis({ state: 'failed', phase: null, completedPhases: ['research'] })).toBe(
        'partial',
      )
    })
    it('en vol sans phase commencée → queued ; avec une phase → running', () => {
      expect(batchItemStateFromAnalysis({ state: 'active', phase: null, completedPhases: [] })).toBe('queued')
      expect(batchItemStateFromAnalysis({ state: 'active', phase: 'contacts', completedPhases: [] })).toBe('running')
    })
    it('introuvable → null (on ne DEVINE pas un état, on garde le dernier connu)', () => {
      expect(batchItemStateFromAnalysis({ state: 'not_found', phase: null, completedPhases: [] })).toBeNull()
    })
    it('#2283.32 — terminée mais le Résolveur d’identité (#2284) est ambigu → needs_resolution, jamais done', () => {
      expect(
        batchItemStateFromAnalysis({
          state: 'completed',
          phase: 'analysis_done',
          completedPhases: [],
          entityAmbiguity: { candidates: [{ name: 'Silex Group SA', siren: '900000037', city: 'Bordeaux' }] },
        }),
      ).toBe('needs_resolution')
      expect(
        batchItemStateFromAnalysis({
          state: 'completed',
          phase: 'analysis_done',
          completedPhases: [],
          entityAmbiguity: null,
        }),
      ).toBe('done')
    })
  })

  describe('summarizeAnalysisBatch — le statut du PARENT est agrégé, jamais stocké', () => {
    it('un seul sous-job en vol suffit à dire « en cours »', () => {
      const summary = summarizeAnalysisBatch(['done', 'running', 'failed'], null)
      expect(summary.status).toBe('running')
      expect(summary.counts.done).toBe(1)
      expect(summary.counts.failed).toBe(1)
      expect(summary.total).toBe(3)
    })
    it('#2293.7 — des échecs n’empêchent pas un lot d’être TERMINÉ, qui se dit alors « avec des échecs »', () => {
      expect(summarizeAnalysisBatch(['done', 'failed', 'partial'], null).status).toBe('finished_with_failures')
      expect(summarizeAnalysisBatch(['done', 'done'], null).status).toBe('finished')
    })
    it('des entreprises à confirmer, rien en vol → le lot ATTEND une confirmation', () => {
      expect(summarizeAnalysisBatch(['done', 'to_confirm'], null).status).toBe('needs_confirmation')
    })
    it('#2283.32 — une identité ambiguë découverte APRÈS l’analyse attend aussi une décision', () => {
      expect(summarizeAnalysisBatch(['done', 'needs_resolution'], null).status).toBe('needs_confirmation')
    })
    it('un lot annulé le reste, même si des analyses déjà faites y figurent', () => {
      expect(summarizeAnalysisBatch(['done', 'canceled'], '2026-09-23T10:00:00Z').status).toBe('canceled')
    })
  })
})

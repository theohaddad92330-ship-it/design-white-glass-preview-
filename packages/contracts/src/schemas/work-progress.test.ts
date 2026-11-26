import { describe, expect, it } from 'vitest'
import {
  WORK_COUNTERS,
  WORK_FAILURES_PER_FAMILY,
  WORK_FAMILIES,
  WORK_UNMEASURED_REASONS,
  WORK_UNMEASURED_REASON_LABELS,
  counterReading,
  workFamilyProgress,
} from './work-progress.js'

// #4611 — Laura dit où en est le travail lancé. Les refus d'abord.
describe('work-progress — #4611.5 un chiffre non mesuré ne devient JAMAIS « 0 »', () => {
  it.each([null, undefined, Number.NaN, -1, 1.5])('%s n’est pas une mesure : compteur NOMMÉ non mesuré', value => {
    expect(counterReading(value, 'read_failed')).toEqual({
      measured: false,
      reason: 'read_failed',
      reasonLabel: 'la lecture a échoué',
    })
  })

  it('un 0 réellement compté reste 0 (mesuré) — c’est la seule source de « 0 »', () => {
    expect(counterReading(0, 'read_failed')).toEqual({ measured: true, value: 0 })
  })

  it('un compteur absent reste nommé, même quand les autres sont mesurés', () => {
    const family = workFamilyProgress({
      family: 'analysis',
      measures: { launched: 15, done: 10, failed: 0 },
      unmeasuredReason: 'read_failed',
    })
    expect(family.counters.running).toEqual({
      measured: false,
      reason: 'read_failed',
      reasonLabel: 'la lecture a échoué',
    })
    expect(family.counters.failed).toEqual({ measured: true, value: 0 })
  })
})

describe('work-progress — #4611.4 un compteur n’est jamais déduit par soustraction', () => {
  it('« 15 lancées, 10 rendues » ne fabrique PAS « 5 en cours »', () => {
    const family = workFamilyProgress({
      family: 'analysis',
      measures: { launched: 15, done: 10 },
      unmeasuredReason: 'read_failed',
    })
    expect(family.counters.running.measured).toBe(false)
    expect(JSON.stringify(family)).not.toContain('"value":5')
  })
})

describe('work-progress — forme commune aux cinq familles (#4611.2)', () => {
  it('chaque famille porte les quatre mêmes compteurs', () => {
    for (const family of WORK_FAMILIES) {
      const built = workFamilyProgress({ family, measures: {}, unmeasuredReason: 'no_run_ledger' })
      expect(Object.keys(built.counters)).toEqual([...WORK_COUNTERS])
    }
  })

  it('chaque raison de non-mesure a sa phrase', () => {
    for (const reason of WORK_UNMEASURED_REASONS)
      expect(WORK_UNMEASURED_REASON_LABELS[reason].length).toBeGreaterThan(3)
  })

  it('#4611.6 — les raisons d’échec sont bornées, le compteur, lui, les compte toutes', () => {
    const failures = Array.from({ length: 9 }, (_, i) => ({ label: `lot ${i}`, reason: 'timeout amont', at: null }))
    const family = workFamilyProgress({
      family: 'import',
      measures: { failed: 9 },
      unmeasuredReason: 'read_failed',
      failures,
    })
    expect(family.failures).toHaveLength(WORK_FAILURES_PER_FAMILY)
    expect(family.counters.failed).toEqual({ measured: true, value: 9 })
  })
})

describe('work-progress — tout le travail en cours (#4611, lot L6)', () => {
  it('les jobs de Laura et les recherches de conversation sont des familles, AJOUTÉES EN FIN (GA-08)', () => {
    expect(WORK_FAMILIES.slice(0, 5)).toEqual(['analysis', 'import', 'enrichment', 'crm_sync', 'catch_up'])
    expect(WORK_FAMILIES.slice(5)).toEqual(['laura_job', 'chat_research'])
  })

  it('NON — une recherche dont seul « en cours » est mesuré ne fabrique ni lancées ni rendues', () => {
    const family = workFamilyProgress({
      family: 'chat_research',
      measures: { running: 1 },
      unmeasuredReason: 'no_run_ledger',
    })
    expect(family.counters.running).toEqual({ measured: true, value: 1 })
    for (const counter of ['launched', 'done', 'failed'] as const) {
      expect(family.counters[counter].measured).toBe(false)
    }
  })
})

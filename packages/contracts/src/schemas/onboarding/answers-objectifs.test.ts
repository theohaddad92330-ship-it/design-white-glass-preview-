import { describe, expect, it } from 'vitest'
import {
  esnObjectiveSchema,
  OBJECTIFS_ANSWER_FIELDS,
  OBJECTIVE_COMMITMENT_LEVELS,
  OBJECTIVE_KINDS,
  OBJECTIVE_PERIODS,
  OBJECTIVES_MAX_ITEMS,
} from './answers-objectifs.js'

/**
 * #2052 — les objectifs commerciaux NOMMÉS.
 *
 * Ce que cette garde prouve, dans l'ordre du registre L19 :
 *  - Bloc 1 (.1-.10) : le catalogue de natures existe, et le tableau est
 *    FACULTATIF (un objectif absent n'est pas un objectif à zéro).
 *  - Bloc 2 (.11-.15) : chaque entrée porte sa forme complète, et REFUSE ce
 *    qui manque une pièce obligatoire (période, niveau d'engagement, source).
 *  - Bloc 3 (.16-.17) : les trois niveaux d'engagement sont bien TROIS états
 *    au contrat, jamais deux.
 *  - #2052.7 : la garde SAIT DIRE NON — un objectif `revenue` qui porte un
 *    nombre est refusé (GA-26 : `modules/objectives` porte déjà ce nombre).
 */
describe('esnObjectiveSchema — #2052.11 à .15, ce que porte CHAQUE objectif', () => {
  const base = {
    kind: 'meetings' as const,
    period: 'monthly' as const,
    commitmentLevel: 'objective' as const,
    source: 'human' as const,
    observedAt: '2026-09-16T00:00:00.000Z',
  }

  it('accepte un objectif complet, valeur + unité + horizon', () => {
    const result = esnObjectiveSchema.safeParse({
      ...base,
      value: 15,
      unit: 'rendez-vous',
      horizon: 'Fin T4 2026',
      note: null,
    })
    expect(result.success).toBe(true)
  })

  it('#2052.11 — accepte un objectif SANS valeur : non déclaré n’est pas zéro', () => {
    const result = esnObjectiveSchema.safeParse({ ...base, value: null, unit: null })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.value).toBeNull()
  })

  it('#2052.12 — refuse un objectif SANS période : elle est obligatoire', () => {
    const { period: _period, ...withoutPeriod } = base
    const result = esnObjectiveSchema.safeParse({ ...withoutPeriod, value: 10 })
    expect(result.success).toBe(false)
  })

  it('#2052.14 — refuse un objectif SANS niveau d’engagement : obligatoire', () => {
    const { commitmentLevel: _level, ...withoutLevel } = base
    const result = esnObjectiveSchema.safeParse({ ...withoutLevel, value: 10 })
    expect(result.success).toBe(false)
  })

  it('#2052.15 — refuse un objectif SANS source ni date d’observation', () => {
    const { source: _source, observedAt: _observedAt, ...withoutProvenance } = base
    const result = esnObjectiveSchema.safeParse({ ...withoutProvenance, value: 10 })
    expect(result.success).toBe(false)
  })

  it('#2052.15 — la source réutilise le même vocabulaire que `provenance.ts` (human/connector/pipeline/model)', () => {
    const result = esnObjectiveSchema.safeParse({ ...base, source: 'not_a_real_source' })
    expect(result.success).toBe(false)
  })

  it('#2052.7 — sait dire NON : un objectif `revenue` avec un nombre est refusé (GA-26)', () => {
    const result = esnObjectiveSchema.safeParse({ ...base, kind: 'revenue', value: 500000, unit: '€' })
    expect(result.success).toBe(false)
  })

  it('#2052.7 — un objectif `revenue` SANS nombre reste nommable', () => {
    const result = esnObjectiveSchema.safeParse({ ...base, kind: 'revenue', value: null, unit: null })
    expect(result.success).toBe(true)
  })

  it('#2052.9 — `consultants_on_mission_target` est une nature à part, distincte du constat', () => {
    expect(OBJECTIVE_KINDS).toContain('consultants_on_mission_target')
    expect(OBJECTIVE_KINDS).not.toContain('consultants_on_mission')
  })
})

describe('OBJECTIVE_COMMITMENT_LEVELS — #2052.14/.16/.17, trois états, jamais deux', () => {
  it('porte exactement objective / benchmark / ambition', () => {
    expect(OBJECTIVE_COMMITMENT_LEVELS).toEqual(['objective', 'benchmark', 'ambition'])
  })

  it('#2052.16 — un repère de travail (`benchmark`) n’est pas un objectif (`objective`)', () => {
    const benchmark = esnObjectiveSchema.safeParse({
      kind: 'meetings',
      period: 'monthly',
      commitmentLevel: 'benchmark',
      source: 'human',
      observedAt: '2026-09-16T00:00:00.000Z',
      value: 12,
      unit: 'rendez-vous',
    })
    expect(benchmark.success).toBe(true)
    if (benchmark.success) expect(benchmark.data.commitmentLevel).not.toBe('objective')
  })

  it('#2052.17 — une ambition n’est pas un objectif', () => {
    const ambition = esnObjectiveSchema.safeParse({
      kind: 'new_accounts',
      period: 'yearly',
      commitmentLevel: 'ambition',
      source: 'human',
      observedAt: '2026-09-16T00:00:00.000Z',
      value: 20,
      unit: 'comptes',
    })
    expect(ambition.success).toBe(true)
    if (ambition.success) expect(ambition.data.commitmentLevel).not.toBe('objective')
  })
})

describe('OBJECTIFS_ANSWER_FIELDS.esn_objectives — #2052.1, facultatif', () => {
  const field = OBJECTIFS_ANSWER_FIELDS.esn_objectives

  it('accepte un tableau vide et l’absence : aucun objectif déclaré n’est pas une erreur', () => {
    expect(field.safeParse(undefined).success).toBe(true)
    expect(field.safeParse([]).success).toBe(true)
  })

  it('refuse deux objectifs de la même nature — un seul par nature', () => {
    const item = {
      kind: 'meetings' as const,
      period: 'monthly' as const,
      commitmentLevel: 'objective' as const,
      source: 'human' as const,
      observedAt: '2026-09-16T00:00:00.000Z',
      value: 10,
      unit: 'rendez-vous',
    }
    const result = field.safeParse([item, item])
    expect(result.success).toBe(false)
  })

  it('plafonne à une entrée par nature connue', () => {
    expect(OBJECTIVES_MAX_ITEMS).toBe(OBJECTIVE_KINDS.length)
  })

  it('couvre les huit natures de l’issue (#2052.2 à .10, hors .8 déjà livré ailleurs)', () => {
    expect(OBJECTIVE_KINDS).toEqual([
      'meetings',
      'qualified_needs',
      'profiles_presented',
      'placements',
      'new_accounts',
      'revenue',
      'consultants_on_mission_target',
      'structuring',
    ])
  })

  it('#2052.12 — couvre les quatre périodes attendues', () => {
    expect(OBJECTIVE_PERIODS).toEqual(['weekly', 'monthly', 'quarterly', 'yearly'])
  })
})

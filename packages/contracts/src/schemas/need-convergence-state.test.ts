import { describe, expect, it } from 'vitest'
import { changeNeedConvergenceStateSchema, projectNeedSchema } from './project.js'

const need = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  project_id: null,
  account_id: '22222222-2222-2222-2222-222222222222',
  title: 'Architecte cloud',
  skills: [],
  seniority: null,
  headcount: 1,
  target_tjm_cents: null,
  start_on: null,
  duration_months: null,
  location: null,
  contract_kind: 'inconnu',
  status: 'to_qualify',
  deadline_at: null,
  created_at: '2026-09-26T00:00:00.000Z',
  updated_at: '2026-09-26T00:00:00.000Z',
  ...overrides,
})

/**
 * #2952 (#2305.13/.14/.15/.16/.18) — le contrat de la porte de convergence,
 * le seul chemin d'écriture de `project_needs.convergence_state`.
 */
describe('changeNeedConvergenceStateSchema — #2952', () => {
  it('accepte les quatre niveaux du contrat', () => {
    for (const to of ['projet_plausible', 'projet_confirme', 'besoin_detecte', 'besoin_exprime']) {
      expect(changeNeedConvergenceStateSchema.safeParse({ to }).success).toBe(true)
    }
  })

  it('refuse un niveau hors du catalogue fermé — jamais un niveau deviné', () => {
    expect(changeNeedConvergenceStateSchema.safeParse({ to: 'projet_tres_chaud' }).success).toBe(false)
  })

  it('accepte des signaux fondateurs optionnels', () => {
    const parsed = changeNeedConvergenceStateSchema.safeParse({
      to: 'projet_plausible',
      foundingSignalIds: ['signal-1', 'signal-2'],
    })
    expect(parsed.success).toBe(true)
  })
})

describe('projectNeedSchema.convergence_state — #2952', () => {
  it('traverse `null` (jamais évalué) tel quel', () => {
    expect(projectNeedSchema.parse(need({ convergence_state: null })).convergence_state).toBeNull()
  })

  it('accepte un niveau posé', () => {
    expect(projectNeedSchema.parse(need({ convergence_state: 'besoin_exprime' })).convergence_state).toBe(
      'besoin_exprime',
    )
  })
})

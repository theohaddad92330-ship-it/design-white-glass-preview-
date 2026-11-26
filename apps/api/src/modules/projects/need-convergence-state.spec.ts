import { NotFoundException } from '@nestjs/common'
import { UnfoundedConvergenceError } from '@bellum/contracts'
import { ProjectPipelineService } from './project-pipeline.service'

/**
 * #2952 (#2305.13/.14/.15/.16/.18/.35) — LA PORTE DE CONVERGENCE.
 *
 * `assertExplicitConvergenceTransition`/`assertConvergenceCitesFoundingSignals`
 * (`@bellum/contracts`) étaient posées et testées EN PUR, sans appelant.
 * `ProjectPipelineService.changeNeedConvergenceState` en est le premier —
 * même harnais que `need-status.spec.ts` (la porte d'état voisine).
 */
describe('ProjectPipelineService — la porte de convergence d’un besoin', () => {
  const build = (need: Record<string, unknown> | null) => {
    const needs = {
      findOne: jest.fn().mockResolvedValue(need),
      save: jest.fn(async (row: Record<string, unknown>) => row),
      manager: { query: jest.fn().mockResolvedValue([]) },
    }
    const commercialTransitions = { record: jest.fn().mockResolvedValue(undefined), history: jest.fn() }
    const service = new ProjectPipelineService(
      { findOne: jest.fn() } as never,
      needs as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      {
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn(() => ({
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn(),
        })),
      } as never,
      commercialTransitions as never,
    )
    return { service, needs }
  }

  const need = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    workspace_id: 'w-1',
    project_id: null,
    account_id: 'a-1',
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
    status_reason: null,
    status_changed_at: null,
    deadline_at: null,
    convergence_state: null,
    created_at: new Date('2026-09-26T10:00:00.000Z'),
    updated_at: new Date('2026-09-26T10:00:00.000Z'),
    ...over,
  })

  it('un besoin introuvable est nommé, jamais deviné', async () => {
    const { service } = build(null)
    await expect(
      service.changeNeedConvergenceState('w-1', 'n-1', 'projet_plausible', ['sig-1']),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('pose un premier niveau sans exiger de transition explicite — rien à transitionner depuis « jamais évalué »', async () => {
    const { service, needs } = build(need({ convergence_state: null }))
    const result = await service.changeNeedConvergenceState('w-1', 'n-1', 'besoin_detecte', [])
    expect(result.convergence_state).toBe('besoin_detecte')
    expect(needs.save).toHaveBeenCalledTimes(1)
  })

  it('#2305.35 — un « projet plausible » sans signal fondateur est refusé', async () => {
    const { service } = build(need({ convergence_state: null }))
    await expect(service.changeNeedConvergenceState('w-1', 'n-1', 'projet_plausible', [])).rejects.toBeInstanceOf(
      UnfoundedConvergenceError,
    )
  })

  it('#2305.35 — un « projet plausible » qui cite ses signaux est accepté', async () => {
    const { service } = build(need({ convergence_state: null }))
    const result = await service.changeNeedConvergenceState('w-1', 'n-1', 'projet_plausible', ['sig-1'])
    expect(result.convergence_state).toBe('projet_plausible')
  })

  it('#2305.18 — deux niveaux différents passent, ce n’est pas une transition automatique : le clic EST le geste explicite', async () => {
    const { service } = build(need({ convergence_state: 'projet_plausible' }))
    const result = await service.changeNeedConvergenceState('w-1', 'n-1', 'projet_confirme', [])
    expect(result.convergence_state).toBe('projet_confirme')
  })

  it('rester au même niveau ne lève jamais — `from === to` n’est pas une transition', async () => {
    const { service } = build(need({ convergence_state: 'besoin_exprime' }))
    await expect(service.changeNeedConvergenceState('w-1', 'n-1', 'besoin_exprime', [])).resolves.not.toThrow()
  })
})

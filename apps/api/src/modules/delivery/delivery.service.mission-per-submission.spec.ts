import { IsNull } from 'typeorm'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { SubmissionEntity } from '../../database/entities/submission.entity'
import { createMockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DeliveryService } from './delivery.service'

const USER = 'user-1'
const WORKSPACE = 'ws-1'
const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const OPP = '44444444-4444-4444-8444-444444444444'
const SUB_A = '55555555-5555-4555-8555-555555555555'
const SUB_B = '66666666-6666-4666-8666-666666666666'

function build(opts: { submissionCost?: number | null; consultantCost?: number | null } = {}) {
  const missions = createMockRepository<MissionEntity>()
  missions.findOne.mockResolvedValue(null)
  missions.save.mockImplementation(async (entity: Partial<MissionEntity>) => ({ id: 'm-new', ...entity }))
  const accounts = createMockRepository<never>()
  accounts.findOne.mockResolvedValue({ id: ACCOUNT })
  const submissions = createMockRepository<SubmissionEntity>()
  submissions.findOne.mockImplementation(async (query: { where: { id: string } }) => ({
    id: query.where.id,
    consultant_id: 'c-1',
    project_id: OPP,
    daily_cost_cents: opts.submissionCost ?? null,
  }))
  const projects = createMockRepository<never>()
  projects.findOne.mockResolvedValue(null)
  // #4559 — l'affaire désignée appartient à l'espace (la garde d'écriture compte).
  projects.count.mockResolvedValue(1)
  const needs = createMockRepository<never>()
  needs.findOne.mockResolvedValue(null)
  needs.count.mockResolvedValue(1)
  const terms = createMockRepository<never>()
  terms.find.mockResolvedValue([])
  const consultants = createMockRepository<never>()
  consultants.findOne.mockResolvedValue({
    id: 'c-1',
    full_name: 'X',
    photo_url: null,
    cost_rate_cents: opts.consultantCost ?? null,
  })
  const service = new DeliveryService(
    missions as never,
    createMockRepository<never>() as never,
    accounts as never,
    projects as never,
    needs as never,
    terms as never,
    createMockRepository<never>() as never,
    consultants as never,
    submissions as never,
    { assign: jest.fn() } as never,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    createMockRepository<never>() as never,
    { list: jest.fn() } as never,
  )
  return { service, missions, terms }
}

// #4192 (épopée #4191, lot L1) — BEL-FIX-001 devient « une mission par positionnement ».
describe('DeliveryService.create — une mission par positionnement retenu', () => {
  it('l’idempotence porte sur le COUPLE (affaire, positionnement)', async () => {
    const { service, missions } = build()
    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, submissionId: SUB_A, label: 'A' })
    expect(missions.findOne).toHaveBeenCalledWith({
      where: { workspace_id: WORKSPACE, opportunity_id: OPP, submission_id: SUB_A },
    })
  })

  it('sans positionnement : les DEUX NULL (submission_id IS NULL), jamais « n’importe quelle mission de l’affaire »', async () => {
    const { service, missions } = build()
    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, label: 'sans' })
    expect(missions.findOne).toHaveBeenCalledWith({
      where: { workspace_id: WORKSPACE, opportunity_id: OPP, submission_id: IsNull() },
    })
  })

  it('une mission existe pour le positionnement A : un second positionnement B crée sa PROPRE mission', async () => {
    const { service, missions } = build()
    missions.findOne.mockImplementation(async (opts: { where: { submission_id?: unknown } }) =>
      opts.where.submission_id === SUB_A
        ? ({ id: 'm-A', label: 'Mission A', opportunity_id: OPP } as MissionEntity)
        : null,
    )
    const again = await service.create(USER, {
      accountId: ACCOUNT,
      opportunityId: OPP,
      submissionId: SUB_A,
      label: 'x',
    })
    expect(again.id).toBe('m-A')
    expect(missions.save).not.toHaveBeenCalled()

    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, submissionId: SUB_B, label: 'B' })
    expect(missions.save).toHaveBeenCalledTimes(1)
  })
})

// #4191 G4 — la mission née de la signature reçoit le coût journalier chargé (D43), jamais un zéro.
describe('DeliveryService.create — le coût du positionnement est reporté dans les conditions commerciales', () => {
  const costInserts = (terms: { manager: { query: jest.Mock } }) =>
    terms.manager.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO mission_commercial_terms'))

  it('reporte le coût du POSITIONNEMENT, sans jamais écraser une saisie existante', async () => {
    const { service, terms } = build({ submissionCost: 450_00, consultantCost: 400_00 })
    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, submissionId: SUB_A, label: 'A' })
    const [call] = costInserts(terms as never)
    expect(call).toBeDefined()
    expect(String(call?.[0])).toContain('ON CONFLICT (mission_id) DO NOTHING')
    expect(call?.[1]).toEqual(['m-new', WORKSPACE, 450_00])
  })

  it('à défaut, reporte le coût chargé du CONSULTANT', async () => {
    const { service, terms } = build({ submissionCost: null, consultantCost: 400_00 })
    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, submissionId: SUB_A, label: 'A' })
    expect(costInserts(terms as never)[0]?.[1]).toEqual(['m-new', WORKSPACE, 400_00])
  })

  it('aucun coût connu : AUCUNE ligne écrite — la marge reste « non mesurée », jamais 0', async () => {
    const { service, terms } = build({ submissionCost: null, consultantCost: null })
    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, submissionId: SUB_A, label: 'A' })
    expect(costInserts(terms as never)).toHaveLength(0)
  })

  it('un coût à zéro est une donnée corrompue, pas un coût : non reporté', async () => {
    const { service, terms } = build({ submissionCost: 0, consultantCost: 0 })
    await service.create(USER, { accountId: ACCOUNT, opportunityId: OPP, submissionId: SUB_A, label: 'A' })
    expect(costInserts(terms as never)).toHaveLength(0)
  })
})

import { ProjectsController } from './projects.controller'

/**
 * #4195 (épopée #4191, lot L4) — « gagné » crée UNE mission par positionnement
 * retenu, sans case à cocher. Le geste de signature est le déplacement
 * `PATCH /projects/:id/stage` ; `DeliveryService.create` garde ses deux appelants.
 */
describe('ProjectsController — la signature crée les missions (#4195)', () => {
  const row = { id: 'p-1', account_id: 'acc-1', label: 'Refonte SI', loss_reason: null }

  const retained = (over: Record<string, unknown> = {}) => ({
    id: 's-1',
    consultantId: 'c-1',
    needId: 'n-1',
    proposedRateCents: 65000,
    dailyCostCents: 42000,
    plannedDays: 100,
    ...over,
  })

  const build = (opts: {
    previousStage?: string
    needs?: Array<Record<string, unknown>>
    accepted?: Array<ReturnType<typeof retained>>
  }) => {
    const projects = {
      getRow: jest.fn().mockResolvedValue({ ...row, stage: opts.previousStage ?? 'negotiation' }),
      updateStage: jest
        .fn()
        .mockImplementation((_id: string, _ws: string, stage: string) => Promise.resolve({ ...row, stage })),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const delivery = { create: jest.fn().mockResolvedValue({ id: 'm-1' }) }
    const pipeline = { listNeeds: jest.fn().mockResolvedValue(opts.needs ?? []) }
    const submissions = { acceptedForOpportunity: jest.fn().mockResolvedValue(opts.accepted ?? []) }
    const none = {} as never
    const controller = new ProjectsController(
      projects as never,
      pipeline as never,
      none,
      workspaceContext as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      undefined,
      delivery as never,
      undefined,
      undefined,
      submissions as never,
    )
    return { controller, delivery, projects, submissions }
  }

  const user = { userId: 'u-1' } as never
  const sign = (c: ProjectsController, accepted: string[] = []) =>
    c.updateStage('p-1', { stage: 'won', accepted_actions: accepted } as never, user)

  it('2 positionnements retenus → 2 missions pré-remplies, sans case cochée', async () => {
    const needs = [
      { id: 'n-1', start_on: '2026-11-03', duration_months: 6, contract_kind: 'regie' },
      { id: 'n-2', start_on: '2026-12-01', duration_months: null, contract_kind: null },
    ]
    const { controller, delivery } = build({
      needs,
      accepted: [retained(), retained({ id: 's-2', consultantId: 'c-2', needId: 'n-2', proposedRateCents: 70000 })],
    })

    const result = await sign(controller)

    expect(delivery.create).toHaveBeenCalledTimes(2)
    expect(delivery.create).toHaveBeenNthCalledWith(
      1,
      'u-1',
      expect.objectContaining({
        accountId: 'acc-1',
        opportunityId: 'p-1',
        needId: 'n-1',
        consultantId: 'c-1',
        submissionId: 's-1',
        dailyRate: 650,
        startedOn: '2026-11-03',
        endsOn: '2027-05-02',
        contractKind: 'regie',
      }),
    )
    const second = delivery.create.mock.calls[1][1]
    expect(second).toMatchObject({
      submissionId: 's-2',
      dailyRate: 700,
      startedOn: '2026-12-01',
      contractKind: 'inconnu',
    })
    // Ni durée ni fin devinée : jamais de date inventée.
    expect(second.endsOn).toBeUndefined()
    expect(result.actions.performed).toEqual(['create_mission'])
  })

  it('aucun retenu → le chemin actuel : UNE mission sans positionnement', async () => {
    const { controller, delivery } = build({ needs: [{ id: 'n-1' }], accepted: [] })

    await sign(controller)

    expect(delivery.create).toHaveBeenCalledTimes(1)
    const payload = delivery.create.mock.calls[0][1]
    expect(payload.needId).toBe('n-1')
    expect(payload.submissionId).toBeUndefined()
  })

  // #4291.8 (#4270.4) — un besoin gagné au forfait encadré n'a aucun positionnement : il devient une
  // mission SUIVIE (forfait, sans staffing), jamais la mission « à staffer » générique.
  it('deux besoins dont un forfait encadré, aucun retenu → une mission suivie par le forfait, rattachée à son besoin', async () => {
    const needs = [
      { id: 'n-1', delivery_mode: 'supervised', start_on: '2026-11-03', duration_months: 4, contract_kind: 'forfait' },
      { id: 'n-2', delivery_mode: 'staffed' },
    ]
    const { controller, delivery } = build({ needs, accepted: [] })

    await sign(controller)

    const forNeed = delivery.create.mock.calls.map(c => c[1]).filter(p => p.needId === 'n-1')
    expect(forNeed).toHaveLength(1)
    expect(forNeed[0]).toMatchObject({ opportunityId: 'p-1', startedOn: '2026-11-03', endsOn: '2027-03-02' })
    // jamais une mission à staffer collée au forfait : pas de positionnement inventé.
    expect(forNeed[0].submissionId).toBeUndefined()
    expect(forNeed[0].consultantId).toBeUndefined()
  })

  it('un forfait encadré déjà pourvu par un retenu ne double pas sa mission', async () => {
    const needs = [{ id: 'n-1', delivery_mode: 'supervised' }]
    const { controller, delivery } = build({ needs, accepted: [retained()] })

    await sign(controller)

    expect(delivery.create).toHaveBeenCalledTimes(1)
  })

  it('un second « gagné » (déjà gagné) ne crée RIEN', async () => {
    const { controller, delivery } = build({ previousStage: 'won', accepted: [retained()] })

    const result = await sign(controller, ['create_mission'])

    expect(delivery.create).not.toHaveBeenCalled()
    expect(result.actions.performed).toEqual([])
  })

  it('la création ne dépend plus de la case : une liste vide suffit', async () => {
    const { controller, delivery } = build({ accepted: [retained()] })
    const result = await sign(controller, [])
    expect(delivery.create).toHaveBeenCalledTimes(1)
    expect(result.actions.performed).toEqual(['create_mission'])
  })

  it('une clé create_mission d’un ancien client ne crée pas deux fois', async () => {
    const { controller, delivery } = build({ accepted: [retained()] })
    await sign(controller, ['create_mission'])
    expect(delivery.create).toHaveBeenCalledTimes(1)
  })

  it('une mission qui échoue ne défait pas le déplacement ni les suivantes', async () => {
    const { controller, delivery } = build({ accepted: [retained(), retained({ id: 's-2', consultantId: 'c-2' })] })
    delivery.create.mockRejectedValueOnce(new Error('boom'))

    const result = await sign(controller)

    expect(delivery.create).toHaveBeenCalledTimes(2)
    expect(result.project).toMatchObject({ stage: 'won' })
    expect(result.actions.failed).toEqual([{ key: 'create_mission', reason: 'failed' }])
  })
})

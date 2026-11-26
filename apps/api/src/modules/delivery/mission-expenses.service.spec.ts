import { NotFoundException } from '@nestjs/common'
import { MissionExpensesService } from './mission-expenses.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const EXPENSE = 'e0000000-0000-4000-8000-000000000001'

function makeService(overrides: Record<string, unknown> = {}) {
  const manager = {
    query: jest.fn(async () => [{ total: (overrides['totalCents'] as string) ?? '0' }]),
  }
  const existingRow = (overrides['existing'] as Record<string, unknown>) ?? {
    id: EXPENSE,
    mission_id: MISSION,
    workspace_id: WORKSPACE,
    label: 'Billets de train',
    amount_cents: 12_000,
    expense_date: '2026-08-15',
    entered_by: USER,
    source: 'human',
    created_at: new Date('2026-08-15T09:00:00.000Z'),
    updated_at: new Date('2026-08-15T09:00:00.000Z'),
  }
  const expenses = {
    manager,
    find: jest.fn(async () => (overrides['rows'] as unknown[]) ?? [existingRow]),
    findOne: jest.fn(async () => (overrides['findOneMissing'] === true ? null : existingRow)),
    create: jest.fn((e: Record<string, unknown>) => ({ id: 'new-expense', ...e })),
    save: jest.fn(async (e: Record<string, unknown>) => ({
      created_at: new Date('2026-08-20T09:00:00.000Z'),
      updated_at: new Date('2026-08-20T09:00:00.000Z'),
      ...e,
    })),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const missions = {
    findOne: jest.fn(async () =>
      overrides['missionMissing'] === true ? null : { id: MISSION, workspace_id: WORKSPACE },
    ),
  }

  const service = new MissionExpensesService(expenses as never, missions as never)
  return { service, expenses, missions }
}

describe('MissionExpensesService.list', () => {
  it('refuse une mission hors de l’espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(service.list(WORKSPACE, MISSION)).rejects.toThrow(NotFoundException)
  })

  it('rend les lignes de la mission', async () => {
    const { service } = makeService()
    const items = await service.list(WORKSPACE, MISSION)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ label: 'Billets de train', amountCents: 12_000, source: 'human' })
  })
})

describe('MissionExpensesService.totalCents', () => {
  it('rend 0 sur une mission sans frais — un fait vrai, pas un défaut', async () => {
    const { service } = makeService({ totalCents: '0' })
    expect(await service.totalCents(WORKSPACE, MISSION)).toBe(0)
  })

  it('additionne les lignes en base', async () => {
    const { service } = makeService({ totalCents: '24500' })
    expect(await service.totalCents(WORKSPACE, MISSION)).toBe(24_500)
  })
})

describe('MissionExpensesService.create', () => {
  it('crée toujours avec `source: human` — c’est la route d’une saisie humaine', async () => {
    const { service, expenses } = makeService()
    await service.create(WORKSPACE, USER, MISSION, {
      label: 'Hôtel',
      amountCents: 8_500,
      expenseDate: '2026-08-20',
    })
    expect(expenses.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'human', entered_by: USER, mission_id: MISSION, workspace_id: WORKSPACE }),
    )
  })
})

describe('MissionExpensesService.update — une correction humaine gagne toujours', () => {
  it('accepte une édition HUMAINE sur une ligne déjà HUMAINE', async () => {
    const { service, expenses } = makeService()
    const updated = await service.update(WORKSPACE, MISSION, EXPENSE, { amountCents: 15_000 }, 'human')
    expect(expenses.update).toHaveBeenCalledWith({ id: EXPENSE }, expect.objectContaining({ amount_cents: 15_000 }))
    expect(updated).toBeDefined()
  })

  it('REFUSE un recalcul (`pipeline`) qui écraserait un montant SAISI À LA MAIN', async () => {
    // C'est le point n°5 du lot : un montant humain ne se laisse pas réécrire
    // par une source de moindre autorité — c'est `decideFieldWrite` qui le dit.
    const { service, expenses } = makeService()
    await service.update(WORKSPACE, MISSION, EXPENSE, { amountCents: 99_999 }, 'pipeline')
    expect(expenses.update).not.toHaveBeenCalled()
  })

  it('accepte un recalcul sur une ligne dont la source n’est PAS humaine', async () => {
    const { service, expenses } = makeService({
      existing: {
        id: EXPENSE,
        mission_id: MISSION,
        workspace_id: WORKSPACE,
        label: 'Frais importés',
        amount_cents: 12_000,
        expense_date: '2026-08-15',
        entered_by: USER,
        source: 'pipeline',
        created_at: new Date('2026-08-15T09:00:00.000Z'),
        updated_at: new Date('2026-08-15T09:00:00.000Z'),
      },
    })
    await service.update(WORKSPACE, MISSION, EXPENSE, { amountCents: 13_000 }, 'pipeline')
    expect(expenses.update).toHaveBeenCalledWith({ id: EXPENSE }, expect.objectContaining({ amount_cents: 13_000 }))
  })

  it('refuse une ligne introuvable', async () => {
    const { service } = makeService({ findOneMissing: true })
    await expect(service.update(WORKSPACE, MISSION, EXPENSE, { amountCents: 1 })).rejects.toThrow(NotFoundException)
  })
})

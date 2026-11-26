import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MissionBusinessUnitService } from './mission-business-unit.service'

const MISSION_ID = '11111111-1111-4111-8111-111111111111'
const BU_A = '22222222-2222-4222-8222-222222222222'
const BU_B = '33333333-3333-4333-8333-333333333333'

function build(
  over: {
    mission?: Record<string, unknown> | null
    account?: Record<string, unknown> | null
    target?: Record<string, unknown> | 'missing'
  } = {},
) {
  const missions = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        over.mission === undefined
          ? { id: MISSION_ID, workspace_id: 'ws-1', account_id: 'acc-1', business_unit_id: null }
          : over.mission,
      ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const accounts = {
    findOne: jest.fn().mockResolvedValue(over.account === undefined ? { business_unit_id: BU_A } : over.account),
  }
  const known: Record<string, Record<string, unknown>> = {
    [BU_A]: { id: BU_A, name: 'BU Data', status: 'active' },
    [BU_B]: { id: BU_B, name: 'BU Cloud', status: 'active' },
  }
  const businessUnits = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (over.target === 'missing' && where.id === BU_B) return null
      if (over.target && over.target !== 'missing' && where.id === (over.target as { id: string }).id)
        return over.target
      return known[where.id] ?? null
    }),
  }
  const journal = jest.fn().mockResolvedValue(undefined)
  const service = new MissionBusinessUnitService(missions as never, accounts as never, businessUnits as never)
  return { service, missions, accounts, businessUnits, journal }
}

describe('MissionBusinessUnitService (#3413 « autre BU » — transfert réel)', () => {
  it('transfère : la mission change de BU propriétaire et le journal dit qui, quand, source → cible', async () => {
    const { service, missions, journal } = build()

    const result = await service.transfer(
      'ws-1',
      'user-1',
      MISSION_ID,
      { targetBusinessUnitId: BU_B, confirm: true },
      journal,
    )

    expect(result).toEqual({
      missionId: MISSION_ID,
      from: { id: BU_A, name: 'BU Data' },
      to: { id: BU_B, name: 'BU Cloud' },
    })
    expect(missions.update).toHaveBeenCalledWith({ id: MISSION_ID, workspace_id: 'ws-1' }, { business_unit_id: BU_B })
    expect(journal).toHaveBeenCalledWith({ field: 'business_unit_id', oldValue: 'BU Data', newValue: 'BU Cloud' })
  })

  it('la BU source est celle de la mission, sinon celle de son compte, sinon « aucune » (jamais inventée)', async () => {
    const own = build({
      mission: { id: MISSION_ID, workspace_id: 'ws-1', account_id: 'acc-1', business_unit_id: BU_A },
    })
    expect(
      (await own.service.transfer('ws-1', 'u', MISSION_ID, { targetBusinessUnitId: BU_B, confirm: true }, own.journal))
        .from,
    ).toEqual({
      id: BU_A,
      name: 'BU Data',
    })
    expect(own.accounts.findOne).not.toHaveBeenCalled()

    const none = build({ account: { business_unit_id: null } })
    const result = await none.service.transfer(
      'ws-1',
      'u',
      MISSION_ID,
      { targetBusinessUnitId: BU_B, confirm: true },
      none.journal,
    )
    expect(result.from).toBeNull()
    expect(none.journal).toHaveBeenCalledWith({ field: 'business_unit_id', oldValue: null, newValue: 'BU Cloud' })
  })

  it('dit NON : une mission déjà dans cette BU ne « se transfère » pas — rien écrit, rien journalisé', async () => {
    const { service, missions, journal } = build({ target: { id: BU_A, name: 'BU Data', status: 'active' } })

    await expect(
      service.transfer('ws-1', 'u', MISSION_ID, { targetBusinessUnitId: BU_A, confirm: true }, journal),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(missions.update).not.toHaveBeenCalled()
    expect(journal).not.toHaveBeenCalled()
  })

  it('dit NON : une BU archivée ne reçoit plus de mission', async () => {
    const { service, missions, journal } = build({
      target: { id: BU_B, name: 'Ancienne agence', status: 'archived' },
    })

    await expect(
      service.transfer('ws-1', 'u', MISSION_ID, { targetBusinessUnitId: BU_B, confirm: true }, journal),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(missions.update).not.toHaveBeenCalled()
  })

  it('dit NON : une BU d’un autre espace ou une mission introuvable → 404, jamais « interdit »', async () => {
    const missing = build({ target: 'missing' })
    await expect(
      missing.service.transfer('ws-1', 'u', MISSION_ID, { targetBusinessUnitId: BU_B, confirm: true }, missing.journal),
    ).rejects.toBeInstanceOf(NotFoundException)
    const noMission = build({ mission: null })
    await expect(
      noMission.service.transfer(
        'ws-1',
        'u',
        MISSION_ID,
        { targetBusinessUnitId: BU_B, confirm: true },
        noMission.journal,
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(noMission.missions.update).not.toHaveBeenCalled()
  })

  it('un transfert qu’on ne sait pas journaliser n’a pas eu lieu : la BU d’avant est rétablie', async () => {
    const { service, missions, journal } = build({
      mission: { id: MISSION_ID, workspace_id: 'ws-1', account_id: 'acc-1', business_unit_id: BU_A },
    })
    journal.mockRejectedValue(new Error('audit down'))

    await expect(
      service.transfer('ws-1', 'u', MISSION_ID, { targetBusinessUnitId: BU_B, confirm: true }, journal),
    ).rejects.toThrow('audit down')
    expect(missions.update).toHaveBeenLastCalledWith(
      { id: MISSION_ID, workspace_id: 'ws-1' },
      { business_unit_id: BU_A },
    )
  })

  it('current : nomme la BU de la mission, « héritée » tant que rien n’a été transféré', async () => {
    const { service } = build()
    expect(await service.current('ws-1', MISSION_ID)).toEqual({
      businessUnit: { id: BU_A, name: 'BU Data' },
      inherited: true,
    })
    const own = build({
      mission: { id: MISSION_ID, workspace_id: 'ws-1', account_id: 'acc-1', business_unit_id: BU_B },
    })
    expect(await own.service.current('ws-1', MISSION_ID)).toEqual({
      businessUnit: { id: BU_B, name: 'BU Cloud' },
      inherited: false,
    })
  })

  it('la requête est bornée à l’espace (la mission se cherche avec son workspace_id)', async () => {
    const { service, missions, journal } = build()
    await service.transfer('ws-1', 'u', MISSION_ID, { targetBusinessUnitId: BU_B, confirm: true }, journal)
    expect(missions.findOne).toHaveBeenCalledWith({ where: { id: MISSION_ID, workspace_id: 'ws-1' } })
  })
})

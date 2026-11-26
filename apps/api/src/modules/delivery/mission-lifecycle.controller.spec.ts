import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MissionLifecycleController } from './mission-lifecycle.controller'

const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'a0000000-0000-4000-8000-000000000001'
const C1 = 'c0000000-0000-4000-8000-000000000001'
const AMENDMENT = 'e0000000-0000-4000-8000-000000000001'
const user = { userId: USER } as never

function make(facts: unknown = { status: 'active', endsOn: '2026-12-31', dailyRate: 600, consultantIds: [C1] }) {
  const calls: string[] = []
  const statuses = {
    lifecycleFacts: jest.fn(async () => facts),
    changeMissionStatus: jest.fn(async () => {
      calls.push('status')
      return { from: 'active', to: 'completed', direction: 'forward' }
    }),
  }
  const missionEnd = { setEndReason: jest.fn(async () => void calls.push('reason')) }
  const amendments = {
    propose: jest.fn(async () => {
      calls.push('propose')
      return { id: AMENDMENT }
    }),
    changeStatus: jest.fn(async () => void calls.push('accept')),
  }
  const delivery = { updateMission: jest.fn(async () => void calls.push('update')) }
  const engagement = {
    startEngagement: jest.fn(async () => {
      calls.push('start')
      return [{ consultantId: C1, outcome: 'written' }]
    }),
    release: jest.fn(async () => {
      calls.push('release')
      return [{ consultantId: C1, outcome: 'written' }]
    }),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS })) }
  const controller = new MissionLifecycleController(
    statuses as never,
    missionEnd as never,
    amendments as never,
    delivery as never,
    engagement as never,
    workspaceContext as never,
  )
  return { controller, statuses, missionEnd, amendments, delivery, engagement, calls }
}

describe('MissionLifecycleController.end — terminer', () => {
  it('passe la mission à « completed », pose le motif, ramène l’échéance à la fin réelle, libère les consultants', async () => {
    const { controller, statuses, missionEnd, delivery, engagement, calls } = make()
    const result = await controller.end(user, MISSION, { endedOn: '2026-11-30', reason: 'date_prevue' })
    expect(statuses.changeMissionStatus).toHaveBeenCalledWith(WS, USER, MISSION, { to: 'completed' })
    expect(missionEnd.setEndReason).toHaveBeenCalledWith(WS, MISSION, { reason: 'date_prevue' })
    expect(delivery.updateMission).toHaveBeenCalledWith(USER, MISSION, { endsOn: '2026-11-30' })
    expect(engagement.release).toHaveBeenCalledWith(WS, USER, MISSION, [C1], '2026-11-30')
    expect(calls).toEqual(['status', 'reason', 'update', 'release'])
    expect(result).toMatchObject({ missionId: MISSION, status: 'completed', endsOn: '2026-11-30' })
    expect(result.consultants).toHaveLength(1)
  })

  it('ne retouche pas l’échéance quand elle est déjà la date de fin', async () => {
    const { controller, delivery } = make({
      status: 'active',
      endsOn: '2026-11-30',
      dailyRate: null,
      consultantIds: [],
    })
    await controller.end(user, MISSION, { endedOn: '2026-11-30', reason: 'fin_projet' })
    expect(delivery.updateMission).not.toHaveBeenCalled()
  })

  it('mission introuvable ⇒ 404 ; déjà terminée ⇒ 409 ; rien n’est écrit', async () => {
    const missing = make(null)
    await expect(
      missing.controller.end(user, MISSION, { endedOn: '2026-11-30', reason: 'date_prevue' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    const done = make({ status: 'completed', endsOn: '2026-10-01', dailyRate: null, consultantIds: [C1] })
    await expect(
      done.controller.end(user, MISSION, { endedOn: '2026-11-30', reason: 'date_prevue' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(done.engagement.release).not.toHaveBeenCalled()
    expect(done.statuses.changeMissionStatus).not.toHaveBeenCalled()
  })

  it('si la table des statuts refuse, aucun consultant n’est touché', async () => {
    const { controller, statuses, engagement } = make()
    statuses.changeMissionStatus.mockRejectedValueOnce(new ConflictException('saute une étape'))
    await expect(
      controller.end(user, MISSION, { endedOn: '2026-11-30', reason: 'date_prevue' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(engagement.release).not.toHaveBeenCalled()
  })
})

describe('MissionLifecycleController.extend — prolonger', () => {
  it('avenant end_date_change proposé PUIS accepté (historique), échéance changée, consultant repoussé', async () => {
    const { controller, amendments, delivery, engagement, calls } = make()
    const result = await controller.extend(user, MISSION, {
      newEndsOn: '2027-03-31',
      newDailyRate: 650,
      proof: 'Avenant n°2 signé',
    })
    const proposed = (amendments.propose.mock.calls[0] as unknown[])[3] as Record<string, unknown>
    expect(proposed).toMatchObject({
      eventType: 'end_date_change',
      effectiveFrom: '2027-01-01',
      proof: 'Avenant n°2 signé',
      previousTerm: { endsOn: '2026-12-31', dailyRate: 600 },
      newTerm: { endsOn: '2027-03-31', dailyRate: 650 },
    })
    expect(amendments.changeStatus).toHaveBeenCalledWith(WS, USER, MISSION, AMENDMENT, { to: 'accepted' })
    expect(delivery.updateMission).toHaveBeenCalledWith(USER, MISSION, { endsOn: '2027-03-31', dailyRate: 650 })
    expect(engagement.startEngagement).toHaveBeenCalledWith(WS, USER, [C1], '2027-03-31')
    expect(calls).toEqual(['propose', 'accept', 'update', 'start'])
    expect(result).toMatchObject({ missionId: MISSION, endsOn: '2027-03-31' })
  })

  it('sans nouveau TJM, le TJM n’est pas touché', async () => {
    const { controller, delivery } = make()
    await controller.extend(user, MISSION, { newEndsOn: '2027-03-31', proof: 'mail client' })
    expect(delivery.updateMission).toHaveBeenCalledWith(USER, MISSION, { endsOn: '2027-03-31' })
  })

  it('une nouvelle échéance qui ne dépasse pas l’actuelle n’est pas une prolongation : 400', async () => {
    const { controller, amendments } = make()
    await expect(controller.extend(user, MISSION, { newEndsOn: '2026-12-31', proof: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(amendments.propose).not.toHaveBeenCalled()
  })

  it('une mission terminée ou annulée ne se prolonge pas : 409', async () => {
    const { controller } = make({ status: 'cancelled', endsOn: '2026-12-31', dailyRate: null, consultantIds: [] })
    await expect(controller.extend(user, MISSION, { newEndsOn: '2027-03-31', proof: 'x' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })
})

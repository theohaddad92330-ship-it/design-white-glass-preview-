import { MODULE_METADATA } from '@nestjs/common/constants'
import { CopilotAtsRecordsController } from './copilot-ats-records.controller'
import { CopilotBridgeModule } from './copilot-bridge.module'

// #4065 — Laura liste ce que l'ATS branché tient déjà (instantané `AtsService.snapshot`).
const USER = '11111111-1111-4111-8111-111111111111'

function build(snapshot: unknown) {
  const ats = { snapshot: jest.fn().mockResolvedValue(snapshot) }
  return { controller: new CopilotAtsRecordsController(ats as never), ats }
}

const connected = {
  connected: true,
  provider: 'boondmanager',
  authMode: 'user_token',
  connectedAt: null,
  fromEnvironment: false,
}

describe('CopilotAtsRecordsController — #4065', () => {
  it('relaie la MÊME lecture que la routine hebdo (`AtsService.snapshot`), pour CET utilisateur', async () => {
    const { controller, ats } = build({ status: connected, endingMissions: [], benchedConsultants: [], openNeeds: [] })
    await controller.records({ userId: USER, endingWithinDays: 90 })
    expect(ats.snapshot).toHaveBeenCalledWith(USER, { endingWithinDays: 90 })
  })

  it('ne nomme jamais l’éditeur et ne sort jamais le taux journalier', async () => {
    const { controller } = build({
      status: connected,
      endingMissions: [],
      benchedConsultants: [
        {
          id: 'r1',
          fullName: 'Ana Lima',
          title: 'Dev',
          availableAt: null,
          daysWithoutMission: 12,
          dailyRate: 650,
          skills: ['Java'],
        },
      ],
      openNeeds: [],
    })
    const out = await controller.records({ userId: USER })
    expect(JSON.stringify(out)).not.toMatch(/boond/i)
    expect(out.benchedConsultants[0]).not.toHaveProperty('dailyRate')
    expect(out.connected).toBe(true)
  })

  it('un ATS non branché est DIT (`connected: false`), jamais des listes vides seules', async () => {
    const { controller } = build({
      status: { ...connected, connected: false },
      endingMissions: [],
      benchedConsultants: [],
      openNeeds: [],
    })
    await expect(controller.records({ userId: USER })).resolves.toEqual({
      connected: false,
      endingMissions: [],
      benchedConsultants: [],
      openNeeds: [],
    })
  })

  it('est déclaré par le module du pont (sinon la route n’existe pas en prod)', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CopilotBridgeModule) as unknown[]
    expect(controllers).toContain(CopilotAtsRecordsController)
  })

  // #4065.9 — les fenêtres PASSÉES ne sont demandées à l'ATS que sur demande.
  it('#4065.9 — relaie les fenêtres passées, et ne rend ces listes que si elles ont été demandées', async () => {
    const { controller, ats } = build({
      status: connected,
      endingMissions: [],
      benchedConsultants: [],
      openNeeds: [],
      endedMissions: [{ id: 'm1' }],
      interviewedCandidates: [],
      candidatesRead: true,
    })
    const out = await controller.records({ userId: USER, endedSinceDays: 90, interviewedSinceDays: 90 })
    expect(ats.snapshot).toHaveBeenCalledWith(USER, { endedSinceDays: 90, interviewedSinceDays: 90 })
    expect(out).toMatchObject({ endedMissions: [{ id: 'm1' }], interviewedCandidates: [], candidatesRead: true })
    const plain = build({ status: connected, endingMissions: [], benchedConsultants: [], openNeeds: [] })
    const bare = await plain.controller.records({ userId: USER })
    expect(bare).not.toHaveProperty('endedMissions')
    expect(bare).not.toHaveProperty('candidatesRead')
  })
})

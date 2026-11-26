import { NotFoundException } from '@nestjs/common'
import { MissionFeedbackService } from './mission-feedback.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const OTHER_USER = 'u0000000-0000-4000-8000-000000000002'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'

function makeService(overrides: Record<string, unknown> = {}) {
  const rows =
    (overrides['rows'] as Record<string, unknown>[]) ??
    ([
      {
        id: 'f0000000-0000-4000-8000-000000000001',
        mission_id: MISSION,
        workspace_id: WORKSPACE,
        rail: 'client',
        note: 'Très content du démarrage',
        private: false,
        source: 'human',
        recorded_by: USER,
        created_at: new Date('2026-09-20T09:00:00.000Z'),
      },
      {
        id: 'f0000000-0000-4000-8000-000000000002',
        mission_id: MISSION,
        workspace_id: WORKSPACE,
        rail: 'consultant',
        note: 'Charge un peu élevée ce mois-ci',
        private: true,
        source: 'human',
        recorded_by: OTHER_USER,
        created_at: new Date('2026-09-21T09:00:00.000Z'),
      },
    ] as Record<string, unknown>[])
  const feedback = {
    find: jest.fn(async () => (overrides['feedbackRows'] as Record<string, unknown>[] | undefined) ?? rows),
    create: jest.fn((e: Record<string, unknown>) => ({ id: 'new-feedback', ...e })),
    save: jest.fn(async (e: Record<string, unknown>) => ({
      created_at: new Date('2026-09-23T09:00:00.000Z'),
      ...e,
    })),
  }
  const missions = {
    findOne: jest.fn(async () =>
      overrides['missionMissing'] === true ? null : { id: MISSION, workspace_id: WORKSPACE },
    ),
    find: jest.fn(async () => (overrides['activeMissions'] as Record<string, unknown>[] | undefined) ?? []),
  }

  const service = new MissionFeedbackService(feedback as never, missions as never)
  return { service, feedback, missions }
}

describe('MissionFeedbackService.rails', () => {
  it('refuse une mission hors de l’espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(service.rails(WORKSPACE, MISSION, USER)).rejects.toThrow(NotFoundException)
  })

  it('sépare les deux rails — jamais un tableau plat à re-trier à l’écran (#2412.1)', async () => {
    const { service } = makeService()
    // Lu par OTHER_USER, l'auteur de l'entrée `consultant` privée du fixture :
    // ce test vérifie la séparation des rails, pas la visibilité (couverte
    // juste en dessous).
    const rails = await service.rails(WORKSPACE, MISSION, OTHER_USER)
    expect(rails.client).toHaveLength(1)
    expect(rails.consultant).toHaveLength(1)
    expect(rails.client[0]).toMatchObject({ rail: 'client', note: 'Très content du démarrage' })
  })

  it('masque une entrée privée à tout le monde sauf son auteur (#2412.10)', async () => {
    const { service } = makeService()
    const asAuthor = await service.rails(WORKSPACE, MISSION, OTHER_USER)
    expect(asAuthor.consultant).toHaveLength(1)

    const asSomeoneElse = await service.rails(WORKSPACE, MISSION, USER)
    expect(asSomeoneElse.consultant).toHaveLength(0)
  })
})

describe('MissionFeedbackService.create', () => {
  it('#2408.16 — garde le niveau déclaré, et `null` (non mesuré) quand il n’est pas donné', async () => {
    const { service, feedback } = makeService()
    const low = await service.create(WORKSPACE, USER, MISSION, {
      rail: 'client',
      note: 'Tendu',
      private: false,
      level: 'low',
    })
    expect(feedback.create).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'low' }))
    expect(low.level).toBe('low')
    const silent = await service.create(WORKSPACE, USER, MISSION, { rail: 'client', note: 'RAS', private: false })
    expect(feedback.create).toHaveBeenLastCalledWith(expect.objectContaining({ level: null }))
    expect(silent.level).toBeNull()
  })

  it('crée toujours avec `source: human` — c’est la route d’une saisie humaine', async () => {
    const { service, feedback } = makeService()
    await service.create(WORKSPACE, USER, MISSION, { rail: 'client', note: 'Très satisfait', private: false })
    expect(feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'human',
        recorded_by: USER,
        mission_id: MISSION,
        workspace_id: WORKSPACE,
        rail: 'client',
        note: 'Très satisfait',
        private: false,
      }),
    )
  })

  it('refuse une mission hors de l’espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(
      service.create(WORKSPACE, USER, MISSION, { rail: 'client', note: 'x', private: false }),
    ).rejects.toThrow(NotFoundException)
  })
})

describe('MissionFeedbackService.checkinJ7ForWorkspace (#3413.2 — le point à sept jours)', () => {
  const NOW = new Date('2026-09-30T09:00:00.000Z')
  const started = (daysAgo: number): string => {
    const d = new Date(NOW)
    d.setUTCDate(d.getUTCDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }

  it('une mission démarrée il y a six jours n’entre pas encore dans la fenêtre', async () => {
    const { service } = makeService({
      activeMissions: [{ id: 'm1', label: 'Mission A', started_on: started(6) }],
    })
    expect(await service.checkinJ7ForWorkspace(WORKSPACE, NOW)).toEqual([])
  })

  it('une mission démarrée il y a vingt-deux jours est déjà hors fenêtre', async () => {
    const { service } = makeService({
      activeMissions: [{ id: 'm1', label: 'Mission A', started_on: started(22) }],
    })
    expect(await service.checkinJ7ForWorkspace(WORKSPACE, NOW)).toEqual([])
  })

  it('une mission à sept jours, sans aucune entrée de feedback, est en attente', async () => {
    const { service } = makeService({
      activeMissions: [{ id: 'm1', label: 'Mission A', started_on: started(7) }],
      feedbackRows: [],
    })
    const pending = await service.checkinJ7ForWorkspace(WORKSPACE, NOW)
    expect(pending).toEqual([{ mission_id: 'm1', label: 'Mission A', started_on: started(7) }])
  })

  it('une entrée de feedback DÉJÀ déposée — client OU consultant — referme le point', async () => {
    const { service } = makeService({
      activeMissions: [{ id: 'm1', label: 'Mission A', started_on: started(10) }],
      feedbackRows: [{ mission_id: 'm1', rail: 'consultant' }],
    })
    expect(await service.checkinJ7ForWorkspace(WORKSPACE, NOW)).toEqual([])
  })

  it('sans date de démarrage connue, une mission n’entre jamais dans la fenêtre', async () => {
    const { service } = makeService({
      activeMissions: [{ id: 'm1', label: 'Mission sans date', started_on: null }],
      feedbackRows: [],
    })
    expect(await service.checkinJ7ForWorkspace(WORKSPACE, NOW)).toEqual([])
  })

  it('plusieurs missions en attente sortent triées, la plus ancienne d’abord', async () => {
    const { service } = makeService({
      activeMissions: [
        { id: 'm1', label: 'Mission récente', started_on: started(8) },
        { id: 'm2', label: 'Mission ancienne', started_on: started(15) },
      ],
      feedbackRows: [],
    })
    const pending = await service.checkinJ7ForWorkspace(WORKSPACE, NOW)
    expect(pending.map(row => row.mission_id)).toEqual(['m2', 'm1'])
  })
})

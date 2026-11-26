import { ConsultantEngagementService } from './consultant-engagement.service'

const WS = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-000000000002'
const C1 = '00000000-0000-4000-8000-0000000000c1'
const MISSION = '00000000-0000-4000-8000-0000000000a1'

function entity(over: Record<string, unknown> = {}) {
  return {
    id: C1,
    workspace_id: WS,
    availability: 'inconnu',
    available_from: null,
    archived_at: null,
    archived_reason: null,
    ...over,
  }
}

function make(opts: { entity?: Record<string, unknown> | null; sources?: Record<string, string>; others?: unknown[] }) {
  const found = opts.entity === null ? null : entity(opts.entity)
  const repo = {
    findOne: jest.fn(async () => found),
    save: jest.fn(async (e: unknown) => e),
    manager: { query: jest.fn(async () => opts.others ?? []) },
  }
  const provenance = {
    currentSources: jest.fn(async () => opts.sources ?? {}),
    currentSourcesDetailed: jest.fn(async () =>
      Object.fromEntries(
        Object.entries(opts.sources ?? {}).map(([k, v]) => [k, { source: v, observedAt: '2026-09-02T10:00:00.000Z' }]),
      ),
    ),
    commit: jest.fn(async (_params: unknown) => undefined),
  }
  const service = new ConsultantEngagementService(repo as never, provenance as never)
  return { service, repo, provenance, found }
}

describe('ConsultantEngagementService.startEngagement — le consultant suit la mission qui démarre', () => {
  it('pose « en mission » et la disponibilité au lendemain de la fin, tracé en provenance pipeline', async () => {
    const { service, repo, provenance } = make({})
    const [result] = await service.startEngagement(WS, USER, [C1], '2027-03-31')
    expect(result).toMatchObject({
      consultantId: C1,
      outcome: 'written',
      availability: 'en_mission',
      availableFrom: '2027-04-01',
    })
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ availability: 'en_mission', available_from: '2027-04-01' }),
    )
    const commit = provenance.commit.mock.calls[0]?.[0] as { source: string; changes: { field: string }[] }
    expect(commit.source).toBe('pipeline')
    expect(commit.changes.map(c => c.field)).toEqual(['availability', 'available_from'])
  })

  it('une disponibilité SAISIE À LA MAIN n’est pas écrasée : l’humain gagne, l’écart est rendu', async () => {
    const { service, repo } = make({
      entity: { availability: 'immediate' },
      sources: { availability: 'human' },
    })
    const [result] = await service.startEngagement(WS, USER, [C1], '2027-03-31')
    expect(result?.outcome).toBe('kept_human')
    expect(result?.availability).toBe('immediate')
    // la date, elle, n'était pas saisie à la main : elle avance, mais pas la disponibilité
    const saved = repo.save.mock.calls[0]?.[0] as { availability: string } | undefined
    expect(saved?.availability ?? 'immediate').toBe('immediate')
  })

  it('une fiche archivée est désarchivée (un consultant en mission n’est jamais archivé), et c’est tracé', async () => {
    const { service, repo, provenance } = make({
      entity: { archived_at: new Date('2026-01-01'), archived_reason: 'parti' },
    })
    const [result] = await service.startEngagement(WS, USER, [C1], null)
    expect(result?.unarchived).toBe(true)
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ archived_at: null, archived_reason: null }))
    const fields = (provenance.commit.mock.calls[0]?.[0] as { changes: { field: string }[] }).changes.map(c => c.field)
    expect(fields).toContain('archived_at')
  })

  it('une fiche d’un autre espace est « not_found », jamais écrite', async () => {
    const { service, repo } = make({ entity: null })
    const [result] = await service.startEngagement(WS, USER, [C1], null)
    expect(result?.outcome).toBe('not_found')
    expect(repo.save).not.toHaveBeenCalled()
  })
})

describe('ConsultantEngagementService.release — le consultant redevient disponible', () => {
  it('fin passée ⇒ immediate, available_from = lendemain', async () => {
    const { service, repo } = make({ entity: { availability: 'en_mission' } })
    const [result] = await service.release(WS, USER, MISSION, [C1], '2026-10-01', '2026-10-14')
    expect(result).toMatchObject({ outcome: 'written', availability: 'immediate', availableFrom: '2026-10-02' })
    expect(repo.save).toHaveBeenCalled()
  })

  it('fin future lointaine ⇒ sous_3_mois', async () => {
    const { service } = make({ entity: { availability: 'en_mission' } })
    const [result] = await service.release(WS, USER, MISSION, [C1], '2027-03-31', '2026-10-14')
    expect(result?.availability).toBe('sous_3_mois')
  })

  it('un consultant encore affecté à UNE AUTRE mission en cours n’est pas libéré', async () => {
    const { service, repo } = make({
      entity: { availability: 'en_mission' },
      others: [{ consultant_id: C1, mission_id: 'autre', label: 'Autre', ends_on: '2027-01-01' }],
    })
    const [result] = await service.release(WS, USER, MISSION, [C1], '2026-10-01', '2026-10-14')
    expect(result?.outcome).toBe('other_mission')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('une disponibilité saisie à la main n’est pas écrasée à la fin non plus', async () => {
    const { service } = make({ entity: { availability: 'sous_1_mois' }, sources: { availability: 'human' } })
    const [result] = await service.release(WS, USER, MISSION, [C1], '2026-10-01', '2026-10-14')
    expect(result?.outcome).toBe('kept_human')
  })
})

describe('ConsultantEngagementService.conflict / align', () => {
  const active = [{ consultant_id: C1, mission_id: MISSION, label: 'Refonte SI', ends_on: '2027-03-31' }]

  it('nomme l’écart : fiche saisie à la main ≠ mission en cours', async () => {
    const { service } = make({
      entity: { availability: 'immediate' },
      sources: { availability: 'human' },
      others: active,
    })
    const conflict = await service.conflict(WS, C1, '2026-10-14')
    expect(conflict).toMatchObject({
      missionId: MISSION,
      missionLabel: 'Refonte SI',
      endsOn: '2027-03-31',
      ficheAvailability: 'immediate',
      ficheEnteredAt: '2026-09-02T10:00:00.000Z',
    })
  })

  it('aucun écart ⇒ null (on n’affiche pas ce qu’on n’a pas)', async () => {
    expect(
      await make({ entity: { availability: 'en_mission' }, others: active }).service.conflict(WS, C1, '2026-10-14'),
    ).toBeNull()
    expect(
      await make({ entity: { availability: 'immediate' }, others: [] }).service.conflict(WS, C1, '2026-10-14'),
    ).toBeNull()
    // saisie machine : la mission la remplace, ce n'est pas un conflit
    expect(
      await make({
        entity: { availability: 'immediate' },
        sources: { availability: 'pipeline' },
        others: active,
      }).service.conflict(WS, C1, '2026-10-14'),
    ).toBeNull()
  })

  it('« Aligner » est une écriture HUMAINE : elle passe là où la saisie manuelle bloquait', async () => {
    const { service, repo, provenance } = make({
      entity: { availability: 'immediate' },
      sources: { availability: 'human' },
      others: active,
    })
    const result = await service.align(WS, USER, C1, '2026-10-14')
    expect(result).toMatchObject({ outcome: 'written', availability: 'en_mission', availableFrom: '2027-04-01' })
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ availability: 'en_mission' }))
    expect((provenance.commit.mock.calls[0]?.[0] as { source: string }).source).toBe('human')
  })
})

import { CommercialTransitionsService } from './commercial-transitions.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const ACTOR = 'u0000000-0000-4000-8000-000000000001'
const SUBJECT = 'n0000000-0000-4000-8000-000000000001'

function makeService() {
  const rows: Record<string, unknown>[] = []
  const transitions = {
    create: jest.fn((entity: Record<string, unknown>) => entity),
    save: jest.fn(async (entity: Record<string, unknown>) => {
      const saved = { ...entity, id: `t-${rows.length}`, occurred_at: new Date('2026-09-25T09:00:00.000Z') }
      rows.push(saved)
      return saved
    }),
    createQueryBuilder: jest.fn(() => {
      const params: Record<string, unknown> = {}
      const builder = {
        where: jest.fn((_sql: string, p: Record<string, unknown> = {}) => {
          Object.assign(params, p)
          return builder
        }),
        andWhere: jest.fn((_sql: string, p: Record<string, unknown> = {}) => {
          Object.assign(params, p)
          return builder
        }),
        orderBy: jest.fn(() => builder),
        getMany: jest.fn(async () =>
          rows.filter(
            row =>
              row['subject_type'] === params['subjectType'] &&
              row['subject_id'] === params['subjectId'] &&
              row['workspace_id'] === params['workspaceId'],
          ),
        ),
      }
      return builder
    }),
  }
  const service = new CommercialTransitionsService(transitions as never)
  return { service, transitions, rows }
}

// #2320.23 (épopée #2967) — « Historique de transition complet :
// état/auteur/date/preuve/action suivante ». Journal unique, APPEND-ONLY,
// pour toute la chaîne commerciale — pas un quatrième historique spécialisé
// par objet (GA-26).
describe('CommercialTransitionsService.record', () => {
  it('écrit état, auteur, date, preuve et action suivante ensemble', async () => {
    const { service, transitions } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: 'to_qualify',
      toState: 'qualified',
      actorId: ACTOR,
      proof: 'Budget et décideur confirmés par mail',
      nextAction: 'Lancer le matching',
    })
    expect(transitions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE,
        subject_type: 'need',
        subject_id: SUBJECT,
        from_state: 'to_qualify',
        to_state: 'qualified',
        actor_id: ACTOR,
        proof: 'Budget et décideur confirmés par mail',
        next_action: 'Lancer le matching',
      }),
    )
  })

  it('accepte `fromState: null` pour la toute première ligne d’un sujet', async () => {
    const { service, transitions } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'shortlist',
      subjectId: SUBJECT,
      fromState: null,
      toState: 'draft',
      actorId: ACTOR,
      proof: null,
    })
    expect(transitions.create).toHaveBeenCalledWith(expect.objectContaining({ from_state: null, next_action: null }))
  })

  it('accepte un acteur `null` — une transition dont l’auteur n’est pas un utilisateur, jamais deviné', async () => {
    const { service, transitions } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'submission',
      subjectId: SUBJECT,
      fromState: 'shortlisted',
      toState: 'submitted',
      actorId: null,
      proof: null,
    })
    expect(transitions.create).toHaveBeenCalledWith(expect.objectContaining({ actor_id: null }))
  })
})

describe('CommercialTransitionsService.history', () => {
  it('rend les transitions d’UN sujet, dans l’ordre chronologique', async () => {
    const { service } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: 'to_qualify',
      toState: 'qualified',
      actorId: ACTOR,
      proof: null,
    })
    const history = await service.history('need', SUBJECT, WORKSPACE)
    expect(history).toEqual([
      expect.objectContaining({
        subjectType: 'need',
        subjectId: SUBJECT,
        fromState: 'to_qualify',
        toState: 'qualified',
        actorId: ACTOR,
        occurredAt: '2026-09-25T09:00:00.000Z',
      }),
    ])
  })

  it('ne mélange pas les sujets — filtre sur subject_type ET subject_id', async () => {
    const { service } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: null,
      toState: 'to_qualify',
      actorId: ACTOR,
      proof: null,
    })
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'mission',
      subjectId: SUBJECT,
      fromState: null,
      toState: 'onboarding',
      actorId: ACTOR,
      proof: null,
    })
    const needHistory = await service.history('need', SUBJECT, WORKSPACE)
    expect(needHistory).toHaveLength(1)
    expect(needHistory[0]?.subjectType).toBe('need')
  })
})

// Épopée #2967 (lot V39) — la SOURCE de chaque ligne (geste, Laura validée,
// correction humaine) et le stade CANONIQUE lu dans la machine unique.
describe('CommercialTransitionsService — source et stade canonique (#2967)', () => {
  it('un appelant qui ne dit rien écrit `human` — jamais Laura par défaut', async () => {
    const { service, transitions } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: 'qualified',
      toState: 'to_match',
      actorId: ACTOR,
      proof: null,
    })
    expect(transitions.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'human' }))
  })

  it('une proposition de Laura validée garde l’humain comme auteur et `laura` comme source', async () => {
    const { service, transitions } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: 'qualified',
      toState: 'to_match',
      actorId: ACTOR,
      proof: null,
      source: 'laura',
    })
    expect(transitions.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'laura', actor_id: ACTOR }))
  })

  it('l’historique rend la source et le stade canonique de chaque ligne (#2320.30)', async () => {
    const { service } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: 'matching',
      toState: 'shortlist_ready',
      actorId: ACTOR,
      proof: null,
      source: 'human_correction',
    })
    const [entry] = await service.history('need', SUBJECT, WORKSPACE)
    expect(entry.source).toBe('human_correction')
    expect(entry.toStage).toBe('shortlist')
  })

  it('un statut non rattaché rend un stade `null`, jamais deviné', async () => {
    const { service } = makeService()
    await service.record({
      workspaceId: WORKSPACE,
      subjectType: 'need',
      subjectId: SUBJECT,
      fromState: null,
      toState: 'statut_inconnu',
      actorId: ACTOR,
      proof: null,
    })
    const [entry] = await service.history('need', SUBJECT, WORKSPACE)
    expect(entry.toStage).toBeNull()
  })
})

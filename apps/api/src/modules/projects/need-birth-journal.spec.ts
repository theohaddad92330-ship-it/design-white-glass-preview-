import { ProjectPipelineService } from './project-pipeline.service'

/**
 * #2320.16 (épopée #2967) — Opportunité→Besoin confirmé rejoint le journal
 * APPEND-ONLY sous le sixième sujet `'signal'` (migration `1796340800001`).
 *
 * Distinct du mouvement d'ÉTAPE `qualified → confirmed` d'une opportunité
 * déjà qualifiée (sujet `'opportunity'`, #2320.7/.23) : ce point est la
 * NAISSANCE d'un besoin confirmé (`saveNeed`, statut initial `to_qualify`)
 * depuis une opportunité encore informelle — `saveNeed` créait déjà la ligne
 * sans jamais écrire la toute première entrée du journal `'need'`, alors que
 * `changeNeedStatus` (les statuts SUIVANTS) l'écrit depuis le 25/09.
 */
describe('ProjectPipelineService — Opportunité→Besoin confirmé rejoint le journal (#2320.16)', () => {
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'
  const PROJECT = '22222222-2222-4222-8222-222222222222'

  function build(options: { accountRows?: unknown[]; projectRows?: unknown[]; record?: jest.Mock } = {}) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(options.accountRows ?? [{ id: ACCOUNT }])
      .mockResolvedValueOnce(options.projectRows ?? [{ account_id: ACCOUNT }])
    const needs = {
      manager: { query },
      count: jest.fn().mockResolvedValue(0),
      create: (row: Record<string, unknown>) => row,
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: 'need-1',
        created_at: new Date(),
        updated_at: new Date(),
      })),
    }
    const record = options.record ?? jest.fn().mockResolvedValue(undefined)
    const service = new ProjectPipelineService(
      { manager: { query } } as never,
      needs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record } as never,
    )
    return { service, record }
  }

  it('journalise la naissance sous `need`, `proof` cite l’opportunité d’origine', async () => {
    const { service, record } = build()

    await service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java', project_id: PROJECT }, 'u-1')

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w-1',
        subjectType: 'need',
        subjectId: 'need-1',
        fromState: null,
        toState: 'to_qualify',
        actorId: 'u-1',
        proof: `opportunity:${PROJECT}`,
      }),
    )
  })

  it('sans projet, `proof` est `null` — jamais une opportunité inventée', async () => {
    const { service, record } = build()

    await service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java' }, 'u-1')

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ proof: null }))
  })

  it('un besoin proposé par le modèle (non confirmé) journalise son propre statut `detected`', async () => {
    const { service, record } = build()

    await service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java', provenance: 'model' }, 'u-1')

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ toState: 'detected' }))
  })

  it('best-effort : une erreur de journal ne fait pas échouer la création', async () => {
    const { service } = build({ record: jest.fn().mockRejectedValue(new Error('db down')) })

    await expect(
      service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java', project_id: PROJECT }, 'u-1'),
    ).resolves.toMatchObject({ id: 'need-1' })
  })

  it('sans acteur identifié, `actorId` est `null` — jamais deviné', async () => {
    const { service, record } = build()

    await service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java' })

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }))
  })
})

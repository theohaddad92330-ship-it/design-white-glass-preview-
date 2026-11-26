import { ProjectsController } from './projects.controller'

/**
 * Les cases cochées du panneau d'effets font quelque chose.
 *
 * Le défaut, trouvé le 20/08 en croisant le PDF 5 avec le dépôt : la case
 * « créer la mission » était PRÉ-COCHÉE depuis le premier jour sur un projet
 * gagné, et le client envoyait `PATCH /projects/:id/stage` sans jamais
 * transmettre la liste. Personne ne s'en apercevait, parce que « aucune mission
 * sur ce projet » a exactement l'air d'un projet dont personne n'a créé la
 * mission.
 *
 * Tout était vert des deux côtés : le panneau a ses tests, le service de
 * mission a les siens, et rien ne testait le trajet entre les deux — la même
 * cause que les trois défauts de la recette du PDF 3.
 */
describe('ProjectsController — ce que le déplacement d’étape exécute', () => {
  const project = {
    id: 'p-1',
    account_id: 'acc-1',
    label: 'Refonte du SI paiement',
    stage: 'won',
    loss_reason: null,
  }

  const build = (needs: Array<{ id: string }> = []) => {
    // Le contrôleur relit la ligne ÉCRITE, pas le corps de la requête : c'est
    // elle qui porte le motif de perte, et c'est ce motif qui sert à écarter le
    // compte.
    const projects = {
      getRow: jest.fn().mockResolvedValue({ ...project, stage: 'negotiation' }),
      updateStage: jest
        .fn()
        .mockImplementation((_id: string, _ws: string, stage: string, lossReason: string | null) =>
          Promise.resolve({ ...project, stage, loss_reason: lossReason }),
        ),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const delivery = { create: jest.fn().mockResolvedValue({ id: 'm-1' }) }
    const accountGate = { decide: jest.fn().mockResolvedValue({ id: 'acc-1' }) }
    // Les RÔLES du projet — c'est ce qui décide si la mission créée peut porter
    // l'identité d'un besoin (`missions.need_id`, 31/08/2026).
    const pipeline = { listNeeds: jest.fn().mockResolvedValue(needs) }
    const controller = new ProjectsController(
      projects as never,
      pipeline as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      // Propositions de besoins — hors périmètre de cette suite.
      {} as never,
      // Documents, étapes cochables et verdict du besoin — hors périmètre de
      // cette suite.
      {} as never,
      {} as never,
      {} as never,
      // Documents de l'opportunité (#2171.24) — hors périmètre de cette suite.
      {} as never,
      // Synthèse d'opportunité (#2171.27) — hors périmètre de cette suite.
      {} as never,
      // Le stockage de fichiers (31/08/2026) — hors périmètre de cette suite.
      {} as never,
      // Le verdict et les contradictions du besoin — hors périmètre de cette suite.
      {} as never,
      // La marque de l'espace (marque blanche, 01/09/2026) — hors périmètre ici.
      {} as never,
      {} as never,
      undefined,
      delivery as never,
      accountGate as never,
    )
    return { controller, delivery, accountGate, pipeline }
  }

  const user = { userId: 'u-1' } as never

  it('crée RÉELLEMENT la mission quand la case est cochée', async () => {
    const { controller, delivery } = build()

    const result = await controller.updateStage(
      'p-1',
      { stage: 'won', accepted_actions: ['create_mission'] } as never,
      user,
    )

    expect(delivery.create).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ accountId: 'acc-1', opportunityId: 'p-1', label: 'Refonte du SI paiement' }),
    )
    expect(result.actions.performed).toEqual(['create_mission'])
  })

  it('#4195 — crée la mission SANS case : la signature l’exécute toujours', async () => {
    const { controller, delivery } = build()

    const result = await controller.updateStage('p-1', { stage: 'won', accepted_actions: [] } as never, user)

    expect(delivery.create).toHaveBeenCalledTimes(1)
    expect(result.actions.performed).toEqual(['create_mission'])
  })

  it('#4195 — hors signature, rien n’est créé', async () => {
    const { controller, delivery } = build()

    await controller.updateStage('p-1', { stage: 'negotiation', accepted_actions: ['create_mission'] } as never, user)

    expect(delivery.create).not.toHaveBeenCalled()
  })

  it('n’invente ni TJM ni dates sur la mission créée', async () => {
    // Le projet ne les porte pas. Les inventer produirait une marge fausse et
    // une fenêtre de renouvellement qui alerterait au mauvais moment.
    const { controller, delivery } = build()

    await controller.updateStage('p-1', { stage: 'won', accepted_actions: ['create_mission'] } as never, user)

    const payload = delivery.create.mock.calls[0][1]
    expect(payload.dailyRate).toBeUndefined()
    expect(payload.endsOn).toBeUndefined()
    expect(payload.contractKind).toBe('inconnu')
  })

  /**
   * LE RÔLE D'ORIGINE DE LA MISSION (31/08/2026, `missions.need_id`).
   *
   * Ce que ces trois tests tiennent : le lien se pose quand il est CERTAIN, et
   * il ne se DEVINE jamais. Un lien inventé se relit six mois plus tard comme
   * un fait — c'est précisément la faute que « jamais de donnée fictive »
   * interdit, et elle serait invisible : « cette mission vient du rôle X » a
   * exactement l'air d'une information qu'on aurait saisie.
   */
  it('lie la mission au besoin quand l’affaire n’en porte QU’UN', async () => {
    const { controller, delivery } = build([{ id: 'need-1' }])

    await controller.updateStage('p-1', { stage: 'won', accepted_actions: ['create_mission'] } as never, user)

    expect(delivery.create).toHaveBeenCalledWith('u-1', expect.objectContaining({ needId: 'need-1' }))
  })

  /**
   * #2191.11 / #2191.13 — LA DATE DE DÉBUT ET LE TJM CIBLE DU BESOIN, quand il
   * est CERTAIN (même garde que `needId` juste au-dessus).
   *
   * Le test « n'invente ni TJM ni dates » (au-dessus) reste vrai : c'est le
   * PROJET qui ne les porte pas. Le BESOIN, lui, les porte quand l'affaire n'en
   * a qu'un — et jusqu'ici ce besoin était lu pour son `id` seul, le reste de
   * la ligne jeté. Une donnée déjà connue et retapée à la main est le défaut
   * que la reprise existe pour éviter.
   */
  it('reprend la date de début et le TJM cible du besoin unique et certain', async () => {
    const { controller, delivery } = build([{ id: 'need-1', start_on: '2026-10-01', target_tjm_cents: 65000 } as never])

    await controller.updateStage('p-1', { stage: 'won', accepted_actions: ['create_mission'] } as never, user)

    expect(delivery.create).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ needId: 'need-1', startedOn: '2026-10-01', dailyRate: 650 }),
    )
  })

  it('un besoin sans date de début ni TJM cible ne reprend rien de plus que son id', async () => {
    const { controller, delivery } = build([{ id: 'need-1' } as never])

    await controller.updateStage('p-1', { stage: 'won', accepted_actions: ['create_mission'] } as never, user)

    const payload = delivery.create.mock.calls[0][1]
    expect(payload.startedOn).toBeUndefined()
    expect(payload.dailyRate).toBeUndefined()
  })

  it('ne DEVINE aucun rôle quand l’affaire en porte plusieurs', async () => {
    // Prendre le premier de la liste attribuerait à un rôle précis une mission
    // dont personne n'a dit qu'elle venait de lui.
    const { controller, delivery } = build([{ id: 'need-1' }, { id: 'need-2' }])

    await controller.updateStage('p-1', { stage: 'won', accepted_actions: ['create_mission'] } as never, user)

    const payload = delivery.create.mock.calls[0][1]
    expect(payload.needId).toBeUndefined()
  })

  it('une lecture des besoins en échec ne défait pas la création de la mission', async () => {
    // La mission EST le geste demandé ; le lien n'en est qu'une décoration
    // utile. Sans lui, la fiche du besoin dit « non mesuré », ce qui est vrai.
    const { controller, delivery, pipeline } = build()
    pipeline.listNeeds.mockRejectedValue(new Error('lecture indisponible'))

    const result = await controller.updateStage(
      'p-1',
      { stage: 'won', accepted_actions: ['create_mission'] } as never,
      user,
    )

    expect(result.actions.performed).toEqual(['create_mission'])
    expect(delivery.create.mock.calls[0][1].needId).toBeUndefined()
  })

  it('rend en « à faire » ce que le serveur ne sait pas exécuter', async () => {
    const { controller } = build()

    const result = await controller.updateStage(
      'p-1',
      { stage: 'won', accepted_actions: ['tell_consultant', 'ask_purchase_order'] } as never,
      user,
    )

    // Ni exécutées, ni jetées : affichées comme ce qu'elles sont (clés retirées du catalogue, #4339.2).
    expect(result.actions.pending).toEqual(['tell_consultant', 'ask_purchase_order'])
    // #4195 — la signature crée la mission d'elle-même ; les rappels, eux, restent rappels.
    expect(result.actions.performed).toEqual(['create_mission'])
  })

  it('écarte le compte avec le motif de la PERTE, sans en redemander un', async () => {
    const { controller, accountGate } = build()

    await controller.updateStage(
      'p-1',
      { stage: 'lost', loss_reason: 'Budget gelé', accepted_actions: ['park_account'] } as never,
      user,
    )

    expect(accountGate.decide).toHaveBeenCalledWith('w-1', 'acc-1', 'parked', 'Budget gelé')
  })

  it('une action qui échoue ne défait pas le déplacement, elle se dit', async () => {
    const { controller, delivery } = build()
    delivery.create.mockRejectedValue(new Error('boom'))

    const result = await controller.updateStage(
      'p-1',
      { stage: 'won', accepted_actions: ['create_mission'] } as never,
      user,
    )

    expect(result.project).toMatchObject({ id: 'p-1', stage: 'won' })
    expect(result.actions.performed).toEqual([])
    expect(result.actions.failed).toEqual([{ key: 'create_mission', reason: 'failed' }])
  })
})

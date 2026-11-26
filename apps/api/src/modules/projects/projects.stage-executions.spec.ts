import { ProjectsController } from './projects.controller'

/**
 * #4339.2 — chaque proposition cochée du panneau « Changer de colonne » produit un résultat VISIBLE, en appelant le
 * service qui EXISTE déjà (tâches, messagerie, matching du vivier). Chaque test dit NON si le service n'est pas appelé :
 * une case qui ne fait rien n'est pas honnête.
 */
describe('ProjectsController — les propositions cochées appellent leur service (#4339.2)', () => {
  const NOW = new Date('2026-10-19T09:00:00.000Z')
  const project = { id: 'p-1', account_id: 'acc-1', label: 'Refonte du SI paiement', stage: 'profiles_submitted' }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })
  afterEach(() => jest.useRealTimers())

  const build = (
    over: {
      needs?: Array<{ id: string }>
      contacts?: Array<{ contact_id: string; email: string | null }>
      noMatching?: boolean
    } = {},
  ) => {
    const projects = {
      getRow: jest.fn().mockResolvedValue({ ...project, stage: 'qualified' }),
      updateStage: jest.fn().mockResolvedValue(project),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: 'sales' }),
    }
    const pipeline = {
      listNeeds: jest.fn().mockResolvedValue(over.needs ?? [{ id: 'need-1' }]),
      listContacts: jest.fn().mockResolvedValue(over.contacts ?? [{ contact_id: 'c-1', email: 'dsi@client.fr' }]),
    }
    const tasks = { create: jest.fn().mockResolvedValue({ id: 'task-1' }) }
    const matching = { matchNeed: jest.fn().mockResolvedValue({ id: 'run-1' }) }
    const mailbox = {
      createDraft: jest
        .fn()
        .mockResolvedValue({ draftId: 'd-1', messageId: 'm-1', threadId: 't-1', webUrl: 'https://mail.example/d-1' }),
    }
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
      undefined, // gates
      undefined, // delivery
      undefined, // accountGate
      tasks as never,
      undefined, // submissions
      undefined, // needCompileText
      undefined, // accountStrategy5P
      undefined, // dealProbability
      undefined, // sharedBase
      over.noMatching ? undefined : (matching as never),
      mailbox as never,
    )
    return { controller, tasks, matching, mailbox, pipeline }
  }

  const user = { userId: 'u-1' } as never
  const move = (controller: ProjectsController, accepted: string[]) =>
    controller.updateStage('p-1', { stage: 'profiles_submitted', accepted_actions: accepted } as never, user)

  it('« Caler le créneau d’entretien » crée une tâche datée J+2 sur l’affaire', async () => {
    const { controller, tasks } = build()
    const result = await move(controller, ['schedule_interview'])

    expect(tasks.create).toHaveBeenCalledTimes(1)
    expect(tasks.create).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        title: 'Caler le créneau d’entretien avec le client',
        dueOn: '2026-10-21',
        projectId: 'p-1',
        accountId: 'acc-1',
      }),
    )
    expect(result.actions.performed).toEqual(['schedule_interview'])
    expect(result.actions.created).toEqual([{ key: 'schedule_interview', kind: 'task', id: 'task-1', href: null }])
  })

  it('« Vérifier que le profil est bien parti » crée une tâche datée J+1', async () => {
    const { controller, tasks } = build()
    await move(controller, ['verify_profile_sent'])
    expect(tasks.create).toHaveBeenCalledWith('u-1', expect.objectContaining({ dueOn: '2026-10-20' }))
  })

  it('« Préparer le mail de suite » DÉPOSE un brouillon au contact de l’affaire — rien n’est envoyé', async () => {
    const { controller, mailbox } = build()
    const result = await move(controller, ['prepare_follow_up_mail'])

    expect(mailbox.createDraft).toHaveBeenCalledTimes(1)
    expect(mailbox.createDraft).toHaveBeenCalledWith('u-1', expect.objectContaining({ to: 'dsi@client.fr' }))
    expect(result.actions.created).toEqual([
      { key: 'prepare_follow_up_mail', kind: 'draft', id: 'd-1', href: 'https://mail.example/d-1' },
    ])
  })

  it('sans contact portant une adresse, aucun brouillon n’est inventé : l’échec se DIT', async () => {
    const { controller, mailbox } = build({ contacts: [{ contact_id: 'c-1', email: null }] })
    const result = await move(controller, ['prepare_follow_up_mail'])

    expect(mailbox.createDraft).not.toHaveBeenCalled()
    expect(result.actions.failed).toEqual([{ key: 'prepare_follow_up_mail', reason: 'no_recipient' }])
    expect(result.actions.performed).toEqual([])
  })

  it('« Chercher d’autres profils dans ton vivier » lance le matching de chaque besoin, avec le lien vers son résultat', async () => {
    const { controller, matching } = build({ needs: [{ id: 'need-1' }, { id: 'need-2' }] })
    const result = await move(controller, ['search_more_profiles'])

    expect(matching.matchNeed).toHaveBeenCalledTimes(2)
    expect(matching.matchNeed).toHaveBeenCalledWith('need-1', 'w-1', 'u-1', expect.anything())
    expect(result.actions.created).toEqual([
      { key: 'search_more_profiles', kind: 'matching', id: 'need-1', href: null },
    ])
  })

  it('un matching sans besoin sur l’affaire ne tourne pas à vide : échec nommé', async () => {
    const { controller, matching } = build({ needs: [] })
    const result = await move(controller, ['search_more_profiles'])
    expect(matching.matchNeed).not.toHaveBeenCalled()
    expect(result.actions.failed).toEqual([{ key: 'search_more_profiles', reason: 'no_need' }])
  })

  it('un service absent se dit « indisponible » au lieu de réussir à vide', async () => {
    const { controller } = build({ noMatching: true })
    const result = await move(controller, ['search_more_profiles'])
    expect(result.actions.failed).toEqual([{ key: 'search_more_profiles', reason: 'unavailable' }])
  })

  it('une proposition qui échoue ne prive pas les suivantes', async () => {
    const { controller, tasks } = build({ contacts: [] })
    const result = await move(controller, ['prepare_follow_up_mail', 'schedule_interview'])
    expect(tasks.create).toHaveBeenCalledTimes(1)
    expect(result.actions.performed).toEqual(['schedule_interview'])
    expect(result.actions.failed).toHaveLength(1)
  })

  it('une clé inconnue ressort en « à faire », elle n’est pas exécutée', async () => {
    const { controller, tasks } = build()
    const result = await move(controller, ['clef_du_futur'])
    expect(tasks.create).not.toHaveBeenCalled()
    expect(result.actions.pending).toEqual(['clef_du_futur'])
  })
})

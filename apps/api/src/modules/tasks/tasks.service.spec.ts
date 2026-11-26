import { NotFoundException } from '@nestjs/common'
import { taskStillOpenSql } from '@bellum/contracts'
import { TasksService } from './tasks.service'

/** Le prédicat attendu vient du CONTRAT, il n'est pas retapé ici : un test qui
 *  recopie la règle valide sa propre copie. */
const STILL_OPEN = taskStillOpenSql('t')

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const OTHER_USER = 'u0000000-0000-4000-8000-000000000002'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const TASK = 't0000000-0000-4000-8000-000000000001'

const ROW = {
  id: TASK,
  title: 'Rappeler le DSI',
  details: null,
  status: 'todo',
  priority: 'normal',
  due_on: '2026-08-20',
  source: 'manual',
  expected_result: null,
  related_action_run_id: null,
  source_label_key: null,
  owner_id: USER,
  owner_first: 'Louis',
  owner_last: 'Schlegel',
  owner_email: 'louis@esn.fr',
  created_by: USER,
  created_by_first: 'Louis',
  created_by_last: 'Schlegel',
  created_by_email: 'louis@esn.fr',
  account_id: ACCOUNT,
  account_name: 'ACME',
  contact_id: null,
  contact_name: null,
  project_id: null,
  project_label: null,
  completed_at: null,
  completed_by: null,
  completed_by_first: null,
  completed_by_last: null,
  completed_by_email: null,
  result_note: null,
  created_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-08-01T09:00:00.000Z',
}

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('FROM accounts WHERE id')) return overrides['accountExists'] === false ? [] : [{ id: ACCOUNT }]
      if (sql.includes('FROM contacts c JOIN accounts'))
        return overrides['contactExists'] === false ? [] : [{ id: 'c1' }]
      if (sql.includes('FROM opportunities WHERE id')) return overrides['projectExists'] === false ? [] : [{ id: 'p1' }]
      if (sql.includes('FROM tasks t')) return (overrides['rows'] as unknown[]) ?? [ROW]
      return []
    }),
  }
  const stored = (overrides['task'] as Record<string, unknown> | undefined) ?? {
    id: TASK,
    workspace_id: WORKSPACE,
    status: 'todo',
    title: 'Rappeler le DSI',
    details: null,
    priority: 'normal',
    due_on: '2026-08-20',
    owner_id: USER,
    account_id: ACCOUNT,
    contact_id: null,
    project_id: null,
    completed_at: null,
    completed_by: null,
  }
  const tasks = {
    manager,
    create: jest.fn((entity: Record<string, unknown>) => entity),
    save: jest.fn(async (entity: Record<string, unknown>) => ({ id: TASK, ...entity })),
    findOne: jest.fn(async () => (overrides['missing'] === true ? null : stored)),
    delete: jest.fn(async () => ({ affected: overrides['missing'] === true ? 0 : 1 })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })),
    listMembers: jest.fn(async () => (overrides['members'] as unknown[] | undefined) ?? []),
  }
  const activities = { ingest: jest.fn(async () => ({ ingested: 1, duplicates: 0 })) }

  const service = new TasksService(tasks as never, workspaceContext as never, activities as never)
  return { service, tasks, activities, queries, stored }
}

describe('TasksService.create', () => {
  it('attribue la tâche à celui qui la crée quand rien n’est dit', async () => {
    // L'attribuer au hasard la met chez quelqu'un qui l'ignore, puis elle
    // pourrit la vue de quelqu'un qui n'y peut rien.
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ owner_id: USER, created_by: USER }))
  })

  it('respecte un propriétaire explicite', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
      ownerId: OTHER_USER,
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ owner_id: OTHER_USER }))
  })

  it('refuse un compte hors de l’espace plutôt que d’écrire une tâche orpheline', async () => {
    const { service } = makeService({ accountExists: false })
    await expect(
      service.create(USER, {
        title: 'x',
        dueOn: '2026-08-20',
        priority: 'normal',
        objective: 'Obtenir un rendez-vous',
        expectedResult: 'Un rendez-vous confirmé.',
        accountId: ACCOUNT,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('accepte une tâche PERSONNELLE, sans rattachement', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Préparer la revue',
      dueOn: '2026-08-20',
      priority: 'high',
      objective: 'Être prêt pour la revue',
      expectedResult: 'La revue se passe sans accroc.',
    })
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: null, contact_id: null, project_id: null }),
    )
  })

  // #2105.7 — jamais devinée : `manual` par défaut (l'appelant HTTP public),
  // posée explicitement par tout autre appelant (ex. conversion de lead).
  it('pose `manual` par défaut, jamais une source devinée depuis le contenu', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }))
  })

  it('accepte une source explicite posée par l’appelant', async () => {
    const { service, tasks } = makeService()
    await service.create(
      USER,
      {
        title: 'Prochaine action',
        dueOn: '2026-08-20',
        priority: 'normal',
        objective: 'Obtenir un rendez-vous',
        expectedResult: 'Un rendez-vous confirmé.',
      },
      'lead_conversion',
    )
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'lead_conversion' }))
  })

  // #2105.2 — écrit à la création, distinct de `details`.
  it('écrit le résultat attendu à la création', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'RDV pris avec le DSI',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ expected_result: 'RDV pris avec le DSI' }))
  })

  // #2395.8 (épopée #2871) — requis, jamais deviné.
  it('écrit l’objectif à la création', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous avec le DSI',
      expectedResult: 'Un rendez-vous confirmé.',
    })
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ objective: 'Obtenir un rendez-vous avec le DSI' }),
    )
  })

  // #3271.8 reste (épopée #3298) — le rituel d'origine, jamais deviné.
  it('persiste le rituel d’origine quand l’écran des rituels le pose, `null` sinon', async () => {
    const { service, tasks } = makeService()
    const base = {
      title: 'Relancer',
      dueOn: '2026-08-20',
      priority: 'normal' as const,
      objective: 'Débloquer',
      expectedResult: 'Débloqué.',
    }
    await service.create(USER, { ...base, ritualKey: 'monthly' })
    expect(tasks.create).toHaveBeenLastCalledWith(expect.objectContaining({ ritual_key: 'monthly' }))
    await service.create(USER, base)
    expect(tasks.create).toHaveBeenLastCalledWith(expect.objectContaining({ ritual_key: null }))
  })

  // #2105.53 (correctif) — posée UNIQUEMENT par le CTA de transformation d'une
  // carte du brief ; `null` pour tout autre appelant (composeur manuel ici).
  it('pose `null` par défaut, jamais devinée depuis le titre', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ source_label_key: null }))
  })

  it('persiste la clé de source posée par l’appelant', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Relancer Jean',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
      sourceLabelKey: 'briefing.actions.followUp?days=9',
    })
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ source_label_key: 'briefing.actions.followUp?days=9' }),
    )
  })

  // #2946/#2105.9 — le pont Action OS → Tâche : `WorkflowRunnerService` est le
  // seul appelant à poser `relatedActionRunId`, jamais le client.
  it('pose `null` par défaut pour relatedActionRunId, jamais devinée', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ related_action_run_id: null }))
  })

  it('persiste le run Action OS et la source `action_os_approval` posés par l’appelant', async () => {
    const { service, tasks } = makeService()
    const runId = 'f0000000-0000-4000-8000-000000000009'
    await service.create(
      USER,
      {
        title: 'Valider : envoyer un e-mail à 40 contacts',
        dueOn: '2026-08-20',
        priority: 'normal',
        objective: 'Approuver ou refuser l’exécution proposée.',
        expectedResult: 'Décision : approuver ou refuser cette exécution.',
      },
      'action_os_approval',
      runId,
    )
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'action_os_approval', related_action_run_id: runId }),
    )
  })

  // #2395.4/#2395.9 (épopée #2901) — jamais deviné, posé tel quel.
  it('persiste le canal posé par l’appelant, `null` par défaut', async () => {
    const { service, tasks } = makeService()
    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ channel: null }))

    await service.create(USER, {
      title: 'Rappeler',
      dueOn: '2026-08-20',
      priority: 'normal',
      objective: 'Obtenir un rendez-vous',
      expectedResult: 'Un rendez-vous confirmé.',
      channel: 'phone',
    })
    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ channel: 'phone' }))
  })
})

describe('TasksService.update', () => {
  it('cocher une tâche écrit une ACTIVITÉ dans l’historique', async () => {
    const { service, activities } = makeService()
    await service.update(USER, TASK, { status: 'done' })
    expect(activities.ingest).toHaveBeenCalledWith(WORKSPACE, USER, [
      expect.objectContaining({ kind: 'task', externalId: `task:${TASK}` }),
    ])
  })

  it('la trace est IDEMPOTENTE — rejouer ne crée pas deux lignes d’historique', async () => {
    const { service, activities } = makeService()
    await service.update(USER, TASK, { status: 'done' })
    const call = activities.ingest.mock.calls[0] as unknown as [string, string, { externalId: string }[]]
    const batch = call[2]
    expect(batch[0]?.externalId).toBe(`task:${TASK}`)
  })

  it('n’écrit RIEN dans l’historique quand la tâche n’est rattachée à rien', async () => {
    const { service, activities } = makeService({
      task: { id: TASK, workspace_id: WORKSPACE, status: 'todo', account_id: null, contact_id: null, project_id: null },
    })
    await service.update(USER, TASK, { status: 'done' })
    expect(activities.ingest).not.toHaveBeenCalled()
  })

  it('rater la trace n’empêche PAS de cocher', async () => {
    // Le geste a déjà réussi en base : échouer après coup ferait croire que la
    // tâche n'est pas cochée, et l'utilisateur recommencerait.
    const { service, activities } = makeService()
    activities.ingest.mockRejectedValueOnce(new Error('timeline down'))
    await expect(service.update(USER, TASK, { status: 'done' })).resolves.toBeDefined()
  })

  it('rouvrir une tâche EFFACE son achèvement', async () => {
    // « À faire » + « terminée le 3 août » est un état impossible, et c'est
    // celui qu'on obtient quand on ne remet pas les champs à zéro.
    const stored = {
      id: TASK,
      workspace_id: WORKSPACE,
      status: 'done',
      completed_at: new Date('2026-08-03T10:00:00.000Z'),
      completed_by: USER,
      account_id: ACCOUNT,
      contact_id: null,
      project_id: null,
    }
    const { service, tasks } = makeService({ task: stored })
    await service.update(USER, TASK, { status: 'todo' })
    expect(tasks.save).toHaveBeenCalledWith(
      // #2105.54 — le résultat noté n'a plus de sens sur une tâche rouverte.
      expect.objectContaining({ completed_at: null, completed_by: null, result_note: null }),
    )
  })

  // #2105.54 — DÉCISION Louis 17/09 matin : l'auditabilité (qui, quand, quel
  // résultat, relisible) couvre aussi les Tâches, pas seulement Action OS.
  it('note le résultat au moment de clore (#2105.54)', async () => {
    const { service, tasks } = makeService()
    await service.update(USER, TASK, { status: 'done', resultNote: 'Rappelé, RDV pris le 22.' })
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ result_note: 'Rappelé, RDV pris le 22.' }))
  })

  it('un résultat noté peut être effacé explicitement, sans toucher au statut', async () => {
    const { service, tasks } = makeService()
    await service.update(USER, TASK, { resultNote: null })
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ result_note: null }))
  })

  // #2105.2 — même règle que `resultNote` : modifiable après coup.
  it('permet de poser puis d’effacer le résultat attendu', async () => {
    const { service, tasks } = makeService()
    await service.update(USER, TASK, { expectedResult: 'RDV pris' })
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ expected_result: 'RDV pris' }))
    await service.update(USER, TASK, { expectedResult: null })
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ expected_result: null }))
  })

  // #2395.8 (épopée #2871) — se CORRIGE après coup ; `updateTaskSchema`
  // interdit `null` au niveau du contrat, mais le service reste symétrique
  // aux autres champs modifiables (`undefined` laisse intact).
  it('permet de corriger l’objectif après coup', async () => {
    const { service, tasks } = makeService()
    await service.update(USER, TASK, { objective: 'Nouvel objectif' })
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ objective: 'Nouvel objectif' }))
  })

  // #2105.8 — le créateur, résolu en nom comme le propriétaire.
  it('expose le créateur en nom, jamais un identifiant nu', async () => {
    const { service } = makeService()
    const { items } = await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    expect(items[0]?.createdByName).toBe('Louis Schlegel')
    expect(items[0]?.source).toBe('manual')
    expect(items[0]?.expectedResult).toBeNull()
  })

  // #2105.16 — le type se DÉRIVE des rattachements et du run associé, il n'est
  // jamais lu tel quel depuis une colonne (`resolveTaskType`, un seul endroit).
  it('dérive le type LIÉ d’un rattachement compte (#2105.16)', async () => {
    const { service } = makeService()
    const { items } = await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    expect(items[0]?.type).toBe('linked')
    expect(items[0]?.relatedActionRunId).toBeNull()
  })

  it('dérive le type PERSONNEL en l’absence de tout rattachement', async () => {
    const { service } = makeService({ rows: [{ ...ROW, account_id: null, account_name: null }] })
    const { items } = await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    expect(items[0]?.type).toBe('personal')
  })

  // #2105.9 — un run Action OS associé prime : la tâche attend une relecture,
  // même si elle porte aussi un compte.
  it('dérive le type VALIDATION quand un run Action OS est associé', async () => {
    const RUN = 'r0000000-0000-4000-8000-000000000001'
    const { service } = makeService({ rows: [{ ...ROW, related_action_run_id: RUN }] })
    const { items } = await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    expect(items[0]?.type).toBe('validation')
    expect(items[0]?.relatedActionRunId).toBe(RUN)
  })

  // #2105.53 (correctif) — la colonne est lue telle quelle, jamais devinée.
  it('expose la clé de source de la carte dont la tâche vient', async () => {
    const KEY = 'briefing.actions.followUp?days=9'
    const { service } = makeService({ rows: [{ ...ROW, source_label_key: KEY }] })
    const { items } = await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    expect(items[0]?.sourceLabelKey).toBe(KEY)
  })

  it('expose QUI a clos et QUEL résultat, relisibles (#2105.54)', async () => {
    const { service } = makeService({
      rows: [
        {
          ...ROW,
          status: 'done',
          completed_at: '2026-08-03T10:00:00.000Z',
          completed_by: OTHER_USER,
          completed_by_first: 'Maëlle',
          completed_by_last: 'Dupont',
          result_note: 'Rappelé, RDV pris le 22.',
        },
      ],
    })
    const { items } = await service.list(USER, { scope: 'mine', includeDone: true, limit: 100 })
    expect(items[0]?.completedById).toBe(OTHER_USER)
    expect(items[0]?.completedByName).toBe('Maëlle Dupont')
    expect(items[0]?.resultNote).toBe('Rappelé, RDV pris le 22.')
  })

  it('n’écrit pas une seconde activité quand la tâche était déjà faite', async () => {
    const { service, activities } = makeService({
      task: {
        id: TASK,
        workspace_id: WORKSPACE,
        status: 'done',
        completed_at: new Date(),
        completed_by: USER,
        account_id: ACCOUNT,
        contact_id: null,
        project_id: null,
      },
    })
    await service.update(USER, TASK, { status: 'done' })
    expect(activities.ingest).not.toHaveBeenCalled()
  })

  it('refuse une tâche d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.update(USER, TASK, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('TasksService.list', () => {
  it('cache ce qui est fait par défaut', async () => {
    const { service, queries } = makeService()
    await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    const read = queries.find(entry => entry.sql.includes('FROM tasks t'))
    expect(read?.sql).toContain(STILL_OPEN)
  })

  it('remonte l’historique quand on le demande — annulées COMPRISES', async () => {
    // On archive, on ne supprime pas : une tâche annulée reste en base et
    // reste lisible. Elle sort des vues « à faire », pas de l'historique.
    const { service, queries } = makeService()
    await service.list(USER, { scope: 'mine', includeDone: true, limit: 100 })
    const read = queries.find(entry => entry.sql.includes('FROM tasks t'))
    expect(read?.sql).not.toContain(STILL_OPEN)
  })

  it('scope « mine » filtre sur le propriétaire, pas sur le créateur', async () => {
    // Une tâche que j'ai créée pour un collègue est la SIENNE : la voir dans ma
    // liste me ferait la faire deux fois, ou pas du tout.
    const { service, queries } = makeService()
    await service.list(USER, { scope: 'mine', includeDone: false, limit: 100 })
    const read = queries.find(entry => entry.sql.includes('FROM tasks t'))
    expect(read?.sql).toContain('t.owner_id =')
    expect(read?.params).toContain(USER)
  })

  it('trie par échéance croissante — le plus urgent en premier', async () => {
    const { service, queries } = makeService()
    await service.list(USER, { scope: 'account', id: ACCOUNT, includeDone: false, limit: 100 })
    const read = queries.find(entry => entry.sql.includes('FROM tasks t'))
    expect(read?.sql).toContain('ORDER BY t.due_on ASC')
  })
})

describe('TasksService.remove', () => {
  it('404 sur une tâche d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.remove(USER, TASK)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('#2406.23 — archive, ne supprime PAS la ligne (c67, #2297 : un fait périmé redevient inconnu, il ne disparaît pas)', async () => {
    const { service, tasks } = makeService()
    await service.remove(USER, TASK)
    // Jamais de DELETE SQL : la ligne reste en base, lisible par l'historique
    // (`list(includeDone: true)`, déjà couvert plus haut dans ce fichier).
    expect(tasks.delete).not.toHaveBeenCalled()
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
  })

  it('#2406.23 — pose complétée_at/completed_by comme une clôture normale, pour que la tâche sorte des vues « à faire »', async () => {
    const { service, tasks } = makeService()
    await service.remove(USER, TASK)
    const saved = tasks.save.mock.calls[0]?.[0] as { completed_at: unknown; completed_by: unknown }
    expect(saved.completed_at).toBeInstanceOf(Date)
    expect(saved.completed_by).toBe(USER)
  })

  it('#2406.23 — annuler n’est pas accomplir : aucune activité n’est journalisée (`recordCompletion` ne s’attache qu’à `done`)', async () => {
    const { service, activities } = makeService()
    await service.remove(USER, TASK)
    expect(activities.ingest).not.toHaveBeenCalled()
  })
})

/**
 * #2128.13 (épopée #2788) — « demander validation manager » sur un compte.
 * Réutilise l'objet TÂCHE : une tâche par membre habilité (`team:manage`).
 */
describe('TasksService.requestManagerValidation', () => {
  it('pose une tâche sur CHAQUE membre habilité, jamais sur le demandeur lui-même', async () => {
    const members = [
      { userId: USER, role: 'sales' as const, email: 'louis@esn.fr', fullName: 'Louis', isSelf: true },
      { userId: OTHER_USER, role: 'admin' as const, email: 'admin@esn.fr', fullName: 'Admin', isSelf: false },
      { userId: 'u3', role: 'viewer' as const, email: 'v@esn.fr', fullName: 'Viewer', isSelf: false },
    ]
    const { service, tasks } = makeService({ members })

    const created = await service.requestManagerValidation(USER, ACCOUNT, 'Merci de vérifier le plan')

    expect(created).toHaveLength(1)
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: OTHER_USER, created_by: USER, account_id: ACCOUNT }),
    )
  })

  it('refuse un compte hors de l’espace — avant toute lecture des membres', async () => {
    const { service } = makeService({ accountExists: false })
    await expect(service.requestManagerValidation(USER, ACCOUNT)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('un espace SANS AUTRE membre habilité rend une liste VIDE — jamais une tâche pour soi-même', async () => {
    const members = [{ userId: USER, role: 'owner' as const, email: 'louis@esn.fr', fullName: 'Louis', isSelf: true }]
    const { service, tasks } = makeService({ members })

    const created = await service.requestManagerValidation(USER, ACCOUNT)

    expect(created).toEqual([])
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('la note est LIBRE et optionnelle — absente, la tâche part sans détail inventé', async () => {
    const members = [
      { userId: OTHER_USER, role: 'sales_ops' as const, email: 'a@esn.fr', fullName: 'A', isSelf: false },
    ]
    const { service, tasks } = makeService({ members })

    await service.requestManagerValidation(USER, ACCOUNT)

    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ details: null }))
  })
})

// #2074.16 — « Valider » un mouvement d'audit pose UNE tâche, jamais deux :
// l'idempotence est l'index unique partiel `tasks_audit_move_once_idx`
// (migration 1796900103000), que l'INSERT vise par son ON CONFLICT.
describe('TasksService.createOnceFromAuditMove (#2074.16)', () => {
  const MOVE = {
    sourceKey: 'offerWithoutProof:aucune',
    title: 'Rédiger une référence client',
    objective: 'L’offre n’a aucune preuve mobilisable',
    expectedResult: 'Une référence publiée',
  }

  it('insère dans l’espace ACTIF de l’appelant, à son nom, source audit_move, et ne double jamais', async () => {
    const { service, queries } = makeService()
    await service.createOnceFromAuditMove(USER, MOVE)

    const insert = queries.find(q => q.sql.includes('INSERT INTO tasks'))
    expect(insert?.sql).toMatch(
      /ON CONFLICT \(workspace_id, owner_id, source, source_label_key\)\s+WHERE source = 'audit_move'\s+DO NOTHING/,
    )
    expect(insert?.params).toEqual(
      expect.arrayContaining([WORKSPACE, USER, MOVE.title, MOVE.objective, MOVE.expectedResult, MOVE.sourceKey]),
    )
    expect(insert?.params).not.toContain(OTHER_USER)
    expect(insert?.sql).toContain(`'audit_move'`)
  })

  it('rend `created: false` quand la tâche existe déjà (re-valider), `true` la première fois', async () => {
    const first = makeService()
    first.tasks.manager.query.mockImplementationOnce(async () => [{ id: TASK }])
    expect(await first.service.createOnceFromAuditMove(USER, MOVE)).toEqual({ created: true })

    const again = makeService()
    again.tasks.manager.query.mockImplementationOnce(async () => [])
    expect(await again.service.createOnceFromAuditMove(USER, MOVE)).toEqual({ created: false })
  })
})

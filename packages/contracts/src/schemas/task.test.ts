import { describe, expect, it } from 'vitest'
import {
  buildTaskAgenda,
  createTaskSchema,
  dayKey,
  daysBetween,
  isTaskOpen,
  listTasksQuerySchema,
  resolveTaskType,
  taskBucket,
  taskPostponedDueOn,
  taskSchema,
  taskStillOpenSql,
  updateTaskSchema,
  TASK_CLOSED_STATUSES,
  TASK_OPEN_STATUSES,
  TASK_STATUSES,
  TASK_SOURCES,
  TASK_TYPES,
  type Task,
} from './task.js'

const NOW = new Date('2026-08-17T10:00:00.000Z')
const TODAY = dayKey(NOW)

function task(dueOn: string, overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${dueOn}-${overrides.priority ?? 'normal'}`,
    title: 'Rappeler le DSI',
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn,
    source: 'manual',
    type: 'personal',
    relatedActionRunId: null,
    sourceLabelKey: null,
    ownerId: null,
    ownerName: null,
    createdById: null,
    createdByName: null,
    expectedResult: null,
    objective: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    projectId: null,
    projectLabel: null,
    completedAt: null,
    // #2105.54 — l'auditabilité (qui, quand, quel résultat) : `completedAt`
    // portait déjà le « quand », ces deux champs portent le « qui » et le
    // « quel résultat ».
    completedById: null,
    completedByName: null,
    resultNote: null,
    channel: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

/** Décale d'un nombre de jours À PARTIR d'aujourd'hui, dans le fuseau local. */
function inDays(offset: number): string {
  const date = new Date(NOW)
  date.setDate(date.getDate() + offset)
  return dayKey(date)
}

// #2395.8 (épopée #2871) — seconde moitié : le résultat attendu suit le même
// arbitrage que l'objectif, requis dans CHAQUE appel valide ci-dessous.
const RESULT = 'RDV pris'

describe('createTaskSchema — rituel (#3298 / #3271.8)', () => {
  const base = { title: 'Relancer', dueOn: '2026-10-01', objective: 'Débloquer', expectedResult: RESULT }

  it('accepte une clé de rituel du catalogue', () => {
    expect(createTaskSchema.parse({ ...base, ritualKey: 'monthly' }).ritualKey).toBe('monthly')
  })

  it("REFUSE une clé qui n'est pas au catalogue — jamais un lien causal inventé", () => {
    expect(() => createTaskSchema.parse({ ...base, ritualKey: 'yearly' })).toThrow()
  })

  it("reste optionnelle : une tâche ordinaire ne sort d'aucun rituel", () => {
    expect(createTaskSchema.parse(base).ritualKey).toBeUndefined()
  })
})

describe('createTaskSchema', () => {
  it('REFUSE une tâche sans échéance — elle ne remonterait dans aucune vue', () => {
    expect(() => createTaskSchema.parse({ title: 'Rappeler', objective: 'RDV pris', expectedResult: RESULT })).toThrow()
  })

  it('refuse une date qui ressemble à une date sans en être une', () => {
    expect(() =>
      createTaskSchema.parse({
        title: 'Rappeler',
        dueOn: '2026-02-31',
        objective: 'RDV pris',
        expectedResult: RESULT,
      }),
    ).toThrow()
    expect(() =>
      createTaskSchema.parse({ title: 'Rappeler', dueOn: 'demain', objective: 'RDV pris', expectedResult: RESULT }),
    ).toThrow()
  })

  it('ne DEVINE pas de propriétaire — absent veut dire « celui qui crée »', () => {
    const parsed = createTaskSchema.parse({
      title: 'Rappeler',
      dueOn: '2026-08-20',
      objective: 'RDV pris',
      expectedResult: RESULT,
    })
    expect(parsed.ownerId).toBeUndefined()
    expect(parsed.priority).toBe('normal')
  })

  it('refuse un champ inconnu plutôt que de l’avaler', () => {
    expect(() =>
      createTaskSchema.parse({
        title: 'x',
        dueOn: '2026-08-20',
        objective: 'RDV pris',
        expectedResult: RESULT,
        recurrence: 'weekly',
      }),
    ).toThrow()
  })

  // #2105.2 — « à quoi ressemble fait », distinct de `details`.
  it('porte le résultat attendu', () => {
    const parsed = createTaskSchema.parse({
      title: 'Rappeler',
      dueOn: '2026-08-20',
      objective: 'RDV pris avec le DSI',
      expectedResult: 'RDV pris avec le DSI',
    })
    expect(parsed.expectedResult).toBe('RDV pris avec le DSI')
  })

  // #2395.8 (épopée #2871) — une tâche sans objectif écrit son « quoi » sans
  // jamais dire pourquoi. Même arbitrage que `createPlanActionSchema.reason`.
  it('REFUSE une tâche sans objectif, vide ou blanc', () => {
    expect(() => createTaskSchema.parse({ title: 'Rappeler', dueOn: '2026-08-20', expectedResult: RESULT })).toThrow()
    expect(() =>
      createTaskSchema.parse({ title: 'Rappeler', dueOn: '2026-08-20', objective: '', expectedResult: RESULT }),
    ).toThrow()
    expect(() =>
      createTaskSchema.parse({ title: 'Rappeler', dueOn: '2026-08-20', objective: '   ', expectedResult: RESULT }),
    ).toThrow()
  })

  // #2395.8, seconde moitié — le pendant exact du test ci-dessus, pour le
  // résultat attendu : « à quoi ressemble fait ? » ne se devine pas plus que
  // le pourquoi. Même règle déjà posée pour `outreach_call_tasks.expected_outcome`
  // (`outreach-canonical.ts`), jamais appliquée à `tasks` avant ce lot.
  it('REFUSE une tâche sans résultat attendu, vide ou blanc', () => {
    expect(() => createTaskSchema.parse({ title: 'Rappeler', dueOn: '2026-08-20', objective: 'RDV pris' })).toThrow()
    expect(() =>
      createTaskSchema.parse({ title: 'Rappeler', dueOn: '2026-08-20', objective: 'RDV pris', expectedResult: '' }),
    ).toThrow()
    expect(() =>
      createTaskSchema.parse({
        title: 'Rappeler',
        dueOn: '2026-08-20',
        objective: 'RDV pris',
        expectedResult: '   ',
      }),
    ).toThrow()
  })

  // #2105.7 — jamais fourni par le client : posé par le SERVICE, pas ici.
  it('ne prend pas de source à la création — elle n’est pas un champ client', () => {
    expect(() =>
      createTaskSchema.parse({
        title: 'x',
        dueOn: '2026-08-20',
        objective: 'RDV pris',
        expectedResult: RESULT,
        source: 'manual',
      }),
    ).toThrow()
  })
})

describe('updateTaskSchema', () => {
  it('refuse une modification vide', () => {
    expect(() => updateTaskSchema.parse({})).toThrow()
  })

  it('permet de retirer un propriétaire explicitement', () => {
    expect(updateTaskSchema.parse({ ownerId: null }).ownerId).toBeNull()
  })

  // #2105.54 — l'auditabilité couvre aussi les Tâches : « quel résultat » se
  // saisit au moment de clore, comme pour Action OS (`cardResultSchema`).
  it('accepte un résultat noté au moment de clore', () => {
    const parsed = updateTaskSchema.parse({ status: 'done', resultNote: 'Rappelé, RDV pris le 22.' })
    expect(parsed.resultNote).toBe('Rappelé, RDV pris le 22.')
  })

  it('permet d’effacer le résultat noté explicitement', () => {
    expect(updateTaskSchema.parse({ resultNote: null }).resultNote).toBeNull()
  })

  // #2105.2 — même règle que `resultNote` : `null` efface, absent laisse intact.
  it('permet de poser puis d’effacer le résultat attendu', () => {
    expect(updateTaskSchema.parse({ expectedResult: 'RDV pris' }).expectedResult).toBe('RDV pris')
    expect(updateTaskSchema.parse({ expectedResult: null }).expectedResult).toBeNull()
  })

  // #2395.8 — l'objectif se CORRIGE, il ne s'EFFACE pas : une fois posé, il
  // reste dû. `null` est donc refusé, contrairement à `resultNote`/`expectedResult`.
  it('permet de corriger l’objectif, refuse de l’effacer', () => {
    expect(updateTaskSchema.parse({ objective: 'Nouvel objectif' }).objective).toBe('Nouvel objectif')
    expect(() => updateTaskSchema.parse({ objective: null })).toThrow()
  })
})

const VALID_ID = 'a0000000-0000-4000-8000-000000000099'

describe('taskSchema — source (#2105.7)', () => {
  it('porte une source parmi les appelants connus', () => {
    for (const source of TASK_SOURCES) {
      expect(taskSchema.parse(task('2026-08-20', { id: VALID_ID, source })).source).toBe(source)
    }
  })

  it('refuse une source hors énumération', () => {
    expect(() => taskSchema.parse(task('2026-08-20', { id: VALID_ID, source: 'signal' as never }))).toThrow()
  })
})

// #2105.16 — les quatre types ne se confondent pas.
describe('resolveTaskType (#2105.16)', () => {
  const NO_LINK = { relatedActionRunId: null, accountId: null, contactId: null, projectId: null }

  it('une tâche sans rattachement ni run est PERSONNELLE', () => {
    expect(resolveTaskType(NO_LINK)).toBe('personal')
  })

  it('un compte, un contact OU un projet rendent la tâche LIÉE', () => {
    expect(resolveTaskType({ ...NO_LINK, accountId: VALID_ID })).toBe('linked')
    expect(resolveTaskType({ ...NO_LINK, contactId: VALID_ID })).toBe('linked')
    expect(resolveTaskType({ ...NO_LINK, projectId: VALID_ID })).toBe('linked')
  })

  it('un run Action OS associé rend la tâche VALIDATION, même avec un objet', () => {
    expect(resolveTaskType({ ...NO_LINK, relatedActionRunId: VALID_ID })).toBe('validation')
    expect(resolveTaskType({ ...NO_LINK, relatedActionRunId: VALID_ID, accountId: VALID_ID })).toBe('validation')
  })

  it('couvre exhaustivement les quatre types déclarés — `external_action` compris', () => {
    // #2105.16 — déclaré, pas encore produit (aucun appelant ne distingue
    // aujourd'hui « à valider » de « à exécuter dehors »). Ce test protège
    // l'énumération elle-même, pas le résolveur.
    expect([...TASK_TYPES]).toEqual(['personal', 'linked', 'validation', 'external_action'])
  })

  it('accepte les quatre types dans le contrat de lecture', () => {
    for (const type of TASK_TYPES) {
      expect(taskSchema.parse(task('2026-08-20', { id: VALID_ID, type })).type).toBe(type)
    }
  })
})

describe('taskSchema — relatedActionRunId (#2105.9)', () => {
  it('`null` pour une tâche manuelle ou de conversion de lead', () => {
    expect(task('2026-08-20', { id: VALID_ID }).relatedActionRunId).toBeNull()
  })

  it('porte l’identifiant du run quand il est posé', () => {
    const parsed = taskSchema.parse(task('2026-08-20', { id: VALID_ID, relatedActionRunId: VALID_ID }))
    expect(parsed.relatedActionRunId).toBe(VALID_ID)
  })
})

describe('taskSchema — créateur nommé et résultat attendu', () => {
  it('résout le créateur en nom, jamais en identifiant nu', () => {
    const parsed = taskSchema.parse(task('2026-08-20', { id: VALID_ID, createdByName: 'Louis Schlegel' }))
    expect(parsed.createdByName).toBe('Louis Schlegel')
  })

  it('porte le résultat attendu, distinct de `details`', () => {
    const parsed = taskSchema.parse(
      task('2026-08-20', {
        id: VALID_ID,
        details: 'Contexte : appel raté hier',
        expectedResult: 'RDV pris avec le DSI',
      }),
    )
    expect(parsed.expectedResult).toBe('RDV pris avec le DSI')
    expect(parsed.details).toBe('Contexte : appel raté hier')
  })
})

describe('taskSchema — auditabilité (#2105.54)', () => {
  it('porte QUI a clos la tâche et QUEL résultat, relisibles', () => {
    const parsed = taskSchema.parse(
      task('2026-08-20', {
        id: 'a0000000-0000-4000-8000-000000000009',
        status: 'done',
        completedAt: '2026-08-20T10:00:00.000Z',
        completedById: 'a0000000-0000-4000-8000-000000000001',
        completedByName: 'Louis Schlegel',
        resultNote: 'Rappelé, RDV pris le 22.',
      }),
    )
    expect(parsed.completedByName).toBe('Louis Schlegel')
    expect(parsed.resultNote).toBe('Rappelé, RDV pris le 22.')
  })
})

describe('listTasksQuerySchema', () => {
  it('exige un identifiant pour un périmètre d’objet', () => {
    expect(() => listTasksQuerySchema.parse({ scope: 'account' })).toThrow()
  })

  it('n’en exige pas pour « mes tâches »', () => {
    expect(listTasksQuerySchema.parse({}).scope).toBe('mine')
  })

  it('cache ce qui est fait par défaut', () => {
    expect(listTasksQuerySchema.parse({}).includeDone).toBe(false)
  })
})

describe('daysBetween', () => {
  it('compte des jours calendaires, pas des heures', () => {
    expect(daysBetween('2026-08-17', '2026-08-18')).toBe(1)
    expect(daysBetween('2026-08-18', '2026-08-17')).toBe(-1)
  })

  it('traverse un changement d’heure sans dériver', () => {
    // Fin octobre : 25 heures dans la journée du 25. Un calcul en heures rendrait
    // 0 jour là où il y en a un.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('rend 0 sur une date illisible plutôt que NaN', () => {
    expect(daysBetween('pas-une-date', '2026-08-17')).toBe(0)
  })
})

describe('taskBucket', () => {
  it('sépare le retard d’aujourd’hui', () => {
    expect(taskBucket({ dueOn: inDays(-3), status: 'todo', priority: 'normal' }, NOW)).toBe('overdue')
    expect(taskBucket({ dueOn: TODAY, status: 'todo', priority: 'normal' }, NOW)).toBe('today')
  })

  it('nomme demain, la semaine, et le reste', () => {
    expect(taskBucket({ dueOn: inDays(1), status: 'todo', priority: 'normal' }, NOW)).toBe('tomorrow')
    expect(taskBucket({ dueOn: inDays(5), status: 'todo', priority: 'normal' }, NOW)).toBe('this_week')
    expect(taskBucket({ dueOn: inDays(30), status: 'todo', priority: 'normal' }, NOW)).toBe('later')
  })

  it('sort une tâche close de tout panier', () => {
    expect(taskBucket({ dueOn: inDays(-3), status: 'done', priority: 'normal' }, NOW)).toBeNull()
    expect(taskBucket({ dueOn: TODAY, status: 'cancelled', priority: 'normal' }, NOW)).toBeNull()
  })
})

describe('buildTaskAgenda', () => {
  it('ne fond PAS le retard dans aujourd’hui', () => {
    // Sinon « 7 tâches aujourd'hui » alors que cinq traînent depuis trois
    // semaines : le chiffre serait juste, la lecture fausse.
    const agenda = buildTaskAgenda([task(inDays(-10)), task(inDays(-2)), task(TODAY)], NOW)
    expect(agenda.overdueCount).toBe(2)
    expect(agenda.todayCount).toBe(1)
  })

  it('n’émet que les paniers non vides, dans l’ordre d’urgence', () => {
    const agenda = buildTaskAgenda([task(inDays(30)), task(inDays(-1))], NOW)
    expect(agenda.buckets.map(entry => entry.bucket)).toEqual(['overdue', 'later'])
  })

  it('met les prioritaires en tête d’un panier, puis la plus ancienne', () => {
    const agenda = buildTaskAgenda(
      [task(TODAY, { id: 'normal-1' }), task(TODAY, { id: 'urgent', priority: 'high' })],
      NOW,
    )
    expect(agenda.buckets[0]?.tasks.map(entry => entry.id)).toEqual(['urgent', 'normal-1'])
  })

  it('trie par date à priorité égale', () => {
    const agenda = buildTaskAgenda([task(inDays(-1), { id: 'hier' }), task(inDays(-9), { id: 'vieux' })], NOW)
    expect(agenda.buckets[0]?.tasks.map(entry => entry.id)).toEqual(['vieux', 'hier'])
  })

  it('rend un agenda vide, pas une erreur, quand il n’y a rien', () => {
    expect(buildTaskAgenda([], NOW)).toEqual({ buckets: [], overdueCount: 0, todayCount: 0 })
  })

  it('ignore les tâches faites', () => {
    const agenda = buildTaskAgenda([task(TODAY, { status: 'done' })], NOW)
    expect(agenda.buckets).toEqual([])
    expect(agenda.todayCount).toBe(0)
  })
})

describe('« encore à faire » — une seule définition', () => {
  it('classe CHAQUE statut de l’énumération, ouvert ou clos', () => {
    // Exhaustif par le TYPE : ajouter un statut sans le classer ne compile pas.
    // Sans ça, un statut neuf serait « ouvert » ou « clos » par accident, et
    // l'accident se découvrirait sur un écran. Ici on vérifie la conséquence :
    // aucun statut n'est ni l'un ni l'autre, aucun n'est les deux.
    for (const status of TASK_STATUSES) {
      expect(TASK_OPEN_STATUSES.includes(status)).toBe(isTaskOpen(status))
      expect(TASK_CLOSED_STATUSES.includes(status)).toBe(!isTaskOpen(status))
    }
    expect(TASK_OPEN_STATUSES.length + TASK_CLOSED_STATUSES.length).toBe(TASK_STATUSES.length)
  })

  it('une tâche ANNULÉE est close — elle n’est pas une action programmée', () => {
    // L'arbitrage : annulée n'est pas « faite », mais ce n'est plus quelque
    // chose qui attend quelqu'un. Un contrôle de qualité qui la compte comme
    // « prochaine action » dit « ce compte est couvert » alors que rien n'est
    // prévu — un faux négatif qui CACHE du travail.
    expect(isTaskOpen('todo')).toBe(true)
    expect(isTaskOpen('done')).toBe(false)
    expect(isTaskOpen('cancelled')).toBe(false)
    expect([...TASK_OPEN_STATUSES]).toEqual(['todo'])
  })

  it('`taskBucket` dérive du MÊME classement, il ne le recopie pas', () => {
    for (const status of TASK_STATUSES) {
      const bucket = taskBucket({ dueOn: TODAY, status, priority: 'normal' }, NOW)
      expect(bucket === null).toBe(!isTaskOpen(status))
    }
  })

  it('engendre le prédicat SQL depuis l’énumération, jamais depuis une recopie', () => {
    // La liste des statuts n'est écrite qu'une fois. Un statut ajouté à
    // `TASK_STATUSES` et classé « ouvert » entre dans le SQL sans qu'on
    // retouche la moindre requête. Ce test décrit la RÈGLE, pas la forme : il
    // survit à un statut ouvert de plus.
    const sql = taskStillOpenSql('t')
    for (const status of TASK_OPEN_STATUSES) expect(sql).toContain(`'${status}'`)
    for (const status of TASK_CLOSED_STATUSES) expect(sql).not.toContain(`'${status}'`)
    expect(sql.startsWith('t.status ')).toBe(true)
    // L'alias voyage : le même prédicat sert sous un autre nom de table.
    expect(taskStillOpenSql('task')).toBe(sql.replace('t.status', 'task.status'))
  })

  it('rend une ÉGALITÉ tant qu’il n’y a qu’un statut ouvert — l’index partiel en dépend', () => {
    // `tasks_open_by_owner_idx` est déclaré `WHERE status = 'todo'`. Le jour où
    // l'énumération porte deux statuts ouverts, ce test tombe — et c'est voulu :
    // quelqu'un doit alors relire l'index autant que le SQL engendré.
    expect(TASK_OPEN_STATUSES.length).toBe(1)
    expect(taskStillOpenSql('t')).toBe("t.status = 'todo'")
  })

  it('refuse un alias qui n’est pas un identifiant SQL', () => {
    // Le prédicat est INTERPOLÉ dans du SQL écrit à la main : un alias libre y
    // ouvrirait une injection. Les statuts, eux, viennent d'une énumération
    // figée — ils ne peuvent pas venir d'un utilisateur.
    expect(() => taskStillOpenSql('t; DROP TABLE tasks --')).toThrow()
    expect(() => taskStillOpenSql('')).toThrow()
  })
})

describe('taskPostponedDueOn — reporter en un geste (#4134)', () => {
  it("« Demain » = le lendemain de AUJOURD'HUI, même pour une tâche en retard", () => {
    expect(taskPostponedDueOn('tomorrow', new Date('2026-08-17T10:00:00.000Z'))).toBe('2026-08-18')
  })

  it('« Semaine prochaine » = le lundi SUIVANT, quel que soit le jour', () => {
    // lundi 17 → lundi 24 (jamais « aujourd\'hui »)
    expect(taskPostponedDueOn('next_week', new Date('2026-08-17T10:00:00.000Z'))).toBe('2026-08-24')
    // mercredi 19 → lundi 24
    expect(taskPostponedDueOn('next_week', new Date('2026-08-19T10:00:00.000Z'))).toBe('2026-08-24')
    // dimanche 23 → lundi 24
    expect(taskPostponedDueOn('next_week', new Date('2026-08-23T10:00:00.000Z'))).toBe('2026-08-24')
  })

  it("franchit les fins de mois et d'année", () => {
    expect(taskPostponedDueOn('tomorrow', new Date('2026-12-31T10:00:00.000Z'))).toBe('2027-01-01')
    expect(taskPostponedDueOn('next_week', new Date('2026-12-30T10:00:00.000Z'))).toBe('2027-01-04')
  })
})

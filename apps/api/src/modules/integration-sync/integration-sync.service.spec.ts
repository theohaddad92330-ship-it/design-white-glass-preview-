import { IntegrationSyncService } from './integration-sync.service'

type ContactRow = { account_id: string | null; full_name: string }

function build(
  opts: {
    accountsTouched?: number
    contactsTouched?: number
    touchedContacts?: ContactRow[]
    ambiguityContacts?: ContactRow[]
    meetingsFound?: number
    exchangesFound?: number
    actionsLogged?: number
    pagesAdded?: number
  } = {},
) {
  const store = new Map<string, Record<string, unknown>>()
  const accounts = { count: jest.fn().mockResolvedValue(opts.accountsTouched ?? 0) }
  // `find` sert DEUX requêtes distinctes : les fiches TOUCHÉES par le run
  // (#2207.27) et, quand elles pointent vers un compte, TOUTES les fiches de
  // ce compte pour l'ambiguïté (#2207.31) — distinguées par la présence de
  // `account_id` dans `where`.
  const contacts = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if ('account_id' in where) return opts.ambiguityContacts ?? []
      return (
        opts.touchedContacts ??
        Array.from({ length: opts.contactsTouched ?? 0 }, (_, i) => ({ account_id: null, full_name: `contact-${i}` }))
      )
    }),
  }
  // `kind` distingue les deux appels : une chaîne pour « rendez-vous »
  // (#2207.28), un `In([...])` (TypeORM `FindOperator`, `_type: 'in'`) pour
  // les échanges (#2207.29).
  const activities = {
    count: jest.fn(async ({ where }: { where: { kind: string | { _type: string } } }) => {
      if (typeof where.kind === 'string') return opts.meetingsFound ?? 0
      return opts.exchangesFound ?? 0
    }),
  }
  const userActions = { count: jest.fn().mockResolvedValue(opts.actionsLogged ?? 0) }
  const ragDocuments = { count: jest.fn().mockResolvedValue(opts.pagesAdded ?? 0) }
  // `Not(In([...]))` (TypeORM `FindOperator`) est la forme réelle que le
  // service passe pour « un run VIVANT » — le mock l'interprète comme le
  // ferait PostgreSQL, sans reproduire TypeORM lui-même.
  function matchesStatusFilter(status: unknown, filter: unknown): boolean {
    if (filter === undefined) return true
    const op = filter as { _type?: string; _value?: unknown } | undefined
    if (op && op._type === 'not') return !matchesStatusFilter(status, op._value)
    if (op && op._type === 'in') return (op._value as unknown[]).includes(status)
    return status === filter
  }
  const runs = {
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    save: jest.fn(async (row: Record<string, unknown>) => {
      const id = (row['id'] as string | undefined) ?? `run-${store.size + 1}`
      const saved = { ...row, id }
      store.set(id, saved)
      return saved
    }),
    update: jest.fn(
      async (where: { id: string; workspace_id?: string; status?: unknown }, patch: Record<string, unknown>) => {
        const existing = store.get(where.id)
        if (!existing) return
        if (where.workspace_id !== undefined && existing['workspace_id'] !== where.workspace_id) return
        if (!matchesStatusFilter(existing['status'], where.status)) return
        store.set(where.id, { ...existing, ...patch })
      },
    ),
    findOne: jest.fn(
      async ({
        where,
        order,
      }: {
        where: { id?: string; workspace_id?: string; provider?: string; status?: unknown }
        order?: { started_at: 'DESC' }
      }) => {
        const rows = [...store.values()].filter(row => {
          if (where.workspace_id !== undefined && row['workspace_id'] !== where.workspace_id) return false
          if (where.id !== undefined && row['id'] !== where.id) return false
          if (where.provider !== undefined && row['provider'] !== where.provider) return false
          if (!matchesStatusFilter(row['status'], where.status)) return false
          return true
        })
        if (rows.length === 0) return null
        if (order?.started_at === 'DESC') {
          return rows.sort((a, b) => (b['started_at'] as Date).getTime() - (a['started_at'] as Date).getTime())[0]
        }
        return rows[0]
      },
    ),
    findOneOrFail: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = store.get(where.id)
      if (!row) throw new Error('not found')
      return row
    }),
    // `LessThan(...)` (TypeORM `FindOperator`, `_type: 'lessThan'`) — la forme
    // réelle passée par `reconcileStaleRuns` (#2110.21).
    find: jest.fn(
      async ({ where }: { where: { status?: unknown; started_at?: { _type?: string; _value?: Date } } }) => {
        return [...store.values()].filter(row => {
          if (!matchesStatusFilter(row['status'], where.status)) return false
          const startedAtFilter = where.started_at
          if (startedAtFilter?._type === 'lessThan') {
            return (row['started_at'] as Date).getTime() < (startedAtFilter._value as Date).getTime()
          }
          return true
        })
      },
    ),
  }
  const service = new IntegrationSyncService(
    runs as never,
    accounts as never,
    contacts as never,
    activities as never,
    userActions as never,
    ragDocuments as never,
  )
  return { service, store, accounts, contacts, activities, userActions, ragDocuments }
}

describe('#2207.19 — le déclenchement écrit un run et rend la main tout de suite', () => {
  it('crée le run en `pending` (épopée #2980 : le worker le fait avancer ensuite)', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'notion')
    expect(run.status).toBe('pending')
    expect(run.provider).toBe('notion')
    expect(run.workspace_id).toBe('ws-1')
  })
})

describe('getActiveRun — la garde anti-double-lancement (#2110.81)', () => {
  it('rend le run non terminal existant pour ce (espace, connecteur)', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    const active = await service.getActiveRun('ws-1', 'hubspot')
    expect(active?.id).toBe(run.id)
  })

  it('rend `null` une fois le run terminal — un nouveau lancement redevient possible', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.finishRun(run.id, 'ws-1')
    expect(await service.getActiveRun('ws-1', 'hubspot')).toBeNull()
  })

  it('rend `null` quand aucun run n’a jamais été lancé', async () => {
    const { service } = build()
    expect(await service.getActiveRun('ws-1', 'notion')).toBeNull()
  })
})

describe('advance — la progression réelle entre deux phases (#2110.22 à .31)', () => {
  it('avance un run vivant', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.advance(run.id, 'reading_sources')
    expect(store.get(run.id)?.['status']).toBe('reading_sources')
  })

  it('un run déjà `canceled` ne repart jamais en arrière vers une phase intermédiaire', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.cancelRun('ws-1', run.id)
    await service.advance(run.id, 'reading_sources')
    expect(store.get(run.id)?.['status']).toBe('canceled')
  })
})

describe('cancelRun — le geste « Annuler » (#2110.39)', () => {
  it('referme un run vivant en `canceled`, avec sa propre date', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.cancelRun('ws-1', run.id)
    const canceled = store.get(run.id)
    expect(canceled?.['status']).toBe('canceled')
    expect(canceled?.['canceled_at']).toBeInstanceOf(Date)
  })

  it('n’écrase jamais un run déjà terminal (`completed`)', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.finishRun(run.id, 'ws-1')
    await service.cancelRun('ws-1', run.id)
    expect(store.get(run.id)?.['status']).toBe('completed')
  })
})

describe('isCanceled', () => {
  it('vrai seulement après annulation', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    expect(await service.isCanceled(run.id)).toBe(false)
    await service.cancelRun('ws-1', run.id)
    expect(await service.isCanceled(run.id)).toBe(true)
  })
})

describe('finishRun — referme le run en `completed`', () => {
  it('écrit `finished_at` et un résumé vide quand rien n’a bougé dans la fenêtre', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'notion')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['status']).toBe('completed')
    expect(finished?.['finished_at']).toBeInstanceOf(Date)
    expect(finished?.['summary']).toEqual([])
  })

  it('#2207.26 — porte une ligne « comptes » quand des comptes ont été touchés dans la fenêtre du run', async () => {
    const { service, store } = build({ accountsTouched: 3 })
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'accounts', count: 3, label: { fr: '3 comptes mis à jour', en: '3 accounts updated' } },
    ])
  })

  it('#2207.27 — porte une ligne « contacts » quand des contacts ont été touchés dans la fenêtre du run', async () => {
    const { service, store } = build({ contactsTouched: 5 })
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'contacts', count: 5, label: { fr: '5 contacts retrouvés', en: '5 contacts found' } },
    ])
  })

  it('#2207.28 — porte une ligne « rendez-vous » quand des rendez-vous apparaissent dans la fenêtre du run', async () => {
    const { service, store } = build({ meetingsFound: 2 })
    const run = await service.startRun('ws-1', 'user-1', 'google')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'meetings', count: 2, label: { fr: '2 rendez-vous retrouvés', en: '2 meetings found' } },
    ])
  })

  it('#2388.42 — porte une ligne « rendez-vous à préparer » distincte, quand le contrôleur passe un compte', async () => {
    const { service, store } = build({ meetingsFound: 2 })
    const run = await service.startRun('ws-1', 'user-1', 'google')
    await service.finishRun(run.id, 'ws-1', 3)
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'meetings', count: 2, label: { fr: '2 rendez-vous retrouvés', en: '2 meetings found' } },
      {
        domain: 'meetings_to_prepare',
        count: 3,
        label: { fr: '3 rendez-vous à préparer', en: '3 meetings to prepare' },
      },
    ])
  })

  it('#2388.42 — aucune ligne « rendez-vous à préparer » quand le contrôleur ne passe rien (agenda muet)', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'google')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([])
  })

  it('#2207.29 — porte une ligne « échanges », disjointe des rendez-vous', async () => {
    const { service, store } = build({ meetingsFound: 2, exchangesFound: 8 })
    const run = await service.startRun('ws-1', 'user-1', 'google')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'meetings', count: 2, label: { fr: '2 rendez-vous retrouvés', en: '2 meetings found' } },
      { domain: 'exchanges', count: 8, label: { fr: '8 échanges retrouvés', en: '8 exchanges found' } },
    ])
  })

  it('#2207.30 — porte une ligne « actions » quand des gestes ont été journalisés dans la fenêtre du run', async () => {
    const { service, store } = build({ actionsLogged: 4 })
    const run = await service.startRun('ws-1', 'user-1', 'google')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'actions', count: 4, label: { fr: '4 actions enregistrées', en: '4 actions logged' } },
    ])
  })

  it('#2207.31 — porte une ligne « ambiguïtés » quand une fiche touchée partage un nom avec une autre du même compte', async () => {
    const { service, store } = build({
      touchedContacts: [{ account_id: 'acc-1', full_name: 'Marie Dupont' }],
      ambiguityContacts: [
        { account_id: 'acc-1', full_name: 'Marie Dupont' },
        { account_id: 'acc-1', full_name: 'marie dupont' },
      ],
    })
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'contacts', count: 1, label: { fr: '1 contact retrouvé', en: '1 contact found' } },
      {
        domain: 'ambiguities',
        count: 2,
        label: { fr: '2 fiches à confirmer avant de les rapprocher', en: '2 records to confirm before merging them' },
      },
    ])
  })

  it('#2207.32 — porte une ligne « pages » quand des pages ont été ajoutées à la base de connaissance dans la fenêtre du run', async () => {
    const { service, store } = build({ pagesAdded: 6 })
    const run = await service.startRun('ws-1', 'user-1', 'notion')
    await service.finishRun(run.id, 'ws-1')
    const finished = store.get(run.id)
    expect(finished?.['summary']).toEqual([
      { domain: 'pages', count: 6, label: { fr: '6 pages alimentées', en: '6 pages indexed for Laura' } },
    ])
  })
})

describe('failRun — referme le run en `failed` avec un motif FR+EN clair', () => {
  it('jamais de texte technique — un motif compréhensible', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'notion')
    await service.failRun(run.id, 'notion', new Error('ECONNRESET'))
    const failed = store.get(run.id)
    expect(failed?.['status']).toBe('failed')
    expect(failed?.['error_fr']).not.toContain('ECONNRESET')
    expect(failed?.['error_en']).toBeTruthy()
  })
})

describe('un run introuvable ou d’un autre espace', () => {
  it('rend `null` — jamais distingué à l’écran', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'notion')
    expect(await service.getRun('ws-OTHER', run.id)).toBeNull()
    expect(await service.getRun('ws-1', 'unknown-id')).toBeNull()
  })
})

describe('reconcileStaleRuns — la reprise honnête après un redémarrage (#2110.21)', () => {
  it('referme en `failed`, motif distinct, un run non terminal plus vieux que le seuil', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.advance(run.id, 'matching_accounts')
    const wellPast = new Date(Date.now() + 31 * 60 * 1000)
    const count = await service.reconcileStaleRuns(wellPast)
    expect(count).toBe(1)
    const reconciled = store.get(run.id)
    expect(reconciled?.['status']).toBe('failed')
    expect(reconciled?.['error_fr']).toContain('interrompue')
    expect(reconciled?.['error_en']).toContain('interrupted')
  })

  it('ne touche pas un run non terminal encore récent', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    const count = await service.reconcileStaleRuns(new Date())
    expect(count).toBe(0)
    expect(store.get(run.id)?.['status']).toBe('pending')
  })

  it('ne touche jamais un run déjà terminal', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    await service.finishRun(run.id, 'ws-1')
    const wellPast = new Date(Date.now() + 31 * 60 * 1000)
    const count = await service.reconcileStaleRuns(wellPast)
    expect(count).toBe(0)
    expect(store.get(run.id)?.['status']).toBe('completed')
  })

  it('rend la garde anti-double-lancement à nouveau franchissable après reconciliation', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'hubspot')
    const wellPast = new Date(Date.now() + 31 * 60 * 1000)
    await service.reconcileStaleRuns(wellPast)
    expect(await service.getActiveRun('ws-1', 'hubspot')).toBeNull()
    expect(run.status).toBe('pending')
  })
})

describe('un run jamais pris par le worker finit en erreur NOMMÉE (#4591.1)', () => {
  it('lu après le délai de prise en charge, un run encore `pending` passe en `failed` avec un motif qui le dit', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'pipedrive')
    store.set(run.id, { ...store.get(run.id), started_at: new Date(Date.now() - 3 * 60 * 1000) })
    const read = await service.getRun('ws-1', run.id)
    expect(read?.status).toBe('failed')
    expect(read?.error_fr).toContain('jamais été prise en charge')
    expect(read?.error_en).toContain('never picked up')
    expect(read?.finished_at).toBeInstanceOf(Date)
    expect(await service.getActiveRun('ws-1', 'pipedrive')).toBeNull()
  })

  it('le dernier run lu par `getLatestRun` suit la même règle', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'pipedrive')
    store.set(run.id, { ...store.get(run.id), started_at: new Date(Date.now() - 3 * 60 * 1000) })
    expect((await service.getLatestRun('ws-1', 'pipedrive'))?.status).toBe('failed')
  })

  it('un run `pending` récent reste en attente — la file a le droit d’avoir un peu de retard', async () => {
    const { service } = build()
    const run = await service.startRun('ws-1', 'user-1', 'pipedrive')
    expect((await service.getRun('ws-1', run.id))?.status).toBe('pending')
  })

  it('un run déjà avancé (`reading_sources`) n’est jamais refermé par ce chemin, même vieux de 3 min', async () => {
    const { service, store } = build()
    const run = await service.startRun('ws-1', 'user-1', 'pipedrive')
    await service.advance(run.id, 'reading_sources')
    store.set(run.id, { ...store.get(run.id), started_at: new Date(Date.now() - 3 * 60 * 1000) })
    expect((await service.getRun('ws-1', run.id))?.status).toBe('reading_sources')
  })
})

describe('getLatestRun — retrouver le résumé sans garder d’identifiant', () => {
  it('rend le run le plus RÉCENT de ce connecteur', async () => {
    const { service } = build()
    const older = await service.startRun('ws-1', 'user-1', 'hubspot')
    await new Promise(resolve => setTimeout(resolve, 2))
    const newer = await service.startRun('ws-1', 'user-1', 'hubspot')
    const latest = await service.getLatestRun('ws-1', 'hubspot')
    expect(latest?.id).toBe(newer.id)
    expect(latest?.id).not.toBe(older.id)
  })

  it('`null` quand ce connecteur n’a jamais été synchronisé', async () => {
    const { service } = build()
    expect(await service.getLatestRun('ws-1', 'notion')).toBeNull()
  })
})

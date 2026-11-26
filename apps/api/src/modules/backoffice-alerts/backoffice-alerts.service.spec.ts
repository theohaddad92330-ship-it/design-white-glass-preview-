import { computeClientHealth, type ClientHealthInput } from '../admin/client-health'
import { antiRepeatMsFor, decideAlertAction, type AlertKind } from './backoffice-alert-dispatch'
import { BackofficeAlertsService } from './backoffice-alerts.service'

/** Un constructeur de requête qui rend `rows` — `job_bloque` lit les runs
 *  bloqués par là depuis le 03/11/2026 (il doit exclure les salles de
 *  démonstration, ce qu'un `find` ne sait pas faire). */
function makeQueryBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    getRawMany: jest.fn().mockResolvedValue(rows),
  }
  return builder
}

function makeRepo(rows: unknown[], count = 0, rawRows: unknown[] = []) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(count),
    createQueryBuilder: jest.fn(() => makeQueryBuilder(rawRows)),
  } as never
}

/** `dataSource.query` par défaut répond `SELECT 1` sans lever — la sonde
 *  `api_indisponible` est donc « saine » tant qu'un test ne la fait pas
 *  échouer explicitement. */
function makeDataSource(queryImpl?: () => Promise<unknown>) {
  return { query: jest.fn(queryImpl ?? (async () => [{ '?column?': 1 }])) } as never
}

const passThroughLock = async (_name: string, run: () => Promise<void>) => run()

/**
 * #1676.1 — un dispatcheur qui réutilise le VRAI `decideAlertAction` (le même
 * que `BackofficeAlertDispatchService`) sur un état en mémoire au lieu de
 * Redis. Preuve qu'une alerte ne part qu'UNE fois par fait : contrairement à
 * `jest.fn()` qui compterait des APPELS, ceci compte des ENVOIS RÉELS après
 * dé-duplication — la même dérivation que la production, pas une réplique.
 */
function makeRealDedupDispatch() {
  const state = new Map<string, { state: 'firing' | 'resolved'; lastSentAt: string }>()
  const sent: Array<{ kind: AlertKind; subject: string }> = []
  const dispatch = jest.fn(async (input: { kind: AlertKind; subject: string; resolved: boolean }) => {
    const key = `${input.kind} ${input.subject}`
    const decision = decideAlertAction({
      existing: state.get(key) ?? null,
      resolved: input.resolved,
      now: new Date(),
      antiRepeatMs: antiRepeatMsFor(input.kind),
    })
    if (decision.action !== 'skip') {
      state.set(key, {
        state: decision.action === 'resolve' ? 'resolved' : 'firing',
        lastSentAt: new Date().toISOString(),
      })
      sent.push({ kind: input.kind, subject: input.subject })
    }
    return { action: decision.action, reason: decision.reason, channel: null }
  })
  const listFiringSubjects = jest.fn(async (kind: AlertKind) =>
    [...state.entries()]
      .filter(([key, value]) => key.startsWith(`${kind} `) && value.state === 'firing')
      .map(([key]) => key.slice(kind.length + 1)),
  )
  return { dispatch: { dispatch, listFiringSubjects }, sent }
}

function makeService(overrides?: {
  dispatch?: { dispatch: jest.Mock; listFiringSubjects: jest.Mock }
  securityJournal?: jest.Mock
  underLock?: typeof passThroughLock
  runs?: unknown
  costs?: unknown
  ledger?: unknown
  subscriptions?: unknown
  workspaces?: unknown
  manualTerms?: unknown
  manualInvoices?: unknown
  dataSource?: unknown
  clientHealth?: jest.Mock
}) {
  const clientHealth = overrides?.clientHealth ?? jest.fn().mockResolvedValue({ rows: [] })
  const dispatch = overrides?.dispatch ?? {
    dispatch: jest.fn().mockResolvedValue({ action: 'send' }),
    listFiringSubjects: jest.fn().mockResolvedValue([]),
  }
  const securityJournal = overrides?.securityJournal ?? jest.fn().mockResolvedValue({ anomalies: [] })
  const underLock = overrides?.underLock ?? passThroughLock
  const runs = overrides?.runs ?? makeRepo([])
  const costs = overrides?.costs ?? makeRepo([])
  const ledger = overrides?.ledger ?? makeRepo([])
  const subscriptions = overrides?.subscriptions ?? makeRepo([])
  const workspaces = overrides?.workspaces ?? makeRepo([])
  const manualTerms = overrides?.manualTerms ?? makeRepo([])
  const manualInvoices = overrides?.manualInvoices ?? makeRepo([])
  const dataSource = overrides?.dataSource ?? makeDataSource()
  const service = new BackofficeAlertsService(
    dispatch as never,
    securityJournal as never,
    underLock,
    runs as never,
    costs as never,
    ledger as never,
    subscriptions as never,
    workspaces as never,
    manualTerms as never,
    manualInvoices as never,
    dataSource as never,
    clientHealth as never,
  )
  return {
    service,
    clientHealth,
    dispatch,
    securityJournal,
    runs,
    costs,
    ledger,
    subscriptions,
    workspaces,
    manualTerms,
    manualInvoices,
    dataSource,
  }
}

/**
 * #1946.22 — décision Louis 13/09 batch 12, prise CONTRE la recommandation :
 * l'alerte OPÉRATEUR d'un espace à risque. Levée de `c64_analytique_produit`
 * et du refus du 10/09 pour CE SEUL usage — voir `workspace-risk-alert.ts`.
 */
describe('BackofficeAlertsService — #1946.22 espace à risque (décision Louis 13/09, batch 12)', () => {
  const TODAY = new Date('2026-09-13T08:00:00.000Z')
  const ENV_KEYS = ['WORKSPACE_RISK_ALERTS_DISABLED', 'BACKOFFICE_URL'] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    jest.useRealTimers()
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  const EN_RISQUE: ClientHealthInput = {
    createdAt: '2026-01-05T00:00:00.000Z',
    lastActivityAt: '2026-07-01T00:00:00.000Z',
    featuresUsed: 1,
    featuresAvailable: 10,
    creditsUsed: 10,
    creditsAllowance: 40,
    activeMembers: 1,
    seats: 5,
    incidents: null,
    runs: null,
  }

  function row(workspaceId: string, name: string, input: ClientHealthInput) {
    return {
      workspaceId,
      name,
      // La vraie ligne de `/revenus/clients` porte l'adresse du propriétaire :
      // elle doit rester DANS le back-office.
      ownerEmail: `owner-${workspaceId}@example.com`,
      health: computeClientHealth(input, TODAY),
    }
  }

  it('un score MESURÉ sous le seuil → une alerte `espace_a_risque`, sujet = l’espace, JAMAIS résolue', async () => {
    process.env['BACKOFFICE_URL'] = 'https://bo.bellum-ai.com'
    const clientHealth = jest.fn().mockResolvedValue({ rows: [row('ws-1', 'Acme Conseil', EN_RISQUE)] })
    const { service, dispatch } = makeService({ clientHealth })

    await service.checkWorkspacesAtRisk(TODAY)

    expect(clientHealth).toHaveBeenCalledWith(TODAY)
    expect(dispatch.dispatch).toHaveBeenCalledTimes(1)
    const [sent] = dispatch.dispatch.mock.calls[0] as [Record<string, unknown>]
    expect(sent).toMatchObject({ kind: 'espace_a_risque', subject: 'ws-1', title: 'Acme Conseil', resolved: false })
    expect(String(sent['detail'])).toContain('https://bo.bellum-ai.com/revenus/clients?search=Acme%20Conseil')
    // Aucune donnée de personne, aucun contenu d'échange.
    expect(JSON.stringify(sent)).not.toContain('@')
  })

  it('« non mesuré » n’alerte pas, et un espace sain non plus — aucun dispatch, aucune résolution', async () => {
    const clientHealth = jest.fn().mockResolvedValue({
      rows: [
        row('ws-jeune', 'Jeune', { ...EN_RISQUE, createdAt: '2026-09-10T00:00:00.000Z' }),
        row('ws-muet', 'Muet', { ...EN_RISQUE, lastActivityAt: null, featuresUsed: null, creditsUsed: null }),
        row('ws-sain', 'Sain', {
          ...EN_RISQUE,
          lastActivityAt: '2026-09-12T00:00:00.000Z',
          creditsUsed: 40,
          activeMembers: 5,
        }),
      ],
    })
    const { service, dispatch } = makeService({ clientHealth })

    await service.checkWorkspacesAtRisk(TODAY)

    expect(dispatch.dispatch).not.toHaveBeenCalled()
  })

  it('une salle de DÉMONSTRATION n’alerte jamais', async () => {
    const clientHealth = jest.fn().mockResolvedValue({ rows: [row('demo-1', 'Salle 3', EN_RISQUE)] })
    const workspaces = makeRepo([{ id: 'demo-1' }])
    const { service, dispatch } = makeService({ clientHealth, workspaces })

    await service.checkWorkspacesAtRisk(TODAY)

    expect(dispatch.dispatch).not.toHaveBeenCalled()
  })

  it('interrupteur posé → AUCUNE lecture de santé et aucun envoi', async () => {
    process.env['WORKSPACE_RISK_ALERTS_DISABLED'] = 'true'
    const clientHealth = jest.fn().mockResolvedValue({ rows: [row('ws-1', 'Acme', EN_RISQUE)] })
    const { service, dispatch } = makeService({ clientHealth })

    await service.checkWorkspacesAtRisk(TODAY)

    expect(clientHealth).not.toHaveBeenCalled()
    expect(dispatch.dispatch).not.toHaveBeenCalled()
  })

  it('le passage quotidien prend SON verrou avant de lire', async () => {
    const underLock = jest.fn(passThroughLock)
    const clientHealth = jest.fn().mockResolvedValue({ rows: [] })
    const { service } = makeService({ underLock, clientHealth })

    await service.runWorkspaceRisk()

    expect(underLock).toHaveBeenCalledWith('backoffice-alerts-workspace-risk', expect.any(Function))
    expect(clientHealth).toHaveBeenCalledTimes(1)
  })

  it('le passage des 5 minutes NE lit PAS la santé des espaces — le calcul reste quotidien', async () => {
    const clientHealth = jest.fn().mockResolvedValue({ rows: [row('ws-1', 'Acme', EN_RISQUE)] })
    const { service } = makeService({ clientHealth })

    await service.runNow()

    expect(clientHealth).not.toHaveBeenCalled()
  })

  it('⚠️ SANS HARCELER — un espace toujours à risque, vu chaque jour, n’alerte qu’UNE fois par semaine', async () => {
    jest.useFakeTimers({ now: TODAY })
    const { dispatch, sent } = makeRealDedupDispatch()
    const clientHealth = jest.fn().mockResolvedValue({ rows: [row('ws-1', 'Acme', EN_RISQUE)] })
    const { service } = makeService({ dispatch, clientHealth })

    for (let day = 0; day < 7; day += 1) {
      jest.setSystemTime(new Date(TODAY.getTime() + day * 24 * 60 * 60 * 1000))
      await service.checkWorkspacesAtRisk(new Date())
    }
    expect(sent.filter(s => s.kind === 'espace_a_risque')).toHaveLength(1)

    jest.setSystemTime(new Date(TODAY.getTime() + 7 * 24 * 60 * 60 * 1000))
    await service.checkWorkspacesAtRisk(new Date())
    expect(sent.filter(s => s.kind === 'espace_a_risque')).toHaveLength(2)
  })
})

describe('BackofficeAlertsService — composition (#1676.1, #1671.3)', () => {
  it('appelle le verrou reçu par jeton avant d’exécuter le passage', async () => {
    const underLock = jest.fn(passThroughLock)
    const { service } = makeService({ underLock })

    await service.run()

    expect(underLock).toHaveBeenCalledWith('backoffice-alerts', expect.any(Function))
  })

  it('#1671.3 — une anomalie de connexion est envoyée au dispatcheur avec le sujet acteur:type', async () => {
    const securityJournal = jest.fn().mockResolvedValue({
      anomalies: [{ type: 'pays_inhabituel', actorEmail: 'louis@x.com', detail: 'Connexion depuis FR' }],
    })
    const { service, dispatch } = makeService({ securityJournal })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'connexion_anormale', subject: 'louis@x.com:pays_inhabituel', resolved: false }),
    )
  })

  it('une anomalie disparue de la fenêtre envoie une résolution', async () => {
    const dispatch = {
      dispatch: jest.fn().mockResolvedValue({ action: 'resolve' }),
      listFiringSubjects: jest.fn().mockResolvedValue(['louis@x.com:pays_inhabituel']),
    }
    const { service } = makeService({ dispatch })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'connexion_anormale', subject: 'louis@x.com:pays_inhabituel', resolved: true }),
    )
  })

  it('taux d’échec d’analyse mesurable et en défaut → dispatch avec resolved:false', async () => {
    const runs = makeRepo(Array.from({ length: 5 }, (_, i) => ({ status: i < 4 ? 'error' : 'completed' })))
    const { service, dispatch } = makeService({ runs })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'taux_echec_analyse', subject: 'global', resolved: false }),
    )
  })

  it('non mesuré (échantillon insuffisant) → aucun dispatch pour cette mesure', async () => {
    const runs = makeRepo([{ status: 'error' }])
    const { service, dispatch } = makeService({ runs })

    await service.runNow()

    expect(dispatch.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'taux_echec_analyse' }))
  })
})

describe('BackofficeAlertsService — #1676.1 api_indisponible (câblage neuf de ce lot)', () => {
  it('la base répond → dispatch mesuré, resolved:true (sain, jamais déclaré sans la sonde)', async () => {
    const { service, dispatch, dataSource } = makeService()

    await service.runNow()

    expect((dataSource as { query: jest.Mock }).query).toHaveBeenCalledWith('SELECT 1')
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'api_indisponible', subject: 'database', resolved: true }),
    )
  })

  it('la sonde DB échoue avec une connexion JAMAIS établie → dispatch en défaut, resolved:false, avec le détail réel', async () => {
    // `ECONNREFUSED` : le port est fermé, la connexion n'a jamais abouti —
    // `dispatchFailureOutcome` (@bellum/contracts) le classe `failed`, un
    // échec CONFIRMÉ. Voir `operational-alerts.spec.ts` pour le pourquoi.
    const dataSource = makeDataSource(() =>
      Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    )
    const { service, dispatch } = makeService({ dataSource })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'api_indisponible',
        subject: 'database',
        resolved: false,
        detail: expect.stringContaining('ECONNREFUSED'),
      }),
    )
  })

  it('⚠️ une requête PARTIE sans réponse (ex. ECONNRESET) est `unknown` — aucun dispatch, jamais un faux défaut', async () => {
    // « Un timeout n'est pas un échec » : sans ça, chaque hoquet réseau
    // crierait au loup. `dispatchFailureOutcome` classe cette erreur
    // `unknown` — la mesure devient `unmeasured`, et comme pour
    // `checkDailyCost`/`checkAnalysisFailureRate`, une mesure impossible ne
    // dispatch RIEN (ni breached:true, ni un faux resolved:true).
    const dataSource = makeDataSource(() =>
      Promise.reject(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
    )
    const { service, dispatch } = makeService({ dataSource })

    await service.runNow()

    expect(dispatch.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'api_indisponible' }))
  })
})

describe('BackofficeAlertsService — #1676.1 job_bloque (câblage neuf de ce lot)', () => {
  it('aucun run bloqué → dispatch mesuré, resolved:true', async () => {
    const runs = makeRepo([], 0)
    const { service, dispatch } = makeService({ runs })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'job_bloque', subject: 'analysis_worker', resolved: true }),
    )
  })

  /** La garde doit savoir dire NON : un run semé `analyzing` dans une salle de
   *  démonstration n'est pas une panne, et le faucheur n'y touchera jamais. Si
   *  l'exclusion disparaît de la requête, l'alerte redevient un mail horaire
   *  sur une donnée saine. */
  it('écarte les runs des salles de démonstration — même population que le faucheur', async () => {
    const runs = makeRepo([], 0, [])
    const { service, dispatch } = makeService({ runs })

    await service.runNow()

    const builder = (runs as unknown as { createQueryBuilder: jest.Mock }).createQueryBuilder.mock.results[0]
      ?.value as Record<string, jest.Mock>
    const clauses = builder.andWhere.mock.calls.map(([sql]) => String(sql)).join(' ')
    expect(clauses).toContain('is_demo')
    expect(dispatch.dispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job_bloque', resolved: true }))
  })

  it('des runs encore `analyzing` au-delà du délai dur du worker → dispatch en défaut, resolved:false', async () => {
    // `checkAnalysisFailureRate` lit `runs.find(...)` (vide ⇒ non mesuré, aucun
    // dispatch) ; `job_bloque` lit désormais le constructeur de requête, parce
    // qu'il doit exclure les salles de démonstration (03/11/2026).
    const runs = makeRepo([], 0, [{ created_at: new Date(Date.now() - 47 * 60 * 1000) }])
    const { service, dispatch } = makeService({ runs })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'job_bloque',
        subject: 'analysis_worker',
        resolved: false,
        detail: expect.stringContaining('1 analyse'),
      }),
    )
  })
})

describe('BackofficeAlertsService — #1676.1 nouveau_client (décision du 10/09/2026)', () => {
  it('un `grant_plan` né d’un CHECKOUT, récent → dispatch nouveau_client avec le nom de l’espace et le palier', async () => {
    const ledger = makeRepo([{ owner_user_id: 'user-1', workspace_id: 'ws-1', reason: 'plan:team (checkout evt_1)' }])
    const workspaces = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ name: 'Acme ESN' }),
    }
    const { service, dispatch } = makeService({ ledger: ledger as never, workspaces: workspaces as never })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'nouveau_client',
        subject: 'user-1',
        title: 'Acme ESN',
        detail: expect.stringContaining('team'),
        resolved: false,
      }),
    )
  })

  it('⚠️ un `grant_plan` né d’un CHANGEMENT DE PALIER (portail, subscription.updated) n’est PAS un nouveau client', async () => {
    const ledger = makeRepo([
      { owner_user_id: 'user-1', workspace_id: 'ws-1', reason: 'plan:team (subscription.updated sub_1)' },
    ])
    const { service, dispatch } = makeService({ ledger: ledger as never })

    await service.runNow()

    expect(dispatch.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'nouveau_client' }))
  })

  it('un espace non résolu affiche un texte honnête, jamais un nom inventé', async () => {
    const ledger = makeRepo([{ owner_user_id: 'user-1', workspace_id: null, reason: 'plan:team (checkout evt_1)' }])
    const { service, dispatch } = makeService({ ledger: ledger as never })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'nouveau_client', title: '(espace non résolu)' }),
    )
  })
})

describe('BackofficeAlertsService — #1676.1 churn_client, branche Stripe (décision du 10/09/2026)', () => {
  const cancelled = {
    user_id: 'user-2',
    billing_mode: 'stripe',
    plan: 'trial',
    accounts_limit: 0,
    enrichment_credits: 0,
    extra_seats: 0,
    topup_analyses: 0,
    stripe_subscription_id: 'sub_2',
  }

  it('la signature exacte d’une résiliation Stripe → dispatch churn_client', async () => {
    const subscriptions = makeRepo([cancelled])
    const workspaces = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ name: 'Beta ESN' }),
    }
    const { service, dispatch } = makeService({
      subscriptions: subscriptions as never,
      workspaces: workspaces as never,
    })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'churn_client',
        subject: 'user-2',
        title: 'Beta ESN',
        detail: 'Abonnement annulé.',
        resolved: false,
      }),
    )
  })

  it('⚠️ n’attrape PAS un compte tout neuf (`plan: decouverte`) — preuve que la garde ne vise pas les nouveaux signups', async () => {
    const subscriptions = makeRepo([{ ...cancelled, plan: 'decouverte' }])
    const { service, dispatch } = makeService({ subscriptions: subscriptions as never })

    await service.runNow()

    expect(dispatch.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'churn_client', subject: 'user-2' }),
    )
  })
})

describe('BackofficeAlertsService — #1676.1 churn_client, branche facture (décision du 10/09/2026)', () => {
  it('un engagement échu SANS facture depuis → dispatch churn_client (même dérivation que le balayage quotidien)', async () => {
    const manualTerms = makeRepo([
      { workspace_id: 'ws-3', period: 'monthly', start_date: '2025-01-01', commitment_months: 1 },
    ])
    const manualInvoices = makeRepo([])
    const workspaces = {
      find: jest.fn().mockResolvedValue([{ id: 'ws-3', name: 'Gamma ESN' }]),
      findOne: jest.fn().mockResolvedValue(null),
    }
    const { service, dispatch } = makeService({
      manualTerms: manualTerms as never,
      manualInvoices: manualInvoices as never,
      workspaces: workspaces as never,
    })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'churn_client',
        subject: 'ws-3',
        title: 'Gamma ESN',
        detail: expect.stringContaining('Engagement échu'),
        resolved: false,
      }),
    )
  })

  it('une facture couvre enfin la période → résolution, et JAMAIS un sujet Stripe partageant le même `kind`', async () => {
    // Plus « échu » : une facture couvre la période qui suit l'engagement.
    const manualTerms = makeRepo([
      { workspace_id: 'ws-3', period: 'monthly', start_date: '2025-01-01', commitment_months: 1 },
    ])
    const manualInvoices = makeRepo([
      { workspace_id: 'ws-3', period_start: '2025-02-01', period_end: '2025-02-28', payment_status: 'paid' },
    ])
    const workspaces = {
      find: jest.fn().mockResolvedValue([{ id: 'ws-3', name: 'Gamma ESN' }]),
      findOne: jest.fn().mockResolvedValue(null),
    }
    const dispatch = {
      dispatch: jest.fn().mockResolvedValue({ action: 'resolve' }),
      // Un sujet Stripe (`user_id`) qui traînerait dans le MÊME `firing:churn_client`
      // ne doit JAMAIS être touché par la résolution de la branche facture.
      // (kind-aware : `connexion_anormale` a son propre appel dans le même
      // passage et ne doit pas hériter de cette liste.)
      listFiringSubjects: jest
        .fn()
        .mockImplementation(async (kind: string) =>
          kind === 'churn_client' ? ['ws-3', 'a-stripe-user-id-not-a-workspace'] : [],
        ),
    }
    const { service } = makeService({
      manualTerms: manualTerms as never,
      manualInvoices: manualInvoices as never,
      workspaces: workspaces as never,
      dispatch,
    })

    await service.runNow()

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'churn_client', subject: 'ws-3', resolved: true }),
    )
    expect(dispatch.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'a-stripe-user-id-not-a-workspace' }),
    )
  })
})

describe('BackofficeAlertsService — #1676.1 une alerte ne part qu’UNE fois par fait (dé-duplication réelle)', () => {
  it('⚠️ un abonnement annulé, vu à trois passages consécutifs, n’envoie churn_client qu’UNE fois', async () => {
    const cancelled = {
      user_id: 'user-9',
      billing_mode: 'stripe',
      plan: 'trial',
      accounts_limit: 0,
      enrichment_credits: 0,
      extra_seats: 0,
      topup_analyses: 0,
      stripe_subscription_id: 'sub_9',
    }
    const { dispatch, sent } = makeRealDedupDispatch()
    const subscriptions = makeRepo([cancelled])
    const { service } = makeService({ subscriptions: subscriptions as never, dispatch: dispatch as never })

    // Trois passages du cron de 5 minutes voient tous la MÊME ligne encore
    // fraîche (`updated_at` dans la fenêtre) — « annulé puis réactivé puis
    // réannulé le même jour » vu de la base : à chaque instant interrogé, une
    // seule photo de l'état, jamais l'historique intermédiaire.
    await service.runNow()
    await service.runNow()
    await service.runNow()

    expect(sent.filter(s => s.kind === 'churn_client' && s.subject === 'user-9')).toHaveLength(1)
  })

  it('un même premier paiement, vu à deux passages, n’envoie nouveau_client qu’UNE fois', async () => {
    const { dispatch, sent } = makeRealDedupDispatch()
    const ledger = makeRepo([
      { owner_user_id: 'user-10', workspace_id: 'ws-10', reason: 'plan:team (checkout evt_10)' },
    ])
    const { service } = makeService({ ledger: ledger as never, dispatch: dispatch as never })

    await service.runNow()
    await service.runNow()

    expect(sent.filter(s => s.kind === 'nouveau_client' && s.subject === 'user-10')).toHaveLength(1)
  })
})

describe('BackofficeAlertsService — reportProviderCreditsExhausted (#2528.3)', () => {
  it('dispatch un provider_credits_exhausted dont le sujet EST la source, resolved par défaut à false', async () => {
    const { service, dispatch } = makeService()

    await service.reportProviderCreditsExhausted({
      source: 'BRAVE_API_KEY',
      sinceIso: '2026-09-17T12:16:28.000Z',
      degraded: 'La recherche web est dégradée pour tous les espaces.',
    })

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'provider_credits_exhausted',
        subject: 'BRAVE_API_KEY',
        title: 'BRAVE_API_KEY',
        resolved: false,
      }),
    )
    const call = dispatch.dispatch.mock.calls[0][0]
    expect(call.detail).toContain('BRAVE_API_KEY')
    expect(call.detail).toContain('La recherche web est dégradée pour tous les espaces.')
  })

  it('resolved:true transmis tel quel — la source revient puis retombe peut ré-alerter', async () => {
    const { service, dispatch } = makeService()

    await service.reportProviderCreditsExhausted({
      source: 'BRAVE_API_KEY',
      sinceIso: '2026-09-17T12:16:28.000Z',
      degraded: 'x',
      resolved: true,
    })

    expect(dispatch.dispatch).toHaveBeenCalledWith(expect.objectContaining({ resolved: true }))
  })
})

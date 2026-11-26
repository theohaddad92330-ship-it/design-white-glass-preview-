import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import type { IntegrationDeliveryEntity } from '../../database/entities/integration-delivery.entity'
import type { IntegrationEntity } from '../../database/entities/integration.entity'
import { setIntegrationEventsSchema, setIntegrationSchema } from './dto/integrations.dto'
import {
  integrationWantsEvent,
  LAURA_JOB_COMPLETED_EVENT,
  PROVIDERS,
  validateProviderUrl,
} from './integration-providers'
import { DELIVERY_MAX_ATTEMPTS, type DeliveryJobData } from './integrations.queue'
import { IntegrationsService } from './integrations.service'
import { resolveBrand } from '@bellum/contracts'

// L'envoi d'un test passe par la garde SSRF, qui résout vraiment le nom
// d'hôte avant le `fetch` (mocké plus bas) — un test unitaire ne dépend pas
// d'une résolution DNS réelle, même vers un hôte public comme Slack/Discord.
jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }))

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/** In-memory stand-in for the TypeORM repository (multi-row, matches `where`). */
function makeRepo(seed: Partial<IntegrationEntity>[] = []) {
  let rows: Partial<IntegrationEntity>[] = seed.map((r, i) => ({
    id: `id-${i}`,
    created_at: new Date('2026-07-01'),
    events: null,
    ...r,
  }))
  // `where` absent = aucune restriction, comme le vrai TypeORM. Le journal
  // opérateur lit sans filtre quand aucun espace n'est demandé, et la fausse
  // repo doit refléter ce comportement plutôt que de tomber.
  const valueMatches = (actual: unknown, expected: unknown): boolean => {
    const op = expected as { _type?: string; _value?: unknown } | null
    if (op && typeof op === 'object' && op._type === 'in') {
      return Array.isArray(op._value) && op._value.includes(actual)
    }
    return actual === expected
  }
  const matches = (row: Partial<IntegrationEntity>, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => valueMatches((row as Record<string, unknown>)[k], v))
  return {
    find: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => rows.filter(r => matches(r, where))),
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => rows.find(r => matches(r, where)) ?? null,
    ),
    insert: jest.fn(async (row: Partial<IntegrationEntity>) => {
      rows.push({ id: `id-${rows.length}`, created_at: new Date('2026-07-02'), events: null, ...row })
    }),
    update: jest.fn(async (where: Record<string, unknown>, patch: Partial<IntegrationEntity>) => {
      rows = rows.map(r => (matches(r, where) ? { ...r, ...patch } : r))
    }),
    delete: jest.fn(async (where: Record<string, unknown>) => {
      rows = rows.filter(r => !matches(r, where))
    }),
    _rows: () => rows,
  } as unknown as Repository<IntegrationEntity> & { _rows: () => Partial<IntegrationEntity>[] }
}

/** In-memory stand-in for the deliveries journal repository. */
function makeDeliveriesRepo(seed: Partial<IntegrationDeliveryEntity>[] = []) {
  let rows: Partial<IntegrationDeliveryEntity>[] = seed.map((r, i) => ({
    id: `del-${i}`,
    created_at: new Date(2026, 6, 1, 12, 0, i),
    ...r,
  }))
  // `In([...])` arrive comme un FindOperator : le journal tous canaux lit
  // plusieurs intégrations d'un coup, la fausse repo doit savoir le faire.
  const valueMatches = (actual: unknown, expected: unknown): boolean => {
    const op = expected as { _type?: string; _value?: unknown } | null
    if (op && typeof op === 'object' && op._type === 'in') {
      return Array.isArray(op._value) && op._value.includes(actual)
    }
    return actual === expected
  }
  const matches = (row: Partial<IntegrationDeliveryEntity>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => valueMatches((row as Record<string, unknown>)[k], v))
  return {
    create: jest.fn((data: Partial<IntegrationDeliveryEntity>) => ({ ...data })),
    save: jest.fn(async (row: Partial<IntegrationDeliveryEntity>) => {
      const saved = { id: `del-${rows.length}`, created_at: new Date(2026, 6, 1, 12, 0, rows.length), ...row }
      rows.push(saved)
      return saved
    }),
    find: jest.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
      const sorted = rows
        .filter(r => matches(r, where))
        .sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0))
      return sorted.slice(0, take ?? sorted.length)
    }),
    update: jest.fn(async (where: Record<string, unknown>, patch: Partial<IntegrationDeliveryEntity>) => {
      rows = rows.map(r => (matches(r, where) ? { ...r, ...patch } : r))
    }),
    _rows: () => rows,
  } as unknown as Repository<IntegrationDeliveryEntity> & { _rows: () => Partial<IntegrationDeliveryEntity>[] }
}

function makeQueue() {
  return { add: jest.fn(async () => ({})) } as unknown as Queue<DeliveryJobData> & { add: jest.Mock }
}

/** Service + its fakes, wired the way the module does. */
function makeService(seed: Partial<IntegrationEntity>[] = []) {
  const repo = makeRepo(seed)
  const deliveries = makeDeliveriesRepo()
  const queue = makeQueue()
  const svc = new IntegrationsService(repo, deliveries, queue, brandsStub as never)
  return { svc, repo, deliveries, queue }
}

const USER = '11111111-1111-1111-1111-111111111111'
const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXXsecretXXXX'
const DISCORD_URL = 'https://discord.com/api/webhooks/123456789/XXXXsecretXXXX'
const TEAMS_URL = 'https://acme.webhook.office.com/webhookb2/abc@def/IncomingWebhook/xyz/uid'
const TEAMS_WORKFLOW_URL = 'https://prod-30.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke'
const GCHAT_URL = 'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k&token=t'
const WEBHOOK_URL = 'https://example.com/hooks/bellum'

describe('provider URL validation', () => {
  it('pins each chat provider to its own host and rejects foreign hosts', () => {
    expect(validateProviderUrl('slack', SLACK_URL)).toBeNull()
    expect(validateProviderUrl('slack', 'https://evil.example.com/x')).not.toBeNull()

    expect(validateProviderUrl('discord', DISCORD_URL)).toBeNull()
    expect(validateProviderUrl('discord', SLACK_URL)).not.toBeNull()

    expect(validateProviderUrl('teams', TEAMS_URL)).toBeNull()
    expect(validateProviderUrl('teams', TEAMS_WORKFLOW_URL)).toBeNull()
    expect(validateProviderUrl('teams', 'https://evil.example.com/x')).not.toBeNull()

    expect(validateProviderUrl('googlechat', GCHAT_URL)).toBeNull()
    expect(validateProviderUrl('googlechat', 'https://evil.example.com/x')).not.toBeNull()

    // Mattermost is self-hosted: pin the incoming-webhook PATH, not the host.
    expect(validateProviderUrl('mattermost', 'https://chat.acme.com/hooks/abc123DEF456')).toBeNull()
    expect(validateProviderUrl('mattermost', 'https://chat.acme.com/other')).not.toBeNull()
  })

  it('requires https everywhere, and allows any https host for the generic webhook', () => {
    expect(validateProviderUrl('webhook', WEBHOOK_URL)).toBeNull()
    expect(validateProviderUrl('webhook', 'http://example.com/x')).not.toBeNull()
    expect(validateProviderUrl('slack', 'http://hooks.slack.com/x')).not.toBeNull()
    // DTO-level shape check (absolute https URL, ≤ 500 chars).
    expect(setIntegrationSchema.safeParse({ url: WEBHOOK_URL }).success).toBe(true)
    expect(setIntegrationSchema.safeParse({ url: 'not a url' }).success).toBe(false)
  })
})

describe('event subscription (events allow-list)', () => {
  it('null means every event (legacy/compat), a list filters', () => {
    expect(integrationWantsEvent(null, 'buy_signal')).toBe(true)
    expect(integrationWantsEvent(undefined, 'analysis.completed')).toBe(true)
    expect(integrationWantsEvent(['buy_signal'], 'buy_signal')).toBe(true)
    expect(integrationWantsEvent(['buy_signal'], 'analysis.completed')).toBe(false)
    expect(integrationWantsEvent([], 'buy_signal')).toBe(false)
  })

  it('DTO accepts only registry events (or null to restore the default)', () => {
    expect(setIntegrationEventsSchema.safeParse({ events: ['buy_signal'] }).success).toBe(true)
    expect(setIntegrationEventsSchema.safeParse({ events: ['buy_signal', 'analysis.completed'] }).success).toBe(true)
    expect(setIntegrationEventsSchema.safeParse({ events: null }).success).toBe(true)
    expect(setIntegrationEventsSchema.safeParse({ events: ['made.up.event'] }).success).toBe(false)
    expect(setIntegrationEventsSchema.safeParse({}).success).toBe(false)
  })
})

describe('IntegrationsService', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  it('stores the Slack webhook encrypted (never in clear) and reports it connected', async () => {
    const { svc, repo } = makeService()

    const status = await svc.setSlack(USER, SLACK_URL)
    expect(status).toMatchObject({ provider: 'slack', connected: true, label: 'hooks.slack.com', events: null })

    const row = repo._rows().find(r => r.provider === 'slack')!
    expect(row.config_enc).toMatch(/^v1:/)
    expect(row.config_enc).not.toContain('secret')
    expect(row.label).toBe('hooks.slack.com')
  })

  it('rejects a URL that does not match the provider host (BadRequest, nothing stored)', async () => {
    const { svc, repo } = makeService()
    await expect(svc.set(USER, 'discord', SLACK_URL)).rejects.toBeInstanceOf(BadRequestException)
    expect(repo._rows()).toHaveLength(0)
  })

  it('lists every owned provider, reflecting which are connected', async () => {
    const { svc } = makeService()
    await svc.set(USER, 'discord', DISCORD_URL)
    const list = await svc.list(USER)
    expect(list.map(s => s.provider)).toEqual(PROVIDERS)
    expect(list.find(s => s.provider === 'discord')).toMatchObject({ connected: true, label: 'discord.com' })
    expect(list.find(s => s.provider === 'slack')?.connected).toBe(false)
  })

  it('rejects a test send when the provider is not configured (no network call)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const { svc } = makeService()
    await expect(svc.testSlack(USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends a Slack-shaped test message (text) to the stored Slack webhook', async () => {
    const { svc } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)

    await expect(svc.testSlack(USER)).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(SLACK_URL)
    expect(JSON.parse(String(init.body))).toHaveProperty('text')
  })

  it('sends a Discord-shaped test message (content) to the stored Discord webhook', async () => {
    const { svc } = makeService()
    await svc.set(USER, 'discord', DISCORD_URL)
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)

    await expect(svc.test(USER, 'discord')).resolves.toBeUndefined()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(DISCORD_URL)
    const body = JSON.parse(String(init.body))
    expect(body).toHaveProperty('content')
    expect(body).not.toHaveProperty('text')
  })

  it('surfaces a BadGateway when the chat webhook rejects the test message', async () => {
    const { svc } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 404 } as never)
    await expect(svc.testSlack(USER)).rejects.toBeInstanceOf(BadGatewayException)
  })

  it('notifyUser enqueues one retryable delivery job + one pending journal row per connected channel', async () => {
    const { svc, deliveries, queue } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    await svc.set(USER, 'discord', DISCORD_URL)
    await svc.setWebhook(USER, WEBHOOK_URL)
    const fetchSpy = jest.spyOn(global, 'fetch' as never)

    await svc.notifyUser(USER, { type: 'analysis.completed', text: 'Analyse terminée', data: { accountId: 'a1' } })

    // Delivery is queue-based now (retries + journal) — nothing goes out inline.
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledTimes(3)
    for (const [name, data, opts] of queue.add.mock.calls as [string, DeliveryJobData, { attempts: number }][]) {
      expect(name).toBe('deliver')
      expect(data.event).toMatchObject({ type: 'analysis.completed', text: 'Analyse terminée' })
      // The job payload never carries the webhook URL — the worker re-reads the
      // encrypted row at attempt time.
      expect(JSON.stringify(data)).not.toContain('hooks.slack.com')
      expect(opts.attempts).toBe(DELIVERY_MAX_ATTEMPTS)
    }
    const journal = deliveries._rows()
    expect(journal).toHaveLength(3)
    expect(journal.every(d => d.status === 'pending' && d.event === 'analysis.completed')).toBe(true)
  })

  it('notifyUser respects the events allow-list (filter) and null = everything (compat)', async () => {
    const { svc, queue } = makeService()
    await svc.setSlack(USER, SLACK_URL) // events: null → gets everything
    await svc.set(USER, 'discord', DISCORD_URL)
    await svc.setEvents(USER, 'discord', ['buy_signal']) // only buy signals

    await svc.notifyUser(USER, { type: 'analysis.completed', text: 'Analyse terminée' })
    expect(queue.add).toHaveBeenCalledTimes(1) // slack only

    await svc.notifyUser(USER, { type: 'buy_signal', text: 'Signal' })
    expect(queue.add).toHaveBeenCalledTimes(3) // both
  })

  /**
   * #1952.29 — ALLUMÉ PAR DÉFAUT, tranché Louis 16/09/2026 contre la
   * recommandation « éteint par défaut ». Le risque assumé : un canal branché
   * est un canal d'ÉQUIPE, le travail est le geste d'UNE personne. Ce que ce
   * test tient, c'est l'autre moitié de la décision : l'interrupteur existe, il
   * est à sa place, et il ÉTEINT vraiment.
   */
  it('#1952.29 — « Laura a terminé » part par défaut, et s’éteint quand la personne le décoche', async () => {
    const { svc, queue } = makeService()
    await svc.setSlack(USER, SLACK_URL) // aucune liste choisie → reçoit tout
    await svc.set(USER, 'discord', DISCORD_URL)
    // La personne décoche « Laura a terminé » sur CE canal, et garde le reste.
    await svc.setEvents(USER, 'discord', ['buy_signal', 'analysis.completed'])

    await svc.notifyUser(USER, { type: LAURA_JOB_COMPLETED_EVENT, text: '\u2705 Laura a termin\u00e9 \u2014 X' })

    expect(queue.add).toHaveBeenCalledTimes(1) // slack seul
    const [, data] = queue.add.mock.calls[0] as [string, DeliveryJobData]
    expect(data.event.type).toBe(LAURA_JOB_COMPLETED_EVENT)

    // TÉMOIN — le canal décoché reçoit toujours ce qu'il a gardé : la case ne
    // coupe QUE cet événement.
    await svc.notifyUser(USER, { type: 'analysis.completed', text: 'Dossier pr\u00eat' })
    expect(queue.add).toHaveBeenCalledTimes(3)
  })

  it('notifyUser never throws even when the queue is down', async () => {
    const { svc, queue } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    queue.add.mockRejectedValue(new Error('redis down'))
    await expect(svc.notifyUser(USER, { type: 'buy_signal', text: 'y' })).resolves.toBeUndefined()
  })

  it('setEvents stores a deduplicated list, and 404s when the provider is not connected', async () => {
    const { svc, repo } = makeService()
    await svc.setSlack(USER, SLACK_URL)

    const status = await svc.setEvents(USER, 'slack', ['buy_signal', 'buy_signal'])
    expect(status.events).toEqual(['buy_signal'])
    expect(repo._rows().find(r => r.provider === 'slack')?.events).toEqual(['buy_signal'])

    await expect(svc.setEvents(USER, 'discord', ['buy_signal'])).rejects.toBeInstanceOf(NotFoundException)
  })

  it('reconnecting (new URL) preserves the chosen events; list() surfaces them', async () => {
    const { svc } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    await svc.setEvents(USER, 'slack', ['analysis.completed'])

    const status = await svc.setSlack(USER, 'https://hooks.slack.com/services/T111/B111/newsecret')
    expect(status.events).toEqual(['analysis.completed'])

    const list = await svc.list(USER)
    expect(list.find(s => s.provider === 'slack')?.events).toEqual(['analysis.completed'])
  })

  describe('journal opérateur (back-office)', () => {
    it('rend la trace technique complète, que l’écran client ne porte plus', async () => {
      const { svc, deliveries } = makeService()
      await svc.setSlack(USER, SLACK_URL)
      await svc.notifyUser(USER, { type: 'buy_signal', text: 'signal' })
      const first = deliveries._rows()[0]
      await deliveries.update({ id: first?.id ?? '' }, { status: 'failed', http_status: 403, attempt: 2 })

      const journal = await svc.listAdminDeliveries({})
      expect(journal.rows).toHaveLength(1)
      expect(journal.rows[0]).toMatchObject({ provider: 'slack', userId: USER, httpStatus: 403, attempt: 2 })
      // L'URL du webhook porte un jeton : elle ne sort d'aucun journal, même
      // opérateur. Garantie héritée du journal utilisateur supprimé.
      expect(JSON.stringify(journal)).not.toContain('hooks.slack.com')
    })

    it('rend une liste vide plutôt que la plateforme entière quand l’espace demandé n’a aucun membre', async () => {
      // Filtrer large sur un filtre qu'on n'a pas su appliquer montrerait les
      // incidents d'un AUTRE client.
      const { svc } = makeService()
      await svc.setSlack(USER, SLACK_URL)
      await svc.notifyUser(USER, { type: 'buy_signal', text: 'signal' })

      await expect(svc.listAdminDeliveries({ workspaceId: 'ws-inconnu' })).resolves.toEqual({
        rows: [],
        truncated: false,
      })
    })

    it('dit qu’il a coupé plutôt que de laisser croire qu’il n’y avait rien d’autre', async () => {
      const { svc } = makeService()
      await svc.setSlack(USER, SLACK_URL)
      for (let i = 0; i < 4; i += 1) await svc.notifyUser(USER, { type: 'buy_signal', text: `signal ${i}` })

      await expect(svc.listAdminDeliveries({ limit: 3 })).resolves.toMatchObject({ truncated: true })
      await expect(svc.listAdminDeliveries({ limit: 4 })).resolves.toMatchObject({ truncated: false })
    })
  })

  // ---- last_used_at (Tool Registry v2 : `last_sync` = usage réel) ----------
  // Fan-out is queue-based (webhooks v2): the stamp lands from the worker once a
  // queued delivery actually succeeds (see integrations.worker.spec). Here we
  // only guard the DIRECT test-send path, which delivers inline.

  it('stamps last_used_at on a successful direct test send', async () => {
    const { svc, repo } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    expect(repo._rows().find(r => r.provider === 'slack')?.last_used_at ?? null).toBeNull()
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, status: 200 } as never)

    await svc.testSlack(USER)
    expect(repo._rows().find(r => r.provider === 'slack')?.last_used_at).toBeInstanceOf(Date)
  })

  it('does NOT stamp last_used_at when the direct test send failed (no invented usage)', async () => {
    const { svc, repo } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 500 } as never)

    await expect(svc.testSlack(USER)).rejects.toBeInstanceOf(BadGatewayException)
    expect(repo._rows().find(r => r.provider === 'slack')?.last_used_at ?? null).toBeNull()
  })

  it('disconnect removes only the targeted provider', async () => {
    const { svc } = makeService()
    await svc.setSlack(USER, SLACK_URL)
    await svc.setWebhook(USER, WEBHOOK_URL)
    await svc.disconnect(USER, 'slack')
    const list = await svc.list(USER)
    expect(list.find(s => s.provider === 'slack')?.connected).toBe(false)
    expect(list.find(s => s.provider === 'webhook')?.connected).toBe(true)
  })

  // Journal d'activité (Théo p.21 P2) — connect/disconnect append an audit line
  // carrying the provider name ONLY (never the webhook URL).
  describe('audit events (journal d’activité)', () => {
    const WS = 'ws-1'
    const auditDeps = () => ({
      workspaceContext: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'owner' }) },
      analytics: { track: jest.fn().mockResolvedValue(undefined) },
    })
    // Build the service with the delivery repo + queue in their real slots, then
    // the two optional audit deps last (matching the DI constructor order).
    const auditService = (workspaceContext: unknown, analytics: unknown) =>
      new IntegrationsService(
        makeRepo(),
        makeDeliveriesRepo(),
        makeQueue(),
        brandsStub as never,
        workspaceContext as never,
        analytics as never,
      )
    const flush = () => new Promise(resolve => setImmediate(resolve))

    it('set() appends integration_connected with the provider, never the URL', async () => {
      const { workspaceContext, analytics } = auditDeps()
      const svc = auditService(workspaceContext, analytics)

      await svc.setSlack(USER, SLACK_URL)
      await flush()

      expect(analytics.track).toHaveBeenCalledWith('integration_connected', {
        userId: USER,
        workspaceId: WS,
        properties: { provider: 'slack' },
      })
      expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(SLACK_URL)
    })

    it('disconnect() appends integration_disconnected', async () => {
      const { workspaceContext, analytics } = auditDeps()
      const svc = auditService(workspaceContext, analytics)
      await svc.setSlack(USER, SLACK_URL)
      analytics.track.mockClear()

      await svc.disconnect(USER, 'slack')
      await flush()

      expect(analytics.track).toHaveBeenCalledWith('integration_disconnected', {
        userId: USER,
        workspaceId: WS,
        properties: { provider: 'slack' },
      })
    })

    it('an audit failure never breaks the connect flow (best-effort)', async () => {
      const { analytics } = auditDeps()
      const workspaceContext = { resolveActiveWorkspace: jest.fn().mockRejectedValue(new Error('no workspace')) }
      const svc = auditService(workspaceContext, analytics)

      const status = await svc.setSlack(USER, SLACK_URL)
      await flush()
      expect(status.connected).toBe(true)
      expect(analytics.track).not.toHaveBeenCalled()
    })

    it('without the optional deps the flows behave exactly as before (no emit path)', async () => {
      const svc = new IntegrationsService(makeRepo(), makeDeliveriesRepo(), makeQueue(), brandsStub as never)
      const status = await svc.setSlack(USER, SLACK_URL)
      expect(status.connected).toBe(true)
      await expect(svc.disconnect(USER, 'slack')).resolves.toBeUndefined()
    })
  })
})

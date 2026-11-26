import { CrmFrequentSyncService } from './crm-frequent-sync.service'
import { crmFrequentSyncSchedulerId } from './crm-frequent-sync.queue'

const WS = 'ws-1'
const flush = async () => new Promise(resolve => setImmediate(resolve))

function harness(opts: { connection?: boolean; readSync?: Record<string, jest.Mock>; withMirror?: boolean } = {}) {
  const queue = {
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    removeJobScheduler: jest.fn().mockResolvedValue(true),
    getJobSchedulers: jest.fn().mockResolvedValue([]),
    add: jest.fn().mockResolvedValue(undefined),
  }
  const connections = {
    find: jest.fn().mockResolvedValue([{ workspace_id: WS, user_id: 'u-1', provider: 'hubspot' }]),
    findOne: jest.fn().mockResolvedValue(opts.connection === false ? null : { user_id: 'u-1', workspace_id: WS }),
  }
  const readSync = opts.readSync ?? {
    syncProvider: jest.fn().mockResolvedValue({ ran: true, outcomes: [] }),
    lastPassAt: jest.fn().mockResolvedValue(new Date('2026-10-19T08:00:00Z')),
    recordPassError: jest.fn().mockResolvedValue(undefined),
  }
  const mirror = opts.withMirror
    ? { syncProvider: jest.fn().mockResolvedValue({ counts: {}, archived: 0, errors: [] }) }
    : undefined
  const service = new CrmFrequentSyncService(
    queue as never,
    connections as never,
    readSync as never,
    undefined,
    mirror as never,
  )
  return { service, queue, connections, readSync, mirror }
}

describe('SYNC-C — CrmFrequentSyncService', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env['CRM_SYNC_DISABLED']
    delete process.env['CRM_SYNC_INTERVAL_MINUTES']
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('C.1 — pose un planificateur par (espace, fournisseur) toutes les 15 min, décalé (jitter) sous l’intervalle', async () => {
    const h = harness()
    await h.service.schedule({ workspaceId: WS, userId: 'u-1', provider: 'hubspot' })
    const [id, repeat, template] = h.queue.upsertJobScheduler.mock.calls[0]
    expect(id).toBe(crmFrequentSyncSchedulerId(WS, 'hubspot'))
    expect(repeat.every).toBe(15 * 60_000)
    expect(repeat.offset).toBeGreaterThanOrEqual(0)
    expect(repeat.offset).toBeLessThan(15 * 60_000)
    expect(template.data).toEqual({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' })
  })

  it('C.1 — l’intervalle suit CRM_SYNC_INTERVAL_MINUTES, lu à un seul endroit', async () => {
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = '30'
    const h = harness()
    await h.service.schedule({ workspaceId: WS, userId: 'u-1', provider: 'salesforce' })
    expect(h.queue.upsertJobScheduler.mock.calls[0][1].every).toBe(30 * 60_000)
  })

  it('C.1 — au démarrage : ajoute les connexions existantes, retire les planificateurs sans connexion', async () => {
    const h = harness()
    h.queue.getJobSchedulers.mockResolvedValue([
      { key: crmFrequentSyncSchedulerId('ws-parti', 'attio'), every: 15 * 60_000 },
      { key: 'autre-chose', every: 1 },
    ])
    const outcome = await h.service.reconcileSchedules()
    expect(outcome).toEqual({ scheduled: 1, removed: 1 })
    expect(h.queue.removeJobScheduler).toHaveBeenCalledWith(crmFrequentSyncSchedulerId('ws-parti', 'attio'))
    expect(h.queue.removeJobScheduler).not.toHaveBeenCalledWith('autre-chose')
  })

  it('C.1 — un planificateur déjà posé à la bonne cadence n’est pas re-posé', async () => {
    const h = harness()
    h.queue.getJobSchedulers.mockResolvedValue([{ key: crmFrequentSyncSchedulerId(WS, 'hubspot'), every: 15 * 60_000 }])
    expect(await h.service.reconcileSchedules()).toEqual({ scheduled: 0, removed: 0 })
  })

  it('C.1 — un passage = la synchro incrémentale + le miroir en incrémental depuis le dernier passage', async () => {
    const h = harness({ withMirror: true })
    const result = await h.service.runPass({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' })
    expect(result).toEqual({ ran: true, state: 'ok' })
    expect(h.readSync.syncProvider).toHaveBeenCalledWith('u-1', 'hubspot', { maxPasses: expect.any(Number) })
    expect(h.mirror?.syncProvider).toHaveBeenCalledWith({
      workspaceId: WS,
      provider: 'hubspot',
      mode: 'incremental',
      since: new Date('2026-10-19T08:00:00Z'),
    })
  })

  it('C.1 — sans miroir branché : le passage ne fait que les fiches, sans erreur', async () => {
    const h = harness()
    expect(
      await h.service.runPass({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' }),
    ).toEqual({ ran: true, state: 'ok' })
  })

  it('C.1 — sans première reprise (pas de curseur) : rien n’est lu, et le miroir n’est pas appelé', async () => {
    const h = harness({ withMirror: true })
    h.readSync.syncProvider.mockResolvedValue({ ran: false, reason: 'first_import_pending' })
    const result = await h.service.runPass({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' })
    expect(result).toEqual({ ran: false, reason: 'first_import_pending' })
    expect(h.mirror?.syncProvider).not.toHaveBeenCalled()
  })

  it('C.1 — CRM_SYNC_DISABLED coupe tout : aucune lecture', async () => {
    process.env['CRM_SYNC_DISABLED'] = 'true'
    const h = harness()
    expect(
      await h.service.runPass({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' }),
    ).toEqual({
      ran: false,
      reason: 'disabled',
    })
    expect(h.readSync.syncProvider).not.toHaveBeenCalled()
  })

  it('C.1 — déconnecté depuis : le planificateur s’efface, rien n’est lu', async () => {
    const h = harness({ connection: false })
    const result = await h.service.runPass({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' })
    expect(result).toEqual({ ran: false, reason: 'disconnected' })
    expect(h.queue.removeJobScheduler).toHaveBeenCalledWith(crmFrequentSyncSchedulerId(WS, 'hubspot'))
    expect(h.readSync.syncProvider).not.toHaveBeenCalled()
  })

  it('C.2 — un 429 recule : le passage suivant est sauté, l’erreur est NOMMÉE, un succès remet à zéro', async () => {
    const h = harness()
    const data = { workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' } as const
    h.readSync.syncProvider.mockRejectedValueOnce(new Error('HubSpot search failed: HTTP 429 Too Many Requests'))
    expect(await h.service.runPass(data)).toEqual({ ran: true, state: 'rate_limited' })
    expect(h.readSync.recordPassError).toHaveBeenCalledWith(WS, 'hubspot', expect.stringContaining('429'))
    expect(await h.service.runPass(data)).toEqual({ ran: false, reason: 'backoff' })
    expect(h.readSync.syncProvider).toHaveBeenCalledTimes(1)
  })

  it('C.2 — un timeout n’est PAS un échec : état unknown, pas de recul, pas d’erreur écrite, le passage suivant repart', async () => {
    const h = harness()
    const data = { workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' } as const
    h.readSync.syncProvider.mockRejectedValueOnce(new Error('connect ETIMEDOUT'))
    expect(await h.service.runPass(data)).toEqual({ ran: true, state: 'unknown' })
    expect(h.readSync.recordPassError).not.toHaveBeenCalled()
    expect(await h.service.runPass(data)).toEqual({ ran: true, state: 'ok' })
  })

  it('C.2 — un succès efface la dernière erreur affichée', async () => {
    const h = harness()
    await h.service.runPass({ workspaceId: WS, userId: 'u-1', provider: 'hubspot', trigger: 'schedule' })
    expect(h.readSync.recordPassError).toHaveBeenCalledWith(WS, 'hubspot', null)
  })

  it('C.5 — le passage ciblé est dédoublonné par (espace, fournisseur) sur 30 s', async () => {
    const h = harness()
    await h.service.enqueueTargeted({ workspaceId: WS, userId: 'u-1', provider: 'salesforce' })
    await flush()
    const [, data, options] = h.queue.add.mock.calls[0]
    expect(data.trigger).toBe('webhook')
    expect(options.deduplication).toEqual({ id: `crm-webhook:${WS}:salesforce`, ttl: 30_000 })
  })
})

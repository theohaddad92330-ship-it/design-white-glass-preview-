import { CrmReadSyncService } from './crm-read-sync.service'

function build(opts: { withMirror?: boolean; withArchiver?: boolean } = {}) {
  const connections = {
    find: jest.fn().mockResolvedValue([{ user_id: 'u-1', workspace_id: 'ws-1', provider: 'attio' }]),
  }
  const locks = {
    withLock: jest.fn(async (_name: string, fn: () => Promise<void>) => {
      await fn()
      return true
    }),
  }
  const mirror = { syncProvider: jest.fn().mockResolvedValue({ counts: {}, archived: 0, errors: [] }) }
  const archiver = { archiveMissing: jest.fn().mockResolvedValue({ accounts: 2, contacts: 1, skipped: [] }) }
  const service = new CrmReadSyncService(
    {} as never,
    {} as never,
    {} as never,
    connections as never,
    {} as never,
    locks as never,
    undefined,
    opts.withMirror === false ? undefined : (mirror as never),
    opts.withArchiver === false ? undefined : (archiver as never),
  )
  const syncProvider = jest.spyOn(service, 'syncProvider').mockResolvedValue({ ran: true, outcomes: [] })
  return { service, mirror, archiver, syncProvider, locks }
}

describe('SYNC-C.4 — la nuit est un rapprochement COMPLET', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('relit les fiches, archive les disparues, puis relit le miroir en mode full', async () => {
    const h = build()
    await h.service.runDailySync()
    expect(h.syncProvider).toHaveBeenCalledWith('u-1', 'attio')
    expect(h.archiver.archiveMissing).toHaveBeenCalledWith('u-1', 'ws-1', 'attio')
    expect(h.mirror.syncProvider).toHaveBeenCalledWith({ workspaceId: 'ws-1', provider: 'attio', mode: 'full' })
  })

  it('sans miroir ni archiveur branchés : seules les fiches sont relues, sans erreur', async () => {
    const h = build({ withMirror: false, withArchiver: false })
    await h.service.runDailySync()
    expect(h.syncProvider).toHaveBeenCalledTimes(1)
  })

  it('un miroir en échec ne fait pas échouer la nuit ni l’archivage', async () => {
    const h = build()
    h.mirror.syncProvider.mockRejectedValue(new Error('boom'))
    await expect(h.service.runDailySync()).resolves.toBeUndefined()
    expect(h.archiver.archiveMissing).toHaveBeenCalled()
  })

  it('CRM_SYNC_DISABLED coupe la nuit aussi', async () => {
    process.env['CRM_SYNC_DISABLED'] = 'true'
    const h = build()
    await h.service.runDailySync()
    expect(h.syncProvider).not.toHaveBeenCalled()
    expect(h.mirror.syncProvider).not.toHaveBeenCalled()
  })

  it('le passage FRÉQUENT (syncAll sans full) n’archive ni ne relit le miroir en entier', async () => {
    const h = build()
    await h.service.syncAll()
    expect(h.archiver.archiveMissing).not.toHaveBeenCalled()
    expect(h.mirror.syncProvider).not.toHaveBeenCalled()
  })

  it('SYNC-C.6 — en démonstration : un passage récent et une prochaine synchro plausibles, marqués demo', async () => {
    const h = build()
    const service = new CrmReadSyncService(
      { connected: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      { isDemoWorkspace: jest.fn().mockResolvedValue(true) } as never,
    )
    const [row] = await service.status('u-1')
    const ago = Date.now() - Date.parse(row?.lastSyncAt ?? '')
    expect(row?.demo).toBe(true)
    expect(ago).toBeGreaterThanOrEqual(5 * 60_000)
    expect(ago).toBeLessThan(10 * 60_000)
    expect(Date.parse(row?.nextSyncAt ?? '')).toBeGreaterThan(Date.now())
    expect(h.mirror.syncProvider).not.toHaveBeenCalled()
  })

  it('SYNC-C.6 — hors démonstration, sans CRM branché : aucune ligne, jamais une donnée inventée', async () => {
    const service = new CrmReadSyncService(
      { connected: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      { isDemoWorkspace: jest.fn().mockResolvedValue(false) } as never,
    )
    expect(await service.status('u-1')).toEqual([])
  })
})

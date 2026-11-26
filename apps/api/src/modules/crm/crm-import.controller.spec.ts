import { CrmImportController } from './crm-import.controller'

/**
 * #2388.24 — `entityType` doit RÉELLEMENT choisir la reprise appelée. Avant
 * cette tranche, le corps portait `entityType` mais la route appelait toujours
 * `importContacts` : une demande de comptes était silencieusement traitée
 * comme des contacts.
 */
function makeController() {
  const imports = {
    assertSource: jest.fn((source: unknown) => source),
    importContacts: jest.fn(async () => ({ ok: 'contacts' })),
    importAccounts: jest.fn(async () => ({ ok: 'accounts' })),
  }
  const crm = {}
  const readSync = {
    run: jest.fn(async () => ({ ok: 'read-sync' })),
    status: jest.fn(async () => [{ provider: 'zoho' }]),
  }
  const firstImport = { states: jest.fn(async () => [{ provider: 'attio' }]) }
  const adapters = { connected: jest.fn(async () => [{ adapter: { provider: 'attio' }, accountLabel: 'x' }]) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'w1' })),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const controller = new CrmImportController(
    imports as never,
    crm as never,
    readSync as never,
    firstImport as never,
    adapters as never,
    workspaceContext as never,
  )
  return { controller, imports, readSync, firstImport, adapters, workspaceContext }
}

const USER = { userId: 'u1', workspaceId: 'w1' } as never

describe('CrmImportController.run — le routage par entityType (#2388.24)', () => {
  it('appelle importContacts par défaut (entityType: contact)', async () => {
    const { controller, imports } = makeController()
    await controller.run(USER, { provider: 'hubspot', entityType: 'contact', dryRun: true, limit: 200 })
    expect(imports.importContacts).toHaveBeenCalled()
    expect(imports.importAccounts).not.toHaveBeenCalled()
  })

  it('appelle importAccounts quand entityType vaut account', async () => {
    const { controller, imports } = makeController()
    await controller.run(USER, { provider: 'hubspot', entityType: 'account', dryRun: true, limit: 200 })
    expect(imports.importAccounts).toHaveBeenCalled()
    expect(imports.importContacts).not.toHaveBeenCalled()
  })
})

// #4189 — les CRM autres que HubSpot relisent par l'adaptateur commun, depuis leur curseur.
describe('CrmImportController — les autres CRM (#4189)', () => {
  it.each(['salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'] as const)(
    '%s passe par la synchro incrémentale',
    async provider => {
      const { controller, imports, readSync } = makeController()
      await controller.run(USER, { provider, entityType: 'contact', dryRun: true, limit: 200 })
      expect(readSync.run).toHaveBeenCalledWith('u1', expect.objectContaining({ provider }))
      expect(imports.importContacts).not.toHaveBeenCalled()
    },
  )

  it('HubSpot garde ses sources dédiées — rien n’est changé pour lui', async () => {
    const { controller, readSync } = makeController()
    await controller.run(USER, { provider: 'hubspot', entityType: 'account', dryRun: true, limit: 200 })
    expect(readSync.run).not.toHaveBeenCalled()
  })

  it('GET /crm/import/status rend l’état de lecture par CRM branché', async () => {
    const { controller, readSync } = makeController()
    expect(await controller.status(USER)).toEqual({ items: [{ provider: 'zoho' }] })
    expect(readSync.status).toHaveBeenCalledWith('u1')
  })
})

describe('CrmImportController.firstImportStatus — SYNC-B', () => {
  it("rend l'état de première reprise de l'espace de l'appelant", async () => {
    const { controller, firstImport } = makeController()
    expect(await controller.firstImportStatus(USER)).toEqual({ items: [{ provider: 'attio' }] })
    expect(firstImport.states).toHaveBeenCalledWith('w1', ['attio'])
  })

  it('en démo, rien de branché : une reprise terminée fictive, marquée demo', async () => {
    const { controller, adapters, workspaceContext } = makeController()
    adapters.connected.mockResolvedValue([])
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)
    const { items } = await controller.firstImportStatus(USER)
    expect(items[0]).toMatchObject({ state: 'done', demo: true })
  })

  it('hors démo, rien de branché : aucune ligne', async () => {
    const { controller, adapters } = makeController()
    adapters.connected.mockResolvedValue([])
    expect(await controller.firstImportStatus(USER)).toEqual({ items: [] })
  })
})

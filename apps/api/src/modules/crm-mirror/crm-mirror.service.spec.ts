import type { CrmAdapter } from '../crm/adapter/crm-adapter'
import type { CrmAdapterRegistry } from '../crm/adapter/crm-adapter.registry'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CRM_MIRROR_SYNC } from './crm-mirror.port'
import { CrmMirrorService } from './crm-mirror.service'
import type { CrmMirrorStore, MirrorRow, MirrorTable } from './crm-mirror.store'

const WS = '00000000-0000-4000-8000-000000000001'
const ACCOUNT = '00000000-0000-4000-8000-0000000000a1'
const CONTACT = '00000000-0000-4000-8000-0000000000c1'

/** Un magasin EN MÉMOIRE : la même clé d'upsert que la migration, l'archivage, les liens. */
class MemoryStore implements CrmMirrorStore {
  readonly tables: Record<MirrorTable, Map<string, MirrorRow>> = {
    crm_owners: new Map(),
    crm_pipelines: new Map(),
    crm_stages: new Map(),
    crm_deals: new Map(),
    crm_activities: new Map(),
  }
  connected = true
  humanTouched = new Set<string>()
  accountLinks = new Map([['org-1', ACCOUNT]])
  contactLinks = new Map([['per-1', CONTACT]])

  async connectionUser(): Promise<string | null> {
    return this.connected ? 'user-1' : null
  }
  async links() {
    return { accounts: this.accountLinks, contacts: this.contactLinks }
  }
  async humanEdited(_t: MirrorTable, _w: string, _p: string, ids: readonly string[]) {
    return new Set(ids.filter(id => this.humanTouched.has(id)))
  }
  async upsert(table: MirrorTable, rows: readonly MirrorRow[]) {
    for (const row of rows)
      this.tables[table].set(String(row.external_id), { ...this.tables[table].get(String(row.external_id)), ...row })
  }
  async pipelineIds() {
    return new Map(
      [...this.tables.crm_pipelines.values()].map(row => [String(row.external_id), `uuid-${String(row.external_id)}`]),
    )
  }
  async stageLabels() {
    return new Map(
      [...this.tables.crm_stages.values()].map(row => [
        String(row.external_id),
        (row['label'] as string | null) ?? null,
      ]),
    )
  }
  async dealAccounts() {
    return new Map(
      [...this.tables.crm_deals.values()].flatMap(row =>
        row['account_id'] ? [[String(row.external_id), row['account_id'] as string] as const] : [],
      ),
    )
  }
  async archiveMissing(table: MirrorTable, _w: string, _p: string, seen: readonly string[]) {
    let archived = 0
    for (const row of this.tables[table].values())
      if (!seen.includes(String(row.external_id)) && !row['archived_at']) {
        row['archived_at'] = new Date()
        archived += 1
      }
    return archived
  }
}

function adapterWith(read: Partial<NonNullable<CrmAdapter['read']>>): CrmAdapter {
  return {
    provider: 'pipedrive',
    status: async () => ({ connected: true }),
    read: {
      contacts: async () => ({ contacts: [], nextAfter: null }),
      companies: async () => ({ companies: [], nextAfter: null }),
      ...read,
    },
  }
}

const deal = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Affaire ${id}`,
  amount: 120000,
  currency: 'EUR',
  stage: null,
  status: 'open' as const,
  closeDate: '2026-12-01',
  accountId: 'org-1',
  accountName: null,
  modifiedAt: '2026-10-18T09:00:00Z',
  stageId: 's2',
  pipelineId: 'p1',
  ownerId: '77',
  contactIds: ['per-1'],
  ...extra,
})

function setup(read: Partial<NonNullable<CrmAdapter['read']>>, activeWorkspace = WS) {
  const store = new MemoryStore()
  const adapters = { get: () => adapterWith(read) } as unknown as CrmAdapterRegistry
  const workspace = {
    resolveActiveWorkspace: async () => ({ workspaceId: activeWorkspace, role: 'owner' }),
  } as unknown as WorkspaceContextService
  return { store, service: new CrmMirrorService(adapters, store, workspace) }
}

const run = (service: CrmMirrorService, mode: 'full' | 'incremental' = 'full', since?: Date) =>
  service.syncProvider({ workspaceId: WS, provider: 'pipedrive', mode, ...(since ? { since } : {}) })

describe('CrmMirrorService (SYNC-A A.4)', () => {
  it('porte le jeton partagé du contrat', () => {
    expect(typeof CRM_MIRROR_SYNC).toBe('symbol')
  })

  it('upsert par clé externe, rattachement compte/contact par les liens existants, compte par entité', async () => {
    const { store, service } = setup({
      owners: async () => ({ owners: [{ id: '77', name: 'Claire', email: null }], nextAfter: null }),
      pipelines: async () => ({
        pipelines: [
          { id: 'p1', label: 'Ventes', stages: [{ id: 's2', label: 'Proposition', position: 2, status: null }] },
        ],
        nextAfter: null,
      }),
      deals: async () => ({
        deals: [deal('d1'), deal('d2', { accountId: 'org-inconnue', contactIds: [] })],
        nextAfter: null,
      }),
      activities: async () => ({
        activities: [
          {
            id: 'a1',
            subject: 'Point',
            kind: 'Appel',
            dueAt: '2026-10-10',
            done: true,
            modifiedAt: null,
            dealId: 'd1',
            contactId: 'per-1',
          },
        ],
        nextAfter: null,
      }),
    })
    const result = await run(service)
    expect(result).toEqual({ counts: { owners: 1, pipelines: 1, deals: 2, activities: 1 }, archived: 0, errors: [] })
    const d1 = store.tables.crm_deals.get('d1')
    expect(d1).toMatchObject({
      workspace_id: WS,
      provider: 'pipedrive',
      account_id: ACCOUNT,
      account_external_id: 'org-1',
      amount: '120000',
      // Pipedrive ne rend que l'identifiant d'étape : le libellé vient des étapes miroir, jamais deviné.
      stage_label: 'Proposition',
      contact_external_ids: ['per-1'],
      archived_at: null,
    })
    // Une société sans lien Bellum reste sans compte (jamais rattachée par le nom).
    expect(store.tables.crm_deals.get('d2')?.['account_id']).toBeNull()
    expect(store.tables.crm_stages.get('s2')).toMatchObject({
      pipeline_id: 'uuid-p1',
      label: 'Proposition',
      position: 2,
    })
    // L'activité hérite du compte de son affaire ; son type est normalisé.
    expect(store.tables.crm_activities.get('a1')).toMatchObject({
      kind: 'call',
      account_id: ACCOUNT,
      contact_id: CONTACT,
    })
  })

  it('mode full : ce que le CRM ne rend plus est ARCHIVÉ, jamais supprimé ; une fiche revenue est désarchivée', async () => {
    let pages = [deal('d1'), deal('d2')]
    const { store, service } = setup({ deals: async () => ({ deals: pages, nextAfter: null }) })
    await run(service)
    pages = [deal('d1')]
    const second = await run(service)
    expect(second.archived).toBe(1)
    expect(store.tables.crm_deals.size).toBe(2)
    expect(store.tables.crm_deals.get('d2')?.['archived_at']).toBeInstanceOf(Date)
    pages = [deal('d1'), deal('d2')]
    await run(service)
    expect(store.tables.crm_deals.get('d2')?.['archived_at']).toBeNull()
  })

  it('mode incremental, ou lecture tronquée : rien n’est archivé (une absence n’y prouve rien)', async () => {
    const seenSince: Array<string | undefined> = []
    const { store, service } = setup({
      deals: async (_u, opts) => {
        seenSince.push(opts.since)
        return { deals: [deal('d1')], nextAfter: 'encore' }
      },
    })
    store.tables.crm_deals.set('vieille', { external_id: 'vieille', archived_at: null })
    const since = new Date('2026-10-01T00:00:00Z')
    expect((await run(service, 'incremental', since)).archived).toBe(0)
    expect(seenSince[0]).toBe('2026-10-01T00:00:00.000Z')
    expect((await run(service, 'full')).archived).toBe(0)
    expect(store.tables.crm_deals.get('vieille')?.['archived_at']).toBeNull()
  })

  it('une fiche modifiée à la main dans Bellum n’est pas écrasée', async () => {
    const { store, service } = setup({
      deals: async () => ({ deals: [deal('d1', { title: 'Nouveau titre CRM' })], nextAfter: null }),
    })
    store.tables.crm_deals.set('d1', { external_id: 'd1', title: 'Corrigé à la main', archived_at: null })
    store.humanTouched.add('d1')
    const result = await run(service)
    expect(store.tables.crm_deals.get('d1')?.['title']).toBe('Corrigé à la main')
    expect(result.counts.deals).toBe(0)
  })

  it('une entité en échec ne prive pas les autres : l’erreur est nommée, rien n’est archivé pour elle', async () => {
    const { store, service } = setup({
      owners: async () => {
        throw new Error('Pipedrive read users failed: 429')
      },
      deals: async () => ({ deals: [deal('d1')], nextAfter: null }),
    })
    store.tables.crm_owners.set('old', { external_id: 'old', archived_at: null })
    const result = await run(service)
    expect(result.errors).toEqual([{ entity: 'owners', message: 'Pipedrive read users failed: 429' }])
    expect(result.counts).toEqual({ deals: 1 })
    expect(store.tables.crm_owners.get('old')?.['archived_at']).toBeNull()
  })

  it('un objet que le CRM n’expose pas n’est pas compté (absent, jamais « 0 »)', async () => {
    const { service } = setup({ deals: async () => ({ deals: [], nextAfter: null }) })
    expect((await run(service)).counts).toEqual({ deals: 0 })
  })

  it('sans CRM branché : no-op strict, zéro lecture', async () => {
    const deals = jest.fn()
    const { store, service } = setup({ deals })
    store.connected = false
    expect(await run(service)).toEqual({ counts: {}, archived: 0, errors: [] })
    expect(deals).not.toHaveBeenCalled()
  })

  it('le CRM d’un autre espace actif n’est jamais copié dans celui-ci', async () => {
    const deals = jest.fn()
    const { service } = setup({ deals }, '00000000-0000-4000-8000-000000000002')
    const result = await run(service)
    expect(deals).not.toHaveBeenCalled()
    expect(result.errors.map(error => error.entity)).toEqual(['deals'])
  })

  it('la lecture est BORNÉE : au plus MAX_PAGES pages par entité, puis tronquée', async () => {
    const deals = jest.fn(async () => ({ deals: [deal(String(Math.random()))], nextAfter: 'toujours' }))
    const { service } = setup({ deals })
    await run(service)
    expect(deals.mock.calls.length).toBe(CrmMirrorService.MAX_PAGES)
  })
})

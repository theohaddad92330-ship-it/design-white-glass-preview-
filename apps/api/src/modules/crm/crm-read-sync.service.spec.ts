import { Logger } from '@nestjs/common'
import type { IncomingRecord } from '@bellum/contracts'
import type { CrmAdapter } from './adapter/crm-adapter'
import { adapterAccountSource, adapterContactSource } from './crm-sources'
import { CrmReadSyncService, hubspotReadObjects } from './crm-read-sync.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

type Page<T> = { items: T[]; nextAfter: string | null }

/** Un adaptateur dont `read` rend les pages données, dans l'ordre, et note les options reçues. */
function adapterWith(
  provider: CrmAdapter['provider'],
  pages: { contacts?: Array<Page<Record<string, unknown>>>; companies?: Array<Page<Record<string, unknown>>> },
  seen: Array<Record<string, unknown>> = [],
): CrmAdapter {
  const contactPages = [...(pages.contacts ?? [{ items: [], nextAfter: null }])]
  const companyPages = [...(pages.companies ?? [{ items: [], nextAfter: null }])]
  return {
    provider,
    status: async () => ({ connected: true, accountLabel: 'Espace' }),
    read: {
      contacts: async (_u, opts) => {
        seen.push({ kind: 'contacts', ...opts })
        const page = contactPages.shift() ?? { items: [], nextAfter: null }
        return { contacts: page.items as never, nextAfter: page.nextAfter }
      },
      companies: async (_u, opts) => {
        seen.push({ kind: 'companies', ...opts })
        const page = companyPages.shift() ?? { items: [], nextAfter: null }
        return { companies: page.items as never, nextAfter: page.nextAfter }
      },
    },
  }
}

const contact = (
  id: string,
  email: string | null,
  modifiedAt: string | null,
  last = 'Roy',
  first: string | null = 'Ana',
) => ({
  id,
  email,
  firstName: first,
  lastName: last,
  company: null,
  jobTitle: null,
  phone: null,
  modifiedAt,
})
const company = (id: string, name: string, modifiedAt: string | null) => ({ id, name, domain: null, modifiedAt })

describe('sources génériques de l’adaptateur (#4189)', () => {
  it('contacts : l’id externe, l’e-mail, le nom composé, la date de modification — rien d’inventé', async () => {
    const adapter = adapterWith('zoho', {
      contacts: [
        {
          items: [contact('c1', 'a@b.fr', '2026-10-01T08:00:00.000Z'), contact('c2', null, null, 'Seul', null)],
          nextAfter: null,
        },
      ],
    })
    const { records, truncated } = await adapterContactSource(adapter).listContacts(USER, 50)
    expect(records).toEqual<IncomingRecord[]>([
      { externalId: 'c1', email: 'a@b.fr', name: 'Ana Roy', modifiedAt: '2026-10-01T08:00:00.000Z' },
      { externalId: 'c2', email: null, name: 'Seul', modifiedAt: null },
    ])
    expect(truncated).toBe(false)
  })

  it('suit les curseurs jusqu’à la limite et le DIT quand il en reste (tronqué)', async () => {
    const seen: Array<Record<string, unknown>> = []
    const adapter = adapterWith(
      'zoho',
      {
        companies: [
          { items: [company('a1', 'TF1', null), company('a2', 'M6', null)], nextAfter: 'p:2' },
          { items: [company('a3', 'W9', null)], nextAfter: 'p:3' },
        ],
      },
      seen,
    )
    const { records, truncated } = await adapterAccountSource(adapter).listCompanies(USER, 3, {
      since: '2026-10-01T00:00:00.000Z',
    })
    expect(records.map(r => r.externalId)).toEqual(['a1', 'a2', 'a3'])
    expect(truncated).toBe(true)
    expect(seen[1]).toMatchObject({ after: 'p:2', since: '2026-10-01T00:00:00.000Z' })
  })

  it('#4603 — sociétés : le SIREN que l’adaptateur rend voyage jusqu’à la ligne ; absent, la ligne reste celle d’avant', async () => {
    const adapter = adapterWith('pipedrive', {
      companies: [
        {
          items: [
            { ...company('o1', 'Veepee', null), siren: '440297785' },
            { ...company('o2', 'Sans SIREN', null), siren: null },
          ],
          nextAfter: null,
        },
      ],
    })
    const { records } = await adapterAccountSource(adapter).listCompanies(USER, 10)
    expect(records[0]).toMatchObject({ externalId: 'o1', siren: '440297785' })
    expect(records[1]).not.toHaveProperty('siren')
  })

  it('une page FILTRÉE vide avec un curseur ne coupe pas la lecture (Attio filtre côté client)', async () => {
    const adapter = adapterWith('attio', {
      contacts: [
        { items: [], nextAfter: 'o:500' },
        { items: [contact('c9', 'n@b.fr', '2026-10-05T00:00:00.000Z')], nextAfter: null },
      ],
    })
    const { records, truncated } = await adapterContactSource(adapter).listContacts(USER, 50, {
      since: '2026-10-01T00:00:00.000Z',
    })
    expect(records.map(r => r.externalId)).toEqual(['c9'])
    expect(truncated).toBe(false)
  })

  it('une lecture qui tourne sans avancer est coupée et annoncée tronquée, jamais infinie', async () => {
    const stuck: CrmAdapter = {
      provider: 'attio',
      status: async () => ({ connected: true }),
      read: {
        contacts: async () => ({ contacts: [], nextAfter: 'o:0' }),
        companies: async () => ({ companies: [], nextAfter: null }),
      },
    }
    const { truncated } = await adapterContactSource(stuck).listContacts(USER, 50)
    expect(truncated).toBe(true)
  })
})

function makeService(opts: {
  adapter: CrmAdapter
  cursor?: Record<string, unknown> | null
  connected?: boolean
  catchUp?: 'queued' | 'already_running' | 'backoff' | 'failed'
}) {
  const cursorRows = new Map<string, Record<string, unknown>>()
  if (opts.cursor) cursorRows.set(`${opts.adapter.provider}:contact`, opts.cursor)
  if (opts.cursor) cursorRows.set(`${opts.adapter.provider}:account`, opts.cursor)
  const cursors = {
    findOne: jest.fn(
      async ({ where }: { where: { provider: string; entity_type: string } }) =>
        cursorRows.get(`${where.provider}:${where.entity_type}`) ?? null,
    ),
    upsert: jest.fn(async (row: Record<string, unknown>) => {
      cursorRows.set(`${row['provider']}:${row['entity_type']}`, row)
    }),
  }
  const importer = {
    importContacts: jest.fn(
      async (
        _u: string,
        source: {
          listContacts: (
            u: string,
            l: number,
            o?: { since?: string },
          ) => Promise<{ records: IncomingRecord[]; truncated: boolean }>
        },
        input: { dryRun: boolean; provider: string; limit: number },
        options?: { since?: string },
      ) => {
        const page = await source.listContacts(USER, input.limit, options?.since ? { since: options.since } : undefined)
        return {
          provider: input.provider,
          entityType: 'contact',
          dryRun: input.dryRun,
          created: 0,
          updated: page.records.length,
          skipped: [],
          truncated: page.truncated,
          unavailable: null,
          conflicts: 0,
        }
      },
    ),
    importAccounts: jest.fn(
      async (
        _u: string,
        source: {
          listCompanies: (
            u: string,
            l: number,
            o?: { since?: string },
          ) => Promise<{ records: IncomingRecord[]; truncated: boolean }>
        },
        input: { dryRun: boolean; provider: string; limit: number },
        options?: { since?: string },
      ) => {
        const page = await source.listCompanies(
          USER,
          input.limit,
          options?.since ? { since: options.since } : undefined,
        )
        return {
          provider: input.provider,
          entityType: 'account',
          dryRun: input.dryRun,
          created: page.records.length,
          updated: 0,
          skipped: [],
          truncated: page.truncated,
          unavailable: null,
          conflicts: 0,
        }
      },
    ),
    assertSource: <T>(s: T | undefined): T => {
      if (!s) throw new Error('Aucun CRM connecté')
      return s
    },
  }
  const registry = {
    get: (p: string) => (p === opts.adapter.provider ? opts.adapter : null),
    connected: async () => [],
  }
  const adapter = opts.adapter
  if (opts.connected === false) adapter.status = async () => ({ connected: false })
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const firstImport = { enqueueCatchUp: jest.fn(async () => opts.catchUp ?? 'queued') }
  const service = new CrmReadSyncService(
    registry as never,
    importer as never,
    cursors as never,
    {} as never,
    workspaceContext as never,
    undefined,
    undefined,
    undefined,
    undefined,
    firstImport as never,
  )
  return { service, cursors, importer, cursorRows, firstImport }
}

const input = (entityType: 'contact' | 'account', dryRun = false) =>
  ({ provider: 'zoho', entityType, dryRun, limit: 200 }) as const

describe('CrmReadSyncService.run — le curseur incrémental (#4189)', () => {
  it('un premier passage lit tout, puis le curseur devient la date de modification la plus récente VUE', async () => {
    const adapter = adapterWith('zoho', {
      contacts: [
        {
          items: [
            contact('c1', 'a@b.fr', '2026-10-01T08:00:00.000Z'),
            contact('c2', 'b@b.fr', '2026-10-03T08:00:00.000Z'),
          ],
          nextAfter: null,
        },
      ],
    })
    const { service, importer, cursorRows } = makeService({ adapter })
    await service.run(USER, input('contact'))
    expect(importer.importContacts.mock.calls[0]?.[3]).toEqual({})
    expect(cursorRows.get('zoho:contact')).toMatchObject({
      workspace_id: WORKSPACE,
      provider: 'zoho',
      entity_type: 'contact',
      cursor_at: new Date('2026-10-03T08:00:00.000Z'),
      last_error: null,
    })
    expect((cursorRows.get('zoho:contact')?.['last_run_at'] as Date).getTime()).toBeGreaterThan(Date.now() - 5000)
  })

  it('le passage suivant ne relit que ce qui a bougé depuis le curseur', async () => {
    const seen: Array<Record<string, unknown>> = []
    const adapter = adapterWith('zoho', {}, seen)
    const { service, importer } = makeService({
      adapter,
      cursor: { cursor_at: new Date('2026-10-03T08:00:00.000Z'), last_run_at: new Date() },
    })
    await service.run(USER, input('contact'))
    expect(importer.importContacts.mock.calls[0]?.[3]).toEqual({ since: '2026-10-03T08:00:00.000Z' })
    expect(seen[0]).toMatchObject({ since: '2026-10-03T08:00:00.000Z' })
  })

  it('⚠️ une SIMULATION ne bouge jamais le curseur', async () => {
    const adapter = adapterWith('zoho', {
      contacts: [{ items: [contact('c1', 'a@b.fr', '2026-10-09T08:00:00.000Z')], nextAfter: null }],
    })
    const { service, cursors } = makeService({ adapter })
    await service.run(USER, input('contact', true))
    expect(cursors.upsert).not.toHaveBeenCalled()
  })

  it('⚠️ un passage en ÉCHEC garde l’ancien curseur et note l’erreur telle quelle', async () => {
    const adapter = adapterWith('zoho', {})
    const { service, importer, cursorRows } = makeService({
      adapter,
      cursor: { cursor_at: new Date('2026-10-03T08:00:00.000Z'), last_run_at: new Date('2026-10-04T00:00:00.000Z') },
    })
    importer.importContacts.mockResolvedValueOnce({
      provider: 'zoho',
      entityType: 'contact',
      dryRun: false,
      created: 0,
      updated: 0,
      skipped: [],
      truncated: false,
      unavailable: '401 invalid_grant' as never,
      conflicts: 0,
    })
    await service.run(USER, input('contact'))
    expect(cursorRows.get('zoho:contact')).toMatchObject({
      cursor_at: new Date('2026-10-03T08:00:00.000Z'),
      last_error: '401 invalid_grant',
    })
  })

  // #recette-21-10-K2 — Salesforce « Synchronisé à l'instant » alors que l'autorisation a expiré.
  it('⚠️ un passage indisponible n’avance JAMAIS la date de dernière synchro réussie (last_run_at)', async () => {
    const adapter = adapterWith('zoho', {})
    const { service, importer, cursorRows } = makeService({
      adapter,
      cursor: { cursor_at: new Date('2026-10-03T08:00:00.000Z'), last_run_at: new Date('2026-10-04T00:00:00.000Z') },
    })
    importer.importContacts.mockResolvedValueOnce({
      provider: 'zoho',
      entityType: 'contact',
      dryRun: false,
      created: 0,
      updated: 0,
      skipped: [],
      truncated: false,
      unavailable: '401 invalid_grant' as never,
      conflicts: 0,
    })
    await service.run(USER, input('contact'))
    expect(cursorRows.get('zoho:contact')?.['last_run_at']).toEqual(new Date('2026-10-04T00:00:00.000Z'))
  })

  it('⚠️ une première reprise indisponible ne pose aucune date de synchro (jamais « à l’instant »)', async () => {
    const adapter = adapterWith('zoho', {})
    const { service, importer, cursorRows } = makeService({ adapter })
    importer.importContacts.mockResolvedValueOnce({
      provider: 'zoho',
      entityType: 'contact',
      dryRun: false,
      created: 0,
      updated: 0,
      skipped: [],
      truncated: false,
      unavailable: '401 invalid_grant' as never,
      conflicts: 0,
    })
    await service.run(USER, input('contact'))
    expect(cursorRows.get('zoho:contact')?.['last_run_at']).toBeNull()
    expect(cursorRows.get('zoho:contact')?.['last_error']).toBe('401 invalid_grant')
  })

  it('une lecture ORDONNÉE tronquée avance quand même (rien de plus ancien n’est resté derrière)', async () => {
    const adapter = adapterWith('zoho', {
      contacts: [{ items: [contact('c1', 'a@b.fr', '2026-10-02T08:00:00.000Z')], nextAfter: 'p:2' }],
    })
    const { service, cursorRows } = makeService({ adapter })
    await service.run(USER, { ...input('contact'), limit: 1 })
    expect(cursorRows.get('zoho:contact')?.['cursor_at']).toEqual(new Date('2026-10-02T08:00:00.000Z'))
  })

  it('⚠️ une lecture NON ordonnée (Attio) tronquée n’avance PAS : les fiches non lues seraient sautées à jamais', async () => {
    const adapter = adapterWith('attio', {
      contacts: [{ items: [contact('c1', 'a@b.fr', '2026-10-02T08:00:00.000Z')], nextAfter: 'o:1' }],
    })
    const { service, cursorRows } = makeService({ adapter })
    await service.run(USER, { provider: 'attio', entityType: 'contact', dryRun: false, limit: 1 })
    expect(cursorRows.get('attio:contact')?.['cursor_at']).toBeNull()
  })

  it('une lecture non ordonnée COMPLÈTE avance', async () => {
    const adapter = adapterWith('attio', {
      contacts: [{ items: [contact('c1', 'a@b.fr', '2026-10-02T08:00:00.000Z')], nextAfter: null }],
    })
    const { service, cursorRows } = makeService({ adapter })
    await service.run(USER, { provider: 'attio', entityType: 'contact', dryRun: false, limit: 50 })
    expect(cursorRows.get('attio:contact')?.['cursor_at']).toEqual(new Date('2026-10-02T08:00:00.000Z'))
  })

  it('des fiches sans date de modification ne déplacent pas le curseur (jamais une date devinée)', async () => {
    const adapter = adapterWith('zoho', { contacts: [{ items: [contact('c1', 'a@b.fr', null)], nextAfter: null }] })
    const { service, cursorRows } = makeService({
      adapter,
      cursor: { cursor_at: new Date('2026-10-03T08:00:00.000Z'), last_run_at: new Date() },
    })
    await service.run(USER, input('contact'))
    expect(cursorRows.get('zoho:contact')?.['cursor_at']).toEqual(new Date('2026-10-03T08:00:00.000Z'))
  })

  it('un CRM non branché le DIT au lieu de rendre zéro ligne', async () => {
    const { service, importer } = makeService({ adapter: adapterWith('zoho', {}), connected: false })
    await expect(service.run(USER, input('contact'))).rejects.toThrow(/Aucun CRM connecté/)
    expect(importer.importContacts).not.toHaveBeenCalled()
  })

  it('un fournisseur inconnu, ou sans lecture, le DIT aussi', async () => {
    const { service } = makeService({ adapter: adapterWith('zoho', {}) })
    await expect(
      service.run(USER, { provider: 'attio', entityType: 'contact', dryRun: false, limit: 5 }),
    ).rejects.toThrow(/Aucun CRM connecté/)
  })
})

describe('CrmReadSyncService.syncWorkspaceProvider — le passage automatique (#4189)', () => {
  it('⚠️ SANS première reprise validée (aucun curseur), rien ne part : la première reprise est un geste humain', async () => {
    const { service, importer } = makeService({ adapter: adapterWith('zoho', {}) })
    const result = await service.syncProvider(USER, 'zoho')
    expect(result).toEqual({ ran: false, reason: 'first_import_pending' })
    expect(importer.importContacts).not.toHaveBeenCalled()
    expect(importer.importAccounts).not.toHaveBeenCalled()
  })

  it('CRM-SYNC-D.1 — sans curseur, la passe MET EN FILE la première reprise (une fois) et le DIT en INFO, plus en WARN', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service, firstImport } = makeService({ adapter: adapterWith('zoho', {}) })
    const result = await service.syncProvider(USER, 'zoho')
    expect(result).toEqual({ ran: false, reason: 'first_import_pending' })
    expect(firstImport.enqueueCatchUp).toHaveBeenCalledTimes(1)
    expect(firstImport.enqueueCatchUp).toHaveBeenCalledWith({ userId: USER, workspaceId: WORKSPACE, provider: 'zoho' })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/zoho.*première reprise mise en file/))
    expect(warn).not.toHaveBeenCalled()
    log.mockRestore()
    warn.mockRestore()
  })

  it('CRM-SYNC-D.1 — une reprise déjà en file ou en recul n’est pas relancée, et la passe reste « en attente »', async () => {
    for (const catchUp of ['already_running', 'backoff'] as const) {
      const { service, firstImport } = makeService({ adapter: adapterWith('zoho', {}), catchUp })
      expect(await service.syncProvider(USER, 'zoho')).toEqual({ ran: false, reason: 'first_import_pending' })
      expect(firstImport.enqueueCatchUp).toHaveBeenCalledTimes(1)
    }
  })

  it('CRM-SYNC-D.1 — un CRM déconnecté ne met RIEN en file', async () => {
    const { service, firstImport } = makeService({ adapter: adapterWith('zoho', {}), connected: false })
    expect(await service.syncProvider(USER, 'zoho')).toEqual({ ran: false, reason: 'not_connected' })
    expect(firstImport.enqueueCatchUp).not.toHaveBeenCalled()
  })

  it('CRM-SYNC-D.1 — avec un curseur (reprise faite), rien n’est mis en file', async () => {
    const { service, firstImport } = makeService({
      adapter: adapterWith('zoho', {}),
      cursor: { cursor_at: new Date('2026-10-03T08:00:00.000Z'), last_run_at: new Date('2026-10-04T00:00:00.000Z') },
    })
    await service.syncProvider(USER, 'zoho')
    expect(firstImport.enqueueCatchUp).not.toHaveBeenCalled()
  })

  it('avec une première reprise faite : comptes puis contacts, depuis le curseur', async () => {
    const { service, importer } = makeService({
      adapter: adapterWith('zoho', {}),
      cursor: { cursor_at: new Date('2026-10-03T08:00:00.000Z'), last_run_at: new Date('2026-10-04T00:00:00.000Z') },
    })
    const result = await service.syncProvider(USER, 'zoho')
    expect(result).toMatchObject({ ran: true })
    expect(importer.importAccounts.mock.invocationCallOrder[0]).toBeLessThan(
      importer.importContacts.mock.invocationCallOrder[0] ?? 0,
    )
    expect(importer.importAccounts.mock.calls[0]?.[3]).toEqual({ since: '2026-10-03T08:00:00.000Z' })
  })

  it('HubSpot passe par ce chemin (SYNC-C) — mais seulement avec un curseur posé par une première reprise', async () => {
    const withCursor = makeService({
      adapter: adapterWith('hubspot', {}),
      cursor: { cursor_at: new Date('2026-10-19T08:00:00Z'), last_run_at: new Date() },
    })
    expect((await withCursor.service.syncProvider(USER, 'hubspot')).ran).toBe(true)
    expect(withCursor.importer.importContacts).toHaveBeenCalled()

    const withoutCursor = makeService({ adapter: adapterWith('hubspot', {}), cursor: null })
    expect(await withoutCursor.service.syncProvider(USER, 'hubspot')).toEqual({
      ran: false,
      reason: 'first_import_pending',
    })
    expect(withoutCursor.importer.importContacts).not.toHaveBeenCalled()
  })

  it('un fournisseur hors du contrat incrémental n’est jamais passé par ce chemin', async () => {
    const { service, importer } = makeService({
      adapter: adapterWith('hubspot', {}),
      cursor: { cursor_at: null, last_run_at: new Date() },
    })
    expect(await service.syncProvider(USER, 'csv')).toEqual({ ran: false, reason: 'not_incremental' })
    expect(importer.importContacts).not.toHaveBeenCalled()
  })
})

describe('J.2 — les objets HubSpot lus se dérivent des portées accordées', () => {
  it('deals.read accordé → les affaires sont lues', () => {
    expect(
      hubspotReadObjects('oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read'),
    ).toEqual(['accounts', 'contacts', 'deals'])
  })
  it('deals.read absent → les affaires ne sont pas annoncées lues', () => {
    expect(hubspotReadObjects('oauth crm.objects.contacts.read')).toEqual(['contacts'])
  })
})

describe('status() — HubSpot (J.2, J.7)', () => {
  function statusService(connection: Record<string, unknown>) {
    const hubspot = { provider: 'hubspot' } as CrmAdapter
    const adapters = { connected: async () => [{ adapter: hubspot, accountLabel: 'portail' }] }
    const cursors = { find: async () => [], manager: { query: async () => [] } }
    const connections = { find: async () => [{ provider: 'hubspot', ...connection }] }
    const workspaceContext = { resolveActiveWorkspace: async () => ({ workspaceId: WORKSPACE }) }
    return new CrmReadSyncService(
      adapters as never,
      {} as never,
      cursors as never,
      connections as never,
      workspaceContext as never,
    )
  }

  it('J.2 — les objets lus viennent des portées accordées (affaires comprises)', async () => {
    const [row] = await statusService({
      scope: 'oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read',
    }).status(USER)
    expect(row?.objects).toEqual(['accounts', 'contacts', 'deals'])
  })

  it('J.7 — sans curseur, la dernière synchro est la dernière activité de la connexion, comme le registre', async () => {
    const [row] = await statusService({
      scope: 'oauth',
      last_used_at: new Date('2026-09-27T10:00:00Z'),
      updated_at: new Date('2026-10-18T21:00:00Z'),
    }).status(USER)
    expect(row?.lastSyncAt).toBe('2026-09-27T10:00:00.000Z')
  })

  it('⚠️ recette 21/10 K2 — une connexion mise à jour (jeton rafraîchi, reprise en échec) n’est jamais une synchro', async () => {
    const [row] = await statusService({
      scope: 'oauth',
      last_used_at: null,
      updated_at: new Date('2026-10-18T21:00:00Z'),
      created_at: new Date('2026-09-01T10:00:00Z'),
    }).status(USER)
    expect(row?.lastSyncAt).toBeNull()
  })
})

// #4290.16 — UNE date de synchro : la dernière RÉUSSIE ; un essai plus récent en échec se dit à part.
describe('status() — une seule date de synchro (#4290.16)', () => {
  function statusWith(rows: Array<Record<string, unknown>>, provider = 'pipedrive') {
    const pipedrive = { provider } as CrmAdapter
    const adapters = { connected: async () => [{ adapter: pipedrive, accountLabel: 'acme' }] }
    const cursors = { find: async () => rows, manager: { query: async () => [] } }
    const connections = { find: async () => [{ provider, updated_at: new Date('2026-10-21T10:00:00Z') }] }
    const workspaceContext = { resolveActiveWorkspace: async () => ({ workspaceId: WORKSPACE }) }
    return new CrmReadSyncService(
      adapters as never,
      {} as never,
      cursors as never,
      connections as never,
      workspaceContext as never,
    ).status(USER)
  }
  const row = (over: Record<string, unknown>) => ({
    provider: 'pipedrive',
    entity_type: 'contact',
    cursor_at: null,
    last_run_at: null,
    last_success_at: null,
    last_attempt_at: null,
    last_error: null,
    ...over,
  })

  it('un essai en échec plus récent ne remplace pas la dernière synchro réussie', async () => {
    const [status] = await statusWith([
      row({
        last_run_at: new Date('2026-10-21T09:47:00Z'),
        last_success_at: new Date('2026-10-19T04:55:00Z'),
        last_error: '401 invalid_grant',
      }),
    ])
    expect(status?.lastSyncAt).toBe('2026-10-19T04:55:00.000Z')
    expect(status?.lastAttemptAt).toBe('2026-10-21T09:47:00.000Z')
    expect(status?.lastError).toBe('401 invalid_grant')
  })

  it('en échec depuis toujours : aucune synchro réussie — jamais la date de l’essai ni celle de la connexion', async () => {
    const [status] = await statusWith([row({ last_run_at: new Date('2026-10-21T09:47:00Z'), last_error: 'HTTP 403' })])
    expect(status?.lastSyncAt).toBeNull()
    expect(status?.lastAttemptAt).toBe('2026-10-21T09:47:00.000Z')
  })

  it('tout va bien : la réussite la plus récente, et pas d’essai à part', async () => {
    const [status] = await statusWith([
      row({ last_run_at: new Date('2026-10-21T09:47:00Z'), last_success_at: new Date('2026-10-21T09:47:00Z') }),
    ])
    expect(status?.lastSyncAt).toBe('2026-10-21T09:47:00.000Z')
    expect(status?.lastAttemptAt).toBeNull()
  })

  // #4467 — une passe en échec GARDE `last_run_at` (la dernière réussite) : la date de l'essai vit à part.
  it('#4467 — la date du dernier essai en échec est celle de l’essai, pas celle de la dernière réussite', async () => {
    const [status] = await statusWith([
      row({
        last_run_at: new Date('2026-10-18T04:55:00Z'),
        last_success_at: new Date('2026-10-18T04:55:00Z'),
        last_attempt_at: new Date('2026-10-23T09:45:00Z'),
        last_error: 'Pipedrive read persons failed: date invalide',
      }),
    ])
    expect(status?.lastSyncAt).toBe('2026-10-18T04:55:00.000Z')
    expect(status?.lastAttemptAt).toBe('2026-10-23T09:45:00.000Z')
  })

  it.each([
    [
      'hubspot',
      'HubSpot list owners failed: This app hasn’t been granted all required scopes (403)',
      'hubspot_owners_scope',
    ],
    ['salesforce', 'Salesforce token refresh failed: invalid_grant', 'authorization_expired'],
    ['attio', 'Attio list deals failed: Object with slug/id "deals" not found', 'attio_deals_disabled'],
    ['odoo', 'Le service a répondu 404 à /jsonrpc', 'odoo_endpoint_unreachable'],
  ] as const)('#4467 — %s : l’erreur brute est nommée (%s)', async (provider, message, hint) => {
    const [status] = await statusWith([row({ provider, last_attempt_at: new Date(), last_error: message })], provider)
    expect(status?.lastErrorHint).toBe(hint)
  })

  it('#4467 — une erreur inconnue n’invente aucune raison nommée', async () => {
    const [status] = await statusWith([row({ last_attempt_at: new Date(), last_error: 'HTTP 500' })])
    expect(status?.lastErrorHint).toBeNull()
  })
})

// #4590 — `GET /crm/import/status` rendait 500 en production sur une donnée réelle que le jeu propre ne montre pas :
// un CRM branché SANS curseur, un compte de conflits nul, un écart dont une valeur est nulle.
describe('status() — des colonnes nulles ne font jamais un 500 (#4590)', () => {
  function statusWithData(data: {
    cursors?: unknown
    runs?: unknown
    events?: unknown
    connections?: unknown
    provider?: string
  }) {
    const provider = data.provider ?? 'pipedrive'
    const adapters = { connected: async () => [{ adapter: { provider } as CrmAdapter, accountLabel: null }] }
    const query = async (sql: string) =>
      sql.includes('FROM sync_record_events')
        ? (data.events ?? [])
        : sql.includes('FROM sync_runs')
          ? (data.runs ?? [])
          : []
    const cursors = { find: async () => data.cursors ?? [], manager: { query } }
    const connections = { find: async () => data.connections ?? [] }
    const workspaceContext = { resolveActiveWorkspace: async () => ({ workspaceId: WORKSPACE }) }
    return new CrmReadSyncService(
      adapters as never,
      {} as never,
      cursors as never,
      connections as never,
      workspaceContext as never,
    ).status(USER)
  }

  it('connecteur branché sans curseur NI ligne de connexion : une ligne, aucune date inventée', async () => {
    const [status] = await statusWithData({})
    expect(status).toMatchObject({ provider: 'pipedrive', lastSyncAt: null, nextSyncAt: null, conflicts: 0 })
  })

  it('lectures nulles (curseurs, connexions) : traitées comme vides, pas comme un plantage', async () => {
    const [status] = await statusWithData({ cursors: null, connections: null, runs: null, events: null })
    expect(status?.provider).toBe('pipedrive')
    expect(status?.lastSyncAt).toBeNull()
  })

  it('un compte de conflits nul vaut zéro conflit compté, pas NaN', async () => {
    const [status] = await statusWithData({
      runs: [
        { provider: 'pipedrive', entity_type: 'contact', conflict_count: null },
        { provider: 'pipedrive', entity_type: 'account', conflict_count: 2 },
      ],
    })
    expect(status?.conflicts).toBe(2)
  })

  it('un écart dont une valeur est nulle reste proposé, côté nul dit « absent » (null)', async () => {
    const [status] = await statusWithData({
      events: [
        {
          id: 'e1',
          internal_id: null,
          provider: 'pipedrive',
          entity_type: 'contact',
          proposal: { email: null, full_name: { bellum: 'A', crm: null } },
          created_at: new Date('2026-10-20T10:00:00Z'),
          kept_fields: null,
          entity_label: null,
        },
      ],
    })
    expect(status?.conflictItems).toEqual([
      expect.objectContaining({ field: 'email', bellumValue: null, crmValue: null }),
      expect.objectContaining({ field: 'full_name', bellumValue: 'A', crmValue: null }),
    ])
  })

  it('une ligne de curseur à dates toutes nulles et sans erreur : aucune synchro prétendue', async () => {
    const [status] = await statusWithData({
      cursors: [
        {
          provider: 'pipedrive',
          entity_type: 'contact',
          last_run_at: null,
          last_success_at: null,
          last_attempt_at: null,
          last_error: null,
        },
      ],
    })
    expect(status).toMatchObject({ lastSyncAt: null, lastAttemptAt: null, nextSyncAt: null })
  })
})

import { DEMO_CRM_PUSH_TARGETS } from '../demo/demo-dataset'
import type { CrmAdapter } from './adapter/crm-adapter'
import type { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { CrmPushService } from './crm-push.service'
import type { CrmService } from './crm.service'
import type { CrmWriteService } from './crm-write.service'

/**
 * #4188 — « ce compte, je l'envoie sur mon CRM ; ces contacts, je les envoie »,
 * unitaire et en lot. Prévisualisation, puis envoi par la porte ; un second
 * envoi ne crée pas de doublon.
 */

const ACME = { id: 'a-1', company_name: 'ACME', website: 'https://www.acme.fr/', workspace_id: 'ws-1' }
const THEO = {
  id: 'c-1',
  full_name: 'Théo Martin',
  email: 'theo@acme.fr',
  account_id: 'a-1',
  entity: 'Acme (import)',
  workspace_id: 'ws-1',
}
const NAMELESS = { id: 'c-2', full_name: 'Jean', email: null, account_id: 'a-1', entity: null, workspace_id: 'ws-1' }

const HUBSPOT = {
  adapter: { provider: 'hubspot', status: jest.fn(), upsertCompany: jest.fn() } as unknown as CrmAdapter,
  accountLabel: 'bellum-it.com',
}

function build(
  options: {
    exported?: { accounts?: string[]; contacts?: string[] }
    connected?: boolean
    hubspotStatus?: Record<string, unknown>
    presence?: { provider: 'hubspot' | 'salesforce' | null; matched: boolean }
    extra?: Array<{ adapter: CrmAdapter; accountLabel: string | null }>
  } = {},
) {
  const pipedrive: CrmAdapter = {
    provider: 'pipedrive',
    status: jest.fn(),
    upsertContact: jest.fn(),
    upsertCompany: jest.fn(),
  }
  const registry = {
    connected: jest
      .fn()
      .mockResolvedValue(
        options.connected === false ? [] : [{ adapter: pipedrive, accountLabel: 'Exteam' }, ...(options.extra ?? [])],
      ),
    get: jest.fn((provider: string) =>
      provider === 'pipedrive'
        ? pipedrive
        : ((options.extra ?? []).find(e => e.adapter.provider === provider)?.adapter ?? null),
    ),
  }
  const writes = {
    workspaceOf: jest.fn().mockResolvedValue('ws-1'),
    write: jest.fn(async (input: { kind: string }) =>
      input.kind === 'create_company'
        ? { status: 'written', requestId: 'owr-a', externalId: 'org-9', created: true }
        : { status: 'written', requestId: 'owr-c', externalId: 'p-3', created: false },
    ),
  }
  const sql: Array<{ sql: string; params: unknown[] }> = []
  const manager = {
    query: jest.fn(async (text: string, params: unknown[] = []) => {
      sql.push({ sql: text, params })
      if (text.includes('FROM account_crm_exports') && text.includes('ANY')) {
        return (options.exported?.accounts ?? []).map(id => ({ entity_id: id, crm_record_id: `org-${id}` }))
      }
      if (text.includes('FROM contact_crm_exports') && text.includes('ANY')) {
        return (options.exported?.contacts ?? []).map(id => ({ entity_id: id, crm_record_id: `p-${id}` }))
      }
      if (text.includes('FROM crm_connections'))
        return [{ external_account_id: null, instance_url: 'https://exteam.pipedrive.com' }]
      if (text.includes('FROM accounts a') && text.includes('import_marked'))
        return [{ status: 'completed', import_marked: false, linked: false }]
      if (text.includes('AS crm_provider')) return [{ crm_provider: 'demo' }]
      return []
    }),
  }
  const accounts = { find: jest.fn().mockResolvedValue([ACME]), manager }
  const contacts = { find: jest.fn().mockResolvedValue([THEO, NAMELESS]) }
  const hubspot = {
    getStatus: jest.fn().mockResolvedValue(options.hubspotStatus ?? { configured: false, connected: false }),
    findPresence: jest.fn().mockResolvedValue(options.presence ?? { provider: null, matched: false }),
  }
  const service = new CrmPushService(
    registry as unknown as CrmAdapterRegistry,
    writes as unknown as CrmWriteService,
    hubspot as unknown as CrmService,
    accounts as never,
    contacts as never,
  )
  return { service, writes, sql, hubspot, accounts: accounts as unknown as { find: jest.Mock }, contacts }
}

const request = { accountIds: ['a-1'], contactIds: [], withAccountContacts: true }

describe('#4188 — CrmPushService', () => {
  it('prévisualise sans rien écrire : à créer, refusé avec sa raison', async () => {
    const { service, writes } = build()

    const preview = await service.preview('u1', request)

    expect(preview).toMatchObject({ provider: 'pipedrive', destination: 'Exteam' })
    expect(preview.items.map(i => [i.entity, i.id, i.verdict])).toEqual([
      ['account', 'a-1', 'create'],
      ['contact', 'c-1', 'create'],
      ['contact', 'c-2', 'refused'],
    ])
    expect(preview.items[2]?.reason).toMatch(/Ni adresse e-mail ni nom complet/)
    expect(writes.write).not.toHaveBeenCalled()
  })

  it('#4290.1 — la prévisualisation dit les CHAMPS qui seront écrits, valeur par champ, sans rien inventer', async () => {
    const { service, writes } = build()

    const preview = await service.preview('u1', request)

    expect(preview.items[0]?.fields).toEqual([
      { field: 'name', value: 'ACME' },
      { field: 'domain', value: 'acme.fr' },
    ])
    // Le contact part avec l'entreprise du COMPTE identifié (jamais le libellé importé), et seulement ce qui est renseigné.
    expect(preview.items[1]?.fields).toEqual([
      { field: 'email', value: 'theo@acme.fr' },
      { field: 'firstName', value: 'Théo' },
      { field: 'lastName', value: 'Martin' },
      { field: 'company', value: 'ACME' },
    ])
    // Un élément refusé n'écrit rien : aucun champ.
    expect(preview.items[2]?.fields).toEqual([])
    expect(writes.write).not.toHaveBeenCalled()
  })

  it('un compte DÉJÀ envoyé est « déjà présent » (lien vers sa fiche), un contact déjà envoyé « mis à jour »', async () => {
    const { service } = build({ exported: { accounts: ['a-1'], contacts: ['c-1'] } })

    const preview = await service.preview('u1', request)

    expect(preview.items[0]).toMatchObject({
      verdict: 'already_present',
      crmRecordId: 'org-a-1',
      recordUrl: 'https://exteam.pipedrive.com/organization/org-a-1',
    })
    expect(preview.items[1]).toMatchObject({ verdict: 'update', crmRecordId: 'p-c-1' })
  })

  it('L.2 — un compte absent de nos envois mais DÉJÀ dans le CRM (présence) est « déjà présent » à l’aperçu', async () => {
    const { service, hubspot } = build({ presence: { provider: 'hubspot', matched: true }, extra: [HUBSPOT] })

    const preview = await service.preview('u1', { ...request, provider: 'hubspot' })

    expect(hubspot.findPresence).toHaveBeenCalledWith('u1', { account: 'ACME', domain: 'acme.fr' })
    expect(preview.items[0]).toMatchObject({ verdict: 'already_present' })
  })

  it('L.2 — la présence d’un AUTRE CRM ne dit rien du CRM visé : « sera créé »', async () => {
    const { service } = build({ presence: { provider: 'salesforce', matched: true }, extra: [HUBSPOT] })

    const preview = await service.preview('u1', { ...request, provider: 'hubspot' })

    expect(preview.items[0]).toMatchObject({ verdict: 'create' })
  })

  it('envoie le compte PUIS ses contacts, par la porte, en un lot — et consigne la référence externe', async () => {
    const { service, writes, sql } = build()

    const result = await service.push('u1', request)

    expect(writes.write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'pipedrive',
        kind: 'create_company',
        origin: 'user',
        payload: { name: 'ACME', domain: 'acme.fr' },
        batchId: result.batchId,
      }),
    )
    // L'entreprise exportée est celle du COMPTE identifié, jamais le libellé importé (#3719.6).
    expect(writes.write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'export_contact', payload: expect.objectContaining({ company: 'ACME' }) }),
    )
    expect(writes.write).toHaveBeenCalledTimes(2)
    expect(result.batchId).toEqual(expect.any(String))
    expect(result.items.map(i => [i.id, i.outcome])).toEqual([
      ['a-1', 'created'],
      ['c-1', 'updated'],
      ['c-2', 'refused'],
    ])
    const recorded = sql.find(q => q.sql.includes('INSERT INTO account_crm_exports'))
    expect(recorded?.params).toEqual(['ws-1', 'a-1', 'pipedrive', 'org-9', 'created', 'Exteam', 'u1'])
    expect(sql.some(q => q.sql.includes('INSERT INTO contact_crm_exports'))).toBe(true)
  })

  it('un second envoi ne crée pas de doublon : le compte déjà envoyé n’est pas réécrit', async () => {
    const { service, writes } = build({ exported: { accounts: ['a-1'] } })

    const result = await service.push('u1', { accountIds: ['a-1'], contactIds: [], withAccountContacts: false })

    expect(writes.write).not.toHaveBeenCalled()
    expect(result.items).toEqual([expect.objectContaining({ outcome: 'already_present', crmRecordId: 'org-a-1' })])
    expect(result.batchId).toBeNull()
  })

  it('une écriture qui échoue est NOMMÉE par élément (jamais un « tout envoyé »), sans nom d’éditeur', async () => {
    const { service, writes } = build()
    const timeout = Object.assign(new Error('Pipedrive timeout'), { name: 'TimeoutError' })
    writes.write.mockRejectedValueOnce(timeout)

    const result = await service.push('u1', request)

    expect(result.items[0]).toMatchObject({ id: 'a-1', outcome: 'unknown' })
    expect(result.items[0]?.reason).not.toMatch(/Pipedrive/)
    expect(result.items[1]).toMatchObject({ id: 'c-1', outcome: 'updated' })
  })

  it('K.1 — une autorisation expirée dit « reconnecte », jamais « a refusé cette fiche »', async () => {
    const { service, writes } = build()
    writes.write.mockRejectedValueOnce(
      Object.assign(new Error('expired'), { response: { code: 'authorization_expired' } }),
    )

    const result = await service.push('u1', request)

    expect(result.items[0]).toMatchObject({ id: 'a-1', outcome: 'failed' })
    expect(result.items[0]?.reason).toMatch(/reconnecte/)
    expect(result.items[0]?.reason).not.toMatch(/refusé cette fiche/)
  })

  it('aucun CRM branché : refus clair, aucune lecture de compte', async () => {
    const { service, accounts } = build({ connected: false })

    await expect(service.preview('u1', request)).rejects.toThrow(/Aucun CRM/)
    expect(accounts.find).not.toHaveBeenCalled()
  })

  describe('plusieurs CRM (16/10)', () => {
    const odoo: CrmAdapter = { provider: 'odoo', status: jest.fn(), upsertContact: jest.fn(), upsertCompany: jest.fn() }
    const hubspotAdapter: CrmAdapter = {
      provider: 'hubspot',
      status: jest.fn(),
      upsertContact: jest.fn(),
      upsertCompany: jest.fn(),
    }

    it('liste CHAQUE CRM branché, le premier est le principal, aucun n’est inventé', async () => {
      const { service } = build({ extra: [{ adapter: odoo, accountLabel: 'bellum-it.com' }] })

      const { targets } = await service.targets('u1')

      expect(targets).toEqual([
        { provider: 'pipedrive', destination: 'Exteam', primary: true, writable: true, readOnlyReason: null },
        { provider: 'odoo', destination: 'bellum-it.com', primary: false, writable: true, readOnlyReason: null },
      ])
    })

    it('HubSpot branché SANS droit d’écriture : listé, non cochable, raison nommée — et jamais le principal', async () => {
      const built = build({
        hubspotStatus: { configured: true, connected: true, capabilities: { contactsWrite: false } },
      })
      // HubSpot est en tête de l'ordre du contrat : on le met en premier.
      ;(built.service as unknown as { adapters: { connected: jest.Mock } }).adapters.connected.mockResolvedValue([
        { adapter: hubspotAdapter, accountLabel: 'bellum-it.com' },
        { adapter: odoo, accountLabel: 'bellum-it.com' },
      ])

      const { targets } = await built.service.targets('u1')

      expect(targets[0]).toMatchObject({ provider: 'hubspot', writable: false, primary: false })
      expect(targets[0]?.readOnlyReason).toMatch(/droit d’écriture/)
      expect(targets[1]).toMatchObject({ provider: 'odoo', writable: true, primary: true })
      await expect(built.service.preview('u1', { ...request, provider: 'hubspot' })).rejects.toThrow(/droit d’écriture/)
    })

    it('la prévisualisation et l’envoi visent le CRM DEMANDÉ, pas seulement le premier', async () => {
      const built = build({ extra: [{ adapter: odoo, accountLabel: 'bellum-it.com' }] })
      ;(built.service as unknown as { adapters: { get: jest.Mock } }).adapters.get.mockImplementation((p: string) =>
        p === 'odoo' ? odoo : null,
      )

      const preview = await built.service.preview('u1', { ...request, provider: 'odoo' })
      const result = await built.service.push('u1', { ...request, provider: 'odoo' })

      expect(preview).toMatchObject({ provider: 'odoo', destination: 'bellum-it.com' })
      expect(result).toMatchObject({ provider: 'odoo', destination: 'bellum-it.com' })
      expect(built.writes.write).toHaveBeenCalledWith(expect.objectContaining({ provider: 'odoo' }))
      expect(built.writes.write).not.toHaveBeenCalledWith(expect.objectContaining({ provider: 'pipedrive' }))
    })

    it('un CRM non branché demandé explicitement : refus, jamais un repli sur un autre', async () => {
      const { service, writes } = build()

      await expect(service.push('u1', { ...request, provider: 'zoho' })).rejects.toThrow(/Aucun CRM|pas branché/)
      expect(writes.write).not.toHaveBeenCalled()
    })

    it('démonstration : au moins deux CRM fictifs, dont un en lecture seule avec sa raison', async () => {
      const { service } = build({
        connected: false,
        hubspotStatus: { configured: false, connected: false, demo: true, accountLabel: 'Bellum Conseil — CRM fictif' },
      })

      const { targets } = await service.targets('u1')

      expect(targets.length).toBeGreaterThanOrEqual(2)
      expect(targets.filter(t => t.primary)).toHaveLength(1)
      expect(targets[0]).toMatchObject({ provider: 'hubspot', primary: true, writable: true })
      expect(targets.some(t => !t.writable && t.readOnlyReason)).toBe(true)
    })
  })
})

// #4604 (craft n°9) — la salle de démonstration montre « Ce que dit ton CRM » sous le nom de SON CRM fictif.
describe('#4604 — CrmPushService.accountProvenance', () => {
  it('en salle, le miroir semé sous `demo` se lit comme le premier CRM fictif de la salle', async () => {
    const { service } = build({ hubspotStatus: { configured: false, connected: false, demo: true } as never })
    expect((await service.accountProvenance('u1', 'a-1')).crm?.provider).toBe(DEMO_CRM_PUSH_TARGETS[0]?.provider)
  })

  it('hors salle, un fournisseur `demo` ne nomme aucun CRM : pas de bloc', async () => {
    const { service } = build()
    expect(await service.accountProvenance('u1', 'a-1')).not.toHaveProperty('crm')
  })
})

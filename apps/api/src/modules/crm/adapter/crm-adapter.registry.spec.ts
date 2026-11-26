import {
  CRM_ADAPTER_OPERATIONS,
  CRM_PROVIDER_CAPABILITIES,
  CRM_PROVIDER_READ_SCOPE,
  CRM_PROVIDERS,
  type CrmProvider,
  type CrmReadObject,
} from '@bellum/contracts'
import {
  adapterFor,
  buildCrmAdapters,
  implementedOperations,
  implementedReadObjects,
  type CrmAdapter,
  type CrmAdapterDeps,
} from './crm-adapter'

/**
 * #4185.3 — LA GARDE DE L'ADAPTATEUR COMMUN.
 *
 * Un fournisseur déclaré dans le contrat (`CRM_PROVIDERS`) qui n'a pas
 * d'adaptateur, ou dont l'adaptateur n'implémente pas une opération que la
 * matrice lui prête, fait échouer la CI. L'inverse aussi : une opération
 * implémentée mais NON déclarée est une capacité que l'écran ne montrera
 * jamais — le contrat doit la dire.
 */

const called: string[] = []
const spy =
  (name: string, value: unknown = { id: 'x', created: true }) =>
  async (..._args: unknown[]) => {
    called.push(name)
    return value
  }

function deps(): CrmAdapterDeps {
  const reading = (name: string, objects: readonly CrmReadObject[]) => ({
    listCompanies: spy(`${name}.listCompanies`, { companies: [], nextAfter: null }),
    listContacts: spy(`${name}.listContacts`, { contacts: [], nextAfter: null }),
    ...(objects.includes('deals') ? { listDeals: spy(`${name}.listDeals`, { deals: [], nextAfter: null }) } : {}),
    ...(objects.includes('activities')
      ? { listActivities: spy(`${name}.listActivities`, { activities: [], nextAfter: null }) }
      : {}),
    ...(objects.includes('owners') ? { listOwners: spy(`${name}.listOwners`, { owners: [], nextAfter: null }) } : {}),
  })
  const exporting = (name: CrmProvider) => ({
    getStatus: spy(`${name}.getStatus`, { connected: true, accountLabel: `Espace ${name}` }),
    exportContact: spy(`${name}.exportContact`),
    exportNeed: spy(`${name}.exportNeed`, { id: 'n', object: 'task' }),
    exportCompany: spy(`${name}.exportCompany`, { id: 'org', created: true }),
    ...reading(name, CRM_PROVIDER_READ_SCOPE[name]),
  })
  return {
    hubspot: {
      getStatus: spy('hubspot.getStatus', { connected: false }),
      upsertContactDirect: spy('hubspot.upsertContactDirect'),
      exportNeed: spy('hubspot.exportNeed', { id: 'd', object: 'deal' }),
      listContacts: spy('hubspot.listContacts', { contacts: [], nextCursor: null }),
      listCompanies: spy('hubspot.listCompanies', { companies: [], nextCursor: null }),
    },
    hubspotDepth: { createCompany: spy('hubspotDepth.createCompany', { id: 'c', created: false }) },
    salesforce: exporting('salesforce'),
    pipedrive: exporting('pipedrive'),
    attio: exporting('attio'),
    odoo: {
      getStatus: spy('odoo.getStatus', { connected: true, accountLabel: 'Instance' }),
      exportContact: spy('odoo.exportContact', { action: 'updated', partnerId: 42 }),
      exportCompany: spy('odoo.exportCompany', { action: 'created', partnerId: 7 }),
      ...reading('odoo', CRM_PROVIDER_READ_SCOPE.odoo),
    },
    zoho: exporting('zoho'),
  } as unknown as CrmAdapterDeps
}

/** La comparaison que la garde fait — extraite pour pouvoir la faire dire NON. */
function mismatches(adapters: Readonly<Record<string, CrmAdapter | undefined>>): string[] {
  const out: string[] = []
  for (const provider of CRM_PROVIDERS) {
    const adapter = adapters[provider]
    if (!adapter) {
      out.push(`${provider} : aucun adaptateur`)
      continue
    }
    const declared = [...CRM_PROVIDER_CAPABILITIES[provider].operations].sort()
    const implemented = implementedOperations(adapter).sort()
    for (const op of declared)
      if (!implemented.includes(op)) out.push(`${provider} : « ${op} » déclarée, non implémentée`)
    for (const op of implemented)
      if (!declared.includes(op)) out.push(`${provider} : « ${op} » implémentée, non déclarée`)
    // #4189 — les OBJETS relus : ce que l'adaptateur lit = ce que la matrice de lecture déclare.
    const declaredObjects = [...CRM_PROVIDER_READ_SCOPE[provider]].sort()
    const implementedObjects = implementedReadObjects(adapter).sort()
    for (const object of declaredObjects)
      if (!implementedObjects.includes(object))
        out.push(`${provider} : lecture « ${object} » déclarée, non implémentée`)
    for (const object of implementedObjects)
      if (!declaredObjects.includes(object)) out.push(`${provider} : lecture « ${object} » implémentée, non déclarée`)
  }
  return out
}

describe('#4185 — adaptateur CRM commun : chaque fournisseur déclaré porte l’interface', () => {
  const adapters = buildCrmAdapters(deps())

  it('le registre et la matrice du contrat disent la même chose, fournisseur par fournisseur', () => {
    expect(mismatches(adapters)).toEqual([])
    expect(Object.keys(adapters).sort()).toEqual([...CRM_PROVIDERS].sort())
  })

  it('la garde sait dire NON : un fournisseur sans adaptateur, une opération déclarée non portée', () => {
    const { odoo: _dropped, ...withoutOdoo } = adapters
    expect(mismatches(withoutOdoo)).toEqual(['odoo : aucun adaptateur'])
    const { taskNote: _gone, ...pipedriveWithoutTask } = adapters.pipedrive
    expect(mismatches({ ...adapters, pipedrive: pipedriveWithoutTask })).toEqual([
      'pipedrive : « task_note » déclarée, non implémentée',
    ])
    // #4188 — le domaine CONNU part comme site web.
    const odooWithTask: CrmAdapter = { ...adapters.odoo, taskNote: async () => ({ id: '1', object: 'task' }) }
    expect(mismatches({ ...adapters, odoo: odooWithTask })).toEqual(['odoo : « task_note » implémentée, non déclarée'])
  })

  it('⚠️ la garde de lecture sait dire NON : un objet lu non déclaré, un objet déclaré non lu', () => {
    const zoho = adapters.zoho
    const readWithActivities = { ...zoho.read!, activities: async () => ({ activities: [], nextAfter: null }) }
    expect(mismatches({ ...adapters, zoho: { ...zoho, read: readWithActivities } })).toEqual([
      'zoho : lecture « activities » implémentée, non déclarée',
    ])
    const { deals: _dropped, ...readWithoutDeals } = zoho.read!
    expect(
      mismatches({ ...adapters, zoho: { ...zoho, read: readWithoutDeals as NonNullable<CrmAdapter['read']> } }),
    ).toEqual(['zoho : lecture « deals » déclarée, non implémentée'])
  })

  it('chaque opération du contrat a une méthode dans l’interface', () => {
    const full = adapters.hubspot
    expect(implementedOperations(full).sort()).toEqual([...CRM_ADAPTER_OPERATIONS].sort())
  })

  it('les enveloppes délèguent au service existant, sans changer le comportement', async () => {
    called.length = 0
    await adapters.salesforce.upsertContact?.('u1', { email: 'a@b.fr' })
    await adapters.attio.taskNote?.('u1', { subject: 'S', body: 'B' })
    await adapters.hubspot.upsertContact?.('u1', { email: 'a@b.fr' })
    await adapters.hubspot.upsertCompany?.('u1', { name: 'ACME', domain: null })
    expect(called).toEqual([
      'salesforce.exportContact',
      'attio.exportNeed',
      'hubspot.upsertContactDirect',
      'hubspotDepth.createCompany',
    ])
    expect(await adapters.pipedrive.status('u1')).toEqual({ connected: true, accountLabel: 'Espace pipedrive' })
  })

  it('Odoo : le nom est composé des champs réels, jamais inventé ; sans nom ni adresse, rien ne part', async () => {
    expect(await adapters.odoo.upsertContact?.('u1', { firstName: 'Théo', lastName: 'Martin' })).toEqual({
      id: '42',
      created: false,
    })
    await expect(adapters.odoo.upsertContact?.('u1', { phone: '0102030405' })).rejects.toThrow(/ni nom ni adresse/)
  })

  it('un fournisseur inconnu du contrat n’a pas d’adaptateur', () => {
    expect(adapterFor(adapters, 'sugarcrm')).toBeNull()
    expect(adapterFor(adapters, 'zoho' satisfies CrmProvider)?.provider).toBe('zoho')
    expect(adapterFor(adapters, 'odoo' satisfies CrmProvider)?.provider).toBe('odoo')
  })
})

describe('#4188 — chaque CRM branché reçoit un compte', () => {
  it('les six adaptateurs portent `upsert_company`, et le domaine connu part comme site web', async () => {
    const adapters = buildCrmAdapters(deps())
    called.length = 0
    for (const provider of CRM_PROVIDERS) expect(adapters[provider].upsertCompany).toBeDefined()
    await adapters.pipedrive.upsertCompany?.('u1', { name: 'ACME', domain: 'acme.fr' })
    expect(await adapters.odoo.upsertCompany?.('u1', { name: 'ACME' })).toEqual({ id: '7', created: true })
    expect(called).toEqual(['pipedrive.exportCompany', 'odoo.exportCompany'])
  })
})

describe('#4187 — Zoho dans le registre (aucun switch ajouté)', () => {
  const adapters = buildCrmAdapters(deps())

  it('Zoho dépose un besoin, écrit un contact et un compte, relit comptes/contacts/affaires/propriétaires', async () => {
    called.length = 0
    await adapters.zoho.upsertContact?.('u1', { email: 'a@b.fr' })
    await adapters.zoho.upsertCompany?.('u1', { name: 'ACME', domain: 'acme.fr' })
    await adapters.zoho.taskNote?.('u1', { subject: 'S', body: 'B' })
    expect(called).toEqual(['zoho.exportContact', 'zoho.exportCompany', 'zoho.exportNeed'])
    expect(implementedReadObjects(adapters.zoho).sort()).toEqual(['accounts', 'contacts', 'deals', 'owners'])
  })
})

describe('#4189 — la lecture commune, fournisseur par fournisseur', () => {
  const adapters = buildCrmAdapters(deps())

  it('chaque adaptateur lit sur le curseur reçu et rend les pages du service', async () => {
    called.length = 0
    for (const provider of ['salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'] as const) {
      await adapters[provider].read?.contacts('u1', { limit: 10, since: '2026-10-01T00:00:00.000Z' })
      await adapters[provider].read?.companies('u1', { limit: 10 })
    }
    expect(called).toEqual([
      'salesforce.listContacts',
      'salesforce.listCompanies',
      'pipedrive.listContacts',
      'pipedrive.listCompanies',
      'attio.listContacts',
      'attio.listCompanies',
      'odoo.listContacts',
      'odoo.listCompanies',
      'zoho.listContacts',
      'zoho.listCompanies',
    ])
  })

  it('un objet que le CRM n’expose pas n’a PAS de méthode (jamais une page vide qui se lirait « rien »)', () => {
    expect(adapters.zoho.read?.activities).toBeUndefined()
    expect(adapters.attio.read?.activities).toBeUndefined()
    expect(adapters.salesforce.read?.activities).toBeDefined()
    expect(adapters.zoho.read?.owners).toBeDefined()
    // SYNC-A — Salesforce relit ses utilisateurs (`User`) ; Attio, non (aucun droit demandé).
    expect(adapters.salesforce.read?.owners).toBeDefined()
    expect(adapters.attio.read?.owners).toBeUndefined()
  })
})

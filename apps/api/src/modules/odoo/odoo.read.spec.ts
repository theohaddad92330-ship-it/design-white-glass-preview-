import { OdooClient, type OdooCredentials } from './odoo.client'

jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }))

const CREDS: OdooCredentials = {
  baseUrl: 'https://acme.odoo.com',
  db: 'acme-prod',
  login: 'sales@acme.fr',
  apiKey: 'a'.repeat(40),
}
const UID = 7

const rpcOk = (result: unknown): Response =>
  ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', result }) }) as unknown as Response

let fetchMock: jest.Mock
const realFetch = global.fetch
beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = realFetch
})

/** Les arguments d'`execute_kw` du n-ième appel : [db, uid, apiKey, model, method, args, kwargs]. */
function call(n = 0): { model: string; method: string; domain: unknown[]; kwargs: Record<string, unknown> } {
  const body = JSON.parse(String((fetchMock.mock.calls[n]?.[1] as { body: string }).body)) as {
    params: { args: unknown[] }
  }
  const a = body.params.args
  return {
    model: a[3] as string,
    method: a[4] as string,
    domain: (a[5] as unknown[][])[0] as unknown[],
    kwargs: a[6] as Record<string, unknown>,
  }
}

// #4189 — lecture commune Odoo : JSON-RPC `search_read`. ⚠️ comme tout ce client : NON VÉRIFIÉ sur
// une instance réelle (voir odoo.client.ts) — la première lecture sur une instance est la recette.
describe('OdooClient — lecture (#4189)', () => {
  it('contacts : res.partner non société, champs listés, tri write_date croissant, curseur = décalage', async () => {
    fetchMock.mockResolvedValue(
      rpcOk([
        {
          id: 11,
          name: 'Ana Roy',
          email: 'a@b.fr',
          phone: false,
          function: 'DSI',
          parent_id: [3, 'TF1'],
          write_date: '2026-10-01 10:00:00',
        },
        {
          id: 12,
          name: 'Sans mail',
          email: false,
          phone: '+33102030405',
          function: false,
          parent_id: false,
          write_date: false,
        },
      ]),
    )
    const page = await new OdooClient(CREDS).listContacts(UID, { limit: 2 })
    const c = call()
    expect([c.model, c.method]).toEqual(['res.partner', 'search_read'])
    expect(c.domain).toEqual([['is_company', '=', false]])
    expect(c.kwargs).toMatchObject({ limit: 2, offset: 0, order: 'write_date asc, id asc' })
    expect(c.kwargs['fields']).toEqual(
      expect.arrayContaining(['name', 'email', 'phone', 'function', 'parent_id', 'write_date']),
    )
    expect(page.contacts).toEqual([
      {
        id: '11',
        email: 'a@b.fr',
        firstName: null,
        lastName: 'Ana Roy',
        company: 'TF1',
        jobTitle: 'DSI',
        phone: null,
        modifiedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: '12',
        email: null,
        firstName: null,
        lastName: 'Sans mail',
        company: null,
        jobTitle: null,
        phone: '+33102030405',
        modifiedAt: null,
      },
    ])
    expect(page.nextAfter).toBe('o:2')
  })

  it('une page courte clôt la lecture ; « depuis » devient write_date >= au format Odoo (UTC)', async () => {
    fetchMock.mockResolvedValue(rpcOk([]))
    const page = await new OdooClient(CREDS).listCompanies(UID, {
      limit: 50,
      after: 'o:100',
      since: '2026-10-01T08:00:00.000Z',
    })
    const c = call()
    expect(c.domain).toEqual([
      ['is_company', '=', true],
      ['write_date', '>=', '2026-10-01 08:00:00'],
    ])
    expect(c.kwargs['offset']).toBe(100)
    expect(page).toEqual({ companies: [], nextAfter: null })
  })

  it('⚠️ un « depuis » illisible est refusé avant tout appel', async () => {
    await expect(new OdooClient(CREDS).listCompanies(UID, { limit: 5, since: 'hier' })).rejects.toThrow(/date/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sociétés : nom + site, jamais un domaine deviné', async () => {
    fetchMock.mockResolvedValue(
      rpcOk([
        { id: 3, name: 'TF1', website: 'https://www.tf1.fr', write_date: '2026-10-02 09:00:00' },
        { id: 4, name: 'M6', website: false, write_date: '2026-10-03 09:00:00' },
      ]),
    )
    const page = await new OdooClient(CREDS).listCompanies(UID, { limit: 50 })
    expect(page.companies).toEqual([
      { id: '3', name: 'TF1', domain: 'https://www.tf1.fr', modifiedAt: '2026-10-02T09:00:00.000Z' },
      { id: '4', name: 'M6', domain: null, modifiedAt: '2026-10-03T09:00:00.000Z' },
    ])
  })

  it('affaires : crm.lead — montant, étape (libellé du Many2one), société ; le statut n’est PAS déduit', async () => {
    fetchMock.mockResolvedValue(
      rpcOk([
        {
          id: 21,
          name: 'Régie',
          expected_revenue: 90000,
          stage_id: [2, 'Proposition'],
          partner_id: [3, 'TF1'],
          date_deadline: '2026-12-01',
          write_date: '2026-10-04 09:00:00',
        },
      ]),
    )
    const page = await new OdooClient(CREDS).listDeals(UID, { limit: 50 })
    expect(call().model).toBe('crm.lead')
    expect(page.deals).toEqual([
      {
        id: '21',
        title: 'Régie',
        amount: 90000,
        currency: null,
        stage: 'Proposition',
        status: null,
        closeDate: '2026-12-01',
        closedAt: null,
        createdAt: null,
        accountId: '3',
        accountName: 'TF1',
        modifiedAt: '2026-10-04T09:00:00.000Z',
        ownerId: null,
        stageId: '2',
        lostReason: null,
        url: 'https://acme.odoo.com/web#id=21&model=crm.lead&view_type=form',
      },
    ])
    // SYNC-A — une PISTE (`type = lead`) n'est pas une affaire.
    expect(call().domain).toEqual([['type', '=', 'opportunity']])
    expect(call().kwargs['fields']).toEqual(expect.arrayContaining(['user_id', 'lost_reason_id']))
  })

  // #3918.8 (Louis 15/10/2026) — Odoo dit lui-même « gagnée » (probabilité 100 + date de clôture).
  it('#3918.8 — affaires : gagnée quand Odoo l’a marquée (probabilité 100 et date de clôture), ouverte sinon', async () => {
    fetchMock.mockResolvedValue(
      rpcOk([
        {
          id: 22,
          name: 'TMA',
          probability: 100,
          date_closed: '2025-09-01 10:00:00',
          create_date: '2025-06-01 10:00:00',
          write_date: '2025-09-01 10:00:00',
        },
        { id: 23, name: 'Audit', probability: 40, date_closed: false, create_date: '2026-01-02 08:00:00' },
        // sait dire NON : 100 % sans date de clôture n'est pas une victoire dite.
        { id: 24, name: 'Forfait', probability: 100, date_closed: false },
      ]),
    )
    const page = await new OdooClient(CREDS).listDeals(UID, { limit: 50 })
    expect(page.deals.map(d => [d.id, d.status, d.closedAt, d.createdAt])).toEqual([
      ['22', 'won', '2025-09-01T10:00:00.000Z', '2025-06-01T10:00:00.000Z'],
      ['23', 'open', null, '2026-01-02T08:00:00.000Z'],
      ['24', 'open', null, null],
    ])
  })

  it('⚠️ le module CRM absent de l’instance est une ERREUR dite, jamais « aucune affaire »', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        error: { message: 'Odoo Server Error', data: { message: "Object crm.lead doesn't exist" } },
      }),
    } as unknown as Response)
    await expect(new OdooClient(CREDS).listDeals(UID, { limit: 5 })).rejects.toThrow(/crm\.lead/)
  })

  it('activités : mail.activity — résumé, type (libellé), échéance ; « fait » n’est pas dit', async () => {
    fetchMock.mockResolvedValue(
      rpcOk([
        {
          id: 31,
          summary: 'Appeler',
          activity_type_id: [2, 'Appel'],
          date_deadline: '2026-11-02',
          write_date: '2026-10-05 09:00:00',
        },
      ]),
    )
    const page = await new OdooClient(CREDS).listActivities(UID, { limit: 50 })
    expect(call().model).toBe('mail.activity')
    expect(page.activities).toEqual([
      {
        id: '31',
        subject: 'Appeler',
        kind: 'Appel',
        dueAt: '2026-11-02',
        done: null,
        modifiedAt: '2026-10-05T09:00:00.000Z',
        ownerId: null,
        accountId: null,
        contactId: null,
        dealId: null,
        url: null,
      },
    ])
  })

  // SYNC-A — le miroir : propriétaire, rattachement par `res_model`/`res_id`, utilisateurs.
  it('activités (miroir) : rattachées à une affaire (crm.lead) ou à un partenaire (société OU personne), jamais la note', async () => {
    fetchMock.mockResolvedValue(
      rpcOk([
        { id: 32, user_id: [5, 'Claire'], res_model: 'crm.lead', res_id: 21, note: '<p>secret</p>' },
        { id: 33, res_model: 'res.partner', res_id: 3 },
        { id: 34, res_model: 'sale.order', res_id: 9 },
      ]),
    )
    const page = await new OdooClient(CREDS).listActivities(UID, { limit: 50 })
    expect(call().kwargs['fields']).not.toContain('note')
    expect(page.activities.map(a => [a.ownerId, a.dealId, a.accountId, a.contactId])).toEqual([
      ['5', '21', null, null],
      // `res.partner` porte sociétés ET personnes sous une même série d'identifiants : le lien Bellum tranche.
      [null, null, '3', '3'],
      [null, null, null, null],
    ])
    expect(JSON.stringify(page)).not.toContain('secret')
  })

  it('affaires (miroir) : propriétaire et raison de perte (libellés Many2one)', async () => {
    fetchMock.mockResolvedValue(rpcOk([{ id: 22, user_id: [5, 'Claire'], lost_reason_id: [1, 'Trop cher'] }]))
    const [deal] = (await new OdooClient(CREDS).listDeals(UID, { limit: 50 })).deals
    expect(deal).toMatchObject({ ownerId: '5', lostReason: 'Trop cher' })
  })

  it('propriétaires : res.users — nom, e-mail', async () => {
    fetchMock.mockResolvedValue(rpcOk([{ id: 5, name: 'Claire Martin', email: 'claire@esn.fr' }]))
    const page = await new OdooClient(CREDS).listOwners(UID, { limit: 50 })
    expect(call().model).toBe('res.users')
    expect(page.owners).toEqual([{ id: '5', name: 'Claire Martin', email: 'claire@esn.fr' }])
  })
})

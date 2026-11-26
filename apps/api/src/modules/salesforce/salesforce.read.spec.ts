import { SalesforceClient } from './salesforce.client'

type Init = { method?: string; headers?: Record<string, string> }
function stubFetch(handler: (url: string, init: Init) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const { status = 200, body = {} } = handler(String(input), init ?? {})
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

const client = new SalesforceClient({
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'https://x/cb',
  loginUrl: 'https://login.salesforce.com',
  scopes: 'api refresh_token',
  frontendUrl: 'https://app',
} as never)
const INSTANCE = 'https://acme.my.salesforce.com'
const soqlOf = (spy: jest.Mock): string => new URL(String(spy.mock.calls[0]?.[0])).searchParams.get('q') ?? ''

// #4189 — lecture commune : SOQL sur les objets STANDARD, champs standard seulement.
describe('SalesforceClient — lecture (#4189)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('contacts : SOQL trié par modification croissante, champs standard, société = Account.Name', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [
          {
            Id: '003A',
            FirstName: 'Ana',
            LastName: 'Roy',
            Email: 'a@b.fr',
            Title: 'DSI',
            Phone: null,
            Account: { Name: 'TF1' },
            LastModifiedDate: '2026-10-01T10:00:00.000+0000',
          },
        ],
        done: true,
      },
    }))
    const page = await client.listContacts('tok', INSTANCE, { limit: 50 })
    expect(page).toEqual({
      contacts: [
        {
          id: '003A',
          email: 'a@b.fr',
          firstName: 'Ana',
          lastName: 'Roy',
          company: 'TF1',
          jobTitle: 'DSI',
          phone: null,
          modifiedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
      nextAfter: null,
    })
    const soql = soqlOf(spy)
    expect(soql).toMatch(
      /^SELECT Id, FirstName, LastName, Email, Title, Phone, Account\.Name, LastModifiedDate FROM Contact/,
    )
    expect(soql).toMatch(/ORDER BY LastModifiedDate ASC$/)
    expect(soql).not.toMatch(/WHERE/)
  })

  it('« depuis » devient un filtre LastModifiedDate >= (secondes), idempotent à la seconde près', async () => {
    const spy = stubFetch(() => ({ body: { records: [], done: true } }))
    await client.listCompanies('tok', INSTANCE, { limit: 50, since: '2026-10-01T08:00:00.789Z' })
    expect(soqlOf(spy)).toContain('WHERE LastModifiedDate >= 2026-10-01T08:00:00Z')
    expect(soqlOf(spy)).toMatch(/^SELECT Id, Name, Website, LastModifiedDate FROM Account/)
  })

  it('un « depuis » qui n’est pas une date est refusé AVANT d’être mis dans le SOQL (injection)', async () => {
    const spy = stubFetch(() => ({ body: { records: [], done: true } }))
    await expect(
      client.listCompanies('tok', INSTANCE, { limit: 5, since: "2026-01-01' OR Name != '" }),
    ).rejects.toThrow(/date/i)
    expect(spy).not.toHaveBeenCalled()
  })

  it('continue par nextRecordsUrl (curseur), une URL qui n’est pas un chemin de requête est refusée', async () => {
    const spy = stubFetch(() => ({ body: { records: [], done: true } }))
    await client.listContacts('tok', INSTANCE, { limit: 50, after: '/services/data/v62.0/query/01gXX0000000001-2000' })
    expect(String(spy.mock.calls[0]?.[0])).toBe(`${INSTANCE}/services/data/v62.0/query/01gXX0000000001-2000`)

    await expect(
      client.listContacts('tok', INSTANCE, { limit: 5, after: 'https://evil.example/steal' }),
    ).rejects.toThrow(/curseur/i)
  })

  it('une page non terminée rend son nextRecordsUrl comme curseur', async () => {
    stubFetch(() => ({
      body: {
        records: [{ Id: '001A', Name: 'TF1' }],
        done: false,
        nextRecordsUrl: '/services/data/v62.0/query/01gZ-2000',
      },
    }))
    const page = await client.listCompanies('tok', INSTANCE, { limit: 50 })
    expect(page.nextAfter).toBe('/services/data/v62.0/query/01gZ-2000')
    expect(page.companies[0]).toMatchObject({ id: '001A', name: 'TF1', domain: null, modifiedAt: null })
  })

  it('affaires : statut gagnée/perdue/ouverte DIT par IsClosed/IsWon, montant absent = null, devise jamais supposée', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [
          {
            Id: '006A',
            Name: 'Régie',
            Amount: 90000,
            StageName: 'Negotiation',
            CloseDate: '2026-12-01',
            IsClosed: false,
            IsWon: false,
            AccountId: '001A',
            Account: { Name: 'TF1' },
            LastModifiedDate: '2026-10-02T10:00:00.000+0000',
          },
          {
            Id: '006B',
            Name: 'Gagnée',
            Amount: null,
            StageName: 'Closed Won',
            CloseDate: '2026-09-01',
            IsClosed: true,
            IsWon: true,
            AccountId: null,
            Account: null,
            LastModifiedDate: '2026-10-03T10:00:00.000+0000',
          },
          {
            Id: '006C',
            Name: 'Perdue',
            Amount: 10,
            StageName: 'Closed Lost',
            CloseDate: null,
            IsClosed: true,
            IsWon: false,
            AccountId: null,
            Account: null,
            LastModifiedDate: null,
          },
        ],
        done: true,
      },
    }))
    const page = await client.listDeals('tok', INSTANCE, { limit: 50 })
    expect(page.deals.map(d => [d.id, d.status, d.amount, d.currency, d.accountName])).toEqual([
      ['006A', 'open', 90000, null, 'TF1'],
      ['006B', 'won', null, null, null],
      ['006C', 'lost', 10, null, null],
    ])
    expect(page.deals[2]?.modifiedAt).toBeNull()
    expect(soqlOf(spy)).toMatch(/FROM Opportunity/)
  })

  // #3918.7 — la lecture profonde : la clôture RÉELLE (CloseDate d'une affaire fermée) et la création,
  // jamais l'échéance prévue d'une affaire ouverte.
  it('#3918.7 — closedAt = CloseDate d’une affaire FERMÉE seulement ; createdAt = CreatedDate ; jamais deviné', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [
          {
            Id: 'A',
            Name: 'Ouverte',
            StageName: 'Prospecting',
            CloseDate: '2026-12-31',
            IsClosed: false,
            IsWon: false,
            CreatedDate: '2026-01-02T10:00:00.000+0000',
          },
          {
            Id: 'B',
            Name: 'Perdue',
            StageName: 'Closed Lost',
            CloseDate: '2026-04-01',
            IsClosed: true,
            IsWon: false,
            CreatedDate: null,
          },
          { Id: 'C', Name: 'Sans statut', CloseDate: '2026-04-01', CreatedDate: null },
        ],
        done: true,
      },
    }))
    const page = await client.listDeals('tok', INSTANCE, { limit: 50 })
    expect(page.deals.map(d => [d.id, d.closedAt ?? null, d.createdAt ?? null])).toEqual([
      ['A', null, '2026-01-02T10:00:00.000Z'],
      ['B', '2026-04-01', null],
      ['C', null, null],
    ])
    expect(soqlOf(spy)).toMatch(/CreatedDate/)
  })

  // #4065.8 — l'interlocuteur = le rôle de contact PRINCIPAL de l'affaire, sinon absent.
  it('#4065.8 — contactName = le contact principal de l’affaire ; absent quand le CRM n’en rend pas', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [
          {
            Id: 'A',
            IsClosed: true,
            IsWon: false,
            OpportunityContactRoles: { records: [{ Contact: { Name: 'Jeanne Martin' } }] },
          },
          { Id: 'B', IsClosed: true, IsWon: true, OpportunityContactRoles: null },
        ],
        done: true,
      },
    }))
    const page = await client.listDeals('tok', INSTANCE, { limit: 50 })
    expect(page.deals.map(d => [d.id, d.contactName ?? null])).toEqual([
      ['A', 'Jeanne Martin'],
      ['B', null],
    ])
    expect(soqlOf(spy)).toMatch(/OpportunityContactRoles/)
  })

  it('activités : les tâches (Task) — sujet, échéance, fait ; le type n’est pas lu (champ non garanti)', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [
          {
            Id: '00TA',
            Subject: 'Relancer',
            ActivityDate: '2026-11-02',
            IsClosed: false,
            LastModifiedDate: '2026-10-04T10:00:00.000+0000',
          },
        ],
        done: true,
      },
    }))
    const page = await client.listActivities('tok', INSTANCE, { limit: 50 })
    expect(page.activities).toEqual([
      {
        id: '00TA',
        subject: 'Relancer',
        kind: null,
        dueAt: '2026-11-02',
        done: false,
        modifiedAt: '2026-10-04T10:00:00.000Z',
        ownerId: null,
        accountId: null,
        contactId: null,
        dealId: null,
        url: `${INSTANCE}/lightning/r/Task/00TA/view`,
      },
    ])
    expect(soqlOf(spy)).toMatch(/FROM Task/)
  })

  // SYNC-A — le miroir : propriétaire, liens, rendez-vous (Event) après les tâches, utilisateurs.
  it('activités (miroir) : propriétaire et liens — WhatId d’opportunité = affaire, WhoId de contact = personne', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [
          { Id: '00TB', OwnerId: '005A', AccountId: '001A', WhoId: '003A', WhatId: '006A', Description: 'secret' },
          { Id: '00TC', WhoId: '00QA', WhatId: '001B' },
        ],
        done: true,
      },
    }))
    const page = await client.listActivities('tok', INSTANCE, { limit: 50 })
    expect(soqlOf(spy)).toMatch(/SELECT Id, Subject, ActivityDate, IsClosed, OwnerId, AccountId, WhoId, WhatId,/)
    expect(soqlOf(spy)).not.toMatch(/Description/)
    expect(page.activities[0]).toMatchObject({ ownerId: '005A', accountId: '001A', contactId: '003A', dealId: '006A' })
    // Un prospect (00Q) n'est pas un contact, un WhatId de compte n'est pas une affaire : jamais rangés au hasard.
    expect(page.activities[1]).toMatchObject({ contactId: null, dealId: null })
    expect(JSON.stringify(page)).not.toContain('secret')
    // Les tâches lues jusqu'au bout : la page suivante est celle des rendez-vous.
    expect(page.nextAfter).toBe('event:')
  })

  it('activités (miroir) : les rendez-vous (Event) suivent les tâches — type « Event », curseur préfixé', async () => {
    const spy = stubFetch(() => ({
      body: {
        records: [{ Id: '00UA', Subject: 'Comité', StartDateTime: '2026-11-03T09:00:00.000+0000', WhatId: '006A' }],
        done: false,
        nextRecordsUrl: '/services/data/v59.0/query/01gEV-2000',
      },
    }))
    const page = await client.listActivities('tok', INSTANCE, { limit: 50, after: 'event:' })
    expect(soqlOf(spy)).toMatch(/FROM Event/)
    expect(page.activities[0]).toMatchObject({
      id: '00UA',
      kind: 'Event',
      dueAt: '2026-11-03T09:00:00.000Z',
      dealId: '006A',
    })
    expect(page.nextAfter).toBe('event:/services/data/v59.0/query/01gEV-2000')
    await client.listActivities('tok', INSTANCE, { limit: 50, after: page.nextAfter ?? '' })
    expect(String(spy.mock.calls[1]?.[0])).toBe(`${INSTANCE}/services/data/v59.0/query/01gEV-2000`)
  })

  it('affaires (miroir) : propriétaire, lien vers la fiche', async () => {
    stubFetch(() => ({ body: { records: [{ Id: '006A', OwnerId: '005A', IsClosed: false }], done: true } }))
    const [deal] = (await client.listDeals('tok', INSTANCE, { limit: 50 })).deals
    expect(deal).toMatchObject({ ownerId: '005A', url: `${INSTANCE}/lightning/r/Opportunity/006A/view` })
  })

  it('propriétaires : les utilisateurs (User) — nom, e-mail', async () => {
    const spy = stubFetch(() => ({
      body: { records: [{ Id: '005A', Name: 'Claire Martin', Email: 'claire@esn.fr' }], done: true },
    }))
    const page = await client.listOwners('tok', INSTANCE, { limit: 50 })
    expect(soqlOf(spy)).toMatch(/SELECT Id, Name, Email, LastModifiedDate FROM User/)
    expect(page).toEqual({ owners: [{ id: '005A', name: 'Claire Martin', email: 'claire@esn.fr' }], nextAfter: null })
  })

  it('demande des lots à la taille de la page (en-tête Sforce-Query-Options), bornée par Salesforce', async () => {
    const spy = stubFetch(() => ({ body: { records: [], done: true } }))
    await client.listContacts('tok', INSTANCE, { limit: 50 })
    expect((spy.mock.calls[0]?.[1] as Init).headers?.['Sforce-Query-Options']).toBe('batchSize=200')
    await client.listContacts('tok', INSTANCE, { limit: 5000 })
    expect((spy.mock.calls[1]?.[1] as Init).headers?.['Sforce-Query-Options']).toBe('batchSize=2000')
  })

  it('un hôte d’instance qui n’est pas Salesforce est refusé, une réponse en erreur est une erreur', async () => {
    await expect(client.listContacts('tok', 'https://evil.example', { limit: 5 })).rejects.toThrow(/instance_url/)
    stubFetch(() => ({ status: 403, body: { message: 'INSUFFICIENT_ACCESS' } }))
    await expect(client.listContacts('tok', INSTANCE, { limit: 5 })).rejects.toThrow(/INSUFFICIENT_ACCESS/)
  })
})

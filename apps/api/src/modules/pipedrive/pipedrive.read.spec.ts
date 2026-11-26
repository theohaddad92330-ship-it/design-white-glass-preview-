import { PipedriveClient } from './pipedrive.client'

type Init = { method?: string; headers?: Record<string, string> }
function stubFetch(handler: (url: string) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, _init?: Init) => {
    const { status = 200, body = {} } = handler(String(input))
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

const client = new PipedriveClient({
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'https://x/cb',
  scopes: '',
  frontendUrl: 'https://app',
})
const DOMAIN = 'https://acme.pipedrive.com'
const urlOf = (spy: jest.Mock, n = 0): URL => new URL(String(spy.mock.calls[n]?.[0]))

// #4189 — lecture commune Pipedrive : API v2 (cursor + updated_since), champs documentés seulement.
describe('PipedriveClient — lecture (#4189)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('contacts : /api/v2/persons trié par update_time croissant, limite bornée à 500, curseur next_cursor', async () => {
    const spy = stubFetch(() => ({
      body: {
        success: true,
        data: [
          {
            id: 7,
            name: 'Ana Roy',
            first_name: 'Ana',
            last_name: 'Roy',
            emails: [
              { value: 'old@b.fr', primary: false },
              { value: 'a@b.fr', primary: true },
            ],
            phones: [{ value: '+33102030405', primary: true }],
            org_id: 12,
            update_time: '2026-10-01T10:00:00Z',
          },
        ],
        additional_data: { next_cursor: 'cur-2' },
      },
    }))
    const page = await client.listContacts('tok', DOMAIN, { limit: 9999 })
    const url = urlOf(spy)
    expect(url.origin + url.pathname).toBe(`${DOMAIN}/api/v2/persons`)
    expect(url.searchParams.get('limit')).toBe('500')
    expect(url.searchParams.get('sort_by')).toBe('update_time')
    expect(url.searchParams.get('sort_direction')).toBe('asc')
    expect(page).toEqual({
      contacts: [
        {
          id: '7',
          email: 'a@b.fr',
          firstName: 'Ana',
          lastName: 'Roy',
          // Pipedrive ne rend que l'identifiant de l'organisation : le nom n'est pas lu (jamais deviné).
          company: null,
          jobTitle: null,
          phone: '+33102030405',
          modifiedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
      nextAfter: 'cur-2',
    })
  })

  it('« depuis » → updated_since (RFC 3339) ; le curseur est renvoyé tel quel', async () => {
    const spy = stubFetch(() => ({ body: { success: true, data: [], additional_data: {} } }))
    const page = await client.listCompanies('tok', DOMAIN, {
      limit: 10,
      since: '2026-10-01T08:00:00.000Z',
      after: 'cur-2',
    })
    const url = urlOf(spy)
    expect(url.pathname).toBe('/api/v2/organizations')
    // #4465 — le format que Pipedrive accepte : RFC 3339 à la seconde, sans millisecondes.
    expect(url.searchParams.get('updated_since')).toBe('2026-10-01T08:00:00Z')
    expect(url.searchParams.get('cursor')).toBe('cur-2')
    expect(page).toEqual({ companies: [], nextAfter: null })
  })

  it.each([
    ['persons', 'listContacts'],
    ['organizations', 'listCompanies'],
    ['deals', 'listDeals'],
    ['activities', 'listActivities'],
  ] as const)(
    '#4487 — %s : updated_since toujours RFC 3339 à la seconde, quelle que soit la forme du curseur',
    async (path, method) => {
      for (const since of ['2026-10-23T08:00:00.123Z', '2026-10-23T10:00:00+02:00', '2026-10-23 08:00:00.999+00']) {
        const spy = stubFetch(() => ({ body: { success: true, data: [], additional_data: {} } }))
        await client[method]('tok', DOMAIN, { limit: 10, since })
        const url = urlOf(spy)
        expect(url.pathname).toBe(`/api/v2/${path}`)
        expect(url.searchParams.get('updated_since')).toMatch(/^2026-10-23T08:00:00Z$/)
      }
    },
  )

  it('#4465 — un « depuis » illisible sort en erreur claire, sans appel réseau', async () => {
    const spy = stubFetch(() => ({ body: { data: [] } }))
    await expect(client.listContacts('tok', DOMAIN, { limit: 10, since: 'hier' })).rejects.toThrow(/Pipedrive.*depuis/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('sans e-mail primaire, le premier e-mail ; sans e-mail, null — jamais inventé', async () => {
    stubFetch(() => ({
      body: {
        data: [
          { id: 1, name: 'A', emails: [{ value: 'x@y.fr', primary: false }] },
          { id: 2, name: 'B', emails: [] },
          { id: 3, name: 'C' },
        ],
      },
    }))
    const page = await client.listContacts('tok', DOMAIN, { limit: 10 })
    expect(page.contacts.map(c => c.email)).toEqual(['x@y.fr', null, null])
    expect(page.contacts.map(c => c.modifiedAt)).toEqual([null, null, null])
  })

  it('affaires : le statut est celui que Pipedrive rend ; l’étape n’est qu’un identifiant — pas lue', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [
          {
            id: 4,
            title: 'Régie',
            value: 120000,
            currency: 'EUR',
            status: 'open',
            stage_id: 3,
            org_id: 12,
            expected_close_date: '2026-12-01',
            update_time: '2026-10-02T10:00:00Z',
          },
          { id: 5, title: 'Gagnée', value: null, currency: null, status: 'won', update_time: '2026-10-03T10:00:00Z' },
          { id: 6, title: 'Supprimée', status: 'deleted' },
        ],
        additional_data: {},
      },
    }))
    const page = await client.listDeals('tok', DOMAIN, { limit: 10 })
    expect(urlOf(spy).pathname).toBe('/api/v2/deals')
    expect(page.deals.map(d => [d.id, d.status, d.amount, d.currency, d.stage, d.accountName])).toEqual([
      ['4', 'open', 120000, 'EUR', null, null],
      ['5', 'won', null, null, null, null],
      ['6', null, null, null, null, null],
    ])
    expect(page.deals[0]?.accountId).toBe('12')
    expect(page.deals[0]?.closeDate).toBe('2026-12-01')
  })

  it('activités : /api/v2/activities — sujet, type tel que rendu, échéance, fait', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [
          {
            id: 9,
            subject: 'Appeler',
            type: 'call',
            due_date: '2026-11-02',
            done: false,
            update_time: '2026-10-04T10:00:00Z',
          },
        ],
        additional_data: {},
      },
    }))
    const page = await client.listActivities('tok', DOMAIN, { limit: 10 })
    expect(urlOf(spy).pathname).toBe('/api/v2/activities')
    expect(page.activities).toEqual([
      {
        id: '9',
        subject: 'Appeler',
        kind: 'call',
        dueAt: '2026-11-02',
        done: false,
        modifiedAt: '2026-10-04T10:00:00.000Z',
        ownerId: null,
        accountId: null,
        contactId: null,
        dealId: null,
        url: null,
      },
    ])
  })

  // SYNC-A — ce que le miroir garde : propriétaire, pipeline, étape, raison de perte, personne, champs propres, liens.
  it('affaires (miroir) : propriétaire, pipeline, étape, raison de perte, personne, champs propres et lien', async () => {
    stubFetch(() => ({
      body: {
        data: [
          {
            id: 4,
            title: 'Régie',
            status: 'lost',
            owner_id: 77,
            pipeline_id: 1,
            stage_id: 3,
            lost_reason: 'Budget',
            person_id: 8,
            org_id: 12,
            custom_fields: { abc123: 'Cloud' },
            update_time: '2026-10-02T10:00:00Z',
          },
        ],
        additional_data: {},
      },
    }))
    const [deal] = (await client.listDeals('tok', DOMAIN, { limit: 10 })).deals
    expect(deal).toMatchObject({
      ownerId: '77',
      pipelineId: '1',
      stageId: '3',
      lostReason: 'Budget',
      contactIds: ['8'],
      customFields: { abc123: 'Cloud' },
      url: `${DOMAIN}/deal/4`,
    })
  })

  it('activités (miroir) : propriétaire et liens société / personne / affaire — jamais la note', async () => {
    stubFetch(() => ({
      body: {
        data: [{ id: 9, type: 'meeting', owner_id: 77, org_id: 12, person_id: 8, deal_id: 4, note: 'secret' }],
        additional_data: {},
      },
    }))
    const [activity] = (await client.listActivities('tok', DOMAIN, { limit: 10 })).activities
    expect(activity).toMatchObject({ ownerId: '77', accountId: '12', contactId: '8', dealId: '4' })
    expect(JSON.stringify(activity)).not.toContain('secret')
  })

  it('propriétaires : /api/v1/users (liste complète, sans curseur)', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [
          { id: 77, name: 'Claire Martin', email: 'claire@esn.fr' },
          { id: 78, name: '' },
        ],
      },
    }))
    const page = await client.listOwners('tok', DOMAIN, { limit: 10 })
    expect(urlOf(spy).pathname).toBe('/api/v1/users')
    expect(page).toEqual({
      owners: [
        { id: '77', name: 'Claire Martin', email: 'claire@esn.fr' },
        { id: '78', name: null, email: null },
      ],
      nextAfter: null,
    })
  })

  it('pipelines : /api/v2/pipelines puis /api/v2/stages, étapes rangées par order_nr', async () => {
    const spy = stubFetch(url =>
      url.includes('/stages')
        ? {
            body: {
              data: [
                { id: 3, pipeline_id: 1, name: 'Proposition', order_nr: 2 },
                { id: 2, pipeline_id: 1, name: 'Qualifié', order_nr: 1 },
              ],
              additional_data: {},
            },
          }
        : { body: { data: [{ id: 1, name: 'Ventes' }], additional_data: {} } },
    )
    const page = await client.listPipelines('tok', DOMAIN, { limit: 10 })
    expect(urlOf(spy, 0).pathname).toBe('/api/v2/pipelines')
    expect(urlOf(spy, 1).pathname).toBe('/api/v2/stages')
    expect(page).toEqual({
      pipelines: [
        {
          id: '1',
          label: 'Ventes',
          stages: [
            { id: '2', label: 'Qualifié', position: 1, status: null },
            { id: '3', label: 'Proposition', position: 2, status: null },
          ],
        },
      ],
      nextAfter: null,
    })
  })

  it('#4290.4 — pipelines et étapes : jamais de `updated_since` (refusé par Pipedrive), même avec un « depuis »', async () => {
    const spy = stubFetch(() => ({ body: { data: [], additional_data: {} } }))
    await client.listPipelines('tok', DOMAIN, { limit: 10, since: '2026-10-01T08:00:00.000Z' })
    expect(urlOf(spy, 0).searchParams.has('updated_since')).toBe(false)
    expect(urlOf(spy, 1).searchParams.has('updated_since')).toBe(false)
  })

  it('une réponse en erreur est une erreur, pas une page vide', async () => {
    stubFetch(() => ({ status: 403, body: { error: 'Scope and URL mismatch' } }))
    await expect(client.listDeals('tok', DOMAIN, { limit: 10 })).rejects.toThrow(/Scope and URL mismatch/)
  })

  // #4290.15 — recette 21/10 : une reprise « 1 entreprise / 0 contact / 0 affaire / 0 activité » sur un
  // sandbox lisible. Réponses réalistes : personne saisie avec le seul `name`, sans e-mail (first/last_name
  // nuls) ; `org_id` / `person_id` rendus en OBJET (`{ value }`) par les comptes non migrés en v2.
  it('#4290.15 contacts : une personne sans prénom/nom séparés garde son `name` — jamais une fiche muette', async () => {
    stubFetch(() => ({
      body: {
        success: true,
        data: [{ id: 3, name: 'Julien Martin', first_name: null, last_name: null, emails: [], phones: [] }],
        additional_data: {},
      },
    }))
    const page = await client.listContacts('tok', DOMAIN, { limit: 10 })
    expect([page.contacts[0]?.firstName, page.contacts[0]?.lastName].filter(Boolean).join(' ')).toBe('Julien Martin')
  })

  it('#4290.15 affaires et activités : `org_id` / `person_id` en objet { value } sont lus comme des identifiants', async () => {
    stubFetch(url =>
      url.includes('/deals')
        ? {
            body: {
              data: [{ id: 1, title: 'D', org_id: { value: 12, name: 'Acme' }, person_id: { value: 7 } }],
              additional_data: {},
            },
          }
        : {
            body: {
              data: [{ id: 2, subject: 'Appel', org_id: { value: 12 }, person_id: { value: 7 } }],
              additional_data: {},
            },
          },
    )
    const deals = await client.listDeals('tok', DOMAIN, { limit: 10 })
    expect(deals.deals[0]?.accountId).toBe('12')
    expect(deals.deals[0]?.contactIds).toEqual(['7'])
    const activities = await client.listActivities('tok', DOMAIN, { limit: 10 })
    expect(activities.activities[0]?.accountId).toBe('12')
    expect(activities.activities[0]?.contactId).toBe('7')
  })
})

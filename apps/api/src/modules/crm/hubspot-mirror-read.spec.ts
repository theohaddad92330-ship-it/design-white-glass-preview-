import { HubspotClient } from './hubspot.client'

/**
 * SYNC-A (19/10/2026) — ce que le MIROIR lit de HubSpot, au-delà des comptes et contacts : le détail des
 * affaires (propriétaire, pipeline, étape, raison de perte, société et contacts associés), les activités
 * (appels, rendez-vous, tâches, notes — jamais leur corps), les propriétaires et les pipelines.
 * Réponses moquées sur la forme documentée de l'API CRM v3.
 */
type Init = { method?: string; headers?: Record<string, string> }
function stubFetch(handler: (url: string) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, _init?: Init) => {
    const { status = 200, body = {} } = handler(String(input))
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' }
  }) as never) as unknown as jest.Mock
}
const client = new HubspotClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', scopes: '' } as never)
const urlOf = (spy: jest.Mock, n = 0): URL => new URL(String(spy.mock.calls[n]?.[0]))

describe('HubspotClient — lecture du miroir (SYNC-A)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('affaires : propriétaire, pipeline, étape, raison de perte, société et contacts associés', async () => {
    const spy = stubFetch(() => ({
      body: {
        results: [
          {
            id: '9',
            properties: {
              dealname: 'Régie',
              dealstage: 'closedlost',
              pipeline: 'default',
              hubspot_owner_id: '501',
              closed_lost_reason: 'Budget',
            },
            associations: {
              companies: { results: [{ id: '301', type: 'deal_to_company' }] },
              contacts: { results: [{ id: '401' }, { id: '402' }] },
            },
          },
        ],
      },
    }))
    const [deal] = (await client.listDeals('tok', { limit: 10 })).deals
    const url = urlOf(spy)
    expect(url.searchParams.get('associations')).toBe('companies,contacts')
    expect(url.searchParams.get('properties')).toContain('hubspot_owner_id')
    expect(deal).toMatchObject({
      status: 'lost',
      ownerId: '501',
      pipelineId: 'default',
      stageId: 'closedlost',
      lostReason: 'Budget',
      accountId: '301',
      contactIds: ['401', '402'],
    })
  })

  it('activités : appels, puis rendez-vous, tâches, notes — un curseur par type, jamais le corps', async () => {
    const spy = stubFetch(url => {
      if (url.includes('/calls') && !url.includes('after='))
        return {
          body: {
            results: [
              {
                id: 'c1',
                properties: {
                  hs_call_title: 'Point projet',
                  hs_timestamp: '2026-10-10T09:00:00Z',
                  hubspot_owner_id: '501',
                  hs_lastmodifieddate: '2026-10-10T10:00:00Z',
                  hs_call_body: 'secret',
                },
                associations: { companies: { results: [{ id: '301' }] }, deals: { results: [{ id: '9' }] } },
              },
            ],
            paging: { next: { after: 'p2' } },
          },
        }
      return { body: { results: [] } }
    })
    const page = await client.listActivities('tok', { limit: 10 })
    expect(urlOf(spy).pathname).toBe('/crm/v3/objects/calls')
    expect(urlOf(spy).searchParams.get('properties')).not.toMatch(/body/)
    expect(page.activities).toEqual([
      {
        id: 'c1',
        subject: 'Point projet',
        kind: 'call',
        dueAt: '2026-10-10T09:00:00Z',
        done: null,
        modifiedAt: '2026-10-10T10:00:00Z',
        ownerId: '501',
        accountId: '301',
        contactId: null,
        dealId: '9',
        url: null,
      },
    ])
    expect(page.nextAfter).toBe('calls:p2')
    expect(JSON.stringify(page)).not.toContain('secret')

    // Les appels lus jusqu'au bout : le type suivant (rendez-vous) prend le relais.
    const next = await client.listActivities('tok', { limit: 10, after: 'calls:p2' })
    expect(urlOf(spy, 1).searchParams.get('after')).toBe('p2')
    expect(next.nextAfter).toBe('meetings:')
    await client.listActivities('tok', { limit: 10, after: 'notes:' })
    expect(urlOf(spy, 2).pathname).toBe('/crm/v3/objects/notes')
  })

  it('activités : une tâche COMPLETED est faite ; un type de curseur inconnu est refusé', async () => {
    stubFetch(() => ({
      body: { results: [{ id: 't1', properties: { hs_task_subject: 'Relancer', hs_task_status: 'COMPLETED' } }] },
    }))
    const page = await client.listActivities('tok', { limit: 10, after: 'tasks:' })
    expect(page.activities[0]).toMatchObject({ kind: 'task', subject: 'Relancer', done: true })
    expect(page.nextAfter).toBe('notes:')
    await expect(client.listActivities('tok', { limit: 10, after: 'emails:' })).rejects.toThrow(/curseur/)
  })

  it('propriétaires : /crm/v3/owners — nom composé, e-mail', async () => {
    const spy = stubFetch(() => ({
      body: { results: [{ id: '501', firstName: 'Claire', lastName: 'Martin', email: 'claire@esn.fr' }] },
    }))
    const page = await client.listOwners('tok', { limit: 10 })
    expect(urlOf(spy).pathname).toBe('/crm/v3/owners')
    expect(page).toEqual({ owners: [{ id: '501', name: 'Claire Martin', email: 'claire@esn.fr' }], nextAfter: null })
  })

  it('pipelines : /crm/v3/pipelines/deals — étapes ordonnées, gagnée/perdue dites par la probabilité de clôture', async () => {
    stubFetch(() => ({
      body: {
        results: [
          {
            id: 'default',
            label: 'Ventes',
            stages: [
              { id: 'closedwon', label: 'Gagnée', displayOrder: 5, metadata: { isClosed: 'true', probability: '1.0' } },
              { id: 'qualified', label: 'Qualifié', displayOrder: 1, metadata: { isClosed: 'false' } },
              {
                id: 'closedlost',
                label: 'Perdue',
                displayOrder: 6,
                metadata: { isClosed: 'true', probability: '0.0' },
              },
            ],
          },
        ],
      },
    }))
    const page = await client.listPipelines('tok')
    expect(page.pipelines[0]?.stages).toEqual([
      { id: 'qualified', label: 'Qualifié', position: 1, status: 'open' },
      { id: 'closedwon', label: 'Gagnée', position: 5, status: 'won' },
      { id: 'closedlost', label: 'Perdue', position: 6, status: 'lost' },
    ])
  })

  it('une réponse en erreur est une erreur, jamais une page vide', async () => {
    stubFetch(() => ({ status: 403, body: { message: 'missing scopes' } }))
    await expect(client.listOwners('tok', { limit: 10 })).rejects.toThrow(/owners/)
  })
})

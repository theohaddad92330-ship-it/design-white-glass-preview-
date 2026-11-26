import { HubspotDepthClient } from './hubspot-depth.client'

/** #3918.a — la lecture profonde des deals rapporte la société associée
 *  (id, domaine, SIREN) : les clés de la jointure deal → compte. */
describe('#3918.a — HubspotDepthClient.readDealHistory, société associée', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  function json(body: unknown, ok = true): Response {
    return { ok, status: ok ? 200 : 403, json: async () => body, text: async () => JSON.stringify(body) } as Response
  }

  function stubFetch(companiesOk: boolean): jest.Mock {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('/pipelines/deals')) return json({ results: [] })
      if (url.includes('/owners')) return json({ results: [] })
      if (url.includes('/companies/batch/read')) {
        return companiesOk
          ? json({ results: [{ id: 'c-1', properties: { domain: 'axa.fr', siren: '572093920' } }] })
          : json({ message: 'scope missing' }, false)
      }
      return json({
        results: [
          {
            id: 'd-1',
            properties: { dealname: 'TMA AXA', hs_is_closed: 'false' },
            associations: { companies: { results: [{ id: 'c-1' }] } },
          },
          { id: 'd-2', properties: { dealname: 'Sans société', hs_is_closed: 'false' } },
        ],
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
  }

  it("demande l'association société et rapporte id, domaine et SIREN", async () => {
    const fetchMock = stubFetch(true)
    const { deals } = await new HubspotDepthClient().readDealHistory('token')
    expect(String(fetchMock.mock.calls.find(([url]) => String(url).includes('/objects/deals'))?.[0])).toContain(
      'associations=companies',
    )
    expect(deals[0]).toMatchObject({ companyExternalId: 'c-1', companyDomain: 'axa.fr', companySiren: '572093920' })
    // Aucune association : aucune clé — jamais un domaine déduit du nom du deal.
    expect(deals[1]).toMatchObject({ companyExternalId: null, companyDomain: null, companySiren: null })
  })

  it("lecture des sociétés refusée : l'id société reste, domaine et SIREN restent inconnus", async () => {
    stubFetch(false)
    const { deals } = await new HubspotDepthClient().readDealHistory('token')
    expect(deals[0]).toMatchObject({ companyExternalId: 'c-1', companyDomain: null, companySiren: null })
  })
})

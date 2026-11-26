import {
  LemlistApiError,
  createLeadInCampaign,
  lemlistAuthorization,
  listCampaigns,
  listLeadActivities,
  verifyKey,
} from './lemlist.client'

/** #4427 — le client suit la doc publique lue le 21/10/2026, rien de deviné. */
describe('lemlist.client (#4427)', () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  const json = (status: number, body: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response

  it('authentification BASIC : identifiant vide, deux-points AVANT la clé', () => {
    expect(lemlistAuthorization('secret')).toBe(`Basic ${Buffer.from(':secret').toString('base64')}`)
  })

  it('#4427.1 — vérifie la clé par GET /team ; 401 = clé refusée, sans relancer', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { _id: 'tea_1', name: 'ESN' }))
    await expect(verifyKey('k')).resolves.toBe('valid')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.lemlist.com/api/team')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(lemlistAuthorization('k'))

    fetchMock.mockResolvedValueOnce(json(401, {}))
    await expect(verifyKey('k')).resolves.toBe('rejected')
    fetchMock.mockResolvedValueOnce(json(500, {}))
    await expect(verifyKey('k')).rejects.toBeInstanceOf(LemlistApiError)
  })

  it('#4427.2 — liste les campagnes (v2), le statut absent reste null', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, [
        { _id: 'cam_1', name: 'Relance DSI', status: 'running' },
        { _id: 'cam_2', name: 'Brouillon' },
        { name: 'sans id' },
      ]),
    )
    await expect(listCampaigns('k')).resolves.toEqual([
      { id: 'cam_1', name: 'Relance DSI', status: 'running' },
      { id: 'cam_2', name: 'Brouillon', status: null },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.lemlist.com/api/campaigns?version=v2&limit=100')
  })

  it('#4427.2 — lit la forme paginée v2 { campaigns, pagination } (recette 22/10 : « Aucune campagne »)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        campaigns: [{ _id: 'cam_SkcK7zSafiYDWrcfE', name: 'Bellum recette — ne pas lancer', status: 'draft' }],
        pagination: { totalRecords: 1, currentPage: 1, nextPage: null, totalPage: 1 },
      }),
    )
    await expect(listCampaigns('k')).resolves.toEqual([
      { id: 'cam_SkcK7zSafiYDWrcfE', name: 'Bellum recette — ne pas lancer', status: 'draft' },
    ])
  })

  it('#4427.2 — un corps ni tableau ni { campaigns } est une panne nommée, pas « Aucune campagne »', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { unexpected: true }))
    await expect(listCampaigns('k')).rejects.toThrow(/campagnes/)
  })

  it('#4427.2 — ajoute le lead, sans enrichissement payant, et nomme le doublon refusé', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { _id: 'lea_1', campaignId: 'cam_1', campaignName: 'Relance DSI' }))
    await expect(
      createLeadInCampaign('k', 'cam_1', { email: 'a@b.fr', firstName: 'Ada', lastName: 'L' }),
    ).resolves.toEqual({ outcome: 'pushed', leadId: 'lea_1', campaignName: 'Relance DSI' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.lemlist.com/api/campaigns/cam_1/leads/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.fr', firstName: 'Ada', lastName: 'L' })

    fetchMock.mockResolvedValueOnce(json(400, { code: 'LEAD_ALREADY_IN_CAMPAIGN' }))
    await expect(createLeadInCampaign('k', 'cam_1', { email: 'a@b.fr' })).resolves.toEqual({
      outcome: 'already_in_campaign',
      leadId: null,
      campaignName: null,
    })

    // La doc rend ce 400 en text/plain (« Lead already in the campaign ») : les deux formes sont reconnues.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Lead already in the campaign',
    } as Response)
    await expect(createLeadInCampaign('k', 'cam_1', { email: 'a@b.fr' })).resolves.toMatchObject({
      outcome: 'already_in_campaign',
    })

    fetchMock.mockResolvedValueOnce(json(400, { code: 'OTHER' }))
    await expect(createLeadInCampaign('k', 'cam_1', { email: 'a@b.fr' })).rejects.toBeInstanceOf(LemlistApiError)
  })

  it('#4427.3 — relit les activités d’UN lead (v2) dans SA campagne', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, [
        { type: 'emailsSent', createdAt: '2026-10-01T09:00:00.000Z' },
        { type: 'emailsOpened' },
        { createdAt: 'x' },
      ]),
    )
    await expect(listLeadActivities('k', 'cam_1', 'lea_1')).resolves.toEqual([
      { type: 'emailsSent', createdAt: '2026-10-01T09:00:00.000Z' },
      { type: 'emailsOpened', createdAt: null },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.lemlist.com/api/activities?version=v2&leadId=lea_1&campaignId=cam_1&limit=100',
    )
  })
})

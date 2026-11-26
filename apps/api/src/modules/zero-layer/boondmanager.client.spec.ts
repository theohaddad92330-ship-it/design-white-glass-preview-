import { dispatchFailureOutcome } from '@bellum/contracts'
import { BoondManagerClient } from './boondmanager.client'

/**
 * L'ÉCRITURE dans l'ERP — le seul endroit du produit qui en fait une.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `write()` était `method: 'POST'` EN DUR vers une collection, quel que soit le
 * geste. Un `update_tjm` — censé CORRIGER une mission existante — créait donc un
 * doublon dans l'ERP au lieu de la corriger. Ce fichier prouve la distinction :
 * `create()` POSTe vers la collection, `update()` PATCHe la ressource par son
 * id, et un `update()` SANS id est REFUSÉ plutôt que silencieusement rejoué en
 * création.
 *
 * Le réseau est SIMULÉ, jamais laissé partir (le même motif que
 * `salesforce.client.spec.ts` : un test d'unité ne doit dépendre ni d'un DNS ni
 * de l'absence de réseau).
 */
describe('BoondManagerClient — create() vs update()', () => {
  const config = { baseUrl: 'https://erp.test/api', searchParam: 'keywords', userToken: 'tok' }

  const fetchMock = jest.fn()
  const realFetch = global.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = realFetch
  })

  function jsonResponse(status: number, body: string): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    } as unknown as Response
  }

  describe('create() — une CRÉATION', () => {
    it('POSTe vers la collection, sans identifiant de ressource dans l’URL', async () => {
      fetchMock.mockResolvedValue(jsonResponse(201, '{"id":"D-99"}'))
      const client = new BoondManagerClient(config)

      const outcome = await client.create('/deliveries', { consultantName: 'Marc', dailyRate: 620 })

      expect(outcome.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://erp.test/api/deliveries')
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body))).toEqual({ consultantName: 'Marc', dailyRate: 620 })
    })
  })

  describe('update() — une CORRECTION', () => {
    it('PATCHe la ressource par son id, jamais la collection', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, '{"id":"D-42"}'))
      const client = new BoondManagerClient(config)

      const outcome = await client.update('/deliveries', 'D-42', { dailyRate: 700 })

      expect(outcome.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://erp.test/api/deliveries/D-42')
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(String(init.body))).toEqual({ dailyRate: 700 })
    })

    it('encode l’identifiant dans l’URL — un id qui porte un `/` ne casse pas le chemin', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, '{}'))
      const client = new BoondManagerClient(config)

      await client.update('/deliveries', 'D/42', { dailyRate: 700 })

      const [url] = fetchMock.mock.calls[0] as [string]
      expect(url).toBe('https://erp.test/api/deliveries/D%2F42')
    })

    it('REFUSE un identifiant absent — jamais transformé en POST de création', async () => {
      const client = new BoondManagerClient(config)

      const outcome = await client.update('/deliveries', '', { dailyRate: 700 })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.detail).toMatch(/identifiant/i)
      // Le point qui décide de la qualité : AUCUN appel réseau n'est parti. Un
      // id absent silencieusement transformé en POST créerait un doublon.
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('REFUSE un identifiant qui n’est que des espaces', async () => {
      const client = new BoondManagerClient(config)
      const outcome = await client.update('/deliveries', '   ', { dailyRate: 700 })
      expect(outcome.ok).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('idempotence — un `unknown` n’est pas une raison de rejouer en création', () => {
    it('classe une requête PARTIE sans réponse comme `unknown`, pas `failed`', async () => {
      // Le classificateur du dépôt (`dispatchFailureOutcome`) dit que
      // `AbortError` est un abandon EN VOL : on ne sait pas si l'ERP a appliqué
      // le PATCH. C'est précisément pour ce cas que la correction est un PATCH
      // idempotent — le rejouer sur la MÊME ressource ne double jamais
      // l'enregistrement, contrairement à un POST.
      const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      expect(dispatchFailureOutcome(abortError)).toBe('unknown')
      fetchMock.mockRejectedValue(abortError)
      const client = new BoondManagerClient(config)

      const outcome = await client.update('/deliveries', 'D-42', { dailyRate: 700 })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.outcome).toBe('unknown')
    })

    it('classe une connexion jamais établie comme `failed` — rejouable', async () => {
      const neverLeft = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      fetchMock.mockRejectedValue(neverLeft)
      const client = new BoondManagerClient(config)

      const outcome = await client.update('/deliveries', 'D-42', { dailyRate: 700 })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.outcome).toBe('failed')
    })

    it('un refus applicatif de l’ERP (4xx/5xx) est `failed` — le distant a RÉPONDU', async () => {
      fetchMock.mockResolvedValue(jsonResponse(422, 'champ inconnu'))
      const client = new BoondManagerClient(config)

      const outcome = await client.update('/deliveries', 'D-42', { dailyRate: 700 })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.outcome).toBe('failed')
    })
  })
})

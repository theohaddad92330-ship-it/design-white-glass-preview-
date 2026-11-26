import { OdooClient, type OdooCredentials } from './odoo.client'

// La garde SSRF résout vraiment le nom d'hôte : `acme.odoo.com` n'a pas de DNS
// public, donc on simule une résolution publique pour les cas qui doivent
// passer la garde — les deux tests qui doivent l'ARRÊTER (IP littérale,
// protocole http) ne passent jamais par `lookup` et restent sur le vrai code.
jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }))

/**
 * Le client Odoo, contre des réponses simulées.
 *
 * ⚠️ CE QUE CES TESTS NE PROUVENT PAS. Ils vérifient que le client lit
 * correctement la FORME de réponse documentée par Odoo ; ils ne prouvent pas
 * que l'instance répond bien cette forme, puisque aucune instance réelle n'a
 * encore été branchée. La doctrine du dépôt le dit : un contrat d'API non
 * vérifiable ne se devine pas. La première connexion réelle reste la recette
 * de ce connecteur, et rien ici ne la remplace.
 *
 * Ce qu'ils prouvent, en revanche, tient à trois pièges que ce protocole tend
 * et qu'un client naïf rate tous les trois.
 */

const CREDS: OdooCredentials = {
  baseUrl: 'https://acme.odoo.com',
  db: 'acme-prod',
  login: 'sales@acme.fr',
  apiKey: 'a'.repeat(40),
}

/** La réponse d'un `fetch` simulé. Odoo répond TOUJOURS 200 en JSON-RPC. */
function rpcOk(result: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', result }) } as unknown as Response
}
function rpcError(message: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', error: { message: 'Odoo Server Error', data: { message } } }),
  } as unknown as Response
}

let fetchMock: jest.Mock

const realFetch = global.fetch

beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = realFetch
  jest.restoreAllMocks()
})

/** Le corps JSON du n-ième appel sortant. */
function callBody(index: number): { params: { service: string; method: string; args: unknown[] } } {
  return JSON.parse(fetchMock.mock.calls[index][1].body)
}

describe('OdooClient — les trois pièges du JSON-RPC', () => {
  it('parle à `/jsonrpc` sur l’instance, jamais ailleurs', async () => {
    fetchMock.mockResolvedValue(rpcOk(7))
    await new OdooClient(CREDS).findPartnerByEmail(7, 'x@y.fr').catch(() => undefined)
    expect(fetchMock.mock.calls[0][0]).toBe('https://acme.odoo.com/jsonrpc')
  })

  it('n’ajoute PAS un second slash quand l’adresse en porte déjà un', async () => {
    // Un utilisateur colle presque toujours l'adresse avec son slash final.
    // `https://acme.odoo.com//jsonrpc` répond 404 sur certaines configurations
    // de proxy — un défaut qui ne se voit qu'en production, chez ce client-là.
    fetchMock.mockResolvedValue(rpcOk([]))
    await new OdooClient({ ...CREDS, baseUrl: 'https://acme.odoo.com/' }).listPartners(1, 10)
    expect(fetchMock.mock.calls[0][0]).toBe('https://acme.odoo.com/jsonrpc')
  })

  describe('piège n°1 — une erreur arrive en HTTP 200', () => {
    it('lève avec le message MÉTIER, pas avec « Odoo Server Error »', async () => {
      // `res.ok` vaut `true` : un client qui s'arrête là lit `undefined` comme
      // un succès. Et `error.message` seul dit « Odoo Server Error », qui
      // n'aide personne — la raison vit dans `error.data.message`.
      fetchMock.mockResolvedValue(rpcError('Access denied for database acme-prod'))
      await expect(new OdooClient(CREDS).listPartners(1, 10)).rejects.toThrow('Access denied for database acme-prod')
    })

    it('refuse une réponse SANS résultat plutôt que de rendre `undefined`', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0' }),
      } as unknown as Response)
      await expect(new OdooClient(CREDS).listPartners(1, 10)).rejects.toThrow('Réponse vide')
    })

    it('K.3 — un 404 sur l’écriture NOMME l’appel (modèle.méthode), sans clé ni corps', async () => {
      fetchMock.mockResolvedValueOnce(rpcOk([])) // search : la lecture passe
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)
      const error = await new OdooClient(CREDS).upsertCompanyPartner(7, { name: 'Acme' }).catch((e: Error) => e)
      expect(error).toMatchObject({ name: 'OdooCallError', status: 404 })
      expect((error as Error).message).toContain('res.partner.create')
      expect((error as Error).message).not.toContain(CREDS.apiKey)
    })

    it('remonte quand même un vrai code HTTP d’échec — une passerelle peut couper', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as unknown as Response)
      await expect(new OdooClient(CREDS).listPartners(1, 10)).rejects.toThrow('502')
    })
  })

  describe('piège n°2 — `login` rend `false`, pas une erreur', () => {
    it('refuse un uid `false` au lieu de l’enregistrer', async () => {
      // C'est LE piège du protocole : des identifiants faux ne produisent
      // aucune erreur, seulement `result: false`. Un client qui teste
      // `!payload.error` enregistrerait une connexion avec `uid = false`, et
      // le premier export échouerait des jours plus tard, ailleurs.
      fetchMock.mockResolvedValue(rpcOk(false))
      await expect(new OdooClient(CREDS).authenticate()).rejects.toThrow('Identifiants refusés')
    })

    it('refuse aussi un uid `0`, que `!uid` laisserait passer autrement', async () => {
      fetchMock.mockResolvedValue(rpcOk(0))
      await expect(new OdooClient(CREDS).authenticate()).rejects.toThrow('Identifiants refusés')
    })

    it('accepte un uid valide, et rend ce qu’il a appris', async () => {
      fetchMock
        .mockResolvedValueOnce(rpcOk(12))
        .mockResolvedValueOnce(rpcOk({ server_version: '17.0' }))
        .mockResolvedValueOnce(rpcOk([{ name: 'Camille Fournier' }]))
      const identity = await new OdooClient(CREDS).authenticate()
      expect(identity).toEqual({ uid: 12, serverVersion: '17.0', userName: 'Camille Fournier' })
    })

    it('reste connecté même si la version et le nom sont refusés', async () => {
      // Ces deux lectures sont du CONFORT de diagnostic : leur échec ne doit
      // pas faire échouer une connexion par ailleurs valide.
      fetchMock
        .mockResolvedValueOnce(rpcOk(12))
        .mockResolvedValueOnce(rpcError('nope'))
        .mockResolvedValueOnce(rpcError('nope'))
      const identity = await new OdooClient(CREDS).authenticate()
      expect(identity).toEqual({ uid: 12, serverVersion: null, userName: null })
    })
  })

  describe('piège n°3 — un champ absent EFFACE la valeur du client', () => {
    it('n’envoie que les champs RENSEIGNÉS', async () => {
      // Envoyer `phone: false` sur un contact dont on ne connaît pas le
      // téléphone effacerait celui que le client a saisi chez lui. Une
      // correction humaine gagne toujours — y compris la sienne.
      fetchMock.mockResolvedValueOnce(rpcOk([])).mockResolvedValueOnce(rpcOk(42))
      await new OdooClient(CREDS).upsertContact(12, { name: 'Marie Martin', email: 'marie@acme.fr' })

      const create = callBody(1).params.args[5] as [Record<string, unknown>]
      expect(create[0]).toEqual({ name: 'Marie Martin', email: 'marie@acme.fr' })
      expect(Object.keys(create[0])).not.toContain('phone')
      expect(Object.keys(create[0])).not.toContain('function')
    })

    it('MET À JOUR la fiche existante quand l’e-mail correspond, et le dit', async () => {
      fetchMock.mockResolvedValueOnce(rpcOk([77])).mockResolvedValueOnce(rpcOk(true))
      const result = await new OdooClient(CREDS).upsertContact(12, { name: 'Marie', email: 'marie@acme.fr' })
      expect(result).toEqual({ action: 'updated', partnerId: 77 })
      expect(callBody(1).params.args[4]).toBe('write')
    })

    it('CRÉE plutôt que de rapprocher par le NOM quand il n’y a pas d’e-mail', async () => {
      // Rapprocher deux personnes sur une ressemblance de nom écraserait la
      // fiche d'un homonyme. Le dépôt PROPOSE une fusion, il ne fusionne
      // jamais : sans e-mail, on crée, quitte à laisser un doublon visible —
      // qui se corrige, là où un écrasement ne se corrige pas.
      fetchMock.mockResolvedValueOnce(rpcOk(99))
      const result = await new OdooClient(CREDS).upsertContact(12, { name: 'Jean Dupont' })
      expect(result).toEqual({ action: 'created', partnerId: 99 })
      // UN SEUL appel : aucune recherche n'a été tentée.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(callBody(0).params.args[4]).toBe('create')
    })
  })

  describe('la porte SSRF — l’adresse vient de l’utilisateur', () => {
    it('refuse une cible interne AVANT d’émettre quoi que ce soit', async () => {
      // Contrairement aux quatre autres CRM, l'adresse d'une instance Odoo est
      // SAISIE : sans cette garde, un utilisateur ferait émettre à l'API des
      // requêtes vers le service de métadonnées du cloud.
      await expect(
        new OdooClient({ ...CREDS, baseUrl: 'https://169.254.169.254' }).listPartners(1, 10),
      ).rejects.toThrow(/interne/i)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuse `http`, où la clé d’API voyagerait en clair', async () => {
      await expect(new OdooClient({ ...CREDS, baseUrl: 'http://acme.odoo.com' }).listPartners(1, 10)).rejects.toThrow(
        /https/i,
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it('demande des champs EXPLICITES — jamais tout le modèle', async () => {
    // `search_read` sans `fields` rend toutes les colonnes de `res.partner`,
    // dont les champs personnalisés du client. On ne stocke pas ce qu'on n'a
    // pas demandé.
    fetchMock.mockResolvedValue(rpcOk([]))
    await new OdooClient(CREDS).listPartners(12, 50)
    const kwargs = callBody(0).params.args[6] as { fields: string[]; limit: number }
    expect(kwargs.fields).toEqual(['id', 'name', 'email', 'phone', 'function', 'parent_id'])
    expect(kwargs.limit).toBe(50)
  })
})

// #2561/#2562 — les VENTES confirmées, en LECTURE SEULE.
describe('OdooClient.listConfirmedSaleOrders — les ventes de l’outil, lues sans rien écrire', () => {
  const ORDER = {
    id: 42,
    name: 'S00042',
    partner_id: [7, 'SNCF'],
    client_order_ref: false,
    date_order: '2026-09-01 08:30:00',
    commitment_date: '2026-09-15 00:00:00',
    state: 'sale',
    invoice_status: 'to invoice',
    amount_untaxed: 39600,
    currency_id: [1, 'EUR'],
  }
  const LINE = {
    order_id: [42, 'S00042'],
    name: 'Data engineer — migration',
    product_uom_qty: 55,
    price_unit: 720,
    price_subtotal: 39600,
  }

  it('lit `sale.order` confirmées puis leurs lignes — `search_read` seulement, jamais `write`/`create`', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([ORDER])).mockResolvedValueOnce(rpcOk([LINE]))
    const orders = await new OdooClient(CREDS).listConfirmedSaleOrders(12, 100)

    const first = callBody(0).params.args
    expect(first.slice(3, 5)).toEqual(['sale.order', 'search_read'])
    expect(first[5]).toEqual([[['state', 'in', ['sale', 'done']]]])
    const second = callBody(1).params.args
    expect(second.slice(3, 5)).toEqual(['sale.order.line', 'search_read'])
    expect(second[5]).toEqual([
      [
        ['order_id', 'in', [42]],
        ['display_type', '=', false],
      ],
    ])
    for (const index of [0, 1]) {
      expect(['search_read']).toContain(callBody(index).params.args[4])
    }

    expect(orders).toEqual([
      {
        id: 42,
        reference: 'S00042',
        partnerName: 'SNCF',
        clientRef: null,
        orderDate: '2026-09-01',
        commitmentDate: '2026-09-15',
        state: 'sale',
        invoiceStatus: 'to invoice',
        amountUntaxed: 39600,
        currency: 'EUR',
        lines: [{ label: 'Data engineer — migration', quantity: 55, unitPrice: 720, subtotal: 39600 }],
      },
    ])
  })

  it('lit le `false` d’Odoo comme une ABSENCE, jamais comme une valeur', async () => {
    fetchMock
      .mockResolvedValueOnce(
        rpcOk([{ ...ORDER, partner_id: false, commitment_date: false, amount_untaxed: false, currency_id: false }]),
      )
      .mockResolvedValueOnce(rpcOk([]))
    const [order] = await new OdooClient(CREDS).listConfirmedSaleOrders(12, 100)
    expect(order).toMatchObject({
      partnerName: null,
      commitmentDate: null,
      amountUntaxed: null,
      currency: null,
      lines: [],
    })
  })

  it('ne lit AUCUNE ligne quand il n’y a aucune vente — un seul appel', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([]))
    await expect(new OdooClient(CREDS).listConfirmedSaleOrders(12, 100)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('OdooClient — réponse HTML (adresse d’instance erronée)', () => {
  it('rend un message clair, jamais « Unexpected token < »', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => JSON.parse('<!DOCTYPE html><html></html>'),
    } as unknown as Response)
    const error = await new OdooClient(CREDS).findPartnerByEmail(7, 'x@y.fr').catch((e: Error) => e)
    expect((error as Error).message).toMatch(/adresse de l’instance/)
    expect((error as Error).message).not.toMatch(/Unexpected token/)
  })
})

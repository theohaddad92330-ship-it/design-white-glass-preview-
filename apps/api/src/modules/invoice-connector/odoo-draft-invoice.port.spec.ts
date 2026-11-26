import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { InvoiceConnectorPayload } from './invoice-connector.port'
import { OdooDraftInvoiceConnectorPort } from './odoo-draft-invoice.port'

/**
 * #2565.10 — l'adaptateur Odoo : un BROUILLON de facture client, jamais plus.
 *
 * ⚠️ AUCUN appel réseau réel ici : `fetch` est simulé, la garde SSRF (qui
 * résout un DNS) et le déchiffrement de la clé sont remplacés. Ces tests
 * prouvent ce que Bellum ENVOIE, octet pour octet, et comment il LIT chaque
 * issue ; ils ne prouvent pas qu'une instance réelle l'accepte — c'est la
 * recette sur l'instance de Louis (UN brouillon, autorisé le 18/09) qui le
 * fera. Ce qui n'est pas prouvé est marqué NON VÉRIFIÉ dans `odoo.client.ts`.
 */

jest.mock('../integrations/ssrf-guard', () => ({ assertSafeOutboundUrl: jest.fn(async () => undefined) }))
jest.mock('../crm/crm-token.crypto', () => ({ decryptToken: jest.fn(() => 'k'.repeat(40)) }))

const WS = 'ws-1'

function connection(over: Partial<CrmConnectionEntity> = {}): CrmConnectionEntity {
  return {
    id: 'conn-1',
    user_id: 'u-1',
    workspace_id: WS,
    provider: 'odoo',
    external_account_id: '2',
    instance_url: 'https://louis.odoo.com',
    account_label: 'louis-prod',
    access_token_enc: 'chiffré',
    refresh_token_enc: null,
    expires_at: null,
    refresh_failed_at: null,
    scope: null,
    last_used_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  } as CrmConnectionEntity
}

function facts(over: Partial<InvoiceConnectorPayload> = {}): InvoiceConnectorPayload {
  return {
    missionId: 'mission-1',
    periodMonth: '2026-08-01',
    preparedAmountCents: 18 * 65_000,
    missionLabel: 'Renfort plateforme',
    accountName: 'ACME',
    days: 18,
    dailyRateCents: 65_000,
    ...over,
  }
}

/** Odoo répond TOUJOURS 200 en JSON-RPC, succès comme erreur métier. */
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
function httpStatus(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}
function timeoutError(): Error {
  // Ce que `AbortSignal.timeout` fait lever à `fetch` : un `TimeoutError`.
  return Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
}

let fetchMock: jest.Mock
const realFetch = global.fetch

beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = realFetch
})

type RpcBody = { params: { service: string; method: string; args: unknown[] } }
function body(index: number): RpcBody {
  return JSON.parse(fetchMock.mock.calls[index][1].body) as RpcBody
}
/** `[modèle, méthode]` de chaque appel `execute_kw` parti. */
function modelCalls(): Array<[unknown, unknown]> {
  return fetchMock.mock.calls.map((_, index) => {
    const args = body(index).params.args
    return [args[3], args[4]]
  })
}

function makePort(row: CrmConnectionEntity | null = connection()) {
  const connections = {
    findOne: jest.fn(async () => row),
  } as unknown as Repository<CrmConnectionEntity>
  return { port: new OdooDraftInvoiceConnectorPort(connections), connections }
}

describe('OdooDraftInvoiceConnectorPort — ce qui part, octet pour octet', () => {
  it('retrouve le client PUIS dépose un `account.move` `out_invoice` en BROUILLON — le corps exact', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockResolvedValueOnce(rpcOk(42))
    const { port, connections } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome).toEqual({ ok: true, reference: '42' })
    // Le lien est celui de l'ESPACE, jamais un autre.
    expect(connections.findOne).toHaveBeenCalledWith({ where: { workspace_id: WS, provider: 'odoo' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://louis.odoo.com/jsonrpc')

    expect(body(0).params).toEqual({
      service: 'object',
      method: 'execute_kw',
      args: [
        'louis-prod',
        2,
        'k'.repeat(40),
        'res.partner',
        'search',
        [
          [
            ['name', '=', 'ACME'],
            ['is_company', '=', true],
          ],
        ],
        { limit: 2 },
      ],
    })
    expect(body(1).params).toEqual({
      service: 'object',
      method: 'execute_kw',
      args: [
        'louis-prod',
        2,
        'k'.repeat(40),
        'account.move',
        'create',
        [
          {
            move_type: 'out_invoice',
            state: 'draft',
            partner_id: 7,
            invoice_line_ids: [[0, 0, { name: 'Renfort plateforme — 2026-08', quantity: 18, price_unit: 650 }]],
          },
        ],
        {},
      ],
    })
  })

  it('JAMAIS de validation : seuls `search` puis `create` partent — ni `action_post`, ni envoi, ni écriture', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockResolvedValueOnce(rpcOk(42))
    const { port } = makePort()

    await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    // Une LISTE BLANCHE, pas une liste noire : un appel de plus, quel qu'il
    // soit (`action_post`, `write`, `message_post`, `action_invoice_sent`…),
    // fait rougir ce test.
    expect(modelCalls()).toEqual([
      ['res.partner', 'search'],
      ['account.move', 'create'],
    ])
    const sent = fetchMock.mock.calls.map(call => String(call[1].body)).join('\n')
    expect(sent).not.toMatch(/action_post|_post\b|posted/)
    expect((body(1).params.args[5] as Array<Record<string, unknown>>)[0]?.state).toBe('draft')
  })

  it('le montant HT de la ligne est EXACTEMENT celui prévisualisé (jours × TJM)', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockResolvedValueOnce(rpcOk(42))
    const { port } = makePort()

    await port.createInvoice({
      provider: 'odoo',
      workspaceId: WS,
      payload: facts({ days: 12.5, dailyRateCents: 71_050, preparedAmountCents: Math.round(12.5 * 71_050) }),
    })

    const values = (
      body(1).params.args[5] as Array<{ invoice_line_ids: Array<[number, number, Record<string, number>]> }>
    )[0]
    const line = values?.invoice_line_ids[0]?.[2]
    expect(line?.quantity).toBe(12.5)
    expect(line?.price_unit).toBe(710.5)
    expect(Math.round((line?.quantity ?? 0) * (line?.price_unit ?? 0) * 100)).toBe(Math.round(12.5 * 71_050))
  })
})

describe('OdooDraftInvoiceConnectorPort — le client se RETROUVE, il ne se crée jamais', () => {
  it('client introuvable → erreur NOMMÉE, et aucun brouillon ni partenaire créé', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([]))
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome).toEqual({ ok: false, outcome: 'failed', detail: expect.stringContaining('« ACME »') })
    expect(outcome.ok === false && outcome.detail).toMatch(/Aucune fiche client/)
    expect(modelCalls()).toEqual([['res.partner', 'search']])
  })

  it('plusieurs clients du même nom → erreur NOMMÉE, on ne choisit pas à sa place', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7, 9]))
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.outcome).toBe('failed')
    expect(outcome.ok === false && outcome.detail).toMatch(/Plusieurs fiches client « ACME »/)
    expect(modelCalls()).toEqual([['res.partner', 'search']])
  })

  it('un compte sans nom ne se cherche pas — rien ne part', async () => {
    const { port } = makePort()

    const outcome = await port.createInvoice({
      provider: 'odoo',
      workspaceId: WS,
      payload: facts({ accountName: null }),
    })

    expect(outcome).toEqual({ ok: false, outcome: 'failed', detail: expect.stringMatching(/compte client/) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('des jours ou un TJM absents ne deviennent jamais 0 — rien ne part', async () => {
    const { port } = makePort()

    const outcome = await port.createInvoice({
      provider: 'odoo',
      workspaceId: WS,
      payload: facts({ dailyRateCents: null }),
    })

    expect(outcome).toEqual({ ok: false, outcome: 'failed', detail: expect.stringMatching(/TJM/) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('OdooDraftInvoiceConnectorPort — chaque issue est lue, aucune n’est inventée', () => {
  it('une erreur JSON-RPC au dépôt (HTTP 200 !) → `failed`, avec le message d’Odoo', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockResolvedValueOnce(rpcError('Le journal des ventes est introuvable'))
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome).toEqual({
      ok: false,
      outcome: 'failed',
      detail: expect.stringContaining('Le journal des ventes est introuvable'),
    })
  })

  it('un TIMEOUT au dépôt → `unknown` (le brouillon a pu être créé), jamais `failed`', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockRejectedValueOnce(timeoutError())
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.outcome).toBe('unknown')
    expect(outcome.ok === false && outcome.detail).toMatch(/Vérifie dans Odoo/)
  })

  it('une passerelle en 504 au dépôt → `unknown` : Odoo derrière a pu l’appliquer', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockResolvedValueOnce(httpStatus(504))
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome.ok === false && outcome.outcome).toBe('unknown')
  })

  it('une réponse sans identifiant au dépôt → `unknown`, jamais une référence inventée', async () => {
    fetchMock.mockResolvedValueOnce(rpcOk([7])).mockResolvedValueOnce(rpcOk(false))
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome.ok === false && outcome.outcome).toBe('unknown')
  })

  it('LE CAS VOISIN : un timeout pendant la RECHERCHE du client → `failed` (rien ne peut avoir été créé)', async () => {
    fetchMock.mockRejectedValueOnce(timeoutError())
    const { port } = makePort()

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome.ok === false && outcome.outcome).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('OdooDraftInvoiceConnectorPort — sans lien, rien ne part (le cas de la démonstration)', () => {
  it('aucune instance branchée sur l’espace → `failed`, ZÉRO appel réseau', async () => {
    // En démonstration `crm_connections` est vide à dessein (`demo-coverage.ts`) :
    // ce test est la preuve EXÉCUTÉE que la démo n'écrit dans aucun outil.
    const { port } = makePort(null)

    const outcome = await port.createInvoice({ provider: 'odoo', workspaceId: WS, payload: facts() })

    expect(outcome).toEqual({ ok: false, outcome: 'failed', detail: expect.stringMatching(/Aucune instance Odoo/) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un autre outil que Odoo garde le refus honnête de l’adaptateur retenu — zéro appel réseau', async () => {
    const { port, connections } = makePort()

    const outcome = await port.createInvoice({ provider: 'qonto', workspaceId: WS, payload: facts() })

    expect(outcome).toEqual({
      ok: false,
      outcome: 'failed',
      detail: expect.stringMatching(/Aucun connecteur d'écriture vérifié/),
    })
    expect(connections.findOne).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpEnv } from './config/env.js'
import { registerTools } from './tools.js'

type ToolCb = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>

function fakeServer() {
  const tools: Record<string, ToolCb> = {}
  const server = {
    registerTool: (name: string, _config: unknown, cb: ToolCb) => {
      tools[name] = cb
    },
  } as unknown as McpServer
  return { server, tools }
}

const env = {
  API_INTERNAL_URL: 'http://api.test',
  API_PUBLIC_URL: 'http://api.test',
  MCP_PUBLIC_URL: 'http://mcp.test',
  INTERNAL_API_SECRET: 'secret',
  PORT: 0,
  NODE_ENV: 'test',
} as McpEnv

const extra = { authInfo: { token: 'tok' } }
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('registerTools', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('search_accounts forwards the query to /mcp/accounts', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['search_accounts']({ query: 'Thales', limit: 5 }, extra)
    expect(res.isError).toBeFalsy()
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/accounts?q=Thales&limit=5')
  })

  it('search_accounts with no query lists all (no q param)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [], total: 0 }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['search_accounts']({}, extra)
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/accounts')
  })

  it('forwards the bearer token and POSTs the analysis body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ jobId: 'j', accountId: 'a' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['start_analysis']({ company_name: 'Acme', user_context: 'ctx' }, extra)
    const opts = fetchMock.mock.calls[0][1] as { method: string; body: string; headers: Record<string, string> }
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ company_name: 'Acme', user_context: 'ctx' })
    expect(opts.headers.authorization).toBe('Bearer tok')
  })

  it('start_analysis SANS confirm omits the field — the API answers a quote, nothing launches', async () => {
    const quote = { requires_confirmation: true, cost: { credits: 1, kind: 'analysis' } }
    const fetchMock = vi.fn(async () => jsonResponse(quote))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['start_analysis']({ company_name: 'Acme' }, extra)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ company_name: 'Acme' })
    expect(JSON.parse(res.content[0].text)).toEqual(quote)
  })

  it('start_analysis AVEC confirm forwards confirm: true to the API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ jobId: 'j', accountId: 'a' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['start_analysis']({ company_name: 'Acme', confirm: true }, extra)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      company_name: 'Acme',
      confirm: true,
    })
  })

  it('ask_bellum POSTs the question to the account ask route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ account_id: 'a1', reply: 'Angle X.' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['ask_bellum']({ account_id: 'a 1', question: 'Quel angle ?' }, extra)
    expect(res.isError).toBeFalsy()
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/accounts/a%201/ask')
    const opts = fetchMock.mock.calls[0][1] as { method: string; body: string; headers: Record<string, string> }
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ question: 'Quel angle ?' })
    expect(opts.headers.authorization).toBe('Bearer tok')
  })

  it('create_action POSTs title/contact/due_date to the account actions route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'i1' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['create_action'](
      { account_id: 'a1', title: 'Rappeler le DSI', contact_id: 'c1', due_date: '2026-08-01' },
      extra,
    )
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/accounts/a1/actions')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      title: 'Rappeler le DSI',
      contact_id: 'c1',
      due_date: '2026-08-01',
    })
  })

  it('create_action without optional fields sends only the title', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'i1' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['create_action']({ account_id: 'a1', title: 'X' }, extra)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ title: 'X' })
  })

  it('enrich_contact SANS confirm hits the enrich route with an empty body (quote)', async () => {
    const quote = { requires_confirmation: true, cost: { credits: 1, kind: 'enrichment' } }
    const fetchMock = vi.fn(async () => jsonResponse(quote))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['enrich_contact']({ contact_id: 'c1' }, extra)
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/contacts/c1/enrich')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({})
    expect(JSON.parse(res.content[0].text)).toEqual(quote)
  })

  it('enrich_contact AVEC confirm forwards confirm: true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'c1', email: 'jean@corp.fr' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['enrich_contact']({ contact_id: 'c1', confirm: true }, extra)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ confirm: true })
  })

  it('maps a 402 (solde 0) to a clean credits tool error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: "Quota d'analyses épuisé (5/5)." }, 402)),
    )
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['start_analysis']({ company_name: 'X' }, extra)
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Crédits insuffisants')
    expect(res.content[0].text).toContain('épuisé')
  })

  it('maps a 429 to a quota tool error (does not throw)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'quota' }, 429)),
    )
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['start_analysis']({ company_name: 'X' }, extra)
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Quota')
  })

  it('returns an error when the request is unauthenticated', async () => {
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['get_credits']({}, { authInfo: {} })
    expect(res.isError).toBe(true)
  })

  it('send_email POSTs to the contact send-email action route with the bearer token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ contact_id: 'c1', sent_to: 'a@b.fr' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['send_email']({ contact_id: 'c 1/x' }, extra)
    expect(res.isError).toBeFalsy()
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/contacts/c%201%2Fx/send-email')
    const opts = fetchMock.mock.calls[0][1] as { method: string; headers: Record<string, string> }
    expect(opts.method).toBe('POST')
    expect(opts.headers.authorization).toBe('Bearer tok')
  })

  it('log_to_crm POSTs to the contact log-crm action route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'hs-42' }))
    vi.stubGlobal('fetch', fetchMock)
    const { server, tools } = fakeServer()
    registerTools(server, env)
    await tools['log_to_crm']({ contact_id: 'c1' }, extra)
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/mcp/contacts/c1/log-crm')
    expect((fetchMock.mock.calls[0][1] as { method: string }).method).toBe('POST')
  })

  it('trims the huge raw_analysis.branches list in get_account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'a', raw_analysis: { branches: [1, 2, 3], plan: {} } })),
    )
    const { server, tools } = fakeServer()
    registerTools(server, env)
    const res = await tools['get_account']({ account_id: 'a' }, extra)
    const parsed = JSON.parse(res.content[0].text) as { raw_analysis: { branches: unknown } }
    expect(parsed.raw_analysis.branches).toEqual({ count: 3 })
  })

  describe('signaux → opportunités', () => {
    const run = async (name: string, args: Record<string, unknown>, body: unknown = { items: [] }) => {
      const fetchMock = vi.fn(async (_url: string, _init?: unknown) => jsonResponse(body))
      vi.stubGlobal('fetch', fetchMock)
      const { server, tools } = fakeServer()
      registerTools(server, env)
      const res = await tools[name]?.(args, extra)
      return { fetchMock, res }
    }

    it('find_opportunities GET /mcp/signals avec filtres, sans paramètre vide', async () => {
      const { fetchMock } = await run('find_opportunities', {
        query: 'Acme',
        skills: 'data, Python',
        in_portfolio: false,
        limit: 10,
      })
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'http://api.test/mcp/signals?q=Acme&skills=data%2C+Python&in_portfolio=false&limit=10',
      )
      const { fetchMock: bare } = await run('find_opportunities', {})
      expect(String(bare.mock.calls[0]?.[0])).toBe('http://api.test/mcp/signals')
    })

    it('get_market_signals encode le nom dans le chemin', async () => {
      const { fetchMock } = await run('get_market_signals', { company: 'Société Générale/Paris' }, { covered: false })
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'http://api.test/mcp/market/Soci%C3%A9t%C3%A9%20G%C3%A9n%C3%A9rale%2FParis',
      )
    })

    it('list_due_actions GET /mcp/actions/due', async () => {
      const { fetchMock } = await run('list_due_actions', { limit: 20 })
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api.test/mcp/actions/due?limit=20')
    })

    it('update_plan_item POST /mcp/plan-items/:id avec seulement les champs fournis', async () => {
      const { fetchMock } = await run('update_plan_item', { plan_item_id: 'abc', done: true, outcome: 'positive' }, {})
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api.test/mcp/plan-items/abc')
      const opts = fetchMock.mock.calls[0]?.[1] as { method: string; body: string }
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ done: true, outcome: 'positive' })
      const { fetchMock: due } = await run('update_plan_item', { plan_item_id: 'abc', due_date: null }, {})
      expect(JSON.parse((due.mock.calls[0]?.[1] as { body: string }).body)).toEqual({ due_date: null })
    })

    it('les descriptions sont en français et nomment la capacité, pas un éditeur', () => {
      const configs: Record<string, { description: string }> = {}
      const server = {
        registerTool: (name: string, config: { description: string }) => {
          configs[name] = config
        },
      } as unknown as McpServer
      registerTools(server, env)
      for (const name of ['find_opportunities', 'get_market_signals', 'list_due_actions', 'update_plan_item']) {
        expect(configs[name]?.description).toMatch(/[éèà]|signaux|plan/i)
        expect(configs[name]?.description.length).toBeGreaterThan(60)
      }
      expect(configs['update_plan_item']?.description).toContain('mcp:act')
    })
  })
})

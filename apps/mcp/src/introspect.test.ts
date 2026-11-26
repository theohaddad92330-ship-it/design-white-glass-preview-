import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpEnv } from './config/env.js'
import { createTokenVerifier } from './introspect.js'

const env = {
  API_INTERNAL_URL: 'http://api.test',
  API_PUBLIC_URL: 'http://api.test',
  MCP_PUBLIC_URL: 'http://mcp.test',
  INTERNAL_API_SECRET: 'shhh',
  PORT: 0,
  NODE_ENV: 'test',
} as McpEnv

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const activeBody = {
  active: true,
  sub: 'u',
  scope: 'mcp:read mcp:analysis',
  client_id: 'c',
  exp: Math.floor(Date.now() / 1000) + 900,
}

describe('createTokenVerifier', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns AuthInfo for an active token and caches it', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(activeBody))
    vi.stubGlobal('fetch', fetchMock)
    const verifier = createTokenVerifier(env)
    const info = await verifier.verifyAccessToken('tok')
    expect(info.token).toBe('tok')
    expect(info.clientId).toBe('c')
    expect(info.scopes).toEqual(['mcp:read', 'mcp:analysis'])
    await verifier.verifyAccessToken('tok') // served from cache
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends the internal secret header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(activeBody))
    vi.stubGlobal('fetch', fetchMock)
    await createTokenVerifier(env).verifyAccessToken('tok')
    const opts = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(opts.headers['x-internal-secret']).toBe('shhh')
  })

  it('throws for an inactive (revoked/expired) token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ active: false })),
    )
    await expect(createTokenVerifier(env).verifyAccessToken('bad')).rejects.toThrow()
  })

  it('throws when introspection itself errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )
    await expect(createTokenVerifier(env).verifyAccessToken('tok')).rejects.toThrow()
  })
})

import {
  BeeperAuthError,
  BeeperClient,
  BeeperUnreachableError,
  normalizeBeeperBaseUrl,
  rebaseOnOrigin,
} from './beeper.client'

// Une IP publique littérale : la garde SSRF ne fait pas de DNS, le test reste hors réseau.
const BASE = 'https://93.184.216.34'

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return next
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('BeeperClient (#4406)', () => {
  it('refuse localhost et les IP privées AVANT tout appel réseau (garde SSRF)', async () => {
    for (const base of [
      'http://localhost:23373',
      'https://127.0.0.1:23373',
      'https://10.0.0.4',
      'https://169.254.169.254',
    ]) {
      const { impl, calls } = fakeFetch([])
      await expect(new BeeperClient(base, true, impl).discover()).rejects.toThrow(/interne/)
      expect(calls).toHaveLength(0)
    }
  })

  it('http refusé sans tunnel déclaré, accepté avec', async () => {
    const { impl } = fakeFetch([])
    await expect(new BeeperClient('http://93.184.216.34', false, impl).discover()).rejects.toThrow(/https/)
    const ok = fakeFetch([json({ authorization_endpoint: '/oauth/authorize', token_endpoint: '/oauth/token' })])
    await expect(new BeeperClient('http://93.184.216.34', true, ok.impl).discover()).resolves.toMatchObject({
      tokenEndpoint: 'http://93.184.216.34/oauth/token',
    })
  })

  it('rebase les points annoncés (localhost derrière le tunnel, hôte hostile) sur l’origine saisie', async () => {
    const { impl, calls } = fakeFetch([
      json({
        authorization_endpoint: 'http://localhost:23373/oauth/authorize',
        token_endpoint: 'http://169.254.169.254/oauth/token',
        registration_endpoint: 'http://localhost:23373/oauth/register',
      }),
    ])
    const discovery = await new BeeperClient(BASE, false, impl).discover()
    expect(calls[0]!.url).toBe(`${BASE}/.well-known/oauth-authorization-server`)
    expect(discovery).toEqual({
      authorizationEndpoint: `${BASE}/oauth/authorize`,
      tokenEndpoint: `${BASE}/oauth/token`,
      registrationEndpoint: `${BASE}/oauth/register`,
      revocationEndpoint: null,
    })
  })

  it('ne suit jamais une redirection', async () => {
    const { impl, calls } = fakeFetch([
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    ])
    await expect(new BeeperClient(BASE, false, impl).listChats('tok')).rejects.toBeInstanceOf(BeeperUnreachableError)
    expect(calls[0]!.init.redirect).toBe('manual')
  })

  it('Desktop fermé / tunnel coupé → BeeperUnreachableError nommé, jamais une liste vide', async () => {
    const down = fakeFetch([new TypeError('fetch failed')])
    await expect(new BeeperClient(BASE, false, down.impl).listChats('tok')).rejects.toBeInstanceOf(
      BeeperUnreachableError,
    )
    const gateway = fakeFetch([new Response('bad gateway', { status: 502 })])
    await expect(new BeeperClient(BASE, false, gateway.impl).listChats('tok')).rejects.toBeInstanceOf(
      BeeperUnreachableError,
    )
  })

  it('pose un délai court sur chaque appel', async () => {
    const { impl, calls } = fakeFetch([json({ items: [] })])
    await new BeeperClient(BASE, false, impl).listChats('tok')
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
  })

  it('jeton refusé → BeeperAuthError', async () => {
    const { impl } = fakeFetch([new Response('', { status: 401 })])
    await expect(new BeeperClient(BASE, false, impl).listMessages('tok', 'c1')).rejects.toBeInstanceOf(BeeperAuthError)
  })

  it('lit chats et messages, et envoie (text + replyToMessageID) en Bearer', async () => {
    const { impl, calls } = fakeFetch([
      json({ items: [{ id: 'c1', network: 'WhatsApp' }], hasMore: false }),
      json({ items: [{ id: 'm1', text: 'Bonjour' }] }),
      json({ chatID: 'c1', pendingMessageID: 'p1' }),
    ])
    const client = new BeeperClient(BASE, false, impl)
    expect(await client.listChats('tok', 10)).toEqual([{ id: 'c1', network: 'WhatsApp' }])
    expect(await client.listMessages('tok', 'c/1')).toEqual([{ id: 'm1', text: 'Bonjour' }])
    expect(await client.sendMessage('tok', 'c1', { text: 'Merci', replyToMessageId: 'm1' })).toEqual({
      pendingMessageId: 'p1',
    })
    expect(calls[0]!.url).toBe(`${BASE}/v1/chats?limit=10`)
    expect(calls[1]!.url).toBe(`${BASE}/v1/chats/c%2F1/messages`)
    expect(calls[2]!.init.method).toBe('POST')
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ text: 'Merci', replyToMessageID: 'm1' })
    expect((calls[2]!.init.headers as Record<string, string>)['authorization']).toBe('Bearer tok')
  })

  it('normalise l’adresse saisie à son origine et refuse les identifiants dans l’URL', () => {
    expect(normalizeBeeperBaseUrl(' https://beeper.example.com/v1/chats?x=1 ')).toBe('https://beeper.example.com')
    expect(() => normalizeBeeperBaseUrl('https://u:p@beeper.example.com')).toThrow()
    expect(() => normalizeBeeperBaseUrl('ftp://beeper.example.com')).toThrow()
    expect(rebaseOnOrigin(42, BASE)).toBeNull()
  })
})

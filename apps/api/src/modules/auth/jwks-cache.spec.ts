import { generateKeyPairSync } from 'node:crypto'
import { JwksCache } from './jwks-cache'

/** Build a JWKS body containing the public half of a fresh EC P-256 key. */
function makeJwks(kid: string) {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }
  return { keys: [jwk] }
}

describe('JwksCache', () => {
  afterEach(() => jest.restoreAllMocks())

  it('fetches, converts a JWK to a usable public KeyObject', async () => {
    const body = makeJwks('kid-1')
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({ ok: true, json: async () => body } as never)

    const cache = new JwksCache('https://x.supabase.co/auth/v1/.well-known/jwks.json')
    const key = await cache.getPublicKey('kid-1')

    expect(key.type).toBe('public')
    expect(key.asymmetricKeyType).toBe('ec')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('caches by kid — a second lookup does not refetch', async () => {
    const body = makeJwks('kid-1')
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({ ok: true, json: async () => body } as never)

    const cache = new JwksCache('https://x/jwks.json')
    await cache.getPublicKey('kid-1')
    await cache.getPublicKey('kid-1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('throws for an unknown kid after refreshing', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: true, json: async () => makeJwks('kid-1') } as never)

    const cache = new JwksCache('https://x/jwks.json')
    await expect(cache.getPublicKey('nope')).rejects.toThrow(/No JWKS signing key/)
  })

  it('surfaces a fetch failure', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({ ok: false, status: 503 } as never)
    const cache = new JwksCache('https://x/jwks.json')
    await expect(cache.getPublicKey('kid-1')).rejects.toThrow(/HTTP 503/)
  })
})

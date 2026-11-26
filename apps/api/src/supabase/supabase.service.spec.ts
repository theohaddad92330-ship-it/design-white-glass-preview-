import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { SupabaseService } from './supabase.service'

function mockConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string, def?: string) => values[key] ?? def } as unknown as ConfigService
}

describe('SupabaseService — hygiène des logs', () => {
  /*
   * ─────────────────────────────────────────────────────────────────────
   * Finding pentest : le démarrage journalisait un fragment de
   * SUPABASE_SERVICE_ROLE_KEY (12 premiers + 6 derniers caractères) — la
   * clé qui bypasse la RLS, en clair dans les logs Railway à chaque boot.
   * ─────────────────────────────────────────────────────────────────────
   */
  it('ne journalise AUCUN fragment de la clé service-role au démarrage', () => {
    // Volontairement sans mot du dictionnaire (ni "service", ni "role", ni
    // "key", ni "present") pour qu'aucune collision avec le LIBELLÉ du log
    // ne produise un faux rouge — seul un vrai fragment de la clé doit faire
    // échouer ce test.
    const key = 'aB3dE9fG2hJ4kL6mN8pQ1rS5tU7vW0xYzZ9a8b7c6d5e4f3g2h1i0'
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    new SupabaseService(mockConfig({ supabaseUrl: 'https://example.supabase.co', supabaseServiceRoleKey: key }))

    const loggedText = logSpy.mock.calls.map(call => call.map(arg => String(arg)).join(' ')).join('\n')
    logSpy.mockRestore()

    // Preuve générale plutôt qu'un seul cas : aucune sous-chaîne de 6
    // caractères consécutifs de la clé ne doit apparaître nulle part — 6 est
    // la taille du plus petit des deux fragments qui fuitaient (les 6
    // derniers caractères).
    for (let i = 0; i + 6 <= key.length; i += 1) {
      expect(loggedText).not.toContain(key.slice(i, i + 6))
    }
  })

  it('journalise malgré tout que le service a démarré (présence, pas la valeur)', () => {
    const key = 'sbp_another_secret_value_should_not_leak_0987654321'
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    new SupabaseService(mockConfig({ supabaseUrl: 'https://example.supabase.co', supabaseServiceRoleKey: key }))

    const calls = logSpy.mock.calls
    logSpy.mockRestore()
    expect(calls.length).toBeGreaterThan(0)
  })
})

/**
 * Session tenue 24 h (demande de Louis du 15/09/2026) — le client PARTAGÉ ne
 * garde la session de PERSONNE.
 *
 * `createClient(url, key)` sans options = `persistSession: true` (stockage en
 * mémoire sous Node) + `autoRefreshToken: true`, et sous Node le ticker de
 * renouvellement tourne EN PERMANENCE (auth-js, `_handleVisibilityChange`).
 * Chaque `signInWithPassword` / `verifyOtp` / `refreshSession` passé par ce
 * client y rangeait donc la session de l'utilisateur, et le ticker la
 * renouvelait ~90 s avant son expiration : le refresh token de l'utilisateur
 * tournait CÔTÉ SERVEUR, dans le dos de son navigateur. Le refresh suivant du
 * navigateur (au réveil, le matin) présentait l'ancien jeton, hors de la
 * fenêtre de réutilisation de GoTrue → « Already Used », famille de jetons
 * révoquée, retour à la connexion. La victime : le dernier utilisateur authentifié
 * sur l'instance avant une période calme — la nuit.
 *
 * Deuxième effet, du même défaut : `fetchWithAuth` lit la session stockée
 * avant la clé, donc les requêtes PostgREST du client « service-role »
 * partaient avec le JWT de ce dernier utilisateur.
 */
describe('SupabaseService — le client partagé ne stocke ni ne renouvelle aucune session', () => {
  const SERVICE_KEY = 'service-key-for-tests-only'
  const originalFetch = global.fetch

  function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url')
  }

  function userSessionBody(refreshToken: string) {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
      sub: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      exp,
    })}.signature`
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'a@esn.fr' },
    }
  }

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('après un refresh d’utilisateur, le client ne garde AUCUNE session et PostgREST reste sous la clé service', async () => {
    const authorizations: Array<string | null> = []
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/auth/v1/token')) {
        return new Response(JSON.stringify(userSessionBody('rt-user-a-new')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      authorizations.push(new Headers(init?.headers).get('Authorization'))
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const service = new SupabaseService(
      mockConfig({ supabaseUrl: 'https://example.supabase.co', supabaseServiceRoleKey: SERVICE_KEY }),
    )
    logSpy.mockRestore()
    const client = service.getClient()

    const { data, error } = await client.auth.refreshSession({ refresh_token: 'rt-user-a' })
    expect(error).toBeNull()
    expect(data.session?.refresh_token).toBe('rt-user-a-new')

    // Ce que le ticker relirait pour renouveler : rien.
    const stored = await client.auth.getSession()
    expect(stored.data.session).toBeNull()

    await client.from('accounts').select('id')
    expect(authorizations).toEqual([`Bearer ${SERVICE_KEY}`])
  })
})

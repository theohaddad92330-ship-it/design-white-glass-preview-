import type { ConfigService } from '@nestjs/config'
import type { Reflector } from '@nestjs/core'
import { of } from 'rxjs'
import { KEEP_OTHER_SESSIONS_KEY } from '../decorator/keep-other-sessions.decorator'
import { AttachRefreshCookieInterceptor, ClearRefreshCookieInterceptor } from './refresh-cookie.interceptor'

// #4608 — la démonstration ne coûte jamais sa session à un utilisateur connecté.
// Les deux portes qui détruisaient la session réelle : la connexion de la salle
// démo (purge « un navigateur = UNE identité ») et sa sortie (logout efface tout).

const REAL_USER = '11111111-1111-4111-8111-111111111111'
const DEMO_USER = '22222222-2222-4222-8222-222222222222'

const config = {
  get: (key: string, def?: string) =>
    ({
      nodeEnv: 'production',
      sessionCookiePrefix: 'session',
      refreshCookiePrefix: 'uploadsSig',
      loggedInCookiePrefix: 'loggedIn',
      lastUsedLoginCookieName: 'lastUsedLogin',
    })[key] ?? def,
} as unknown as ConfigService

const realCookies = {
  [`session:${REAL_USER}`]: 'real.access',
  [`uploadsSig:${REAL_USER}`]: 'real.refresh',
  [`loggedIn:${REAL_USER}`]: '1',
}
const demoCookies = {
  [`session:${DEMO_USER}`]: 'demo.access',
  [`uploadsSig:${DEMO_USER}`]: 'demo.refresh',
  [`loggedIn:${DEMO_USER}`]: '1',
}

function run(
  interceptor: { intercept: (ctx: never, next: never) => { subscribe: () => void } },
  cookies: Record<string, string>,
  headers: Record<string, string>,
  body: unknown,
): string[] {
  const out: string[] = []
  const res = { append: (h: string, v: string) => h === 'Set-Cookie' && out.push(v) }
  const ctx = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ cookies, headers: { host: 'app.bellum-ai.com', ...headers } }),
    }),
    getHandler: () => () => undefined,
  }
  interceptor.intercept(ctx as never, { handle: () => of(body) } as never).subscribe()
  return out
}

const loginBody = (id: string) => ({
  access_token: 'a.jwt',
  refresh_token: 'r.jwt',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id },
})

const cleared = (cookies: string[], name: string) =>
  cookies.some(c => c.startsWith(`${name}=;`) && c.includes('Max-Age=0'))

describe('#4608 — ouvrir la démonstration ne purge pas la session réelle', () => {
  const keepOthers = {
    get: (key: string) => (key === KEEP_OTHER_SESSIONS_KEY ? true : undefined),
  } as unknown as Reflector
  const plain = { get: () => undefined } as unknown as Reflector

  it('une salle démo (KeepOtherSessions) laisse intacts les cookies du compte réel', () => {
    const out = run(
      new AttachRefreshCookieInterceptor(keepOthers, config) as never,
      realCookies,
      {},
      loginBody(DEMO_USER),
    )
    expect(out.some(c => c.startsWith(`session:${DEMO_USER}=`))).toBe(true)
    for (const name of Object.keys(realCookies)) expect(cleared(out, name)).toBe(false)
  })

  it('REFUS : une connexion ordinaire purge toujours les autres identités (un navigateur = une identité)', () => {
    const out = run(new AttachRefreshCookieInterceptor(plain, config) as never, realCookies, {}, loginBody(DEMO_USER))
    for (const name of Object.keys(realCookies)) expect(cleared(out, name)).toBe(true)
  })
})

describe('#4608 — quitter la démonstration ne déconnecte que la démonstration', () => {
  const both = { ...realCookies, ...demoCookies }

  it("avec la portée « onglet » et l'identité de l'onglet, seuls les cookies de CETTE identité tombent", () => {
    const out = run(
      new ClearRefreshCookieInterceptor(config) as never,
      both,
      { 'x-bellum-logout-scope': 'tab', 'x-bellum-user': DEMO_USER },
      undefined,
    )
    for (const name of Object.keys(demoCookies)) expect(cleared(out, name)).toBe(true)
    for (const name of Object.keys(realCookies)) expect(cleared(out, name)).toBe(false)
  })

  it("REFUS : sans portée « onglet », la déconnexion efface toujours toutes les sessions de l'appareil", () => {
    const out = run(new ClearRefreshCookieInterceptor(config) as never, both, { 'x-bellum-user': DEMO_USER }, undefined)
    for (const name of Object.keys(both)) expect(cleared(out, name)).toBe(true)
  })

  it('REFUS : la portée « onglet » sans identité déclarée ne devine rien — tout est effacé', () => {
    const out = run(
      new ClearRefreshCookieInterceptor(config) as never,
      both,
      { 'x-bellum-logout-scope': 'tab' },
      undefined,
    )
    for (const name of Object.keys(both)) expect(cleared(out, name)).toBe(true)
  })
})

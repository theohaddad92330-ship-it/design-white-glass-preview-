import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConfigService } from '@nestjs/config'
import type { Reflector } from '@nestjs/core'
import { of } from 'rxjs'
import { AttachRefreshCookieInterceptor } from './refresh-cookie.interceptor'

/** Minimal ConfigService double: returns prod + the given cookie domain. */
function mockConfig(cookieDomain: string): ConfigService {
  const values: Record<string, string> = {
    nodeEnv: 'production',
    cookieDomain,
    sessionCookiePrefix: 'session',
    refreshCookiePrefix: 'uploadsSig',
    loggedInCookiePrefix: 'loggedIn',
    lastUsedLoginCookieName: 'lastUsedLogin',
  }
  return { get: (key: string, def?: string) => values[key] ?? def } as unknown as ConfigService
}

const reflector = { get: () => undefined } as unknown as Reflector

/** Runs the interceptor over a login-shaped body and returns the Set-Cookie lines.
 *  `incoming` = the cookies the browser sent with the request (i.e. sessions
 *  already open on this device). */
function runInterceptor(
  cookieDomain: string,
  incoming: Record<string, string> = {},
  /* L'hôte demandé. Il compte depuis la marque blanche (01/09/2026) : un
   * navigateur REJETTE un `Domain` qui n'est pas un suffixe de l'hôte, donc le
   * `Domain` configuré ne s'écrit que s'il couvre vraiment la requête. Par
   * défaut, un hôte de chez nous — le cas historique. */
  host: string | undefined = 'app.bellum-ai.com',
): string[] {
  const setCookies: string[] = []
  const res = {
    append: (header: string, value: string) => {
      if (header === 'Set-Cookie') setCookies.push(value)
    },
  }
  const ctx = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ cookies: incoming, headers: { host } }) }),
    getHandler: () => () => undefined,
  }
  const body = {
    access_token: 'access.jwt',
    refresh_token: 'refresh.jwt',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-123' },
  }
  const interceptor = new AttachRefreshCookieInterceptor(reflector, mockConfig(cookieDomain))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interceptor.intercept(ctx as any, { handle: () => of(body) }).subscribe()
  return setCookies
}

describe('AttachRefreshCookieInterceptor — cookie Domain', () => {
  it('scopes every auth cookie to COOKIE_DOMAIN when set', () => {
    const cookies = runInterceptor('.bellum-ai.com')
    const session = cookies.find(c => c.startsWith('session:user-123='))
    const refresh = cookies.find(c => c.startsWith('uploadsSig:user-123='))
    const loggedIn = cookies.find(c => c.startsWith('loggedIn:user-123='))

    expect(session).toContain('Domain=.bellum-ai.com')
    expect(refresh).toContain('Domain=.bellum-ai.com')
    expect(loggedIn).toContain('Domain=.bellum-ai.com')
  })

  /*
   * ─────────────────────────────────────────────────────────────────────
   * MARQUE BLANCHE — un domaine client n'entre pas dans notre portée
   * ─────────────────────────────────────────────────────────────────────
   * Le défaut que ces trois cas empêchent de revenir : un `Set-Cookie` dont
   * le `Domain` n'est pas un suffixe de l'hôte demandé est REJETÉ EN SILENCE
   * par le navigateur (RFC 6265 §5.3.5). La réponse restait un 200 avec ses
   * trois en-têtes, tous jetés — et la connexion échouait sans un message,
   * seulement chez le client.
   */
  it('n’écrit AUCUN Domain sur un domaine client — le cookie devient host-only', () => {
    const cookies = runInterceptor('.bellum-ai.com', {}, 'app.acme.com')
    expect(cookies.length).toBeGreaterThan(0)
    for (const c of cookies) expect(c).not.toContain('Domain=')
  })

  it('écrit le Domain sur l’apex lui-même, pas seulement sur un sous-domaine', () => {
    const cookies = runInterceptor('.bellum-ai.com', {}, 'bellum-ai.com')
    expect(cookies.find(c => c.startsWith('session:'))).toContain('Domain=.bellum-ai.com')
  })

  it('ignore le port, que le navigateur envoie dans `Host`', () => {
    const cookies = runInterceptor('.bellum-ai.com', {}, 'app.bellum-ai.com:443')
    expect(cookies.find(c => c.startsWith('session:'))).toContain('Domain=.bellum-ai.com')
  })

  it('ne se laisse pas prendre par un domaine qui SE TERMINE par le nôtre sans en être', () => {
    // `notbellum-ai.com` finit par « bellum-ai.com » sans en être un
    // sous-domaine. Un simple `endsWith` sans le point aurait posé nos cookies
    // sur le domaine d'un tiers.
    const cookies = runInterceptor('.bellum-ai.com', {}, 'notbellum-ai.com')
    for (const c of cookies) expect(c).not.toContain('Domain=')
  })

  it('emits host-only cookies (no Domain) when COOKIE_DOMAIN is empty', () => {
    const cookies = runInterceptor('')
    expect(cookies.length).toBeGreaterThan(0)
    for (const c of cookies) expect(c).not.toContain('Domain=')
  })

  it('trims and ignores a whitespace-only COOKIE_DOMAIN', () => {
    const cookies = runInterceptor('   ')
    for (const c of cookies) expect(c).not.toContain('Domain=')
  })
})

/**
 * Un navigateur = UNE identité Bellum.
 *
 * Les cookies d'auth sont nommés par utilisateur (`session:{uid}`), donc deux
 * comptes connectés depuis le même navigateur laissaient DEUX cookies de session
 * côte à côte. Côté API, `JwtStrategy` prend le PREMIER `session:*` du bocal :
 * la requête s'authentifiait avec le plus ancien — se connecter à un second
 * compte ramenait à l'espace de travail du premier.
 */
describe('AttachRefreshCookieInterceptor — une seule identité par navigateur', () => {
  const other = {
    'session:user-old': 'old.access.jwt',
    'uploadsSig:user-old': 'old.refresh.jwt',
    'loggedIn:user-old': '1',
  }

  it("purge les cookies d'un AUTRE utilisateur encore ouverts sur l'appareil", () => {
    const cookies = runInterceptor('', other)

    for (const name of ['session:user-old', 'uploadsSig:user-old', 'loggedIn:user-old']) {
      const cleared = cookies.find(c => c.startsWith(`${name}=`))
      expect(cleared).toBeDefined()
      // Valeur vidée + expiration immédiate = le navigateur le jette.
      expect(cleared).toContain(`${name}=;`)
      expect(cleared).toContain('Max-Age=0')
    }
  })

  it("n'efface JAMAIS les cookies de l'utilisateur qui vient de se connecter", () => {
    const cookies = runInterceptor('', other)
    const session = cookies.find(c => c.startsWith('session:user-123='))
    expect(session).toContain('access.jwt')
    expect(session).not.toContain('Max-Age=0')
  })

  it('purge avec le même Domain que la pose, sinon le cookie survit', () => {
    const cookies = runInterceptor('.bellum-ai.com', other)
    const cleared = cookies.find(c => c.startsWith('session:user-old='))
    expect(cleared).toContain('Domain=.bellum-ai.com')
    // Un cookie ne s'expire qu'avec les attributs qui l'ont posé. Le refresh a
    // vécu sur `Path=/auth/refresh` jusqu'au 03/11/2026 : purger le seul `Path=/`
    // laisserait l'ancien en place, et il serait RENVOYÉ EN PREMIER sur
    // `/auth/refresh` (le navigateur trie par Path le plus spécifique).
    const clearedRefresh = cookies.filter(c => c.startsWith('uploadsSig:user-old='))
    expect(clearedRefresh.some(c => c.includes('Path=/;') || c.endsWith('Path=/'))).toBe(true)
    expect(clearedRefresh.some(c => c.includes('Path=/auth/refresh'))).toBe(true)
    for (const c of clearedRefresh) expect(c).toContain('Domain=.bellum-ai.com')
  })

  it('ne touche pas aux cookies non-auth (lastUsedLogin, bellum_did)', () => {
    const cookies = runInterceptor('', { ...other, lastUsedLogin: 'password', bellum_did: 'device-1' })
    expect(cookies.some(c => c.startsWith('lastUsedLogin=;'))).toBe(false)
    expect(cookies.some(c => c.startsWith('bellum_did='))).toBe(false)
  })

  it("ne fait rien quand aucun autre compte n'est ouvert", () => {
    const cookies = runInterceptor('', { 'session:user-123': 'stale.but.same.user' })
    // La SEULE expiration légitime ici est celle du refresh historique
    // (`Path=/auth/refresh`, 03/11/2026) : elle vise le cookie du MÊME
    // utilisateur, remplacé par celui de `Path=/` dans la même réponse.
    const cleared = cookies.filter(c => c.includes('Max-Age=0'))
    expect(cleared).toHaveLength(1)
    expect(cleared[0]).toContain('uploadsSig:user-123=;')
    expect(cleared[0]).toContain('Path=/auth/refresh')
  })
})

/* -------------------------------------------------------------------- */
/*  LE CHEMIN DU COOKIE DE REFRESH                                       */
/* -------------------------------------------------------------------- */

/** Règle de correspondance de chemin du navigateur (RFC 6265 §5.1.4) : un
 *  cookie n'est envoyé que si son `Path` est le chemin demandé, ou son préfixe
 *  de répertoire. C'est elle, et rien d'autre, qui décidait de la panne. */
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true
  if (cookiePath === '/') return true
  return requestPath.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`)
}

function cookiePathOf(line: string): string {
  const match = /(?:^|;\s*)Path=([^;]*)/.exec(line)
  return match?.[1] ?? ''
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * MESURÉ EN PRODUCTION LE 03/11/2026 — « ça me déconnecte à chaque reload »
 * ─────────────────────────────────────────────────────────────────────────
 * Le cookie de refresh vivait sur `Path=/auth/refresh`. Le REPLI D'ORIGINE
 * (`apps/web/src/lib/api-origin.ts`, posé le 25/08/2026 pour les passerelles
 * d'entreprise qui bloquent `api.bellum-ai.com`) fait partir le même appel vers
 * `app.bellum-ai.com/api/auth/refresh`, réécrit par Vercel. Le navigateur, lui,
 * ne regarde QUE l'URL qu'il voit : `/api/auth/refresh` ne correspond pas à
 * `Path=/auth/refresh`, donc **il n'envoie pas le cookie**. L'API répond
 * `401 Refresh token manquant` — et le SPA conclut « session morte ».
 *
 * Conséquences mesurées dans les journaux du 03/11 (deux 401 à 1,3 s d'écart =
 * sonde de démarrage + rafraîchissement silencieux) : tout utilisateur derrière
 * une passerelle qui arme le repli est déconnecté à CHAQUE rechargement, sur
 * n'importe quelle page, définitivement. Le repli réparait l'appel et perdait
 * le cookie qui le rendait utile.
 *
 * Le jeton d'accès, bien plus sensible, voyage DÉJÀ sur `Path=/` : restreindre
 * le seul refresh n'achetait presque rien et coûtait le repli en entier.
 */
describe('AttachRefreshCookieInterceptor — le refresh survit au repli d’origine', () => {
  it('pose le cookie de refresh sur un Path qui couvre AUSSI le chemin du repli', () => {
    const refresh = runInterceptor('.bellum-ai.com').find(c => c.startsWith('uploadsSig:user-123='))
    expect(refresh).toBeDefined()
    const path = cookiePathOf(refresh as string)

    expect(pathMatches(path, '/auth/refresh')).toBe(true)
    expect(pathMatches(path, '/api/auth/refresh')).toBe(true)
  })

  /** Une garde doit LIRE quelque chose : le préfixe du repli vit côté web, dans
   *  un fichier que ce paquet n'importe pas. On le lit, pour que changer `/api`
   *  là-bas fasse échouer ICI au lieu de redéconnecter des clients. */
  it('couvre le préfixe de repli RÉELLEMENT déclaré par le front', () => {
    const origin = readFileSync(join(__dirname, '..', '..', '..', '..', 'web', 'src', 'lib', 'api-origin.ts'), 'utf8')
    const declared = /const FALLBACK_PATH = '([^']+)'/.exec(origin)?.[1]
    expect(declared).toBeDefined()

    const refresh = runInterceptor('').find(c => c.startsWith('uploadsSig:user-123='))
    expect(pathMatches(cookiePathOf(refresh as string), `${declared}/auth/refresh`)).toBe(true)
  })

  it('expire le cookie historique posé sur Path=/auth/refresh', () => {
    // Sans cette purge, le navigateur porte DEUX `uploadsSig:user-123` et envoie
    // le plus spécifique d'abord sur `/auth/refresh` : `cookie-parser` garde le
    // premier, donc le jeton périmé masquerait le neuf à chaque appel direct.
    const legacy = runInterceptor('.bellum-ai.com').filter(
      c => c.startsWith('uploadsSig:user-123=;') && c.includes('Path=/auth/refresh'),
    )
    expect(legacy).toHaveLength(1)
    expect(legacy[0]).toContain('Max-Age=0')
    expect(legacy[0]).toContain('Domain=.bellum-ai.com')
  })

  it('purge l’historique AVEC le Domain résolu de la requête, pas celui configuré', () => {
    // Marque blanche : sur `app.acme.com`, un `Domain=.bellum-ai.com` est rejeté
    // — la purge doit être host-only, sinon l'ancien cookie reste.
    const legacy = runInterceptor('.bellum-ai.com', {}, 'app.acme.com').filter(
      c => c.startsWith('uploadsSig:user-123=;') && c.includes('Path=/auth/refresh'),
    )
    expect(legacy).toHaveLength(1)
    expect(legacy[0]).not.toContain('Domain=')
  })
})

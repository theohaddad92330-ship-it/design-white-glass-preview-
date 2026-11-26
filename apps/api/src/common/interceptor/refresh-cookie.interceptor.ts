import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import { map, tap, type Observable } from 'rxjs'
import { KEEP_OTHER_SESSIONS_KEY } from '../decorator/keep-other-sessions.decorator'
import { LAST_USED_LOGIN_KEY, type LastUsedLoginMethod } from '../decorator/last-used-login.decorator'
import { readSessionScopeHint } from '../auth/scoped-session-cookie'

/** #4608 — `tab` : la déconnexion ne vise que l'identité déclarée par l'onglet.
 *  Doit rester identique à `LOGOUT_SCOPE_HEADER` côté web (`lib/api.ts`). */
export const LOGOUT_SCOPE_HEADER = 'x-bellum-logout-scope'

const DEFAULT_SESSION_PREFIX = 'session'
const DEFAULT_REFRESH_PREFIX = 'uploadsSig'
const DEFAULT_LOGGED_IN_PREFIX = 'loggedIn'
const DEFAULT_LAST_USED_LOGIN = 'lastUsedLogin'

/** Supabase refresh token TTL — 30 days by default, configurable in the
 *  Supabase dashboard. We bound the cookie at the same value so the
 *  browser drops it once it can no longer be used. */
const REFRESH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Fallback access cookie TTL when Supabase doesn't return `expires_at`
 *  in the session response. Matches Supabase's default access token TTL
 *  ceiling (1h default, 24h max in the dashboard). */
const ACCESS_COOKIE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000

type SessionLike = {
  access_token?: string
  refresh_token?: string
  expires_at?: number | null
  user?: { id?: string }
} & Record<string, unknown>

type CookieAttributes = {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
  maxAgeMs?: number
  /** When set (e.g. `.bellum-ai.com`), scopes the cookie to a parent domain so
   *  the SPA and API on sibling subdomains share it. Empty/undefined = host-only. */
  domain?: string
}

/**
 * Builds a `Set-Cookie` header line. We bypass `res.cookie()` because
 * Express's strict RFC 7230 validator rejects `:` in cookie names — the
 * user-scoped naming convention here is `session:{userId}` (mirrors
 * Linear). All modern browsers accept `:` in cookie names; the spec
 * forbids it but reality has long since voted otherwise.
 */
function buildCookieHeader(name: string, value: string, attrs: CookieAttributes): string {
  const parts: string[] = [`${name}=${value}`]
  if (attrs.maxAgeMs !== undefined) {
    parts.push(`Max-Age=${Math.floor(attrs.maxAgeMs / 1000)}`)
    parts.push(`Expires=${new Date(Date.now() + attrs.maxAgeMs).toUTCString()}`)
  }
  if (attrs.path) parts.push(`Path=${attrs.path}`)
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`)
  if (attrs.httpOnly) parts.push('HttpOnly')
  if (attrs.secure) parts.push('Secure')
  if (attrs.sameSite) parts.push(`SameSite=${attrs.sameSite[0].toUpperCase() + attrs.sameSite.slice(1)}`)
  return parts.join('; ')
}

function buildClearHeader(name: string, attrs: CookieAttributes): string {
  return buildCookieHeader(name, '', { ...attrs, maxAgeMs: 0 })
}

/**
 * The SPA (e.g. app.bellum-ai.com) and the API historically live on
 * different registrable domains (e.g. *.up.railway.app), so every browser→API
 * call is CROSS-SITE. A `SameSite=Lax` cookie is NOT sent on cross-site
 * `fetch`/XHR, so the session cookie would silently never reach the API and
 * every authenticated request 401s. Cross-site delivery requires
 * `SameSite=None` — which browsers only honour together with `Secure` (HTTPS).
 * In local dev (same-site localhost, plain HTTP) we can't set `None` without
 * `Secure`, so fall back to `Lax`.
 *
 * NOTE: cross-site `SameSite=None` also makes the JS-readable `loggedIn:`
 * sentinel unreadable by the SPA (it lives on the API's host, not the SPA's),
 * which logs the user out on every hard reload. The real fix is to host the
 * API on a sibling subdomain and set `COOKIE_DOMAIN=.bellum-ai.com` so the
 * cookies are same-site and shared — see `cookieDomain` below.
 */
function crossSiteSameSite(secure: boolean): 'none' | 'lax' {
  return secure ? 'none' : 'lax'
}

function sessionAttrs(secure: boolean, domain: string | undefined, maxAgeMs?: number): CookieAttributes {
  return { httpOnly: true, secure, sameSite: crossSiteSameSite(secure), path: '/', domain, maxAgeMs }
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `Path=/` ET NON `/auth/refresh` — mesuré en production le 03/11/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Le cookie de refresh vivait sur `Path=/auth/refresh` : le plus étroit
 * possible, puisque c'est le seul endroit qui le lit. C'était juste tant qu'il
 * n'existait qu'UN chemin pour appeler l'API.
 *
 * Le REPLI D'ORIGINE (`apps/web/src/lib/api-origin.ts`, 25/08/2026) en a créé un
 * second : quand la passerelle d'entreprise d'un client bloque
 * `api.bellum-ai.com`, le SPA repasse par `app.bellum-ai.com/api/*`, que Vercel
 * réécrit vers l'API. Le rafraîchissement part alors vers
 * `/api/auth/refresh` — et le navigateur ne regarde QUE l'URL qu'il voit : ce
 * chemin ne correspond pas à `Path=/auth/refresh` (RFC 6265 §5.1.4), donc **il
 * n'envoie pas le cookie**. L'API répond `401 Refresh token manquant`, le SPA
 * lit « session morte » et renvoie sur `/login`. À CHAQUE rechargement, sur
 * n'importe quelle page, tant que le repli est armé.
 *
 * Le repli réparait donc l'appel en perdant exactement ce qui le rendait utile,
 * et seuls les utilisateurs derrière une passerelle le vivaient — invisible en
 * recette, invisible chez nous, permanent chez eux.
 *
 * ⚠️ Le compromis est assumé : le jeton de refresh voyage désormais sur toutes
 * les requêtes de l'API. Il reste `HttpOnly` et hors de portée de JS, et le
 * jeton d'ACCÈS — qui ouvre tout, lui, immédiatement — voyage déjà sur `Path=/`.
 * Restreindre le seul refresh n'achetait presque rien et coûtait le repli entier.
 */
function refreshAttrs(secure: boolean, domain: string | undefined, maxAgeMs?: number): CookieAttributes {
  return { httpOnly: true, secure, sameSite: crossSiteSameSite(secure), path: '/', domain, maxAgeMs }
}

/** Le `Path` d'avant le 03/11/2026. Un cookie ne s'expire qu'avec les attributs
 *  qui l'ont posé : tant que des navigateurs portent l'ancien, chaque session
 *  émise doit l'expirer explicitement — sinon il est RENVOYÉ EN PREMIER sur
 *  `/auth/refresh` (le navigateur trie du Path le plus spécifique au moins),
 *  `cookie-parser` garde la première occurrence, et le jeton périmé masque le
 *  neuf à chaque appel direct. */
const REFRESH_COOKIE_LEGACY_PATH = '/auth/refresh'

function legacyRefreshAttrs(secure: boolean, domain: string | undefined): CookieAttributes {
  return { ...refreshAttrs(secure, domain), path: REFRESH_COOKIE_LEGACY_PATH }
}

function loggedInAttrs(secure: boolean, domain: string | undefined, maxAgeMs?: number): CookieAttributes {
  return { httpOnly: false, secure, sameSite: crossSiteSameSite(secure), path: '/', domain, maxAgeMs }
}

function lastUsedLoginAttrs(secure: boolean, domain: string | undefined): CookieAttributes {
  return {
    httpOnly: false,
    secure,
    sameSite: crossSiteSameSite(secure),
    path: '/',
    domain,
    maxAgeMs: 365 * 24 * 60 * 60 * 1000,
  }
}

/** Reads `COOKIE_DOMAIN` and normalises an empty value to `undefined` so the
 *  cookie stays host-only (dev / unconfigured) rather than emitting `Domain=`. */
function readCookieDomain(config: ConfigService): string | undefined {
  return config.get<string>('cookieDomain', '')?.trim() || undefined
}

/**
 * LE DOMAINE DU COOKIE, DÉCIDÉ PAR REQUÊTE — marque blanche, 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE FONCTION SUPPRIME
 * ─────────────────────────────────────────────────────────────────────────
 * `COOKIE_DOMAIN` était une valeur UNIQUE d'environnement, écrite sur toutes
 * les réponses. Un navigateur REJETTE SILENCIEUSEMENT un `Set-Cookie` dont le
 * `Domain` n'est pas un suffixe de l'hôte demandé (RFC 6265 §5.3.5). Donc, sur
 * `app.acme.com`, un `Domain=.bellum-ai.com` ne posait AUCUN cookie — et la
 * connexion échouait sans un seul message : la réponse était un 200 avec ses
 * trois en-têtes `Set-Cookie`, tous jetés par le navigateur.
 *
 * C'est le pire mode de panne de la marque blanche : il ne se voit ni dans les
 * journaux, ni en recette sur notre domaine, seulement chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * Le `Domain` configuré ne s'écrit QUE s'il couvre réellement l'hôte demandé.
 * Sinon, aucun `Domain` : le cookie devient « host-only », c'est-à-dire posé
 * sur exactement l'hôte qui a répondu.
 *
 * ⚠️ Et c'est le comportement le PLUS SÛR, pas un repli dégradé : un cookie
 * host-only sur `app.acme.com` n'est jamais envoyé ailleurs. Le `Domain`
 * partagé n'existe que pour une raison — que le SPA et l'API vivent sur deux
 * sous-domaines FRÈRES de chez nous. Un domaine client n'a pas ce besoin :
 * l'API y répond sur le même hôte.
 */
export function resolveCookieDomain(configured: string | undefined, host: string | undefined): string | undefined {
  if (!configured) return undefined
  const requestHost = host?.split(':')[0]?.replace(/\.$/, '').toLowerCase()
  if (!requestHost) return undefined
  // `.bellum-ai.com` et `bellum-ai.com` désignent la même portée pour un
  // navigateur moderne ; le point de tête est un vestige de la RFC 2109 que
  // l'on rencontre encore dans les configurations.
  const scope = configured.replace(/^\./, '').toLowerCase()
  if (requestHost === scope) return configured
  if (requestHost.endsWith(`.${scope}`)) return configured
  return undefined
}

/**
 * Computes the `Max-Age` for the access cookie from Supabase's
 * `expires_at` (Unix seconds). Falls back to a sane default when the
 * field is missing.
 */
function deriveAccessTtlMs(expiresAt: number | null | undefined): number {
  if (typeof expiresAt !== 'number') return ACCESS_COOKIE_FALLBACK_TTL_MS
  const remainingMs = expiresAt * 1000 - Date.now()
  return remainingMs > 0 ? remainingMs : ACCESS_COOKIE_FALLBACK_TTL_MS
}

/**
 * Reads the handler's `SessionResponse` and writes the Linear-style
 * cookie set:
 *  - `session:{userId}` → access JWT (HttpOnly, Path=/)
 *  - `uploadsSig:{userId}` → refresh JWT (HttpOnly, Path=/auth/refresh)
 *  - `loggedIn:{userId}=1` → JS-readable presence flag
 *  - `lastUsedLogin` → device-scoped login method (driven by
 *    `@LastUsedLogin(...)` metadata)
 *
 * Both tokens are stripped from the JSON body so they never reach JS.
 * Apply via `@UseInterceptors(...)` on every endpoint that issues a
 * fresh session.
 */
@Injectable()
export class AttachRefreshCookieInterceptor implements NestInterceptor {
  private readonly sessionPrefix: string
  private readonly refreshPrefix: string
  private readonly loggedInPrefix: string
  private readonly lastUsedLoginCookie: string
  private readonly secure: boolean
  /** La valeur d'environnement — PAS celle écrite : voir `resolveCookieDomain`. */
  private readonly configuredCookieDomain: string | undefined

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.sessionPrefix = config.get<string>('sessionCookiePrefix', DEFAULT_SESSION_PREFIX)
    this.refreshPrefix = config.get<string>('refreshCookiePrefix', DEFAULT_REFRESH_PREFIX)
    this.loggedInPrefix = config.get<string>('loggedInCookiePrefix', DEFAULT_LOGGED_IN_PREFIX)
    this.lastUsedLoginCookie = config.get<string>('lastUsedLoginCookieName', DEFAULT_LAST_USED_LOGIN)
    this.secure = config.get<string>('nodeEnv') === 'production'
    this.configuredCookieDomain = readCookieDomain(config)
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>()
    const res = ctx.switchToHttp().getResponse<Response>()
    const handler = ctx.getHandler()
    const lastUsedLogin = this.reflector.get<LastUsedLoginMethod | undefined>(LAST_USED_LOGIN_KEY, handler)
    const keepOtherSessions = this.reflector.get<boolean | undefined>(KEEP_OTHER_SESSIONS_KEY, handler) === true
    // Décidé PAR REQUÊTE : un domaine client ne partage pas notre portée.
    const cookieDomain = resolveCookieDomain(this.configuredCookieDomain, req.headers.host)

    return next.handle().pipe(
      map((body: SessionLike | { session?: SessionLike } | null | undefined) => {
        // Endpoints either return a flat SessionLike (login, refresh,
        // verify-email-otp) or a discriminated union with `.session` nested
        // inside (signup). Resolve both shapes here.
        const session: SessionLike | undefined =
          body && typeof body === 'object' && 'session' in body
            ? (body as { session?: SessionLike }).session
            : ((body as SessionLike | null | undefined) ?? undefined)

        if (!session?.access_token || !session.refresh_token || !session.user?.id) return body

        const userId = session.user.id
        const accessMaxAgeMs = deriveAccessTtlMs(session.expires_at)

        res.append(
          'Set-Cookie',
          buildCookieHeader(
            `${this.sessionPrefix}:${userId}`,
            session.access_token,
            sessionAttrs(this.secure, cookieDomain, accessMaxAgeMs),
          ),
        )
        res.append(
          'Set-Cookie',
          buildCookieHeader(
            `${this.refreshPrefix}:${userId}`,
            session.refresh_token,
            refreshAttrs(this.secure, cookieDomain, REFRESH_COOKIE_TTL_MS),
          ),
        )
        // Le même cookie posé jusqu'au 03/11/2026 sur `/auth/refresh` : on
        // l'expire ici, à chaque session émise, pour qu'il cesse de masquer
        // celui de `Path=/` sur les appels directs. Voir `refreshAttrs`.
        res.append(
          'Set-Cookie',
          buildClearHeader(`${this.refreshPrefix}:${userId}`, legacyRefreshAttrs(this.secure, cookieDomain)),
        )
        res.append(
          'Set-Cookie',
          buildCookieHeader(
            `${this.loggedInPrefix}:${userId}`,
            '1',
            loggedInAttrs(this.secure, cookieDomain, REFRESH_COOKIE_TTL_MS),
          ),
        )
        if (lastUsedLogin) {
          res.append(
            'Set-Cookie',
            buildCookieHeader(this.lastUsedLoginCookie, lastUsedLogin, lastUsedLoginAttrs(this.secure, cookieDomain)),
          )
        }

        // Un navigateur = UNE identité. Les cookies d'auth étant nommés par
        // utilisateur (`session:{uid}`), une seconde connexion depuis le même
        // navigateur EMPILAIT les sessions ; `JwtStrategy` prenant le premier
        // `session:*` du bocal, les requêtes repartaient sur le compte le plus
        // ancien — se connecter à un autre compte ramenait à son espace de
        // travail. On purge donc, à chaque session émise, les cookies d'auth de
        // TOUT AUTRE utilisateur (mêmes attributs qu'à la pose, sinon le
        // navigateur ne les remplace pas). `lastUsedLogin` et `bellum_did`
        // survivent : ils décrivent l'APPAREIL, pas l'identité.
        // #4608 — sauf la salle de démonstration : l'ouvrir ne coûte JAMAIS sa
        // session réelle à celui qui est déjà connecté (le serveur lit le cookie
        // que l'onglet désigne, `x-bellum-user`, donc les deux coexistent).
        if (!keepOtherSessions) this.clearOtherUsers(req, res, userId, cookieDomain)

        const { access_token: _access, refresh_token: _refresh, ...sessionRest } = session
        // Re-wrap when the caller used the discriminated form so the
        // top-level `status` survives.
        if (body && typeof body === 'object' && 'session' in body) {
          return { ...(body as Record<string, unknown>), session: sessionRest }
        }
        return sessionRest
      }),
    )
  }

  /** Expire les trois cookies d'auth de chaque utilisateur AUTRE que celui qui
   *  vient d'obtenir une session. Le cookie de refresh vit sur son propre Path :
   *  le purger avec d'autres attributs le laisserait en place. */
  private clearOtherUsers(req: Request, res: Response, currentUserId: string, cookieDomain: string | undefined): void {
    const cookies = (req.cookies ?? {}) as Record<string, string>
    for (const name of Object.keys(cookies)) {
      const prefix = [this.sessionPrefix, this.refreshPrefix, this.loggedInPrefix].find(p => name.startsWith(`${p}:`))
      if (!prefix) continue
      if (name.slice(prefix.length + 1) === currentUserId) continue

      const attrs =
        prefix === this.refreshPrefix
          ? refreshAttrs(this.secure, cookieDomain)
          : prefix === this.loggedInPrefix
            ? loggedInAttrs(this.secure, cookieDomain)
            : sessionAttrs(this.secure, cookieDomain)
      res.append('Set-Cookie', buildClearHeader(name, attrs))
      // Les deux Path possibles du refresh : purger le neuf laisserait l'ancien
      // en place, et l'autre identité resterait rafraîchissable.
      if (prefix === this.refreshPrefix) {
        res.append('Set-Cookie', buildClearHeader(name, legacyRefreshAttrs(this.secure, cookieDomain)))
      }
    }
  }
}

/**
 * Clears every `session:*`, `uploadsSig:*`, and `loggedIn:*` cookie the
 * browser sent — logout drops every active session on the device.
 * `lastUsedLogin` stays so the login screen can preselect the right
 * method on return.
 */
@Injectable()
export class ClearRefreshCookieInterceptor implements NestInterceptor {
  private readonly sessionPrefix: string
  private readonly refreshPrefix: string
  private readonly loggedInPrefix: string
  private readonly secure: boolean
  private readonly configuredCookieDomain: string | undefined

  constructor(config: ConfigService) {
    this.sessionPrefix = config.get<string>('sessionCookiePrefix', DEFAULT_SESSION_PREFIX)
    this.refreshPrefix = config.get<string>('refreshCookiePrefix', DEFAULT_REFRESH_PREFIX)
    this.loggedInPrefix = config.get<string>('loggedInCookiePrefix', DEFAULT_LOGGED_IN_PREFIX)
    this.secure = config.get<string>('nodeEnv') === 'production'
    this.configuredCookieDomain = readCookieDomain(config)
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>()
    const res = ctx.switchToHttp().getResponse<Response>()
    return next.handle().pipe(
      tap(() => {
        // ⚠️ La MÊME résolution qu'à la pose. Un cookie ne s'expire qu'avec les
        // attributs qui l'ont posé : effacer avec un `Domain` que le navigateur
        // rejette laisserait l'utilisateur connecté sur un domaine client, et
        // la réponse dirait « déconnecté ».
        const cookieDomain = resolveCookieDomain(this.configuredCookieDomain, req.headers.host)
        const cookies = (req.cookies ?? {}) as Record<string, string>
        // #4608 — « Quitter la démonstration » ne déconnecte que l'identité de
        // l'onglet : la session réelle ouverte à côté survit. Sans la portée
        // explicite ET sans identité déclarée, rien ne change — la déconnexion
        // efface toute session de l'appareil, comme avant.
        const onlyUser = req.headers?.[LOGOUT_SCOPE_HEADER] === 'tab' ? readSessionScopeHint(req.headers) : null
        for (const name of Object.keys(cookies)) {
          if (onlyUser && name.slice(name.indexOf(':') + 1).toLowerCase() !== onlyUser) continue
          if (name.startsWith(`${this.sessionPrefix}:`)) {
            res.append('Set-Cookie', buildClearHeader(name, sessionAttrs(this.secure, cookieDomain)))
          } else if (name.startsWith(`${this.refreshPrefix}:`)) {
            res.append('Set-Cookie', buildClearHeader(name, refreshAttrs(this.secure, cookieDomain)))
            // Avant le 03/11/2026 le refresh vivait sur `/auth/refresh` — et une
            // déconnexion ne l'atteignait même pas : le navigateur ne l'envoyait
            // pas sur `POST /auth/logout`, donc il n'apparaissait pas dans
            // `req.cookies`. Il est désormais sur `Path=/` (donc envoyé, donc
            // purgé), et l'ancien s'expire avec lui.
            res.append('Set-Cookie', buildClearHeader(name, legacyRefreshAttrs(this.secure, cookieDomain)))
          } else if (name.startsWith(`${this.loggedInPrefix}:`)) {
            res.append('Set-Cookie', buildClearHeader(name, loggedInAttrs(this.secure, cookieDomain)))
          }
        }
      }),
    )
  }
}

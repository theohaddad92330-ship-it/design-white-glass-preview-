import { assertSafeOutboundUrl } from '../integrations/ssrf-guard'
import { BEEPER_TIMEOUT_MS } from './beeper-config'

/**
 * #4406 — le client HTTP du Beeper Desktop d'UN utilisateur, joint par l'URL distante qu'il a saisie
 * (Remote Access + son tunnel).
 *
 * Contrat vérifié le 21/10/2026 (developers.beeper.com) : découverte RFC 8414
 * `/.well-known/oauth-authorization-server`, `Authorization: Bearer`, `GET /v1/chats`,
 * `GET /v1/chats/{chatID}/messages`, `POST /v1/chats/{chatID}/messages` (`text`, `replyToMessageID`
 * → `pendingMessageID`).
 *
 * Trois règles de sécurité, tenues ICI pour qu'aucun appelant ne puisse les oublier :
 * 1. **chaque** appel repasse la garde SSRF (localhost, IP privées, métadonnées refusés) — l'hôte
 *    est saisi par l'utilisateur, un DNS peut changer entre deux appels ;
 * 2. **aucune redirection suivie** (`redirect: 'manual'`) : une 302 vers `169.254.169.254` contournerait
 *    la garde ;
 * 3. les points de terminaison annoncés par la découverte sont **rebasés sur l'origine saisie** :
 *    derrière un tunnel, Beeper annonce `http://localhost:23373/...` — et une découverte hostile
 *    annoncerait un hôte interne. On n'en garde que le chemin.
 *
 * Aucun jeton, aucun corps de message n'est journalisé par ce fichier.
 */

/** Beeper Desktop fermé, tunnel coupé, délai dépassé : l'état NOMMÉ `unreachable`. */
export class BeeperUnreachableError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'BeeperUnreachableError'
  }
}

/** Jeton refusé (401/403) : le branchement est à refaire. */
export class BeeperAuthError extends Error {
  constructor() {
    super('Beeper a refusé le jeton.')
    this.name = 'BeeperAuthError'
  }
}

export class BeeperHttpError extends Error {
  constructor(readonly status: number) {
    super(`Beeper a répondu ${status}.`)
    this.name = 'BeeperHttpError'
  }
}

type BeeperDiscovery = {
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint: string | null
  revocationEndpoint: string | null
}

type BeeperTokens = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number | null
  scope: string | null
}

/** Le chat tel que `GET /v1/chats` le rend (champs lus seulement). */
export type BeeperRawChat = {
  id?: unknown
  network?: unknown
  title?: unknown
  type?: unknown
  unreadCount?: unknown
  lastActivity?: unknown
  participants?: { items?: unknown }
}

export type BeeperRawMessage = {
  id?: unknown
  senderName?: unknown
  isSender?: unknown
  timestamp?: unknown
  text?: unknown
}

type Fetch = typeof fetch

/** Normalise l'adresse saisie : origine seule (schéma + hôte + port), sans chemin ni identifiants. */
export function normalizeBeeperBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('URL invalide.')
  }
  if (url.username || url.password) throw new Error('URL invalide.')
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('URL https requise.')
  return url.origin
}

/** Rebase un point de terminaison annoncé sur l'origine saisie (règle 3). */
export function rebaseOnOrigin(endpoint: unknown, origin: string): string | null {
  if (typeof endpoint !== 'string' || !endpoint) return null
  try {
    const parsed = new URL(endpoint, origin)
    return `${origin}${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

export class BeeperClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tunnelDeclared: boolean,
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = BEEPER_TIMEOUT_MS,
  ) {}

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    // Règle 1 — la garde, à CHAQUE appel. Un refus de garde n'est pas « injoignable » : il remonte tel quel.
    await assertSafeOutboundUrl(url, { allowHttp: this.tunnelDeclared })
    let res: Response
    try {
      res = await this.fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) })
    } catch {
      throw new BeeperUnreachableError('Beeper Desktop ne répond pas (application fermée ou tunnel coupé).')
    }
    // Règle 2 — une redirection n'est jamais suivie.
    if (res.status >= 300 && res.status < 400) throw new BeeperUnreachableError('Beeper a répondu par une redirection.')
    // Un tunnel dont l'arrière est fermé répond 502/503/504 : c'est Beeper qui est absent.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new BeeperUnreachableError('Le tunnel répond, mais Beeper Desktop derrière lui ne répond pas.')
    }
    if (res.status === 401 || res.status === 403) throw new BeeperAuthError()
    if (!res.ok) throw new BeeperHttpError(res.status)
    return res
  }

  private async json(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const res = await this.call(url, init)
    try {
      const body = (await res.json()) as unknown
      return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    } catch {
      throw new BeeperUnreachableError('Beeper a rendu une réponse illisible.')
    }
  }

  async discover(): Promise<BeeperDiscovery> {
    const meta = await this.json(`${this.baseUrl}/.well-known/oauth-authorization-server`)
    const authorizationEndpoint = rebaseOnOrigin(meta['authorization_endpoint'], this.baseUrl)
    const tokenEndpoint = rebaseOnOrigin(meta['token_endpoint'], this.baseUrl)
    if (!authorizationEndpoint || !tokenEndpoint) throw new BeeperHttpError(422)
    return {
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint: rebaseOnOrigin(meta['registration_endpoint'], this.baseUrl),
      revocationEndpoint: rebaseOnOrigin(meta['revocation_endpoint'], this.baseUrl),
    }
  }

  /** Enregistrement dynamique (RFC 7591) — client PUBLIC, PKCE seul. */
  async register(
    registrationEndpoint: string,
    redirectUri: string,
  ): Promise<{ clientId: string; clientSecret: string | null }> {
    const body = await this.json(registrationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bellum',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    })
    const clientId = typeof body['client_id'] === 'string' ? body['client_id'] : ''
    if (!clientId) throw new BeeperHttpError(422)
    return { clientId, clientSecret: typeof body['client_secret'] === 'string' ? body['client_secret'] : null }
  }

  private async token(tokenEndpoint: string, form: Record<string, string>): Promise<BeeperTokens> {
    const body = await this.json(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
    const accessToken = typeof body['access_token'] === 'string' ? body['access_token'] : ''
    if (!accessToken) throw new BeeperHttpError(422)
    return {
      accessToken,
      refreshToken: typeof body['refresh_token'] === 'string' ? body['refresh_token'] : null,
      expiresIn: typeof body['expires_in'] === 'number' ? body['expires_in'] : null,
      scope: typeof body['scope'] === 'string' ? body['scope'] : null,
    }
  }

  exchangeCode(input: {
    tokenEndpoint: string
    code: string
    codeVerifier: string
    clientId: string
    clientSecret: string | null
    redirectUri: string
  }): Promise<BeeperTokens> {
    return this.token(input.tokenEndpoint, {
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      ...(input.clientSecret ? { client_secret: input.clientSecret } : {}),
    })
  }

  refresh(input: {
    tokenEndpoint: string
    refreshToken: string
    clientId: string
    clientSecret: string | null
  }): Promise<BeeperTokens> {
    return this.token(input.tokenEndpoint, {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      ...(input.clientSecret ? { client_secret: input.clientSecret } : {}),
    })
  }

  /** RFC 7009. `true` seulement si Beeper a confirmé. */
  async revoke(input: { revocationEndpoint: string; token: string; clientId: string }): Promise<boolean> {
    try {
      await this.call(input.revocationEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: input.token, client_id: input.clientId }).toString(),
      })
      return true
    } catch {
      return false
    }
  }

  private authed(accessToken: string, extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...extra }
  }

  async listChats(accessToken: string, limit = 25): Promise<BeeperRawChat[]> {
    const body = await this.json(`${this.baseUrl}/v1/chats?limit=${Math.min(Math.max(limit, 1), 200)}`, {
      headers: this.authed(accessToken),
    })
    return Array.isArray(body['items']) ? (body['items'] as BeeperRawChat[]) : []
  }

  async listMessages(accessToken: string, chatId: string): Promise<BeeperRawMessage[]> {
    const body = await this.json(`${this.baseUrl}/v1/chats/${encodeURIComponent(chatId)}/messages`, {
      headers: this.authed(accessToken),
    })
    return Array.isArray(body['items']) ? (body['items'] as BeeperRawMessage[]) : []
  }

  /** L'ENVOI. Appelé par `BeeperService.sendReply` seulement, après la porte (BB.3). */
  async sendMessage(
    accessToken: string,
    chatId: string,
    input: { text: string; replyToMessageId?: string },
  ): Promise<{ pendingMessageId: string | null }> {
    const body = await this.json(`${this.baseUrl}/v1/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      headers: this.authed(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        text: input.text,
        ...(input.replyToMessageId ? { replyToMessageID: input.replyToMessageId } : {}),
      }),
    })
    return { pendingMessageId: typeof body['pendingMessageID'] === 'string' ? body['pendingMessageID'] : null }
  }
}

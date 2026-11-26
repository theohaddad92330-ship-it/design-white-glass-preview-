/**
 * L'adaptateur d'envoi LinkedIn — par un FOURNISSEUR établi (Unipile), #4737.
 *
 * ⚠️ RENVERSEMENT DE LOUIS, DATÉ DU 29/10/2026 — écrit pour être lu, pas effacé.
 * Le 28/10 : « API officielle LinkedIn » (envoi réservé aux partenaires agréés, agrément
 * non acquis, adaptateur inerte). Le 29/10 au matin : « il y a plein de SaaS qui y arrivent,
 * fais comme eux ». Ces SaaS n'utilisent pas l'API officielle : ils agissent avec la SESSION
 * de l'utilisateur. Louis a tranché la voie : un fournisseur établi.
 *
 * Ce que ce choix veut dire, et c'est sa raison : NOUS NE TOUCHONS JAMAIS au cookie `li_at`
 * du client. Le fournisseur porte la session, les limites et la rotation. Ni cookie ni mot
 * de passe LinkedIn dans notre base, ni navigateur piloté, ni scraping, ni envoi depuis nos
 * IP avec l'identité du client. Le client relie son compte chez le fournisseur ; nous ne
 * gardons que l'identifiant opaque de cette liaison (`accountRefOf`), jamais journalisé.
 *
 * Contrat lu (29/10/2026) : https://developer.unipile.com/docs/send-messages
 *   · GET  https://{DSN}/api/v1/users/{identifiant public}?account_id=… → `provider_id`
 *   · POST https://{DSN}/api/v1/chats (multipart : account_id, text, attendees_ids) → 201
 *     `{ object: 'ChatStarted', chat_id, message_id }` ; en-tête `X-API-KEY`.
 *   · Hors InMail, un nouveau chat n'est possible qu'avec une RELATION du compte : sinon le
 *     fournisseur refuse, et l'issue est `failed` (erreur claire), jamais un repli.
 *
 * SANS CLÉ = NO-OP STRICT : zéro appel réseau, issue `not_open`. Même chose si l'adresse du
 * fournisseur manque, ou si le compte du client n'est pas relié.
 */
export class LinkedInTimeoutError extends Error {
  constructor() {
    super('delai-depasse')
    this.name = 'LinkedInTimeoutError'
  }
}

export interface LinkedInTransport {
  send(input: {
    apiKey: string
    dsn: string
    accountRef: string
    /** Le dernier segment de l'adresse `linkedin.com/in/…` du contact. */
    publicIdentifier: string
    body: string
  }): Promise<{ messageRef: string }>
}

type SendOutcome =
  { kind: 'not_open' } | { kind: 'sent'; proof: string } | { kind: 'unknown' } | { kind: 'failed'; message: string }

/** Hôte (et port) du fournisseur, rien d'autre : jamais de chemin ni d'identifiants dans l'adresse. */
const DSN_SHAPE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i

const PROFILE_IN_URL = /linkedin\.com\/in\/([^/?#\s]+)/i

export function publicIdentifierOf(recipientRef: string): string | null {
  const match = PROFILE_IN_URL.exec(recipientRef)
  const raw = match?.[1]
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

export class UnipileLinkedInSender {
  private readonly apiKey: string | null
  private readonly dsn: string | null
  private readonly transport: LinkedInTransport | null
  private readonly accountRefOf: ((userId: string) => Promise<string | null>) | null

  constructor(config: {
    apiKey: string | undefined
    dsn: string | undefined
    transport?: LinkedInTransport | null
    accountRefOf?: (userId: string) => Promise<string | null>
  }) {
    const key = config.apiKey?.trim()
    const dsn = config.dsn?.trim()
    this.apiKey = key ? key : null
    this.dsn = dsn && DSN_SHAPE.test(dsn) ? dsn : null
    this.transport = config.transport ?? null
    this.accountRefOf = config.accountRefOf ?? null
  }

  /** La voie est ouverte côté fournisseur si — et seulement si — la clé ET son adresse sont posées. */
  isOpen(): boolean {
    return this.apiKey !== null && this.dsn !== null && this.transport !== null
  }

  /** …et, pour CET utilisateur, si son compte LinkedIn est relié chez le fournisseur. */
  async isOpenFor(userId: string): Promise<boolean> {
    return this.isOpen() && (await this.accountFor(userId)) !== null
  }

  async send(input: { userId: string; recipientRef: string; body: string }): Promise<SendOutcome> {
    if (!this.apiKey || !this.dsn || !this.transport) return { kind: 'not_open' }
    const accountRef = await this.accountFor(input.userId)
    if (!accountRef) return { kind: 'not_open' }
    const publicIdentifier = publicIdentifierOf(input.recipientRef)
    if (!publicIdentifier) return { kind: 'failed', message: 'L’adresse LinkedIn du contact est illisible.' }
    try {
      const { messageRef } = await this.transport.send({
        apiKey: this.apiKey,
        dsn: this.dsn,
        accountRef,
        publicIdentifier,
        body: input.body,
      })
      return { kind: 'sent', proof: messageRef }
    } catch (cause) {
      // Un timeout n'est pas un échec : on ne sait pas si le message est parti.
      if (cause instanceof LinkedInTimeoutError) return { kind: 'unknown' }
      // Le message d'erreur du fournisseur peut contenir la clé ou le corps : il n'est jamais relayé.
      return { kind: 'failed', message: 'Le fournisseur a refusé l’envoi.' }
    }
  }

  private async accountFor(userId: string): Promise<string | null> {
    if (!this.accountRefOf) return null
    try {
      return (await this.accountRefOf(userId)) || null
    } catch {
      return null
    }
  }
}

type FetchLike = (
  url: string,
  init: Record<string, unknown>,
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

const REQUEST_TIMEOUT_MS = 20_000

const isAbort = (cause: unknown): boolean =>
  cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')

/**
 * Le transport HTTP du contrat ci-dessus. Deux appels : lire le profil (identifiant interne), puis
 * démarrer le chat. `res.ok` est vérifié à CHAQUE appel. Une coupure pendant la lecture du profil
 * n'a rien envoyé (échec) ; une coupure pendant l'envoi laisse un doute (`LinkedInTimeoutError`).
 * Jamais d'`li_at`, de mot de passe ni de navigateur : seule la clé du fournisseur voyage.
 */
export class UnipileHttpTransport implements LinkedInTransport {
  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async send(input: Parameters<LinkedInTransport['send']>[0]): Promise<{ messageRef: string }> {
    const base = `https://${input.dsn}/api/v1`
    const headers = { 'X-API-KEY': input.apiKey, accept: 'application/json' }

    const profile = await this.fetchImpl(
      `${base}/users/${encodeURIComponent(input.publicIdentifier)}?account_id=${encodeURIComponent(input.accountRef)}`,
      { method: 'GET', headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    )
    if (!profile.ok) throw new Error('profil-refuse')
    const providerId = ((await profile.json()) as { provider_id?: unknown } | null)?.provider_id
    if (typeof providerId !== 'string' || !providerId) throw new Error('profil-illisible')

    const form = new FormData()
    form.set('account_id', input.accountRef)
    form.set('text', input.body)
    form.set('attendees_ids', providerId)
    let chat: Awaited<ReturnType<FetchLike>>
    try {
      chat = await this.fetchImpl(`${base}/chats`, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      if (isAbort(cause)) throw new LinkedInTimeoutError()
      throw cause
    }
    if (!chat.ok) throw new Error('envoi-refuse')
    const started = (await chat.json().catch(() => null)) as { message_id?: unknown; chat_id?: unknown } | null
    const messageRef = typeof started?.message_id === 'string' ? started.message_id : null
    // Un 201 sans identifiant de message : le fournisseur dit « créé » mais ne prouve rien — un doute, pas un succès.
    if (!messageRef) throw new LinkedInTimeoutError()
    return { messageRef }
  }
}

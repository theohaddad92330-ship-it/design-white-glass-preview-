import { SCOPE_GAP_RECORDER, type ScopeGapRecorder } from '../connector-scope-gaps/scope-gap-recorder.port'
import {
  findAllPersonalConnections,
  findConnectionByMailbox,
  findPersonalConnection,
  findUnnamedConnection,
  resolveDisconnectTarget,
} from '../../common/util/personal-connection'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  Optional,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { authorizationExpired } from '../../common/connector-error'
import { refreshTrackingFailure } from '../../common/util/oauth-refresh'
import { grantedScopes, hasScope } from '../../common/util/oauth-scopes'
import { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
// Reuse the CRM module's AES-256-GCM token helper — same "encrypt OAuth secrets
// at rest" need, same key derivation (CRM_TOKEN_ENC_KEY → INTERNAL_API_SECRET → …).
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { SuppressionService } from '../mailer/suppression.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  MicrosoftClient,
  type CalendarEventInput,
  type CalendarEventResult,
  type SendMailInput,
} from './microsoft.client'
import { readMicrosoftConfig, type MicrosoftConfig } from './microsoft-config'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short
 *  enough to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
/** Refresh the access token if it expires within this window. */
const REFRESH_SKEW_MS = 60 * 1000
const PROVIDER = 'microsoft' as const
/** Delegated Graph permission needed to READ the mailbox (zero layer, p8).
 *  Deliberately absent from the default scope set: reading a user's mailbox is a
 *  bigger ask than sending, so it stays an explicit operator opt-in via
 *  `MICROSOFT_SCOPES`. Without it, {@link MicrosoftService.searchMailbox} is a
 *  no-op rather than a 403. */
const MAIL_READ_SCOPE = 'Mail.Read'
/** Superset of `Mail.Read` that also allows CREATING a draft — what the
 *  executive layer needs, and what the default scope set now requests. */
export const MAIL_READWRITE_SCOPE = 'Mail.ReadWrite'
/** Needed to read/write the automatic replies (out-of-office). */
export const MAILBOX_SETTINGS_SCOPE = 'MailboxSettings.ReadWrite'
export const MAIL_SEND_SCOPE = 'Mail.Send'
export const CALENDARS_RW_SCOPE = 'Calendars.ReadWrite'
/** #2390.9 — capacité des salles (API Places). Opt-in opérateur : absente des portées par défaut. */
export const PLACE_READ_SCOPE = 'Place.Read.All'
/** Espace documentaire (OneDrive + bibliothèques SharePoint accessibles). */
export const FILES_READ_SCOPE = 'Files.Read.All'

/**
 * Ce que le jeton STOCKÉ autorise vraiment — dérivé des portées ACCORDÉES, pas
 * de celles qu'on a demandées.
 *
 * Un compte branché avant l'élargissement d'une portée garde sa concession
 * étroite : la capacité correspondante reste éteinte, et l'écran peut proposer
 * de reconnecter au lieu de laisser l'appel échouer ou — pire — rendre une
 * liste vide qui se lit « tu n'as aucun document ».
 */
type MicrosoftCapabilities = {
  /** Envoyer un e-mail (`Mail.Send`). */
  mailSend: boolean
  /** Lire la boîte et y déposer un brouillon (`Mail.ReadWrite`, sinon `Mail.Read`). */
  mailRead: boolean
  /** Déposer un brouillon — exige la ReadWrite, la lecture seule ne suffit pas. */
  mailDraft: boolean
  /** Lire et créer des évènements (`Calendars.ReadWrite`). */
  calendar: boolean
  /** Réponse d'absence (`MailboxSettings.ReadWrite`). */
  mailboxSettings: boolean
  /** Espace documentaire OneDrive + SharePoint (`Files.Read.All`). */
  files: boolean
}

export type MicrosoftStatus = {
  configured: boolean
  connected: boolean
  provider?: 'microsoft'
  accountLabel?: string | null
  connectedAt?: string
  /** Portées réellement accordées, pour que l'écran puisse les montrer. */
  scopes?: string | null
  capabilities?: MicrosoftCapabilities
}

/** Les capacités que porte un jeu de portées accordées. */
export function microsoftCapabilities(scope: string | null | undefined): MicrosoftCapabilities {
  const granted = grantedScopes(scope)
  const mailReadWrite = hasScope(granted, MAIL_READWRITE_SCOPE)
  return {
    mailSend: hasScope(granted, MAIL_SEND_SCOPE),
    mailRead: mailReadWrite || hasScope(granted, 'Mail.Read'),
    mailDraft: mailReadWrite,
    calendar: hasScope(granted, CALENDARS_RW_SCOPE),
    mailboxSettings: hasScope(granted, MAILBOX_SETTINGS_SCOPE),
    files: hasScope(granted, FILES_READ_SCOPE),
  }
}

type CallbackResult = { ok: boolean; reason?: string }

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name)

  constructor(
    @InjectRepository(MicrosoftConnectionEntity)
    private readonly connections: Repository<MicrosoftConnectionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly suppression: SuppressionService,
    // SCOPES-I — l'écart de portées au retour du consentement ; absent, la connexion se fait comme avant.
    @Optional() @Inject(SCOPE_GAP_RECORDER) private readonly scopeGaps?: ScopeGapRecorder,
  ) {}

  private requireConfig(): MicrosoftConfig {
    const config = readMicrosoftConfig()
    if (!config) throw new ServiceUnavailableException('Microsoft integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['MICROSOFT_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Microsoft state signing requires INTERNAL_API_SECRET or MICROSOFT_CLIENT_SECRET')
    return secret
  }

  /** Sign `userId` into a tamper-proof, short-lived OAuth state parameter. */
  private signState(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ u: userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

  /** Verify + decode a state parameter, returning the userId or throwing. */
  private verifyState(state: string): string {
    const [payload, sig] = state.split('.')
    if (!payload || !sig) throw new BadRequestException('Invalid state')
    const expected = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new BadRequestException('Bad state signature')
    let decoded: { u?: string; t?: number }
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
      throw new BadRequestException('Corrupt state')
    }
    if (!decoded.u || typeof decoded.t !== 'number' || Date.now() - decoded.t > STATE_TTL_MS) {
      throw new BadRequestException('Expired state')
    }
    return decoded.u
  }

  /** Connection status for the caller's workspace. Returns early WITHOUT touching
   *  the DB (or making any network call) when Microsoft isn't configured — keeps
   *  the endpoint healthy even if the migration hasn't run in that environment. */
  async getStatus(userId: string): Promise<MicrosoftStatus> {
    if (readMicrosoftConfig() === null) return { configured: false, connected: false }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await findPersonalConnection(this.connections, { userId, workspaceId, provider: PROVIDER })
    if (!conn) return { configured: true, connected: false }
    return {
      configured: true,
      connected: true,
      provider: PROVIDER,
      accountLabel: conn.account_label,
      connectedAt: conn.created_at?.toISOString(),
      scopes: conn.scope,
      capabilities: microsoftCapabilities(conn.scope),
    }
  }

  /**
   * #4546 — Liste TOUTES les connexions Microsoft de l'utilisateur.
   *
   * Microsoft non configuré rend `[]` sans exception, comme `getStatus` — un
   * écran énumérant les boîtes ne doit pas casser parce que l'opérateur n'a
   * pas encore posé `MICROSOFT_CLIENT_ID`.
   */
  async listConnections(
    userId: string,
  ): Promise<
    Array<{ id: string; accountLabel: string | null; connectedAt: string; capabilities: MicrosoftCapabilities }>
  > {
    if (readMicrosoftConfig() === null) return []
    const rows = await findAllPersonalConnections(this.connections, { userId, provider: PROVIDER })
    return rows.map(c => ({
      id: c.id,
      accountLabel: c.account_label,
      connectedAt: c.created_at.toISOString(),
      capabilities: microsoftCapabilities(c.scope),
    }))
  }

  /** Build the Microsoft (Azure AD v2.0) consent URL the browser is redirected to. */
  buildAuthorizeUrl(userId: string): string {
    const config = this.requireConfig()
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      response_mode: 'query',
      scope: config.scopes,
      state: this.signState(userId),
    })
    return `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/authorize?${params.toString()}`
  }

  /** Handle the OAuth redirect: exchange the code, label + persist an encrypted
   *  connection. Never throws to the browser — the controller turns the result
   *  into a redirect with a friendly reason. */
  async handleCallback(code: string, state: string): Promise<CallbackResult> {
    let userId: string
    try {
      userId = this.verifyState(state)
    } catch {
      return { ok: false, reason: 'invalid_state' }
    }
    try {
      const config = this.requireConfig()
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const client = new MicrosoftClient(config)
      const tokens = await client.exchangeCode(code)
      if (!tokens.accessToken) return { ok: false, reason: 'exchange_failed' }
      const profile = await client.me(tokens.accessToken)
      await this.upsertConnection(userId, workspaceId, tokens, profile, config.scopes)
      await this.scopeGaps?.recordGrant('microsoft', userId, workspaceId, tokens.scope)
      return { ok: true }
    } catch (error) {
      this.logger.error('Microsoft OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  private async upsertConnection(
    userId: string,
    workspaceId: string,
    tokens: { accessToken: string; refreshToken: string | null; expiresIn: number; scope: string | null },
    profile: { id: string | null; displayName: string | null; userPrincipalName: string | null; mail: string | null },
    fallbackScope: string,
  ): Promise<void> {
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null
    const label = profile.mail ?? profile.userPrincipalName ?? profile.displayName ?? 'Microsoft 365'
    const externalAccountId = profile.id
    const existing = externalAccountId
      ? await findConnectionByMailbox(this.connections, { userId, provider: PROVIDER, externalAccountId })
      : await findUnnamedConnection(this.connections, { userId, provider: PROVIDER })
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      ...(externalAccountId ? { external_account_id: externalAccountId, account_label: label } : {}),
      access_token_enc: encryptToken(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      expires_at: expiresAt,
      scope: tokens.scope ?? fallbackScope,
    }
    if (existing) {
      await this.connections.update({ id: existing.id }, patch)
    } else {
      await this.connections.insert({ ...patch, scope_type: 'personal' as const })
    }
  }

  /**
   * #4546.5 — la connexion visée. Désignée : celle-là, SI elle est au demandeur (`NotFoundException` sinon — la boîte
   * d'un collègue n'existe pas pour lui). Non désignée : le comportement d'avant.
   */
  private async loadConnection(userId: string, workspaceId: string, connectionId?: string) {
    if (!connectionId) return findPersonalConnection(this.connections, { userId, workspaceId, provider: PROVIDER })
    const own = await this.connections.findOne({ where: { id: connectionId, user_id: userId, provider: PROVIDER } })
    if (!own) throw new NotFoundException('No Microsoft connection')
    return own
  }

  /** Decrypt + refresh (if near expiry) the workspace's Graph access token. */
  private async getValidAccessToken(userId: string, workspaceId: string, connectionId?: string): Promise<string> {
    const conn = await this.loadConnection(userId, workspaceId, connectionId)
    if (!conn) throw new NotFoundException('No Microsoft connection')

    const notExpiring = !conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (notExpiring) return decryptToken(conn.access_token_enc)

    // #1836 — voir `crm.service.ts` : un 503 nu sans `code` se lit « le produit
    // est cassé » alors que la réponse tient en un clic. Libellé générique :
    // cette connexion sert la messagerie, l'agenda ET les documents.
    if (!conn.refresh_token_enc) {
      throw authorizationExpired({ provider: PROVIDER, capabilityLabel: 'cet outil' })
    }
    const client = new MicrosoftClient(this.requireConfig())
    const refreshToken = conn.refresh_token_enc
    const refreshed = await refreshTrackingFailure(
      () => client.refresh(decryptToken(refreshToken)),
      () => this.connections.update({ id: conn.id }, { refresh_failed_at: new Date() }),
    )
    await this.connections.update(
      { id: conn.id },
      {
        access_token_enc: encryptToken(refreshed.accessToken),
        refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
        expires_at: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        refresh_failed_at: null,
        // Les portées sont REMISES À JOUR ici, et c'est nouveau.
        //
        // Elles n'étaient écrites qu'au callback. Une portée RETIRÉE côté
        // fournisseur — l'utilisateur la révoque depuis son compte — restait
        // donc invisible jusqu'à une reconnexion qui n'arriverait jamais :
        // l'écran continuait d'annoncer une capacité morte, et l'échec
        // survenait après le clic. C'est précisément ce que BEL-INT-605 demande
        // de détecter.
        //
        // Une réponse SANS portée ne les efface pas : le fournisseur qui ne les
        // renvoie pas ne dit pas qu'il les a retirées, et prendre son silence
        // pour un retrait éteindrait des capacités qui marchent.
        ...(refreshed.scope ? { scope: refreshed.scope } : {}),
      },
    )
    return refreshed.accessToken
  }

  /**
   * Send a single outreach email through the connected mailbox (Graph sendMail).
   * Guardrails mirror the Resend outreach path (#394): exactly ONE recipient per
   * call, and the workspace suppression list is honoured — an opted-out recipient
   * is refused (403) BEFORE any Graph call is made.
   */
  async sendMail(userId: string, input: SendMailInput & { connectionId?: string }): Promise<{ to: string }> {
    const { connectionId, ...message } = input
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const to = message.to.trim()
    if (await this.suppression.isSuppressed(workspaceId, to)) {
      throw new ForbiddenException('Ce destinataire s’est désabonné et ne peut pas être recontacté.')
    }
    const accessToken = await this.getValidAccessToken(userId, workspaceId, connectionId)
    const client = new MicrosoftClient(this.requireConfig())
    await client.sendMail(accessToken, { ...message, to })
    return { to }
  }

  /**
   * Create an Outlook calendar event on the connected mailbox (Graph events).
   *
   * Un invité qui a demandé à ne plus être contacté est RETIRÉ de la liste avant
   * l'appel : Graph notifie lui-même chaque invité, donc `attendees` est un
   * chemin d'envoi complet — et c'était, avec son jumeau Google, le seul qui ne
   * consultait aucun verdict d'arrêt (T-169). On retire l'invité plutôt que de
   * refuser l'événement : l'organisateur garde sa réunion, et les autres invités
   * ne sont pas punis pour un refus qui n'est pas le leur.
   */
  async createCalendarEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventResult> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new MicrosoftClient(this.requireConfig())
    return client.createEvent(accessToken, { ...input, attendees: await this.contactableAttendees(workspaceId, input) })
  }

  /** Les invités qu'on a le droit d'inviter. Séquentiel : la liste est bornée. */
  private async contactableAttendees(
    workspaceId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEventInput['attendees']> {
    const attendees = input.attendees ?? []
    if (attendees.length === 0) return attendees
    const kept: NonNullable<CalendarEventInput['attendees']> = []
    for (const attendee of attendees) {
      if (await this.suppression.isSuppressed(workspaceId, attendee.email)) {
        this.logger.warn("Invité retiré d'un événement : il a demandé à ne plus être contacté", {
          tags: { 'calendar.workspace': workspaceId },
        })
        continue
      }
      kept.push(attendee)
    }
    return kept
  }

  /**
   * Search the connected Outlook mailbox for traces of a company — the Outlook
   * leg of the zero layer (annexe méthodo p8).
   *
   * Returns `[]` (never throws) in every "we can't honestly answer" case: not
   * configured, not connected, or a token that predates the `Mail.Read` grant.
   * That last one matters — the default scope set ships WITHOUT `Mail.Read`, so
   * an operator opts in by adding it to `MICROSOFT_SCOPES` and users reconnect.
   * Until then this source is a strict no-op, not a 403.
   */
  async searchMailbox(
    userId: string,
    input: { term: string; maxResults?: number },
  ): Promise<{ subject: string; from: string | null; receivedAt: string | null }[]> {
    if (readMicrosoftConfig() === null) return []
    const term = input.term.trim()
    if (!term) return []

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await findPersonalConnection(this.connections, { userId, workspaceId, provider: PROVIDER })
    if (!conn) return []
    // Whole-token match: `Mail.Send` must not be read as granting `Mail.Read`.
    // `Mail.ReadWrite` is a superset and counts — Graph grants read with it, and
    // it is what the default scope set now asks for.
    const granted = new Set((conn.scope ?? '').split(/\s+/).filter(Boolean))
    if (!granted.has(MAIL_READ_SCOPE) && !granted.has(MAIL_READWRITE_SCOPE)) return []

    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new MicrosoftClient(this.requireConfig())
    return client.searchMessages(accessToken, { search: term, top: input.maxResults ?? 10 })
  }

  /**
   * Hand a ready-to-use Graph client + token to the capability modules
   * (`mailbox/`, `agenda/`). Same reasoning as the Google side: token
   * decryption, refresh and workspace scoping stay in ONE place, and the
   * capability modules do not grow a second copy of them.
   */
  async authorize(
    userId: string,
    connectionId?: string,
  ): Promise<{ client: MicrosoftClient; accessToken: string; workspaceId: string }> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId, connectionId)
    return { client: new MicrosoftClient(config), accessToken, workspaceId }
  }

  /** Is Microsoft configured on this server at all? */
  isConfigured(): boolean {
    return readMicrosoftConfig() !== null
  }

  /** The scopes the stored token ACTUALLY carries, whole-token matched. */
  async grantedScopes(userId: string): Promise<Set<string>> {
    if (readMicrosoftConfig() === null) return new Set()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await findPersonalConnection(this.connections, { userId, workspaceId, provider: PROVIDER })
    if (!conn) return new Set()
    return grantedScopes(conn.scope)
  }

  /**
   * Cherche dans l'espace documentaire (OneDrive / SharePoint).
   *
   * Rend `[]` — jamais une exception — quand la portée `Files.Read.All` manque :
   * un utilisateur connecté avant l'ajout de cette portée garde sa concession
   * plus étroite, et l'écran doit proposer de reconnecter, pas afficher un 403.
   */
  async searchFiles(
    userId: string,
    input: { query: string; maxResults?: number },
  ): Promise<
    Array<{ id: string; name: string; mimeType: string | null; modifiedAt: string | null; webUrl: string | null }>
  > {
    if (readMicrosoftConfig() === null) return []
    const term = input.query.trim()
    if (!term) return []

    const granted = await this.grantedScopes(userId)
    // `hasScope` et non `granted.has` : Microsoft rend `Files.Read.All` sur
    // l'écran de consentement et `files.read.all` dans la réponse du jeton. La
    // comparaison sensible à la casse laissait passer la garde du contrôleur
    // (qui, elle, utilise `hasScope`) puis rendait `[]` ici — c'est-à-dire
    // exactement la panne du 16/08, avec un correctif au-dessus qui n'y pouvait
    // rien.
    if (!hasScope(granted, FILES_READ_SCOPE)) return []

    const { client, accessToken } = await this.authorize(userId)
    return client.searchFiles(accessToken, { query: term, top: input.maxResults ?? 20 })
  }

  /**
   * Récupère un document pour l'attacher à un brouillon.
   *
   * Contrairement à Google, aucun format n'est converti : Microsoft ne stocke
   * pas de format « natif » illisible hors de son éditeur — un `.docx` est un
   * `.docx`, et le destinataire l'ouvre.
   */
  async fetchFileForAttachment(
    userId: string,
    itemId: string,
  ): Promise<{ filename: string; mimeType: string; contentBase64: string } | null> {
    if (readMicrosoftConfig() === null) return null
    const granted = await this.grantedScopes(userId)
    if (!granted.has(FILES_READ_SCOPE)) return null

    const { client, accessToken } = await this.authorize(userId)
    const [match] = await client.searchFiles(accessToken, { query: itemId, top: 1 })
    const contentBase64 = await client.downloadFileBase64(accessToken, itemId)
    return {
      filename: match?.name ?? 'document',
      mimeType: match?.mimeType ?? 'application/octet-stream',
      contentBase64,
    }
  }

  /**
   * Déconnecte SA connexion, et rien que la sienne.
   *
   * La suppression portait sur l'ESPACE : dans une équipe où deux personnes ont
   * connecté leur compte, elle emportait la ligne d'un collègue.
   *
   * ⚠️ Pas de révocation côté fournisseur, et ce n'est pas un oubli : Microsoft
   * Graph n'expose AUCUN point de révocation par application. Le seul geste
   * approchant (`revokeSignInSessions`) déconnecte l'utilisateur de TOUTES ses
   * applications et demande un droit d'administrateur du tenant — le remède
   * serait pire que le mal. L'écran de déconnexion le DIT plutôt que de
   * promettre une révocation qui n'a pas lieu.
   *
   * #4546 — `connectionId` cible UNE connexion parmi plusieurs ; omis, la plus
   * ancienne (comportement historique à une seule boîte).
   */
  async disconnect(userId: string, connectionId?: string): Promise<void> {
    const target = await resolveDisconnectTarget(this.connections, { userId, provider: PROVIDER, connectionId })
    if (!target) return
    await this.connections.delete({ id: target.id })
  }
}

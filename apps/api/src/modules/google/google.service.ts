import { SCOPE_GAP_RECORDER, type ScopeGapRecorder } from '../connector-scope-gaps/scope-gap-recorder.port'
import {
  findPersonalConnection,
  findConnectionByMailbox,
  findAllPersonalConnections,
  findUnnamedConnection,
  resolveDisconnectTarget,
} from '../../common/util/personal-connection'
import {
  BadRequestException,
  ConflictException,
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
import {
  authorizationExpired,
  classifyProviderError,
  connectorFailure,
  connectorMessage,
} from '../../common/connector-error'
import { mapWithConcurrencySettled, retryOnThrottle } from '../../common/util/concurrency'
import { refreshTrackingFailure } from '../../common/util/oauth-refresh'
import { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
// Reuse the CRM module's AES-256-GCM token helper — same "encrypt OAuth secrets
// at rest" need, same key derivation (CRM_TOKEN_ENC_KEY → INTERNAL_API_SECRET → …).
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { IaClient, type IaEnvelope } from '../ia/ia.client'
import { SuppressionService } from '../mailer/suppression.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { dropSelfAttendees } from '../../common/util/self-invite'
import type { OAuthAccessLevel } from '@bellum/contracts'
import {
  GOOGLE_SCOPE,
  googleAccessLevelOf,
  googleScopesForLevel,
  readGoogleConfig,
  type GoogleConfig,
} from './google-config'
import {
  encodeGmailRaw,
  GoogleClient,
  type CalendarEventSummary,
  type CreatedCalendarEvent,
  type CreatedDraft,
  type CreatedSpreadsheet,
  type DriveFilePage,
  type GmailMessageSummary,
  type GoogleTokens,
} from './google.client'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short enough
 *  to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
/** Refresh the access token if it expires within this window. */
const REFRESH_SKEW_MS = 60 * 1000
const PROVIDER = 'google' as const

const DEFAULT_CALENDAR_ID = 'primary'
/** A relance reminder with no explicit end lasts this long. */
const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const PDF_MIME = 'application/pdf'
const TEXT_EXPORT_MIME = 'text/plain'

// The scope each capability needs — read from google-config (ONE place) to report
// which capabilities the granted token actually unlocks. A token minted before a
// scope was added simply lacks it here, so the derived capability stays false and
// the UI greys the feature behind a "reconnect to activate" CTA (no silent regression).
const DRIVE_SCOPE = GOOGLE_SCOPE.driveReadonly
const CAPABILITY_SCOPE = {
  calendar: GOOGLE_SCOPE.calendarEvents,
  calendarRead: GOOGLE_SCOPE.calendarReadonly,
  gmail: GOOGLE_SCOPE.gmailSend,
  gmailRead: GOOGLE_SCOPE.gmailReadonly,
  gmailDraft: GOOGLE_SCOPE.gmailCompose,
  drive: GOOGLE_SCOPE.driveReadonly,
  sheets: GOOGLE_SCOPE.spreadsheets,
  gmailSettings: GOOGLE_SCOPE.gmailSettingsBasic,
  gmailLabels: GOOGLE_SCOPE.gmailLabels,
  gmailModify: GOOGLE_SCOPE.gmailModify,
} as const

/**
 * #2078.22 — les capacités qui ÉCRIVENT, et ce que l'écran dit quand elles manquent.
 *
 * Chaque geste d'écriture passe par {@link GoogleService.requireWriteAccess}
 * (ou `authorizeWrite`) avant tout appel réseau : une connexion en lecture seule
 * est refusée avec la portée NOMMÉE, jamais tentée puis rejetée par le
 * fournisseur. La garde `architecture/google-writes-check-granted-level.spec.ts`
 * fait rougir la CI si une écriture l'oublie.
 *
 * Le libellé nomme la CAPACITÉ, jamais l'éditeur. `gmailModify` a son propre
 * message : c'est une portée opt-in de l'opérateur, que le niveau « lecture +
 * écriture » n'accorde pas — proposer l'élévation serait promettre à vide.
 */
const WRITE_CAPABILITIES = {
  calendar: { capability: 'calendar', label: 'ton agenda' },
  gmail: { capability: 'mail', label: 'ta messagerie' },
  gmailDraft: { capability: 'mail', label: 'ta messagerie' },
  sheets: { capability: 'documents', label: 'tes feuilles de calcul' },
  gmailSettings: { capability: 'mail', label: 'les réglages de ta messagerie' },
  gmailLabels: { capability: 'mail', label: 'les libellés de ta messagerie' },
  gmailModify: { capability: 'mail', label: 'ta messagerie' },
} as const
type GoogleWriteCapability = keyof typeof WRITE_CAPABILITIES

/**
 * #2078.22.b — un niveau INCONNU (portée vide, ou que le serveur ne reconnaît
 * pas) n'est PAS « lecture seule » : on ignore ce qui a été réellement
 * accordé, la phrase ne l'affirme donc jamais. Elle dit ce qu'on sait —
 * l'écriture n'est pas CONFIRMÉE — plutôt qu'un « lecture seule » qui mène à
 * une impasse : la carte Intégrations ne propose alors « Autoriser
 * l'écriture » que sur un niveau `read`, jamais sur un niveau `null`.
 */
function writeAccessMessage(capability: GoogleWriteCapability, accessLevel: OAuthAccessLevel | null): string {
  if (capability === 'gmailModify') {
    return 'Le classement des messages demande une autorisation supplémentaire de ta messagerie, qui n’est pas accordée sur cet espace.'
  }
  const label = WRITE_CAPABILITIES[capability].label
  if (accessLevel === 'read') {
    return `Ta connexion est en lecture seule : écrire dans ${label} demande l’accès en écriture. Autorise l’écriture depuis Intégrations — ta connexion actuelle est conservée.`
  }
  return `L’accès en écriture à ${label} n’est pas confirmé. Autorise l’écriture depuis Intégrations — ta connexion actuelle est conservée.`
}

const DEFAULT_CALENDAR_LOOKAHEAD = 20
const DEFAULT_GMAIL_THREADS = 10
/** Lectures Gmail simultanées par utilisateur — voir `GoogleMailBackend`. */
const GMAIL_READ_CONCURRENCY = 5

type GoogleCapabilities = {
  /** Create calendar events (calendar.events). */
  calendar: boolean
  /** Read upcoming events for the meeting-prep brief (calendar.readonly). */
  calendarRead: boolean
  /** Send mail (gmail.send). */
  gmail: boolean
  /** Read message metadata / recent exchanges (gmail.readonly). */
  gmailRead: boolean
  /** Compose drafts (gmail.compose). */
  gmailDraft: boolean
  /** List + ingest Drive docs (drive.readonly). */
  drive: boolean
  /** Export a spreadsheet (spreadsheets). */
  sheets: boolean
  /** Read/write the out-of-office responder and read the real signature
   *  (gmail.settings.basic). */
  gmailSettings: boolean
  /** List and create labels (gmail.labels). */
  gmailLabels: boolean
  /**
   * APPLY a label and archive a message (`gmail.modify`).
   *
   * A RESTRICTED scope: granting it also grants deleting mail, and it comes with
   * an annual security review. It is therefore never in the default set — the
   * operator adds it to `GOOGLE_SCOPES` once Google has validated the app, and
   * users reconnect. Until then the capability stays false and the screen says
   * so, rather than failing at click time.
   */
  gmailModify: boolean
}

export type GoogleStatus = {
  configured: boolean
  connected: boolean
  provider?: 'google'
  accountLabel?: string | null
  connectedAt?: string
  scopes?: string | null
  capabilities?: GoogleCapabilities
  /**
   * #2078.23 — le niveau ACCORDÉ (lecture ; lecture + écriture), dérivé des
   * portées rendues par le fournisseur. `null` quand on les ignore.
   */
  accessLevel?: OAuthAccessLevel | null
}

type CreateCalendarEventInput = {
  summary: string
  startDateTime: string
  endDateTime?: string
  description?: string
  attendees?: string[]
  link?: string
  calendarId?: string
  /** Ask Google for a Meet link (default: yes). */
  addConferencing?: boolean
  /** Popup reminder, in minutes before the start. `null`/absent = calendar default. */
  reminderMinutes?: number | null
  /** #2101.26 — a single RRULE line (RFC 5545), already validated by `agendaEventDraftSchema`. */
  recurrence?: string
}

/** #3699.6 — le message RFC 5322 d'un envoi/brouillon, pièces réelles comprises. */
function gmailRawOf(input: SendGmailInput): string {
  return encodeGmailRaw({
    to: input.to,
    subject: input.subject,
    body: input.body,
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map(attachment => ({
            filename: attachment.fileName,
            mimeType: attachment.contentType,
            contentBase64: attachment.contentBase64,
          })),
        }
      : {}),
  })
}

type SendGmailInput = {
  to: string
  subject: string
  body: string
  /** #3699.6 — pièces jointes RÉELLES (octets en base64), encodées en multipart. */
  attachments?: readonly { fileName: string; contentType: string; contentBase64: string }[]
  /** #4546.5 — l'expéditeur DÉSIGNÉ parmi SES boîtes ; absent = la boîte par défaut d'avant. */
  connectionId?: string
}

type CallbackResult = { ok: boolean; reason?: string }

function capabilitiesFromScope(scope: string | null | undefined): GoogleCapabilities {
  // Match whole space-separated scope tokens — `calendar.events` must not be seen
  // as granting `calendar.readonly` (substring), and vice-versa.
  const granted = new Set((scope ?? '').split(/\s+/).filter(Boolean))
  return {
    calendar: granted.has(CAPABILITY_SCOPE.calendar),
    calendarRead: granted.has(CAPABILITY_SCOPE.calendarRead),
    gmail: granted.has(CAPABILITY_SCOPE.gmail),
    gmailRead: granted.has(CAPABILITY_SCOPE.gmailRead),
    gmailDraft: granted.has(CAPABILITY_SCOPE.gmailDraft),
    drive: granted.has(CAPABILITY_SCOPE.drive),
    sheets: granted.has(CAPABILITY_SCOPE.sheets),
    gmailSettings: granted.has(CAPABILITY_SCOPE.gmailSettings),
    gmailLabels: granted.has(CAPABILITY_SCOPE.gmailLabels),
    gmailModify: granted.has(CAPABILITY_SCOPE.gmailModify),
  }
}

/**
 * #2078.22.c — durcissement (revue sécurité lot K) : les portées RENDUES par
 * Google sont croisées avec la liste CONFIGURÉE (`config.scopes` — le
 * sur-ensemble des deux niveaux, voir `googleScopesForLevel`) avant tout
 * enregistrement. Un utilisateur qui modifie l'URL de consentement pour
 * demander une portée que l'opérateur n'a jamais ajoutée à `GOOGLE_SCOPES`
 * (ex. `gmail.modify`) ne la voit jamais stockée, même si Google la lui
 * accorde — le `state` ne porte pas le niveau demandé (inchangé à dessein),
 * donc la seule liste vérifiable ici est celle que l'opérateur a configurée.
 */
function withinConfiguredScopes(scope: string | null | undefined, config: GoogleConfig): string | null {
  const granted = (scope ?? '').split(/\s+/).filter(Boolean)
  const allowed = new Set(config.scopes.split(/\s+/).filter(Boolean))
  const kept = granted.filter(token => allowed.has(token))
  return kept.length > 0 ? kept.join(' ') : null
}

/** Extract the registrable domain (`acme.com`) from a URL, email or bare host. */
function extractDomain(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) {
    const host = trimmed.split('@').pop()?.trim().toLowerCase()
    return host || null
  }
  try {
    const url = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return trimmed.replace(/^www\./, '').toLowerCase() || null
  }
}

/** Escape a value for safe interpolation inside a single-quoted Drive query literal. */
function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name)

  constructor(
    @InjectRepository(GoogleConnectionEntity)
    private readonly connections: Repository<GoogleConnectionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly ia: IaClient,
    private readonly suppression: SuppressionService,
    // SCOPES-I — l'écart de portées au retour du consentement ; absent, la connexion se fait comme avant.
    @Optional() @Inject(SCOPE_GAP_RECORDER) private readonly scopeGaps?: ScopeGapRecorder,
  ) {}

  private requireConfig(): GoogleConfig {
    const config = readGoogleConfig()
    if (!config) throw new ServiceUnavailableException('Google integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['GOOGLE_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Google state signing requires INTERNAL_API_SECRET or GOOGLE_CLIENT_SECRET')
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
   *  the DB when Google isn't configured — the feature is off, so no 500 spam and
   *  no dependency on the migration having run in that environment. */
  async getStatus(userId: string, connectionId?: string): Promise<GoogleStatus> {
    if (readGoogleConfig() === null) return { configured: false, connected: false }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.loadConnection(userId, workspaceId, connectionId)
    if (!conn) return { configured: true, connected: false }
    return {
      configured: true,
      connected: true,
      provider: PROVIDER,
      accountLabel: conn.account_label,
      connectedAt: conn.created_at?.toISOString(),
      scopes: conn.scope,
      capabilities: capabilitiesFromScope(conn.scope),
      accessLevel: googleAccessLevelOf(conn.scope),
    }
  }

  /**
   * Build the Google consent URL the browser is redirected to. `access_type=offline`
   * + `prompt=consent` guarantee a refresh token so we can act when the user is away.
   *
   * #2078.22 / #2078.23 — le NIVEAU choisit la liste de portées. Le `state` ne
   * change pas et ne porte pas le niveau : le callback enregistre ce que le
   * fournisseur a RENDU, pas ce qu'on a demandé, donc il n'a pas besoin de le
   * connaître — et rien de ce qui voyage dans l'URL ne peut élever un accès.
   *
   * `include_granted_scopes=true` (consentement incrémental) n'accompagne QUE
   * l'élévation : il fait couvrir au nouveau jeton les accès déjà accordés, ce
   * qui est exactement ce qu'on veut en montant d'un niveau. Sur une demande de
   * LECTURE, il rendrait au jeton une ancienne concession d'écriture restée
   * chez le fournisseur (révocation manquée à la déconnexion) : élévation
   * implicite. Sans lui, le jeton ne couvre que les portées demandées.
   */
  buildAuthorizeUrl(userId: string, level: OAuthAccessLevel): string {
    const config = this.requireConfig()
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: googleScopesForLevel(config, level),
      access_type: 'offline',
      prompt: 'consent',
      ...(level === 'read_write' ? { include_granted_scopes: 'true' } : {}),
      state: this.signState(userId),
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /** Handle the OAuth redirect: exchange the code, persist an encrypted
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
      const client = new GoogleClient(config)
      const tokens = await client.exchangeCode(code)
      if (!tokens.accessToken) return { ok: false, reason: 'exchange_failed' }
      // #4546 — récupérer l'email de la boîte pour identifier la connexion
      // Sans portée de lecture Gmail le profil est refusé : la connexion se fait quand même, sans nom.
      const profile = await client.getProfile(tokens.accessToken).catch(() => ({ emailAddress: null }))
      await this.upsertConnection(userId, workspaceId, tokens, profile, config)
      await this.scopeGaps?.recordGrant('google', userId, workspaceId, tokens.scope)
      return { ok: true }
    } catch (error) {
      this.logger.error('Google OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  /**
   * #4546 — Plusieurs boîtes par commercial.
   *
   * Cherche une connexion existante PAR SON EMAIL (external_account_id) :
   * - Même email → UPDATE (reconnecter la même boîte)
   * - Email différent ou absent → INSERT (nouvelle boîte)
   *
   * Les nouvelles connexions portent `scope_type = 'personal'` (le commercial
   * seul voit). Les connexions existantes avec `scope_type = 'inherited_shared'`
   * (posées avant le 25/10/2026) gardent leur comportement historique.
   */
  private async upsertConnection(
    userId: string,
    workspaceId: string,
    tokens: GoogleTokens,
    profile: { emailAddress: string | null },
    config: GoogleConfig,
  ): Promise<void> {
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null
    const mailboxId = profile.emailAddress

    // Par adresse si on la connaît ; sinon on ne met à jour qu'une boîte déjà SANS nom,
    // jamais une boîte nommée (la seconde n'écrase pas la première).
    const existing = mailboxId
      ? await findConnectionByMailbox(this.connections, { userId, provider: PROVIDER, externalAccountId: mailboxId })
      : await findUnnamedConnection(this.connections, { userId, provider: PROVIDER })

    // Keep an existing refresh token if Google omits one on re-consent.
    const refreshTokenEnc = tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : (existing?.refresh_token_enc ?? null)
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      ...(mailboxId ? { external_account_id: mailboxId, account_label: mailboxId } : {}),
      access_token_enc: encryptToken(tokens.accessToken),
      refresh_token_enc: refreshTokenEnc,
      expires_at: expiresAt,
      // #2078.22 — les portées que Google a RENDUES, et elles seules. Le repli
      // sur la liste DEMANDÉE est retiré : l'écran de consentement laisse
      // décocher une case, et le niveau demandé n'est plus unique. Un
      // fournisseur muet ne se voit prêter aucune portée — les capacités
      // restent éteintes, ce qui est la seule réponse vraie.
      // #2078.22.c — et une portée que Google rend mais que l'opérateur n'a
      // JAMAIS configurée (URL de consentement modifiée) n'est pas stockée
      // non plus.
      scope: withinConfiguredScopes(tokens.scope, config),
    }
    if (existing) {
      await this.connections.update({ id: existing.id }, patch)
    } else {
      // Nouvelle connexion → scope_type = 'personal'
      await this.connections.insert({ ...patch, scope_type: 'personal' })
    }
  }

  /** Decrypt + refresh (if near expiry) the workspace's access token. */
  /**
   * #4546.5 — la connexion visée. Désignée : celle-là, SI elle est au demandeur (`NotFoundException` sinon — la boîte
   * d'un collègue n'existe pas pour lui, on ne dit pas qu'elle existe). Non désignée : le comportement d'avant.
   */
  private async loadConnection(userId: string, workspaceId: string, connectionId?: string) {
    if (!connectionId) return findPersonalConnection(this.connections, { userId, workspaceId, provider: PROVIDER })
    const own = await this.connections.findOne({ where: { id: connectionId, user_id: userId, provider: PROVIDER } })
    if (!own) throw new NotFoundException('No Google connection')
    return own
  }

  private async getValidAccessToken(userId: string, workspaceId: string, connectionId?: string): Promise<string> {
    const conn = await this.loadConnection(userId, workspaceId, connectionId)
    if (!conn) throw new NotFoundException('No Google connection')

    const notExpiring = !conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (notExpiring) return decryptToken(conn.access_token_enc)

    // #1836 — même défaut qu'au CRM, même correction : un 503 NU (phrase de
    // développeur, en anglais, sans `code`) se rend à l'écran en « panne du
    // produit », et l'écran retire alors le chemin de réparation. Le libellé
    // reste générique parce que cette connexion sert TROIS capacités
    // (documents, agenda, messagerie) et qu'on ne sait pas, ici, laquelle
    // appelait — mieux vaut « cet outil » qu'une capacité devinée.
    if (!conn.refresh_token_enc) {
      throw authorizationExpired({ provider: PROVIDER, capabilityLabel: 'cet outil' })
    }
    const client = new GoogleClient(this.requireConfig())
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
   * Classe un message : applique une étiquette, et l'archive si demandé.
   *
   * §5.1 n°29 et §13.1 n°7 des méta-analyses — « tague les emails par type »,
   * « classe tous les emails par priorité ». La capacité est gardée par la
   * portée RESTREINTE `gmail.modify` : sans elle, on refuse avec un message
   * explicite plutôt que de laisser Google rendre un 403 incompréhensible.
   *
   * L'étiquette est créée si elle n'existe pas — mais on relit d'abord la
   * liste : Gmail refuse un doublon de nom, et un utilisateur qui classe cent
   * messages ne doit pas voir cent erreurs.
   *
   * Archiver retire `INBOX`. Ce n'est PAS une suppression, et le client n'en a
   * pas les moyens : un outil qui range une boîte ne doit pas pouvoir la vider.
   */
  async classifyMessage(
    userId: string,
    input: { messageId: string; labelName: string; archive?: boolean },
  ): Promise<{ id: string; labelIds: string[] }> {
    // #2078.22 — le même contrôle que toute écriture ; `gmail.modify` garde son
    // propre message (portée opt-in de l'opérateur, pas une élévation).
    const { client, accessToken } = await this.authorizeWrite(userId, 'gmailModify')

    const existing = await client.listLabels(accessToken)
    const match = existing.find(label => label.name.toLowerCase() === input.labelName.trim().toLowerCase())
    const label = match ?? (await client.createLabel(accessToken, input.labelName.trim()))

    return client.modifyMessage(accessToken, input.messageId, {
      addLabelIds: [label.id],
      archive: input.archive === true,
    })
  }

  /**
   * Hand a ready-to-use client + token to the capability modules (`mailbox/`,
   * `agenda/`) that speak to Google on the user's behalf.
   *
   * Those modules need a dozen Gmail and Calendar calls; mirroring each one as a
   * `GoogleService` wrapper would turn this class into a second, drifting copy
   * of the client. Token decryption, refresh and workspace scoping — the parts
   * that must never be duplicated — stay right here.
   */
  async authorize(
    userId: string,
    connectionId?: string,
  ): Promise<{ client: GoogleClient; accessToken: string; workspaceId: string }> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId, connectionId)
    return { client: new GoogleClient(config), accessToken, workspaceId }
  }

  /**
   * #2078.22 — le contrôle que CHAQUE écriture passe avant tout appel réseau.
   *
   * Il lit les portées stockées avec le jeton — celles que le fournisseur a
   * RENDUES au consentement ou au dernier rafraîchissement — jamais celles
   * demandées. Sans connexion : `not_connected`. Connexion en lecture seule, ou
   * case décochée au consentement : `scope_missing` avec LA portée qui manque,
   * et un message qui propose l'élévation (#2078.23) plutôt qu'une écriture
   * tentée qui échouerait chez le fournisseur.
   */
  async requireWriteAccess(userId: string, capability: GoogleWriteCapability, connectionId?: string): Promise<void> {
    const status = await this.getStatus(userId, connectionId)
    const { capability: family, label } = WRITE_CAPABILITIES[capability]
    if (!status.connected) {
      throw connectorFailure({
        code: 'not_connected',
        provider: PROVIDER,
        capability: family,
        message: connectorMessage('not_connected', label),
      })
    }
    if (status.capabilities?.[capability]) return
    throw connectorFailure({
      code: 'scope_missing',
      provider: PROVIDER,
      capability: family,
      scopes: [CAPABILITY_SCOPE[capability]],
      message: writeAccessMessage(capability, status.accessLevel ?? null),
    })
  }

  /**
   * {@link authorize} pour un module qui va ÉCRIRE (`mailbox/` : brouillon dans
   * un fil, réponse d'absence). Le client n'est remis qu'après le contrôle du
   * niveau accordé — #2078.22.
   */
  async authorizeWrite(
    userId: string,
    capability: GoogleWriteCapability,
    connectionId?: string,
  ): Promise<{ client: GoogleClient; accessToken: string; workspaceId: string }> {
    await this.requireWriteAccess(userId, capability, connectionId)
    return this.authorize(userId, connectionId)
  }

  /** Is Google configured on this server at all? Lets a capability module report
   *  "not connected" instead of throwing when the integration is simply off. */
  isConfigured(): boolean {
    return readGoogleConfig() !== null
  }

  /**
   * Create a Calendar event / relance reminder on the user's calendar. An absent
   * `endDateTime` defaults to start + 30 min; a Bellum `link` is appended to the
   * description so the event points back at the account/contact.
   *
   * Two guardrails from the field reports are enforced HERE rather than left to
   * each caller. n°15: the organizer is never added to `attendees` — they own
   * the event, and listing them makes their own agenda show an invitation they
   * can never usefully answer. n°16: a Meet link is requested by default,
   * because an invitation without a join link costs a mail round-trip every
   * single time.
   */
  /**
   * Déplacer un rendez-vous existant, en choisissant de prévenir ou non.
   *
   * Le calendrier visé est celui par défaut : c'est celui dans lequel
   * `createCalendarEvent` écrit, et un déplacement doit se faire là où
   * l'évènement a été créé.
   */
  async rescheduleCalendarEvent(
    userId: string,
    input: { eventId: string; startsAt: string; endsAt: string; notifyGuests: boolean },
  ): Promise<{ id: string; startsAt: string; endsAt: string }> {
    this.requireConfig()
    // #2078.22 — déplacer un évènement est une écriture : niveau accordé d'abord.
    await this.requireWriteAccess(userId, 'calendar')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())
    return client.patchEventSchedule(accessToken, DEFAULT_CALENDAR_ID, input.eventId, {
      start: input.startsAt,
      end: input.endsAt,
      notifyGuests: input.notifyGuests,
    })
  }

  async createCalendarEvent(userId: string, input: CreateCalendarEventInput): Promise<CreatedCalendarEvent> {
    this.requireConfig()
    // #2078.22 — créer un évènement est une écriture : niveau accordé d'abord.
    await this.requireWriteAccess(userId, 'calendar')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)

    const end =
      input.endDateTime ?? new Date(new Date(input.startDateTime).getTime() + DEFAULT_EVENT_DURATION_MS).toISOString()
    const description = [input.description, input.link ? `Bellum : ${input.link}` : undefined]
      .filter(Boolean)
      .join('\n\n')

    const client = new GoogleClient(this.requireConfig())
    const ownAddress = await this.mailboxAddress(accessToken)
    const attendees = await this.contactableAttendees(workspaceId, dropSelfAttendees(input.attendees ?? [], ownAddress))

    return client.createEvent(accessToken, input.calendarId?.trim() || DEFAULT_CALENDAR_ID, {
      summary: input.summary,
      ...(description ? { description } : {}),
      start: { dateTime: input.startDateTime },
      end: { dateTime: end },
      ...(attendees.length ? { attendees: attendees.map(email => ({ email })) } : {}),
      reminders:
        input.reminderMinutes == null
          ? { useDefault: true }
          : { useDefault: false, overrides: [{ method: 'popup', minutes: input.reminderMinutes }] },
      ...(input.recurrence ? { recurrence: [input.recurrence] } : {}),
      ...(input.addConferencing === false
        ? {}
        : {
            conferenceData: {
              createRequest: {
                // Idempotence: same event, same request id ⇒ Google reuses the
                // conference instead of minting a second one on a retry.
                requestId: `bellum-${randomBytes(8).toString('hex')}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' as const },
              },
            },
          }),
    })
  }

  /**
   * Annuler un évènement du calendrier par défaut. #2770.52 — même garde-fou
   * que les deux écritures ci-dessus (`requireWriteAccess`) : annuler est une
   * écriture, elle exige le même niveau accordé que créer ou déplacer.
   */
  async deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
    this.requireConfig()
    await this.requireWriteAccess(userId, 'calendar')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())
    await client.deleteEvent(accessToken, DEFAULT_CALENDAR_ID, eventId)
  }

  /**
   * Les invités qu'on a le droit d'inviter — les autres sont RETIRÉS.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE TROU QUE CECI BOUCHE (T-169, mesuré le 30/08/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * Une invitation d'agenda EST un message : le fournisseur l'envoie lui-même à
   * chaque invité, sans que Bellum ne compose quoi que ce soit. `attendees`
   * était donc un chemin d'envoi complet vers un contact, et le SEUL qui ne
   * consultait aucun verdict d'arrêt — pendant que les huit chemins d'e-mail le
   * consultaient tous. Un désabonné pouvait recevoir une invitation le jour
   * même où son adresse était refusée par le formulaire d'envoi.
   *
   * On RETIRE l'invité plutôt que de refuser l'événement : l'organisateur a le
   * droit de tenir sa réunion, et faire échouer tout le rendez-vous parce qu'un
   * invité s'est désabonné punirait les autres. L'écart est journalisé — un
   * invité qui disparaît sans trace serait pire que le problème.
   *
   * Séquentiel et non `Promise.all` : la liste est bornée par le DTO et un
   * fan-out sur la liste de suppression n'achèterait rien de mesurable.
   */
  private async contactableAttendees(workspaceId: string | null, attendees: string[]): Promise<string[]> {
    if (!workspaceId || attendees.length === 0) return attendees
    const kept: string[] = []
    for (const attendee of attendees) {
      if (await this.suppression.isSuppressed(workspaceId, attendee)) {
        this.logger.warn("Invité retiré d'un événement : il a demandé à ne plus être contacté", {
          tags: { 'calendar.workspace': workspaceId },
        })
        continue
      }
      kept.push(attendee)
    }
    return kept
  }

  /** The connected mailbox's address; null when Gmail scopes are missing. */
  private async mailboxAddress(accessToken: string): Promise<string | null> {
    try {
      const client = new GoogleClient(this.requireConfig())
      const profile = await client.getProfile(accessToken)
      return profile.emailAddress
    } catch (error) {
      // Not fatal: without the address we simply cannot filter the organizer out,
      // and the event is still created. Logged so the gap is visible.
      this.logger.warn(`Google profile lookup failed: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Send a single email from the user's connected Gmail mailbox. Guardrails,
   * aligned with the outreach mailer (PR #394): ONE recipient per call (enforced
   * by the DTO) and a workspace opt-out check BEFORE any network call — a
   * suppressed recipient is rejected, never contacted.
   */
  async sendGmail(userId: string, input: SendGmailInput): Promise<{ id: string; threadId: string | null }> {
    this.requireConfig()
    // #2078.22 — envoyer est une écriture : niveau accordé d'abord.
    await this.requireWriteAccess(userId, 'gmail', input.connectionId)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (workspaceId && (await this.suppression.isSuppressed(workspaceId, input.to))) {
      throw new ConflictException('Ce destinataire s’est désabonné et ne peut pas être recontacté.')
    }
    const accessToken = await this.getValidAccessToken(userId, workspaceId, input.connectionId)
    const raw = gmailRawOf(input)
    const client = new GoogleClient(this.requireConfig())
    return client.sendMessage(accessToken, raw)
  }

  /**
   * L'accès aux documents est-il RÉELLEMENT accordé, et sinon on le dit.
   *
   * C'était le trou de la recette du 16/08 : `GET /google/drive/search` n'a
   * jamais reçu le correctif posé ce jour-là sur le CRM et sur l'espace
   * documentaire Microsoft. Sans la portée, Drive rendait un 403, que le client
   * transformait en `Error` nue, que le filtre global transformait en **500
   * "Internal server error"** — c'est-à-dire en « va chercher un bug dans le
   * code » alors que la réponse tient en un geste : reconnecter.
   */
  private async requireDriveCapability(userId: string): Promise<void> {
    const status = await this.getStatus(userId)
    if (!status.connected) {
      throw connectorFailure({
        code: 'not_connected',
        provider: PROVIDER,
        capability: 'documents',
        message: connectorMessage('not_connected', 'ton espace documentaire'),
      })
    }
    if (status.capabilities?.drive) return
    throw connectorFailure({
      code: 'scope_missing',
      provider: PROVIDER,
      capability: 'documents',
      scopes: [DRIVE_SCOPE],
      message: connectorMessage('scope_missing', 'tes documents'),
    })
  }

  /**
   * Traduit l'échec BRUT du fournisseur en refus lisible.
   *
   * Le client perd le statut HTTP dès qu'il lit le corps d'erreur — il ne reste
   * qu'un message. C'est justement ce message qui porte la vérité (« has not
   * been used in project », « insufficient permission »), et le relayer coûte
   * moins que de le jeter.
   */
  private driveFailure(error: unknown): never {
    const code = classifyProviderError(error)
    throw connectorFailure({
      code,
      provider: PROVIDER,
      capability: 'documents',
      scopes: code === 'scope_missing' ? [DRIVE_SCOPE] : [],
      message: connectorMessage(code, 'ton espace documentaire'),
    })
  }

  /** List the user's Drive Google Docs + PDFs (paginated). `search` filters on name. */
  async listDriveFiles(
    userId: string,
    opts: { pageSize?: number; pageToken?: string; search?: string },
  ): Promise<DriveFilePage> {
    this.requireConfig()
    await this.requireDriveCapability(userId)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)

    const filters = [`(mimeType='${GOOGLE_DOC_MIME}' or mimeType='${PDF_MIME}')`, 'trashed=false']
    if (opts.search) filters.push(`name contains '${escapeDriveQuery(opts.search)}'`)
    const client = new GoogleClient(this.requireConfig())
    try {
      return await client.listFiles(accessToken, {
        q: filters.join(' and '),
        pageSize: opts.pageSize ?? 20,
        pageToken: opts.pageToken,
      })
    } catch (error) {
      this.driveFailure(error)
    }
  }

  /**
   * Ingest a selected Drive document into the EXISTING RAG store (reuses the IA
   * `/rag/ingest` pipeline — no new ingestion). Google Docs are exported to plain
   * text; PDFs are downloaded and handed off as base64 for server-side extraction
   * (pypdf), the same path the Knowledge PDF upload uses. Other types are rejected.
   */
  async ingestDriveFile(userId: string, fileId: string): Promise<IaEnvelope> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())

    const meta = await client.getFileMetadata(accessToken, fileId)
    const title = meta.name?.trim() || 'Document Google Drive'

    if (meta.mimeType === GOOGLE_DOC_MIME) {
      const content = await client.exportFileText(accessToken, fileId, TEXT_EXPORT_MIME)
      if (!content.trim()) throw new BadRequestException('Ce document Google Drive est vide.')
      return this.ia.ragIngest({ userId, workspaceId, title, content, category: 'google-drive' })
    }

    if (meta.mimeType === PDF_MIME) {
      const fileB64 = await client.downloadFileBase64(accessToken, fileId)
      const filename = title.toLowerCase().endsWith('.pdf') ? title : `${title}.pdf`
      return this.ia.ragIngest({ userId, workspaceId, title, fileB64, filename, category: 'google-drive' })
    }

    throw new BadRequestException(
      `Type de fichier non supporté (${meta.mimeType ?? 'inconnu'}). Seuls les Google Docs et PDF peuvent être ingérés.`,
    )
  }

  /**
   * READ the most recent Gmail exchanges with a contact (metadata only — subject,
   * from/to, date, snippet; NEVER the full body). Deduped to the newest message per
   * thread, newest first. Feeds the contact fiche's "Derniers échanges Gmail" — read
   * on demand, nothing persisted. Requires the `gmail.readonly` scope.
   */
  async listGmailWithContact(
    userId: string,
    input: { email: string; maxResults?: number },
  ): Promise<GmailMessageSummary[]> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())

    const limit = Math.min(Math.max(input.maxResults ?? DEFAULT_GMAIL_THREADS, 1), 25)
    // `newer:` is implicit; search both directions of the conversation.
    const q = `from:${input.email} OR to:${input.email}`
    const ids = await client.listMessageIds(accessToken, { q, maxResults: limit * 2 })
    if (!ids.length) return []

    // Borné ET tolérant : Gmail refuse au-delà d'une poignée de lectures
    // simultanées sur le même compte, et ce refus faisait tomber l'appel entier
    // plutôt que la seule requête en trop. La couche zéro n'a pas besoin d'être
    // exhaustive — elle cherche des TRACES — donc un message illisible se saute
    // et se journalise, il n'efface pas les cinquante-neuf autres.
    const metas = (
      await mapWithConcurrencySettled(
        ids.slice(0, limit * 2),
        GMAIL_READ_CONCURRENCY,
        m => retryOnThrottle(() => client.getMessageMetadata(accessToken, m.id)),
        (error, m) => this.logger.warn(`Gmail message ${m.id} skipped: ${(error as Error).message}`),
      )
    ).filter((meta): meta is GmailMessageSummary => meta !== null)
    // Keep the newest message per thread.
    const byThread = new Map<string, GmailMessageSummary>()
    for (const meta of metas) {
      const key = meta.threadId ?? meta.id
      const existing = byThread.get(key)
      if (!existing || (meta.date ?? '') > (existing.date ?? '')) byThread.set(key, meta)
    }
    return [...byThread.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, limit)
  }

  /**
   * READ recent Gmail exchanges with ANYONE at a company domain — the "e-mails"
   * leg of the zero layer (annexe méthodo p8: look for what already EXISTS
   * before proposing a cold approach).
   *
   * Differs from {@link listGmailWithContact} on purpose: the zero layer asks
   * "does anyone here already talk to this company?", which is a domain
   * question, not a known-contact one. Same discipline — metadata only (subject,
   * from/to, date), never a body — and the same `gmail.readonly` requirement.
   */
  async listGmailWithDomain(
    userId: string,
    input: { domain: string; maxResults?: number },
  ): Promise<GmailMessageSummary[]> {
    this.requireConfig()
    const domain = input.domain.trim().replace(/^@+/, '').toLowerCase()
    if (!domain) return []

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())

    const limit = Math.min(Math.max(input.maxResults ?? DEFAULT_GMAIL_THREADS, 1), 25)
    const q = `from:@${domain} OR to:@${domain}`
    const ids = await client.listMessageIds(accessToken, { q, maxResults: limit * 2 })
    if (!ids.length) return []

    // Borné ET tolérant : Gmail refuse au-delà d'une poignée de lectures
    // simultanées sur le même compte, et ce refus faisait tomber l'appel entier
    // plutôt que la seule requête en trop. La couche zéro n'a pas besoin d'être
    // exhaustive — elle cherche des TRACES — donc un message illisible se saute
    // et se journalise, il n'efface pas les cinquante-neuf autres.
    const metas = (
      await mapWithConcurrencySettled(
        ids.slice(0, limit * 2),
        GMAIL_READ_CONCURRENCY,
        m => retryOnThrottle(() => client.getMessageMetadata(accessToken, m.id)),
        (error, m) => this.logger.warn(`Gmail message ${m.id} skipped: ${(error as Error).message}`),
      )
    ).filter((meta): meta is GmailMessageSummary => meta !== null)
    const byThread = new Map<string, GmailMessageSummary>()
    for (const meta of metas) {
      const key = meta.threadId ?? meta.id
      const existing = byThread.get(key)
      if (!existing || (meta.date ?? '') > (existing.date ?? '')) byThread.set(key, meta)
    }
    return [...byThread.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, limit)
  }

  /**
   * La preuve la moins intrusive qu'une messagerie répond : son ADRESSE.
   *
   * `users.getProfile` échoue exactement quand le jeton ou la portée sont en
   * cause, et il ne rend aucun message. Le PDF trace la ligne : une preuve est
   * un NOM d'objet, jamais un contenu — et l'objet d'un message en est déjà un.
   */
  async probeMailbox(userId: string): Promise<string> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())
    const profile = await client.getProfile(accessToken)
    return profile.emailAddress ?? 'boîte connectée'
  }

  /** Does the stored token actually carry the scope this capability needs?
   *  Lets the zero layer skip a source instead of provoking a 403 on a token
   *  minted before the scope existed. */
  async hasCapability(userId: string, capability: keyof GoogleCapabilities): Promise<boolean> {
    const status = await this.getStatus(userId)
    return Boolean(status.connected && status.capabilities?.[capability])
  }

  /**
   * Compose a Gmail DRAFT (never sent). The recommended-by-default path in sales:
   * the message lands in the user's Drafts for a human review + explicit send. Same
   * opt-out guardrail as {@link sendGmail} — a suppressed recipient is rejected so we
   * never even stage a message to someone who unsubscribed. Requires `gmail.compose`.
   */
  async createGmailDraft(userId: string, input: SendGmailInput): Promise<CreatedDraft> {
    this.requireConfig()
    // #2078.22 — déposer un brouillon est une écriture : niveau accordé d'abord.
    await this.requireWriteAccess(userId, 'gmailDraft', input.connectionId)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (workspaceId && (await this.suppression.isSuppressed(workspaceId, input.to))) {
      throw new ConflictException('Ce destinataire s’est désabonné et ne peut pas être recontacté.')
    }
    const accessToken = await this.getValidAccessToken(userId, workspaceId, input.connectionId)
    const raw = gmailRawOf(input)
    const client = new GoogleClient(this.requireConfig())
    return client.createDraft(accessToken, raw)
  }

  /**
   * READ upcoming calendar events, optionally free-text filtered by a `query` (an
   * account domain / company name), to build the "Brief de prépa réunion". Only
   * events from now onward are returned. Requires the `calendar.readonly` scope.
   */
  async listUpcomingEvents(
    userId: string,
    input: { query?: string; maxResults?: number },
  ): Promise<CalendarEventSummary[]> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())

    const limit = Math.min(Math.max(input.maxResults ?? DEFAULT_CALENDAR_LOOKAHEAD, 1), 50)
    const query = input.query?.trim()
    // Match on the registrable domain when a URL/email is passed — Google's free-text
    // event search matches attendee emails, so `acme.com` surfaces meetings with the
    // account's people even if the summary doesn't name them.
    const q = query ? (extractDomain(query) ?? query) : undefined
    return client.listEvents(accessToken, DEFAULT_CALENDAR_ID, {
      timeMin: new Date().toISOString(),
      maxResults: limit,
      ...(q ? { q } : {}),
    })
  }

  /**
   * Create a Google Sheet in the user's Drive, pre-filled with a grid the caller
   * already assembled (mirrors the CSV export columns — contacts/scores/provenance).
   * The header row + data rows are passed as strings; we never invent a value.
   * Requires the `spreadsheets` scope.
   */
  async exportSheet(
    userId: string,
    input: { title: string; columns: string[]; rows: string[][] },
  ): Promise<CreatedSpreadsheet> {
    this.requireConfig()
    // #2078.22 — créer une feuille de calcul est une écriture : niveau accordé d'abord.
    await this.requireWriteAccess(userId, 'sheets')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())
    const rows = [input.columns, ...input.rows]
    return client.createSpreadsheet(accessToken, { title: input.title, sheetTitle: 'Bellum', rows })
  }

  /**
   * Cherche dans le CONTENU des documents, pas seulement dans leur nom.
   *
   * Garde-fou n°25 des méta-analyses : « Drive : rechercher dans le contenu, pas
   * seulement le nom de fichier ». Un CV s'appelle presque toujours
   * `CV_2024_v3.pdf` — chercher « Java » dans les noms ne rend jamais rien, et
   * l'utilisateur en conclut qu'il n'a pas le document.
   *
   * `fullText contains` est l'opérateur documenté de l'API Drive ; il couvre le
   * nom, le contenu indexé et les métadonnées.
   */
  async searchDriveContent(userId: string, input: { query: string; pageSize?: number }): Promise<DriveFilePage> {
    this.requireConfig()
    await this.requireDriveCapability(userId)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())

    const term = escapeDriveQuery(input.query.trim())
    if (!term) return { files: [], nextPageToken: null }

    try {
      return await client.listFiles(accessToken, {
        q: `fullText contains '${term}' and trashed = false`,
        pageSize: Math.min(Math.max(input.pageSize ?? 20, 1), 100),
      })
    } catch (error) {
      this.driveFailure(error)
    }
  }

  /**
   * Récupère un document pour l'attacher à un brouillon.
   *
   * Un document natif Google est EXPORTÉ en PDF : joindre un `.gdoc` produirait
   * un fichier que le destinataire ne peut pas ouvrir. Tout le reste est
   * téléchargé tel quel.
   */
  async fetchDocumentForAttachment(
    userId: string,
    fileId: string,
  ): Promise<{ filename: string; mimeType: string; contentBase64: string }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())

    const meta = await client.getFileMetadata(accessToken, fileId)
    const name = meta.name?.trim() || 'document'

    if (meta.mimeType?.startsWith('application/vnd.google-apps')) {
      const pdf = await client.exportFileBase64(accessToken, fileId, PDF_MIME)
      const filename = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
      return { filename, mimeType: PDF_MIME, contentBase64: pdf }
    }

    const content = await client.downloadFileBase64(accessToken, fileId)
    return { filename: name, mimeType: meta.mimeType ?? 'application/octet-stream', contentBase64: content }
  }

  /**
   * Indexe une pièce jointe reçue dans la base de connaissance (déclencheur
   * n°18, « CV entrants → indexation »).
   *
   * Passe par le pipeline RAG EXISTANT — aucune seconde ingestion n'est créée.
   * Seuls les PDF sont acceptés : c'est le format d'un CV dans 95 % des cas, et
   * accepter un `.docx` qu'on ne sait pas extraire produirait un document vide
   * dans la base, c'est-à-dire pire que rien.
   */
  async ingestMailAttachment(
    userId: string,
    input: { messageId: string; attachmentId: string; filename: string; mimeType: string | null },
  ): Promise<IaEnvelope | null> {
    this.requireConfig()
    if (input.mimeType !== PDF_MIME && !input.filename.toLowerCase().endsWith('.pdf')) return null

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(userId, workspaceId)
    const client = new GoogleClient(this.requireConfig())
    const fileB64 = await client.getAttachmentBase64(accessToken, input.messageId, input.attachmentId)
    if (!fileB64) return null

    const filename = input.filename.toLowerCase().endsWith('.pdf') ? input.filename : `${input.filename}.pdf`
    return this.ia.ragIngest({ userId, workspaceId, title: input.filename, fileB64, filename, category: 'cv' })
  }

  /**
   * #4546 — Liste TOUTES les connexions Google de l'utilisateur.
   *
   * Chaque connexion représente une boîte mail distincte, identifiée par son
   * `external_account_id` (l'adresse email) et nommée par `account_label`.
   */
  async listConnections(userId: string): Promise<
    Array<{
      id: string
      accountLabel: string | null
      externalAccountId: string | null
      connectedAt: string | null
      scopes: string | null
      capabilities: GoogleCapabilities
      scopeType: 'personal' | 'inherited_shared' | null
    }>
  > {
    if (readGoogleConfig() === null) return []
    const connections = await findAllPersonalConnections(this.connections, { userId, provider: PROVIDER })
    return connections.map(conn => ({
      id: conn.id,
      accountLabel: conn.account_label,
      externalAccountId: conn.external_account_id,
      connectedAt: conn.created_at?.toISOString() ?? null,
      scopes: conn.scope,
      capabilities: capabilitiesFromScope(conn.scope),
      scopeType: conn.scope_type,
    }))
  }

  /**
   * Déconnecte UNE connexion, et la révoque chez le fournisseur.
   *
   * #4546 — Prend désormais l'ID de la connexion à supprimer. S'il n'est pas
   * fourni (compatibilité), supprime la première connexion trouvée.
   *
   * Deux corrections, chacune pour un accident précis.
   *
   * (1) La suppression portait sur l'ESPACE. Dans une équipe où deux personnes
   * ont connecté leur compte, « Déconnecter » supprimait la ligne de quelqu'un
   * d'autre — sans un mot, et sans que la victime puisse le comprendre. On ne
   * retire que la sienne : un membre n'a rien à défaire chez son collègue.
   *
   * (2) On RÉVOQUE côté Google. Effacer une ligne en base laissait le jeton de
   * rafraîchissement parfaitement valide chez le fournisseur, et l'application
   * listée dans « Applications tierces » du compte de l'utilisateur. « Ce qui
   * est supprimé : les jetons » était donc faux, et c'est la promesse la plus
   * grave qu'un écran de déconnexion puisse rompre.
   *
   * La révocation est best-effort : si Google ne répond pas, on efface quand
   * même. L'inverse — garder la connexion parce que la révocation a échoué —
   * laisserait l'utilisateur sans aucun moyen de partir.
   */
  async disconnect(userId: string, connectionId?: string): Promise<void> {
    const own = await resolveDisconnectTarget(this.connections, { userId, provider: PROVIDER, connectionId })
    if (!own) return
    if (own.refresh_token_enc) {
      try {
        await new GoogleClient(this.requireConfig()).revoke(decryptToken(own.refresh_token_enc))
      } catch (error) {
        this.logger.warn(`Google token revocation failed (connection removed anyway)`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    await this.connections.delete({ id: own.id })
  }
}

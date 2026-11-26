import type {
  BeeperChatMessagesResponse,
  BeeperConversation,
  BeeperConversationsResponse,
  BeeperRegisterRequest,
  BeeperSendRequest,
  BeeperSendResult,
  BeeperStatus,
} from '@bellum/contracts'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { BeeperConnectionEntity } from '../../database/entities/beeper-connection.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { demoBeeperConversations, demoBeeperMessages } from '../demo/demo-beeper'
import { BEEPER_SEND_GATE, BEEPER_WORKSPACE, type BeeperSendGate, type BeeperWorkspace } from './beeper-ports'
import { readBeeperConfig, type BeeperConfig } from './beeper-config'
import { mapChat, mapMessage, matchContact, matchKeys, type BeeperMatchableContact } from './beeper-conversations'
import {
  BeeperAuthError,
  BeeperClient,
  BeeperHttpError,
  BeeperUnreachableError,
  normalizeBeeperBaseUrl,
} from './beeper.client'

const STATE_TTL_MS = 10 * 60 * 1000
const REFRESH_SKEW_MS = 60 * 1000
/** Ce que l'écran Messagerie liste — une page, lue en direct. */
const CONVERSATIONS_LIMIT = 25
/** Ce que Laura lit d'une conversation (c96) : les derniers messages, bornés. */
const MESSAGES_LIMIT = 30

export type BeeperDisconnectResult = { revoked: boolean; warning: string | null }
type CallbackResult = { ok: boolean; reason?: string }

const REVOCATION_UNCONFIRMED_WARNING =
  "L'accès a été retiré de Bellum ; Beeper n'a pas confirmé la révocation — retire aussi la connexion approuvée dans Beeper Desktop (Réglages › Intégrations)."
const AUTH_REFUSED_REASON = 'Beeper a refusé l’accès : reconnecte Beeper depuis Intégrations.'

type Access = { client: BeeperClient; accessToken: string }

/**
 * #4406 — Beeper Desktop, branché par l'utilisateur (Remote Access + son tunnel + OAuth PKCE).
 *
 * Calqué sur Salesforce (PKCE dérivé de l'état signé, rien à stocker entre réplicas) et le chiffrement
 * des CRM. Ce qu'il ajoute :
 *  - l'URL est SAISIE : garde SSRF à chaque appel (`BeeperClient`) ;
 *  - le client OAuth est ENREGISTRÉ dynamiquement auprès du Desktop (aucune clé serveur) ;
 *  - les conversations se lisent EN DIRECT : aucune table, aucun cache, aucun journal ne porte un
 *    corps (c96, décision Louis 21/10/2026) ;
 *  - l'envoi ne part que par `sendReply`, derrière la porte d'écriture (BB.3).
 *
 * Sans branchement = no-op STRICT : aucune ligne → aucun appel réseau.
 * Les jetons ne quittent jamais ce service : ni le client web, ni un journal.
 */
@Injectable()
export class BeeperService {
  private readonly logger = new Logger(BeeperService.name)

  constructor(
    @InjectRepository(BeeperConnectionEntity)
    private readonly connections: Repository<BeeperConnectionEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @Inject(BEEPER_WORKSPACE) private readonly workspaceContext: BeeperWorkspace,
    @Inject(BEEPER_SEND_GATE) private readonly outboundWrites: BeeperSendGate,
  ) {}

  /** Le transport HTTP — remplacé dans les specs, le `fetch` global en production. */
  httpFetch: typeof fetch = (input, init) => fetch(input, init)

  private clientFor(baseUrl: string, tunnelDeclared: boolean): BeeperClient {
    return new BeeperClient(baseUrl, tunnelDeclared, this.httpFetch)
  }

  private requireConfig(): BeeperConfig {
    const config = readBeeperConfig()
    if (!config) throw new ServiceUnavailableException('Beeper n’est pas proposé sur ce serveur.')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim()
    if (!secret) throw new ServiceUnavailableException('Beeper : signature de l’état OAuth impossible.')
    return secret
  }

  private signState(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ u: userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.stateSecret()).update(`beeper:${payload}`).digest('base64url')
    return `${payload}.${sig}`
  }

  /** L'utilisateur lié à l'état, ou `null` (signature, âge, forme). */
  private verifyState(state: string): string | null {
    const [payload, sig] = state.split('.')
    if (!payload || !sig) return null
    const expected = createHmac('sha256', this.stateSecret()).update(`beeper:${payload}`).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; t?: number }
      if (!decoded.u || typeof decoded.t !== 'number' || Date.now() - decoded.t > STATE_TTL_MS) return null
      return decoded.u
    } catch {
      return null
    }
  }

  /** Le vérificateur PKCE, DÉRIVÉ de l'état signé (même raison que Salesforce : rien de partagé entre réplicas). */
  private codeVerifier(state: string): string {
    return createHmac('sha256', this.stateSecret()).update(`beeper-pkce:${state}`).digest('base64url')
  }

  private findConnection(userId: string): Promise<BeeperConnectionEntity | null> {
    return this.connections.findOne({ where: { user_id: userId } })
  }

  /** L'état du branchement. Branché : UN appel léger prouve que Beeper répond (`unreachable` sinon). */
  async getStatus(userId: string): Promise<BeeperStatus> {
    const configured = readBeeperConfig() !== null
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return { configured: true, state: 'connected', baseUrl: null, tunnelDeclared: false, connectedAt: null }
    }
    if (!configured)
      return { configured, state: 'disconnected', baseUrl: null, tunnelDeclared: false, connectedAt: null }
    const conn = await this.findConnection(userId)
    if (!conn) return { configured, state: 'disconnected', baseUrl: null, tunnelDeclared: false, connectedAt: null }
    const base = { configured, baseUrl: conn.base_url, tunnelDeclared: conn.tunnel_declared }
    if (conn.status !== 'connected') return { ...base, state: 'pending', connectedAt: null }
    const connectedAt = conn.updated_at?.toISOString() ?? null
    try {
      const access = await this.access(conn)
      await access.client.listChats(access.accessToken, 1)
      return { ...base, state: 'connected', connectedAt }
    } catch {
      return { ...base, state: 'unreachable', connectedAt }
    }
  }

  /**
   * Enregistre l'URL distante, découvre le serveur d'autorisation, s'enregistre comme client, et rend
   * l'URL de consentement. Rien n'est « connecté » avant le retour OAuth.
   */
  async register(userId: string, input: BeeperRegisterRequest): Promise<{ url: string }> {
    const config = this.requireConfig()
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException({ code: 'demo', message: 'Aucun branchement depuis une salle de démonstration.' })
    }
    let baseUrl: string
    try {
      baseUrl = normalizeBeeperBaseUrl(input.baseUrl)
    } catch (error) {
      throw new BadRequestException({ code: 'invalid_url', message: (error as Error).message })
    }
    if (baseUrl.startsWith('http:') && !input.tunnelDeclared) {
      throw new BadRequestException({
        code: 'https_required',
        message: 'Une adresse https est obligatoire — ou déclare explicitement ton tunnel.',
      })
    }
    const client = this.clientFor(baseUrl, input.tunnelDeclared)
    let discovery
    let registration
    try {
      discovery = await client.discover()
      if (!discovery.registrationEndpoint) {
        throw new BadRequestException({
          code: 'registration_unsupported',
          message: 'Ce Beeper Desktop n’accepte pas l’enregistrement d’une application : mets-le à jour.',
        })
      }
      registration = await client.register(discovery.registrationEndpoint, config.redirectUri)
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException({ code: 'unreachable', message: this.describe(error) })
    }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      base_url: baseUrl,
      tunnel_declared: input.tunnelDeclared,
      status: 'pending' as const,
      client_id: registration.clientId,
      client_secret_enc: registration.clientSecret ? encryptToken(registration.clientSecret) : null,
      authorization_endpoint: discovery.authorizationEndpoint,
      token_endpoint: discovery.tokenEndpoint,
      revocation_endpoint: discovery.revocationEndpoint,
      access_token_enc: null,
      refresh_token_enc: null,
      expires_at: null,
      scope: null,
    }
    const existing = await this.findConnection(userId)
    if (existing) await this.connections.update({ id: existing.id }, patch)
    else await this.connections.insert(patch)

    const state = this.signState(userId)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: registration.clientId,
      redirect_uri: config.redirectUri,
      state,
      code_challenge: createHash('sha256').update(this.codeVerifier(state)).digest('base64url'),
      code_challenge_method: 'S256',
    })
    return { url: `${discovery.authorizationEndpoint}?${params.toString()}` }
  }

  /** Le retour OAuth. Ne jette jamais vers le navigateur : le contrôleur en fait une redirection nommée. */
  async handleCallback(code: string, state: string): Promise<CallbackResult> {
    const config = readBeeperConfig()
    if (!config) return { ok: false, reason: 'not_configured' }
    const userId = this.verifyState(state)
    if (!userId) return { ok: false, reason: 'invalid_state' }
    const conn = await this.findConnection(userId)
    if (!conn?.token_endpoint || !conn.client_id) return { ok: false, reason: 'no_pending_registration' }
    try {
      const tokens = await this.clientFor(conn.base_url, conn.tunnel_declared).exchangeCode({
        tokenEndpoint: conn.token_endpoint,
        code,
        codeVerifier: this.codeVerifier(state),
        clientId: conn.client_id,
        clientSecret: conn.client_secret_enc ? decryptToken(conn.client_secret_enc) : null,
        redirectUri: config.redirectUri,
      })
      await this.connections.update(
        { id: conn.id },
        {
          status: 'connected',
          access_token_enc: encryptToken(tokens.accessToken),
          refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          expires_at: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
          scope: tokens.scope,
        },
      )
      return { ok: true }
    } catch (error) {
      // Le nom de l'erreur seulement : ni code, ni jeton, ni réponse du Desktop.
      this.logger.warn(`Beeper OAuth callback failed: ${(error as Error).name}`)
      return { ok: false, reason: error instanceof BeeperUnreachableError ? 'unreachable' : 'exchange_failed' }
    }
  }

  /** Révoque (si Beeper sait le faire) puis EFFACE la ligne — toujours effacée, même sans confirmation. */
  async disconnect(userId: string): Promise<BeeperDisconnectResult> {
    const conn = await this.findConnection(userId)
    if (!conn) return { revoked: true, warning: null }
    let revoked = false
    const token = conn.refresh_token_enc ?? conn.access_token_enc
    if (conn.revocation_endpoint && conn.client_id && token) {
      revoked = await this.clientFor(conn.base_url, conn.tunnel_declared).revoke({
        revocationEndpoint: conn.revocation_endpoint,
        token: decryptToken(token),
        clientId: conn.client_id,
      })
    }
    await this.connections.delete({ id: conn.id })
    return { revoked, warning: revoked ? null : REVOCATION_UNCONFIRMED_WARNING }
  }

  /** Le jeton (rafraîchi s'il touche à sa fin). Il ne sort jamais de ce service. */
  private async access(conn: BeeperConnectionEntity): Promise<Access> {
    const client = this.clientFor(conn.base_url, conn.tunnel_declared)
    if (!conn.access_token_enc) throw new BeeperAuthError()
    const fresh = !conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (fresh) return { client, accessToken: decryptToken(conn.access_token_enc) }
    if (!conn.refresh_token_enc || !conn.token_endpoint || !conn.client_id) throw new BeeperAuthError()
    const refreshed = await client.refresh({
      tokenEndpoint: conn.token_endpoint,
      refreshToken: decryptToken(conn.refresh_token_enc),
      clientId: conn.client_id,
      clientSecret: conn.client_secret_enc ? decryptToken(conn.client_secret_enc) : null,
    })
    await this.connections.update(
      { id: conn.id },
      {
        access_token_enc: encryptToken(refreshed.accessToken),
        refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
        expires_at: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
      },
    )
    return { client, accessToken: refreshed.accessToken }
  }

  private describe(error: unknown): string {
    if (error instanceof BeeperUnreachableError) return error.reason
    if (error instanceof BeeperAuthError) return AUTH_REFUSED_REASON
    if (error instanceof BeeperHttpError) return `Beeper a répondu ${error.status}.`
    // Refus de la garde SSRF : son message est fixe et ne porte rien de secret.
    return error instanceof Error ? error.message : 'Beeper ne répond pas.'
  }

  /** Les conversations, lues EN DIRECT, rattachées au contact connu (proposé, jamais fusionné). */
  async listConversations(userId: string): Promise<BeeperConversationsResponse> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      // Démo : conversations de l'adaptateur, rattachement calculé VRAIMENT sur les contacts semés.
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return this.withContacts(workspaceId, demoBeeperConversations())
    }
    const conn = await this.findConnection(userId)
    if (!conn) return { state: 'disconnected' }
    if (conn.status !== 'connected') return { state: 'pending' }
    let chats
    try {
      const access = await this.access(conn)
      chats = await access.client.listChats(access.accessToken, CONVERSATIONS_LIMIT)
    } catch (error) {
      return { state: 'unreachable', reason: this.describe(error) }
    }
    const mapped = chats.map(mapChat).filter((c): c is NonNullable<typeof c> => c !== null)
    return this.withContacts(conn.workspace_id, mapped)
  }

  private async withContacts(
    workspaceId: string | null,
    conversations: Array<Omit<BeeperConversation, 'contact'>>,
  ): Promise<BeeperConversationsResponse> {
    const candidates = await this.candidateContacts(workspaceId, conversations)
    return {
      state: 'connected',
      conversations: conversations.map(c => ({ ...c, contact: matchContact(c, candidates) })),
    }
  }

  /**
   * Les derniers messages d'UNE conversation de l'utilisateur — pour Messagerie et pour Laura (c96).
   * LECTURE : rien n'est écrit, rien n'est conservé, rien n'est journalisé du texte.
   */
  async readOwnChat(userId: string, chatId: string): Promise<BeeperChatMessagesResponse> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      const messages = demoBeeperMessages(chatId)
      return messages
        ? { state: 'connected', chatId, messages }
        : { state: 'unreachable', reason: 'Conversation introuvable.' }
    }
    const conn = await this.findConnection(userId)
    if (!conn) return { state: 'disconnected' }
    if (conn.status !== 'connected') return { state: 'pending' }
    try {
      const access = await this.access(conn)
      const raw = await access.client.listMessages(access.accessToken, chatId)
      const messages = raw.map(mapMessage).filter((m): m is NonNullable<typeof m> => m !== null)
      return { state: 'connected', chatId, messages: messages.slice(-MESSAGES_LIMIT) }
    } catch (error) {
      return { state: 'unreachable', reason: this.describe(error) }
    }
  }

  /**
   * #4406.3 — L'ENVOI d'une réponse, et le SEUL chemin vers `BeeperClient.sendMessage`.
   *
   * Il passe par la porte d'écriture (`OutboundWriteService.request`, origine `user`) : le clic de
   * l'utilisateur sur un texte relu EST la décision, l'idempotence empêche un double envoi. Laura
   * n'appelle jamais cette méthode (garde `beeper-send-only-through-gate.spec.ts`).
   *
   * La charge utile de la porte ne porte PAS le texte (aucun corps conservé, c96).
   */
  async sendReply(userId: string, chatId: string, input: BeeperSendRequest): Promise<BeeperSendResult> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException({ code: 'demo', message: 'Aucun message ne part d’une salle de démonstration.' })
    }
    const conn = await this.findConnection(userId)
    if (!conn || conn.status !== 'connected') {
      throw new ConflictException({ code: 'not_connected', message: 'Beeper n’est pas branché.' })
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const gate = await this.outboundWrites.request({
      workspaceId,
      userId,
      provider: 'beeper',
      kind: 'send_chat_message',
      payload: { chatId, length: input.text.length, replyTo: input.replyToMessageId ?? null },
      origin: 'user',
      idempotencyKey: `beeper:${input.idempotencyKey}`,
    })
    if (gate.decision === 'already_done') return { status: 'already_done', pendingMessageId: null }
    if (gate.decision !== 'write_now') {
      throw new ConflictException({ code: 'pending', message: 'Cet envoi attend une approbation.' })
    }
    try {
      const access = await this.access(conn)
      const sent = await access.client.sendMessage(access.accessToken, chatId, {
        text: input.text,
        replyToMessageId: input.replyToMessageId,
      })
      await this.outboundWrites.recordOutcome(gate.request.id, {
        ok: true,
        response: sent.pendingMessageId ?? undefined,
      })
      return { status: 'sent', pendingMessageId: sent.pendingMessageId }
    } catch (error) {
      // Un délai dépassé n'est pas un échec : le message est peut-être parti. `unknown` arrête la reprise.
      if (error instanceof BeeperUnreachableError) await this.outboundWrites.recordUnknown(gate.request.id, null)
      else await this.outboundWrites.recordOutcome(gate.request.id, { ok: false, response: this.describe(error) })
      throw new ServiceUnavailableException({ code: 'unreachable', message: this.describe(error) })
    }
  }

  /** Les contacts de l'espace qui POURRAIENT être l'interlocuteur — une requête, bornée. */
  private async candidateContacts(
    workspaceId: string | null,
    conversations: ReadonlyArray<Parameters<typeof matchKeys>[0]>,
  ): Promise<BeeperMatchableContact[]> {
    if (!workspaceId || conversations.length === 0) return []
    const emails = new Set<string>()
    const phones = new Set<string>()
    const handles = new Set<string>()
    for (const conversation of conversations) {
      const keys = matchKeys(conversation)
      keys.emails.forEach(e => emails.add(e))
      keys.phones.forEach(p => phones.add(p))
      keys.handles.forEach(h => handles.add(h))
    }
    if (emails.size + phones.size + handles.size === 0) return []
    const qb = this.contacts
      .createQueryBuilder('c')
      .select(['c.id', 'c.full_name', 'c.account_id', 'c.email', 'c.phone', 'c.linkedin_url'])
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere('c.deleted_at IS NULL')
    const ors: string[] = []
    const params: Record<string, unknown> = {}
    if (emails.size) {
      ors.push('lower(c.email) IN (:...emails)')
      params['emails'] = [...emails]
    }
    if (phones.size) {
      ors.push(`right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 9) IN (:...phones)`)
      params['phones'] = [...phones]
    }
    if (handles.size) {
      ors.push(`lower(substring(c.linkedin_url from 'linkedin\\.com/in/([^/?#]+)')) IN (:...handles)`)
      params['handles'] = [...handles]
    }
    const rows = await qb
      .andWhere(`(${ors.join(' OR ')})`, params)
      .limit(200)
      .getMany()
    return rows.map(row => ({
      id: row.id,
      fullName: row.full_name ?? null,
      accountId: row.account_id ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      linkedinUrl: row.linkedin_url ?? null,
    }))
  }
}

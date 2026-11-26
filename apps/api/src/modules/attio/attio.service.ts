import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
// Reuse the CRM module's AES-256-GCM token helper — same "encrypt OAuth secrets
// at rest" need, same key derivation.
import type { CrmDealPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import type { CrmObjectKind, CrmTaskInput } from '../crm/crm-task'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { AttioClient, type AttioContactInput, type AttioUpsertResult } from './attio.client'
import { ATTIO_APP_URL, readAttioConfig, type AttioConfig } from './attio-config'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short
 *  enough to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
const PROVIDER = 'attio' as const

export type AttioStatus = {
  configured: boolean
  connected: boolean
  provider?: 'attio'
  accountLabel?: string | null
  connectedAt?: string
}

/** Le résultat d'une déconnexion : la ligne locale est TOUJOURS effacée ;
 *  `revoked` dit si le fournisseur a confirmé la révocation côté serveur. */
export type AttioDisconnectResult = { revoked: boolean; warning: string | null }

/** Le message d'écran quand le fournisseur n'a pas confirmé la révocation — ne
 *  nomme pas l'éditeur (D02/08), et ne laisse jamais croire à un accès
 *  entièrement coupé. Même texte que Salesforce/Pipedrive (commit d97ba6b1) —
 *  un mécanisme vit à un seul endroit. */
const REVOCATION_UNCONFIRMED_WARNING =
  "L'accès a été retiré de Bellum ; le fournisseur n'a pas confirmé la révocation — retire-le aussi depuis ton compte."

type CallbackResult = { ok: boolean; reason?: string }

@Injectable()
export class AttioService {
  private readonly logger = new Logger(AttioService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Product analytics — best-effort, `@Optional()` so `new AttioService(repo, ua, ws)` specs pass.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // SYNC-B — la première reprise part SEULE au branchement (best-effort, jamais bloquante).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  private requireConfig(): AttioConfig {
    const config = readAttioConfig()
    if (!config) throw new ServiceUnavailableException('Attio integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['ATTIO_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Attio state signing requires INTERNAL_API_SECRET or ATTIO_CLIENT_SECRET')
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
   *  the DB when Attio isn't configured — keeps the endpoint healthy even if the
   *  migration hasn't run in that environment. */
  async getStatus(userId: string): Promise<AttioStatus> {
    if (readAttioConfig() === null) return { configured: false, connected: false }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) return { configured: true, connected: false }
    return {
      configured: true,
      connected: true,
      provider: PROVIDER,
      accountLabel: conn.account_label,
      connectedAt: conn.created_at?.toISOString(),
    }
  }

  /** Build the Attio consent URL the browser is redirected to. Attio grants
   *  scopes on the integration itself, so no `scope` param is sent. */
  buildAuthorizeUrl(userId: string): string {
    const config = this.requireConfig()
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state: this.signState(userId),
    })
    return `${ATTIO_APP_URL}/authorize?${params.toString()}`
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
      const client = new AttioClient(config)
      let tokens: Awaited<ReturnType<typeof client.exchangeCode>>
      try {
        tokens = await client.exchangeCode(code)
      } catch (error) {
        // Refus du fournisseur (code expiré/déjà utilisé, application révoquée) :
        // dégradation attendue, déjà rendue à l'écran (`exchange_failed`) — pas
        // une panne de chez nous. Jamais le code ni un jeton dans la trace.
        this.logger.warn('Attio OAuth code exchange refused', {
          reason: error instanceof Error ? error.message : String(error),
          user: { id: userId },
        })
        return { ok: false, reason: 'exchange_failed' }
      }
      if (!tokens.accessToken) return { ok: false, reason: 'exchange_failed' }
      // Identify the workspace for a friendly label — best-effort, never fatal.
      let label: string | null = null
      let externalId: string | null = null
      try {
        const identity = await client.identify(tokens.accessToken)
        label = identity.workspaceName ?? identity.workspaceId
        externalId = identity.workspaceId
      } catch (error) {
        this.logger.warn('Attio identify failed (non-fatal, connection still saved)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      await this.upsertConnection(userId, workspaceId, tokens.accessToken, label, externalId, config.scopes)
      // Journal d'activité — CRM connected (provider name only, never a token).
      void this.analytics?.track('integration_connected', { userId, workspaceId, properties: { provider: 'attio' } })
      void this.firstImport?.enqueue({ userId, workspaceId, provider: 'attio' })
      return { ok: true }
    } catch (error) {
      this.logger.error('Attio OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  private async upsertConnection(
    userId: string,
    workspaceId: string,
    accessToken: string,
    label: string | null,
    externalId: string | null,
    scope: string,
  ): Promise<void> {
    const existing = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      external_account_id: externalId,
      instance_url: null, // Attio's API host is fixed — no per-org base like Salesforce.
      account_label: label ?? 'Attio',
      access_token_enc: encryptToken(accessToken),
      // Attio issues no refresh token and the access token does not expire.
      refresh_token_enc: null,
      expires_at: null,
      scope,
    }
    if (existing) {
      await this.connections.update({ id: existing.id }, patch)
    } else {
      await this.connections.insert(patch)
    }
  }

  /** Decrypt the workspace's Attio access token. No refresh/expiry handling —
   *  Attio tokens are long-lived (revoked only by disconnecting the integration). */
  private async getValidAccess(workspaceId: string): Promise<string> {
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) throw new NotFoundException('No Attio connection')
    return decryptToken(conn.access_token_enc)
  }

  /**
   * Push a contact into the workspace's Attio as a Person record. Two-way write:
   * matched by email, an existing Person is UPDATED in place rather than
   * duplicated; only a truly new contact is created. `created` tells which.
   */
  async exportContact(userId: string, input: AttioContactInput): Promise<AttioUpsertResult> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccess(workspaceId)
    const client = new AttioClient(config)
    const result = await client.upsertPerson(accessToken, input)
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, result.created)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'attio' },
    })
    return result
  }

  /**
   * #4188 — retrouve la Company par son nom exact, ou crée-la : jamais deux.
   * N'appeler QUE derrière la porte (adaptateur commun, #4186).
   */
  async exportCompany(userId: string, input: { name: string }): Promise<AttioUpsertResult> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccess(workspaceId)
    const client = new AttioClient(config)
    const existing = await client.findCompanyIdByName(accessToken, input.name)
    const result = existing
      ? { id: existing, created: false }
      : { id: await client.createCompany(accessToken, input.name), created: true }
    await this.touchLastUsed(workspaceId)
    return result
  }

  /**
   * Export a besoin as a **Note on the account's Company record** (Théo TF1 p39 —
   * a besoin's idiomatic Attio landing is a Note on the Company, not a standalone
   * task). An Attio note requires a parent record, so this needs the besoin's
   * company; when the besoin carries none we fall back to a standalone Task
   * (which needs no parent) rather than inventing a company. Same connection/token
   * path as `exportContact`. Returns the created record id + its object kind.
   */
  async exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccess(workspaceId)
    const client = new AttioClient(config)
    const company = input.company?.trim()
    const { id, object }: { id: string; object: CrmObjectKind } = company
      ? { id: (await client.createNote(accessToken, company, input)).id, object: 'note' }
      : { id: (await client.createTask(accessToken, input)).id, object: 'task' }
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, true)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'attio', kind: object },
    })
    return { id, object }
  }

  /** Best-effort audit of a server-side export (Historique › Export). Never
   *  throws — a history-write blip must not fail a successful CRM export. */
  private async recordExport(userId: string, workspaceId: string, created: boolean): Promise<void> {
    try {
      await this.userActions.insert({
        user_id: userId,
        workspace_id: workspaceId,
        action_type: 'export',
        metadata: { detail: 'Export Attio', provider: 'attio', created },
      })
    } catch (error) {
      this.logger.warn('Failed to record Attio export action (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
    }
  }

  /** Stamp the connection's last REAL use (Tool Registry v2 `last_sync` — an
   *  export, not a reconnect). Best-effort: never fails a successful write. */
  private async touchLastUsed(workspaceId: string): Promise<void> {
    try {
      await this.connections.update(
        { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
        { last_used_at: new Date() },
      )
    } catch (error) {
      this.logger.warn('Failed to stamp Attio last_used_at (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Déconnecte le CRM de l'ESPACE — la ligne locale est TOUJOURS effacée.
   *
   * Contrairement à Salesforce et Pipedrive (corrigés dans le commit
   * `d97ba6b1` avec un vrai `revoke()` sur leur endpoint OAuth documenté),
   * Attio ne documente AUCUN endpoint de révocation server-side. Vérifié le
   * 30/08/2026 : la référence OAuth publique d'Attio ne liste que trois
   * endpoints — authorize, token, introspect
   * (docs.attio.com/docs/oauth/{authorize,token,introspect}, confirmé par
   * l'index complet docs.attio.com/llms.txt) — et l'OpenAPI publié
   * (https://api.attio.com/openapi/api) ne cite `app.attio.com/authorize` et
   * `/oauth/token` que comme URLs du security scheme OAuth2, jamais comme
   * opérations appelables ; aucune trace de `revoke` nulle part dans le
   * document. Sans endpoint établi, on n'écrit pas de `AttioClient.revoke()` —
   * un appel sur un endpoint deviné échouerait en silence tout en faisant
   * croire que c'est fait (« un contrat d'API non vérifiable ne se devine
   * pas »).
   *
   * Le correctif ici est donc de dire la vérité plutôt que de rester
   * silencieux (le défaut d'origine) : la ligne locale est effacée, et
   * l'appelant reçoit TOUJOURS `revoked: false` + un message qui dit à
   * l'utilisateur de couper l'accès aussi depuis son compte Attio — jamais un
   * 204 muet qui laisserait croire que Bellum a coupé l'accès côté serveur.
   * Aucun jeton n'est déchiffré ni journalisé : cette méthode n'a besoin d'en
   * lire aucun, puisqu'aucun appel n'est fait.
   */
  async disconnect(userId: string): Promise<AttioDisconnectResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) return { revoked: true, warning: null }

    this.logger.warn(
      'Attio disconnect: no documented server-side revocation endpoint — connection removed locally only',
      { tags: { 'revocation.outcome': 'no_endpoint' } },
    )
    await this.connections.delete({ id: conn.id })
    return { revoked: false, warning: REVOCATION_UNCONFIRMED_WARNING }
  }

  // ---- #4189 — lecture commune (comptes, contacts, affaires) ; pas d'activités ----------

  private async readWith<T>(
    userId: string,
    read: (client: AttioClient, accessToken: string) => Promise<T>,
  ): Promise<T> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return read(new AttioClient(config), await this.getValidAccess(workspaceId))
  }

  listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    return this.readWith(userId, (c, token) => c.listCompanies(token, opts))
  }

  listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    return this.readWith(userId, (c, token) => c.listContacts(token, opts))
  }

  listDeals(userId: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    return this.readWith(userId, (c, token) => c.listDeals(token, opts))
  }
}

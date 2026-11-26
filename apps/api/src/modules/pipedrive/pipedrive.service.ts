import { SCOPE_GAP_RECORDER, type ScopeGapRecorder } from '../connector-scope-gaps/scope-gap-recorder.port'
import { dispatchFailureOutcome } from '@bellum/contracts'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { authorizationExpired } from '../../common/connector-error'
import { refreshTrackingFailure } from '../../common/util/oauth-refresh'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
// Reuse the CRM module's AES-256-GCM token helper — same "encrypt OAuth secrets
// at rest" need, same key derivation.
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import type {
  CrmActivityPage,
  CrmDealPage,
  CrmOwnerPage,
  CrmPipelinePage,
  CrmReadOptions,
} from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import type { CrmObjectKind, CrmTaskInput } from '../crm/crm-task'
import { PIPEDRIVE_OAUTH_BASE_URL, readPipedriveConfig, type PipedriveConfig } from './pipedrive-config'
import { PipedriveClient, type PipedriveContactInput, type PipedriveUpsertResult } from './pipedrive.client'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short
 *  enough to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
/** Refresh the access token if it expires within this window. */
const REFRESH_SKEW_MS = 60 * 1000
const PROVIDER = 'pipedrive' as const

export type PipedriveStatus = {
  configured: boolean
  connected: boolean
  provider?: 'pipedrive'
  accountLabel?: string | null
  connectedAt?: string
}

/** Le résultat d'une déconnexion : la ligne locale est TOUJOURS effacée ;
 *  `revoked` dit si Pipedrive a confirmé la révocation côté serveur. */
export type PipedriveDisconnectResult = { revoked: boolean; warning: string | null }

/** Le message d'écran quand Pipedrive n'a pas confirmé la révocation — ne
 *  nomme pas l'éditeur (D02/08), et ne laisse jamais croire à un accès
 *  entièrement coupé. */
const REVOCATION_UNCONFIRMED_WARNING =
  "L'accès a été retiré de Bellum ; le fournisseur n'a pas confirmé la révocation — retire-le aussi depuis ton compte."

type CallbackResult = { ok: boolean; reason?: string }

@Injectable()
export class PipedriveService {
  private readonly logger = new Logger(PipedriveService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Product analytics — best-effort, `@Optional()` so `new PipedriveService(repo, userActions, ws)` specs pass.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // SCOPES-I — l'écart de portées au retour du consentement ; absent, la connexion se fait comme avant.
    @Optional() @Inject(SCOPE_GAP_RECORDER) private readonly scopeGaps?: ScopeGapRecorder,
    // SYNC-B — la première reprise part SEULE au branchement (best-effort, jamais bloquante).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  private requireConfig(): PipedriveConfig {
    const config = readPipedriveConfig()
    if (!config) throw new ServiceUnavailableException('Pipedrive integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['PIPEDRIVE_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Pipedrive state signing requires INTERNAL_API_SECRET or PIPEDRIVE_CLIENT_SECRET')
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
   *  the DB when Pipedrive isn't configured — keeps the endpoint healthy even if
   *  the migration hasn't run in that environment. */
  async getStatus(userId: string): Promise<PipedriveStatus> {
    if (readPipedriveConfig() === null) return { configured: false, connected: false }
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

  /** Build the Pipedrive consent URL the browser is redirected to. */
  buildAuthorizeUrl(userId: string): string {
    const config = this.requireConfig()
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state: this.signState(userId),
    })
    // Pipedrive grants the scopes registered on the app; only forward an explicit
    // scope list when the operator set one.
    if (config.scopes) params.set('scope', config.scopes)
    return `${PIPEDRIVE_OAUTH_BASE_URL}/oauth/authorize?${params.toString()}`
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
      const client = new PipedriveClient(config)
      let tokens: Awaited<ReturnType<typeof client.exchangeCode>>
      try {
        tokens = await client.exchangeCode(code)
      } catch (error) {
        // Refus du fournisseur (code expiré/déjà utilisé, application révoquée) :
        // dégradation attendue, déjà rendue à l'écran (`exchange_failed`) — pas
        // une panne de chez nous. Jamais le code ni un jeton dans la trace.
        this.logger.warn('Pipedrive OAuth code exchange refused', {
          reason: error instanceof Error ? error.message : String(error),
          user: { id: userId },
        })
        return { ok: false, reason: 'exchange_failed' }
      }
      if (!tokens.accessToken || !tokens.apiDomain) return { ok: false, reason: 'exchange_failed' }
      await this.upsertConnection(userId, workspaceId, tokens, config.scopes)
      await this.scopeGaps?.recordGrant('pipedrive', userId, workspaceId, tokens.scope)
      // Journal d'activité — CRM connected (provider name only, never a token).
      void this.analytics?.track('integration_connected', {
        userId,
        workspaceId,
        properties: { provider: 'pipedrive' },
      })
      void this.firstImport?.enqueue({ userId, workspaceId, provider: 'pipedrive' })
      return { ok: true }
    } catch (error) {
      this.logger.error('Pipedrive OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  private async upsertConnection(
    userId: string,
    workspaceId: string,
    tokens: {
      accessToken: string
      refreshToken: string | null
      apiDomain: string | null
      scope: string | null
      expiresIn: number
    },
    configuredScopes: string,
  ): Promise<void> {
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null
    const label = tokens.apiDomain ? new URL(tokens.apiDomain).host : 'Pipedrive'
    const existing = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      external_account_id: null,
      instance_url: tokens.apiDomain,
      account_label: label,
      access_token_enc: encryptToken(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      expires_at: expiresAt,
      // Prefer the scope the token response actually granted; fall back to config.
      scope: tokens.scope || configuredScopes || null,
    }
    if (existing) {
      await this.connections.update({ id: existing.id }, patch)
    } else {
      await this.connections.insert(patch)
    }
  }

  /** Decrypt + refresh (if near expiry) the workspace's access token. Returns the
   *  token and the company's api_domain (both required for a REST write). */
  private async getValidAccess(workspaceId: string): Promise<{ accessToken: string; apiDomain: string }> {
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) throw new NotFoundException('No Pipedrive connection')
    if (!conn.instance_url) throw new ServiceUnavailableException('Pipedrive connection is missing its API domain')

    const notExpiring = !conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (notExpiring) return { accessToken: decryptToken(conn.access_token_enc), apiDomain: conn.instance_url }

    // #1836 — voir `crm.service.ts` : le 503 nu retirait le geste de l'écran.
    if (!conn.refresh_token_enc) {
      throw authorizationExpired({ provider: PROVIDER, capability: 'crm', capabilityLabel: 'ton CRM' })
    }
    const client = new PipedriveClient(this.requireConfig())
    const refreshToken = conn.refresh_token_enc
    const refreshed = await refreshTrackingFailure(
      () => client.refresh(decryptToken(refreshToken)),
      () => this.connections.update({ id: conn.id }, { refresh_failed_at: new Date() }),
    )
    const apiDomain = refreshed.apiDomain ?? conn.instance_url
    await this.connections.update(
      { id: conn.id },
      {
        access_token_enc: encryptToken(refreshed.accessToken),
        refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
        instance_url: apiDomain,
        expires_at: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        refresh_failed_at: null,
      },
    )
    return { accessToken: refreshed.accessToken, apiDomain }
  }

  /**
   * Push a contact into the workspace's Pipedrive. Two-way write: matched by
   * email, an existing Person is UPDATED in place rather than duplicated; only a
   * truly new contact is created. `created` tells the caller which happened.
   */
  async exportContact(userId: string, input: PipedriveContactInput): Promise<PipedriveUpsertResult> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const { accessToken, apiDomain } = await this.getValidAccess(workspaceId)
    const client = new PipedriveClient(this.requireConfig())
    const result = await client.upsertContact(accessToken, apiDomain, input)
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, result.created)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'pipedrive' },
    })
    return result
  }

  /**
   * #4188 — retrouve l'Organisation par son nom exact, ou crée-la : jamais
   * deux. N'appeler QUE derrière la porte (adaptateur commun, #4186).
   */
  async exportCompany(userId: string, input: { name: string }): Promise<PipedriveUpsertResult> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const { accessToken, apiDomain } = await this.getValidAccess(workspaceId)
    const client = new PipedriveClient(this.requireConfig())
    const existing = await client.findOrgIdByName(accessToken, apiDomain, input.name)
    const result = existing
      ? { id: String(existing), created: false }
      : { id: String(await client.createOrg(accessToken, apiDomain, input.name)), created: true }
    await this.touchLastUsed(workspaceId)
    return result
  }

  /**
   * Export a besoin as a **Deal** (Théo TF1 p39 — a besoin is a would-be
   * opportunity; its idiomatic Pipedrive object is a Deal, not an activity).
   * Same connection/token path as `exportContact`; the caller composed the
   * factual subject/body/company from the stored besoin, and the client
   * best-effort links the deal to the account's Organization. Returns the
   * created Deal id + its object kind.
   */
  async exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const { accessToken, apiDomain } = await this.getValidAccess(workspaceId)
    const client = new PipedriveClient(this.requireConfig())
    const result = await client.createDeal(accessToken, apiDomain, input)
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, true)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'pipedrive', kind: 'deal' },
    })
    return { id: result.id, object: 'deal' }
  }

  /** Best-effort audit of a server-side export (Historique › Export). Never
   *  throws — a history-write blip must not fail a successful CRM export. */
  private async recordExport(userId: string, workspaceId: string, created: boolean): Promise<void> {
    try {
      await this.userActions.insert({
        user_id: userId,
        workspace_id: workspaceId,
        action_type: 'export',
        metadata: { detail: 'Export Pipedrive', provider: 'pipedrive', created },
      })
    } catch (error) {
      this.logger.warn('Failed to record Pipedrive export action (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
    }
  }

  /** Stamp the connection's last REAL use (Tool Registry v2 `last_sync` — an
   *  export, not a token refresh). Best-effort: never fails a successful write. */
  private async touchLastUsed(workspaceId: string): Promise<void> {
    try {
      await this.connections.update(
        { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
        { last_used_at: new Date() },
      )
    } catch (error) {
      this.logger.warn('Failed to stamp Pipedrive last_used_at (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Déconnecte le CRM de l'ESPACE — et le RÉVOQUE chez Pipedrive.
   *
   * Même modèle que HubSpot (`crm/crm.service.ts`) et Google : la portée
   * d'espace est la bonne (un CRM est l'outil de l'ENTREPRISE, pas la boîte
   * mail de quelqu'un), et la révocation est best-effort — si Pipedrive ne
   * répond pas, on efface quand même la ligne. Garder la connexion parce que
   * la révocation a échoué laisserait l'utilisateur sans aucun moyen de
   * partir.
   *
   * Ce que Google/HubSpot ne faisaient pas encore : dire à l'appelant si la
   * révocation a RÉELLEMENT eu lieu. Un succès silencieux qui masque un échec
   * de révocation ferait croire à un accès entièrement coupé — c'est le
   * défaut d'origine (« does not revoke server-side »), sous une autre forme.
   */
  async disconnect(userId: string): Promise<PipedriveDisconnectResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) return { revoked: true, warning: null }

    let revoked = true
    if (conn.refresh_token_enc) {
      try {
        await new PipedriveClient(this.requireConfig()).revoke(decryptToken(conn.refresh_token_enc))
      } catch (error) {
        revoked = false
        // La seule question qui compte : la requête a-t-elle pu PARTIR ? Un
        // timeout (`unknown`) n'est pas la même chose qu'un refus applicatif
        // (`failed`) — dispatchFailureOutcome est le seul endroit du dépôt qui
        // tranche ça, pas de re-détection ad hoc ici.
        this.logger.warn('Pipedrive token revocation failed (connection removed anyway)', {
          error: error instanceof Error ? error.message : String(error),
          tags: { 'revocation.outcome': dispatchFailureOutcome(error) },
        })
      }
    }
    await this.connections.delete({ id: conn.id })
    return revoked ? { revoked: true, warning: null } : { revoked: false, warning: REVOCATION_UNCONFIRMED_WARNING }
  }

  // ---- #4189 — lecture commune (comptes, contacts, affaires, activités) -------------

  private async readWith<T>(
    userId: string,
    read: (client: PipedriveClient, access: { accessToken: string; apiDomain: string }) => Promise<T>,
  ): Promise<T> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return read(new PipedriveClient(config), await this.getValidAccess(workspaceId))
  }

  listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    return this.readWith(userId, (c, a) => c.listCompanies(a.accessToken, a.apiDomain, opts))
  }

  listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    return this.readWith(userId, (c, a) => c.listContacts(a.accessToken, a.apiDomain, opts))
  }

  listDeals(userId: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    return this.readWith(userId, (c, a) => c.listDeals(a.accessToken, a.apiDomain, opts))
  }

  listActivities(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    return this.readWith(userId, (c, a) => c.listActivities(a.accessToken, a.apiDomain, opts))
  }

  listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    return this.readWith(userId, (c, a) => c.listOwners(a.accessToken, a.apiDomain, opts))
  }

  listPipelines(userId: string, opts: CrmReadOptions): Promise<CrmPipelinePage> {
    return this.readWith(userId, (c, a) => c.listPipelines(a.accessToken, a.apiDomain, opts))
  }
}

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
import type { CrmDealPage, CrmOwnerPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import type { CrmObjectKind, CrmTaskInput } from '../crm/crm-task'
import type { CrmCompanyPage, CrmContactPage, HubspotContactInput } from '../crm/hubspot.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import {
  knownZohoAccountsUrl,
  readZohoConfig,
  zohoAccountsUrlForLocation,
  ZOHO_SCOPES,
  type ZohoConfig,
} from './zoho-config'
import { ZohoClient, type ZohoUpsertResult } from './zoho.client'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

const STATE_TTL_MS = 10 * 60 * 1000
const REFRESH_SKEW_MS = 60 * 1000
const PROVIDER = 'zoho' as const

export type ZohoStatus = {
  configured: boolean
  connected: boolean
  provider?: 'zoho'
  accountLabel?: string | null
  connectedAt?: string
}

/** La ligne locale est TOUJOURS effacée ; `revoked` dit si Zoho a confirmé la révocation. */
export type ZohoDisconnectResult = { revoked: boolean; warning: string | null }

const REVOCATION_UNCONFIRMED_WARNING =
  "L'accès a été retiré de Bellum ; le fournisseur n'a pas confirmé la révocation — retire-le aussi depuis ton compte."

type CallbackResult = { ok: boolean; reason?: string }

/**
 * #4187 — le connecteur Zoho CRM. Même modèle que Pipedrive : table
 * `crm_connections` (provider = 'zoho', TEXT nu — aucune migration pour la
 * ligne), jeton chiffré (crypto CRM), `state` signé HMAC, `api_domain` du token
 * stocké dans `instance_url`.
 *
 * Deux garanties propres à ce connecteur :
 *  - « connecté » ne se dit qu'APRÈS une lecture réussie : le callback lit
 *    l'utilisateur courant AVANT de poser la connexion ; une lecture refusée ne
 *    laisse aucune ligne, donc aucun écran « connecté ».
 *  - le domaine d'API est celui que le token a rendu ; sans lui, on refuse de
 *    partir plutôt que de le déduire de la région.
 */
@Injectable()
export class ZohoService {
  private readonly logger = new Logger(ZohoService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // SCOPES-I — l'écart de portées au retour du consentement ; absent, la connexion se fait comme avant.
    @Optional() @Inject(SCOPE_GAP_RECORDER) private readonly scopeGaps?: ScopeGapRecorder,
    // SYNC-B — la première reprise part SEULE au branchement (best-effort, jamais bloquante).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  private requireConfig(): ZohoConfig {
    const config = readZohoConfig()
    if (!config) throw new ServiceUnavailableException('Zoho integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['ZOHO_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Zoho state signing requires INTERNAL_API_SECRET or ZOHO_CLIENT_SECRET')
    return secret
  }

  private signState(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ u: userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

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

  /** Sans clé : retour immédiat SANS toucher la base ni l'espace, zéro réseau. */
  async getStatus(userId: string): Promise<ZohoStatus> {
    if (readZohoConfig() === null) return { configured: false, connected: false }
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

  buildAuthorizeUrl(userId: string): string {
    return new ZohoClient(this.requireConfig()).authorizeUrl(this.signState(userId))
  }

  /** Never throws to the browser — the controller turns the result into a redirect with a reason. */
  async handleCallback(
    code: string,
    state: string,
    region: { location?: string; accountsServer?: string } = {},
  ): Promise<CallbackResult> {
    let userId: string
    try {
      userId = this.verifyState(state)
    } catch {
      return { ok: false, reason: 'invalid_state' }
    }
    try {
      const config = this.requireConfig()
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const client = new ZohoClient(config)
      // L.6 — la région RÉELLE vient du retour OAuth : le code se rend au serveur de comptes qui l'a émis.
      const accountsServer = knownZohoAccountsUrl(region.accountsServer) ?? zohoAccountsUrlForLocation(region.location)
      const tokens = await client.exchangeCode(code, accountsServer)
      // Pas de domaine d'API rendu par le token = pas de domaine : jamais deviné depuis la région.
      if (!tokens.accessToken || !tokens.apiDomain) return { ok: false, reason: 'exchange_failed' }

      // La lecture D'ABORD : « connecté » ne se dit qu'après une lecture réussie.
      let me: Awaited<ReturnType<ZohoClient['currentUser']>>
      try {
        me = await client.currentUser(tokens.accessToken, tokens.apiDomain)
      } catch (error) {
        this.logger.warn('Zoho connection read test failed — nothing stored', {
          error: error instanceof Error ? error.message : String(error),
        })
        return { ok: false, reason: 'read_failed' }
      }
      await this.upsertConnection(userId, workspaceId, tokens, me.email, accountsServer)
      await this.scopeGaps?.recordGrant('zoho', userId, workspaceId, tokens.scope)
      void this.analytics?.track('integration_connected', { userId, workspaceId, properties: { provider: 'zoho' } })
      void this.firstImport?.enqueue({ userId, workspaceId, provider: 'zoho' })
      return { ok: true }
    } catch (error) {
      this.logger.error('Zoho OAuth callback failed', { error, user: { id: userId } })
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
    email: string | null,
    accountsServer: string | null,
  ): Promise<void> {
    const emailDomain = email?.split('@')[1]?.trim()
    const label = emailDomain || (tokens.apiDomain ? new URL(tokens.apiDomain).host : 'Zoho CRM')
    const existing = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      external_account_id: null,
      instance_url: tokens.apiDomain,
      accounts_server: accountsServer,
      account_label: label,
      access_token_enc: encryptToken(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      expires_at: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
      scope: tokens.scope || ZOHO_SCOPES.join(','),
    }
    if (existing) await this.connections.update({ id: existing.id }, patch)
    else await this.connections.insert(patch)
  }

  private async getValidAccess(workspaceId: string): Promise<{ accessToken: string; apiDomain: string }> {
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) throw new NotFoundException('No Zoho connection')
    if (!conn.instance_url) throw new ServiceUnavailableException('Zoho connection is missing its API domain')

    const notExpiring = !conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (notExpiring) return { accessToken: decryptToken(conn.access_token_enc), apiDomain: conn.instance_url }

    if (!conn.refresh_token_enc) {
      throw authorizationExpired({ provider: PROVIDER, capability: 'crm', capabilityLabel: 'ton CRM' })
    }
    const client = new ZohoClient(this.requireConfig())
    const refreshToken = conn.refresh_token_enc
    const refreshed = await refreshTrackingFailure(
      () => client.refresh(decryptToken(refreshToken), conn.accounts_server),
      () => this.connections.update({ id: conn.id }, { refresh_failed_at: new Date() }),
    )
    // Le domaine d'API stocké reste celui du token d'origine ; un refresh qui en rend un le remplace.
    const apiDomain = refreshed.apiDomain ?? conn.instance_url
    await this.connections.update(
      { id: conn.id },
      {
        access_token_enc: encryptToken(refreshed.accessToken),
        instance_url: apiDomain,
        expires_at: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        refresh_failed_at: null,
      },
    )
    return { accessToken: refreshed.accessToken, apiDomain }
  }

  /** Runs `fn` with a valid token for the caller's workspace. */
  private async withAccess<T>(
    userId: string,
    fn: (client: ZohoClient, access: { accessToken: string; apiDomain: string }, workspaceId: string) => Promise<T>,
  ): Promise<T> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const access = await this.getValidAccess(workspaceId)
    return fn(new ZohoClient(config), access, workspaceId)
  }

  // ─────────────────────── écritures (derrière la porte, #4186) ───────────────────────

  async exportContact(userId: string, input: HubspotContactInput): Promise<ZohoUpsertResult> {
    return this.withAccess(userId, async (client, { accessToken, apiDomain }, workspaceId) => {
      const result = await client.upsertContact(accessToken, apiDomain, input)
      await this.touchLastUsed(workspaceId)
      await this.recordExport(userId, workspaceId, result.created)
      void this.analytics?.track('export_performed', { userId, workspaceId, properties: { destination: 'zoho' } })
      return result
    })
  }

  /** Retrouve la société par son nom exact, ou crée-la : jamais deux. N'appeler QUE derrière la porte. */
  async exportCompany(userId: string, input: { name: string; website?: string | null }): Promise<ZohoUpsertResult> {
    return this.withAccess(userId, async (client, { accessToken, apiDomain }, workspaceId) => {
      const result = await client.findOrCreateAccount(accessToken, apiDomain, input)
      await this.touchLastUsed(workspaceId)
      return result
    })
  }

  /** Un besoin devient une tâche Zoho (et une note sur la société, best-effort). */
  async exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }> {
    return this.withAccess(userId, async (client, { accessToken, apiDomain }, workspaceId) => {
      const { id } = await client.createTask(accessToken, apiDomain, input)
      await this.touchLastUsed(workspaceId)
      await this.recordExport(userId, workspaceId, true)
      void this.analytics?.track('export_performed', {
        userId,
        workspaceId,
        properties: { destination: 'zoho', kind: 'task' },
      })
      return { id, object: 'task' }
    })
  }

  // ───────────────────────────── lecture (#4189) ─────────────────────────────

  listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    return this.withAccess(userId, (client, { accessToken, apiDomain }) =>
      client.listContacts(accessToken, apiDomain, opts),
    )
  }

  listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    return this.withAccess(userId, (client, { accessToken, apiDomain }) =>
      client.listAccounts(accessToken, apiDomain, opts),
    )
  }

  listDeals(userId: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    return this.withAccess(userId, (client, { accessToken, apiDomain }) =>
      client.listDeals(accessToken, apiDomain, opts),
    )
  }

  listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    return this.withAccess(userId, (client, { accessToken, apiDomain }) =>
      client.listOwners(accessToken, apiDomain, opts),
    )
  }

  private async recordExport(userId: string, workspaceId: string, created: boolean): Promise<void> {
    try {
      await this.userActions.insert({
        user_id: userId,
        workspace_id: workspaceId,
        action_type: 'export',
        metadata: { detail: 'Export Zoho', provider: 'zoho', created },
      })
    } catch (error) {
      this.logger.warn('Failed to record Zoho export action (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
    }
  }

  private async touchLastUsed(workspaceId: string): Promise<void> {
    try {
      await this.connections.update(
        { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
        { last_used_at: new Date() },
      )
    } catch (error) {
      this.logger.warn('Failed to stamp Zoho last_used_at (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Déconnecte l'espace ET révoque chez Zoho (`POST {accounts}/oauth/v2/token/revoke`).
   * Best-effort : si Zoho ne répond pas, la ligne est effacée quand même — garder la
   * connexion parce que la révocation a échoué laisserait l'utilisateur sans moyen de
   * partir. L'appelant sait si la révocation a RÉELLEMENT eu lieu.
   */
  async disconnect(userId: string): Promise<ZohoDisconnectResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) return { revoked: true, warning: null }

    let revoked = true
    if (conn.refresh_token_enc) {
      try {
        await new ZohoClient(this.requireConfig()).revoke(decryptToken(conn.refresh_token_enc), conn.accounts_server)
      } catch (error) {
        revoked = false
        this.logger.warn('Zoho token revocation failed (connection removed anyway)', {
          error: error instanceof Error ? error.message : String(error),
          tags: { 'revocation.outcome': dispatchFailureOutcome(error) },
        })
      }
    }
    await this.connections.delete({ id: conn.id })
    return revoked ? { revoked: true, warning: null } : { revoked: false, warning: REVOCATION_UNCONFIRMED_WARNING }
  }
}

import { dispatchFailureOutcome, resolveSalesforceLoginUrl } from '@bellum/contracts'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { authorizationExpired } from '../../common/connector-error'
import { refreshTrackingFailure } from '../../common/util/oauth-refresh'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
// Reuse the CRM module's AES-256-GCM token helper — same "encrypt OAuth secrets
// at rest" need, same key derivation — and its provider-agnostic presence shape.
import {
  emptyPresence,
  latestIso,
  type CrmPresence,
  type CrmPresenceContact,
  type CrmPresenceDeal,
  type CrmPresenceQuery,
} from '../crm/crm-presence'
import type { CrmObjectKind, CrmTaskInput } from '../crm/crm-task'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { readSalesforceConfig, type SalesforceConfig } from './salesforce-config'
import {
  SalesforceClient,
  SalesforceHttpError,
  type SalesforceContactInput,
  type SalesforceUpsertResult,
} from './salesforce.client'
import type { CrmActivityPage, CrmDealPage, CrmOwnerPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short
 *  enough to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
/** Refresh the access token if it expires within this window. */
const REFRESH_SKEW_MS = 60 * 1000
const PROVIDER = 'salesforce' as const

export type SalesforceStatus = {
  configured: boolean
  connected: boolean
  provider?: 'salesforce'
  accountLabel?: string | null
  connectedAt?: string
}

/** Le résultat d'une déconnexion : la ligne locale est TOUJOURS effacée ;
 *  `revoked` dit si Salesforce a confirmé la révocation côté serveur. */
export type SalesforceDisconnectResult = { revoked: boolean; warning: string | null }

/** Le message d'écran quand Salesforce n'a pas confirmé la révocation — ne
 *  nomme pas l'éditeur (D02/08), et ne laisse jamais croire à un accès
 *  entièrement coupé. */
const REVOCATION_UNCONFIRMED_WARNING =
  "L'accès a été retiré de Bellum ; le fournisseur n'a pas confirmé la révocation — retire-le aussi depuis ton compte."

type CallbackResult = { ok: boolean; reason?: string }

/** #4431 — ce que la carte choisit AVANT « Connecter » : le domaine de l'organisation et la case sandbox. */
type SalesforceAuthorizeOptions = { domain?: string; sandbox?: boolean }

/** #4431 — le message rendu quand le domaine saisi n'est pas un hôte Salesforce (400, lu tel quel sur la carte). */
const DOMAIN_REFUSED: Record<'invalid' | 'host_not_allowed', string> = {
  invalid: "Ce domaine n'est pas lisible : saisis par exemple « societe.my.salesforce.com ».",
  host_not_allowed: 'Seuls les domaines en salesforce.com ou force.com sont acceptés pour ton organisation Salesforce.',
}

@Injectable()
export class SalesforceService {
  private readonly logger = new Logger(SalesforceService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Product analytics — best-effort, `@Optional()` so `new SalesforceService(repo, ws)` specs pass.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // SYNC-B — la première reprise part SEULE au branchement (best-effort, jamais bloquante).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  private requireConfig(): SalesforceConfig {
    const config = readSalesforceConfig()
    if (!config) throw new ServiceUnavailableException('Salesforce integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['SALESFORCE_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Salesforce state signing requires INTERNAL_API_SECRET or SALESFORCE_CLIENT_SECRET')
    return secret
  }

  /** Sign `userId` into a tamper-proof, short-lived OAuth state parameter. */
  private signState(userId: string, loginUrl: string | null): string {
    // #4431 — le domaine d'organisation voyage DANS l'état signé : au retour, le jeton est demandé au même
    // hôte que le consentement, sans stockage partagé entre réplicas (même raison que le PKCE ci-dessous).
    const payload = Buffer.from(
      JSON.stringify({
        u: userId,
        t: Date.now(),
        n: randomBytes(8).toString('hex'),
        ...(loginUrl ? { d: loginUrl } : {}),
      }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

  /** Verify + decode a state parameter, returning the userId (and the org login host, if any) or throwing. */
  private verifyState(state: string): { userId: string; loginUrl: string | null } {
    const [payload, sig] = state.split('.')
    if (!payload || !sig) throw new BadRequestException('Invalid state')
    const expected = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new BadRequestException('Bad state signature')
    let decoded: { u?: string; t?: number; d?: string }
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
      throw new BadRequestException('Corrupt state')
    }
    if (!decoded.u || typeof decoded.t !== 'number' || Date.now() - decoded.t > STATE_TTL_MS) {
      throw new BadRequestException('Expired state')
    }
    // Signé, mais re-validé : un domaine hors salesforce.com / force.com ne sert jamais d'hôte.
    const domain = resolveSalesforceLoginUrl(decoded.d, false)
    return { userId: decoded.u, loginUrl: domain.ok ? domain.loginUrl : null }
  }

  /** #4431 — la config, avec l'hôte de connexion de l'ORGANISATION quand elle en a un (sinon l'hôte global). */
  private configFor(loginUrl: string | null | undefined): SalesforceConfig {
    const config = this.requireConfig()
    // Une valeur stockée est re-validée à chaque usage (défense en profondeur) : hors liste, l'hôte global.
    const own = resolveSalesforceLoginUrl(loginUrl, false)
    return own.ok && own.loginUrl ? { ...config, loginUrl: own.loginUrl } : config
  }

  /** Connection status for the caller's workspace. Returns early WITHOUT touching
   *  the DB when Salesforce isn't configured — keeps the endpoint healthy even if
   *  the migration hasn't run in that environment. */
  async getStatus(userId: string): Promise<SalesforceStatus> {
    if (readSalesforceConfig() === null) return { configured: false, connected: false }
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

  /**
   * Le vérificateur PKCE de CETTE demande, DÉRIVÉ de l'état signé.
   *
   * Salesforce impose PKCE sur les applications connectées récentes — la case
   * est grisée et « pour changer ce paramètre obligatoire, contactez le
   * Support ». Sans lui, l'échange du code échoue.
   *
   * Le vérificateur ne voyage jamais et n'est stocké nulle part : il se
   * recalcule au retour à partir de l'état, que la signature HMAC a déjà
   * authentifié. Un stockage (Redis, mémoire) aurait ajouté un état partagé
   * entre réplicas — et une connexion qui échoue une fois sur deux selon le
   * réplica qui reçoit le retour est le pire des symptômes à diagnostiquer.
   *
   * La dérivation est un HMAC du secret serveur : sans ce secret, un tiers qui
   * intercepte le code ne peut pas fabriquer le vérificateur.
   */
  private codeVerifier(state: string): string {
    return createHmac('sha256', this.stateSecret()).update(`pkce:${state}`).digest('base64url')
  }

  /** Build the Salesforce consent URL the browser is redirected to. */
  buildAuthorizeUrl(userId: string, options: SalesforceAuthorizeOptions = {}): string {
    // #4431.2 — le domaine saisi (converti, borné à *.salesforce.com / *.force.com) ou le sandbox ; rien : l'hôte global.
    const resolved = resolveSalesforceLoginUrl(options.domain, options.sandbox === true)
    if (!resolved.ok) throw new BadRequestException(DOMAIN_REFUSED[resolved.reason])
    const config = this.configFor(resolved.loginUrl)
    const state = this.signState(userId, resolved.loginUrl)
    const challenge = createHash('sha256').update(this.codeVerifier(state)).digest('base64url')
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    return `${config.loginUrl}/services/oauth2/authorize?${params.toString()}`
  }

  /** Handle the OAuth redirect: exchange the code, persist an encrypted
   *  connection. Never throws to the browser — the controller turns the result
   *  into a redirect with a friendly reason. */
  async handleCallback(code: string, state: string): Promise<CallbackResult> {
    let userId: string
    let loginUrl: string | null
    try {
      ;({ userId, loginUrl } = this.verifyState(state))
    } catch {
      return { ok: false, reason: 'invalid_state' }
    }
    try {
      const config = this.configFor(loginUrl)
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const client = new SalesforceClient(config)
      const tokens = await client.exchangeCode(code, this.codeVerifier(state))
      if (!tokens.accessToken || !tokens.instanceUrl) return { ok: false, reason: 'exchange_failed' }
      await this.upsertConnection(userId, workspaceId, tokens, config.scopes, loginUrl)
      // Journal d'activité — CRM connected (provider name only, never a token).
      void this.analytics?.track('integration_connected', {
        userId,
        workspaceId,
        properties: { provider: 'salesforce' },
      })
      void this.firstImport?.enqueue({ userId, workspaceId, provider: 'salesforce' })
      return { ok: true }
    } catch (error) {
      this.logger.error('Salesforce OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  private async upsertConnection(
    userId: string,
    workspaceId: string,
    tokens: {
      accessToken: string
      refreshToken: string | null
      instanceUrl: string | null
      orgId: string | null
      expiresIn: number
    },
    scope: string,
    loginUrl: string | null,
  ): Promise<void> {
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null
    const label = tokens.instanceUrl ? new URL(tokens.instanceUrl).host : (tokens.orgId ?? 'Salesforce')
    const existing = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      external_account_id: tokens.orgId,
      instance_url: tokens.instanceUrl,
      // #4431 — l'hôte de connexion de l'organisation (NULL = l'hôte global) : refresh et révocation en partent.
      login_url: loginUrl,
      account_label: label,
      access_token_enc: encryptToken(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      expires_at: expiresAt,
      scope,
    }
    if (existing) {
      await this.connections.update({ id: existing.id }, patch)
    } else {
      await this.connections.insert(patch)
    }
  }

  /** Decrypt + refresh (if near expiry) the workspace's access token. Returns the
   *  token and the org's instance_url (both required for a REST write). */
  private async getValidAccess(
    workspaceId: string,
    force = false,
  ): Promise<{ accessToken: string; instanceUrl: string }> {
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) throw new NotFoundException('No Salesforce connection')
    if (!conn.instance_url) throw new ServiceUnavailableException('Salesforce connection is missing its instance URL')

    const notExpiring = !force && (!conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS)
    if (notExpiring) return { accessToken: decryptToken(conn.access_token_enc), instanceUrl: conn.instance_url }

    // #1836 — voir `crm.service.ts` : le 503 nu retirait le geste de l'écran.
    if (!conn.refresh_token_enc) {
      throw authorizationExpired({ provider: PROVIDER, capability: 'crm', capabilityLabel: 'ton CRM' })
    }
    const client = new SalesforceClient(this.configFor(conn.login_url))
    const refreshToken = conn.refresh_token_enc
    // Un refresh refusé = le grant est mort : l'écran dit « reconnecte », pas « fiche refusée ».
    const refreshed = await refreshTrackingFailure(
      () => client.refresh(decryptToken(refreshToken)),
      () => this.connections.update({ id: conn.id }, { refresh_failed_at: new Date() }),
    ).catch(() => {
      throw authorizationExpired({ provider: PROVIDER, capability: 'crm', capabilityLabel: 'ton CRM' })
    })
    const instanceUrl = refreshed.instanceUrl ?? conn.instance_url
    await this.connections.update(
      { id: conn.id },
      {
        access_token_enc: encryptToken(refreshed.accessToken),
        refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
        instance_url: instanceUrl,
        expires_at: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        refresh_failed_at: null,
      },
    )
    return { accessToken: refreshed.accessToken, instanceUrl }
  }

  /**
   * UNE seule porte vers Salesforce : le jeton (rafraîchi s'il touche à sa fin), puis l'appel ;
   * sur un 401 — jeton expiré que `expires_at` ne trahissait pas (Salesforce omet souvent
   * `expires_in`) — un rafraîchissement forcé et UNE seule retentative. Refresh refusé →
   * `authorization_expired` (« reconnecte »). Toute requête Salesforce passe par ici.
   */
  private async withAccess<T>(
    workspaceId: string,
    call: (client: SalesforceClient, access: { accessToken: string; instanceUrl: string }) => Promise<T>,
  ): Promise<T> {
    const client = new SalesforceClient(this.requireConfig())
    const access = await this.getValidAccess(workspaceId)
    try {
      return await call(client, access)
    } catch (error) {
      if (!(error instanceof SalesforceHttpError) || error.status !== 401) throw error
      return call(client, await this.getValidAccess(workspaceId, true))
    }
  }

  /**
   * Push a contact into the workspace's Salesforce. Two-way write: matched by
   * email (SOQL), an existing Contact is UPDATED in place rather than duplicated;
   * only a truly new contact is created. `created` tells the caller which happened.
   */
  async exportContact(userId: string, input: SalesforceContactInput): Promise<SalesforceUpsertResult> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.withAccess(workspaceId, (client, a) =>
      client.upsertContact(a.accessToken, a.instanceUrl, input),
    )
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, result.created)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'salesforce' },
    })
    return result
  }

  /**
   * #4188 — retrouve la société (Account) par son nom exact, ou crée-la :
   * jamais deux. N'appeler QUE derrière la porte (adaptateur commun, #4186).
   */
  async exportCompany(
    userId: string,
    input: { name: string; website?: string | null },
  ): Promise<SalesforceUpsertResult> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.withAccess(workspaceId, (client, a) =>
      client.upsertAccount(a.accessToken, a.instanceUrl, input),
    )
    await this.touchLastUsed(workspaceId)
    return result
  }

  /**
   * Export a besoin as a **Task** (Théo TF1 p39). Salesforce's idiomatic
   * would-be-opportunity object is an Opportunity, but creating one requires a
   * `CloseDate` and a `StageName` picklist value that are org-specific and that a
   * freshly-detected besoin simply does not have — inventing either would break
   * the "jamais de donnée inventée" rule. So the honest Salesforce landing for a
   * besoin is a Task (a real CRM Activity). Same connection/token path as
   * `exportContact`; the caller composed the factual subject/body. Returns the
   * created Task id + its object kind.
   */
  async exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.withAccess(workspaceId, (client, a) =>
      client.createTask(a.accessToken, a.instanceUrl, input),
    )
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, true)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'salesforce', kind: 'task' },
    })
    return { id: result.id, object: 'task' }
  }

  /** Best-effort audit of a server-side export (Historique › Export). Never
   *  throws — a history-write blip must not fail a successful CRM export. */
  private async recordExport(userId: string, workspaceId: string, created: boolean): Promise<void> {
    try {
      await this.userActions.insert({
        user_id: userId,
        workspace_id: workspaceId,
        action_type: 'export',
        metadata: { detail: 'Export Salesforce', provider: 'salesforce', created },
      })
    } catch (error) {
      this.logger.warn('Failed to record Salesforce export action (non-fatal)', {
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
      this.logger.warn('Failed to stamp Salesforce last_used_at (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Déconnecte le CRM de l'ESPACE — et le RÉVOQUE chez Salesforce.
   *
   * Même modèle que HubSpot (`crm/crm.service.ts`) et Google : la portée
   * d'espace est la bonne (un CRM est l'outil de l'ENTREPRISE, pas la boîte
   * mail de quelqu'un), et la révocation est best-effort — si Salesforce ne
   * répond pas, on efface quand même la ligne. Garder la connexion parce que
   * la révocation a échoué laisserait l'utilisateur sans aucun moyen de
   * partir.
   *
   * Ce que Google/HubSpot ne faisaient pas encore : dire à l'appelant si la
   * révocation a RÉELLEMENT eu lieu. Un succès silencieux qui masque un échec
   * de révocation ferait croire à un accès entièrement coupé — c'est le
   * défaut d'origine (« does not revoke server-side »), sous une autre forme.
   */
  async disconnect(userId: string): Promise<SalesforceDisconnectResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) return { revoked: true, warning: null }

    let revoked = true
    if (conn.refresh_token_enc) {
      try {
        await new SalesforceClient(this.configFor(conn.login_url)).revoke(decryptToken(conn.refresh_token_enc))
      } catch (error) {
        revoked = false
        // La seule question qui compte : la requête a-t-elle pu PARTIR ? Un
        // timeout (`unknown`) n'est pas la même chose qu'un refus applicatif
        // (`failed`) — dispatchFailureOutcome est le seul endroit du dépôt qui
        // tranche ça, pas de re-détection ad hoc ici.
        this.logger.warn('Salesforce token revocation failed (connection removed anyway)', {
          error: error instanceof Error ? error.message : String(error),
          tags: { 'revocation.outcome': dispatchFailureOutcome(error) },
        })
      }
    }
    await this.connections.delete({ id: conn.id })
    return revoked ? { revoked: true, warning: null } : { revoked: false, warning: REVOCATION_UNCONFIRMED_WARNING }
  }

  /**
   * Presence read-back (roadmap §8/§9) : is this account already in the team's
   * Salesforce? SOQL over Contact + open Opportunity, matched by Account.Name /
   * email domain. Honest by construction: not configured / not connected →
   * `provider: null`; connected but no match (or a read error) → `provider:
   * 'salesforce'`, `matched: false`, empty lists. NEVER an invented record.
   */
  async findPresence(userId: string, query: CrmPresenceQuery): Promise<CrmPresence> {
    if (readSalesforceConfig() === null) return emptyPresence()
    let connected = false
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const conn = await this.connections.findOne({
        where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
      })
      if (!conn) return emptyPresence()
      connected = true

      const q = { name: query.account?.trim() || undefined, domain: query.domain?.trim() || undefined }
      if (!q.name && !q.domain) return emptyPresence(PROVIDER)

      // #2854 — même correctif que HubSpot (`CrmService.findPresence`) :
      // les DEUX lectures ont leur propre filet. Un `Promise.all` faisait
      // échouer les DEUX dès qu'UNE seule remontait une erreur (permission
      // Salesforce révoquée sur les Contacts, par exemple) — des opportunités
      // réellement ouvertes disparaissaient avec elle, alors qu'elles
      // n'avaient rien à voir avec l'échec.
      let contacts: { total: number; contacts: CrmPresenceContact[]; lastActivityAt: string | null } = {
        total: 0,
        contacts: [],
        lastActivityAt: null,
      }
      try {
        contacts = await this.withAccess(workspaceId, (client, a) =>
          client.queryContactsAtAccount(a.accessToken, a.instanceUrl, q),
        )
      } catch (error) {
        this.logger.warn('Salesforce presence: contacts lookup failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        })
      }

      let opps: { deals: CrmPresenceDeal[]; lastActivityAt: string | null } = { deals: [], lastActivityAt: null }
      try {
        opps = await this.withAccess(workspaceId, (client, a) =>
          client.queryOpenOpportunities(a.accessToken, a.instanceUrl, q),
        )
      } catch (error) {
        this.logger.warn('Salesforce presence: open opportunities lookup failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        })
      }

      return {
        provider: PROVIDER,
        matched: contacts.total > 0 || opps.deals.length > 0,
        contactsCount: contacts.total,
        contacts: contacts.contacts,
        openDeals: opps.deals,
        lastActivityAt: latestIso([contacts.lastActivityAt, opps.lastActivityAt]),
      }
    } catch (error) {
      // Graceful: a CRM outage degrades to "consulted, nothing found" — never a 500
      // in the account dossier / chat context, never invented data.
      this.logger.warn('Salesforce presence read failed (returning empty)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return emptyPresence(connected ? PROVIDER : null)
    }
  }

  // ---- #4189 — lecture commune (comptes, contacts, affaires, activités) -------------

  /** Un jeton valide pour l'espace de l'appelant, puis la lecture ; jamais d'appel sans connexion. */
  private async readWith<T>(
    userId: string,
    read: (client: SalesforceClient, access: { accessToken: string; instanceUrl: string }) => Promise<T>,
  ): Promise<T> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.withAccess(workspaceId, read)
  }

  listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    return this.readWith(userId, (c, a) => c.listCompanies(a.accessToken, a.instanceUrl, opts))
  }

  listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    return this.readWith(userId, (c, a) => c.listContacts(a.accessToken, a.instanceUrl, opts))
  }

  listDeals(userId: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    return this.readWith(userId, (c, a) => c.listDeals(a.accessToken, a.instanceUrl, opts))
  }

  listActivities(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    return this.readWith(userId, (c, a) => c.listActivities(a.accessToken, a.instanceUrl, opts))
  }

  listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    return this.readWith(userId, (c, a) => c.listOwners(a.accessToken, a.instanceUrl, opts))
  }
}

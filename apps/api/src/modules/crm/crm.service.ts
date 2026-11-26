import { SCOPE_GAP_RECORDER, type ScopeGapRecorder } from '../connector-scope-gaps/scope-gap-recorder.port'
import {
  dispatchFailureOutcome,
  type ConnectorErrorCode,
  type CrmContactSnapshot,
  type WriteSource,
} from '@bellum/contracts'
import type { CrmActivityPage, CrmOwnerPage, CrmPipelinePage, CrmReadOptions } from './adapter/crm-read-types'
import { ContactEntity } from '../../database/entities/contact.entity'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
  Injectable,
  Logger,
  Optional,
  PreconditionFailedException,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import {
  authorizationExpired,
  classifyProviderError,
  connectorFailure,
  connectorMessage,
} from '../../common/connector-error'
import { refreshTrackingFailure } from '../../common/util/oauth-refresh'
import { grantedScopes, hasScope } from '../../common/util/oauth-scopes'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { contactGestureWhere } from '../contacts/contact-gesture-scope'
import { readHubspotConfig, type HubspotConfig } from './crm-config'
import {
  emptyPresence,
  latestIso,
  type CrmPresence,
  type CrmPresenceContact,
  type CrmPresenceDeal,
  type CrmPresenceQuery,
} from './crm-presence'
import {
  emptyVocabulary,
  CRM_VOCABULARY_MAX_COMPANIES_SCANNED,
  CRM_VOCABULARY_MAX_VALUES,
  type CrmVocabulary,
} from './crm-vocabulary'
import { emptyNetworkSize, type CrmNetworkSize } from './crm-network-size'
import type { CrmObjectKind, CrmTaskInput } from './crm-task'
import { decryptToken, encryptToken } from './crm-token.crypto'
import { OutboundWriteService } from './outbound-write.service'
import type { OutboundWriteKind } from './outbound-write-preview'
import { demoCrmPresence } from '../demo/demo-dataset'
import { findDuplicatePairs, findIncompleteRecords, type DuplicatePair, type IncompleteRecord } from './crm-duplicates'
import {
  HubspotClient,
  HUBSPOT_MAX_PAGE_SIZE,
  type CrmCompanyPage,
  type CrmContactPage,
  type HubspotContactInput,
  type HubspotDealPage,
  type HubspotDealPipeline,
  type UpsertResult,
} from './hubspot.client'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short
 *  enough to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
/** Refresh the access token if it expires within this window. */
const REFRESH_SKEW_MS = 60 * 1000

/**
 * #1943.8 — les écritures validées que CE service sait faire partir : celles que
 * sa porte (`gate`) retient. Toute autre reste validée et le dit.
 */
const APPROVED_HUBSPOT_WRITES: ReadonlySet<OutboundWriteKind> = new Set<OutboundWriteKind>([
  'export_contact',
  'create_note',
  'create_task',
  'log_meeting',
  // #1934.18 — la proposition de stade, une fois VALIDÉE par un humain. C'est
  // le seul chemin par lequel elle part : à sa création elle reste `pending`.
  'update_deal_stage',
  // #2777 — la proposition d'opportunité (Deal), une fois VALIDÉE. Même règle :
  // à sa création elle reste `pending`, voir `CrmService.proposeCreateDeal`.
  'create_deal',
])

/** Les champs texte OBLIGATOIRES d'une charge utile figée — jamais complétés : absents, rien ne part. */
function frozenStrings<K extends string>(payload: Record<string, unknown>, keys: readonly K[]): Record<K, string> {
  const picked = {} as Record<K, string>
  for (const key of keys) {
    const value = payload[key]
    if (typeof value !== 'string' || value.trim() === '') {
      throw new PreconditionFailedException(`Demande d’écriture illisible (« ${key} » absent) : rien n’a été envoyé.`)
    }
    picked[key] = value
  }
  return picked
}

/**
 * #1943.8 — l'appel au fournisseur pour une demande VALIDÉE, avec sa charge utile
 * FIGÉE telle qu'elle a été montrée. Aucun champ n'est deviné ni recalculé.
 */
async function performApprovedHubspotWrite(
  client: HubspotClient,
  accessToken: string,
  request: OutboundWriteRequestEntity,
): Promise<{ id: string }> {
  const payload = request.payload ?? {}
  switch (request.kind) {
    case 'create_note': {
      const { externalId, note } = frozenStrings(payload, ['externalId', 'note'] as const)
      return client.logActivity(accessToken, externalId, note)
    }
    case 'export_contact':
      return client.upsertContact(accessToken, payload as HubspotContactInput)
    case 'create_task': {
      const { subject, dueAt } = frozenStrings(payload, ['subject', 'dueAt'] as const)
      return client.createTask(accessToken, { ...payload, subject, dueAt })
    }
    case 'log_meeting': {
      const { title, startsAt, endsAt } = frozenStrings(payload, ['title', 'startsAt', 'endsAt'] as const)
      return client.createMeeting(accessToken, { ...payload, title, startsAt, endsAt })
    }
    case 'update_deal_stage': {
      // #1934.18 — l'affaire ET l'IDENTIFIANT du stade viennent de la charge
      // utile FIGÉE. `stage` (le libellé) n'est lu nulle part ici : une demande
      // qui ne porte que lui est illisible, et rien ne part — `dealstage` attend
      // un identifiant, et un libellé deviné réussirait au mieux par hasard.
      const { dealId, stageId } = frozenStrings(payload, ['dealId', 'stageId'] as const)
      return client.updateDealStage(accessToken, dealId, stageId)
    }
    case 'create_deal': {
      // #2777 — le titre est OBLIGATOIRE dans la charge utile figée ; `body` et
      // `company` restent ce qu'ils étaient au dépôt, jamais recomplétés ici.
      const { subject } = frozenStrings(payload, ['subject'] as const)
      const company = typeof payload['company'] === 'string' ? payload['company'] : undefined
      const body = typeof payload['body'] === 'string' ? payload['body'] : ''
      return client.createDeal(accessToken, { subject, body, company })
    }
    case 'close_task': {
      // #2319.114 — un `close_crm_task` déclenché en tâche de fond (routine)
      // reste `pending` (origine `system`) jusqu'à approbation ; ce chemin est
      // ce qui l'écrit une fois validé, comme `create_task` ci-dessus.
      const { externalId } = frozenStrings(payload, ['externalId'] as const)
      return client.closeTask(accessToken, externalId)
    }
    default:
      throw new ConflictException("Validée, mais cette écriture ne peut pas partir d'ici : rien n'a été écrit.")
  }
}

/**
 * Ce que le jeton CRM autorise vraiment, portée par portée.
 *
 * Mesuré en production le 16/08 : un portail branché avant l'élargissement des
 * portées (companies, deals) rendait un **500 opaque** sur le rapport de
 * pipeline et sur les contacts dormants. À l'écran : « CRM connecté » d'un côté,
 * erreur interne de l'autre, et rien pour comprendre qu'il suffisait de
 * reconnecter. Les capacités se dérivent donc des portées ACCORDÉES, jamais de
 * celles qu'on a demandées.
 */
type CrmCapabilities = {
  contactsRead: boolean
  contactsWrite: boolean
  companiesRead: boolean
  dealsRead: boolean
  /** Tâches de relance (`POST /crm/tasks`). */
  tasksWrite: boolean
  /** Journal d'une réunion tenue (`POST /crm/meetings`). */
  meetingsWrite: boolean
  /** Notes déposées sur une fiche. */
  notesWrite: boolean
  /**
   * #1934.18 — déplacer une affaire d'un stade à l'autre.
   *
   * ⚠️ Portée DÉDIÉE, sans repli sur l'écriture de contacts : déplacer une
   * affaire n'est pas un « engagement » rattaché à une fiche, c'est une
   * modification du pipeline — le chiffre que le client lit tous les lundis.
   * Un portail branché avant le 16/09/2026 ne l'a jamais accordée, et la carte
   * du connecteur le DIT plutôt que de laisser une validation échouer au bout.
   */
  dealsWrite: boolean
}

/** Le nom de l'espace du connecteur CRM FICTIF de la salle de démonstration (voir `CrmStatus.demo`). */
const DEMO_CRM_ACCOUNT_LABEL = 'Bellum Conseil — CRM fictif'

export type CrmStatus = {
  configured: boolean
  connected: boolean
  provider?: 'hubspot'
  accountLabel?: string | null
  /**
   * Salle de démonstration (lot D01, #3719) : un connecteur CRM FICTIF est PROPOSÉ à la carte
   * d'export, marqué comme tel. `connected` reste `false` — aucune ligne `crm_connections`,
   * aucun jeton, aucun appel réseau — donc rien d'autre dans le produit ne le lit comme branché.
   */
  demo?: boolean
  connectedAt?: string
  /** Portées réellement accordées par le portail. */
  scopes?: string | null
  capabilities?: CrmCapabilities
}

const CONTACTS_READ_SCOPE = 'crm.objects.contacts.read'
const CONTACTS_WRITE_SCOPE = 'crm.objects.contacts.write'
const COMPANIES_READ_SCOPE = 'crm.objects.companies.read'
const DEALS_READ_SCOPE = 'crm.objects.deals.read'
const DEALS_WRITE_SCOPE = 'crm.objects.deals.write'

/**
 * Les capacités portées par un jeu de portées HubSpot.
 *
 * Tâches, réunions et notes sont des « engagements » : HubSpot les couvre par
 * leur propre portée quand le portail la déclare, et les rattache sinon à
 * l'écriture de contacts. On retient la plus permissive des deux — se tromper
 * dans l'autre sens grise un bouton qui fonctionne, ce qui est un mensonge
 * symétrique.
 */
export function crmCapabilities(scope: string | null | undefined): CrmCapabilities {
  const granted = grantedScopes(scope)
  const contactsWrite = hasScope(granted, CONTACTS_WRITE_SCOPE)
  const engagement = (own: string) => hasScope(granted, own) || contactsWrite
  return {
    contactsRead: hasScope(granted, CONTACTS_READ_SCOPE),
    contactsWrite,
    companiesRead: hasScope(granted, COMPANIES_READ_SCOPE),
    dealsRead: hasScope(granted, DEALS_READ_SCOPE),
    tasksWrite: engagement('crm.objects.tasks.write'),
    meetingsWrite: engagement('crm.objects.meetings.write'),
    notesWrite: engagement('crm.objects.notes.write'),
    // #1934.18 — pas de `engagement()` ici, et c'est délibéré : l'écriture de
    // contacts ne couvre pas les affaires chez HubSpot, et la retenir « par
    // permissivité » annoncerait une capacité qui échouerait au clic.
    dealsWrite: hasScope(granted, DEALS_WRITE_SCOPE),
  }
}

/**
 * L'échec d'une lecture CRM, dit à l'utilisateur.
 *
 * Deux causes qui n'appellent pas le même geste : une portée jamais accordée
 * (reconnecter — ça ne repassera pas tout seul) et une panne passagère
 * (réessayer). Les confondre derrière « erreur interne » a laissé deux écrans
 * morts sans que rien ne dise pourquoi.
 */
export function crmReadFailure(error: unknown, scopes: readonly string[] = CRM_READ_SCOPES): HttpException {
  const code = classifyProviderError(error)
  return connectorFailure({
    code,
    provider: 'hubspot',
    capability: 'crm',
    // Les portées de LECTURE, nommées. C'est précisément ce qui manquait le
    // 16/08 : le message disait « reconnecte », l'opérateur ne savait pas quoi
    // déclarer dans le portail avant que reconnecter serve à quelque chose.
    scopes,
    message: connectorMessage(code, 'ton CRM'),
  })
}

/** Les portées de lecture qu'un refus d'accès CRM désigne, faute de mieux :
 *  le fournisseur dit « required scopes » sans jamais dire lesquelles. */
export const CRM_READ_SCOPES = [CONTACTS_READ_SCOPE, COMPANIES_READ_SCOPE, DEALS_READ_SCOPE] as const

type CallbackResult = { ok: boolean; reason?: string }

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Même module : GA-07 compte les imports service → service ENTRE modules,
    // et la porte d'écriture appartient au CRM.
    private readonly outbound: OutboundWriteService,
    // Product analytics — best-effort, `@Optional()` for spec construction.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Adoption d'une valeur du CRM sur un champ de contact (arbitrage 03/08).
    // `@Optional()` comme ses voisins : absent (specs à constructeur nu), le
    // geste rend `adopted: false` et rien n'est écrit.
    @Optional()
    @InjectRepository(ContactEntity)
    private readonly contacts?: Repository<ContactEntity>,
    // SCOPES-I — l'écart de portées au retour du consentement ; absent, la connexion se fait comme avant.
    @Optional() @Inject(SCOPE_GAP_RECORDER) private readonly scopeGaps?: ScopeGapRecorder,
    // SYNC-B — la première reprise part SEULE au branchement (best-effort, jamais bloquante).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  private requireConfig(): HubspotConfig {
    const config = readHubspotConfig()
    if (!config) {
      throw new ServiceUnavailableException('CRM integration is not configured on this server')
    }
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['HUBSPOT_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('CRM state signing requires INTERNAL_API_SECRET or HUBSPOT_CLIENT_SECRET')
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

  /** Current connection status for the caller's workspace. When HubSpot isn't
   *  configured we return early WITHOUT touching the DB: the feature is off, and
   *  this keeps the endpoint healthy even if the `crm_connections` migration
   *  hasn't been run yet in that environment (no 500 spam on the Connaissances
   *  screen). Multi-user Phase 2: the CRM link is a team resource — scoped by the
   *  caller's active workspace, not their user id (identical today, 1 user = 1
   *  workspace). */
  async getStatus(userId: string): Promise<CrmStatus> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return { configured: false, connected: false, demo: true, accountLabel: DEMO_CRM_ACCOUNT_LABEL }
    }
    if (readHubspotConfig() === null) return { configured: false, connected: false }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
    })
    if (!conn) return { configured: true, connected: false }
    return {
      configured: true,
      connected: true,
      provider: 'hubspot',
      accountLabel: conn.account_label,
      connectedAt: conn.created_at?.toISOString(),
      scopes: conn.scope,
      capabilities: crmCapabilities(conn.scope),
    }
  }

  /** Build the HubSpot consent URL the browser is redirected to. */
  buildAuthorizeUrl(userId: string): string {
    const config = this.requireConfig()
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      state: this.signState(userId),
    })
    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  }

  /** Handle the OAuth redirect: exchange the code, persist an encrypted
   *  connection. Never throws to the browser — returns a result the controller
   *  turns into a redirect with a friendly reason. */
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
      const client = new HubspotClient(config)
      const tokens = await client.exchangeCode(code)
      const info = await client.tokenInfo(tokens.accessToken)
      await this.upsertConnection(userId, workspaceId, tokens, info.hubId, info.hubDomain, info.scopes ?? config.scopes)
      await this.scopeGaps?.recordGrant('hubspot', userId, workspaceId, info.scopes)
      // Journal d'activité — CRM connected (provider name only, never a token).
      void this.analytics?.track('integration_connected', { userId, workspaceId, properties: { provider: 'hubspot' } })
      void this.firstImport?.enqueue({ userId, workspaceId, provider: 'hubspot' })
      return { ok: true }
    } catch (error) {
      this.logger.error('HubSpot OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  private async upsertConnection(
    userId: string,
    workspaceId: string,
    tokens: { accessToken: string; refreshToken: string | null; expiresIn: number },
    hubId: string | null,
    hubDomain: string | null,
    scope: string,
  ): Promise<void> {
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null
    const existing = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
    })
    // Keep `user_id` as created-by attribution; `workspace_id` is the read scope.
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      provider: 'hubspot' as const,
      external_account_id: hubId,
      account_label: hubDomain ?? hubId,
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
    await this.clearProbeFailures(workspaceId)
  }

  /**
   * J.1 — une reconnexion réussie remet à zéro les ÉCHECS de sonde HubSpot de l'espace : ils datent d'avant
   * les nouvelles portées (« je n'ai pas le droit de regarder ») et resteraient « Dégradé » à jamais. La ligne
   * redevient « jamais vérifié » ; une capacité dont la portée manque encore se dérive des portées, pas de la sonde.
   * Les preuves réussies restent. Best-effort : le jeton est déjà posé, un nettoyage manqué ne défait pas la connexion.
   */
  private async clearProbeFailures(workspaceId: string): Promise<void> {
    try {
      await this.connections.manager.query(
        `UPDATE connector_capability_probes
            SET last_error_code = NULL, last_error_at = NULL, updated_at = now()
          WHERE workspace_id = $1 AND provider = 'hubspot' AND last_error_at IS NOT NULL`,
        [workspaceId],
      )
    } catch (error) {
      this.logger.warn('Échecs de sonde HubSpot non remis à zéro', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Decrypt + refresh (if near expiry) the workspace's access token. */
  private async getValidAccessToken(workspaceId: string): Promise<string> {
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
    })
    // 412 et non 404 : la ROUTE existe et la ressource n'est pas « introuvable » —
    // il manque une CONDITION, un CRM connecté à cet espace. Le 404 se lisait en
    // supervision comme un chemin cassé, et c'est le rapport de pipeline qui le
    // rendait, sur un écran où l'absence de CRM est un état normal.
    if (!conn) {
      throw new PreconditionFailedException(
        'Aucun CRM connecté à cet espace. Connecte-le depuis Réglages › Intégrations.',
      )
    }

    const notExpiring = !conn.expires_at || conn.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (notExpiring) return decryptToken(conn.access_token_enc)

    // #1836 — la connexion EXISTE, et elle est morte. Le 503 nu d'avant
    // (`'CRM token expired and cannot be refreshed'`, en anglais, sans `code`)
    // se rendait à l'écran en « panne du produit » : l'écran retirait le lien
    // vers Intégrations, parce qu'une panne ne s'y répare pas. Le geste, lui,
    // existait — reconnecter — et il était le seul qui répare.
    if (!conn.refresh_token_enc) {
      throw authorizationExpired({ provider: 'hubspot', capability: 'crm', capabilityLabel: 'ton CRM' })
    }
    const client = new HubspotClient(this.requireConfig())
    const refreshToken = conn.refresh_token_enc
    // #1836 — l'autre moitié : quand le portail REFUSE le rafraîchissement
    // (consentement retiré, mot de passe changé), l'erreur brute remontait nue
    // et le filtre global la rendait en 500 « erreur interne ». La trace était
    // pourtant déjà posée en base : le produit SAVAIT. `crmReadFailure` classe —
    // un refus de grant devient « reconnecte », une coupure réseau reste une
    // panne, parce qu'un refus passager ne condamne pas une liaison saine.
    let refreshed: Awaited<ReturnType<HubspotClient['refresh']>>
    try {
      refreshed = await refreshTrackingFailure(
        () => client.refresh(decryptToken(refreshToken)),
        () => this.connections.update({ id: conn.id }, { refresh_failed_at: new Date() }),
      )
    } catch (error) {
      throw crmReadFailure(error)
    }
    await this.connections.update(
      { id: conn.id },
      {
        access_token_enc: encryptToken(refreshed.accessToken),
        refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
        expires_at: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        refresh_failed_at: null,
      },
    )
    return refreshed.accessToken
  }

  /**
   * Push a contact into the workspace's HubSpot. Two-way write: matched by email,
   * an existing contact is UPDATED in place rather than duplicated; only a truly
   * new contact is created. `created` tells the caller which happened.
   */
  /**
   * La porte de BEL-INT-603 : toute écriture CRM y passe.
   *
   * Un geste d'UTILISATEUR est auto-approuvé — le clic EST la décision, et
   * l'écran vient de montrer champ par champ ce qui sera écrit. Un geste de
   * SYSTÈME (une routine, un versement de téléphonie, un reflet d'interaction
   * réseau) ne part plus tout seul : la demande reste en attente, visible, avec
   * sa prévisualisation figée. C'est la conséquence assumée de l'arbitrage
   * « toutes les écritures CRM », et elle est le vrai changement.
   *
   * Rend `null` quand l'écriture est retenue. Le `null` remonte à l'appelant,
   * qui le DIT — rendre un succès muet serait le pire des deux mondes.
   */
  private async gate(
    userId: string,
    workspaceId: string,
    kind: OutboundWriteKind,
    payload: Record<string, unknown>,
    gate?: CrmWriteGate,
  ): Promise<string | null> {
    const decision = await this.outbound.request({
      workspaceId,
      userId,
      provider: 'hubspot',
      kind,
      payload,
      origin: gate?.origin ?? 'user',
      idempotencyKey: gate?.idempotencyKey ?? null,
      source: gate?.source ?? null,
    })
    if (decision.decision === 'write_now') return decision.request.id
    // `already_done` : une autre instance a déjà pris la demande. Ne pas
    // réécrire est le résultat voulu — en déposer deux dans un CRM ne se répare
    // pas.
    return null
  }

  /**
   * #1943.8 — ÉCRIRE une demande de système VALIDÉE (BEL-INT-603).
   *
   * Le défaut signalé par L2 : `requireApproved` n'avait aucun appelant, donc une
   * demande retenue puis validée par un humain passait `approved` et rien ne
   * partait jamais. Ce chemin est le seul qui la fait partir, et il tient quatre
   * règles :
   *  - **une fois** : la demande est réclamée (`approved → writing`, atomique)
   *    avant l'appel au fournisseur ;
   *  - **par la même porte, telle que montrée** : la charge utile FIGÉE à la
   *    demande, jamais recalculée, jamais complétée ;
   *  - **jamais sans validation humaine, jamais une demande auto-approuvée**
   *    (`claimApprovedWrite`) ;
   *  - **un délai n'est pas un échec** : partie sans réponse → `unknown`, qui ne
   *    se retente pas ; jamais établie → `failed`.
   *
   * Seules les écritures que CE service sait faire partent d'ici ; une autre
   * (autre fournisseur, autre type) reste validée et le dit — rien n'est écrit
   * ailleurs à sa place.
   */
  async writeApproved(workspaceId: string, requestId: string): Promise<OutboundWriteRequestEntity> {
    const request = await this.outbound.requireApproved(workspaceId, requestId)
    if (request.provider !== 'hubspot' || !APPROVED_HUBSPOT_WRITES.has(request.kind)) {
      throw new ConflictException("Validée, mais cette écriture ne peut pas partir d'ici : rien n'a été écrit.")
    }
    const config = this.requireConfig()
    // Le jeton AVANT la réclamation : un jeton illisible prouve que rien n'est
    // parti, et la demande reste validée plutôt que d'être marquée « en vol ».
    const accessToken = await this.getValidAccessToken(workspaceId)
    const claimed = await this.outbound.claimApprovedWrite(workspaceId, requestId)
    try {
      const written = await performApprovedHubspotWrite(new HubspotClient(config), accessToken, claimed)
      await this.outbound.recordOutcome(claimed.id, { ok: true, response: written.id })
      await this.touchLastUsed(workspaceId)
      return { ...claimed, state: 'written', provider_response: written.id }
    } catch (error) {
      // Un timeout n'est pas un échec : la seule question est « la requête a-t-elle pu PARTIR ? ».
      const outcome = dispatchFailureOutcome(error)
      const response = error instanceof Error ? error.message : String(error)
      if (outcome === 'unknown') await this.outbound.recordUnknown(claimed.id, response)
      else await this.outbound.recordOutcome(claimed.id, { ok: false, response })
      this.logger.error('Écriture CRM validée non aboutie', {
        error,
        tags: { 'crm.write_outcome': outcome, 'crm.write_kind': claimed.kind },
      })
      return { ...claimed, state: outcome, provider_response: response }
    }
  }

  /**
   * #1934.18 — PROPOSE un changement de stade. Elle n'écrit RIEN.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CELLE-CI NE S'AUTO-APPROUVE JAMAIS
   * ─────────────────────────────────────────────────────────────────────────
   * Les autres écritures de ce service prennent `origin` de leur appelant : un
   * clic sur un écran qui vient de montrer champ par champ ce qui part est une
   * décision, et le clic EST la décision. Ici, non — et le mot `system` est
   * écrit EN DUR, sans paramètre pour l'ouvrir :
   *
   *  - le stade vient d'un MODÈLE, pas de la personne. Elle a retenu une phrase
   *    (« Négociation, parce qu'ils ont demandé un devis »), pas un diff ;
   *  - elle n'a pas vu ce que l'écriture déplace : QUELLE affaire, et depuis
   *    QUEL stade. Cette lecture-là n'existe qu'au moment de la validation,
   *    dans la prévisualisation figée ;
   *  - un stade est le pipeline du client, le chiffre qu'il relit le lundi.
   *
   * C'est donc un geste de SYSTÈME au sens de la doctrine : demande VISIBLE
   * (Centre d'actions, onglet « À valider »), prévisualisation FIGÉE,
   * expiration 3 jours. Rien ne part avant `writeApproved`, et `writeApproved`
   * n'accepte qu'une demande tranchée par quelqu'un.
   *
   * Rend l'identifiant de la demande — celle qui existait déjà quand la clé
   * d'idempotence en retrouve une, plutôt qu'une seconde ligne pour le même
   * rendez-vous.
   */
  async proposeDealStage(
    userId: string,
    input: {
      dealId: string
      /** L'IDENTIFIANT du stade, tel que `dealPipelines` l'a rendu. Jamais un libellé. */
      stageId: string
      rationale?: string
      idempotencyKey?: string | null
      /** #2855 — le compte rendu qui a composé la proposition, quand l'appelant le connaît. */
      source?: WriteSource
      /** #2854 (#2201.9) — le LOT auquel cette proposition appartient, posé par {@link proposeBatch}. */
      batchId?: string | null
    },
  ): Promise<{ requestId: string; pending: boolean }> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(config)

    // ⚠️ L'affaire est relue sur le PORTAIL, pas prise à l'écran : son nom, son
    // stade actuel et surtout son pipeline figent la prévisualisation. Un écran
    // resté ouvert une heure ne fait pas approuver un état périmé.
    const deal = await client.getDeal(accessToken, input.dealId)
    const read = await this.readDealPipelines(client, accessToken)
    if (read.status !== 'ready') {
      throw new PreconditionFailedException(
        'Les stades de ton CRM sont illisibles : aucune proposition de stade n’a été déposée.',
      )
    }
    const pipeline = read.pipelines.find(candidate => candidate.id === deal.pipeline)
    // Égalité STRICTE sur l'identifiant, dans le pipeline DE L'AFFAIRE. Un
    // libellé (« Négociation ») n'est pas un identifiant, et un stade d'un autre
    // pipeline — même au libellé identique — serait refusé par le portail ou,
    // pire, rangerait l'affaire ailleurs.
    const target = pipeline?.stages.find(stage => stage.id === input.stageId)
    if (!pipeline || !target) {
      throw new BadRequestException('Ce stade n’existe pas dans le pipeline de cette affaire : rien n’a été proposé.')
    }
    const current = pipeline.stages.find(stage => stage.id === deal.stage)

    const decision = await this.outbound.request({
      workspaceId,
      userId,
      provider: 'hubspot',
      kind: 'update_deal_stage',
      payload: {
        dealName: deal.name ?? '',
        dealId: deal.id,
        pipeline: pipeline.label,
        // Le LIBELLÉ se lit ; l'IDENTIFIANT part. Les deux sont figés ensemble,
        // parce que c'est la paire que la personne approuve.
        stage: target.label,
        stageId: target.id,
        rationale: input.rationale ?? '',
      },
      // ⚠️ EN DUR. Voir le bloc ci-dessus : ce n'est pas un défaut qu'un
      // appelant pourrait changer, c'est la règle de cette nature d'écriture.
      origin: 'system',
      idempotencyKey: input.idempotencyKey ?? null,
      source: input.source ?? null,
      batchId: input.batchId ?? null,
      // ⚠️ Posée seulement quand le stade actuel est RECONNU dans le pipeline :
      // sinon « non renseigné → Négociation » affirmerait un vide qu'on n'a pas lu.
      ...(current ? { previous: { stage: current.label, stageId: current.id } } : {}),
    })
    return { requestId: decision.request.id, pending: decision.decision === 'pending' }
  }

  /**
   * #2777 — PROPOSE une opportunité candidate comme Deal. Elle n'écrit RIEN.
   *
   * Même raisonnement que {@link proposeDealStage}, en plus simple : le titre
   * vient de l'extraction d'un compte rendu (un MODÈLE), pas d'un champ que la
   * personne a relu — cliquer « Valider » sur la carte retient la PHRASE
   * proposée, ça ne prouve pas qu'elle a vérifié ce qui partira dans son CRM.
   * `origin` reste donc EN DUR à `system`, sans paramètre pour l'ouvrir : la
   * demande est déposée, visible, en attente d'une prévisualisation figée —
   * jamais auto-approuvée par le clic qui l'a produite.
   *
   * Aucune lecture préalable du portail n'est nécessaire ici (contrairement au
   * stade) : créer un Deal ne déplace rien d'existant, il n'y a donc pas d'état
   * antérieur à figer.
   */
  async proposeCreateDeal(
    userId: string,
    input: {
      title: string
      /** Le compte concerné, résolu par l'appelant — jamais un nom fourni tel quel. */
      accountName?: string
      idempotencyKey?: string | null
      /** #2855 — le compte rendu qui a composé la proposition. */
      source?: WriteSource
      /** #2854 (#2201.9) — le LOT auquel cette proposition appartient, posé par {@link proposeBatch}. */
      batchId?: string | null
    },
  ): Promise<{ requestId: string; pending: boolean }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const decision = await this.outbound.request({
      workspaceId,
      userId,
      provider: 'hubspot',
      kind: 'create_deal',
      payload: {
        subject: input.title,
        ...(input.accountName ? { company: input.accountName } : {}),
      },
      // ⚠️ EN DUR — voir le bloc ci-dessus.
      origin: 'system',
      idempotencyKey: input.idempotencyKey ?? null,
      source: input.source ?? null,
      batchId: input.batchId ?? null,
    })
    return { requestId: decision.request.id, pending: decision.decision === 'pending' }
  }

  /**
   * #2854 (#2201.9) — « FUSION FILE UNIQUE : ACTIONS EN MASSE ».
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * CE QUE `OutboundWriteService.requestBatch` NE POUVAIT PAS ENCORE FAIRE
   * ─────────────────────────────────────────────────────────────────────────────
   * Il posait déjà un `batch_id` partagé sur des écritures BRUTES
   * (`kind`+`payload` fournis tels quels) — utile pour un test, dangereux pour un
   * endpoint HTTP : un appelant aurait pu déposer n'importe quel `payload` sous
   * n'importe quel `kind`, en contournant la validation métier PROPRE à chaque
   * proposition (`proposeDealStage` relit le pipeline du portail, `proposeCreateDeal`
   * résout le compte). C'est exactement l'objection qui a gardé ce point « hors
   * lot » (bilan du 27/09 11:40Z) : « un endpoint générique kind+payload
   * laisserait un appelant contourner cette validation par nature ».
   *
   * `proposeBatch` ferme ce trou sans le rouvrir : elle n'accepte AUCUN
   * `kind`/`payload` libre, seulement des items TYPÉS qui redirigent chacun vers
   * la méthode `propose*` qui existait déjà pour lui — donc SA validation
   * complète, inchangée. Ce qui est neuf, c'est le `batchId` PARTAGÉ que cette
   * méthode génère une fois et distribue à chaque item, pour que l'écran les
   * retrouve groupés ({@link OutboundWriteService.findByBatch}) — jamais une
   * fausse carte unique : chaque item garde son propre état, sa propre décision
   * (même principe que {@link OutboundWriteService.bulkReject}, GA-26 : une seule
   * porte, jamais une règle dupliquée).
   *
   * Un lot VIDE ne pose aucun `batchId` — rien à regrouper, en inventer un serait
   * la donnée fictive que la doctrine refuse. Un item qui échoue sa propre
   * validation (ex. stade inconnu) est rapporté `failed`, JAMAIS silencieux : un
   * succès partiel n'est pas un succès global.
   */
  async proposeBatch(
    userId: string,
    items: ReadonlyArray<
      | ({ kind: 'deal_stage' } & Parameters<CrmService['proposeDealStage']>[1])
      | ({ kind: 'create_deal' } & Parameters<CrmService['proposeCreateDeal']>[1])
    >,
  ): Promise<{
    batchId: string | null
    results: Array<
      | { kind: 'deal_stage' | 'create_deal'; ok: true; requestId: string; pending: boolean }
      | { kind: 'deal_stage' | 'create_deal'; ok: false; reason: string }
    >
  }> {
    if (items.length === 0) return { batchId: null, results: [] }

    const batchId = randomUUID()
    const results: Array<
      | { kind: 'deal_stage' | 'create_deal'; ok: true; requestId: string; pending: boolean }
      | { kind: 'deal_stage' | 'create_deal'; ok: false; reason: string }
    > = []
    for (const item of items) {
      try {
        const proposal =
          item.kind === 'deal_stage'
            ? await this.proposeDealStage(userId, { ...item, batchId })
            : await this.proposeCreateDeal(userId, { ...item, batchId })
        results.push({ kind: item.kind, ok: true, requestId: proposal.requestId, pending: proposal.pending })
      } catch (error) {
        results.push({
          kind: item.kind,
          ok: false,
          reason: error instanceof Error ? error.message : 'Proposition refusée.',
        })
      }
    }
    return { batchId, results }
  }

  /** La salle de démonstration ? Une seule question, posée par les lecteurs du CRM (pipeline, statut). */
  isDemoUser(userId: string): Promise<boolean> {
    return this.workspaceContext.isDemoWorkspace(userId)
  }

  /**
   * #1934.18 — les pipelines d'affaires du portail, pour que l'écran propose
   * des stades RÉELS.
   *
   * Un ÉTAT, jamais une liste nue : « aucun CRM », « stades illisibles » et
   * « prêt » appellent trois phrases différentes, et une liste vide les rendrait
   * identiques. Un portail qui ne rend aucun pipeline est ILLISIBLE (`empty`),
   * pas « prêt avec zéro stade » — l'écran fermerait sinon un bouton sans dire
   * pourquoi.
   */
  async dealPipelines(userId: string): Promise<DealPipelinesRead> {
    const config = readHubspotConfig()
    if (!config) return { status: 'not_connected', pipelines: [] }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const connection = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
    })
    if (!connection) return { status: 'not_connected', pipelines: [] }
    let accessToken: string
    try {
      accessToken = await this.getValidAccessToken(workspaceId)
    } catch (error) {
      return { status: 'unreadable', reason: classifyProviderError(error), pipelines: [] }
    }
    return this.readDealPipelines(new HubspotClient(config), accessToken)
  }

  private async readDealPipelines(client: HubspotClient, accessToken: string): Promise<DealPipelinesRead> {
    try {
      const pipelines = (await client.listDealPipelines(accessToken)).filter(pipeline => pipeline.stages.length > 0)
      if (pipelines.length === 0) return { status: 'unreadable', reason: 'empty', pipelines: [] }
      return { status: 'ready', pipelines }
    } catch (error) {
      this.logger.warn('Lecture des pipelines d’affaires impossible', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { status: 'unreadable', reason: classifyProviderError(error), pipelines: [] }
    }
  }

  async exportContact(userId: string, input: HubspotContactInput, gate?: CrmWriteGate): Promise<UpsertResult | null> {
    // Lot D01 (06/10/2026, #3719) — salle de démonstration : le geste se joue de bout en bout
    // contre le connecteur FICTIF, SANS écriture externe (ni jeton, ni porte, ni requête réseau).
    // L'identifiant rendu est dérivé de l'adresse : rejouer le geste « met à jour » au lieu de recréer.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return {
        id: `demo-${createHash('sha256')
          .update(input.email ?? '')
          .digest('hex')
          .slice(0, 12)}`,
        created: true,
      }
    }
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const requestId = await this.gate(userId, workspaceId, 'export_contact', { ...input }, gate)
    if (!requestId) return null
    const result = await this.upsertContactDirect(userId, input)
    await this.outbound.recordOutcome(requestId, { ok: true, response: result.id })
    return result
  }

  /**
   * #4185 — l'écriture HubSpot NUE, sans porte : ce que l'adaptateur commun
   * appelle une fois que `CrmWriteService` a obtenu le feu vert. N'appeler
   * QUE derrière la porte (garde `crm-ecritures-passent-par-la-porte.spec.ts`).
   */
  async upsertContactDirect(userId: string, input: HubspotContactInput): Promise<UpsertResult> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const result = await client.upsertContact(accessToken, input)
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, result.created)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'hubspot' },
    })
    return result
  }

  /**
   * Export a besoin as a **Deal** (Théo TF1 p39 — a besoin is a would-be
   * opportunity; its idiomatic HubSpot object is a Deal, not a task). Same
   * connection/token path as `exportContact`; the caller (CrmTaskService)
   * composed the factual subject/body/company from the stored besoin. Returns the
   * created Deal id + the object kind so the UI confirms honestly what it pushed.
   */
  async exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const result = await client.createDeal(accessToken, input)
    await this.touchLastUsed(workspaceId)
    await this.recordExport(userId, workspaceId, true)
    void this.analytics?.track('export_performed', {
      userId,
      workspaceId,
      properties: { destination: 'hubspot', kind: 'deal' },
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
        metadata: { detail: 'Export HubSpot', provider: 'hubspot', created },
      })
    } catch (error) {
      this.logger.warn('Failed to record HubSpot export action (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
    }
  }

  /**
   * L'espace de l'appelant et un jeton d'accès valide, pour les services voisins
   * du module (profondeur CRM).
   *
   * Volontairement étroit : cette méthode ne fait qu'ouvrir la porte, elle ne
   * prête pas le client. `CrmService` reste le seul endroit qui sait rafraîchir
   * un jeton et le seul qui touche à `crm_connections` — un second service qui
   * ferait son propre refresh finirait par écraser celui-ci en concurrence.
   */
  async resolveAccess(userId: string): Promise<{ workspaceId: string; accessToken: string }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    return { workspaceId, accessToken }
  }

  /** L'identifiant de la société du portail pour un compte, ou `null`. Exposé
   *  pour que la création de société n'en fabrique pas un doublon. */
  async findCompanyIdFor(userId: string, q: { name?: string; domain?: string }): Promise<string | null> {
    const { accessToken } = await this.resolveAccess(userId)
    const client = new HubspotClient(this.requireConfig())
    return client.findCompanyId(accessToken, q)
  }

  /** Import a page of the workspace's HubSpot contacts (paginated by cursor). */
  async listContacts(userId: string, opts: { limit: number; after?: string; since?: string }): Promise<CrmContactPage> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    // SYNC-C — « depuis » : l'API search (la liste simple n'a pas de filtre de date).
    if (opts.since) {
      const { contacts, nextAfter } = await client.searchModifiedSince(accessToken, 'contacts', {
        since: opts.since,
        limit: opts.limit,
        ...(opts.after ? { after: opts.after } : {}),
      })
      return { contacts, nextAfter }
    }
    return client.listContacts(accessToken, { limit: opts.limit, ...(opts.after ? { after: opts.after } : {}) })
  }

  /** HJ.4 — une page des affaires du portail, pour la lecture commune (`read.deals`). */
  async listDeals(userId: string, opts: { limit: number; after?: string }): Promise<HubspotDealPage> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    return client.listDeals(accessToken, opts)
  }

  /** SYNC-A — une page des activités du portail (appels, rendez-vous, tâches, notes), pour le miroir. */
  async listActivities(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    const { client, accessToken } = await this.readClient(userId)
    return client.listActivities(accessToken, opts)
  }

  /** SYNC-A — les propriétaires du portail (portée `crm.objects.owners.read`). */
  async listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    const { client, accessToken } = await this.readClient(userId)
    return client.listOwners(accessToken, opts)
  }

  /** SYNC-A — les pipelines d'affaires et leurs étapes (une seule page : HubSpot les rend tous). */
  async listPipelines(userId: string, _opts: CrmReadOptions): Promise<CrmPipelinePage> {
    const { client, accessToken } = await this.readClient(userId)
    return client.listPipelines(accessToken)
  }

  /** SYNC-A — le client et le jeton de l'espace actif, pour une lecture. */
  private async readClient(userId: string): Promise<{ client: HubspotClient; accessToken: string }> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    return { client: new HubspotClient(this.requireConfig()), accessToken }
  }

  /** #2388.24 — import a page of the workspace's HubSpot companies (paginated by cursor). */
  async listCompanies(
    userId: string,
    opts: { limit: number; after?: string; since?: string },
  ): Promise<CrmCompanyPage> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    if (opts.since) {
      const { companies, nextAfter } = await client.searchModifiedSince(accessToken, 'companies', {
        since: opts.since,
        limit: opts.limit,
        ...(opts.after ? { after: opts.after } : {}),
      })
      return { companies, nextAfter }
    }
    return client.listCompanies(accessToken, { limit: opts.limit, ...(opts.after ? { after: opts.after } : {}) })
  }

  /**
   * Log an activity (Note engagement) back onto a HubSpot contact's timeline —
   * e.g. "email envoyé depuis Bellum". Returns the created note id.
   */
  async logActivity(
    userId: string,
    contactId: string,
    note: string,
    gate?: CrmWriteGate,
  ): Promise<{ id: string } | null> {
    this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const requestId = await this.gate(userId, workspaceId, 'create_note', { externalId: contactId, note }, gate)
    if (!requestId) return null
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const result = await client.logActivity(accessToken, contactId, note)
    await this.outbound.recordOutcome(requestId, { ok: true, response: result.id })
    await this.touchLastUsed(workspaceId)
    return result
  }

  /** Stamp the connection's last REAL use (Tool Registry v2 `last_sync` — an
   *  export/log, not a token refresh). Best-effort: a bookkeeping blip must
   *  never fail a successful CRM write. */
  private async touchLastUsed(workspaceId: string): Promise<void> {
    try {
      await this.connections.update(
        { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
        { last_used_at: new Date() },
      )
    } catch (error) {
      this.logger.warn('Failed to stamp HubSpot last_used_at (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Drop the workspace's connection (does not revoke server-side at HubSpot). */

  /**
   * Crée une tâche de relance dans le CRM (§5.3 n°1 des méta-analyses).
   *
   * Le contact est optionnel : « rappeler ACME jeudi » est une tâche valable
   * même quand on ne sait pas encore à qui parler. Ce qui n'est PAS optionnel,
   * c'est l'échéance — une tâche sans date ne remonte dans aucune vue et ne
   * sert donc à personne.
   */
  async createTask(
    userId: string,
    input: { contactId?: string | null; subject: string; body?: string; dueAt: string },
    gate?: CrmWriteGate,
  ): Promise<{ id: string } | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // `create_task` est déclaré parmi les sept écritures gouvernées depuis le
    // 21/08 et n'y passait jamais : il écrivait chez le fournisseur en direct.
    // Un geste d'UTILISATEUR reste auto-approuvé — le clic EST la décision —
    // mais il est désormais TRACÉ, ce qui est tout l'objet de la porte.
    const requestId = await this.gate(userId, workspaceId, 'create_task', { ...input }, gate)
    if (!requestId) return null
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const result = await client.createTask(accessToken, input)
    await this.outbound.recordOutcome(requestId, { ok: true, response: result.id })
    await this.touchLastUsed(workspaceId)
    return result
  }

  /**
   * Clôture une tâche déjà créée (#2319.114, épopée #2985) — MÊME porte
   * d'écriture que les autres écritures CRM, un geste d'utilisateur reste
   * auto-approuvé (le clic « Marquer comme faite » EST la décision).
   */
  async closeTask(
    userId: string,
    input: { taskId: string; subject?: string },
    gate?: CrmWriteGate,
  ): Promise<{ id: string } | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const requestId = await this.gate(
      userId,
      workspaceId,
      'close_task',
      { externalId: input.taskId, ...(input.subject ? { subject: input.subject } : {}) },
      gate,
    )
    if (!requestId) return null
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const result = await client.closeTask(accessToken, input.taskId)
    await this.outbound.recordOutcome(requestId, { ok: true, response: result.id })
    await this.touchLastUsed(workspaceId)
    return result
  }

  /**
   * Journalise une réunion tenue.
   *
   * `externalId` (l'identifiant de l'évènement d'agenda) est la clé
   * d'idempotence : rejouer le log d'une semaine ne doit pas créer deux
   * réunions pour le même rendez-vous. Le CRM ne dédoublonne pas pour nous, donc
   * l'appelant garde la trace de ce qu'il a déjà journalisé.
   */
  async logMeeting(
    userId: string,
    input: {
      contactId?: string | null
      title: string
      body?: string
      startsAt: string
      endsAt: string
      externalId?: string
    },
    gate?: CrmWriteGate,
  ): Promise<{ id: string } | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // L'`externalId` sert DEUX fois : clé d'idempotence de la porte (un rejeu
    // retrouve la demande au lieu d'en créer une seconde) et clé de
    // dédoublonnage côté fournisseur. Sans lui, journaliser une semaine deux
    // fois déposerait deux réunions pour le même rendez-vous.
    const requestId = await this.gate(
      userId,
      workspaceId,
      'log_meeting',
      { ...input },
      {
        origin: gate?.origin ?? 'user',
        idempotencyKey: gate?.idempotencyKey ?? input.externalId ?? null,
      },
    )
    if (!requestId) return null
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const result = await client.createMeeting(accessToken, input)
    await this.outbound.recordOutcome(requestId, { ok: true, response: result.id })
    await this.touchLastUsed(workspaceId)
    return result
  }

  /** Les contacts sans activité depuis `days` jours — « à relancer » et
   *  « dormants » sont la même question posée avec deux seuils. */
  async listStaleContacts(
    userId: string,
    days: number,
    limit = 20,
  ): Promise<Array<{ id: string; name: string | null; email: string | null; lastActivityAt: string | null }>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    try {
      return await client.searchStaleContacts(accessToken, days, limit)
    } catch (error) {
      this.logger.error(`CRM stale contacts failed: ${(error as Error).message}`, {
        error,
        tags: { 'crm.provider': 'hubspot' },
      })
      throw crmReadFailure(error)
    }
  }

  /**
   * Les doublons probables du CRM (déclencheur n°17).
   *
   * On PROPOSE, on ne fusionne jamais : fusionner est irréversible côté CRM et
   * un faux positif détruit l'historique d'un vrai client. Chaque paire porte
   * sa raison et sa confiance, affichées telles quelles.
   */
  async findDuplicates(userId: string, limit = 25): Promise<DuplicatePair[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const records = await client.listContactsForAnalysis(accessToken)
    return findDuplicatePairs(records, limit)
  }

  /** Les fiches auxquelles il manque de quoi travailler (déclencheur n°24). */
  async findIncomplete(userId: string, limit = 50): Promise<IncompleteRecord[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getValidAccessToken(workspaceId)
    const client = new HubspotClient(this.requireConfig())
    const records = await client.listContactsForAnalysis(accessToken)
    return findIncompleteRecords(records, limit)
  }

  /** Un CRM est-il connecté pour cet utilisateur ? Lecture sans effet de bord. */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const status = await this.getStatus(userId)
      return Boolean(status.connected)
    } catch {
      return false
    }
  }

  /**
   * Déconnecte le CRM de l'ESPACE — et le RÉVOQUE chez le fournisseur.
   *
   * Ici la portée d'espace est la bonne : un CRM est l'outil de l'entreprise,
   * pas la boîte mail de quelqu'un. Ce qui manquait, c'est la révocation :
   * effacer la ligne laissait le jeton de rafraîchissement parfaitement valide
   * côté portail, et l'application listée dans ses intégrations. « Ce qui est
   * supprimé : les jetons » était donc faux.
   *
   * Best-effort : si le portail ne répond pas, on efface quand même. Retenir la
   * connexion parce que la révocation a échoué laisserait l'utilisateur sans
   * aucun moyen de partir.
   */
  async disconnect(userId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
    })
    if (!conn) return
    if (conn.refresh_token_enc) {
      try {
        await new HubspotClient(this.requireConfig()).revoke(decryptToken(conn.refresh_token_enc))
      } catch (error) {
        this.logger.warn('HubSpot token revocation failed (connection removed anyway)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    await this.connections.delete({ id: conn.id })
  }

  /**
   * Presence read-back (roadmap §8/§9) : is this account already in the team's
   * HubSpot? Returns known contacts, OPEN deals and the freshest activity date.
   * Honest by construction: not configured / not connected → `provider: null`;
   * connected but no match (or a read error) → `provider: 'hubspot'`,
   * `matched: false`, empty lists. NEVER an invented record.
   */
  /**
   * La fiche CRM d'UN contact, lue par son e-mail (recette finale §58, P1-07).
   *
   * L'export existait — Bellum pousse un contact vers le CRM — mais rien ne
   * lisait dans l'autre sens au niveau du contact. Conséquence concrète :
   * « déjà connu » ne connaissait que ce que NOUS avions poussé. Un collègue
   * qui ajoute la fiche à la main restait invisible, et le produit proposait
   * d'aller contacter quelqu'un que l'équipe travaille déjà.
   *
   * `null` couvre tout ce qui n'est pas un match certain : pas de CRM connecté
   * (aucun appel réseau), pas d'e-mail à chercher, aucune fiche, ou lecture en
   * échec. Un `null` se lit « on ne sait pas », jamais « ce contact est
   * inconnu du CRM » — conclure l'absence d'une lecture ratée ferait
   * réapparaître exactement le doublon qu'on veut éviter.
   */
  async findContactRecord(userId: string, email: string | null | undefined): Promise<CrmContactSnapshot | null> {
    const address = (email ?? '').trim()
    if (!address || readHubspotConfig() === null) return null
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const conn = await this.connections.findOne({
        where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
      })
      if (!conn) return null

      const accessToken = await this.getValidAccessToken(workspaceId)
      const client = new HubspotClient(this.requireConfig())
      // #2261.13 (19/09) — `lastModifiedAt` est l'horodatage SOURCE que la
      // mesure de latence réclame (`CrmSyncService.syncOne`, qui appelle cette
      // méthode, l'enregistre comme une observation réelle).
      const found = await client.findContactByEmail(accessToken, address)
      if (!found) return null

      return { recordId: found.id, provider: 'hubspot', email: address, lastActivityAt: found.lastModifiedAt }
    } catch (error) {
      this.logger.warn('CRM contact lookup failed — treated as unknown, never as absent', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return null
    }
  }

  /**
   * Adopte la valeur du CRM sur UN champ d'un contact (arbitrage Louis, 03/08).
   *
   * La règle par défaut est que Bellum fait foi : une donnée enrichie récemment
   * vaut mieux qu'une fiche CRM qui peut dormir depuis deux ans, et l'inverse
   * ferait remplacer du frais par du périmé en silence. Ce geste est la sortie
   * explicite — l'utilisateur dit « sur ce point, le CRM a raison », et la
   * valeur devient celle de Bellum. L'écart disparaît alors parce que la
   * question a été tranchée, pas parce qu'on l'a masquée.
   *
   * Volontairement étroit : un champ nommé, pas un `PATCH` générique. Un chemin
   * d'écriture sans borne sur une fiche contact finirait par servir à autre
   * chose, et cette action-ci se journalise pour ce qu'elle est.
   *
   * Le contact est relu par son id ET son propriétaire : un identifiant deviné
   * ne doit pas pouvoir écrire sur la fiche de quelqu'un d'autre.
   */
  async adoptCrmValue(
    userId: string,
    contactId: string,
    field: 'email' | 'phone',
  ): Promise<{ adopted: boolean; field: string; value: string | null }> {
    if (!this.contacts) return { adopted: false, field, value: null }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({ where: contactGestureWhere(workspaceId, userId, contactId) })
    if (!contact) return { adopted: false, field, value: null }

    const snapshot = await this.findContactRecord(userId, contact.email)
    const incoming = (snapshot?.[field] ?? '').trim()
    if (!incoming) return { adopted: false, field, value: null }

    await this.contacts.update({ id: contactId }, { [field]: incoming })
    this.logger.log('CRM value adopted on a contact field', { contactId, field })
    return { adopted: true, field, value: incoming }
  }

  /**
   * Écrit UN champ sur une fiche CRM existante.
   *
   * Un champ à la fois, et sur une fiche dont on a déjà l'identifiant : cette
   * méthode ne crée jamais de fiche. C'est la borne qui empêche la boucle de
   * synchronisation de fabriquer les doublons qu'elle est censée éviter — créer
   * une fiche pour pouvoir y écrire est exactement ainsi qu'ils naissent.
   *
   * Rend `false` sur toute impossibilité (pas de CRM connecté, jeton refusé,
   * appel en échec) plutôt que de lever : la boucle traite deux cents contacts,
   * et un échec sur l'un ne doit pas priver les autres de leur passage.
   */
  async pushContactField(userId: string, recordId: string, field: 'email' | 'phone', value: string): Promise<boolean> {
    const clean = (value ?? '').trim()
    if (!recordId.trim() || !clean || readHubspotConfig() === null) return false
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const accessToken = await this.getValidAccessToken(workspaceId)
      const client = new HubspotClient(this.requireConfig())
      // HubSpot nomme le téléphone `phone` et l'e-mail `email` : la
      // correspondance est directe, mais elle est explicite pour qu'un autre
      // fournisseur puisse la surcharger sans toucher à l'appelant.
      await client.updateContact(accessToken, recordId, { [field]: clean })
      return true
    } catch (error) {
      this.logger.warn('CRM field push failed (non-fatal — the sync pass continues)', {
        error: error instanceof Error ? error.message : String(error),
        recordId,
        field,
      })
      return false
    }
  }

  async findPresence(userId: string, query: CrmPresenceQuery): Promise<CrmPresence> {
    // #2556 — salle de démonstration : le CRM FICTIF répond pour les dossiers
    // semés (`demoCrmPresence`), sans jeton ni réseau. Hors salle, inchangé.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      const demo = demoCrmPresence(query.account, Date.now())
      if (!demo) return emptyPresence('hubspot')
      return {
        provider: 'hubspot',
        matched: true,
        contactsCount: demo.contacts.length,
        contacts: demo.contacts,
        openDeals: [],
        lastActivityAt: demo.lastActivityAt,
      }
    }
    if (readHubspotConfig() === null) return emptyPresence()
    let connected = false
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const conn = await this.connections.findOne({
        where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
      })
      if (!conn) return emptyPresence()
      connected = true

      const q = { name: query.account?.trim() || undefined, domain: query.domain?.trim() || undefined }
      if (!q.name && !q.domain) return emptyPresence('hubspot')

      const accessToken = await this.getValidAccessToken(workspaceId)
      const client = new HubspotClient(this.requireConfig())

      // #2854 — recette 28/09 : les DEUX lectures ont chacune leur propre
      // filet. Une lecture qui échoue (scope révoqué, 403 isolé) n'efface plus
      // celle qui a réussi — avant ce correctif, un `contacts.read` manquant
      // faisait échouer `searchContactsAtCompany` AVANT la lecture des
      // affaires, et l'erreur remontait au `catch` global : des affaires
      // réellement ouvertes disparaissaient de la réponse en même temps que
      // les contacts, alors qu'elles n'avaient rien à voir avec l'échec.
      let found: { total: number; contacts: CrmPresenceContact[]; lastActivityAt: string | null } = {
        total: 0,
        contacts: [],
        lastActivityAt: null,
      }
      try {
        found = await client.searchContactsAtCompany(accessToken, q)
      } catch (error) {
        this.logger.warn('HubSpot presence: contacts lookup failed (non-fatal — reconnect to grant contacts.read?)', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        })
      }

      // Deals ride on top and need the company record + the deals.read scope —
      // a connection granted before the scope widened would 403 here. Best-effort:
      // a deals failure must not erase contacts that WERE found.
      let openDeals: CrmPresenceDeal[] = []
      let dealsActivity: string | null = null
      try {
        const companyId = await client.findCompanyId(accessToken, q)
        if (companyId) {
          const res = await client.searchOpenDealsForCompany(accessToken, companyId)
          openDeals = res.deals
          dealsActivity = res.lastActivityAt
        }
      } catch (error) {
        this.logger.warn('HubSpot presence: deals lookup failed (non-fatal — reconnect to grant deals.read?)', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        })
      }

      return {
        provider: 'hubspot',
        matched: found.total > 0 || openDeals.length > 0,
        contactsCount: found.total,
        contacts: found.contacts,
        openDeals,
        lastActivityAt: latestIso([found.lastActivityAt, dealsActivity]),
      }
    } catch (error) {
      // Graceful: a CRM outage degrades to "consulted, nothing found" — never a 500
      // in the account dossier / chat context, never invented data.
      this.logger.warn('HubSpot presence read failed (returning empty)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return emptyPresence(connected ? 'hubspot' : null)
    }
  }

  /**
   * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
   * Le vocabulaire BRUT (`industry`/`country`) des sociétés du CRM branché de
   * CET espace — voir `crm-vocabulary.ts` pour la doctrine complète (pourquoi
   * aucune correspondance vers `ESN_ANSWER_OPTIONS` n'est fabriquée ici).
   *
   * Même charpente que `findPresence` juste au-dessus : un no-op strict tant
   * qu'aucun CRM n'est connecté (zéro appel réseau), une dégradation
   * silencieuse sur toute panne (jamais un 500 sur l'écran d'onboarding).
   *
   * ⚠️ Démo : `crm_connections` est vide À DESSEIN en démonstration
   * (`demo-coverage.ts`), donc cette méthode y rend toujours `emptyVocabulary()`
   * — c'est la même raison que `findPresence`, pas une nouvelle.
   */
  async vocabulary(userId: string): Promise<CrmVocabulary> {
    if (readHubspotConfig() === null) return emptyVocabulary()
    let connected = false
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const conn = await this.connections.findOne({
        where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
      })
      if (!conn) return emptyVocabulary()
      connected = true

      const accessToken = await this.getValidAccessToken(workspaceId)
      const client = new HubspotClient(this.requireConfig())
      const { industries, countries } = await client.companyVocabulary(accessToken, {
        pageSize: HUBSPOT_MAX_PAGE_SIZE,
        maxCompanies: CRM_VOCABULARY_MAX_COMPANIES_SCANNED,
      })
      return {
        provider: 'hubspot',
        industries: industries.slice(0, CRM_VOCABULARY_MAX_VALUES),
        countries: countries.slice(0, CRM_VOCABULARY_MAX_VALUES),
      }
    } catch (error) {
      // Gracieux : une panne CRM dégrade vers « rien à proposer », jamais une
      // erreur sur l'écran d'onboarding — et jamais une valeur inventée.
      this.logger.warn('CRM vocabulary read failed (returning empty)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return emptyVocabulary(connected ? 'hubspot' : null)
    }
  }

  /**
   * #2045.5 (épopée #2859) — combien de contacts le CRM branché connaît, TOUS
   * comptes confondus. Distinct de `findPresence`, qui filtre sur UN compte :
   * ici aucun filtre. Même honnêteté que `vocabulary()` — voir
   * `crm-network-size.ts` pour le détail du contrat.
   */
  async networkSize(userId: string): Promise<CrmNetworkSize> {
    if (readHubspotConfig() === null) return emptyNetworkSize()
    let connected = false
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const conn = await this.connections.findOne({
        where: { ...workspaceScopeWhere(workspaceId), provider: 'hubspot' },
      })
      if (!conn) return emptyNetworkSize()
      connected = true

      const accessToken = await this.getValidAccessToken(workspaceId)
      const client = new HubspotClient(this.requireConfig())
      const total = await client.portalContactTotal(accessToken)
      return { provider: 'hubspot', total }
    } catch (error) {
      // Gracieux : une panne CRM dégrade vers « non mesuré », jamais une
      // erreur sur l'écran d'onboarding — et jamais un zéro inventé.
      this.logger.warn('CRM network size read failed (returning unmeasured)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return emptyNetworkSize(connected ? 'hubspot' : null)
    }
  }
}

/**
 * Qui demande l'écriture, et sous quelle clé d'idempotence.
 *
 * Absent = un geste d'utilisateur, auto-approuvé. `system` = personne n'a rien
 * vu : la demande attend.
 *
 * `source` (#2855) — la PROVENANCE, quand l'appelant la connaît (un compte
 * rendu, un appel, une routine, un client MCP). Absent = `null` : un geste
 * direct de la personne, ou une provenance non tracée par cet appelant —
 * jamais devinée ici.
 */
type CrmWriteGate = { origin: 'user' | 'system'; idempotencyKey?: string | null; source?: WriteSource }

/** #1934.18 — la lecture des pipelines d'affaires, comme un ÉTAT. */
export type DealPipelinesRead =
  | { status: 'ready'; pipelines: HubspotDealPipeline[] }
  | { status: 'not_connected'; pipelines: [] }
  | { status: 'unreadable'; reason: ConnectorErrorCode | 'empty'; pipelines: [] }

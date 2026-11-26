import { Injectable, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  deriveCapabilityEntryState,
  deriveCapabilityState,
  missingScopesFor,
  type CapabilityDescriptor,
  type CapabilityKey,
  type ConnectedTool,
  type ToolStatus,
} from '@bellum/contracts'
import { AdminDocsConnectionEntity } from '../../database/entities/admin-docs-connection.entity'
import { AtsConnectionEntity } from '../../database/entities/ats-connection.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { TelephonyConnectionEntity } from '../../database/entities/telephony-connection.entity'
import { LemlistConnectionEntity } from '../../database/entities/lemlist-connection.entity'
import { IntegrationEntity } from '../../database/entities/integration.entity'
import { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import { NotionConnectionEntity } from '../../database/entities/notion-connection.entity'
import { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { readAttioConfig } from '../attio/attio-config'
import { readHubspotConfig } from '../crm/crm-config'
import { withDemoConnections } from './demo-connections'
import { readGoogleConfig } from '../google/google-config'
import { IaClient } from '../ia/ia.client'
import { readMicrosoftConfig } from '../microsoft/microsoft-config'
import { readNotionConfig } from '../notion/notion-config'
import { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import { CrmSyncCursorEntity } from '../../database/entities/crm-sync-cursor.entity'
import { ToolLatencyObservationEntity } from '../../database/entities/tool-latency-observation.entity'
import { findPersonalConnection } from '../../common/util/personal-connection'
import { capabilitiesOf, probeCapabilityName } from './tool-capabilities'
import { measureToolLatency, type LatencyObservation } from './tool-latency'
import { readOAuthConfig } from '../oauth/oauth-config'
import { readPipedriveConfig } from '../pipedrive/pipedrive-config'
import { readZohoConfig } from '../zoho/zoho-config'
import { readSalesforceConfig } from '../salesforce/salesforce-config'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { readBoondManagerConfig } from '../zero-layer/boondmanager-config'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { renderCapabilityDigest } from './tool-capability-digest'
import { toAdminCatalogTool, type AdminCatalogReport, type AdminWorkspaceRegistry } from './tool-registry.admin'
import {
  TOOL_CATALOG,
  type CrmProviderKey,
  type OAuthProviderKey,
  type SecretSiloKey,
  type ToolCatalogEntry,
  type ToolSource,
} from './tool-catalog'

/** The live half of a {@link ConnectedTool} — the fields that depend on real
 *  connection state, resolved from the backing store. */
type LiveState = Pick<ConnectedTool, 'status' | 'scopes' | 'last_sync'>

/**
 * Les capacités d'un outil, chacune avec son état DÉRIVÉ.
 *
 * Le grain change ici, et c'est tout le PDF 7 : « Google : connecté » ne dit pas
 * si la recherche documentaire marche. Cette fonction répond capacité par
 * capacité, en comparant les portées EXIGÉES aux portées ACCORDÉES.
 *
 * `last_proof_at` et `last_error_code` restent `null` tant que rien n'a été
 * vérifié — et une capacité sans preuve vaut `untested`, jamais « opérationnel ».
 * C'est la règle du §2, et c'est ce qui a manqué le 16/08.
 */
function describeCapabilities(provider: string, live: LiveState, ctx: ResolveContext): CapabilityDescriptor[] {
  const declared = capabilitiesOf(provider)
  if (declared.length === 0) return []
  return declared.map(capability => {
    const probe = ctx.probes[`${provider}:${probeCapabilityName(provider, capability)}`]
    const provenAt = probe?.last_proof_at ? new Date(probe.last_proof_at).toISOString() : null
    // La DERNIÈRE sonde a échoué : `record()` pose `last_error_at` et efface
    // `last_proof_at` en une seule écriture, donc les deux ne cohabitent jamais.
    //
    // Sans cette ligne, la capacité retombait sur `untested` — « Jamais
    // vérifié » — alors qu'elle venait précisément d'être vérifiée et qu'elle
    // avait échoué. `degraded` était déclaré, dérivable et traduit depuis des
    // semaines sans qu'aucun appelant ne le passe : c'est ce qu'il lui manquait.
    const lastProbeFailed = Boolean(probe?.last_error_at) && !provenAt
    return {
      key: capability.key,
      state: deriveCapabilityEntryState({
        status: live.status,
        granted: live.scopes,
        required: capability.scopes,
        lastProofAt: provenAt,
        degraded: lastProbeFailed,
        probeable: capability.probeable,
        now: new Date(ctx.now),
      }),
      scope_required: [...capability.scopes],
      last_proof_at: provenAt,
      last_proof_sample: probe?.last_proof_sample ?? null,
      last_error_code: probe?.last_error_code ?? null,
      last_error_at: probe?.last_error_at ? new Date(probe.last_error_at).toISOString() : null,
      // #2383.1 — l'APPELANT : sans cette ligne, le niveau existait dans la
      // table déclarative et n'atteignait aucune réponse d'API — le motif qui
      // revient dans tout ce dépôt (chantiers-livres.md).
      level: capability.level,
    }
  })
}

/** Les capacités d'ÉCRITURE de cet outil (créer, modifier, envoyer, planifier). */
const WRITE_KEYS: readonly CapabilityKey[] = ['create', 'update', 'send', 'schedule', 'delete', 'prepare']

/**
 * Au moins une écriture est-elle réellement autorisée ?
 *
 * Un outil qui déclare des écritures mais dont AUCUNE portée d'écriture n'est
 * accordée est en `read_only` — pas « opérationnel ». C'est la correction du
 * défaut n°2 du croisement.
 */
function writeCapabilitiesGranted(provider: string, live: LiveState, catalogueWrites: boolean): boolean {
  if (live.status !== 'connected') return false
  const declared = capabilitiesOf(provider)
  // Un outil absent de la table retombe sur l'ancien comportement : on ne peut
  // pas prétendre en savoir plus que le catalogue.
  if (declared.length === 0) return catalogueWrites
  const writes = declared.filter(capability => WRITE_KEYS.includes(capability.key))
  // Déclaré ET sans capacité d'écriture : c'est un outil de LECTURE. Drive en
  // est un — il rendait `read_only` avant ce chantier, et doit continuer.
  if (writes.length === 0) return false
  return writes.some(capability => missingScopesFor(live.scopes, capability.scopes).length === 0)
}

/** Certaines écritures oui, d'autres non — l'état `limited_write`, jusqu'ici inatteignable. */
function writesArePartial(provider: string, live: LiveState): boolean {
  if (live.status !== 'connected') return false
  const writes = capabilitiesOf(provider).filter(capability => WRITE_KEYS.includes(capability.key))
  if (writes.length === 0) return false
  const granted = writes.filter(capability => missingScopesFor(live.scopes, capability.scopes).length === 0)
  return granted.length > 0 && granted.length < writes.length
}

/**
 * #2254 — CET outil Google (`gmail` / `google-calendar` / `google-drive`) a-t-il
 * reçu AU MOINS UNE de ses propres portées ? Les trois partagent un seul jeton
 * (`google_connections`), mais Google accorde ses portées de façon granulaire —
 * rien ne garantit que les trois aient été acceptées ensemble.
 *
 * Les portées de chaque outil vivent à UN endroit, `tool-capabilities.ts`
 * (GA-26) : c'est la même table qui sert déjà à décomposer les capacités, donc
 * pas de second registre qui pourrait diverger. Un outil absent de la table
 * (ne devrait pas arriver pour un `providerKey: 'google'`) retombe sur
 * l'ancien comportement : le jeton seul suffit.
 */
function googleToolScopeGranted(provider: string, granted: readonly string[]): boolean {
  const required = new Set(capabilitiesOf(provider).flatMap(capability => capability.scopes))
  if (required.size === 0) return true
  return granted.some(scope => required.has(scope))
}

/** The pre-fetched inputs a single entry is resolved against (one DB pass). */
type ResolveContext = {
  webhookRows: IntegrationEntity[]
  crmRows: CrmConnectionEntity[]
  googleRow: GoogleConnectionEntity | null
  notionRow: NotionConnectionEntity | null
  microsoftRow: MicrosoftConnectionEntity | null
  /** Les preuves par `provider:capability` — voir `describeCapabilities`. */
  probes: Record<string, ConnectorCapabilityProbeEntity | undefined>
  mcpConsents: OAuthConsentEntity[]
  mcpEnabled: boolean
  /** Les silos où l'espace dépose ses propres identifiants, par fournisseur. */
  secretRows: Record<SecretSiloKey, SecretRow[]>
  /** L'ERP branché par la configuration serveur plutôt que par l'espace. */
  atsFromEnvironment: boolean
  /** Per-provider `configured` flags for the IA-hosted data sources, fetched from
   *  the IA `/config/integrations` endpoint (best-effort). */
  iaProviders: Record<string, boolean>
  /** #2261.13 (19/09) — les synchros réelles des 7 derniers jours, par
   *  fournisseur, pour `measureToolLatency`. */
  latencyObservations: Record<string, LatencyObservation[]>
  now: number
}

/** La forme minimale que les trois silos « identifiants par espace » partagent —
 *  c'est tout ce dont la résolution a besoin, et ça évite trois branches. */
type SecretRow = { provider: string; last_used_at?: Date | null; updated_at?: Date | null; created_at?: Date | null }

/** Per-provider "is this CRM feature configured on this server?" gates. */
const CRM_CONFIGURED: Record<CrmProviderKey, () => boolean> = {
  hubspot: () => readHubspotConfig() !== null,
  salesforce: () => readSalesforceConfig() !== null,
  pipedrive: () => readPipedriveConfig() !== null,
  attio: () => readAttioConfig() !== null,
  zoho: () => readZohoConfig() !== null,
  /*
   * ⚠️ Odoo n'a AUCUNE configuration serveur : pas de `ODOO_CLIENT_ID`, pas de
   * secret à poser sur la plateforme. Une instance se branche par espace, avec
   * les identifiants de son propriétaire.
   *
   * Il est donc `true` en dur — et ce n'est pas un raccourci : le rendre
   * conditionnel à une variable inexistante l'afficherait « bientôt
   * disponible » pour toujours, c'est-à-dire une capacité livrée que personne
   * ne peut atteindre. Ce que ce `true` dit exactement : « le serveur ne
   * manque de rien », pas « un espace est connecté » — cette seconde question
   * est celle de `ctx.crmRows`, juste en dessous.
   */
  odoo: () => true,
}

/** Per-provider "is this OAuth module configured on this server?" gates (the
 *  dedicated-table integrations: Google Workspace, Notion, Microsoft 365). */
const OAUTH_CONFIGURED: Record<OAuthProviderKey, () => boolean> = {
  google: () => readGoogleConfig() !== null,
  notion: () => readNotionConfig() !== null,
  microsoft: () => readMicrosoftConfig() !== null,
}

/** How long the IA data-provider status is cached. Env presence is static per
 *  deploy, so a few minutes keeps the `/tool-registry` and chat paths off the
 *  network on all but the first call in the window. */
const IA_PROVIDERS_TTL_MS = 5 * 60_000

/**
 * #2261.13 (décision Louis 19/09) — les outils pour lesquels le CONCEPT de
 * latence source→Bellum s'applique : des connecteurs de SYNCHRONISATION (un
 * enregistrement qui change chez le fournisseur, que Bellum relit). Les
 * outils de RECHERCHE/ENRICHISSEMENT (Apollo, Brave, France Travail…) n'ont
 * pas cette notion — ils répondent au présent, il n'y a rien à « rattraper » —
 * et restent `null` (le concept ne s'applique pas), jamais « non mesuré ».
 */
const LATENCY_ELIGIBLE_PROVIDERS = new Set([
  'hubspot',
  'salesforce',
  'gmail',
  'google-calendar',
  'google-drive',
  'notion',
  'microsoft',
])

/**
 * Les outils pour lesquels Bellum capture RÉELLEMENT l'horodatage source à ce
 * jour. Seul HubSpot est câblé (`CrmSyncService.syncOne`, `lastmodifieddate`
 * via `HubspotClient.findContactByEmail`) — les six autres ont chacun un
 * horodatage exposé par leur API (`internalDate` Gmail, `updated` Calendar,
 * `modifiedTime` Drive, `last_edited_time` Notion, `lastModifiedDateTime`
 * Microsoft Graph, `LastModifiedDate` Salesforce), mais rien dans ce dépôt ne
 * le LIT encore pour calculer ce délai. Dire « pas assez de mesures pour
 * l'instant » serait faux pour eux : sans ce câblage, rien ne viendra jamais.
 * La distinction (`measureToolLatency`, `wired`) est honnête, pas paresseuse.
 */
const LATENCY_SOURCE_WIRED_PROVIDERS = new Set(['hubspot'])

/** Compact chat block bounds — the advisor gets a digest, never a dump. */
const CHAT_TOOLS_MAX_LINES = 12
const CHAT_TOOLS_MAX_CHARS = 1500

/** Split a space-delimited scope string into non-empty scopes (local copy so the
 *  module stays self-contained — no dependency on the OAuth module internals). */
function parseScope(scope: string | null | undefined): string[] {
  return (scope ?? '')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** ISO-8601 for a real timestamp, or `null` when none is available (never
 *  invented — this is what feeds `last_sync`). */
function toIso(date: Date | null | undefined): string | null {
  return date ? new Date(date).toISOString() : null
}

/**
 * Read-only aggregation over the connection silos into ONE unified list.
 *
 * - self-serve chat/webhooks .... `integrations` table       (per user)
 * - OAuth CRM links ............. `crm_connections` table     (per workspace, env-gated;
 *                                  HubSpot / Salesforce / Pipedrive / Attio)
 * - OAuth dedicated links ....... `google_connections` /
 *                                  `notion_connections` /
 *                                  `microsoft_connections`    (per workspace, env-gated)
 * - MCP assistant grants ........ `oauth_consents` table      (per user, env-gated)
 * - server-side capabilities .... env key present on THIS service (e.g. Dropcontact,
 *                                  Stripe), OR reported live by the IA for its own
 *                                  data sources (Apollo, France Travail, Brave,
 *                                  Firecrawl, Pappers, Serper, Tavily).
 *
 * plus the static {@link TOOL_CATALOG} for tools that are modeled but not
 * connectable yet (LinkedIn). The service NEVER writes and NEVER claims a tool is
 * connected unless a row (or a live server key) actually backs it (CLAUDE rule: no
 * fake data). `last_sync` prefers the REAL usage stamp (`last_used_at`, written on
 * CRM export / webhook delivery), falling back to `updated_at`/`created_at`, and is
 * `null` whenever none exists. Self-contained (CLAUDE rule #7): removing this module
 * removes the unified view without touching the source modules.
 */
@Injectable()
export class ToolRegistryService {
  /** Best-effort cache of the IA data-provider `configured` flags. */
  private iaProvidersCache: { at: number; map: Record<string, boolean> } | null = null

  constructor(
    @InjectRepository(IntegrationEntity)
    private readonly integrations: Repository<IntegrationEntity>,
    @InjectRepository(CrmConnectionEntity)
    private readonly crmConnections: Repository<CrmConnectionEntity>,
    @InjectRepository(OAuthConsentEntity)
    private readonly oauthConsents: Repository<OAuthConsentEntity>,
    @InjectRepository(GoogleConnectionEntity)
    private readonly googleConnections: Repository<GoogleConnectionEntity>,
    @InjectRepository(NotionConnectionEntity)
    private readonly notionConnections: Repository<NotionConnectionEntity>,
    @InjectRepository(MicrosoftConnectionEntity)
    private readonly microsoftConnections: Repository<MicrosoftConnectionEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly workspaceMembers: Repository<WorkspaceMemberEntity>,
    @InjectRepository(AtsConnectionEntity)
    private readonly atsConnections: Repository<AtsConnectionEntity>,
    @InjectRepository(TelephonyConnectionEntity)
    private readonly telephonyConnections: Repository<TelephonyConnectionEntity>,
    @InjectRepository(AdminDocsConnectionEntity)
    private readonly adminDocsConnections: Repository<AdminDocsConnectionEntity>,
    @InjectRepository(ConnectorCapabilityProbeEntity)
    private readonly probes: Repository<ConnectorCapabilityProbeEntity>,
    @InjectRepository(ToolLatencyObservationEntity)
    private readonly latencyObservationRows: Repository<ToolLatencyObservationEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly config: ConfigService,
    private readonly ia: IaClient,
    // CRM-SYNC-D.2 — les curseurs de synchro : un passage réel abouti est une preuve de lecture.
    @Optional() @InjectRepository(CrmSyncCursorEntity) private readonly crmCursors?: Repository<CrmSyncCursorEntity>,
    // #4427 — la clé Lemlist de l'espace (une ligne par espace, sans colonne `provider`).
    @Optional()
    @InjectRepository(LemlistConnectionEntity)
    private readonly lemlistConnections?: Repository<LemlistConnectionEntity>,
  ) {}

  /** The unified tool list for the caller, one {@link ConnectedTool} per catalogue
   *  entry, with the live status resolved from the real backing stores. */
  async list(userId: string): Promise<ConnectedTool[]> {
    const workspaceId = await this.resolveWorkspaceIfNeeded(userId)
    const tools = await this.resolveCatalog(workspaceId, [userId])
    // #4163 LF — la salle de démonstration montre messagerie et CRM branchés (overlay de lecture, aucune ligne en base).
    return (await this.workspaceContext.isDemoWorkspace(userId)) ? withDemoConnections(tools, new Date()) : tools
  }

  /**
   * Le registre d'un ESPACE DE TRAVAIL, pour le back-office opérateur.
   *
   * Les silos adossés à l'espace (CRM, Google, Notion, Microsoft) sont lus tels
   * quels. Les silos PERSONNELS — webhooks de discussion et consentements MCP —
   * sont agrégés sur tous les membres : au niveau de l'espace, la question
   * posée est « ce canal est-il branché chez ce client ? », pas « chez tel
   * utilisateur ? ». Un outil ressort donc connecté dès qu'un membre l'a branché.
   *
   * Aucune écriture, aucun secret : ni URL de webhook, ni jeton OAuth ne
   * traversent cette réponse — seulement statuts, périmètres et horodatages.
   */
  async registryForWorkspace(workspaceId: string): Promise<AdminWorkspaceRegistry> {
    const memberIds = await this.loadWorkspaceMemberIds(workspaceId)
    const tools = await this.resolveCatalog(workspaceId, memberIds)
    return {
      workspaceId,
      memberCount: memberIds.length,
      tools,
      connected: tools.filter(t => t.status === 'connected').length,
      actionRequired: tools.filter(t => t.status === 'action_required').length,
    }
  }

  /**
   * Le catalogue statique complet, sans aucun état client : ce que chaque outil
   * sait faire, ce qu'il coûte, ses limites de débit, ce que Bellum en retient —
   * plus le fait que CE serveur soit configuré pour l'offrir.
   *
   * C'est la référence côté opérateur : un outil `configured: false` n'apparaît
   * dans aucun écran client, et c'est ici qu'on s'en aperçoit.
   */
  async catalog(): Promise<AdminCatalogReport> {
    const iaProviders = await this.loadIaProviders()
    const tools = TOOL_CATALOG.map(entry => toAdminCatalogTool(entry, this.isConfigured(entry.source, iaProviders)))
    return {
      tools,
      total: tools.length,
      configured: tools.filter(t => t.configured).length,
    }
  }

  /** Ce serveur est-il en mesure de proposer cette entrée ? Même portes que la
   *  résolution d'état, mais sans aucune lecture en base. */
  private isConfigured(source: ToolSource, iaProviders: Record<string, boolean>): boolean {
    switch (source.kind) {
      case 'webhook':
        return true // rien à configurer : l'utilisateur colle son URL
      case 'crm':
        return CRM_CONFIGURED[source.providerKey]()
      case 'oauth':
        return OAUTH_CONFIGURED[source.providerKey]()
      case 'mcp':
        return readOAuthConfig(this.config).enabled
      case 'server':
        return Boolean(process.env[source.envKey]?.trim())
      case 'ia-server':
        return iaProviders[source.providerId] ?? false
      case 'workspace-secret':
        return true // rien à activer côté serveur : l'espace colle ses identifiants
      case 'catalog':
        return false // modélisé, pas encore branchable
    }
  }

  /** Un passage de résolution partagé par la vue utilisateur et la vue opérateur :
   *  les silos d'espace lus par `workspaceId`, les silos personnels unis sur
   *  `userIds` (un seul appelant côté app, tous les membres côté back-office). */
  private async resolveCatalog(workspaceId: string | null, userIds: string[]): Promise<ConnectedTool[]> {
    // Un seul appelant côté application (l'utilisateur qui regarde), tous les
    // membres côté back-office. Les connecteurs PERSONNELS ne se résolvent que
    // dans le premier cas : la vue opérateur agrège l'espace, elle ne se met
    // dans la peau de personne.
    const personalOwner = userIds.length === 1 ? (userIds[0] ?? null) : null
    const [
      webhookRows,
      mcpConsents,
      crmRows,
      googleRow,
      notionRow,
      microsoftRow,
      iaProviders,
      secretRows,
      probes,
      latencyObservations,
    ] = await Promise.all([
      this.loadWebhookRows(userIds),
      this.loadMcpConsents(userIds),
      this.loadCrmRows(workspaceId),
      this.loadGoogleRow(workspaceId, personalOwner),
      this.loadNotionRow(workspaceId),
      this.loadMicrosoftRow(workspaceId, personalOwner),
      this.loadIaProviders(),
      this.loadSecretRows(workspaceId),
      this.loadProbes(workspaceId),
      this.loadLatencyObservations(workspaceId),
    ])
    const ctx: ResolveContext = {
      webhookRows,
      crmRows,
      googleRow,
      notionRow,
      microsoftRow,
      mcpConsents,
      mcpEnabled: readOAuthConfig(this.config).enabled,
      iaProviders,
      secretRows,
      atsFromEnvironment: readBoondManagerConfig() !== null,
      probes,
      latencyObservations,
      now: Date.now(),
    }
    return TOOL_CATALOG.map(entry => this.toConnectedTool(entry, ctx))
  }

  /**
   * Les preuves de capacité de l'espace, indexées par `provider:capability`.
   *
   * Best-effort : une lecture en échec rend une table vide, donc toutes les
   * capacités s'affichent `untested`. C'est le bon repli — « je ne sais pas »
   * est vrai, alors que « opérationnel » serait exactement le mensonge que ce
   * chantier corrige.
   */
  private async loadProbes(
    workspaceId: string | null,
  ): Promise<Record<string, ConnectorCapabilityProbeEntity | undefined>> {
    if (workspaceId == null) return {}
    try {
      const rows = await this.probes.find({ where: { workspace_id: workspaceId } })
      const proofs = Object.fromEntries(rows.map(row => [`${row.provider}:${row.capability}`, row]))
      return { ...(await this.loadSyncProofs(workspaceId)), ...proofs }
    } catch {
      return {}
    }
  }

  /**
   * CRM-SYNC-D.2 — « Jamais vérifié » sur un CRM dont la synchro tourne : la preuve de lecture n'était écrite que
   * par le bouton « tester ». Un passage RÉEL abouti (curseur avec `last_run_at` et sans `last_error`) EST la
   * preuve que la lecture des contacts marche ; il vaut preuve pour la capacité `read` des fiches (pas celle des
   * affaires, lue par le miroir). Une preuve réelle (bouton « tester ») prime : l'appelant la superpose.
   */
  private async loadSyncProofs(workspaceId: string): Promise<Record<string, ConnectorCapabilityProbeEntity>> {
    const out: Record<string, ConnectorCapabilityProbeEntity> = {}
    try {
      const cursors = (await this.crmCursors?.find({ where: { workspace_id: workspaceId } })) ?? []
      for (const provider of new Set(cursors.map(row => row.provider))) {
        const mine = cursors.filter(row => row.provider === provider)
        if (mine.some(row => row.last_error)) continue
        const times = mine.flatMap(row => (row.last_run_at ? [new Date(row.last_run_at).getTime()] : []))
        if (times.length === 0) continue
        const reads = capabilitiesOf(provider).filter(
          capability => capability.key === 'read' && !capability.scopes.some(scope => scope.includes('deals')),
        )
        for (const capability of reads) {
          out[`${provider}:${probeCapabilityName(provider, capability)}`] = {
            workspace_id: workspaceId,
            provider,
            capability: probeCapabilityName(provider, capability),
            last_proof_at: new Date(Math.max(...times)),
            last_proof_sample: null,
            last_error_code: null,
            last_error_at: null,
          } as ConnectorCapabilityProbeEntity
        }
      }
    } catch {
      return {}
    }
    return out
  }

  /**
   * #2261.13 (19/09) — les synchros réelles de l'espace, par fournisseur.
   *
   * `measureToolLatency` applique lui-même la fenêtre de 7 jours (pure,
   * testée séparément) : cette lecture rend toutes les lignes de l'espace,
   * sans filtre de date côté requête — un espace neuf a peu de lignes, la
   * table ne grossit jamais sans borne (une ligne par synchro CRM réelle).
   * Best-effort, même repli que {@link loadProbes} : une lecture en échec
   * rend un registre vide, donc tout ressort « non mesuré » plutôt que de
   * faire tomber tout l'écran `/integrations`.
   */
  private async loadLatencyObservations(workspaceId: string | null): Promise<Record<string, LatencyObservation[]>> {
    if (workspaceId == null) return {}
    try {
      const rows = await this.latencyObservationRows.find({ where: { workspace_id: workspaceId } })
      const byProvider: Record<string, LatencyObservation[]> = {}
      for (const row of rows) {
        const list = (byProvider[row.provider] ??= [])
        list.push({ sourceAt: new Date(row.source_at), arrivedAt: new Date(row.arrived_at) })
      }
      return byProvider
    } catch {
      return {}
    }
  }

  /** Webhook rows for the given users. Empty list in → no query, no rows out
   *  (`In([])` would be an empty `IN ()` clause). */
  private async loadWebhookRows(userIds: string[]): Promise<IntegrationEntity[]> {
    if (userIds.length === 0) return []
    return this.integrations.find({ where: { user_id: In(userIds) } })
  }

  /** Active MCP consents for the given users. */
  private async loadMcpConsents(userIds: string[]): Promise<OAuthConsentEntity[]> {
    if (userIds.length === 0) return []
    return this.oauthConsents.find({ where: { user_id: In(userIds), revoked_at: IsNull() } })
  }

  /** The user ids of a workspace's members — the scope over which the personal
   *  silos are unioned for the operator view. */
  private async loadWorkspaceMemberIds(workspaceId: string): Promise<string[]> {
    const rows = await this.workspaceMembers.find({
      where: { workspace_id: workspaceId },
      select: { user_id: true },
    })
    return rows.map(r => r.user_id)
  }

  /**
   * Compact FRENCH digest of the caller's live CAPABILITIES for the chat advisor
   * context: one line per capability — what it allows, its state, its cost in
   * Bellum credits — bounded, never a dump.
   *
   * It deliberately does NOT name the vendors. The registry is nominative (it
   * has to be: it drives the screen where the user authorizes each access), but
   * the copilot's context is read by a sales rep in front of a client, and the
   * addendum (p12, backlog P0 #1) forbids surfacing providers, quotas and unit
   * costs there. {@link renderCapabilityDigest} performs the translation —
   * « votre CRM », not the CRM's brand.
   *
   * `null` when nothing is connected (the prompt block is simply not rendered).
   * Best-effort by contract: callers must degrade to `null` on error, never
   * break chat.
   */
  async chatToolsSummary(userId: string): Promise<string | null> {
    const tools = await this.list(userId)
    const digest = renderCapabilityDigest(tools, CHAT_TOOLS_MAX_LINES)
    return digest === null ? null : digest.slice(0, CHAT_TOOLS_MAX_CHARS)
  }

  /**
   * L'espace de travail actif de l'appelant, résolu UNE fois.
   *
   * Autrefois sauté quand aucun CRM ni module OAuth n'était configuré. Ce
   * raccourci n'est plus tenable : les silos « identifiants par espace » (ATS,
   * téléphonie, administratif) ne dépendent d'aucune clé serveur, donc ils sont
   * toujours lisibles — et sans `workspaceId` ils ressortiraient tous
   * « disponibles » chez un espace qui les a réellement branchés.
   */
  private async resolveWorkspaceIfNeeded(userId: string): Promise<string | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * Les trois silos où l'espace dépose ses propres identifiants.
   *
   * Une seule passe, en parallèle, et jamais de requête sans `workspaceId` : une
   * lecture non scopée rendrait ici les connexions d'un AUTRE client.
   */
  private async loadSecretRows(workspaceId: string | null): Promise<Record<SecretSiloKey, SecretRow[]>> {
    if (workspaceId == null) return { ats: [], telephony: [], admin_docs: [], lemlist: [] }
    const where = workspaceScopeWhere(workspaceId)
    const [ats, telephony, admin_docs, lemlist] = await Promise.all([
      this.atsConnections.find({ where }),
      this.telephonyConnections.find({ where }),
      this.adminDocsConnections.find({ where }),
      this.lemlistConnections?.find({ where }) ?? Promise.resolve([]),
    ])
    return { ats, telephony, admin_docs, lemlist: lemlist.map(row => ({ ...row, provider: 'lemlist' })) }
  }

  /** CRM rows for the caller's workspace. Empty when no CRM provider is configured
   *  on this server, or when the workspace could not be resolved. */
  private async loadCrmRows(workspaceId: string | null): Promise<CrmConnectionEntity[]> {
    if (workspaceId == null || !Object.values(CRM_CONFIGURED).some(configured => configured())) return []
    return this.crmConnections.find({ where: workspaceScopeWhere(workspaceId) })
  }

  /** The workspace's Google Workspace OAuth link, or null when the feature is off
   *  or unconnected. Mirrors {@link GoogleService.getStatus} scoping exactly. */
  private async loadGoogleRow(
    workspaceId: string | null,
    userId: string | null,
  ): Promise<GoogleConnectionEntity | null> {
    if (workspaceId == null || !OAUTH_CONFIGURED.google()) return null
    // La connexion de CELUI QUI REGARDE, avec repli sur celle de l'espace.
    // L'écran doit montrer l'état de SA messagerie, pas d'une autre — c'est la
    // même règle que celle qui gouverne désormais les lectures elles-mêmes.
    if (userId) {
      return findPersonalConnection(this.googleConnections, { userId, workspaceId, provider: 'google' })
    }
    return this.googleConnections.findOne({ where: { ...workspaceScopeWhere(workspaceId), provider: 'google' } })
  }

  /** The workspace's Notion OAuth link, or null when the feature is off/unconnected. */
  private async loadNotionRow(workspaceId: string | null): Promise<NotionConnectionEntity | null> {
    if (workspaceId == null || !OAUTH_CONFIGURED.notion()) return null
    return this.notionConnections.findOne({ where: workspaceScopeWhere(workspaceId) })
  }

  /** The workspace's Microsoft 365 OAuth link, or null when off/unconnected. */
  private async loadMicrosoftRow(
    workspaceId: string | null,
    userId: string | null,
  ): Promise<MicrosoftConnectionEntity | null> {
    if (workspaceId == null || !OAUTH_CONFIGURED.microsoft()) return null
    if (userId) {
      return findPersonalConnection(this.microsoftConnections, { userId, workspaceId, provider: 'microsoft' })
    }
    return this.microsoftConnections.findOne({ where: { ...workspaceScopeWhere(workspaceId), provider: 'microsoft' } })
  }

  /**
   * The IA-hosted data providers' `configured` flags, cached for
   * {@link IA_PROVIDERS_TTL_MS}. Best-effort: on ANY failure we cache and return an
   * empty map so those tools honestly report `coming_soon` — we never invent a
   * "configured" we could not confirm (CLAUDE rule: no fake data).
   */
  private async loadIaProviders(): Promise<Record<string, boolean>> {
    const now = Date.now()
    const cached = this.iaProvidersCache
    if (cached && now - cached.at < IA_PROVIDERS_TTL_MS) return cached.map
    try {
      const res = await this.ia.integrationStatus()
      const map = res?.providers ?? {}
      this.iaProvidersCache = { at: now, map }
      return map
    } catch {
      this.iaProvidersCache = { at: now, map: {} }
      return {}
    }
  }

  private toConnectedTool(entry: ToolCatalogEntry, ctx: ResolveContext): ConnectedTool {
    const live = this.resolveLive(entry.provider, entry.source, ctx)
    // Les capacités se calculent AVANT l'état de l'outil, parce que l'outil en
    // dépend : un outil dont une capacité vient d'échouer sa sonde n'est pas
    // « opérationnel ». Un seul calcul, réutilisé — deux dérivations de la même
    // règle divergent.
    const capabilities = describeCapabilities(entry.provider, live, ctx)
    return {
      provider: entry.provider,
      family: entry.family,
      ...(entry.additional_families?.length ? { additional_families: [...entry.additional_families] } : {}),
      display_name: entry.display_name,
      owner: entry.owner,
      // Normalize the array capability fields at the wire boundary so the
      // response ALWAYS satisfies the contract, even if a future catalogue entry
      // is added with incomplete meta during a rebase (the exact regression that
      // crashed `/settings/integrations` in prod: a tool without `data_types`).
      data_types: {
        reads: entry.data_types?.reads ?? [],
        writes: entry.data_types?.writes ?? [],
      },
      allowed_actions: entry.allowed_actions ?? [],
      ...(entry.rate_limits ? { rate_limits: entry.rate_limits } : {}),
      cost_model: entry.cost_model,
      memory_policy: entry.memory_policy,
      // #2261.8/.13/.16 — champs REQUIS (pas `.optional()`) au contrat : une
      // entrée du catalogue qui ne les déclare pas rend `null` explicitement,
      // pour que l'absence se DISE plutôt que de disparaître silencieusement
      // d'une réponse dont un consommateur n'aurait pas lu la clé.
      coverage_period: entry.coverage_period ?? null,
      latency: this.resolveLatency(entry.provider, live.status, ctx, entry.latency),
      beta: entry.beta ?? null,
      // #2207.23 — `.optional()` au contrat, mais servi comme les trois
      // champs ci-dessus (`null` explicite plutôt qu'absent) : l'écran de
      // prévisualisation lit une valeur toujours présente, jamais une clé
      // qu'il faudrait deviner manquante.
      sync_duration_estimate: entry.sync_duration_estimate ?? null,
      ...live,
      // L'état de la CAPACITÉ, et non celui de la connexion. C'est le seul
      // endroit du dépôt où l'on sait à la fois le statut, les portées
      // accordées et la date de dernière activité — donc le seul endroit où la
      // dérivation puisse être juste.
      capability_state: deriveCapabilityState({
        status: live.status,
        // Les portées RÉELLEMENT accordées, et non ce que le catalogue déclare.
        // C'était le défaut central du PDF 7 : `writesGranted` valait
        // `data_types.writes.length > 0`, c'est-à-dire « cet outil sait écrire
        // en principe » — un Google connecté sans `gmail.send` s'affichait donc
        // « opérationnel », et l'échec arrivait après le clic.
        writesGranted: writeCapabilitiesGranted(entry.provider, live, (entry.data_types?.writes ?? []).length > 0),
        writesPartial: writesArePartial(entry.provider, live),
        // La remontée de l'échec au niveau de l'outil. Sans elle, la carte
        // pourrait dire « opérationnel » pendant qu'une de ses capacités affiche
        // « dégradé » juste en dessous.
        degraded: capabilities.some(capability => capability.state === 'degraded'),
        lastSync: live.last_sync,
        now: new Date(ctx.now),
      }),
      capabilities,
    }
  }

  /**
   * #2261.13 (décision Louis 19/09, étendue le 21/09) — la latence probable :
   * MESURÉE en priorité sur les synchronisations réelles de l'espace, DÉCLARÉE
   * en repli (doc publique du fournisseur, `entry.latency` au catalogue —
   * `HUBSPOT_LATENCY_DECLARED` à ce jour, seule entrée renseignée) quand rien
   * n'est encore mesuré.
   *
   * `null` pour tout outil hors de {@link LATENCY_ELIGIBLE_PROVIDERS} (le
   * concept ne s'applique pas — recherche/enrichissement) ET pour tout outil
   * non `connected` (rien à mesurer sur une liaison qui n'existe pas). Pour
   * les autres, JAMAIS `null` : une mesure réelle, une annonce datée, ou la
   * raison écrite de leur absence commune (GA-18/GA-19) — dans cet ordre, une
   * mesure réelle gagne TOUJOURS contre une annonce fournisseur.
   */
  private resolveLatency(
    provider: string,
    status: ToolStatus,
    ctx: ResolveContext,
    declared: ConnectedTool['latency'] | undefined,
  ): ConnectedTool['latency'] {
    if (status !== 'connected' || !LATENCY_ELIGIBLE_PROVIDERS.has(provider)) return null
    const observations = ctx.latencyObservations[provider] ?? []
    const measured = measureToolLatency(observations, new Date(ctx.now), LATENCY_SOURCE_WIRED_PROVIDERS.has(provider))
    if (measured.source !== 'not_measured') return measured
    return declared ?? measured
  }

  private resolveLive(provider: string, source: ToolSource, ctx: ResolveContext): LiveState {
    switch (source.kind) {
      case 'webhook':
        return this.resolveWebhook(source.providerKey, ctx)
      case 'crm':
        return this.resolveCrm(source.providerKey, ctx)
      case 'oauth':
        return this.resolveOauth(source.providerKey, provider, ctx)
      case 'mcp':
        return this.resolveMcp(ctx)
      case 'workspace-secret':
        return resolveWorkspaceSecret(source.silo, source.providerKey, ctx)
      case 'server':
        return resolveServer(source.envKey)
      case 'ia-server':
        return resolveIaServer(source.providerId, ctx)
      case 'catalog':
        return unconnected('coming_soon')
    }
  }

  /** Webhook channels: a pasted URL, no expiry and no scopes. Connected iff a row
   *  exists, otherwise always `available` (no server config needed to connect). */
  private resolveWebhook(providerKey: string, ctx: ResolveContext): LiveState {
    const row = ctx.webhookRows.find(r => r.provider === providerKey)
    if (!row) return unconnected('available')
    return { status: 'connected', scopes: [], last_sync: lastActivity(row) }
  }

  /** OAuth CRM: env-gated → `coming_soon`. Configured but no row → `available`.
   *  Une connexion que le fournisseur a cessé d'honorer → `action_required`
   *  (voir {@link needsReconnect}). Sinon `connected`. */
  private resolveCrm(providerKey: CrmProviderKey, ctx: ResolveContext): LiveState {
    if (!CRM_CONFIGURED[providerKey]()) return unconnected('coming_soon')

    const row = ctx.crmRows.find(r => r.provider === providerKey)
    if (!row) return unconnected('available')

    return {
      status: needsReconnect(row, ctx.now) ? 'action_required' : 'connected',
      scopes: parseScope(row.scope),
      last_sync: lastActivity(row),
    }
  }

  /** OAuth dedicated-table modules (Google / Notion / Microsoft): env-gated →
   *  `coming_soon`. Configured but no link → `available`. Une connexion que le
   *  fournisseur a cessé d'honorer → `action_required` (voir
   *  {@link needsReconnect} ; le jeton Notion est longue durée et ne porte ni
   *  expiration ni rafraîchissement → jamais à reconnecter). Otherwise
   *  `connected`. Mirrors each module's own `getStatus`.
   *
   * #2254 — Gmail, Agenda et Drive partagent UN SEUL jeton (`google_connections`),
   * mais Google rend un consentement GRANULAIRE : rien n'empêche l'utilisateur
   * d'accorder Gmail et de refuser l'Agenda dans le même écran de consentement.
   * Avant ce correctif, le statut ne vérifiait que l'expiration du jeton —
   * jamais que LA portée de CET outil (`provider`, ex. `google-calendar`) avait
   * été accordée — donc brancher Gmail affichait Agenda ET Drive « connectés ».
   * Voir {@link googleToolScopeGranted}. */
  private resolveOauth(providerKey: OAuthProviderKey, provider: string, ctx: ResolveContext): LiveState {
    if (!OAUTH_CONFIGURED[providerKey]()) return unconnected('coming_soon')

    const row = providerKey === 'google' ? ctx.googleRow : providerKey === 'notion' ? ctx.notionRow : ctx.microsoftRow
    if (!row) return unconnected('available')

    const scope = 'scope' in row ? row.scope : null
    // Notion n'a ni expiration ni rafraîchissement en base (jeton longue durée) :
    // la question « faut-il reconnecter ? » ne se pose pas pour lui, et c'est ce
    // `in` qui le dit — plutôt qu'un champ optionnel qui laisserait croire qu'on
    // a regardé.
    const renewable = 'expires_at' in row ? row : null
    if (renewable && needsReconnect(renewable, ctx.now)) {
      return { status: 'action_required', scopes: parseScope(scope), last_sync: lastActivity(row) }
    }

    if (providerKey === 'google') {
      // Portées jamais stockées (connexion antérieure à #2078.22, ou état
      // qu'on ne sait pas lire) : on ne devine pas ce qui a été accordé — l'état
      // le plus proche du registre d'outils est « à reconnecter », jamais
      // « connecté ».
      if (scope == null || scope.trim() === '') {
        return { status: 'action_required', scopes: [], last_sync: lastActivity(row) }
      }
      if (!googleToolScopeGranted(provider, parseScope(scope))) return unconnected('available')
    }

    return {
      status: 'connected',
      scopes: parseScope(scope),
      last_sync: lastActivity(row),
    }
  }

  /** MCP: env-gated on `MCP_PUBLIC_URL` → `coming_soon`. Enabled with at least one
   *  active consent → `connected` (scopes unioned across grants). Enabled without
   *  a consent → `available`. */
  private resolveMcp(ctx: ResolveContext): LiveState {
    if (!ctx.mcpEnabled) return unconnected('coming_soon')
    if (ctx.mcpConsents.length === 0) return unconnected('available')

    const scopes = Array.from(new Set(ctx.mcpConsents.flatMap(c => parseScope(c.scope))))
    const latest = ctx.mcpConsents
      .map(c => c.updated_at ?? c.created_at)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    return { status: 'connected', scopes, last_sync: toIso(latest) }
  }
}

/** The honest `last_sync` for a connection row: the REAL usage stamp first
 *  (`last_used_at` — export / delivery), then config activity, then creation. */
function lastActivity(row: {
  last_used_at?: Date | null
  updated_at?: Date | null
  created_at?: Date | null
}): string | null {
  return toIso(row.last_used_at ?? row.updated_at ?? row.created_at)
}

/**
 * « Cette connexion demande-t-elle vraiment une reconnexion ? »
 *
 * La question ressemble à « le jeton est-il expiré ? » et ce n'est pas la même.
 * `expires_at` est l'expiration du jeton d'ACCÈS — 30 min chez HubSpot, ~1 h chez
 * Microsoft et Google. Le lire comme « autorisation expirée » allumait une carte
 * rouge et un « les actions sont en pause » sur toute connexion saine restée une
 * heure sans servir, ce qui se vivait comme une déconnexion permanente.
 *
 * Deux faits, et deux seulement, valent reconnexion :
 *
 * 1. **Un rafraîchissement a été refusé** (`refresh_failed_at`) — consentement
 *    retiré, mot de passe changé, application désinstallée. C'est le seul signal
 *    positif, et il est écrit par les services au moment où le fournisseur dit non.
 * 2. **Le jeton d'accès est périmé et rien ne peut le renouveler** — pas de jeton
 *    de rafraîchissement en base. Là, plus personne ne peut rien sans l'utilisateur.
 *
 * Un jeton longue durée sans expiration (Attio, Notion) ne remplit ni l'une ni
 * l'autre : il reste connecté, ce qui est la vérité.
 */
function needsReconnect(
  row: { expires_at: Date | null; refresh_token_enc: string | null; refresh_failed_at: Date | null },
  now: number,
): boolean {
  if (row.refresh_failed_at != null) return true
  const accessExpired = row.expires_at != null && new Date(row.expires_at).getTime() < now
  return accessExpired && !row.refresh_token_enc
}

/**
 * Silo « identifiants par espace » : connecté dès qu'une ligne existe pour ce
 * fournisseur, sinon disponible — jamais `coming_soon`, puisqu'il n'y a rien à
 * activer côté serveur.
 *
 * Seul l'ERP a un repli d'environnement, et il compte : quand la plateforme
 * porte les identifiants, l'outil FONCTIONNE pour cet espace même sans ligne.
 * Le dire « disponible » enverrait le client saisir un jeton dont il n'a pas
 * besoin. Aucune portée n'est accordée ici (ce sont des clés d'API, pas OAuth).
 */
function resolveWorkspaceSecret(silo: SecretSiloKey, providerKey: string, ctx: ResolveContext): LiveState {
  const row = ctx.secretRows[silo].find(r => r.provider === providerKey)
  if (row) return { status: 'connected', scopes: [], last_sync: lastActivity(row) }
  if (silo === 'ats' && providerKey === 'boondmanager' && ctx.atsFromEnvironment) {
    return { status: 'connected', scopes: [], last_sync: null }
  }
  return unconnected('available')
}

/** Server-side capability whose key lives on THIS (API) service: the env key
 *  present means the feature is LIVE for the whole workspace right now; absent =
 *  not shipped on this server. No per-connection timestamp exists → `last_sync`
 *  stays null. */
function resolveServer(envKey: string): LiveState {
  const enabled = Boolean(process.env[envKey]?.trim())
  return enabled ? { status: 'connected', scopes: [], last_sync: null } : unconnected('coming_soon')
}

/** Server-side data source whose key lives on the IA service: `connected` iff the
 *  IA reported it configured, otherwise `coming_soon` (absent OR the status could
 *  not be fetched — we never claim a capability we couldn't confirm). No
 *  per-connection timestamp exists → `last_sync` stays null. */
function resolveIaServer(providerId: string, ctx: ResolveContext): LiveState {
  return ctx.iaProviders[providerId] ? { status: 'connected', scopes: [], last_sync: null } : unconnected('coming_soon')
}

/** A not-(yet-)connected live state: no scopes, no timestamp. */
function unconnected(status: Extract<ToolStatus, 'available' | 'coming_soon'>): LiveState {
  return { status, scopes: [], last_sync: null }
}

import { DEMO_LISTED_CRM_PROVIDERS, DEMO_RECONNECT_PROVIDERS } from './demo-connections'
import { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import type { ConfigService } from '@nestjs/config'
import { In, IsNull, type Repository } from 'typeorm'
import { connectedToolSchema, type ConnectedTool } from '@bellum/contracts'
import type { AdminDocsConnectionEntity } from '../../database/entities/admin-docs-connection.entity'
import type { AtsConnectionEntity } from '../../database/entities/ats-connection.entity'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { CrmSyncCursorEntity } from '../../database/entities/crm-sync-cursor.entity'
import type { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import type { IntegrationEntity } from '../../database/entities/integration.entity'
import type { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import type { NotionConnectionEntity } from '../../database/entities/notion-connection.entity'
import type { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import type { TelephonyConnectionEntity } from '../../database/entities/telephony-connection.entity'
import type { LemlistConnectionEntity } from '../../database/entities/lemlist-connection.entity'
import type { ToolLatencyObservationEntity } from '../../database/entities/tool-latency-observation.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TOOL_CATALOG } from './tool-catalog'
import { ToolRegistryService } from './tool-registry.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WS = 'ws-00000000-0000-0000-0000-000000000000'

/** Minimal typeorm-`FindOperator` marker used by the service's queries. */
function isFindOperator(v: unknown): v is { _type: string; _value: unknown } {
  return typeof v === 'object' && v !== null && '_type' in v
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    // Two operators reach the repositories: `IsNull()` (active MCP consents) and
    // `In([...])` (the personal silos — one user in the app view, every workspace
    // member in the operator view).
    if (isFindOperator(v)) {
      if (v._type === 'in') return (v._value as unknown[]).includes(row[k])
      return row[k] == null
    }
    return row[k] === v
  })
}

function repo<T extends object>(rows: T[]): Repository<T> {
  return {
    find: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.filter(r => matches(r as Record<string, unknown>, where)),
    ),
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.find(r => matches(r as Record<string, unknown>, where)) ?? null,
    ),
  } as unknown as Repository<T>
}

function configStub(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService
}

/** Stub IaClient whose `integrationStatus` reports the given `configured` flags for
 *  the IA-hosted data sources (Apollo, France Travail, Brave…). Empty by default. */
function iaStub(providers: Record<string, boolean> = {}): IaClient {
  return { integrationStatus: jest.fn(async () => ({ providers })) } as unknown as IaClient
}

const workspaceOk = {
  resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' as const })),
  isDemoWorkspace: jest.fn(async () => false),
} as unknown as WorkspaceContextService

type Seed = {
  integrations?: Partial<IntegrationEntity>[]
  crm?: Partial<CrmConnectionEntity>[]
  google?: Partial<GoogleConnectionEntity>[]
  notion?: Partial<NotionConnectionEntity>[]
  microsoft?: Partial<MicrosoftConnectionEntity>[]
  consents?: Partial<OAuthConsentEntity>[]
  mcpUrl?: string
  workspace?: WorkspaceContextService
  /** IA-hosted data providers reported `configured` by the (stubbed) IA. */
  iaProviders?: Record<string, boolean>
  /** Workspace membership rows, for the operator view. */
  members?: Partial<WorkspaceMemberEntity>[]
  /** Silos « identifiants par espace » : ATS, téléphonie, administratif. */
  ats?: Partial<AtsConnectionEntity>[]
  telephony?: Partial<TelephonyConnectionEntity>[]
  /** #4427 — la clé Lemlist de l'espace. */
  lemlist?: Partial<LemlistConnectionEntity>[]
  adminDocs?: Partial<AdminDocsConnectionEntity>[]
  /** Les preuves de capacité — vides = tout `untested`, le repli honnête. */
  probes?: Partial<ConnectorCapabilityProbeEntity>[]
  /** #2261.13 (19/09) — les synchros réelles des 7 derniers jours. */
  latencyObservations?: Partial<ToolLatencyObservationEntity>[]
  /** CRM-SYNC-D.2 — les curseurs de synchro CRM : un passage réel qui a abouti prouve la lecture. */
  cursors?: Partial<CrmSyncCursorEntity>[]
}

function makeService(seed: Seed = {}): ToolRegistryService {
  return new ToolRegistryService(
    repo((seed.integrations ?? []) as IntegrationEntity[]),
    repo((seed.crm ?? []) as CrmConnectionEntity[]),
    repo((seed.consents ?? []) as OAuthConsentEntity[]),
    repo((seed.google ?? []) as GoogleConnectionEntity[]),
    repo((seed.notion ?? []) as NotionConnectionEntity[]),
    repo((seed.microsoft ?? []) as MicrosoftConnectionEntity[]),
    repo((seed.members ?? []) as WorkspaceMemberEntity[]),
    repo((seed.ats ?? []) as AtsConnectionEntity[]),
    repo((seed.telephony ?? []) as TelephonyConnectionEntity[]),
    repo((seed.adminDocs ?? []) as AdminDocsConnectionEntity[]),
    // Les preuves de capacité : vides par défaut, donc tout s'affiche
    // `untested` — le repli honnête tant que rien n'a été vérifié.
    repo((seed.probes ?? []) as ConnectorCapabilityProbeEntity[]),
    // #2261.13 (19/09) — les synchros réelles : vides par défaut, donc tout
    // ressort `not_measured` (échantillon insuffisant) plutôt qu'un chiffre.
    repo((seed.latencyObservations ?? []) as ToolLatencyObservationEntity[]),
    seed.workspace ?? workspaceOk,
    configStub({ mcpPublicUrl: seed.mcpUrl, internalApiSecret: 'test-secret' }),
    iaStub(seed.iaProviders),
    repo((seed.cursors ?? []) as CrmSyncCursorEntity[]),
    repo((seed.lemlist ?? []) as LemlistConnectionEntity[]),
  )
}

function byProvider(list: ConnectedTool[], provider: string): ConnectedTool {
  const found = list.find(t => t.provider === provider)
  if (!found) throw new Error(`tool ${provider} missing from registry`)
  return found
}

const OLD_ENV = { ...process.env }

function configureHubspot(): void {
  process.env['HUBSPOT_CLIENT_ID'] = 'id'
  process.env['HUBSPOT_CLIENT_SECRET'] = 'secret'
  process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.bellum-ai.com/crm/hubspot/callback'
}
function configureSalesforce(): void {
  process.env['SALESFORCE_CLIENT_ID'] = 'id'
  process.env['SALESFORCE_CLIENT_SECRET'] = 'secret'
  process.env['SALESFORCE_REDIRECT_URI'] = 'https://api.bellum-ai.com/salesforce/callback'
}
function configurePipedrive(): void {
  process.env['PIPEDRIVE_CLIENT_ID'] = 'id'
  process.env['PIPEDRIVE_CLIENT_SECRET'] = 'secret'
  process.env['PIPEDRIVE_REDIRECT_URI'] = 'https://api.bellum-ai.com/pipedrive/callback'
}
function configureGoogle(): void {
  process.env['GOOGLE_CLIENT_ID'] = 'id'
  process.env['GOOGLE_CLIENT_SECRET'] = 'secret'
  process.env['GOOGLE_REDIRECT_URI'] = 'https://api.bellum-ai.com/google/callback'
}
function configureNotion(): void {
  process.env['NOTION_CLIENT_ID'] = 'id'
  process.env['NOTION_CLIENT_SECRET'] = 'secret'
  process.env['NOTION_REDIRECT_URI'] = 'https://api.bellum-ai.com/notion/callback'
}
function configureMicrosoft(): void {
  process.env['MICROSOFT_CLIENT_ID'] = 'id'
  process.env['MICROSOFT_CLIENT_SECRET'] = 'secret'
  process.env['MICROSOFT_REDIRECT_URI'] = 'https://api.bellum-ai.com/microsoft/callback'
}

describe('ToolRegistryService', () => {
  beforeEach(() => {
    // Start every case from a clean, unconfigured environment so no ambient key on
    // the CI runner flips a provider to available/connected.
    for (const k of Object.keys(process.env)) {
      if (
        k.startsWith('HUBSPOT_') ||
        k.startsWith('SALESFORCE_') ||
        k.startsWith('PIPEDRIVE_') ||
        k.startsWith('ATTIO_') ||
        k.startsWith('ZOHO_') ||
        k.startsWith('DROPCONTACT_') ||
        k.startsWith('GOOGLE_') ||
        k.startsWith('NOTION_') ||
        k.startsWith('MICROSOFT_') ||
        // L'ERP a un repli d'environnement : une clé ambiante sur le runner
        // ferait passer BoondManager à « connecté » sans aucune ligne en base.
        k.startsWith('BOONDMANAGER_') ||
        k === 'STRIPE_SECRET_KEY'
      ) {
        delete process.env[k]
      }
    }
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.clearAllMocks()
  })

  it('emits exactly one entry per catalogue tool, each valid against the contract', async () => {
    const list = await makeService().list(USER)
    expect(list).toHaveLength(TOOL_CATALOG.length)
    for (const tool of list) expect(connectedToolSchema.parse(tool)).toEqual(tool)
  })

  it('#3973 — Microsoft 365 sert la messagerie ET l’agenda ; un outil mono-famille ne porte pas le champ', async () => {
    const list = await makeService().list(USER)
    const microsoft = list.find(tool => tool.provider === 'microsoft')
    expect(microsoft?.family).toBe('email')
    expect(microsoft?.additional_families).toEqual(['calendar'])
    expect(list.find(tool => tool.provider === 'gmail')).not.toHaveProperty('additional_families')
  })

  it('every catalogue entry is a COMPLETE record: cost model, memory policy, read/write data types (v2)', () => {
    // Roadmap §8-9 « Connected Account Memory » : chaque intégration = record
    // complet. FR+EN sur chaque texte (règle i18n permanente).
    for (const entry of TOOL_CATALOG) {
      expect(entry.cost_model.fr.length).toBeGreaterThan(0)
      expect(entry.cost_model.en.length).toBeGreaterThan(0)
      expect(entry.memory_policy.fr.length).toBeGreaterThan(0)
      expect(entry.memory_policy.en.length).toBeGreaterThan(0)
      // A tool that neither reads nor writes anything would not be a tool.
      expect(entry.data_types.reads.length + entry.data_types.writes.length).toBeGreaterThan(0)
      expect(entry.allowed_actions.length).toBeGreaterThan(0)
    }
  })

  it('declares the documented cost model on the key providers (Dropcontact 1 crédit, webhook gratuit)', () => {
    const byId = (p: string): (typeof TOOL_CATALOG)[number] => {
      const found = TOOL_CATALOG.find(e => e.provider === p)
      if (!found) throw new Error(`catalog entry ${p} missing`)
      return found
    }
    expect(byId('dropcontact').cost_model.fr).toContain('1 crédit')
    expect(byId('webhook').cost_model.fr).toContain('gratuit')
    expect(byId('hubspot').cost_model.fr).toContain('inclus')
    expect(byId('mcp').cost_model.fr).toContain('1 crédit par analyse')
  })

  it('aggregates the real state of the three silos into one list', async () => {
    configureHubspot()
    configureSalesforce()
    const updatedAt = new Date('2026-07-15T09:00:00.000Z')
    const list = await makeService({
      mcpUrl: 'https://mcp.bellum-ai.com',
      integrations: [{ provider: 'slack', user_id: USER, created_at: new Date('2026-07-01'), updated_at: updatedAt }],
      crm: [
        {
          provider: 'hubspot',
          workspace_id: WS,
          scope: 'crm.objects.contacts.read crm.objects.contacts.write',
          expires_at: new Date(Date.now() + 3_600_000),
          updated_at: updatedAt,
        },
        {
          provider: 'salesforce',
          workspace_id: WS,
          scope: 'api refresh_token',
          expires_at: new Date(Date.now() - 3_600_000), // expired
          updated_at: updatedAt,
        },
      ],
      consents: [{ user_id: USER, scope: 'mcp:read mcp:analysis', revoked_at: null, updated_at: updatedAt }],
    }).list(USER)

    const hubspot = byProvider(list, 'hubspot')
    expect(hubspot.status).toBe('connected')
    expect(hubspot.scopes).toEqual(['crm.objects.contacts.read', 'crm.objects.contacts.write'])
    expect(hubspot.last_sync).toBe(updatedAt.toISOString())
    expect(hubspot.owner).toBe('workspace')

    // Jeton CRM périmé ET sans jeton de rafraîchissement → action_required.
    // (Périmé AVEC de quoi le renouveler reste `connected` — test dédié plus bas.)
    expect(byProvider(list, 'salesforce').status).toBe('action_required')

    // Connected webhook + an unconnected sibling webhook (always "available").
    expect(byProvider(list, 'slack').status).toBe('connected')
    expect(byProvider(list, 'slack').last_sync).toBe(updatedAt.toISOString())
    expect(byProvider(list, 'discord').status).toBe('available')

    const mcp = byProvider(list, 'mcp')
    expect(mcp.status).toBe('connected')
    expect(mcp.scopes).toEqual(expect.arrayContaining(['mcp:read', 'mcp:analysis']))
    expect(mcp.owner).toBe('user')

    // LinkedIn is genuinely not built yet → the only always-coming_soon tool.
    const linkedin = byProvider(list, 'linkedin')
    expect(linkedin.status).toBe('coming_soon')
    expect(linkedin.scopes).toEqual([])
    expect(linkedin.last_sync).toBeNull()

    // Gmail is OAuth-backed (Google): with Google unconfigured on this server it is
    // honestly coming_soon — no invented connection.
    expect(byProvider(list, 'gmail').status).toBe('coming_soon')
  })

  it('reports available for a configured-but-unconnected CRM, coming_soon when the feature is off', async () => {
    configureHubspot() // Salesforce + MCP intentionally left unconfigured
    const list = await makeService().list(USER)

    expect(byProvider(list, 'hubspot').status).toBe('available')
    expect(byProvider(list, 'salesforce').status).toBe('coming_soon')
    expect(byProvider(list, 'mcp').status).toBe('coming_soon')
    expect(byProvider(list, 'slack').status).toBe('available')
  })

  it('reports available for MCP when enabled but not yet authorized', async () => {
    const list = await makeService({ mcpUrl: 'https://mcp.bellum-ai.com' }).list(USER)
    expect(byProvider(list, 'mcp').status).toBe('available')
  })

  it('prefers the REAL usage stamp (last_used_at) over updated_at for last_sync (v2)', async () => {
    configureHubspot()
    const usedAt = new Date('2026-07-16T08:00:00.000Z')
    const updatedAt = new Date('2026-07-10T09:00:00.000Z')
    const list = await makeService({
      integrations: [
        {
          provider: 'slack',
          user_id: USER,
          created_at: new Date('2026-07-01'),
          updated_at: updatedAt,
          last_used_at: usedAt,
        },
        // No usage yet → honest fallback on updated_at, never an invented date.
        {
          provider: 'discord',
          user_id: USER,
          created_at: new Date('2026-07-01'),
          updated_at: updatedAt,
          last_used_at: null,
        },
      ],
      crm: [
        {
          provider: 'hubspot',
          workspace_id: WS,
          scope: 'crm.objects.contacts.read',
          expires_at: new Date(Date.now() + 3_600_000),
          updated_at: updatedAt,
          last_used_at: usedAt,
        },
      ],
    }).list(USER)

    expect(byProvider(list, 'slack').last_sync).toBe(usedAt.toISOString())
    expect(byProvider(list, 'discord').last_sync).toBe(updatedAt.toISOString())
    expect(byProvider(list, 'hubspot').last_sync).toBe(usedAt.toISOString())
  })

  it('reports Pipedrive from the shared crm_connections silo, env-gated like the other CRMs', async () => {
    configurePipedrive()
    const list = await makeService({
      crm: [{ provider: 'pipedrive', workspace_id: WS, scope: 'contacts:full', expires_at: null }],
    }).list(USER)
    expect(byProvider(list, 'pipedrive').status).toBe('connected')
    expect(byProvider(list, 'pipedrive').scopes).toEqual(['contacts:full'])
    // Attio: feature not configured on this server → coming_soon, never connected.
    expect(byProvider(list, 'attio').status).toBe('coming_soon')
  })

  // #4187 — sans clé la carte Zoho reste masquée (`coming_soon`), avec les trois clés elle devient branchable.
  it('Zoho : coming_soon sans clé, available avec les trois clés, coming_soon si une manque', async () => {
    expect(byProvider(await makeService().list(USER), 'zoho').status).toBe('coming_soon')

    process.env['ZOHO_CLIENT_ID'] = 'id'
    process.env['ZOHO_CLIENT_SECRET'] = 'secret'
    expect(byProvider(await makeService().list(USER), 'zoho').status).toBe('coming_soon')

    process.env['ZOHO_REDIRECT_URI'] = 'https://api.bellum-ai.com/zoho/callback'
    expect(byProvider(await makeService().list(USER), 'zoho').status).toBe('available')
  })

  it('reports Dropcontact connected iff the server key is present (server-side capability)', async () => {
    expect(byProvider(await makeService().list(USER), 'dropcontact').status).toBe('coming_soon')

    process.env['DROPCONTACT_API_KEY'] = 'dc-key'
    const tool = byProvider(await makeService().list(USER), 'dropcontact')
    expect(tool.status).toBe('connected')
    // No per-connection timestamp exists server-side → null, never invented.
    expect(tool.last_sync).toBeNull()
    expect(tool.cost_model?.fr).toContain('1 crédit')
  })

  // #2254 — Gmail, Agenda et Drive partagent UN jeton (`google_connections`),
  // mais Google rend un consentement GRANULAIRE : brancher Gmail seul ne
  // branche pas l'Agenda. Avant ce correctif, le statut ne vérifiait que
  // l'expiration du jeton, jamais que LA portée de CET outil avait été
  // accordée — brancher Gmail affichait donc Agenda ET Drive « connectés ».
  it('resolves Google Workspace from google_connections, one outil connecté par portée accordée (#2254)', async () => {
    // Unconfigured on this server → coming_soon, never connected.
    expect(byProvider(await makeService().list(USER), 'gmail').status).toBe('coming_soon')

    // Configured but no link yet → available (connectable now).
    configureGoogle()
    expect(byProvider(await makeService().list(USER), 'google-drive').status).toBe('available')

    // Un jeton qui n'a accordé QUE Gmail et Drive : l'Agenda reste `available`,
    // jamais `connected` — c'est la reproduction exacte du bug #2254.
    const updatedAt = new Date('2026-07-16T09:00:00.000Z')
    const list = await makeService({
      google: [
        {
          provider: 'google',
          workspace_id: WS,
          // #3087 (26/09/2026) — une connexion PERSONNELLE, jamais partagée
          // par repli : la ligne doit porter l'utilisateur qui interroge.
          user_id: USER,
          scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly',
          expires_at: new Date(Date.now() + 3_600_000),
          updated_at: updatedAt,
        },
      ],
    }).list(USER)
    expect(byProvider(list, 'gmail').status).toBe('connected')
    expect(byProvider(list, 'google-drive').status).toBe('connected')
    expect(byProvider(list, 'google-calendar').status).toBe('available')
    expect(byProvider(list, 'gmail').scopes).toContain('https://www.googleapis.com/auth/gmail.send')
    expect(byProvider(list, 'gmail').last_sync).toBe(updatedAt.toISOString())
  })

  it('connecte les deux outils dès que chacun a sa propre portée accordée (#2254)', async () => {
    configureGoogle()
    const list = await makeService({
      google: [
        {
          provider: 'google',
          workspace_id: WS,
          user_id: USER,
          scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly',
          expires_at: new Date(Date.now() + 3_600_000),
        },
      ],
    }).list(USER)
    expect(byProvider(list, 'gmail').status).toBe('connected')
    expect(byProvider(list, 'google-calendar').status).toBe('connected')
    // Drive n'a reçu aucune de ses portées : il reste à connecter.
    expect(byProvider(list, 'google-drive').status).toBe('available')
  })

  it('une connexion Google sans portée stockée (antérieure à #2078.22) ne se dit jamais « connectée » (#2254)', async () => {
    configureGoogle()
    const list = await makeService({
      google: [
        {
          provider: 'google',
          workspace_id: WS,
          user_id: USER,
          scope: null,
          expires_at: new Date(Date.now() + 3_600_000),
        },
      ],
    }).list(USER)
    for (const p of ['gmail', 'google-calendar', 'google-drive']) {
      // On ne devine pas ce qui a été accordé : l'état le plus proche du
      // registre d'outils est « à reconnecter », jamais « connecté ».
      expect(byProvider(list, p).status).toBe('action_required')
    }
  })

  it('flags an expired Google token with no way to renew it as action_required', async () => {
    configureGoogle()
    const list = await makeService({
      google: [
        { provider: 'google', workspace_id: WS, user_id: USER, scope: 'x', expires_at: new Date(Date.now() - 1000) },
      ],
    }).list(USER)
    expect(byProvider(list, 'gmail').status).toBe('action_required')
  })

  // Le défaut vécu le 14/08 : un jeton d'accès dure 30 min (HubSpot) à 1 h
  // (Google, Microsoft). Le lire comme « autorisation expirée » affichait « à
  // reconnecter » sur toute connexion saine restée une heure sans servir — alors
  // que le jeton de rafraîchissement est là, dans la même ligne, et que le
  // prochain appel réel le renouvelle tout seul.
  it('garde connectée une liaison dont le jeton d’accès est périmé mais renouvelable', async () => {
    configureGoogle()
    configureHubspot()
    configureMicrosoft()
    const anHourAgo = new Date(Date.now() - 3_600_000)
    const list = await makeService({
      google: [
        {
          provider: 'google',
          workspace_id: WS,
          user_id: USER,
          // Une vraie portée Gmail (#2254 exige désormais que CET outil ait la
          // sienne) — le fait testé ici est la renouvelabilité, pas le choix
          // de portée.
          scope: 'https://www.googleapis.com/auth/gmail.send',
          expires_at: anHourAgo,
          refresh_token_enc: 'enc:refresh',
        },
      ],
      crm: [{ provider: 'hubspot', workspace_id: WS, scope: 'x', expires_at: anHourAgo, refresh_token_enc: 'enc:r' }],
      microsoft: [
        {
          provider: 'microsoft',
          workspace_id: WS,
          user_id: USER,
          scope: 'Mail.Send',
          expires_at: anHourAgo,
          refresh_token_enc: 'enc:r',
        },
      ],
    }).list(USER)
    for (const provider of ['gmail', 'hubspot', 'microsoft']) {
      expect(byProvider(list, provider).status).toBe('connected')
    }
  })

  // Le symétrique, sans lequel le correctif ci-dessus rendrait l'écran muet : un
  // jeton de rafraîchissement RÉVOQUÉ (mot de passe changé, application retirée)
  // s'afficherait « connecté » jusqu'au premier clic qui échoue.
  it('demande une reconnexion dès qu’un rafraîchissement a été refusé, même jeton d’accès valide', async () => {
    configureHubspot()
    const list = await makeService({
      crm: [
        {
          provider: 'hubspot',
          workspace_id: WS,
          scope: 'x',
          expires_at: new Date(Date.now() + 3_600_000),
          refresh_token_enc: 'enc:refresh',
          refresh_failed_at: new Date(Date.now() - 60_000),
        },
      ],
    }).list(USER)
    expect(byProvider(list, 'hubspot').status).toBe('action_required')
  })

  it('resolves Notion from its dedicated table (long-lived token → never action_required)', async () => {
    expect(byProvider(await makeService().list(USER), 'notion').status).toBe('coming_soon')

    configureNotion()
    expect(byProvider(await makeService().list(USER), 'notion').status).toBe('available')

    const list = await makeService({
      notion: [{ workspace_id: WS, workspace_name: 'Team', created_at: new Date('2026-07-01') }],
    }).list(USER)
    expect(byProvider(list, 'notion').status).toBe('connected')
    // No expiry / scope column on Notion → never action_required, scopes empty.
    expect(byProvider(list, 'notion').scopes).toEqual([])
  })

  it('resolves Microsoft 365 from its dedicated table, env-gated', async () => {
    expect(byProvider(await makeService().list(USER), 'microsoft').status).toBe('coming_soon')

    configureMicrosoft()
    const list = await makeService({
      microsoft: [
        {
          provider: 'microsoft',
          workspace_id: WS,
          user_id: USER,
          scope: 'Mail.Send',
          expires_at: new Date(Date.now() + 3_600_000),
        },
      ],
    }).list(USER)
    expect(byProvider(list, 'microsoft').status).toBe('connected')
    expect(byProvider(list, 'microsoft').scopes).toEqual(['Mail.Send'])
  })

  it('reports Apollo from the IA status (not a hardcoded coming_soon) — the flagship fix', async () => {
    // No IA report → coming_soon (honest: could not confirm the IA-hosted key).
    expect(byProvider(await makeService().list(USER), 'apollo').status).toBe('coming_soon')

    // IA reports the key present → connected, no invented timestamp.
    const tool = byProvider(await makeService({ iaProviders: { apollo: true } }).list(USER), 'apollo')
    expect(tool.status).toBe('connected')
    expect(tool.last_sync).toBeNull()
    expect(tool.owner).toBe('workspace')
  })

  it('reports France Travail + the data sources (Brave/Serper/Tavily) from the IA status', async () => {
    const list = await makeService({
      iaProviders: { france_travail: true, brave: true, serper: false },
    }).list(USER)
    expect(byProvider(list, 'france-travail').status).toBe('connected')
    expect(byProvider(list, 'brave').status).toBe('connected')
    expect(byProvider(list, 'serper').status).toBe('coming_soon')
    expect(byProvider(list, 'tavily').status).toBe('coming_soon')
  })

  // #2261.30 — BOAMP (appels d'offres) est une famille DISTINCTE de `jobs`
  // (offres d'emploi, wttj/france-travail) : les confondre mélangerait deux
  // capacités différentes dans le manifeste que Laura lit.
  it('reports BOAMP (tenders) as its OWN family, never mixed with `jobs`', async () => {
    const list = await makeService({ iaProviders: { boamp: true, france_travail: true } }).list(USER)
    const boamp = byProvider(list, 'boamp')
    const franceTravail = byProvider(list, 'france-travail')
    expect(boamp.family).toBe('tenders')
    expect(franceTravail.family).toBe('jobs')
    expect(boamp.family).not.toBe(franceTravail.family)
    expect(boamp.status).toBe('connected')
    // #2261.8 — BOAMP ne DÉCLARE aucune fenêtre de couverture sur ce mirroir
    // public : `null`, jamais devinée à partir du filtre de 18 mois appliqué
    // en interne par `public_tenders.py`.
    expect(boamp.coverage_period).toBeNull()
    // Contraste : France Travail DÉCLARE (structurellement, par nature d'une
    // API de recherche d'offres) ne renvoyer que les offres actuelles — un
    // outil DÉCLARÉ à côté d'un outil INCONNU, la démonstration la plus
    // honnête du manifeste (craft rule n°9).
    expect(franceTravail.coverage_period?.fr).toContain('aucun historique')
    expect(franceTravail.coverage_period?.en.length).toBeGreaterThan(0)
  })

  // #2261.8 / #2261.16 — défaut mesuré en production le 18/09/2026 sur
  // /integrations (espace de Louis, 31 comptes) : HubSpot, Salesforce,
  // Google Workspace, Microsoft 365 et Notion affichaient TOUS « non
  // précisée » / « non communiqué » sur `coverage_period` et `beta` — un
  // `null` générique, identique sur cinq outils, lu comme un champ oublié
  // plutôt que comme une réponse. DÉCISION LOUIS 18/09/2026 : chaque
  // connecteur DÉCLARE ces deux champs EN DUR dans son manifeste
  // (`tool-catalog.ts`), même quand la réponse est « non mesuré » — le texte
  // vit désormais AU CONNECTEUR, jamais au repli générique du service.
  //
  // Ce test protège la DÉCLARATION : il rougit si un de ces sept outils
  // retombe sur `null`, le vide muet réfuté en prod.
  it('declares coverage_period/beta per connector (Louis 18/09), on tools NOT connected here', async () => {
    const list = await makeService().list(USER)
    const branchable = ['hubspot', 'salesforce', 'gmail', 'google-calendar', 'google-drive', 'notion', 'microsoft']
    for (const provider of branchable) {
      const tool = byProvider(list, provider)
      // #2261.8 — jamais `null` : soit une période réelle, soit le texte
      // déclaré « non mesuré », jamais une date devinée (GA-18/GA-19).
      expect(tool.coverage_period).not.toBeNull()
      expect(tool.coverage_period?.fr.length).toBeGreaterThan(0)
      expect(tool.coverage_period?.en.length).toBeGreaterThan(0)
      // #2261.16 — statut bêta déclaré : `beta` est un booléen connu, jamais
      // deviné. Aucun de ces sept connecteurs n'appelle d'endpoint « beta »
      // documenté dans ce dépôt (Microsoft : `graph.microsoft.com/v1.0`
      // exclusivement) — `false` est un FAIT vérifié, pas une supposition.
      expect(tool.beta).not.toBeNull()
      expect(tool.beta?.beta).toBe(false)
      expect(tool.beta?.feature).toBeNull()
      // #2261.13 (19/09) — non connecté ici (aucun n'est configuré dans ce
      // fixture) : le concept de latence ne s'applique pas encore à une
      // liaison qui n'existe pas. Voir le describe dédié plus bas pour le
      // cas CONNECTÉ.
      expect(tool.latency).toBeNull()
      // Le contrat REQUIERT les trois clés (pas `.optional()`) : une réponse
      // qui les omettrait romprait le point même de `?? null` — les nommer
      // plutôt que les taire (GA-18/GA-19).
      expect(connectedToolSchema.safeParse(tool).success).toBe(true)
    }
  })

  // #2261.13 (décision Louis 19/09) — la latence probable d'un outil CONNECTÉ,
  // MESURÉE sur ses synchronisations réelles. Un `null` muet ne suffit plus :
  // soit une mesure datée, soit la raison écrite de son absence.
  describe('latency (#2261.13, décision 19/09) — un outil CONNECTÉ ne rend jamais `null` muet', () => {
    function makeConnectedService(seed: Parameters<typeof makeService>[0] = {}) {
      configureHubspot()
      configureSalesforce()
      configureGoogle()
      configureNotion()
      configureMicrosoft()
      const anHourAgo = new Date(Date.now() - 3_600_000)
      return makeService({
        crm: [
          { provider: 'hubspot', workspace_id: WS, scope: 'x', expires_at: anHourAgo, refresh_token_enc: 'enc:r' },
          { provider: 'salesforce', workspace_id: WS, scope: 'x', expires_at: anHourAgo, refresh_token_enc: 'enc:r' },
        ],
        google: [
          {
            provider: 'google',
            workspace_id: WS,
            user_id: USER,
            // Les trois familles Google (#2254) : chacune exige sa PROPRE
            // portée accordée, jamais « Google connecté » en général.
            scope:
              'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly',
            expires_at: anHourAgo,
            refresh_token_enc: 'enc:refresh',
          },
        ],
        notion: [{ workspace_id: WS, workspace_name: 'Team', created_at: new Date('2026-07-01') }],
        microsoft: [
          {
            provider: 'microsoft',
            workspace_id: WS,
            user_id: USER,
            scope: 'Mail.Send',
            expires_at: anHourAgo,
            refresh_token_enc: 'enc:r',
          },
        ],
        ...seed,
      })
    }

    const branchable = ['hubspot', 'salesforce', 'gmail', 'google-calendar', 'google-drive', 'notion', 'microsoft']

    it('sans aucune synchro réelle : « non mesuré » avec sa raison — jamais `null`, jamais `0`', async () => {
      const list = await makeConnectedService().list(USER)
      for (const provider of branchable) {
        const tool = byProvider(list, provider)
        expect(tool.status).toBe('connected')
        expect(tool.latency).not.toBeNull()
        // #2261.13 (décision Louis 21/09) — HubSpot a désormais une latence
        // DÉCLARÉE par la doc publique (`HUBSPOT_LATENCY_DECLARED`) : sans
        // synchro réelle, le service retombe dessus plutôt que sur
        // `not_measured`. Les six autres n'ont aucune annonce trouvée dans
        // leur doc publique (21/09) — ils gardent `not_measured`.
        if (provider === 'hubspot') {
          expect(tool.latency?.source).toBe('declared')
          if (tool.latency?.source !== 'declared') continue
          expect(tool.latency.value.fr.length).toBeGreaterThan(0)
          expect(tool.latency.value.en.length).toBeGreaterThan(0)
          expect(tool.latency.as_of.length).toBeGreaterThan(0)
        } else {
          expect(tool.latency?.source).toBe('not_measured')
          if (tool.latency?.source !== 'not_measured') continue
          expect(tool.latency.reason.fr.length).toBeGreaterThan(0)
          expect(tool.latency.reason.en.length).toBeGreaterThan(0)
        }
        expect(connectedToolSchema.safeParse(tool).success).toBe(true)
      }
    })

    // Seul HubSpot est câblé à ce jour (`CrmSyncService`) ET a une latence
    // DÉCLARÉE trouvée dans sa doc publique (#2261.13, décision Louis 21/09,
    // `HUBSPOT_LATENCY_DECLARED`) — sans synchro réelle, il retombe dessus.
    // La raison interne « pas assez de synchros » (`measureToolLatency`)
    // reste vraie et testée unitairement (`tool-latency.spec.ts`), mais elle
    // n'atteint plus la réponse du service pour CE connecteur précis. Les six
    // autres, sans déclaration trouvée dans leur doc publique, gardent
    // `not_measured` avec la raison « Bellum ne capture pas cet horodatage ».
    it('HubSpot retombe sur sa latence DÉCLARÉE ; Notion garde « Bellum ne capture pas cet horodatage »', async () => {
      const list = await makeConnectedService().list(USER)
      const hubspot = byProvider(list, 'hubspot')
      expect(hubspot.latency?.source).toBe('declared')
      if (hubspot.latency?.source === 'declared') {
        expect(hubspot.latency.value.fr.length).toBeGreaterThan(0)
        expect(hubspot.latency.as_of.length).toBeGreaterThan(0)
      }

      const notion = byProvider(list, 'notion')
      expect(notion.latency?.source).toBe('not_measured')
      if (notion.latency?.source === 'not_measured') expect(notion.latency.reason.fr).toMatch(/capture pas/)
    })

    // #2261.13 (21/09) — HubSpot a AUSSI une latence déclarée en repli
    // (`HUBSPOT_LATENCY_DECLARED`) : ce test prouve qu'une mesure RÉELLE la
    // devance toujours dès qu'elle existe (`resolveLatency`, `measured.source
    // !== 'not_measured'` retourné avant même de regarder `declared`).
    it('HubSpot avec 3 synchros réelles sur 7 jours : une mesure RÉELLE, datée, jamais une valeur de doc', async () => {
      const now = Date.now()
      const minutesAgo = (m: number) => new Date(now - m * 60_000)
      const list = await makeConnectedService({
        latencyObservations: [
          { workspace_id: WS, provider: 'hubspot', source_at: minutesAgo(30), arrived_at: minutesAgo(10) },
          { workspace_id: WS, provider: 'hubspot', source_at: minutesAgo(20), arrived_at: minutesAgo(10) },
          { workspace_id: WS, provider: 'hubspot', source_at: minutesAgo(40), arrived_at: minutesAgo(10) },
        ],
      }).list(USER)
      const hubspot = byProvider(list, 'hubspot')
      expect(hubspot.latency?.source).toBe('measured')
      if (hubspot.latency?.source !== 'measured') throw new Error('unreachable')
      expect(hubspot.latency.sample_count).toBe(3)
      expect(hubspot.latency.window_days).toBe(7)
      expect(hubspot.latency.value.fr.length).toBeGreaterThan(0)

      // Les six autres ne sont PAS affectés par les observations HubSpot —
      // une mesure par outil, jamais mélangée entre fournisseurs.
      const notion = byProvider(list, 'notion')
      expect(notion.latency?.source).toBe('not_measured')
    })

    it('un outil hors du périmètre synchro (recherche/enrichissement) garde `null` — le concept ne s’applique pas', async () => {
      // Apollo est signalé connecté par l'IA, mais ce n'est pas un outil de
      // synchronisation : aucune notion de « délai depuis un changement ».
      const withApollo = await makeService({ iaProviders: { apollo: true } }).list(USER)
      expect(byProvider(withApollo, 'apollo').status).toBe('connected')
      expect(byProvider(withApollo, 'apollo').latency).toBeNull()
    })
  })

  it('degrades IA-hosted sources to coming_soon when the IA status call fails (never invents connected)', async () => {
    const failingIa = {
      integrationStatus: jest.fn(async () => {
        throw new Error('IA down')
      }),
    } as unknown as IaClient
    const svc = new ToolRegistryService(
      repo([] as IntegrationEntity[]),
      repo([] as CrmConnectionEntity[]),
      repo([] as OAuthConsentEntity[]),
      repo([] as GoogleConnectionEntity[]),
      repo([] as NotionConnectionEntity[]),
      repo([] as MicrosoftConnectionEntity[]),
      repo([] as WorkspaceMemberEntity[]),
      repo([] as AtsConnectionEntity[]),
      repo([] as TelephonyConnectionEntity[]),
      repo([] as AdminDocsConnectionEntity[]),
      repo([] as ConnectorCapabilityProbeEntity[]),
      repo([] as ToolLatencyObservationEntity[]),
      workspaceOk,
      configStub({}),
      failingIa,
    )
    expect(byProvider(await svc.list(USER), 'apollo').status).toBe('coming_soon')
  })

  it('reports Stripe connected iff STRIPE_SECRET_KEY is present on this service', async () => {
    expect(byProvider(await makeService().list(USER), 'stripe').status).toBe('coming_soon')
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_x'
    expect(byProvider(await makeService().list(USER), 'stripe').status).toBe('connected')
  })

  describe('chatToolsSummary (chat advisor context)', () => {
    // #1912.11 — décision Louis 13/09/2026, batch 11 : l'outil que l'espace a
    // BRANCHÉ se nomme à côté de sa capacité ; NOTRE fournisseur jamais.
    it('digests the live CAPABILITIES with their credit cost — naming the tool the workspace connected, never ours', async () => {
      process.env['DROPCONTACT_API_KEY'] = 'dc-key'
      const svc = makeService({
        integrations: [{ provider: 'slack', user_id: USER, created_at: new Date('2026-07-01') }],
      })
      const summary = await svc.chatToolsSummary(USER)
      expect(summary).not.toBeNull()
      const lines = (summary as string).split('\n')
      // Two live capabilities (contact lookup + team channels) → exactly 2 lines.
      expect(lines).toHaveLength(2)
      expect(summary).toContain('la recherche de coordonnées')
      expect(summary).toContain('retrouver des coordonnées')
      expect(summary).toContain('1 crédit par enrichissement réussi')
      // Slack was connected BY THE WORKSPACE (an `integrations` row): it is named.
      expect(summary).toContain("tes canaux d'équipe — Slack")
      // Dropcontact is live only because a SERVER key is set: it is ours, and
      // never reaches the advisor context…
      expect(summary).not.toContain('Dropcontact')
      // …nor, a fortiori, the client tools that aren't connected at all.
      expect(summary).not.toContain('HubSpot')
      expect(summary).not.toContain('Gmail')
    })

    it('returns null when nothing is connected (block not rendered IA-side)', async () => {
      await expect(makeService().chatToolsSummary(USER)).resolves.toBeNull()
    })
  })

  it('never claims connected without a backing row, and leaves last_sync null when unknown', async () => {
    const list = await makeService().list(USER) // nothing configured, nothing connected
    for (const tool of list) {
      expect(tool.status).not.toBe('connected')
      expect(tool.last_sync).toBeNull()
      expect(tool.scopes).toEqual([])
    }
  })

  it('lit la table CRM même sans clé serveur — Odoo n’en demande aucune', async () => {
    /*
     * ⚠️ CE TEST DISAIT L'INVERSE JUSQU'AU 01/09/2026, et il avait raison
     * jusque-là : les quatre premiers CRM sont tous fermés derrière une clé
     * serveur, donc aucune configurée signifiait « rien à lire ».
     *
     * Odoo casse cette équivalence. Il se branche par ESPACE — adresse, base,
     * identifiant, clé d'API du client — et n'a donc aucune configuration
     * côté plateforme : il est disponible partout, tout le temps. La seule
     * façon de savoir si CET espace l'a branché est de lire la table.
     *
     * Ce qui reste vrai, et que ce test garde : la lecture est UNE requête
     * bornée à l'espace, pas un balayage. Ce qui a changé, c'est qu'elle n'est
     * plus évitable — et la remettre en cause reviendrait à afficher « bientôt
     * disponible » sur un connecteur que n'importe quel client peut brancher.
     */
    // L'espace, lui, est TOUJOURS résolu depuis le 14/08 : les silos où le
    // client dépose ses propres identifiants (ATS, téléphonie, administratif) ne
    // dépendent d'aucune clé serveur, et sans `workspaceId` ils ressortiraient
    // « disponibles » chez un espace qui les a réellement branchés.
    const crmRepo = repo<CrmConnectionEntity>([] as CrmConnectionEntity[])
    const svc = new ToolRegistryService(
      repo([] as IntegrationEntity[]),
      crmRepo,
      repo([] as OAuthConsentEntity[]),
      repo([] as GoogleConnectionEntity[]),
      repo([] as NotionConnectionEntity[]),
      repo([] as MicrosoftConnectionEntity[]),
      repo([] as WorkspaceMemberEntity[]),
      repo([] as AtsConnectionEntity[]),
      repo([] as TelephonyConnectionEntity[]),
      repo([] as AdminDocsConnectionEntity[]),
      repo([] as ConnectorCapabilityProbeEntity[]),
      repo([] as ToolLatencyObservationEntity[]),
      workspaceOk,
      configStub({}),
      iaStub(),
    )

    await expect(svc.list(USER)).resolves.toHaveLength(TOOL_CATALOG.length)
    // UNE lecture, bornée à l'espace de l'appelant — jamais un balayage.
    expect(crmRepo.find as jest.Mock).toHaveBeenCalledTimes(1)
    expect((crmRepo.find as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { workspace_id: expect.any(String) },
    })
  })

  it('rend Odoo BRANCHABLE sans clé serveur, jamais « bientôt disponible »', async () => {
    // Le défaut que ce test empêche : un connecteur livré, atteignable par
    // n'importe quel client, mais affiché « bientôt disponible » pour toujours
    // parce qu'on l'aurait conditionné à une variable d'environnement qui
    // n'existe pas.
    const list = await makeService().list(USER)
    const odoo = list.find(tool => tool.provider === 'odoo')
    // (Jest n'accepte pas de message sur `expect` — le nom du test le porte.)
    expect(odoo).toBeDefined()
    expect(odoo?.status).toBe('available')
  })

  describe('silos « identifiants par espace »', () => {
    it('rend un ATS, une téléphonie et un outil administratif branchables sans clé serveur', async () => {
      const list = await makeService().list(USER)
      for (const provider of ['boondmanager', 'aircall', 'ringover', 'yousign', 'qonto']) {
        // Jamais `coming_soon` : il n'y a rien à activer côté serveur, le client
        // colle ses identifiants. Les masquer les rendrait introuvables.
        expect(byProvider(list, provider).status).toBe('available')
      }
    })

    it('passe à connecté sur la ligne du bon fournisseur, et sur elle seule', async () => {
      const list = await makeService({
        telephony: [{ workspace_id: WS, provider: 'aircall', last_used_at: new Date('2026-08-10T09:00:00Z') }],
      }).list(USER)
      expect(byProvider(list, 'aircall').status).toBe('connected')
      expect(byProvider(list, 'aircall').last_sync).toBe('2026-08-10T09:00:00.000Z')
      expect(byProvider(list, 'ringover').status).toBe('available')
    })

    it('#4427.1 — Lemlist : branchable sans clé serveur, connecté dès que l’espace a déposé sa clé', async () => {
      expect(byProvider(await makeService().list(USER), 'lemlist').status).toBe('available')
      const list = await makeService({
        lemlist: [{ workspace_id: WS, last_used_at: new Date('2026-10-20T09:00:00Z') }],
      }).list(USER)
      expect(byProvider(list, 'lemlist').status).toBe('connected')
      expect(byProvider(list, 'lemlist').last_sync).toBe('2026-10-20T09:00:00.000Z')
    })

    it('compte l’ERP branché par la configuration serveur comme connecté', async () => {
      // Sans ce repli, un espace dont la plateforme porte les identifiants
      // verrait « à brancher » et irait chercher un jeton dont il n'a pas besoin.
      process.env['BOONDMANAGER_USER_TOKEN'] = 'jeton-serveur'
      const list = await makeService().list(USER)
      expect(byProvider(list, 'boondmanager').status).toBe('connected')
      expect(byProvider(list, 'boondmanager').last_sync).toBeNull()
    })

    it('ne lit aucun silo client quand l’espace est inconnu', async () => {
      const noWorkspace = {
        resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: null, role: null })),
        isDemoWorkspace: jest.fn(async () => false),
      } as unknown as WorkspaceContextService
      const list = await makeService({
        workspace: noWorkspace,
        adminDocs: [{ workspace_id: WS, provider: 'yousign' }],
      }).list(USER)
      // La ligne existe pour un AUTRE espace : la rendre « connectée » ici
      // afficherait la connexion d'un client chez un autre.
      expect(byProvider(list, 'yousign').status).toBe('available')
    })
  })

  it('uses IsNull() to fetch only active MCP consents', async () => {
    // Guard: the service must query revoked_at: IsNull(); a revoked row must not
    // flip MCP to connected. We assert the query shape is honored by the repo.
    const consentsRepo = repo<OAuthConsentEntity>([] as OAuthConsentEntity[])
    const svc = new ToolRegistryService(
      repo([] as IntegrationEntity[]),
      repo([] as CrmConnectionEntity[]),
      consentsRepo,
      repo([] as GoogleConnectionEntity[]),
      repo([] as NotionConnectionEntity[]),
      repo([] as MicrosoftConnectionEntity[]),
      repo([] as WorkspaceMemberEntity[]),
      repo([] as AtsConnectionEntity[]),
      repo([] as TelephonyConnectionEntity[]),
      repo([] as AdminDocsConnectionEntity[]),
      repo([] as ConnectorCapabilityProbeEntity[]),
      repo([] as ToolLatencyObservationEntity[]),
      workspaceOk,
      configStub({ mcpPublicUrl: 'https://mcp.bellum-ai.com' }),
      iaStub(),
    )
    await svc.list(USER)
    expect(consentsRepo.find).toHaveBeenCalledWith({ where: { user_id: In([USER]), revoked_at: IsNull() } })
  })

  /* ---------------------------------------------------------------- */
  /*  Surface opérateur (Dashboard Manager)                            */
  /* ---------------------------------------------------------------- */

  describe('catalog()', () => {
    it('rend une fiche complète par outil, sans jamais toucher la base', async () => {
      const report = await makeService().catalog()
      expect(report.tools).toHaveLength(TOOL_CATALOG.length)
      expect(report.total).toBe(TOOL_CATALOG.length)
      for (const tool of report.tools) {
        expect(tool.provider.length).toBeGreaterThan(0)
        expect(tool.costModel.fr.length).toBeGreaterThan(0)
        expect(tool.memoryPolicy.fr.length).toBeGreaterThan(0)
        expect(Array.isArray(tool.reads)).toBe(true)
        expect(Array.isArray(tool.writes)).toBe(true)
        expect(Array.isArray(tool.allowedActions)).toBe(true)
      }
    })

    it('expose les limites de débit — ce que l’écran client n’a pas à montrer', async () => {
      const { tools } = await makeService().catalog()
      expect(tools.some(t => t.rateLimits !== null)).toBe(true)
    })

    it('reflète la configuration réelle du serveur dans `configured`', async () => {
      const before = await makeService().catalog()
      const hubspotBefore = before.tools.find(t => t.provider === 'hubspot')
      expect(hubspotBefore?.configured).toBe(false)

      configureHubspot()
      const after = await makeService().catalog()
      const hubspotAfter = after.tools.find(t => t.provider === 'hubspot')
      expect(hubspotAfter?.configured).toBe(true)
      expect(after.configured).toBeGreaterThan(before.configured)
    })

    it('marque les outils seulement modélisés comme non configurés (LinkedIn)', async () => {
      const { tools } = await makeService().catalog()
      const linkedin = tools.find(t => t.provider === 'linkedin')
      expect(linkedin?.sourceKind).toBe('catalog')
      expect(linkedin?.configured).toBe(false)
    })

    it('déclare les webhooks configurés : rien à provisionner côté serveur', async () => {
      const { tools } = await makeService().catalog()
      expect(tools.find(t => t.provider === 'slack')?.configured).toBe(true)
    })
  })

  describe('registryForWorkspace()', () => {
    const OTHER_USER = '22222222-2222-2222-2222-222222222222'

    it('unit les branchements personnels de TOUS les membres de l’espace', async () => {
      // Le webhook Slack est posé par un membre, Discord par un autre : au niveau
      // de l'espace, les deux canaux sont branchés.
      const svc = makeService({
        members: [
          { workspace_id: WS, user_id: USER },
          { workspace_id: WS, user_id: OTHER_USER },
        ],
        integrations: [
          { user_id: USER, provider: 'slack' },
          { user_id: OTHER_USER, provider: 'discord' },
        ],
      })
      const registry = await svc.registryForWorkspace(WS)
      expect(registry.memberCount).toBe(2)
      expect(byProvider(registry.tools, 'slack').status).toBe('connected')
      expect(byProvider(registry.tools, 'discord').status).toBe('connected')
      expect(byProvider(registry.tools, 'teams').status).toBe('available')
    })

    it('ignore les branchements des membres d’un AUTRE espace', async () => {
      const svc = makeService({
        members: [{ workspace_id: WS, user_id: USER }],
        integrations: [{ user_id: OTHER_USER, provider: 'slack' }],
      })
      const registry = await svc.registryForWorkspace(WS)
      expect(registry.memberCount).toBe(1)
      expect(byProvider(registry.tools, 'slack').status).toBe('available')
    })

    it('compte les outils connectés et ceux qui réclament une action', async () => {
      configureHubspot()
      const svc = makeService({
        members: [{ workspace_id: WS, user_id: USER }],
        integrations: [{ user_id: USER, provider: 'slack' }],
        crm: [
          {
            workspace_id: WS,
            provider: 'hubspot',
            scope: 'crm.objects.contacts.read',
            // Jeton d'accès expiré et AUCUN jeton de rafraîchissement → l'espace
            // doit vraiment reconnecter, personne ne peut renouveler à sa place.
            expires_at: new Date(Date.now() - 60_000),
          },
        ],
      })
      const registry = await svc.registryForWorkspace(WS)
      expect(registry.connected).toBeGreaterThanOrEqual(1)
      expect(registry.actionRequired).toBe(1)
      expect(byProvider(registry.tools, 'hubspot').status).toBe('action_required')
    })

    it('tient un espace sans membre : aucun branchement personnel, aucune requête inutile', async () => {
      const integrationsRepo = repo<IntegrationEntity>([] as IntegrationEntity[])
      const svc = new ToolRegistryService(
        integrationsRepo,
        repo([] as CrmConnectionEntity[]),
        repo([] as OAuthConsentEntity[]),
        repo([] as GoogleConnectionEntity[]),
        repo([] as NotionConnectionEntity[]),
        repo([] as MicrosoftConnectionEntity[]),
        repo([] as WorkspaceMemberEntity[]),
        repo([] as AtsConnectionEntity[]),
        repo([] as TelephonyConnectionEntity[]),
        repo([] as AdminDocsConnectionEntity[]),
        repo([] as ConnectorCapabilityProbeEntity[]),
        repo([] as ToolLatencyObservationEntity[]),
        workspaceOk,
        configStub({}),
        iaStub(),
      )
      const registry = await svc.registryForWorkspace(WS)
      expect(registry.memberCount).toBe(0)
      expect(registry.tools).toHaveLength(TOOL_CATALOG.length)
      // `In([])` produirait un `IN ()` invalide : la requête ne doit pas partir.
      expect(integrationsRepo.find).not.toHaveBeenCalled()
    })

    it('ne résout jamais l’espace « actif » : il est imposé par l’appelant', async () => {
      const svc = makeService({ members: [{ workspace_id: WS, user_id: USER }] })
      await svc.registryForWorkspace(WS)
      expect(workspaceOk.resolveActiveWorkspace as jest.Mock).not.toHaveBeenCalled()
    })
  })
})

/**
 * L'état PAR CAPACITÉ (PDF 7 §1 et §2).
 *
 * Le défaut que ces tests ferment est celui qui a coûté trois pannes le 16/08 :
 * `capability_state` se dérivait du CATALOGUE (« cet outil sait écrire en
 * principe ») et non des portées réellement accordées. Un Google connecté sans
 * `gmail.send` s'affichait donc « opérationnel », et l'échec arrivait après le
 * clic.
 */
describe('ToolRegistryService — ce que le connecteur peut RÉELLEMENT faire', () => {
  beforeEach(() => configureGoogle())

  const NARROW = 'https://www.googleapis.com/auth/gmail.send'
  const googleWith = (scope: string): Seed => ({
    google: [
      {
        provider: 'google' as const,
        workspace_id: WS,
        user_id: USER,
        scope,
        expires_at: new Date(Date.now() + 3_600_000),
        refresh_token_enc: 'v1:x',
      },
    ],
  })

  // #2254 — avant ce correctif, Drive prêtait sa portée à Gmail (un seul jeton
  // partagé, jamais vérifié par outil) : `google-drive` pouvait rendre
  // `connected` sans jamais avoir reçu `drive.readonly`. Depuis, un outil sans
  // AUCUNE de ses propres portées n'est plus `connected` du tout (voir le test
  // #2254 ci-dessus) — donc ce témoin, pour rester possible, doit porter sur un
  // outil dont une PARTIE seulement des portées manque : Gmail a sa portée
  // d'envoi (`gmail.send`, connecté) mais pas sa portée de lecture
  // (`gmail.readonly`), et c'est la recherche qui l'exige.
  it('dit `scope_missing` sur la recherche quand la portée n’a jamais été accordée', async () => {
    const gmail = byProvider(await makeService(googleWith(NARROW)).list(USER), 'gmail')
    const search = gmail.capabilities.find(capability => capability.key === 'search')
    // C'était la pire des trois pannes : la recherche rendait une liste vide,
    // indiscernable de « tu n'as aucun message ».
    expect(search?.state).toBe('scope_missing')
    expect(search?.scope_required).toEqual(['https://www.googleapis.com/auth/gmail.readonly'])
  })

  it('ne dit JAMAIS « opérationnel » sans preuve sur une capacité vérifiable', async () => {
    const readable = googleWith('https://www.googleapis.com/auth/gmail.readonly')
    const gmail = byProvider(await makeService(readable).list(USER), 'gmail')
    const read = gmail.capabilities.find(capability => capability.key === 'read')
    // La portée de lecture EST là. Mais rien ne l'a jamais vérifiée, et le §2
    // est clair : « `sain` n'est jamais déclaré. Il est dérivé des portées
    // accordées ET d'un test réel. » Le 16/08, c'est exactement ce mot-là qui
    // s'affichait au-dessus d'un agenda éteint depuis des semaines.
    expect(read?.state).toBe('untested')
    expect(read?.last_proof_at).toBeNull()
  })

  it('n’exige pas de preuve d’un ENVOI — on ne le vérifie qu’en envoyant', async () => {
    // Le PDF interdit le test destructif. Réclamer une preuve ici afficherait
    // « jamais vérifié » pour toujours au-dessus d'un bouton qui marche, et un
    // badge permanent est un badge qu'on cesse de lire.
    const gmail = byProvider(await makeService(googleWith(NARROW)).list(USER), 'gmail')
    expect(gmail.capabilities.find(capability => capability.key === 'send')?.state).toBe('operational')
  })

  // #2383.1 — la table déclarative (`tool-capabilities.ts`) portait un niveau
  // par action sans qu'aucune réponse d'API ne le lise. Ce test échoue tant
  // que `describeCapabilities` ne recopie pas `capability.level`.
  it('expose le niveau de capacité (L0-L6) de chaque action, pas seulement son état', async () => {
    const gmail = byProvider(await makeService(googleWith(NARROW)).list(USER), 'gmail')
    expect(gmail.capabilities.find(capability => capability.key === 'read')?.level).toBe('l1_consult')
    expect(gmail.capabilities.find(capability => capability.key === 'prepare')?.level).toBe('l2_prepare')
    expect(gmail.capabilities.find(capability => capability.key === 'send')?.level).toBe('l5_send_confirmed')
  })

  it('rend `limited_write` atteignable — il ne l’était pas', async () => {
    // Trois des huit états n'avaient aucun chemin vers la production : l'unique
    // appelant ne passait ni `writesPartial`, ni `degraded`, ni `actionPending`.
    // Gmail avec `gmail.send` seul : l'envoi passe, la préparation non.
    expect(byProvider(await makeService(googleWith(NARROW)).list(USER), 'gmail').capability_state).toBe('limited_write')
  })

  it('bascule en `read_only` quand AUCUNE écriture n’est accordée', async () => {
    const readOnly = googleWith('https://www.googleapis.com/auth/gmail.readonly')
    expect(byProvider(await makeService(readOnly).list(USER), 'gmail').capability_state).toBe('read_only')
  })

  /**
   * `degraded` — l'état que personne ne produisait.
   *
   * Le commentaire du test ci-dessus disait « trois des huit états n'avaient
   * aucun chemin vers la production : ni `writesPartial`, ni `degraded`, ni
   * `actionPending` ». `writesPartial` a été branché ; les deux autres non. Le
   * 29/08 : `degraded` gagne son producteur, `action_pending` sort du contrat.
   *
   * Le signal existait à un champ de là. Quand une sonde ÉCHOUE,
   * `ConnectorProbeService.record()` pose `last_error_at` et EFFACE
   * `last_proof_at` — donc la capacité retombait sur `untested`, « Jamais
   * vérifié », au-dessus d'une chose qu'on venait de vérifier et qui était
   * cassée.
   */
  it('dit `degraded` quand la DERNIÈRE sonde a échoué — pas « jamais vérifié »', async () => {
    const readable = googleWith('https://www.googleapis.com/auth/gmail.readonly')
    const gmail = byProvider(
      await makeService({
        ...readable,
        probes: [
          {
            workspace_id: WS,
            provider: 'gmail',
            capability: 'read',
            last_proof_at: null,
            last_error_code: 'provider_unavailable',
            last_error_at: new Date(),
          },
        ],
      }).list(USER),
      'gmail',
    )
    const read = gmail.capabilities.find(capability => capability.key === 'read')
    expect(read?.state).toBe('degraded')
    expect(read?.last_error_code).toBe('provider_unavailable')
  })

  it('remonte l’échec sur l’OUTIL — la carte ne dit pas « opérationnel » au-dessus d’un « dégradé »', async () => {
    const readable = googleWith('https://www.googleapis.com/auth/gmail.readonly')
    const gmail = byProvider(
      await makeService({
        ...readable,
        probes: [
          {
            workspace_id: WS,
            provider: 'gmail',
            capability: 'read',
            last_proof_at: null,
            last_error_code: 'provider_unavailable',
            last_error_at: new Date(),
          },
        ],
      }).list(USER),
      'gmail',
    )
    expect(gmail.capability_state).toBe('degraded')
  })

  it('sans échec enregistré, RIEN ne bascule en `degraded` — la garde lit vraiment le champ', async () => {
    const readable = googleWith('https://www.googleapis.com/auth/gmail.readonly')
    const gmail = byProvider(await makeService(readable).list(USER), 'gmail')
    expect(gmail.capabilities.every(capability => capability.state !== 'degraded')).toBe(true)
    expect(gmail.capabilities.length).toBeGreaterThan(0)
  })

  it('un outil sans portée à comparer garde ses capacités — un webhook a une URL, pas des droits', async () => {
    const slack = byProvider(
      await makeService({ integrations: [{ user_id: USER, provider: 'slack' as const, config_enc: 'v1:x' }] }).list(
        USER,
      ),
      'slack',
    )
    expect(slack.capabilities.map(capability => capability.key)).toEqual(['webhook'])
  })
})

describe('ToolRegistryService — la salle de démonstration branche messagerie et CRM (#4163 LF, points 6 et 7)', () => {
  const demoWorkspace = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' as const })),
    isDemoWorkspace: jest.fn(async () => true),
  } as unknown as WorkspaceContextService

  it('en démo, une messagerie ET un CRM ressortent branchés et opérationnels — aucune ligne en base, donc aucun appel possible', async () => {
    const list = await makeService({ workspace: demoWorkspace }).list(USER)
    for (const provider of ['gmail', 'hubspot']) {
      const tool = byProvider(list, provider)
      expect(tool.status).toBe('connected')
      expect(tool.capability_state).toBe('operational')
      // Jamais présentée comme une vraie connexion : le nom le dit.
      expect(tool.display_name).toMatch(/démo/i)
    }
  })

  it('hors démo, rien ne change : sans connexion, la messagerie reste non branchée', async () => {
    const list = await makeService().list(USER)
    expect(byProvider(list, 'gmail').status).not.toBe('connected')
    expect(byProvider(list, 'gmail').display_name).not.toMatch(/démo/i)
  })

  it('les autres outils de la démo restent tels que la base les dit', async () => {
    const real = await makeService().list(USER)
    const demo = await makeService({ workspace: demoWorkspace }).list(USER)
    // R24 (15/10) — les CRM que le serveur n'offre pas sont LISTÉS « à brancher » en démo (jamais connectés).
    const others = (list: ConnectedTool[]) =>
      list.filter(
        t =>
          t.provider !== 'gmail' &&
          t.provider !== 'hubspot' &&
          t.provider !== 'boondmanager' &&
          !DEMO_LISTED_CRM_PROVIDERS.includes(t.provider) &&
          !DEMO_RECONNECT_PROVIDERS.includes(t.provider),
      )
    expect(others(demo)).toEqual(others(real))
    // #5048 (craft rule n° 9) — un outil « à reconnecter » en démo, pour que le prospect voie ce second état.
    for (const provider of DEMO_RECONNECT_PROVIDERS) {
      expect(byProvider(demo, provider).status).toBe('action_required')
    }
    // #4689 — BoondManager est branché en démo, comme son panneau (`AtsService.status`) : une seule définition.
    expect(byProvider(demo, 'boondmanager').status).toBe('connected')
    expect(byProvider(real, 'boondmanager').status).not.toBe('connected')
    for (const provider of ['zoho', 'pipedrive', 'attio']) {
      expect(['available', 'connected']).toContain(byProvider(demo, provider).status)
    }
  })

  it('la vue opérateur n’est jamais maquillée', async () => {
    const view = await makeService({
      workspace: demoWorkspace,
      members: [{ workspace_id: WS, user_id: USER }],
    }).registryForWorkspace(WS)
    expect(byProvider(view.tools, 'gmail').status).not.toBe('connected')
  })
})

describe('CRM-SYNC-D.2 — un CRM relu avec succès n’est plus « Jamais vérifié »', () => {
  const ranAt = new Date('2026-10-19T19:50:00.000Z')
  const odoo = { provider: 'odoo' as const, workspace_id: WS, updated_at: ranAt, created_at: ranAt }
  const readOf = async (cursors: Partial<CrmSyncCursorEntity>[]) =>
    byProvider(await makeService({ crm: [odoo], cursors }).list(USER), 'odoo').capabilities.find(
      capability => capability.key === 'read',
    )

  it('une synchro réelle aboutie sert de preuve de lecture (jamais « untested »)', async () => {
    const read = await readOf([
      { workspace_id: WS, provider: 'odoo', entity_type: 'contact', last_run_at: ranAt, last_error: null },
    ])
    expect(read?.last_proof_at).toBe(ranAt.toISOString())
    expect(read?.state).not.toBe('untested')
  })

  it('le test sait dire NON : sans passage, ou avec une erreur de passage, la lecture reste « untested »', async () => {
    expect((await readOf([]))?.state).toBe('untested')
    const failed = await readOf([
      {
        workspace_id: WS,
        provider: 'odoo',
        entity_type: 'contact',
        last_run_at: ranAt,
        last_error: '401 invalid_grant',
      },
    ])
    expect(failed?.state).toBe('untested')
    expect(failed?.last_proof_at).toBeNull()
  })

  it('une preuve réelle (bouton « tester ») prime toujours sur celle déduite de la synchro', async () => {
    const real = new Date('2026-10-19T10:00:00.000Z')
    const tool = byProvider(
      await makeService({
        crm: [odoo],
        cursors: [{ workspace_id: WS, provider: 'odoo', entity_type: 'contact', last_run_at: ranAt, last_error: null }],
        probes: [{ workspace_id: WS, provider: 'odoo', capability: 'read', last_proof_at: real, last_error_at: null }],
      }).list(USER),
      'odoo',
    )
    expect(tool.capabilities.find(capability => capability.key === 'read')?.last_proof_at).toBe(real.toISOString())
  })
})

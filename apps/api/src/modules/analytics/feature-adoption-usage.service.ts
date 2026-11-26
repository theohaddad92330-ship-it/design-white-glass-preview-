import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { PlanFeatureKey } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { PLAN_CATALOG_PORT, type PlanCatalogPort } from './plan-catalog.port'
import { buildFeatureAdoptionReport, type FeatureAdoptionReport, type PlanFeatureRow } from './feature-adoption-usage'

const DEFAULT_WINDOW_DAYS = 90
const MIN_WINDOW_DAYS = 1
const MAX_WINDOW_DAYS = 365

/** Parse + clamp la fenêtre, comme `TeamKpisService.clampWindow` (même repli
 *  sur une saisie illisible plutôt qu'un `NaN` qui romprait la requête SQL). */
function clampWindow(value: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, n))
}

type PlanCountRow = { plan: string; count: number | string }

/** `[{plan,count}]` → `{plan: count}` — les agrégats Postgres arrivent parfois
 *  en chaîne (`bigint`), jamais laissés tels quels. */
function toPlanCountMap(rows: readonly PlanCountRow[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const row of rows) {
    const n = Number(row.count)
    map[row.plan] = Number.isFinite(n) ? n : 0
  }
  return map
}

/** Combien d'espaces (proxy : abonnements par palier), tous paliers confondus,
 *  hors espaces de DÉMO — mêmes espaces que compte `AdminOverview`, jamais une
 *  liste. */
const ELIGIBLE_BY_PLAN_SQL = `-- q:eligible_by_plan
  SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(*)::int AS count
  FROM workspaces w
  LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
  WHERE w.is_demo = false
  GROUP BY COALESCE(s.plan, 'trial')`

/**
 * Une requête d'USAGE par fonction mesurée : combien d'espaces (par palier)
 * montrent le signal dans la fenêtre. Chacune se JOINT à `workspaces` (pour
 * exclure la démo et retrouver le palier de l'owner) puis GROUP BY palier —
 * jamais une ligne détaillée par espace ne quitte la base.
 */
const MEASURED_FEATURE_QUERIES: readonly { feature: PlanFeatureKey; sql: string }[] = [
  {
    feature: 'crm_sync',
    sql: `-- q:active_crm_sync
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM crm_connections t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.last_used_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'public_api',
    sql: `-- q:active_public_api
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM api_keys t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.last_used_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'knowledge_base',
    sql: `-- q:active_knowledge_base
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM rag_documents t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        -- #1954.7 : un document joint a un fil n'est pas la base de connaissance.
        AND t.scope = 'workspace'
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'watchlist',
    sql: `-- q:active_watchlist
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM watchlist_rules t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'chat_ai',
    sql: `-- q:active_chat_ai
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM chat_messages t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false AND t.role = 'user'
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'team_workspace',
    sql: `-- q:active_team_workspace
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM team_comments t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'needs',
    sql: `-- q:active_needs
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM opportunities t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        -- #1685 — \`first_detected_at\`, pas \`created_at\` : la table n'a pas de
        -- \`created_at\`, et sa colonne de création porte ce nom parce qu'elle est
        -- « jamais réécrite par une re-matérialisation » (project.entity.ts:126).
        -- C'est donc bien la date de PREMIÈRE apparition du besoin, celle qu'on veut.
        -- Attrapé par \`sql-column-names.spec.ts\`, qui lit le SQL écrit à la main.
        AND t.first_detected_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'rfp',
    sql: `-- q:active_rfp
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM rfps t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'talent_pool',
    sql: `-- q:active_talent_pool
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM consultants t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'crm_native',
    sql: `-- q:active_crm_native
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM tasks t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'ats_native',
    sql: `-- q:active_ats_native
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM submissions t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.created_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    feature: 'manager_cockpit',
    sql: `-- q:active_manager_cockpit
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT t.workspace_id)::int AS count
      FROM member_objectives t
      JOIN workspaces w ON w.id = t.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND t.updated_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
  {
    // Le lien MCP est PERSONNEL (`oauth_consents.user_id`, aucun
    // `workspace_id`) : on l'attribue à un espace dès qu'UN de ses membres
    // (`workspace_members`, owner compris) a un jeton actif et récemment
    // rafraîchi — même approximation, documentée, que le reste du module pour
    // un signal qui n'existe qu'au niveau personnel (voir
    // `onboarding-funnel.service.ts`, tête de fichier).
    feature: 'mcp_assistant',
    sql: `-- q:active_mcp_assistant
      SELECT COALESCE(s.plan, 'trial') AS plan, COUNT(DISTINCT wm.workspace_id)::int AS count
      FROM workspace_members wm
      JOIN oauth_consents oc ON oc.user_id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      LEFT JOIN subscriptions s ON s.user_id = w.owner_user_id
      WHERE w.is_demo = false
        AND oc.revoked_at IS NULL
        AND oc.updated_at >= now() - make_interval(days => $1)
      GROUP BY COALESCE(s.plan, 'trial')`,
  },
]

/**
 * #1685 — LA LECTURE qui manquait : l'usage réel de chaque fonction gatée,
 * agrégé PAR FONCTION à travers tous les espaces (jamais un espace à la fois).
 *
 * Un seul repository injecté (`WorkspaceEntity`, déjà déclaré dans
 * `AnalyticsModule`) : toutes les requêtes tournent en SQL brut via
 * `manager.query`, qui peut lire n'importe quelle table — même pattern que
 * `TeamKpisService`. Aucune entité supplémentaire à déclarer dans le module
 * (`crm_connections`, `tasks`, `opportunities`… sont lus, jamais possédés par
 * ce service) : GA-07 exclut les entités de son décompte, et ce dépôt
 * documente déjà ce choix pour `workspace_members` (`onboarding-funnel.
 * service.ts`) — aucune des tables lues ici n'a besoin d'un repository dédié.
 */
@Injectable()
export class FeatureAdoptionUsageService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    // #1685 — par le PORT, jamais par la classe : GA-07 est un cliquet AU PLAFOND.
    @Inject(PLAN_CATALOG_PORT)
    private readonly planCatalog: PlanCatalogPort,
  ) {}

  private query(sql: string, params: unknown[] = []): Promise<PlanCountRow[]> {
    return this.workspaces.manager.query(sql, params) as Promise<PlanCountRow[]>
  }

  async report(windowDaysInput: number = DEFAULT_WINDOW_DAYS): Promise<FeatureAdoptionReport> {
    const windowDays = clampWindow(windowDaysInput)

    const [plans, eligibleRows, ...activeRowsPerFeature] = await Promise.all([
      this.planCatalog.all(),
      this.query(ELIGIBLE_BY_PLAN_SQL),
      ...MEASURED_FEATURE_QUERIES.map(({ sql }) => this.query(sql, [windowDays])),
    ])

    const eligibleByPlan = toPlanCountMap(eligibleRows)
    const activeByPlanPerFeature: Partial<Record<PlanFeatureKey, Record<string, number>>> = {}
    MEASURED_FEATURE_QUERIES.forEach(({ feature }, index) => {
      activeByPlanPerFeature[feature] = toPlanCountMap(activeRowsPerFeature[index] ?? [])
    })

    const planRows: PlanFeatureRow[] = plans.map(plan => ({ key: plan.key, features: plan.features }))
    const signals = buildFeatureAdoptionReport(planRows, eligibleByPlan, activeByPlanPerFeature, windowDays)

    return { windowDays, measuredAt: new Date().toISOString(), signals }
  }
}

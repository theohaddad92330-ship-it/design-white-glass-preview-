import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThanOrEqual, Repository } from 'typeorm'
import {
  checkBudgetGate,
  checkToolDailyCap,
  parseToolDailyCaps,
  toolDailyCapStatus,
  type BudgetGateVerdict,
  type ToolDailyCapStatus,
  type WorkspaceBudgetLevers,
} from '@bellum/contracts'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { WorkspaceBudgetEntity } from '../../database/entities/workspace-budget.entity'

/** Les cinq leviers quand l'espace n'a JAMAIS rien réglé — un no-op complet,
 *  même discipline que `COST_ALERT_DAILY_USD` absent (`cost-alert.service.ts`).
 *  `alertOnOverage`/`blockAtCap` n'ont aucun effet tant que les trois plafonds
 *  restent `null` : `checkBudgetGate` ne les lit qu'après avoir trouvé un
 *  plafond RÉGLÉ et dépassé. */
const NO_LEVERS_CONFIGURED: WorkspaceBudgetLevers = {
  monthlyBudgetUsd: null,
  perMemberCapUsd: null,
  perActionCapUsd: null,
  alertOnOverage: true,
  blockAtCap: false,
}

/** Le premier jour du mois civil de `now`, en UTC — la période du budget
 *  mensuel. Un réglage vit à un seul endroit (GA-26) : c'est la SEULE
 *  dérivation de « la période en cours » de ce service. */
function startOfBudgetMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Minuit UTC du jour de `now` — la période du quota PAR OUTIL (#2440.45). */
function startOfQuotaDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** #2440.45 — le quota quotidien par outil, réglé par l'EXPLOITANT. Lu à chaque
 *  appel (un réglage changé ne demande pas de redémarrage) ; absent = table
 *  vide = no-op strict (lot COUT-IA 12/10). */
function readToolDailyCaps() {
  return parseToolDailyCaps(process.env['AI_TOOL_DAILY_CAP_USD'])
}

/**
 * LA GOUVERNANCE DE COÛT PAR ESPACE — épopée #2975 (#2440.83-89).
 *
 * Deux responsabilités, l'une au-dessus de l'autre :
 *  - `getLevers`/`setLevers` — le CRUD admin des cinq leviers, une ligne par
 *    espace (`workspace_budgets`) ;
 *  - `checkGate` — lit le mois civil en cours dans `provider_costs`, SCOPÉ à
 *    UN espace (GA-43 : jamais agrégé entre espaces, ce sont des concurrents),
 *    et rend le verdict de la porte PURE `checkBudgetGate` (`@bellum/contracts`).
 *
 * Une ligne non tarifée (`cost_usd IS NULL`) est EXCLUE de la somme, jamais
 * comptée pour zéro — même règle que `summariseCosts` (`cost-alert.ts`) : un
 * fournisseur non tarifé n'est pas un fournisseur gratuit.
 */
@Injectable()
export class WorkspaceBudgetService {
  private readonly logger = new Logger(WorkspaceBudgetService.name)

  constructor(
    @InjectRepository(ProviderCostEntity) private readonly costs: Repository<ProviderCostEntity>,
    @InjectRepository(WorkspaceBudgetEntity) private readonly budgets: Repository<WorkspaceBudgetEntity>,
  ) {}

  async getLevers(workspaceId: string): Promise<WorkspaceBudgetLevers> {
    const row = await this.budgets.findOne({ where: { workspace_id: workspaceId } })
    if (!row) return NO_LEVERS_CONFIGURED
    return {
      monthlyBudgetUsd: row.monthly_budget_usd == null ? null : Number(row.monthly_budget_usd),
      perMemberCapUsd: row.per_member_cap_usd == null ? null : Number(row.per_member_cap_usd),
      perActionCapUsd: row.per_action_cap_usd == null ? null : Number(row.per_action_cap_usd),
      alertOnOverage: row.alert_on_overage,
      blockAtCap: row.block_at_cap,
    }
  }

  async setLevers(workspaceId: string, levers: WorkspaceBudgetLevers): Promise<void> {
    await this.budgets.upsert(
      {
        workspace_id: workspaceId,
        // `numeric` revient en `string` via le driver pg (comme `cost_usd` sur
        // `ProviderCostEntity`) : l'écriture doit lui parler le même langage.
        monthly_budget_usd: levers.monthlyBudgetUsd == null ? null : String(levers.monthlyBudgetUsd),
        per_member_cap_usd: levers.perMemberCapUsd == null ? null : String(levers.perMemberCapUsd),
        per_action_cap_usd: levers.perActionCapUsd == null ? null : String(levers.perActionCapUsd),
        alert_on_overage: levers.alertOnOverage,
        block_at_cap: levers.blockAtCap,
      },
      ['workspace_id'],
    )
  }

  /**
   * Le verdict — appelé AVANT une action coûteuse, avec son coût ESTIMÉ.
   * `actorUserId` porte le plafond membre, `actionKey` (`feature` de
   * `provider_costs`) le plafond par action ; les deux restent scopés au MÊME
   * espace que le budget mensuel.
   */
  async checkGate(
    workspaceId: string,
    actorUserId: string,
    actionKey: string,
    estimatedCostUsd: number,
    now: Date = new Date(),
  ): Promise<BudgetGateVerdict> {
    const levers = await this.getLevers(workspaceId)
    const toolCaps = readToolDailyCaps()
    // Rien n'est réglé : ne pas lire `provider_costs` du tout — un no-op
    // complet, comme `CostAlertService` sans `COST_ALERT_DAILY_USD`.
    if (
      levers.monthlyBudgetUsd == null &&
      levers.perMemberCapUsd == null &&
      levers.perActionCapUsd == null &&
      toolCaps[actionKey] === undefined
    ) {
      return { allowed: true, overCap: null }
    }

    // Le début du mois précède toujours minuit du jour : UNE lecture sert
    // les deux périodes (mois pour le budget, jour pour l'outil).
    const since = startOfBudgetMonth(now)
    const dayStart = startOfQuotaDay(now)
    const rows = await this.costs.find({
      where: { workspace_id: workspaceId, created_at: MoreThanOrEqual(since) },
      select: ['user_id', 'feature', 'cost_usd', 'created_at'],
    })

    let workspaceUsd = 0
    let memberUsd = 0
    let actionUsd = 0
    let toolTodayUsd = 0
    for (const row of rows) {
      if (row.cost_usd == null) continue
      const usd = Number(row.cost_usd)
      workspaceUsd += usd
      if (row.user_id === actorUserId) memberUsd += usd
      if (row.feature === actionKey) {
        actionUsd += usd
        if (row.created_at >= dayStart) toolTodayUsd += usd
      }
    }

    const verdict = checkBudgetGate(levers, { workspaceUsd, memberUsd, actionUsd }, estimatedCostUsd)
    // #2440.45 / #2440.48 — le budget de l'espace, plus englobant, est nommé
    // d'abord ; sinon le quota de l'OUTIL, qui nomme sa propre limite.
    if (!verdict.allowed) return verdict
    const toolVerdict = checkToolDailyCap(toolCaps, actionKey, toolTodayUsd, estimatedCostUsd)
    // #2440.86 — l'ALERTE de dépassement (le levier `alertOnOverage`), quand
    // l'espace est réglé pour prévenir sans bloquer. Même discipline que
    // `CostAlertService` : ni e-mail ni notification utilisateur, un
    // `logger.warn` — donc Sentry, donc un écran que quelqu'un regarde. Ce
    // n'est PAS le refus (`allowed: false`) : celui-là porte déjà sa raison
    // jusqu'à l'appelant, il n'a besoin d'aucune alerte de plus.
    if (verdict.allowed && verdict.overCap && verdict.alert) {
      this.logger.warn(`Workspace budget overage — ${verdict.overCap} dépassé (alerte seule, action non bloquée)`, {
        workspaceId,
        actorUserId,
        actionKey,
        tags: { 'workspace_budget.overage': verdict.overCap },
      })
    }
    return toolVerdict.allowed ? verdict : toolVerdict
  }

  /**
   * #2440.45 — la MESURE back-office du quota par outil : pour chaque outil
   * RÉGLÉ dans `AI_TOOL_DAILY_CAP_USD`, ce qu'UN espace a dépensé aujourd'hui
   * (UTC). Aucune ligne quand rien n'est réglé, et rien n'est lu. Jamais
   * agrégée entre espaces (GA-43) ; une ligne non tarifée est comptée à part.
   */
  async getToolQuotas(workspaceId: string, now: Date = new Date()): Promise<ToolDailyCapStatus[]> {
    const caps = readToolDailyCaps()
    if (Object.keys(caps).length === 0) return []
    const rows = await this.costs.find({
      where: { workspace_id: workspaceId, created_at: MoreThanOrEqual(startOfQuotaDay(now)) },
      select: ['feature', 'cost_usd'],
    })
    return toolDailyCapStatus(
      caps,
      rows.map(row => ({ feature: row.feature, costUsd: row.cost_usd == null ? null : Number(row.cost_usd) })),
    )
  }

  /**
   * LE LEDGER, en lecture — une ligne par appel modèle déjà compté (#2975,
   * « ledger minimal (table + écriture + lecture admin) »).
   *
   * ⚠️ Ceci n'est PAS `checkGate`, qui SOMME : `checkGate` répond « combien ? »,
   * cette méthode répond « lequel, sur quoi, et quand ? » — la question qui
   * suit toujours la première quand un admin ouvre la fiche d'un espace.
   * Aucune agrégation, aucune moyenne : chaque ligne de `provider_costs` telle
   * qu'écrite, du mois civil en cours, scopée à UN SEUL espace (GA-43 — jamais
   * agrégée entre espaces, ce sont des concurrents).
   *
   * `costUsd` reste `null` sur une ligne non tarifée — jamais un coût inventé
   * (GA-18/GA-19) : c'est une ligne MESURÉE en `units`, pas un coût nul.
   */
  async listLedger(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<
    Array<{
      id: string
      feature: string
      provider: string
      operation: string
      calls: number
      units: number
      costUsd: number | null
      /** #2440.46 — `provider_limit` = limite fournisseur (429 / surcharge), NULL = ligne sans statut déclaré. */
      status: string | null
      createdAt: string
    }>
  > {
    const since = startOfBudgetMonth(now)
    const rows = await this.costs.find({
      where: { workspace_id: workspaceId, created_at: MoreThanOrEqual(since) },
      order: { created_at: 'DESC' },
      take: 200,
    })
    return rows.map(row => ({
      id: row.id,
      feature: row.feature,
      provider: row.provider,
      operation: row.operation,
      calls: row.calls,
      units: row.units,
      costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
      status: row.status ?? null,
      createdAt: row.created_at.toISOString(),
    }))
  }
}

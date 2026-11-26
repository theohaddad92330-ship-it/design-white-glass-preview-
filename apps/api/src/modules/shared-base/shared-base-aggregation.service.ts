import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DataSource } from 'typeorm'
import {
  MARKET_PATTERN_SIGNAL_TYPE,
  MARKET_PATTERN_WINDOW_DAYS,
  OUTCOME_RECOMMENDATION_DIMENSIONS,
  SHARED_SIGNAL_DEAL_WINDOW_DAYS,
  type OutcomeRecommendationDimension,
} from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import type {
  ActionOutcomeSourceRow,
  CaseOutcomeSourceRow,
  MarketPatternSourceRow,
  MessageLearningSourceRow,
  SignalDealSourceRow,
} from './shared-base-cells'
import {
  rewriteActionOutcomeCells,
  rewriteCaseOutcomeCells,
  rewriteMarketPatternCells,
  rewriteMessageLearningCells,
  rewriteSignalDealCells,
} from './shared-base-writes'

/**
 * P05 (#3246, lot 09/10) — LE SEUL ÉCRIVAIN DE LA BASE ANONYME COMMUNE.
 *
 * Chaque nuit, il relit les comptages PAR ESPACE (jamais une ligne brute), les
 * mutualise par les fonctions pures de `shared-base-cells.ts` — trois espaces
 * au moins par cellule, aucun identifiant d'espace en sortie — et RÉÉCRIT les
 * tables `shared_*` du périmètre réel dans une transaction : idempotent, un
 * second passage le même jour produit les mêmes lignes.
 *
 * Les espaces de démonstration n'y contribuent jamais (`is_demo = false`) : la
 * salle a ses propres lignes (`scope = 'demo'`), semées par `DemoSeedService`.
 * Doctrine : `c92_base_anonyme_commune` ; garde : GA-43.
 */

/**
 * La valeur de chaque dimension — les MÊMES colonnes que la mesure « chez
 * nous » (`ChannelPerformanceReaderService.outcomeRecommendationFor`, #3211.11),
 * recopiées plutôt qu'importées : un module ne dépend pas d'un service voisin
 * (règle 7). Toute divergence ferait comparer deux choses différentes.
 */
const DIMENSION_VALUE_SQL: Record<OutcomeRecommendationDimension, string> = {
  cadence: 'i.cadence_step',
  route: "a.raw_analysis->'recommendedRoute'->>'route'",
  priority: 'a.sprint',
}

type GroupedRow = {
  workspace_id: string
  value: string | null
  naf_code: string | null
  employees: string | null
  outcome: string | null
  count: string
}

type SharedBaseReport = {
  actionOutcomeCells: number
  caseOutcomeCells: number
  signalDealCells: number
  messageLearningCells: number
  /** #4286.15.c — les tendances de marché entre espaces. */
  marketPatternCells: number
}

@Injectable()
export class SharedBaseAggregationService {
  private readonly logger = new Logger(SharedBaseAggregationService.name)

  constructor(private readonly dataSource: DataSource) {}

  /**
   * 02:41 Europe/Paris — creux nocturne, à l'écart des balayages de 03:13 et 04:17.
   *
   * **SANS VERROU :** le recalcul est idempotent par construction — il relit des
   * comptages et RÉÉCRIT le périmètre réel (`DELETE` puis `INSERT … ON CONFLICT
   * DO UPDATE`) dans UNE transaction. Deux réplicas qui passent au même tick
   * produisent les mêmes cellules ; la seconde transaction attend la première
   * sur les mêmes clés puis réécrit à l'identique. Le pire cas est un calcul
   * fait deux fois par nuit, jamais une ligne en double ni une base à moitié
   * écrite — et le module reste autonome (règle 7, GA-07).
   */
  @Cron('41 2 * * *', { name: 'shared-base-aggregation', timeZone: 'Europe/Paris' })
  @Correlated('cron:shared_base.aggregate')
  async runNightly(): Promise<void> {
    try {
      const report = await this.aggregate()
      this.logger.log(
        `Base anonyme commune recalculée — ${report.actionOutcomeCells} cellule(s) d'issues, ${report.caseOutcomeCells} de cas, ${report.signalDealCells} de signaux, ${report.messageLearningCells} d'apprentissage des messages, ${report.marketPatternCells} de tendances de marché`,
        { tags: { 'shared_base.op': 'aggregate' } },
      )
    } catch (error) {
      // La base de la veille reste en place : la transaction n'a rien écrit.
      this.logger.error('Base anonyme commune — recalcul nocturne en échec, base de la veille conservée', {
        error,
        tags: { 'shared_base.op': 'aggregate' },
      })
    }
  }

  async aggregate(): Promise<SharedBaseReport> {
    const actionRows: Array<{ dimension: OutcomeRecommendationDimension; rows: ActionOutcomeSourceRow[] }> = []
    for (const dimension of OUTCOME_RECOMMENDATION_DIMENSIONS) {
      actionRows.push({ dimension, rows: await this.actionOutcomeRows(dimension) })
    }
    const caseRows = await this.caseOutcomeRows()
    const signalRows = await this.signalDealRows()
    const learningRows = await this.messageLearningRows()
    const marketRows = await this.marketPatternRows()
    let actionOutcomeCells = 0
    let caseOutcomeCells = 0
    let signalDealCells = 0
    let messageLearningCells = 0
    let marketPatternCells = 0
    await this.dataSource.transaction(async manager => {
      actionOutcomeCells = await rewriteActionOutcomeCells(manager, 'live', actionRows)
      caseOutcomeCells = await rewriteCaseOutcomeCells(manager, 'live', caseRows)
      signalDealCells = await rewriteSignalDealCells(manager, 'live', signalRows)
      messageLearningCells = await rewriteMessageLearningCells(manager, 'live', learningRows)
      marketPatternCells = await rewriteMarketPatternCells(manager, 'live', marketRows)
    })
    return { actionOutcomeCells, caseOutcomeCells, signalDealCells, messageLearningCells, marketPatternCells }
  }

  /**
   * #4286.15.c (Louis 22/10/2026, `c127_market_pattern_tendances_entre_espaces`) — les recrutements
   * repérés par l'analyse (`signal_history`, nature `recrutement`) dont la première détection tombe dans
   * la fenêtre, avec le secteur, l'effectif et le siège de leur compte. L'intitulé et l'adresse sont
   * LUS pour en tirer des jetons (famille de métier, région), jamais écrits ; l'espace ne sert qu'à
   * compter les contributeurs. Ni coût, ni prix, ni TJM, ni note, ni CRM ne sont lus.
   */
  private async marketPatternRows(): Promise<MarketPatternSourceRow[]> {
    const rows = await this.dataSource.query<
      Array<{
        workspace_id: string
        job_title: string | null
        naf_code: string | null
        employees: string | null
        address: string | null
      }>
    >(
      `SELECT s.workspace_id AS workspace_id, s.label AS job_title, a.naf_code AS naf_code,
              a.employees AS employees, COALESCE(a.headquarters, a.address) AS address
       FROM signal_history s
       JOIN accounts a ON a.id = s.account_id AND a.workspace_id = s.workspace_id
       JOIN workspaces w ON w.id = s.workspace_id
       WHERE w.is_demo = false
         AND s.signal_type = $1
         AND s.first_detected_at >= now() - make_interval(days => $2)`,
      [MARKET_PATTERN_SIGNAL_TYPE, MARKET_PATTERN_WINDOW_DAYS],
    )
    return rows.map(row => ({
      workspaceId: row.workspace_id,
      jobTitle: row.job_title,
      nafCode: row.naf_code,
      employees: row.employees,
      address: row.address,
    }))
  }

  /**
   * #2877 (#2385.5, niveau GLOBAL — Louis 11/10/2026 : « sers-toi d'un max de
   * data possible et juste anonymise au besoin ») — les signaux
   * d'apprentissage des messages, comptés PAR ESPACE aux MÊMES sources que la
   * lecture de l'espace (`MessageLearningSignalsService`) : le journal des
   * transitions (`result = 'applied'`), une version `user_edit` avant
   * l'approbation, et les déclarations de relecteur. Aucune colonne de texte
   * n'est lue — le CORPS d'un message ne sort jamais (doctrine intacte).
   */
  private async messageLearningRows(): Promise<MessageLearningSourceRow[]> {
    const transitions = await this.dataSource.query<Array<{ workspace_id: string; signal: string; count: string }>>(
      `SELECT t.workspace_id AS workspace_id,
              CASE
                WHEN t.to_state = 'cancelled' THEN 'rejected'
                WHEN t.to_state = 'approved' AND EXISTS (
                  SELECT 1 FROM outreach_message_versions v
                  WHERE v.message_id = t.subject_id AND v.kind = 'user_edit'
                ) THEN 'approved_after_edit'
                WHEN t.to_state = 'approved' THEN 'approved_without_edit'
                ELSE t.to_state
              END AS signal,
              COUNT(*) AS count
       FROM outreach_transitions t
       JOIN workspaces w ON w.id = t.workspace_id
       WHERE w.is_demo = false
         AND t.subject_kind = 'message'
         AND t.result = 'applied'
         AND t.to_state IN ('approved', 'cancelled', 'sent', 'replied', 'bounced')
       GROUP BY 1, 2`,
    )
    const flags = await this.dataSource.query<Array<{ workspace_id: string; signal: string; count: string }>>(
      `SELECT f.workspace_id AS workspace_id, f.kind AS signal, COUNT(*) AS count
       FROM outreach_message_quality_flags f
       JOIN workspaces w ON w.id = f.workspace_id
       WHERE w.is_demo = false
       GROUP BY 1, 2`,
    )
    return [...transitions, ...flags].map(row => ({
      workspaceId: row.workspace_id,
      signal: row.signal,
      count: Number(row.count),
    }))
  }

  /**
   * P05.c — les signaux d'historique (`signal_history`, première détection)
   * assez anciens pour être jugés, et parmi eux ceux suivis d'une affaire
   * OUVERTE (`opportunities.first_detected_at`) sur le même compte dans la fenêtre.
   * Comptés PAR ESPACE ; ni libellé de signal ni nom de compte ne sont lus.
   */
  private async signalDealRows(): Promise<SignalDealSourceRow[]> {
    const rows = await this.dataSource.query<
      Array<{
        workspace_id: string
        signal_type: string | null
        naf_code: string | null
        signals: string
        followed: string
      }>
    >(
      `SELECT s.workspace_id AS workspace_id, s.signal_type AS signal_type, a.naf_code AS naf_code,
              COUNT(*) AS signals,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM opportunities p
                WHERE p.workspace_id = s.workspace_id
                  AND p.account_id = s.account_id
                  AND p.first_detected_at > s.first_detected_at
                  AND p.first_detected_at <= s.first_detected_at + make_interval(days => $1)
              )) AS followed
       FROM signal_history s
       JOIN accounts a ON a.id = s.account_id AND a.workspace_id = s.workspace_id
       JOIN workspaces w ON w.id = s.workspace_id
       WHERE w.is_demo = false
         AND s.signal_type IS NOT NULL
         AND s.first_detected_at <= now() - make_interval(days => $1)
       GROUP BY 1, 2, 3`,
      [SHARED_SIGNAL_DEAL_WINDOW_DAYS],
    )
    return rows.map(row => ({
      workspaceId: row.workspace_id,
      signalType: row.signal_type,
      nafCode: row.naf_code,
      signals: Number(row.signals),
      followedByDeal: Number(row.followed),
    }))
  }

  /**
   * P05.b — les cas comptés PAR ESPACE, aux MÊMES sources que « chez nous »
   * (`CapitalisationService.similarCases`) : un retour de mission (`rex_entries`,
   * compte direct ou via la mission) est un cas gagné, une opportunité `lost`
   * un cas perdu. Le motif de perte n'est pas lu.
   */
  private async caseOutcomeRows(): Promise<CaseOutcomeSourceRow[]> {
    const rows = await this.dataSource.query<
      Array<{
        workspace_id: string
        naf_code: string | null
        employees: string | null
        group_role: string | null
        outcome: 'won' | 'lost'
        count: string
      }>
    >(
      `SELECT r.workspace_id AS workspace_id, a.naf_code AS naf_code, a.employees AS employees,
              a.group_role AS group_role, 'won' AS outcome, COUNT(*) AS count
       FROM rex_entries r
       LEFT JOIN missions m ON m.id = r.mission_id AND m.workspace_id = r.workspace_id
       JOIN accounts a ON a.id = COALESCE(r.account_id, m.account_id) AND a.workspace_id = r.workspace_id
       JOIN workspaces w ON w.id = r.workspace_id
       WHERE w.is_demo = false
       GROUP BY 1, 2, 3, 4
       UNION ALL
       SELECT p.workspace_id AS workspace_id, a.naf_code AS naf_code, a.employees AS employees,
              a.group_role AS group_role, 'lost' AS outcome, COUNT(*) AS count
       FROM opportunities p
       JOIN accounts a ON a.id = p.account_id AND a.workspace_id = p.workspace_id
       JOIN workspaces w ON w.id = p.workspace_id
       WHERE w.is_demo = false
         AND p.stage = 'lost'
       GROUP BY 1, 2, 3, 4`,
    )
    return rows.map(row => ({
      workspaceId: row.workspace_id,
      nafCode: row.naf_code,
      employees: row.employees,
      groupRole: row.group_role,
      outcome: row.outcome,
      count: Number(row.count),
    }))
  }

  /** P05.a — les issues déclarées, comptées PAR ESPACE (actions faites + grand livre commercial). */
  private async actionOutcomeRows(dimension: OutcomeRecommendationDimension): Promise<ActionOutcomeSourceRow[]> {
    const valueSql = DIMENSION_VALUE_SQL[dimension]
    const items = await this.dataSource.query<GroupedRow[]>(
      `SELECT a.workspace_id AS workspace_id, ${valueSql} AS value, a.naf_code AS naf_code,
              a.employees AS employees, i.outcome AS outcome, COUNT(*) AS count
       FROM action_plan_items i
       JOIN accounts a ON a.id = i.account_id
       JOIN workspaces w ON w.id = a.workspace_id
       WHERE w.is_demo = false
         AND i.execution_status = 'done'
         AND i.outcome IS NOT NULL
         AND ${valueSql} IS NOT NULL
       GROUP BY 1, 2, 3, 4, 5`,
    )
    // Un outcome commercial porte sur un compte, jamais sur une étape de cadence.
    const ledger =
      dimension === 'cadence'
        ? []
        : await this.dataSource.query<GroupedRow[]>(
            `SELECT a.workspace_id AS workspace_id, ${valueSql} AS value, a.naf_code AS naf_code,
                    a.employees AS employees, o.outcome_type AS outcome, COUNT(*) AS count
             FROM commercial_outcomes o
             JOIN accounts a ON a.id = o.account_id AND a.workspace_id = o.workspace_id
             JOIN workspaces w ON w.id = a.workspace_id
             WHERE w.is_demo = false
               AND ${valueSql} IS NOT NULL
             GROUP BY 1, 2, 3, 4, 5`,
          )
    const toRow = (row: GroupedRow, source?: 'commercial'): ActionOutcomeSourceRow => ({
      workspaceId: row.workspace_id,
      value: row.value,
      nafCode: row.naf_code,
      employees: row.employees,
      outcome: row.outcome,
      count: Number(row.count),
      ...(source ? { source } : {}),
    })
    return [...items.map(row => toRow(row)), ...ledger.map(row => toRow(row, 'commercial'))]
  }
}

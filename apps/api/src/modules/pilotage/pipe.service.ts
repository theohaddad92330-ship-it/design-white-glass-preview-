import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  FORECAST_CATEGORIES,
  PIPE_RISK_THRESHOLDS,
  type ForecastCategory,
  type PipeByOwner,
  type PipeCategoryTotal,
  type PipeInspection,
  type PipeWaterfall,
} from '@bellum/contracts'
import { ProjectEntity } from '../../database/entities/project.entity'
import {
  computePipeByOwner,
  computePipeWaterfall,
  computeRiskSignals,
  isOpenPipeStage,
  medianOf,
  type PipeAmountChange,
  type PipeOpportunity,
  type PipeStageTransition,
} from './pipe-calc'

const DAY_MS = 86_400_000
/** Combien de temps en arrière on relit « date repoussée » et « montant baissé » (le seuil d'âge du montant est dans les contrats). */
const CHANGE_LOOKBACK_DAYS = 365

interface OpportunityRow {
  id: string
  account_id: string
  company_name: string
  label: string
  stage: string
  stage_entered_at: Date | string
  amount_cents: string | number | null
  currency: string | null
  expected_close_on: string | null
  forecast_category: ForecastCategory | null
  owner_id: string | null
  owner_name: string | null
  first_detected_at: Date | string
  closed_at: Date | string | null
  outcome: string | null
}

interface FieldChangeRow {
  opportunity_id: string
  field: 'amount_cents' | 'expected_close_on'
  from_value: string | null
  to_value: string | null
  occurred_at: Date | string
}

const asDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))
const toCents = (value: string | null): number | null => (value === null ? null : Number(value))

const startOfMonthUtc = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

/**
 * Le PIPE de Pilotage (L2) — charge la donnée du workspace et délègue le calcul
 * aux fonctions pures de `pipe-calc.ts`. LECTURE SEULE, NON PONDÉRÉE, sur le
 * pipe NATIF (les opportunités Bellum, jamais le CRM tiers).
 *
 * Chaque requête porte `workspace_id = $1` : une opportunité d'un autre espace
 * ne remonte jamais ici, même par son compte.
 */
@Injectable()
export class PipeService {
  constructor(@InjectRepository(ProjectEntity) private readonly repo: Repository<ProjectEntity>) {}

  private async opportunities(workspaceId: string, ownerId?: string): Promise<{ opps: PipeOpportunity[] }> {
    const rows = await this.repo.manager.query<OpportunityRow[]>(
      `
      SELECT o.id, o.account_id, a.company_name, o.label, o.stage, o.stage_entered_at,
             -- Les deux formes du montant : les centimes sont canoniques, les euros saisis les complètent.
             COALESCE(o.amount_cents::text, ROUND(o.estimated_amount * 100)::bigint::text) AS amount_cents,
             o.currency, o.expected_close_on::text AS expected_close_on, o.forecast_category,
             o.owner_id,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email) AS owner_name,
             o.first_detected_at, o.closed_at, o.outcome
        FROM opportunities o
        JOIN accounts a ON a.id = o.account_id
        LEFT JOIN profiles p ON p.user_id = o.owner_id
       WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
         AND a.status <> 'deleted'
         AND o.archived_at IS NULL
      `,
      [workspaceId],
    )
    const opps = (rows ?? []).map(
      (row): PipeOpportunity => ({
        id: row.id,
        accountId: row.account_id,
        accountName: row.company_name,
        label: row.label,
        stage: row.stage,
        stageEnteredAt: asDate(row.stage_entered_at),
        // Hors euro : jamais additionné à des euros — « pas de montant », nommé comme tel.
        amountCents:
          row.amount_cents === null || (row.currency !== null && row.currency !== 'EUR')
            ? null
            : Number(row.amount_cents),
        expectedCloseOn: row.expected_close_on,
        forecastCategory: row.forecast_category,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        firstDetectedAt: asDate(row.first_detected_at),
        closedAt: row.closed_at ? asDate(row.closed_at) : null,
        outcome: row.outcome,
      }),
    )
    // Théo D pilotage.A11 — CHACUN SON PIPE (Louis 22/10/2026) : un commercial ne lit que SES affaires.
    // Filtre en mémoire après la lecture scopée au workspace, jamais un second prédicat SQL à tenir.
    return { opps: ownerId ? opps.filter(opp => opp.ownerId === ownerId) : opps }
  }

  private async transitions(workspaceId: string, since: Date): Promise<PipeStageTransition[]> {
    const rows = await this.repo.manager.query<
      { subject_id: string; from_state: string | null; to_state: string; occurred_at: Date | string }[]
    >(
      `
      SELECT t.subject_id, t.from_state, t.to_state, t.occurred_at
        FROM commercial_transitions t
       WHERE t.workspace_id = $1
         AND t.subject_type = 'opportunity'
         AND t.occurred_at > $2
       ORDER BY t.occurred_at ASC
      `,
      [workspaceId, since],
    )
    return (rows ?? []).map(row => ({
      opportunityId: row.subject_id,
      fromState: row.from_state,
      toState: row.to_state,
      occurredAt: asDate(row.occurred_at),
    }))
  }

  private async fieldChanges(workspaceId: string, since: Date): Promise<FieldChangeRow[]> {
    const rows = await this.repo.manager.query<FieldChangeRow[]>(
      `
      SELECT c.opportunity_id, c.field, c.from_value, c.to_value, c.occurred_at
        FROM opportunity_field_changes c
       WHERE c.workspace_id = $1
         AND c.occurred_at > $2
       ORDER BY c.occurred_at ASC
      `,
      [workspaceId, since],
    )
    return rows ?? []
  }

  private async lastActivity(workspaceId: string): Promise<Map<string, Date>> {
    const rows = await this.repo.manager.query<{ project_id: string; last_at: Date | string }[]>(
      `
      SELECT x.project_id, MAX(x.occurred_at) AS last_at
        FROM activities x
       WHERE x.workspace_id = $1
         AND x.project_id IS NOT NULL
       GROUP BY x.project_id
      `,
      [workspaceId],
    )
    return new Map((rows ?? []).map(row => [row.project_id, asDate(row.last_at)]))
  }

  /** La table d'inspection : les opportunités OUVERTES, leurs signaux, les totaux par catégorie déclarée. */
  async inspection(workspaceId: string, now: Date = new Date(), ownerId?: string): Promise<PipeInspection> {
    const since = new Date(now.getTime() - CHANGE_LOOKBACK_DAYS * DAY_MS)
    const [{ opps }, changes, activity] = await Promise.all([
      this.opportunities(workspaceId, ownerId),
      this.fieldChanges(workspaceId, since),
      this.lastActivity(workspaceId),
    ])
    const open = opps.filter(opp => isOpenPipeStage(opp.stage))
    const daysInStage = (opp: PipeOpportunity): number =>
      Math.max(0, Math.floor((now.getTime() - opp.stageEnteredAt.getTime()) / DAY_MS))

    const byStage = new Map<string, number[]>()
    for (const opp of open) {
      const list = byStage.get(opp.stage)
      if (list) list.push(daysInStage(opp))
      else byStage.set(opp.stage, [daysInStage(opp)])
    }
    const stageMedian = (stage: string): number | null => {
      const days = byStage.get(stage) ?? []
      return days.length >= PIPE_RISK_THRESHOLDS.stageMedianMinSample ? medianOf(days) : null
    }

    const pushes = new Map<string, number>()
    const lowering = new Map<string, { at: Date; fromCents: number; toCents: number }>()
    for (const change of changes) {
      if (
        change.field === 'expected_close_on' &&
        change.from_value &&
        change.to_value &&
        change.to_value > change.from_value
      ) {
        pushes.set(change.opportunity_id, (pushes.get(change.opportunity_id) ?? 0) + 1)
      }
      if (change.field === 'amount_cents') {
        const from = toCents(change.from_value)
        const to = toCents(change.to_value)
        // Un montant EFFACÉ n'est pas un montant baissé : il ne se mesure plus, il ne baisse pas.
        if (from !== null && to !== null && to < from) {
          lowering.set(change.opportunity_id, { at: asDate(change.occurred_at), fromCents: from, toCents: to })
        }
      }
    }

    const rows = open
      .map(opp => ({
        id: opp.id,
        accountId: opp.accountId,
        accountName: opp.accountName,
        label: opp.label,
        amountCents: opp.amountCents,
        stage: opp.stage,
        forecastCategory: opp.forecastCategory,
        expectedCloseOn: opp.expectedCloseOn,
        ownerId: opp.ownerId,
        ownerName: opp.ownerName,
        daysInStage: daysInStage(opp),
        signals: computeRiskSignals(opp, {
          now,
          lastActivityAt: activity.get(opp.id) ?? null,
          closeDatePushes: pushes.get(opp.id) ?? 0,
          lastAmountLowering: lowering.get(opp.id) ?? null,
          stageMedianDays: stageMedian(opp.stage),
          daysInStage: daysInStage(opp),
        }),
      }))
      .sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1))

    const totals: PipeCategoryTotal[] = []
    for (const category of [...FORECAST_CATEGORIES, null] as const) {
      const group = rows.filter(row => row.forecastCategory === category)
      if (group.length === 0) continue
      totals.push({
        category,
        count: group.length,
        amountCents: group.reduce((sum, row) => sum + (row.amountCents ?? 0), 0),
        withoutAmount: group.filter(row => row.amountCents === null).length,
      })
    }
    return { rows, totals, generatedAt: now.toISOString() }
  }

  async waterfall(
    workspaceId: string,
    from?: Date,
    to?: Date,
    now: Date = new Date(),
    ownerId?: string,
  ): Promise<PipeWaterfall> {
    const end = to ?? now
    const start = from ?? startOfMonthUtc(end)
    const [{ opps }, transitions, changes] = await Promise.all([
      this.opportunities(workspaceId, ownerId),
      this.transitions(workspaceId, start),
      this.fieldChanges(workspaceId, start),
    ])
    const amountChanges: PipeAmountChange[] = changes
      .filter(change => change.field === 'amount_cents')
      .map(change => ({
        opportunityId: change.opportunity_id,
        occurredAt: asDate(change.occurred_at),
        fromCents: toCents(change.from_value),
        toCents: toCents(change.to_value),
      }))
    return computePipeWaterfall({ opportunities: opps, transitions, amountChanges, from: start, to: end })
  }

  async byOwner(workspaceId: string, from?: Date, to?: Date, now: Date = new Date()): Promise<PipeByOwner> {
    const end = to ?? now
    const start = from ?? startOfMonthUtc(end)
    const { opps } = await this.opportunities(workspaceId)
    return computePipeByOwner({ opportunities: opps, from: start, to: end })
  }
}

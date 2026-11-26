import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
  INTAKE_STAGES,
  OPEN_PIPELINE_STAGES,
  PROJECT_STAGES,
  WEEK_DELTA_DEFAULT_DAYS,
  WEEK_DELTA_MAX_LINES,
  WEEK_DELTA_MISSION_HORIZON_DAYS,
  monthCoverage,
  projectStageNotInSql,
  stageOrder,
  workingDaysLeftInMonth,
  type MonthObjective,
  type ProjectStage,
  type WeekDelta,
  type WeekDeltaOpportunityBucket,
} from '@bellum/contracts'

const DAY_MS = 86_400_000

/** « 12 000 € » côté SQL : le montant canonique est en centimes, `estimated_amount` est l'ancien champ en euros. */
const AMOUNT_SQL = 'COALESCE(o.amount_cents / 100.0, o.estimated_amount)'

interface MoveRow {
  id: string
  label: string
  account_name: string | null
  amount: string | number | null
  from_state: string | null
  to_state: string
}

/** Dernier stade du « pipe qui avance » : au-delà, c'est une sortie (won/lost/dormant), comptée à part. */
const NEGOTIATION_ORDER = stageOrder('negotiation')

function isStage(value: string | null): value is ProjectStage {
  return value !== null && (PROJECT_STAGES as readonly string[]).includes(value)
}

function bucket(rows: MoveRow[]): WeekDeltaOpportunityBucket {
  const known = rows.filter(r => r.amount !== null && r.amount !== undefined)
  return {
    count: rows.length,
    // Aucun montant saisi sur des lignes qui existent ≠ 0 € : on ne sait pas.
    amount: rows.length === 0 ? 0 : known.length === 0 ? null : known.reduce((s, r) => s + Number(r.amount), 0),
    lines: rows.slice(0, WEEK_DELTA_MAX_LINES).map(r => ({
      id: r.id,
      label: r.label,
      accountName: r.account_name,
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
      from: r.from_state,
      to: r.to_state,
    })),
  }
}

/**
 * Cockpit › ce qui a bougé, et où en est le mois. Lecture seule, tout est
 * borné au workspace de l'appelant (`workspace_id = $1` dans CHAQUE requête).
 * Aucune probabilité, aucune pondération. Une source illisible rend `null`,
 * jamais 0 ; une source lue et vide rend 0.
 */
@Injectable()
export class WeekDeltaService {
  private readonly logger = new Logger(WeekDeltaService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async weekDelta(
    workspaceId: string,
    query: { from?: string; to?: string },
    now: Date = new Date(),
  ): Promise<WeekDelta> {
    const to = query.to ? new Date(query.to) : now
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - WEEK_DELTA_DEFAULT_DAYS * DAY_MS)
    const period = { from: from.toISOString(), to: to.toISOString() }

    const [created, moves, missionsEnding, cashIn] = await Promise.all([
      this.safely('created', () => this.created(workspaceId, period)),
      this.safely('transitions', () => this.transitions(workspaceId, period)),
      this.safely('missionsEnding', () => this.missionsEnding(workspaceId, now)),
      this.safely('cashIn', () => this.cashIn(workspaceId, period)),
    ])

    return {
      period,
      generatedAt: now.toISOString(),
      created,
      advanced: moves?.advanced ?? null,
      regressed: moves?.regressed ?? null,
      lost: moves?.lost ?? null,
      won: moves?.won ?? null,
      missionsEnding,
      cashIn,
    }
  }

  async monthObjective(workspaceId: string, now: Date = new Date()): Promise<MonthObjective> {
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
    const [target, realised, openPipe] = await Promise.all([
      this.safely('objective', async () => {
        const [row] = await this.dataSource.query<{ declared: string; total: string | null }[]>(
          `SELECT COUNT(target_revenue) AS declared, SUM(target_revenue) AS total
             FROM member_objectives WHERE workspace_id = $1 AND period_month = $2::date`,
          [workspaceId, month],
        )
        return Number(row?.declared ?? 0) > 0 && row?.total != null ? Number(row.total) : null
      }),
      this.safely('realised', () =>
        this.sumOf(
          `SELECT COUNT(*) AS n, COUNT(${AMOUNT_SQL}) AS n_amount, SUM(${AMOUNT_SQL}) AS total
             FROM opportunities o
            WHERE o.workspace_id = $1 AND o.stage = 'won'
              AND o.closed_at >= $2::date AND o.closed_at < ($2::date + interval '1 month')`,
          [workspaceId, month],
        ),
      ),
      this.safely('openPipe', () =>
        this.sumOf(
          `SELECT COUNT(*) AS n, COUNT(${AMOUNT_SQL}) AS n_amount, SUM(${AMOUNT_SQL}) AS total
             FROM opportunities o
            WHERE o.workspace_id = $1 AND o.stage = ANY($2::text[])`,
          [workspaceId, [...OPEN_PIPELINE_STAGES]],
        ),
      ),
    ])
    const workingDaysLeft = workingDaysLeftInMonth(now)
    return {
      month,
      generatedAt: now.toISOString(),
      target,
      realised,
      openPipe,
      workingDaysLeft,
      ...monthCoverage({ target, realised, openPipe, workingDaysLeft }),
    }
  }

  /** 0 lignes = 0 mesuré ; des lignes sans aucun montant = null (on ne sait pas). */
  private async sumOf(sql: string, params: unknown[]): Promise<number | null> {
    const [row] = await this.dataSource.query<{ n: string; n_amount: string; total: string | null }[]>(sql, params)
    if (!row || Number(row.n) === 0) return 0
    return Number(row.n_amount) === 0 || row.total === null ? null : Number(row.total)
  }

  private async safely<T>(source: string, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read()
    } catch (error) {
      this.logger.error(`week-delta: source ${source} illisible`, { error, tags: { pilotage: 'week-delta' } })
      return null
    }
  }

  private async created(workspaceId: string, period: { from: string; to: string }) {
    const rows = await this.dataSource.query<MoveRow[]>(
      `SELECT o.id, o.label, a.company_name AS account_name, ${AMOUNT_SQL} AS amount,
              NULL::text AS from_state, o.stage AS to_state
         FROM opportunities o
         LEFT JOIN accounts a ON a.id = o.account_id AND a.workspace_id = o.workspace_id
        WHERE o.workspace_id = $1 AND o.first_detected_at >= $2 AND o.first_detected_at < $3
          AND o.kind <> 'signal' AND ${projectStageNotInSql('o.stage', INTAKE_STAGES)}
        ORDER BY o.first_detected_at DESC`,
      [workspaceId, period.from, period.to],
    )
    return bucket(rows)
  }

  private async transitions(workspaceId: string, period: { from: string; to: string }) {
    const rows = await this.dataSource.query<MoveRow[]>(
      `SELECT o.id, o.label, a.company_name AS account_name, ${AMOUNT_SQL} AS amount,
              t.from_state, t.to_state
         FROM commercial_transitions t
         JOIN opportunities o ON o.id = t.subject_id AND o.workspace_id = t.workspace_id
         LEFT JOIN accounts a ON a.id = o.account_id AND a.workspace_id = o.workspace_id
        WHERE t.workspace_id = $1 AND t.subject_type = 'opportunity'
          AND t.occurred_at >= $2 AND t.occurred_at < $3
        ORDER BY t.occurred_at DESC`,
      [workspaceId, period.from, period.to],
    )
    const advanced: MoveRow[] = []
    const regressed: MoveRow[] = []
    const lost: MoveRow[] = []
    const won: MoveRow[] = []
    for (const row of rows) {
      if (row.to_state === 'won') won.push(row)
      else if (row.to_state === 'lost') lost.push(row)
      else if (isStage(row.from_state) && isStage(row.to_state)) {
        const [fromOrder, toOrder] = [stageOrder(row.from_state), stageOrder(row.to_state)]
        // `dormant` (« plus rien ne bouge ») n'est ni un avancement ni un recul.
        if (fromOrder > NEGOTIATION_ORDER || toOrder > NEGOTIATION_ORDER) continue
        if (toOrder > fromOrder) advanced.push(row)
        else if (toOrder < fromOrder) regressed.push(row)
      }
    }
    return { advanced: bucket(advanced), regressed: bucket(regressed), lost: bucket(lost), won: bucket(won) }
  }

  private async missionsEnding(workspaceId: string, now: Date) {
    const rows = await this.dataSource.query<
      { id: string; consultant_name: string | null; account_name: string | null; ends_on: string }[]
    >(
      `SELECT m.id, m.ends_on::text AS ends_on, a.company_name AS account_name,
              (SELECT string_agg(c.full_name, ', ' ORDER BY c.full_name)
                 FROM mission_assignments ma
                 JOIN consultants c ON c.id = ma.consultant_id
                WHERE ma.mission_id = m.id AND ma.workspace_id = m.workspace_id) AS consultant_name
         FROM missions m
         LEFT JOIN accounts a ON a.id = m.account_id AND a.workspace_id = m.workspace_id
        WHERE m.workspace_id = $1 AND m.status IN ('active', 'onboarding')
          AND m.ends_on >= $2::date AND m.ends_on <= ($2::date + $3::int)
        ORDER BY m.ends_on ASC`,
      [workspaceId, now.toISOString().slice(0, 10), WEEK_DELTA_MISSION_HORIZON_DAYS],
    )
    return {
      count: rows.length,
      horizonDays: WEEK_DELTA_MISSION_HORIZON_DAYS,
      lines: rows.slice(0, WEEK_DELTA_MAX_LINES).map(r => ({
        id: r.id,
        consultantName: r.consultant_name,
        accountName: r.account_name,
        endsOn: r.ends_on,
      })),
    }
  }

  private async cashIn(workspaceId: string, period: { from: string; to: string }) {
    const rows = await this.dataSource.query<
      { account_id: string; account_name: string | null; amount_cents: string | null; n: string }[]
    >(
      `SELECT m.account_id, a.company_name AS account_name,
              SUM(ir.paid_amount_cents) AS amount_cents, COUNT(*) AS n
         FROM invoice_readiness ir
         JOIN missions m ON m.id = ir.mission_id AND m.workspace_id = ir.workspace_id
         LEFT JOIN accounts a ON a.id = m.account_id AND a.workspace_id = m.workspace_id
        WHERE ir.workspace_id = $1 AND ir.paid_at >= $2 AND ir.paid_at < $3
        GROUP BY m.account_id, a.company_name
        ORDER BY SUM(ir.paid_amount_cents) DESC NULLS LAST`,
      [workspaceId, period.from, period.to],
    )
    const lines = rows.map(r => ({
      accountId: r.account_id,
      accountName: r.account_name,
      amountCents: Number(r.amount_cents ?? 0),
      count: Number(r.n),
    }))
    return {
      count: lines.reduce((s, l) => s + l.count, 0),
      amountCents: lines.reduce((s, l) => s + l.amountCents, 0),
      lines: lines.slice(0, WEEK_DELTA_MAX_LINES),
    }
  }
}

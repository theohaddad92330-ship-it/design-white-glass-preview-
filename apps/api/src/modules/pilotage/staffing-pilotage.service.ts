import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { StaffingCapacity, StaffingOverview } from '@bellum/contracts'
import {
  buildBench,
  buildCapacity,
  buildEndings,
  buildTacePeriod,
  type CalcAbsence,
  type CalcAssignment,
  type CalcConsultant,
  type CalcNeed,
} from './staffing-calc'

/** Missions SIGNÉES : celles qui demandent des jours. Un brouillon n'en demande pas. */
const SIGNED_MISSION_STATUSES = [
  'onboarding',
  'ready_to_start',
  'active',
  'at_risk',
  'renewal_pending',
  'ending',
  'renewed',
  'paused',
]
/** Affectations qui ne pèsent plus sur personne. */
const DEAD_ASSIGNMENT_STATUSES = ['completed', 'terminated', 'replaced']
/** Besoins encore OUVERTS : ni gagnés, ni perdus, ni annulés, ni suspendus. */
const CLOSED_NEED_STATUSES = ['won', 'staffed', 'lost', 'cancelled', 'on_hold', 'to_reactivate']
const HORIZON_WEEKS = 12

type ConsultantRow = { id: string; full_name: string; stack: string[] | null; cost_rate_cents: string | number | null }
type AssignmentRow = {
  consultant_id: string
  load_percent: number
  starts_on: string
  ends_on: string | null
}
type AbsenceRow = { consultant_id: string; starts_on: string; ends_on: string }

const iso = (value: string | Date): string =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
const previousMonthOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * Les lectures de l'écran Staffing. Chaque requête est bornée au workspace de
 * l'appelant (`workspace_id = $1`) ; le calcul vit dans `staffing-calc.ts`, pur.
 *
 * Périmètre « consultant » : `kind = 'consultant'`, non archivé, et hors
 * `partenaire` — les gens d'un partenaire ne sont pas NOTRE capacité.
 */
@Injectable()
export class StaffingPilotageService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async capacity(workspaceId: string, now: Date = new Date()): Promise<StaffingCapacity> {
    const today = now.toISOString().slice(0, 10)
    const [consultants, assignments, absences, needs] = await Promise.all([
      this.consultants(workspaceId),
      this.assignments(workspaceId),
      this.absences(workspaceId),
      this.openNeeds(workspaceId),
    ])
    const ids = new Set(consultants.map(c => c.id))
    const capacity = buildCapacity({
      today,
      weeks: HORIZON_WEEKS,
      consultants,
      assignments: assignments.filter(a => ids.has(a.consultantId)),
      absences,
      needs,
    })
    return { ...capacity, generatedAt: now.toISOString() }
  }

  async overview(workspaceId: string, canReadCost: boolean, now: Date = new Date()): Promise<StaffingOverview> {
    const today = now.toISOString().slice(0, 10)
    const month = today.slice(0, 7)
    const [consultants, assignments, absences, endings, threshold, billed, lastEnds] = await Promise.all([
      this.consultants(workspaceId),
      this.assignments(workspaceId),
      this.absences(workspaceId),
      this.endingRows(workspaceId, today),
      this.taceThreshold(workspaceId),
      this.billedDays(workspaceId, previousMonthOf(month)),
      this.lastEnds(workspaceId, today),
    ])
    const ids = new Set(consultants.map(c => c.id))
    const own = assignments.filter(a => ids.has(a.consultantId))
    const periods = [month, previousMonthOf(month)].map(period =>
      buildTacePeriod({
        month: period,
        today,
        consultants,
        assignments: own,
        absences,
        billedDays: billed.get(period) ?? new Map(),
      }),
    )
    return {
      generatedAt: now.toISOString(),
      bench: buildBench({ today, canReadCost, consultants, assignments: own, absences, lastEnds }),
      endings: buildEndings(today, endings),
      tace: { thresholdPercent: threshold, periods },
    }
  }

  async setTaceThreshold(workspaceId: string, thresholdPercent: number | null): Promise<void> {
    await this.dataSource.query(`UPDATE workspaces SET tace_alert_threshold_percent = $2 WHERE id = $1`, [
      workspaceId,
      thresholdPercent,
    ])
  }

  private async taceThreshold(workspaceId: string): Promise<number | null> {
    const rows = await this.dataSource.query<{ tace_alert_threshold_percent: string | number | null }[]>(
      `SELECT tace_alert_threshold_percent FROM workspaces WHERE id = $1`,
      [workspaceId],
    )
    const raw = rows[0]?.tace_alert_threshold_percent
    const value = raw === null || raw === undefined ? null : Number(raw)
    return value !== null && Number.isFinite(value) ? value : null
  }

  private async consultants(workspaceId: string): Promise<CalcConsultant[]> {
    const rows = await this.dataSource.query<ConsultantRow[]>(
      `SELECT id, full_name, stack, cost_rate_cents
         FROM consultants
        WHERE workspace_id = $1
          AND kind = 'consultant'
          AND archived_at IS NULL
          AND engagement_kind <> 'partenaire'`,
      [workspaceId],
    )
    return rows.map(row => ({
      id: row.id,
      fullName: row.full_name,
      skills: row.stack ?? [],
      dailyCostCents:
        row.cost_rate_cents === null || row.cost_rate_cents === undefined ? null : Number(row.cost_rate_cents),
    }))
  }

  private async assignments(workspaceId: string): Promise<CalcAssignment[]> {
    const rows = await this.dataSource.query<AssignmentRow[]>(
      `SELECT ma.consultant_id, ma.load_percent,
              to_char(ma.starts_on, 'YYYY-MM-DD') AS starts_on,
              to_char(COALESCE(ma.ends_on, m.ends_on), 'YYYY-MM-DD') AS ends_on
         FROM mission_assignments ma
         JOIN missions m ON m.id = ma.mission_id
        WHERE m.workspace_id = $1
          AND m.status = ANY($2)
          AND COALESCE(ma.status, 'confirmed') <> ALL($3)`,
      [workspaceId, SIGNED_MISSION_STATUSES, DEAD_ASSIGNMENT_STATUSES],
    )
    return rows.map(row => ({
      consultantId: row.consultant_id,
      loadPercent: row.load_percent,
      startsOn: iso(row.starts_on),
      endsOn: row.ends_on ? iso(row.ends_on) : null,
    }))
  }

  /** Dernière fin d'affectation PASSÉE par consultant, toutes missions confondues (terminées comprises). */
  private async lastEnds(workspaceId: string, today: string): Promise<Map<string, string>> {
    const rows = await this.dataSource.query<{ consultant_id: string; last_end: string }[]>(
      `SELECT ma.consultant_id, to_char(MAX(COALESCE(ma.ends_on, m.ends_on)), 'YYYY-MM-DD') AS last_end
         FROM mission_assignments ma
         JOIN missions m ON m.id = ma.mission_id
        WHERE m.workspace_id = $1
          AND m.status <> ALL($3)
          AND COALESCE(ma.ends_on, m.ends_on) < $2::date
        GROUP BY ma.consultant_id`,
      [workspaceId, today, ['draft', 'cancelled']],
    )
    return new Map(rows.map(row => [row.consultant_id, row.last_end]))
  }

  private async absences(workspaceId: string): Promise<CalcAbsence[]> {
    const rows = await this.dataSource.query<AbsenceRow[]>(
      `SELECT consultant_id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on
         FROM consultant_absences
        WHERE workspace_id = $1`,
      [workspaceId],
    )
    return rows.map(row => ({ consultantId: row.consultant_id, startsOn: row.starts_on, endsOn: row.ends_on }))
  }

  private async openNeeds(workspaceId: string): Promise<CalcNeed[]> {
    const rows = await this.dataSource.query<
      { headcount: number; start_on: string | null; duration_months: number | null }[]
    >(
      `SELECT headcount, to_char(start_on, 'YYYY-MM-DD') AS start_on, duration_months
         FROM project_needs
        WHERE workspace_id = $1
          AND status <> ALL($2)`,
      [workspaceId, CLOSED_NEED_STATUSES],
    )
    return rows.map(row => ({
      headcount: row.headcount,
      startOn: row.start_on,
      durationMonths: row.duration_months,
    }))
  }

  /** Une ligne par mission en cours qui finit, avec son consultant principal (affectation la plus chargée). */
  private async endingRows(workspaceId: string, today: string) {
    const rows = await this.dataSource.query<
      { id: string; status: string; ends_on: string; account_name: string | null; consultant_name: string | null }[]
    >(
      `SELECT m.id, m.status, to_char(m.ends_on, 'YYYY-MM-DD') AS ends_on, acc.company_name AS account_name,
              (SELECT c.full_name
                 FROM mission_assignments ma
                 JOIN consultants c ON c.id = ma.consultant_id AND c.workspace_id = $1
                WHERE ma.mission_id = m.id
                  AND COALESCE(ma.status, 'confirmed') <> ALL($4)
                ORDER BY ma.load_percent DESC, ma.starts_on DESC
                LIMIT 1) AS consultant_name
         FROM missions m
         LEFT JOIN accounts acc ON acc.id = m.account_id
        WHERE m.workspace_id = $1
          AND m.status = ANY($3)
          AND m.ends_on IS NOT NULL
          AND m.ends_on >= $2::date
          AND m.ends_on <= $2::date + 90`,
      [workspaceId, today, SIGNED_MISSION_STATUSES, DEAD_ASSIGNMENT_STATUSES],
    )
    return rows.map(row => ({
      missionId: row.id,
      consultantName: row.consultant_name,
      accountName: row.account_name,
      endsOn: row.ends_on,
      status: row.status,
    }))
  }

  /**
   * Les jours « produits » par consultant et par mois — le MÊME prédicat que
   * `RevenueService` (statut hors `expected / missing / not_required`, GA-26).
   * Un consultant sans relevé est absent de la Map : « non mesuré », pas 0.
   */
  private async billedDays(workspaceId: string, fromMonth: string): Promise<Map<string, Map<string, number>>> {
    const rows = await this.dataSource.query<{ consultant_id: string; period: string; days: string | number }[]>(
      `SELECT ts.consultant_id, to_char(ts.period_month, 'YYYY-MM') AS period, SUM(ts.days) AS days
         FROM mission_timesheets ts
         JOIN missions m ON m.id = ts.mission_id
        WHERE m.workspace_id = $1
          AND ts.consultant_id IS NOT NULL
          AND ts.period_month >= $2::date
          AND ts.status NOT IN ('expected', 'missing', 'not_required')
        GROUP BY ts.consultant_id, to_char(ts.period_month, 'YYYY-MM')`,
      [workspaceId, `${fromMonth}-01`],
    )
    const byPeriod = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const inner = byPeriod.get(row.period) ?? new Map<string, number>()
      inner.set(row.consultant_id, Number(row.days))
      byPeriod.set(row.period, inner)
    }
    return byPeriod
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  assessPoForMonth,
  type InvoiceMonthPreparation,
  type InvoiceReadiness,
  type SaveMonthPreparationInput,
} from '@bellum/contracts'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { InvoiceReadinessService } from './invoice-readiness.service'

/** Les statuts de relevé qui ne comptent PAS comme des jours consommés — le même filtre que `staffing.service.ts`. */
const NOT_CONSUMED = `('expected', 'missing', 'not_required')`

interface TermsRow {
  requires_po: boolean | null
  po_number: string | null
  po_issued_on: string | Date | null
  po_valid_until: string | Date | null
  po_volume_days: string | number | null
}

const asDay = (value: string | Date | null | undefined): string | null => {
  if (!value) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function previousMonthOf(month: string): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * #2567 — le premier JOUR OUVRÉ d'un mois : le premier lundi-vendredi. Les
 * jours fériés ne sont pas modélisés ici (un brouillon préparé un 1er mai
 * n'est jamais envoyé, il attend d'être relu).
 */
export function isFirstWorkingDayOfMonth(date: Date): boolean {
  const day = date.getUTCDay()
  if (day === 0 || day === 6) return false
  const dom = date.getUTCDate()
  if (dom > 3) return false
  for (let earlier = 1; earlier < dom; earlier += 1) {
    const weekday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), earlier)).getUTCDay()
    if (weekday !== 0 && weekday !== 6) return false
  }
  return true
}

/**
 * #2563 / #2566 / #2567 — « Préparer la facture de <mois> » pour une mission
 * longue. Pré-remplit depuis le mois précédent (compte, TJM, bon de commande) ;
 * seuls les JOURS (CRA si présent, sinon saisie nommée) et le N° de bon de
 * commande se modifient.
 *
 * « Préparée » ≠ « créée » ≠ « envoyée » : ce service ne crée RIEN dans l'outil
 * branché et n'envoie rien. La création du brouillon reste
 * `POST /delivery/invoice-connector/send`, qui relit le mois par le même calcul.
 */
@Injectable()
export class InvoiceMonthPreparationService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly store: Repository<InvoiceReadinessEntity>,
    private readonly readiness: InvoiceReadinessService,
  ) {}

  private async itemOf(workspaceId: string, missionId: string, month: string): Promise<InvoiceReadiness | null> {
    const { items } = await this.readiness.list(
      workspaceId,
      { month, missionId, blockedOnly: false },
      { canReadFinance: true },
    )
    return items.find(item => item.missionId === missionId) ?? null
  }

  async preview(workspaceId: string, missionId: string, month: string): Promise<InvoiceMonthPreparation> {
    const periodMonth = `${month}-01`
    const item = await this.itemOf(workspaceId, missionId, month)
    if (!item) throw new NotFoundException('Cette mission n’a rien à facturer sur ce mois.')
    const previousItem = await this.itemOf(workspaceId, missionId, previousMonthOf(month))

    const terms = await this.store.manager.query<TermsRow[]>(
      `SELECT t.requires_po, t.po_number, t.po_issued_on, t.po_valid_until, t.po_volume_days
         FROM mission_commercial_terms t
         JOIN missions m ON m.id = t.mission_id
        WHERE t.mission_id = $1 AND m.workspace_id = $2`,
      [missionId, workspaceId],
    )
    const t = terms[0] ?? null

    // Les jours déjà consommés AVANT ce mois : relevés, plus les jours saisis
    // sans CRA des mois qui n'ont aucun relevé (jamais comptés deux fois).
    const consumedRows = await this.store.manager.query<{ cra: string | null; manual: string | null }[]>(
      `SELECT (SELECT SUM(ts.days) FROM mission_timesheets ts
                WHERE ts.mission_id = $1 AND ts.period_month < $2::date AND ts.status NOT IN ${NOT_CONSUMED}) AS cra,
              (SELECT SUM(p.manual_days) FROM mission_month_preparations p
                WHERE p.mission_id = $1 AND p.period_month < $2::date AND p.manual_days IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM mission_timesheets ts2
                                   WHERE ts2.mission_id = p.mission_id AND ts2.period_month = p.period_month
                                     AND ts2.status NOT IN ${NOT_CONSUMED})) AS manual`,
      [missionId, periodMonth],
    )
    const cra = consumedRows[0]?.cra ?? null
    const manual = consumedRows[0]?.manual ?? null
    const consumedBefore = cra === null && manual === null ? null : Number(cra ?? 0) + Number(manual ?? 0)

    const prep = await this.store.manager.query<{ prepared_at: Date | string }[]>(
      `SELECT prepared_at FROM mission_month_preparations WHERE mission_id = $1 AND period_month = $2::date AND workspace_id = $3`,
      [missionId, periodMonth, workspaceId],
    )
    const auto = await this.store.manager.query<{ mission_id: string }[]>(
      `SELECT mission_id FROM mission_invoice_auto_prepare WHERE mission_id = $1 AND workspace_id = $2`,
      [missionId, workspaceId],
    )

    const missionPo = t?.po_number ?? null
    const poNumber = item.poNumber ?? missionPo
    const validFrom = asDay(t?.po_issued_on)
    const validUntil = asDay(t?.po_valid_until)
    const check = assessPoForMonth({
      requiresPo: Boolean(t?.requires_po),
      poNumber,
      validFrom,
      validUntil,
      volumeDays: t?.po_volume_days === null || t?.po_volume_days === undefined ? null : Number(t.po_volume_days),
      consumedBeforeDays: consumedBefore,
      monthDays: item.days,
      periodMonth,
    })

    const dailyRateCents = item.dailyRateCents ?? null
    const amountCents = item.days !== null && dailyRateCents !== null ? Math.round(item.days * dailyRateCents) : null

    return {
      missionId,
      missionLabel: item.missionLabel,
      accountId: item.accountId,
      accountName: item.accountName,
      legalEntityName: item.legalEntityName ?? null,
      readinessState: item.state,
      periodMonth,
      previous: previousItem
        ? {
            periodMonth: previousItem.periodMonth,
            days: previousItem.days,
            invoiceReference: previousItem.invoiceReference,
          }
        : null,
      dailyRateCents,
      days: item.days,
      daysSource: item.daysSource ?? null,
      amountCents,
      poNumber,
      poNumberOverridden: poNumber !== null && poNumber !== missionPo,
      poCheck: { ...check, validFrom, validUntil },
      prepared: prep.length > 0,
      preparedAt: prep[0] ? new Date(prep[0].prepared_at).toISOString() : null,
      invoiced: item.state === 'invoiced' || item.state === 'invoiced_declared',
      autoPrepare: auto.length > 0,
    }
  }

  /**
   * PRÉPARER le mois : retient les jours saisis (sans CRA) et le N° de bon de
   * commande de CE mois. Absent = inchangé ; `null` = effacé. Un mois déjà
   * facturé ne se prépare plus.
   */
  async save(
    workspaceId: string,
    userId: string,
    missionId: string,
    month: string,
    input: SaveMonthPreparationInput,
  ): Promise<InvoiceMonthPreparation> {
    const current = await this.preview(workspaceId, missionId, month)
    if (current.invoiced) throw new ConflictException('Ce mois est déjà facturé : il ne se prépare plus.')
    const writesDays = input.days !== undefined
    const writesPo = input.poNumber !== undefined
    await this.store.manager.query(
      `INSERT INTO mission_month_preparations
         (workspace_id, mission_id, period_month, manual_days, po_number, prepared_by, prepared_automatically, prepared_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, false, now())
       ON CONFLICT (mission_id, period_month) DO UPDATE SET
         manual_days = CASE WHEN $7::boolean THEN EXCLUDED.manual_days ELSE mission_month_preparations.manual_days END,
         po_number = CASE WHEN $8::boolean THEN EXCLUDED.po_number ELSE mission_month_preparations.po_number END,
         prepared_by = EXCLUDED.prepared_by,
         prepared_automatically = false,
         prepared_at = now(),
         updated_at = now()`,
      [workspaceId, missionId, `${month}-01`, input.days ?? null, input.poNumber ?? null, userId, writesDays, writesPo],
    )
    return this.preview(workspaceId, missionId, month)
  }

  /** L'option « préparer chaque mois automatiquement » : présence d'une ligne = active. */
  async setAutoPrepare(
    workspaceId: string,
    userId: string,
    missionId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    const mission = await this.store.manager.query<{ id: string }[]>(
      `SELECT id FROM missions WHERE id = $1 AND workspace_id = $2`,
      [missionId, workspaceId],
    )
    if (mission.length === 0) throw new NotFoundException('Mission introuvable.')
    if (enabled) {
      await this.store.manager.query(
        `INSERT INTO mission_invoice_auto_prepare (mission_id, workspace_id, enabled_by) VALUES ($1, $2, $3)
         ON CONFLICT (mission_id) DO NOTHING`,
        [missionId, workspaceId, userId],
      )
    } else {
      await this.store.manager.query(
        `DELETE FROM mission_invoice_auto_prepare WHERE mission_id = $1 AND workspace_id = $2`,
        [missionId, workspaceId],
      )
    }
    return { enabled }
  }

  /**
   * #2567 — le premier jour ouvré du mois, PRÉPARE le mois écoulé des missions
   * qui l'ont demandé. Idempotent (`DO NOTHING`), jamais envoyé, jamais créé
   * dans l'outil branché, jamais « facturé ». Ne touche pas un mois déjà
   * préparé à la main. Rend le nombre de missions préparées.
   */
  async prepareDueMonths(now: Date): Promise<number> {
    if (!isFirstWorkingDayOfMonth(now)) return 0
    const month = previousMonthOf(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`)
    const rows = await this.store.manager.query<{ mission_id: string }[]>(
      `INSERT INTO mission_month_preparations (workspace_id, mission_id, period_month, prepared_automatically, prepared_at)
       SELECT a.workspace_id, a.mission_id, $1::date, true, now()
         FROM mission_invoice_auto_prepare a
         JOIN missions m ON m.id = a.mission_id AND m.status <> 'draft'
        WHERE (m.started_on IS NULL OR m.started_on <= ($1::date + interval '1 month' - interval '1 day'))
          AND (m.ends_on IS NULL OR m.ends_on >= $1::date)
          AND NOT EXISTS (SELECT 1 FROM invoice_readiness r
                           WHERE r.mission_id = a.mission_id AND r.period_month = $1::date AND r.invoiced_at IS NOT NULL)
       ON CONFLICT (mission_id, period_month) DO NOTHING
       RETURNING mission_id`,
      [`${month}-01`],
    )
    return rows.length
  }
}

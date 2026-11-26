import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  redactFinance,
  DEFAULT_EXPENSE_PAGE_SIZE,
  EXPENSE_REPORT_STATUSES,
  RECEIPT_RETENTION_YEARS_FR,
  detectExpenseReportAnomalies,
  effectiveCapCents,
  expensePolicyCompliance,
  expenseVatBreakdown,
  capForCategory,
  lineCapOverageCents,
  lineRecoverableVatCents,
  receiptRetentionUntil,
  redactExpenseReportFinance,
  type ExpenseCapFacts,
  type ExpenseCategory,
  type ExpenseLineFacts,
  type ExpenseReimbursementBasis,
  type ExpenseReportAttachmentView,
  type ExpenseReportDetailView,
  type ExpenseReportLineView,
  type ExpenseReportListQuery,
  type ExpenseReportListResult,
  type ExpenseReportPolicyCheck,
  type ExpenseReportSummaryView,
  type ExpenseReportVerification,
  type ExpenseReportStatus,
  type ExpenseReportTiles,
  type MileageRateFacts,
  type SaveExpenseReportInput,
} from '@bellum/contracts'
import { firstReturnedRow } from '../../database/returned-rows'
import { ExpenseReportEntity } from '../../database/entities/expense-report.entity'

/**
 * LES NOTES DE FRAIS — le domaine (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE LIEN AVEC LA MARGE, ET POURQUOI IL EST LA PIÈCE CENTRALE
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_expenses` (30/08/2026) est la ligne de coût qui corrige la marge
 * d'une mission. Une note de frais est un DOSSIER — une personne, une période,
 * des justificatifs, une décision. Les deux existent, et il faut les relier :
 *
 *  · sans lien, les frais réellement engagés n'entrent JAMAIS dans la marge —
 *    elle se présente comme complète et ne l'est pas ;
 *  · avec un lien naïf, valider deux fois les y met DEUX fois — deux clics,
 *    ou une reprise après un timeout, ce qui est le cas réel.
 *
 * D'où `expense_reports.mission_expense_id` : la validation écrit la ligne de
 * coût UNE fois, garde son identifiant, et refuse d'écrire quand il est déjà
 * là. La preuve vit dans la même transaction que la décision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉDACTION FINANCIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran est LISIBLE sans `finance:read` — combien de notes attendent une
 * décision, de qui, pour quel client, sur quel mois. Ce sont les MONTANTS qui
 * passent la porte, mis à `null` et jamais à zéro (D45), lignes comprises. Et
 * le DROIT voyage avec la réponse (`canReadFinance`) : sans lui, « pas le
 * droit » et « pas mesuré » deviennent le même `null` et l'écran ne peut plus
 * les dire différemment.
 */
@Injectable()
export class ExpenseReportsService {
  constructor(@InjectRepository(ExpenseReportEntity) private readonly reports: Repository<ExpenseReportEntity>) {}

  /**
   * L'écran : la liste filtrée, et les trois tuiles.
   *
   * Les tuiles ignorent le filtre d'ÉTAT — elles le remplacent. « En attente
   * 15 / Validées 42 / Refusées 3 » sur une liste filtrée sur « en attente »
   * afficherait 15 / 0 / 0, et ferait conclure qu'il n'y a jamais rien eu de
   * validé. Le mois et la recherche, eux, s'appliquent aux deux : ce sont les
   * mêmes notes qu'on compte et qu'on liste.
   */
  async list(
    workspaceId: string,
    query: ExpenseReportListQuery,
    canReadFinance: boolean,
  ): Promise<ExpenseReportListResult> {
    const month = query.month ?? null
    const status = query.status ?? null
    const search = query.search ? `%${query.search}%` : null
    const accountId = query.accountId ?? null
    // La borne du serveur, pas celle de l'écran : un `pageSize` hors liste est
    // déjà refusé par le schéma, et ce défaut-ci vaut pour un appel direct.
    const pageSize = query.pageSize ?? DEFAULT_EXPENSE_PAGE_SIZE
    const page = query.page ?? 1

    // ⚠️ Le TOTAL se compte à part, et pas en additionnant les tuiles : celles-ci
    // ignorent le filtre d'ÉTAT (elles le remplacent), donc leur somme
    // répondrait à une autre question dès qu'un état est sélectionné — et
    // « 1–10 sur 60 » afficherait un 60 qui ne correspond à rien de listé.
    const [counted] = await this.reports.manager.query<{ total: number | string }[]>(
      `SELECT COUNT(DISTINCT r.id)::int AS total
         FROM expense_reports r
         LEFT JOIN accounts a ON a.id = r.account_id
        WHERE r.workspace_id = $1
          AND ($2::text IS NULL OR r.period_month = $2)
          AND ($3::text IS NULL OR r.status = $3)
          AND ($4::text IS NULL OR r.reference ILIKE $4 OR r.bearer_name ILIKE $4
               OR a.company_name ILIKE $4 OR r.period_month ILIKE $4)
          AND ($5::uuid IS NULL OR r.account_id = $5)`,
      [workspaceId, month, status, search, accountId],
    )
    const total = Number(counted?.total ?? 0)

    // ⚠️ Le tri passe par `COALESCE(submitted_at, created_at)` : un BROUILLON
    // n'a pas de date de dépôt, et `ORDER BY submitted_at DESC` remonte les NULL
    // EN TÊTE dans PostgreSQL — les brouillons de l'an dernier passeraient
    // devant la note déposée ce matin. On trie sur la date qui existe.
    const rows = await this.reports.manager.query<ListRow[]>(
      `SELECT r.id, r.reference, r.bearer_name, r.account_id, r.mission_id, r.period_month, r.status,
              r.submitted_at, r.decided_at, r.decided_by,
              a.company_name AS account_name, m.label AS mission_label,
              COUNT(l.id)::int AS line_count,
              COALESCE(SUM(l.amount_cents), 0)::bigint AS total_cents
         FROM expense_reports r
         LEFT JOIN expense_report_lines l ON l.expense_report_id = r.id
         LEFT JOIN accounts a ON a.id = r.account_id
         LEFT JOIN missions m ON m.id = r.mission_id
        WHERE r.workspace_id = $1
          AND ($2::text IS NULL OR r.period_month = $2)
          AND ($3::text IS NULL OR r.status = $3)
          AND ($4::text IS NULL OR r.reference ILIKE $4 OR r.bearer_name ILIKE $4
               OR a.company_name ILIKE $4 OR r.period_month ILIKE $4)
          AND ($7::uuid IS NULL OR r.account_id = $7)
        GROUP BY r.id, a.company_name, m.label
        ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
        LIMIT $5 OFFSET $6`,
      [workspaceId, month, status, search, pageSize, (page - 1) * pageSize, accountId],
    )

    // `COALESCE(SUM(...), 0)` est juste ICI, et c'est une exception qui se
    // justifie : une note SANS ligne vaut réellement zéro euro — l'absence de
    // ligne EST la réponse, elle n'attend rien. Le même `COALESCE` sur une
    // valeur qu'on n'a pas su lire serait le défaut « un zéro qui ment ».
    // Théo C missions-notes-de-frais.N3-N5 — la vérification au barème, ligne par
    // ligne, pour les notes de la PAGE et pour toutes celles qu'il reste à
    // regarder (en attente + brouillons) : « 2 dépassements » ne change pas selon
    // la page.
    const open = await this.openReports(workspaceId, month, search, accountId)
    const checked = await this.verify(workspaceId, [
      ...rows.map(row => ({
        id: row.id,
        reference: row.reference,
        bearerName: row.bearer_name,
        accountId: row.account_id ?? null,
      })),
      ...open,
    ])
    const names = await this.decidersOf(
      workspaceId,
      rows.map(row => row.decided_by ?? null),
    )

    const items = rows
      .map(row => {
        const check = checked.byReport.get(row.id)
        return {
          id: row.id,
          reference: row.reference,
          bearerName: row.bearer_name,
          accountName: row.account_name ?? null,
          missionId: row.mission_id ?? null,
          missionLabel: row.mission_label ?? null,
          periodMonth: row.period_month,
          status: toStatus(row.status),
          lineCount: Number(row.line_count ?? 0),
          // ⚠️ Le montant se RETIRE par le chemin unique (D45), jamais par un
          // ternaire écrit ici : `redactFinance` met le champ à `null` — PRÉSENT et
          // vide — et le droit voyage avec la réponse, sans quoi « pas le droit »
          // et « pas mesuré » deviendraient le même `null` à l'écran.
          totalAmountCents: Number(row.total_cents ?? 0),
          submittedAt: isoOrNull(row.submitted_at),
          decidedAt: isoOrNull(row.decided_at),
          decidedByName: row.decided_by ? (names.get(row.decided_by) ?? null) : null,
          policyCheck: policyCheckOf(check, canReadFinance),
        } satisfies ExpenseReportSummaryView
      })
      .map(row => redactFinance(row, canReadFinance))

    return {
      items,
      tiles: await this.tiles(workspaceId, month, search, accountId, canReadFinance),
      verification: verificationOf(open, checked, canReadFinance),
      canReadFinance,
      total,
      page,
      pageSize,
    }
  }

  /**
   * Les notes qu'il reste à REGARDER — en attente et brouillons — de la période
   * filtrée. Borné : au-delà de 500, la synthèse reste vraie sur les plus
   * récentes plutôt que de charger tout l'historique.
   */
  private async openReports(
    workspaceId: string,
    month: string | null,
    search: string | null,
    accountId: string | null,
  ): Promise<CheckedReport[]> {
    const rows = await this.reports.manager.query<OpenRow[]>(
      `SELECT r.id, r.reference, r.bearer_name, r.account_id
         FROM expense_reports r
         LEFT JOIN accounts a ON a.id = r.account_id
        WHERE r.workspace_id = $1
          AND r.status IN ('pending', 'draft')
          AND ($2::text IS NULL OR r.period_month = $2)
          AND ($3::text IS NULL OR r.reference ILIKE $3 OR r.bearer_name ILIKE $3
               OR a.company_name ILIKE $3 OR r.period_month ILIKE $3)
          AND ($4::uuid IS NULL OR r.account_id = $4)
        ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
        LIMIT 500`,
      [workspaceId, month, search, accountId],
    )
    return rows.map(row => ({
      id: row.id,
      reference: row.reference,
      bearerName: row.bearer_name,
      accountId: row.account_id ?? null,
    }))
  }

  /**
   * Compare les lignes de ces notes au barème de LEUR client (à défaut, celui de
   * l'espace) — la même fonction pure que le tiroir (`expensePolicyCompliance`),
   * jamais une seconde règle. Une note sans ligne n'est pas « conforme » : elle
   * n'a rien qui ait été comparé.
   */
  private async verify(workspaceId: string, reports: CheckedReport[]): Promise<Verified> {
    const ids = [...new Set(reports.map(report => report.id))]
    const byReport = new Map<string, ReportCheck>()
    if (ids.length === 0) return { byReport, attachmentsByReport: new Map() }

    const lineRows = await this.reports.manager.query<VerifiedLineRow[]>(
      `SELECT l.expense_report_id, l.category, l.spent_on, l.amount_cents, l.vat_rate_bps,
              l.distance_km, l.fiscal_horsepower
         FROM expense_report_lines l
        WHERE l.workspace_id = $1 AND l.expense_report_id = ANY($2::uuid[])`,
      [workspaceId, ids],
    )
    const policies = await this.reports.manager.query<{ id: string; account_id: string | null }[]>(
      `SELECT id, account_id FROM expense_policies WHERE workspace_id = $1`,
      [workspaceId],
    )
    const accountOf = new Map(reports.map(report => [report.id, report.accountId]))
    // La politique du CLIENT l'emporte sur celle par défaut de l'espace — comme dans le tiroir.
    const policyFor = (accountId: string | null): string | null =>
      (accountId ? policies.find(policy => policy.account_id === accountId) : undefined)?.id ??
      policies.find(policy => policy.account_id === null)?.id ??
      null

    const factsByReport = new Map<string, ExpenseLineFacts[]>()
    for (const row of lineRows) {
      const list = factsByReport.get(row.expense_report_id) ?? []
      list.push({
        category: row.category as ExpenseCategory,
        amountCents: Number(row.amount_cents),
        vatRateBps: row.vat_rate_bps === null ? null : Number(row.vat_rate_bps),
        spentOn: dateOnly(row.spent_on),
        distanceKm: row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km),
        fiscalHorsepower:
          row.fiscal_horsepower === null || row.fiscal_horsepower === undefined ? null : Number(row.fiscal_horsepower),
      })
      factsByReport.set(row.expense_report_id, list)
    }

    const scales = new Map<string, { caps: ExpenseCapFacts[]; rates: MileageRateFacts[] }>()
    for (const id of ids) {
      const policyId = policyFor(accountOf.get(id) ?? null)
      if (policyId !== null && !scales.has(policyId)) {
        scales.set(policyId, {
          caps: await this.capsOf(policyId, workspaceId),
          rates: await this.mileageRatesOf(policyId, workspaceId),
        })
      }
      const scale = policyId === null ? undefined : scales.get(policyId)
      const facts = factsByReport.get(id) ?? []
      const compliance = expensePolicyCompliance(facts, scale?.caps ?? [], scale?.rates ?? [])
      byReport.set(id, {
        verdict: compliance.verdict,
        overages: compliance.overages,
        unmeasuredLineCount: compliance.unmeasuredLineCount,
        lineCount: facts.length,
      })
    }

    const attachmentRows = await this.reports.manager.query<
      { expense_report_id: string; attachment_count: number | string }[]
    >(
      `SELECT expense_report_id, COUNT(*)::int AS attachment_count
         FROM expense_report_attachments
        WHERE workspace_id = $1 AND expense_report_id = ANY($2::uuid[])
        GROUP BY expense_report_id`,
      [workspaceId, ids],
    )
    return {
      byReport,
      attachmentsByReport: new Map(attachmentRows.map(row => [row.expense_report_id, Number(row.attachment_count)])),
    }
  }

  /** « Prénom Nom » de ceux qui ont décidé — absent du profil, absent de la réponse : jamais un nom deviné. */
  private async decidersOf(workspaceId: string, userIds: (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => id !== null))]
    const names = new Map<string, string>()
    if (ids.length === 0) return names
    const rows = await this.reports.manager.query<
      { user_id: string; first_name: string | null; last_name: string | null }[]
    >(`SELECT user_id, first_name, last_name FROM profiles WHERE user_id = ANY($1::uuid[])`, [ids])
    for (const row of rows) {
      const name = [row.first_name, row.last_name]
        .map(part => part?.trim())
        .filter(Boolean)
        .join(' ')
      if (name) names.set(row.user_id, name)
    }
    void workspaceId
    return names
  }

  private async tiles(
    workspaceId: string,
    month: string | null,
    search: string | null,
    accountId: string | null,
    canReadFinance: boolean,
  ): Promise<ExpenseReportTiles> {
    const rows = await this.reports.manager.query<TileRow[]>(
      `SELECT r.status, COUNT(DISTINCT r.id)::int AS count,
              COALESCE(SUM(l.amount_cents), 0)::bigint AS total_cents
         FROM expense_reports r
         LEFT JOIN expense_report_lines l ON l.expense_report_id = r.id
         LEFT JOIN accounts a ON a.id = r.account_id
        WHERE r.workspace_id = $1
          AND ($2::text IS NULL OR r.period_month = $2)
          AND ($3::text IS NULL OR r.reference ILIKE $3 OR r.bearer_name ILIKE $3
               OR a.company_name ILIKE $3 OR r.period_month ILIKE $3)
          AND ($4::uuid IS NULL OR r.account_id = $4)
        GROUP BY r.status`,
      [workspaceId, month, search, accountId],
    )

    const byStatus = new Map(rows.map(row => [row.status, row]))
    const tile = (status: ExpenseReportStatus) => {
      const row = byStatus.get(status)
      return redactFinance(
        {
          // Un état sans note vaut RÉELLEMENT zéro note — ce zéro-là est mesuré,
          // et il n'est PAS financier : il survit à la rédaction.
          count: Number(row?.count ?? 0),
          totalAmountCents: Number(row?.total_cents ?? 0),
        },
        canReadFinance,
      )
    }
    return {
      pending: tile('pending'),
      validated: tile('validated'),
      rejected: tile('rejected'),
      // La quatrième tuile est arrivée avec l'état (31/08/2026). Sans elle, le
      // déposant ne verrait pas ce qu'il a commencé sans jamais le finir — et le
      // total de la période, qui distingue « le mois est vide » de « c'est ton
      // filtre qui a tout retiré », compterait faux.
      draft: tile('draft'),
    }
  }

  /**
   * Le TIROIR : le dossier complet, ses quatre dérivations comprises.
   *
   * `today` est un PARAMÈTRE et non `new Date()` lu ici : la vérification
   * automatique doit rester reproductible, et un test qui dépend de l'horloge
   * du serveur devient rouge un jour de plus dans le mois.
   */
  async detail(
    workspaceId: string,
    reportId: string,
    canReadFinance: boolean,
    today: string,
  ): Promise<ExpenseReportDetailView> {
    const [report] = await this.reports.manager.query<DetailRow[]>(
      `SELECT r.id, r.reference, r.bearer_name, r.account_id, r.mission_id, r.period_month, r.status,
              r.submitted_at, r.decided_at, r.decided_by, r.rejection_reason, r.mission_expense_id,
              a.company_name AS account_name, m.label AS mission_label
         FROM expense_reports r
         LEFT JOIN accounts a ON a.id = r.account_id
         LEFT JOIN missions m ON m.id = r.mission_id
        WHERE r.id = $1 AND r.workspace_id = $2`,
      [reportId, workspaceId],
    )
    // Défense en profondeur : la note d'un AUTRE espace n'existe pas ici, même
    // si son identifiant a été deviné.
    if (!report) throw new NotFoundException('Note de frais introuvable dans cet espace.')

    const lineRows = await this.reports.manager.query<LineRow[]>(
      `SELECT id, category, label, spent_on, city, detail, amount_cents, vat_rate_bps,
              distance_km, fiscal_horsepower
         FROM expense_report_lines
        WHERE expense_report_id = $1 AND workspace_id = $2
        ORDER BY spent_on DESC, created_at DESC`,
      [reportId, workspaceId],
    )
    const attachmentRows = await this.reports.manager.query<AttachmentRow[]>(
      `SELECT id, file_name, byte_size, storage_object_id, retention_until
         FROM expense_report_attachments
        WHERE expense_report_id = $1 AND workspace_id = $2
        ORDER BY created_at`,
      [reportId, workspaceId],
    )

    // La politique du CLIENT l'emporte sur celle par défaut de l'espace. Le tri
    // met la ligne dont `account_id` n'est pas nul en premier : sans lui, la
    // politique appliquée dépendrait de l'ordre physique des lignes.
    const [policy] = await this.reports.manager.query<PolicyRow[]>(
      `SELECT id, label, reimbursement_basis
         FROM expense_policies
        WHERE workspace_id = $1 AND (account_id = $2 OR account_id IS NULL)
        ORDER BY (account_id IS NULL)
        LIMIT 1`,
      [workspaceId, report.account_id ?? null],
    )
    const caps: ExpenseCapFacts[] = policy ? await this.capsOf(policy.id, workspaceId) : []
    const rates: MileageRateFacts[] = policy ? await this.mileageRatesOf(policy.id, workspaceId) : []

    const facts: ExpenseLineFacts[] = lineRows.map(row => ({
      category: row.category as ExpenseCategory,
      amountCents: Number(row.amount_cents),
      vatRateBps: row.vat_rate_bps === null ? null : Number(row.vat_rate_bps),
      spentOn: dateOnly(row.spent_on),
      // `null` reste `null` : « ce trajet fait zéro kilomètre » serait une
      // mesure, et une mesure fausse. C'est ce `null` qui laisse la ligne non
      // vérifiée plutôt que conforme sur une distance inconnue.
      distanceKm: row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km),
      fiscalHorsepower:
        row.fiscal_horsepower === null || row.fiscal_horsepower === undefined ? null : Number(row.fiscal_horsepower),
    }))

    const vat = expenseVatBreakdown(facts, caps)
    const compliance = expensePolicyCompliance(facts, caps, rates)
    const deciders = await this.decidersOf(workspaceId, [report.decided_by ?? null])

    const lines: ExpenseReportLineView[] = lineRows.map((row, index) => {
      const fact = facts[index] as ExpenseLineFacts
      // ⚠️ DEUX résolutions, et elles ne se confondent pas :
      //  · la TVA se lit sur le plafond de CATÉGORIE à la date de la ligne —
      //    lui seul porte `vatRecoverable`, qui est une donnée SAISIE ;
      //  · le dépassement se lit sur le plafond OPPOSABLE, qui pour une ligne
      //    kilométrique se calcule (distance × tarif).
      // Les fondre obligerait à inventer un `vatRecoverable` sur le barème
      // kilométrique, c'est-à-dire à affirmer un droit à déduction que personne
      // n'a saisi.
      const cap = capForCategory(caps, fact.category, fact.spentOn)
      const opposable = effectiveCapCents(fact, caps, rates)
      return {
        id: row.id,
        category: fact.category,
        label: row.label,
        spentOn: fact.spentOn,
        city: row.city ?? null,
        detail: row.detail ?? null,
        amountCents: fact.amountCents,
        vatRateBps: fact.vatRateBps,
        recoverableVatCents: lineRecoverableVatCents(fact, cap),
        capCents: opposable,
        overageCents: lineCapOverageCents(fact, opposable),
        distanceKm: fact.distanceKm ?? null,
        fiscalHorsepower: fact.fiscalHorsepower ?? null,
      }
    })

    const view: ExpenseReportDetailView = {
      id: report.id,
      reference: report.reference,
      bearerName: report.bearer_name,
      accountName: report.account_name ?? null,
      missionId: report.mission_id ?? null,
      missionLabel: report.mission_label ?? null,
      periodMonth: report.period_month,
      status: toStatus(report.status),
      lineCount: lineRows.length,
      totalAmountCents: facts.reduce((total, line) => total + line.amountCents, 0),
      decidedByName: report.decided_by ? (deciders.get(report.decided_by) ?? null) : null,
      policyCheck: policyCheckOf(
        {
          verdict: compliance.verdict,
          overages: compliance.overages,
          unmeasuredLineCount: compliance.unmeasuredLineCount,
          lineCount: facts.length,
        },
        canReadFinance,
      ),
      accountId: report.account_id ?? null,
      // ⚠️ `null` sur un brouillon, jamais la date de création : « déposée le 3 »
      // sur une note que personne n'a déposée est un fait faux, et opposable.
      submittedAt: report.submitted_at === null ? null : new Date(report.submitted_at).toISOString(),
      decidedAt: report.decided_at ? new Date(report.decided_at).toISOString() : null,
      rejectionReason: report.rejection_reason ?? null,
      policyLabel: policy?.label ?? null,
      reimbursementBasis: (policy?.reimbursement_basis as ExpenseReimbursementBasis | undefined) ?? null,
      anomalies: detectExpenseReportAnomalies({
        periodMonth: report.period_month,
        lines: facts,
        attachmentCount: attachmentRows.length,
        today,
      }),
      compliance: { verdict: compliance.verdict, unmeasuredLineCount: compliance.unmeasuredLineCount },
      recoverableVatCents: vat.recoverableCents,
      borneVatCents: vat.borneCents,
      vatUnmeasuredLineCount: vat.unmeasuredLineCount,
      lines,
      attachments: attachmentRows.map(row => ({
        id: row.id,
        fileName: row.file_name,
        // `null` = poids inconnu. L'écran écrit « non mesuré », jamais « 0 KB ».
        byteSize: row.byte_size === null || row.byte_size === undefined ? null : Number(row.byte_size),
        // ⚠️ `null` = pièce RÉFÉRENCÉE sans octets : aucun bouton, exactement
        // comme avant que ce dépôt ait un stockage. La condition du bouton est
        // la DÉTENTION, jamais la promesse.
        downloadUrl: row.storage_object_id ? attachmentDownloadPath(reportId, row.id) : null,
        retentionUntil: dateOnly(row.retention_until),
      })),
      missionExpenseId: report.mission_expense_id ?? null,
    }

    return redactExpenseReportFinance(view, canReadFinance)
  }

  /**
   * Le barème d'une politique, tel que les dérivations le lisent.
   *
   * ⚠️ TOUTES les révisions sortent, pas seulement la dernière : c'est
   * `capForCategory` qui choisit celle en vigueur à la date de CHAQUE ligne. Ne
   * remonter que la plus récente rejugerait une note de mars sous le barème de
   * septembre — et la filtrer ici sur « aujourd'hui » ferait la même chose en
   * pire, puisque plus rien à l'écran ne dirait pourquoi.
   */
  private async capsOf(policyId: string, workspaceId: string): Promise<ExpenseCapFacts[]> {
    const rows = await this.reports.manager.query<CapRow[]>(
      `SELECT category, cap_cents, vat_recoverable, effective_from
         FROM expense_policy_caps
        WHERE policy_id = $1 AND workspace_id = $2`,
      [policyId, workspaceId],
    )
    return rows.map(row => ({
      category: row.category as ExpenseCategory,
      // `null` reste `null` : une catégorie non plafonnée n'est PAS plafonnée à
      // zéro, et c'est ce qui bascule le verdict sur `unknown`.
      capCents: row.cap_cents === null ? null : Number(row.cap_cents),
      vatRecoverable: row.vat_recoverable,
      // ⚠️ `?? null` et non `=== null` : une colonne absente de la projection —
      // ou d'un test qui n'en fabrique pas — arrive `undefined`, et `dateOnly`
      // tomberait dessus. Une absence, quelle que soit sa forme, veut dire ici
      // « en vigueur depuis toujours ».
      effectiveFrom: (row.effective_from ?? null) === null ? null : dateOnly(row.effective_from as string | Date),
    }))
  }

  /** Le barème kilométrique SAISI. Vide tant que l'ESN n'a rien saisi — et une
   *  ligne kilométrique reste alors non vérifiée, jamais conforme. */
  private async mileageRatesOf(policyId: string, workspaceId: string): Promise<MileageRateFacts[]> {
    const rows = await this.reports.manager.query<MileageRateRow[]>(
      `SELECT fiscal_horsepower, cents_per_km, effective_from
         FROM expense_mileage_rates
        WHERE policy_id = $1 AND workspace_id = $2`,
      [policyId, workspaceId],
    )
    return rows.map(row => ({
      fiscalHorsepower: Number(row.fiscal_horsepower),
      centsPerKm: Number(row.cents_per_km),
      effectiveFrom: dateOnly(row.effective_from),
    }))
  }

  /**
   * DÉPOSE ou MODIFIE une note — le chemin qui manquait au domaine.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE CHEMIN EXISTE
   * ─────────────────────────────────────────────────────────────────────────
   * Le lot du 31/08 livrait lire / valider / refuser, et rien pour DÉPOSER : un
   * écran de validation sans écran de dépôt ne sert à personne, puisque rien
   * n'arrive jamais dans la file. C'est la forme la plus coûteuse du défaut n°1
   * du dépôt — une lecture plus large que l'écriture.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'UNE ÉDITION PEUT TOUCHER, ET QUAND
   * ─────────────────────────────────────────────────────────────────────────
   * Tant que la note n'est pas DÉCIDÉE. Un brouillon s'édite (personne ne l'a
   * lu), une note en attente aussi (le porteur corrige avant qu'on la regarde),
   * une note validée ou refusée NON : elle a produit une décision, et une ligne
   * de coût pour la première. Modifier après coup ferait diverger la marge de la
   * mission du dossier qui la justifie, sans que rien ne le dise.
   *
   * La condition est posée en BASE (`WHERE status IN ('draft','pending')`) et
   * pas dans un `if` : deux requêtes concurrentes franchissent le `if`, pas le
   * `WHERE`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LES LIGNES ET LES PIÈCES SONT REMPLACÉES EN BLOC
   * ─────────────────────────────────────────────────────────────────────────
   * Et c'est le seul endroit du domaine où l'on efface. « On archive, on ne
   * supprime pas » porte sur des FAITS — une note refusée garde ses lignes,
   * c'est écrit dans `reject`. Ici, on réécrit une SAISIE en cours, sur une note
   * que personne n'a encore jugée : la version d'avant n'est pas un fait
   * historique, c'est une frappe corrigée.
   */
  async save(
    workspaceId: string,
    userId: string,
    reportId: string | null,
    input: SaveExpenseReportInput,
  ): Promise<{ id: string; status: ExpenseReportStatus }> {
    const reference = input.reference.trim()
    const bearerName = input.bearerName.trim()

    return this.reports.manager.transaction(async manager => {
      let id = reportId
      let status: ExpenseReportStatus = 'draft'

      if (id === null) {
        const [created] = await manager.query<{ id: string }[]>(
          `INSERT INTO expense_reports
             (workspace_id, mission_id, account_id, bearer_name, bearer_user_id, reference, period_month,
              status, submitted_at)
           VALUES ($1, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7, 'draft', NULL)
           ON CONFLICT (workspace_id, reference) DO NOTHING
           RETURNING id`,
          [workspaceId, input.missionId, input.accountId, bearerName, userId, reference, input.periodMonth],
        )
        // `ON CONFLICT DO NOTHING` plutôt qu'une violation d'index remontée en
        // 500 : la référence est unique par espace, et « cette référence est
        // déjà prise » est une phrase que le déposant peut corriger.
        if (!created) {
          throw new BadRequestException(
            `La référence « ${reference} » est déjà portée par une autre note de cet espace — deux notes de même référence rendraient le rapprochement comptable impossible.`,
          )
        }
        id = created.id
      } else {
        const updated = firstReturnedRow<{ id: string; status: string }>(
          await manager.query<{ id: string; status: string }[]>(
            `UPDATE expense_reports
                SET mission_id = $3::uuid, account_id = $4::uuid, bearer_name = $5,
                    reference = $6, period_month = $7, updated_at = now()
              WHERE id = $1 AND workspace_id = $2 AND status IN ('draft', 'pending')
            RETURNING id, status`,
            [id, workspaceId, input.missionId, input.accountId, bearerName, reference, input.periodMonth],
          ),
        )
        // `firstReturnedRow` : TypeORM rend `[lignes, nombre]` sur un UPDATE,
        // donc `rows[0]` serait le TABLEAU — « truthy » même si rien n'a bougé.
        if (!updated) {
          throw new NotFoundException(
            'Note de frais introuvable dans cet espace, ou déjà décidée — une note validée ou refusée ne se modifie plus.',
          )
        }
        status = toStatus(updated.status)
        await manager.query(`DELETE FROM expense_report_lines WHERE expense_report_id = $1 AND workspace_id = $2`, [
          id,
          workspaceId,
        ])
        await manager.query(
          `DELETE FROM expense_report_attachments WHERE expense_report_id = $1 AND workspace_id = $2`,
          [id, workspaceId],
        )
      }

      for (const line of input.lines) {
        await manager.query(
          `INSERT INTO expense_report_lines
             (expense_report_id, workspace_id, category, label, spent_on, city, detail, amount_cents,
              vat_rate_bps, distance_km, fiscal_horsepower)
           VALUES ($1, $2, $3, $4, $5::date, $6::text, $7::text, $8::bigint, $9::int, $10::int, $11::int)`,
          [
            id,
            workspaceId,
            line.category,
            line.label,
            line.spentOn,
            line.city,
            line.detail,
            line.amountCents,
            // ⚠️ `null` traverse tel quel : « taux non lu » et « taux zéro » sont
            // deux faits, et un `?? 0` ici annulerait la colonne nullable.
            line.vatRateBps,
            line.distanceKm,
            line.fiscalHorsepower,
          ],
        )
      }

      if (input.attachments.length > 0) {
        const retentionUntil = this.retentionFor(input)
        for (const attachment of input.attachments) {
          await manager.query(
            `INSERT INTO expense_report_attachments
               (expense_report_id, workspace_id, file_name, content_type, byte_size, download_url, retention_until)
             VALUES ($1, $2, $3, $4::text, $5::bigint, NULL, $6::date)`,
            [id, workspaceId, attachment.fileName, attachment.contentType, attachment.byteSize, retentionUntil],
          )
          // ⚠️ `download_url` est NULL, et ce n'est pas un oubli : aucun
          // stockage de fichiers n'est branché sur ce domaine dans cette
          // branche. Le point de branchement est ICI, et lui seul — le service
          // de stockage rend une clé, on l'écrit dans cette colonne, et l'écran
          // affiche alors son bouton. Fabriquer une URL en attendant donnerait
          // un bouton qui ne télécharge rien, qu'on découvre en réunion.
        }
      }

      return { id: id as string, status }
    })
  }

  /**
   * L'échéance de CONSERVATION posée sur les pièces d'une note.
   *
   * Elle est calculée UNE fois, à l'écriture, et stockée — jamais recalculée à
   * l'affichage : ce qu'on oppose à un contrôle est la règle en vigueur au
   * moment du dépôt, pas celle d'aujourd'hui.
   *
   * L'ancre est la dernière dépense de la note, et à défaut le premier jour de
   * la période déclarée. `periodMonth` est validé `AAAA-MM` par le schéma, donc
   * cette date est toujours lisible : `receiptRetentionUntil` ne peut pas rendre
   * `null` ici, et le repli n'est pas une date devinée mais la seule que la note
   * porte.
   */
  private retentionFor(input: SaveExpenseReportInput): string {
    const lastSpentOn =
      input.lines.map(line => line.spentOn).sort()[input.lines.length - 1] ?? `${input.periodMonth}-01`
    return receiptRetentionUntil(lastSpentOn, RECEIPT_RETENTION_YEARS_FR) ?? `${input.periodMonth}-01`
  }

  /**
   * SOUMET un brouillon — il entre dans la file du valideur.
   *
   * Deux choses ensemble, et une seule requête pour les deux : l'état passe à
   * `pending` et la date de dépôt s'écrit. La contrainte
   * `expense_reports_submitted_at_check` refuse en base une note quittant le
   * brouillon sans sa date — le dernier rempart, celui qu'aucun appelant ne
   * contourne.
   *
   * `WHERE status = 'draft'` : soumettre deux fois ne redate pas le dépôt. La
   * date de dépôt est ce qu'on regarde pour dire « ça attend depuis douze
   * jours » ; la repousser d'un clic effacerait le retard.
   */
  async submit(
    workspaceId: string,
    reportId: string,
  ): Promise<{ id: string; status: ExpenseReportStatus; submittedAt: string }> {
    const when = new Date()
    const row = firstReturnedRow<{ id: string }>(
      await this.reports.manager.query<{ id: string }[]>(
        `UPDATE expense_reports
            SET status = 'pending', submitted_at = $3, updated_at = now()
          WHERE id = $1 AND workspace_id = $2 AND status = 'draft'
        RETURNING id`,
        [reportId, workspaceId, when],
      ),
    )
    if (!row) {
      throw new NotFoundException(
        'Note de frais introuvable dans cet espace, ou déjà soumise — une note ne se dépose qu’une fois.',
      )
    }
    return { id: row.id, status: 'pending', submittedAt: when.toISOString() }
  }

  /**
   * RETIRE une note soumise par erreur — elle redevient un brouillon.
   *
   * ⚠️ Seulement tant qu'elle est EN ATTENTE. Une note décidée ne se retire pas :
   * ce serait défaire une décision prise par quelqu'un d'autre, et pour une note
   * validée cela laisserait derrière elle une ligne `mission_expenses` que plus
   * rien ne justifie. Le geste qui existe alors est un refus, avec son motif.
   *
   * `submitted_at` repasse à `NULL`, et c'est délibéré : la note n'est plus
   * déposée. Garder l'ancienne date ferait remonter, à la re-soumission, un
   * délai d'attente qui n'a pas eu lieu.
   */
  async withdraw(workspaceId: string, reportId: string): Promise<{ id: string; status: ExpenseReportStatus }> {
    const row = firstReturnedRow<{ id: string }>(
      await this.reports.manager.query<{ id: string }[]>(
        `UPDATE expense_reports
            SET status = 'draft', submitted_at = NULL, updated_at = now()
          WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
        RETURNING id`,
        [reportId, workspaceId],
      ),
    )
    if (!row) {
      throw new NotFoundException(
        'Note de frais introuvable dans cet espace, ou déjà décidée — une décision prise ne se retire pas, elle se refuse avec un motif.',
      )
    }
    return { id: row.id, status: 'draft' }
  }

  /**
   * VALIDE une note — et pousse ses frais dans la marge de la mission, UNE fois.
   *
   * Trois choses tiennent ensemble dans une seule transaction :
   *  1. la décision (`pending` → `validated`), qui ne se prend que sur une note
   *     encore en attente : `WHERE status = 'pending'` fait de la condition une
   *     affaire de BASE, pas un `if` que deux requêtes concurrentes franchissent
   *     toutes les deux ;
   *  2. la ligne `mission_expenses`, écrite seulement si la note porte une
   *     mission, un montant, et pas déjà de ligne ;
   *  3. le retour de son identifiant sur la note — la PREUVE qui rend le geste
   *     rejouable sans rien doubler.
   *
   * Ce que la validation ne fait PAS : elle ne paie rien et ne facture rien. Le
   * produit s'arrête à « la dépense est acceptée et entre dans le coût de la
   * mission ». Le virement au porteur se fait ailleurs, par une personne.
   */
  async validate(
    workspaceId: string,
    userId: string,
    reportId: string,
  ): Promise<{ id: string; status: ExpenseReportStatus; decidedAt: string; missionExpenseId: string | null }> {
    const when = new Date()

    return this.reports.manager.transaction(async manager => {
      const decided = firstReturnedRow<DecisionRow>(
        await manager.query<DecisionRow[]>(
          `UPDATE expense_reports
              SET status = 'validated', decided_at = $3, decided_by = $4, updated_at = now()
            WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
          RETURNING id, mission_id, mission_expense_id, reference, period_month`,
          [reportId, workspaceId, when, userId],
        ),
      )
      // `firstReturnedRow` : TypeORM rend `[lignes, nombre]` sur un UPDATE, donc
      // `rows[0]` serait le TABLEAU — « truthy » même quand rien n'a bougé.
      if (!decided) {
        throw new NotFoundException(
          'Note de frais introuvable dans cet espace, ou déjà décidée — une décision ne se reprend pas d’un clic.',
        )
      }

      // Déjà reliée : rejouer ne doit RIEN réécrire. C'est le cas d'une reprise
      // après un timeout, et sans ce garde-fou la marge compterait deux fois.
      if (decided.mission_expense_id) {
        return {
          id: decided.id,
          status: 'validated' as const,
          decidedAt: when.toISOString(),
          missionExpenseId: decided.mission_expense_id,
        }
      }
      // Une note sans mission n'a pas de marge à corriger. Elle reste une
      // dépense de l'entreprise, et le dossier la garde — mais rien à pousser.
      if (!decided.mission_id) {
        return { id: decided.id, status: 'validated' as const, decidedAt: when.toISOString(), missionExpenseId: null }
      }

      const [totals] = await manager.query<{ total: string | null; last_spent_on: string | null }[]>(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total, MAX(spent_on) AS last_spent_on
           FROM expense_report_lines WHERE expense_report_id = $1 AND workspace_id = $2`,
        [reportId, workspaceId],
      )
      const totalCents = Number(totals?.total ?? 0)
      const lastSpentOn = totals?.last_spent_on ?? null
      // `mission_expenses.amount_cents > 0` est une contrainte de BASE : une note
      // à zéro n'y entre pas, et forcer l'insertion lèverait une erreur SQL en
      // plein milieu d'une validation par ailleurs légitime.
      if (totalCents <= 0 || lastSpentOn === null) {
        return { id: decided.id, status: 'validated' as const, decidedAt: when.toISOString(), missionExpenseId: null }
      }

      const [inserted] = await manager.query<{ id: string }[]>(
        `INSERT INTO mission_expenses (mission_id, workspace_id, label, amount_cents, expense_date, entered_by, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'human')
         RETURNING id`,
        [
          decided.mission_id,
          workspaceId,
          `Note de frais ${decided.reference}`,
          totalCents,
          dateOnly(lastSpentOn),
          // `entered_by` est « qui l'a SAISIE » : cette ligne de coût NAÎT du
          // geste de validation, donc de son auteur. Le porteur de la note,
          // lui, reste nommé sur la note — la ligne de coût ne le remplace pas.
          userId,
        ],
      )
      const missionExpenseId = inserted?.id ?? null
      if (missionExpenseId) {
        await manager.query(
          `UPDATE expense_reports SET mission_expense_id = $3, updated_at = now()
            WHERE id = $1 AND workspace_id = $2`,
          [reportId, workspaceId, missionExpenseId],
        )
      }

      return { id: decided.id, status: 'validated' as const, decidedAt: when.toISOString(), missionExpenseId }
    })
  }

  /**
   * REFUSE une note, avec un motif OBLIGATOIRE.
   *
   * Trois remparts, du plus extérieur au plus intérieur — exactement ceux du
   * rejet d'un relevé d'activité, parce que c'est le même geste :
   *  1. `rejectExpenseReportSchema` refuse un corps sans `reason` ;
   *  2. le `trim()` ci-dessous refuse « trois espaces », qui passe toute
   *     validation de présence et ne dit rien à personne ;
   *  3. `expense_reports_rejection_reason_check` refuse en BASE un refus sans
   *     motif — le dernier rempart, celui qu'aucun appelant ne contourne.
   *
   * Le refus n'efface rien : les lignes et les pièces restent. On archive, on ne
   * supprime pas — et sans elles, « pourquoi cette note a-t-elle été refusée »
   * n'aurait plus de réponse trois mois plus tard.
   */
  async reject(
    workspaceId: string,
    userId: string,
    reportId: string,
    reason: string,
  ): Promise<{ id: string; status: ExpenseReportStatus; decidedAt: string; rejectionReason: string }> {
    const trimmed = reason.trim()
    if (!trimmed) {
      throw new BadRequestException(
        'Un refus sans motif ne dit rien au porteur — dis ce qui ne va pas, pour que la note puisse être corrigée.',
      )
    }

    const when = new Date()
    const row = firstReturnedRow<{ id: string }>(
      await this.reports.manager.query<{ id: string }[]>(
        `UPDATE expense_reports
            SET status = 'rejected', decided_at = $3, decided_by = $4, rejection_reason = $5, updated_at = now()
          WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
        RETURNING id`,
        [reportId, workspaceId, when, userId, trimmed],
      ),
    )
    if (!row) {
      throw new NotFoundException(
        'Note de frais introuvable dans cet espace, ou déjà décidée — une décision ne se reprend pas d’un clic.',
      )
    }
    return { id: row.id, status: 'rejected', decidedAt: when.toISOString(), rejectionReason: trimmed }
  }

  /**
   * RATTACHE un justificatif RANGÉ à une note (31/08/2026).
   *
   * ⚠️ Ce service ne range rien : il ne connaît pas le stockage, et c'est
   * délibéré (GA-07 — un domaine n'appelle pas le service d'un autre). Le
   * contrôleur dépose les octets, puis passe ici ce qui en est ressorti. Si
   * cette écriture échoue, c'est LUI qui retire les octets — sans quoi le quota
   * de l'espace enflerait sans qu'aucune ligne ne le dise.
   *
   * **Seule une note ENCORE EN ATTENTE gagne une pièce**, et ce n'est pas une
   * précaution : les justificatifs sont ce sur quoi la décision s'est prise.
   * Une pièce ajoutée après coup rendrait le dossier illisible à qui relit
   * — « sur quoi cette note a-t-elle été validée ? » n'aurait plus de réponse.
   * Le refus l'explique plutôt que de laisser croire à un bogue.
   */
  /**
   * #1827 — la note appartient-elle bien à qui dépose ?
   *
   * Appelé UNIQUEMENT pour qui n'a pas `finance:write` : celui qui l'a garde
   * l'accès à toutes les notes de l'espace, inchangé. Le refus est explicite —
   * un 403 muet ferait chercher une panne là où il n'y a qu'un droit.
   *
   * ⚠️ La note d'un AUTRE espace n'existe pas ici, même si son identifiant a
   * été deviné : la clause `workspace_id` est la même défense en profondeur que
   * dans `attach()`, et elle ne se déduit pas de l'appelant.
   */
  async assertBearerIs(workspaceId: string, reportId: string, userId: string): Promise<void> {
    const [report] = await this.reports.manager.query<{ bearer_user_id: string | null }[]>(
      `SELECT bearer_user_id
         FROM expense_reports WHERE id = $1 AND workspace_id = $2`,
      [reportId, workspaceId],
    )
    if (!report) throw new NotFoundException('Note de frais introuvable dans cet espace.')
    if (report.bearer_user_id !== userId) {
      throw new ForbiddenException(
        'Cette note de frais n’est pas la tienne. Seul un rôle financier peut y joindre une pièce.',
      )
    }
  }

  async attach(
    workspaceId: string,
    reportId: string,
    file: { objectId: string; fileName: string; contentType: string; byteSize: number; retentionUntil: string },
  ): Promise<ExpenseReportAttachmentView> {
    const [report] = await this.reports.manager.query<{ id: string; status: string }[]>(
      `SELECT id, status
         FROM expense_reports WHERE id = $1 AND workspace_id = $2`,
      [reportId, workspaceId],
    )
    // Défense en profondeur : la note d'un AUTRE espace n'existe pas ici, même
    // si son identifiant a été deviné.
    if (!report) throw new NotFoundException('Note de frais introuvable dans cet espace.')
    if (toStatus(report.status) !== 'pending') {
      throw new BadRequestException(
        'Cette note a déjà été décidée : ses justificatifs sont ce sur quoi la décision s’est prise, ils ne changent plus.',
      )
    }

    const [row] = await this.reports.manager.query<{ id: string }[]>(
      `INSERT INTO expense_report_attachments
         (expense_report_id, workspace_id, storage_object_id, file_name, content_type, byte_size, retention_until)
       VALUES ($1, $2, $3, $4, $5, $6::bigint, $7::date)
       RETURNING id`,
      [reportId, workspaceId, file.objectId, file.fileName, file.contentType, file.byteSize, file.retentionUntil],
    )
    if (!row) throw new BadRequestException('Le justificatif n’a pas pu être rattaché à cette note.')

    return {
      id: row.id,
      fileName: file.fileName,
      // Ici le poids est MESURÉ — on vient de compter les octets en les
      // écrivant. C'est l'autre branche du même `null` : une pièce référencée
      // sans octets ne sait pas ce qu'elle pèse, celle-ci le sait.
      byteSize: file.byteSize,
      downloadUrl: attachmentDownloadPath(reportId, row.id),
      retentionUntil: file.retentionUntil,
    }
  }

  /**
   * L'objet rangé d'un justificatif — `null` quand la pièce est seulement
   * RÉFÉRENCÉE, ce qui est une réponse et non un échec.
   *
   * ⚠️ La jointure est bornée par l'espace des DEUX côtés : la pièce ET sa
   * note. Une pièce dont l'identifiant serait deviné ne remonte pas si elle
   * pend d'une note d'un autre espace — et le magasin n'est jamais interrogé.
   */
  async attachmentObjectId(workspaceId: string, reportId: string, attachmentId: string): Promise<string | null> {
    const [row] = await this.reports.manager.query<{ storage_object_id: string | null }[]>(
      `SELECT a.storage_object_id
         FROM expense_report_attachments a
         JOIN expense_reports r ON r.id = a.expense_report_id
        WHERE a.id = $1 AND a.expense_report_id = $2 AND r.workspace_id = $3 AND a.workspace_id = $3`,
      [attachmentId, reportId, workspaceId],
    )
    if (!row) throw new NotFoundException('Justificatif introuvable dans cet espace.')
    return row.storage_object_id ?? null
  }
}

/**
 * LA PORTE d'un justificatif — un chemin de l'API, jamais une URL de magasin.
 *
 * Une URL signée dans une réponse de LISTE aurait deux défauts : elle vivrait
 * cinq minutes (donc périmerait dans un tiroir resté ouvert), et elle voyagerait
 * en clair vers tous les lecteurs de la réponse, y compris ceux qui n'ouvriront
 * jamais la pièce. Ici, la signature se demande au clic, après vérification du
 * droit de lire la NOTE — et une seule fois.
 *
 * Cette dérivation vit à UN seul endroit : le détail et le rattachement la
 * partagent, sans quoi deux chemins écriraient deux portes différentes.
 */
function attachmentDownloadPath(reportId: string, attachmentId: string): string {
  return `/expenses/reports/${reportId}/attachments/${attachmentId}/download`
}

type ListRow = {
  id: string
  reference: string
  bearer_name: string
  account_id?: string | null
  mission_id: string | null
  mission_label?: string | null
  submitted_at?: string | Date | null
  decided_at?: string | Date | null
  decided_by?: string | null
  period_month: string
  status: string
  account_name: string | null
  line_count: number | string
  total_cents: string | null
}
type OpenRow = { id: string; reference: string; bearer_name: string; account_id: string | null }
type VerifiedLineRow = {
  expense_report_id: string
  category: string
  spent_on: string | Date
  amount_cents: string | number
  vat_rate_bps: number | string | null
  distance_km: number | string | null
  fiscal_horsepower: number | string | null
}
type CheckedReport = { id: string; reference: string; bearerName: string; accountId: string | null }
type ReportCheck = {
  verdict: ExpenseReportPolicyCheck['verdict']
  overages: { category: ExpenseCategory; overageCents: number }[]
  unmeasuredLineCount: number
  lineCount: number
}
type Verified = { byReport: Map<string, ReportCheck>; attachmentsByReport: Map<string, number> }
type TileRow = { status: string; count: number | string; total_cents: string | null }
type DetailRow = ListRow & {
  account_id: string | null
  /** `null` sur un brouillon — une note jamais soumise n'a pas de date de dépôt. */
  submitted_at: string | Date | null
  decided_at: string | Date | null
  rejection_reason: string | null
  mission_expense_id: string | null
}
type LineRow = {
  id: string
  category: string
  label: string
  spent_on: string
  city: string | null
  detail: string | null
  amount_cents: string | number
  vat_rate_bps: number | string | null
  distance_km: number | string | null
  fiscal_horsepower: number | string | null
}
type AttachmentRow = {
  id: string
  file_name: string
  byte_size: string | number | null
  /** `null` = pièce référencée sans octets. C'est ce qui décide du bouton. */
  storage_object_id: string | null
  retention_until: string
}
type PolicyRow = { id: string; label: string; reimbursement_basis: string }
type CapRow = {
  category: string
  cap_cents: string | null
  vat_recoverable: boolean
  effective_from: string | Date | null
}
type MileageRateRow = {
  fiscal_horsepower: number | string
  cents_per_km: number | string
  effective_from: string | Date
}
type DecisionRow = {
  id: string
  mission_id: string | null
  mission_expense_id: string | null
  reference: string
  period_month: string
}

/**
 * Un statut illisible retombe sur `pending` plutôt que de traverser tel quel.
 *
 * La contrainte SQL garantit déjà les trois valeurs ; ceci protège le CAS où
 * elle serait élargie sans que l'écran le sache — un statut inconnu rendu tel
 * quel n'aurait ni badge ni traduction, et l'écran afficherait une clé brute.
 */
function toStatus(value: string): ExpenseReportStatus {
  return (EXPENSE_REPORT_STATUSES as readonly string[]).includes(value) ? (value as ExpenseReportStatus) : 'pending'
}

/** `YYYY-MM-DD` — une colonne `date` peut revenir en `Date` selon le pilote. */
function dateOnly(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

/** Une date en ISO, ou `null` — jamais la date de création mise à la place d'un dépôt. */
function isoOrNull(value: string | Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}

/**
 * Ce que dit la colonne « Barème » d'UNE note. Le plus gros dépassement est choisi
 * sur le montant ; son montant suit `finance:read` (`null` PRÉSENT sinon, D45).
 */
function policyCheckOf(check: ReportCheck | undefined, canReadFinance: boolean): ExpenseReportPolicyCheck {
  if (!check) return { verdict: 'unknown', overageCount: 0, unmeasuredLineCount: 0, worstOverage: null }
  const worst = check.overages.reduce<ReportCheck['overages'][number] | null>(
    (best, current) => (best === null || current.overageCents > best.overageCents ? current : best),
    null,
  )
  return {
    verdict: check.verdict,
    overageCount: check.overages.length,
    unmeasuredLineCount: check.unmeasuredLineCount,
    worstOverage: worst ? { category: worst.category, overageCents: canReadFinance ? worst.overageCents : null } : null,
  }
}

/** « Ce que la vérification relève » sur les notes qu'il reste à regarder. */
function verificationOf(open: CheckedReport[], checked: Verified, canReadFinance: boolean): ExpenseReportVerification {
  const seen = new Set<string>()
  const result: ExpenseReportVerification = {
    overages: [],
    unmeasuredLineCount: 0,
    lineCount: 0,
    attachmentCount: 0,
    reportsWithoutReceipt: 0,
  }
  for (const report of open) {
    if (seen.has(report.id)) continue
    seen.add(report.id)
    const check = checked.byReport.get(report.id)
    if (!check) continue
    for (const overage of check.overages) {
      result.overages.push({
        reportId: report.id,
        reference: report.reference,
        bearerName: report.bearerName,
        category: overage.category,
        overageCents: canReadFinance ? overage.overageCents : null,
      })
    }
    result.unmeasuredLineCount += check.unmeasuredLineCount
    result.lineCount += check.lineCount
    const attachments = checked.attachmentsByReport.get(report.id) ?? 0
    result.attachmentCount += attachments
    if (check.lineCount > 0 && attachments === 0) result.reportsWithoutReceipt += 1
  }
  return result
}

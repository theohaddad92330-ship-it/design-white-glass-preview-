import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  REMINDER_SCHEDULE_DAYS,
  canMarkTimesheetNotApplicable,
  expectsTimesheet,
  recommendTimesheetAction,
  resolveChannel,
  runTimesheetChecks,
  toneForReminder,
  type ContractKind,
  type ReminderCapabilities,
  type ResolvedChannel,
  type ReminderTone,
  type TimesheetCrossCheck,
  type TimesheetReview,
  type TimesheetReviewQuery,
  type TimesheetStatus,
} from '@bellum/contracts'
import { MissionTimesheetEntity } from '../../database/entities/mission-timesheet.entity'
import { GOOGLE_SCOPE } from '../google/google-config'
import { firstReturnedRow } from '../../database/returned-rows'
import {
  duplicateValidatedTimesheet,
  overlappingMissionAssignment,
  type CrossCheckOutcome,
} from './timesheet-cross-checks'
import { buildTimesheetLine, summarizeTimesheets, type TimesheetLine, type TimesheetSummary } from './timesheet-view'

type CraRow = {
  mission_id: string
  mission_label: string | null
  account_name: string | null
  contract_kind: string | null
  started_on: string | null
  ends_on: string | null
  consultant_id: string | null
  consultant_name: string | null
  ts_id: string | null
  ts_days: string | number | null
  ts_status: string | null
  ts_expected: string | number | null
  ts_explanation: string | null
  ts_validated_client: Date | null
  // #2196.16 — celui qui a ENREGISTRÉ la validation client, jamais le contact
  // client lui-même. Nom + prénom d'abord, l'email en repli — jamais l'UUID nu.
  ts_approver_name: string | null
  ts_approver_email: string | null
  ts_anomalies: string[] | null
  ts_reminders: number | null
  ts_last_reminder: Date | null
  ts_rejected_at: Date | null
  ts_rejection_reason: string | null
  // #2415.7 — combien de jours posent problème, et par quand corriger.
  ts_contested_days: string | number | null
  ts_correction_deadline: string | null
  // #2415.5 — QUI a déclaré, distinct de `consultant_id`.
  ts_submitted_by_name: string | null
  ts_submitted_by_email: string | null
  // #2415.6 — la revue INTERNE, distincte de la validation client.
  ts_internal_reviewed_at: Date | null
  ts_internal_reviewed_by_name: string | null
  ts_internal_reviewed_by_email: string | null
  // #2196.31 — l'exception « non applicable » ACTIVE de la maille, et qui l'a
  // posée (nom + prénom, l'e-mail en repli — jamais l'UUID nu).
  na_id: string | null
  na_reason: string | null
  na_created_at: Date | null
  na_marked_by: string | null
}

/**
 * #2196.31 — ce qu'une pose ou une révocation d'exception rend : de quoi
 * répondre à l'écran ET écrire la ligne du journal de la mission (le compte
 * porteur, le libellé, le mois, le motif).
 */
export type TimesheetExceptionTrace = {
  id: string
  missionId: string
  missionLabel: string | null
  accountId: string | null
  periodMonth: string
  reason: string
  at: string
}

/**
 * Le relevé d'activité, vu du 5 du mois (PDF 5 §7).
 *
 * Une ligne par mission ET par consultant — c'est le changement de maille qui
 * porte tout le reste. La table portait un index d'unicité sur (mission, mois),
 * si bien que le second consultant d'une mission écrasait le relevé du premier,
 * en silence, et qu'un mois entier disparaissait de la facturation.
 *
 * Le service LIT et ASSEMBLE ; il ne juge rien. Tous les calculs vivent dans
 * `timesheet-view.ts`, pur et testé : ce module compte des jours, et une erreur
 * de comptage se paie en euros non facturés.
 */
@Injectable()
export class TimesheetsService {
  private readonly logger = new Logger(TimesheetsService.name)

  // L'espace de travail arrive du CONTRÔLEUR, résolu là-bas.
  //
  // Ce n'est pas un détail de style : la règle §3.2 interdit à un service
  // d'aller chercher le service d'un autre module, et le contrôleur est la
  // couche où un geste utilisateur traverse légitimement deux domaines. La
  // garde GA-07 mesure exactement ça, et elle ne monte pas.
  constructor(
    @InjectRepository(MissionTimesheetEntity)
    private readonly timesheets: Repository<MissionTimesheetEntity>,
  ) {}

  /**
   * Le mois, mission par mission et consultant par consultant.
   *
   * Le mois par défaut est le PRÉCÉDENT, comme la vue « prêt à facturer » : le
   * 5 du mois, la question n'est pas « où en est le mois en cours ».
   */
  async month(
    workspaceId: string,
    query: { month?: string; status?: TimesheetStatus; missionId?: string; blockingOnly?: boolean },
    now: Date = new Date(),
  ): Promise<{ month: string; items: TimesheetLine[]; summary: TimesheetSummary }> {
    const month = query.month ?? previousMonth(now)
    const periodMonth = `${month}-01`
    const today = now.toISOString().slice(0, 10)

    // La LEFT JOIN sur les affectations est ce qui produit une ligne par
    // consultant. Une mission sans affectation garde une ligne unique, sans
    // consultant : elle attend quand même son relevé.
    const rows = await this.timesheets.manager.query<CraRow[]>(
      `SELECT m.id AS mission_id, m.label AS mission_label, a.company_name AS account_name,
              m.contract_kind, m.started_on, m.ends_on,
              asg.consultant_id, c.full_name AS consultant_name,
              ts.id AS ts_id, ts.days AS ts_days, ts.status AS ts_status,
              ts.expected_days AS ts_expected, ts.gap_explanation AS ts_explanation,
              ts.validated_by_client_at AS ts_validated_client,
              NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS ts_approver_name,
              p.email AS ts_approver_email,
              ts.anomalies AS ts_anomalies,
              ts.reminders_sent AS ts_reminders, ts.last_reminder_at AS ts_last_reminder,
              ts.rejected_at AS ts_rejected_at, ts.rejection_reason AS ts_rejection_reason,
              ts.contested_days AS ts_contested_days, ts.correction_deadline AS ts_correction_deadline,
              -- #2415.5 — QUI a déclaré ces jours, distinct de consultant_id
              -- (DE QUI ils sont) : un ops peut déclarer POUR un consultant.
              NULLIF(TRIM(CONCAT_WS(' ', sb.first_name, sb.last_name)), '') AS ts_submitted_by_name,
              sb.email AS ts_submitted_by_email,
              -- #2415.6 — la revue INTERNE, distincte de la validation client.
              ts.internal_reviewed_at AS ts_internal_reviewed_at,
              NULLIF(TRIM(CONCAT_WS(' ', ir.first_name, ir.last_name)), '') AS ts_internal_reviewed_by_name,
              ir.email AS ts_internal_reviewed_by_email,
              na.id AS na_id, na.reason AS na_reason, na.created_at AS na_created_at,
              na.marked_by AS na_marked_by
         FROM missions m
         LEFT JOIN accounts a ON a.id = m.account_id
         LEFT JOIN mission_assignments asg
                ON asg.mission_id = m.id
               AND (asg.ends_on IS NULL OR asg.ends_on >= $2::date)
               AND asg.starts_on <= ($2::date + interval '1 month' - interval '1 day')
         LEFT JOIN consultants c ON c.id = asg.consultant_id
         LEFT JOIN mission_timesheets ts
                ON ts.mission_id = m.id
               AND ts.period_month = $2
               AND (ts.consultant_id = asg.consultant_id OR (ts.consultant_id IS NULL AND asg.consultant_id IS NULL))
         LEFT JOIN profiles p ON p.user_id = ts.validated_by
         LEFT JOIN profiles sb ON sb.user_id = ts.submitted_by
         LEFT JOIN profiles ir ON ir.user_id = ts.internal_reviewed_by
         -- #2196.31 — l'exception « non applicable » VIVANTE de la maille. Une
         -- révoquée reste en base (on archive) mais ne prime plus : la
         -- déduction du contrat reprend.
         LEFT JOIN LATERAL (
           SELECT x.id, x.reason, x.created_at,
                  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', xp.first_name, xp.last_name)), ''), xp.email) AS marked_by
             FROM mission_timesheet_exceptions x
             LEFT JOIN profiles xp ON xp.user_id = x.created_by
            WHERE x.mission_id = m.id
              AND x.period_month = $2::date
              AND x.consultant_id IS NOT DISTINCT FROM asg.consultant_id
              AND x.revoked_at IS NULL
            LIMIT 1
         ) na ON true
        WHERE m.workspace_id = $1
          AND m.status <> 'draft'
          AND (m.started_on IS NULL OR m.started_on <= ($2::date + interval '1 month' - interval '1 day'))
          AND (m.ends_on IS NULL OR m.ends_on >= $2::date)
          AND ($3::uuid IS NULL OR m.id = $3::uuid)
        ORDER BY a.company_name NULLS LAST, m.label, c.full_name NULLS LAST`,
      [workspaceId, periodMonth, query.missionId ?? null],
    )

    const items = rows.map(row =>
      buildTimesheetLine(
        {
          missionId: row.mission_id,
          missionLabel: row.mission_label,
          accountName: row.account_name,
          contractKind: (row.contract_kind as ContractKind) ?? 'inconnu',
          startedOn: row.started_on,
          endsOn: row.ends_on,
          consultantId: row.consultant_id,
          consultantName: row.consultant_name,
          row: row.ts_id
            ? {
                id: row.ts_id,
                days: Number(row.ts_days ?? 0),
                status: (row.ts_status as TimesheetStatus) ?? 'draft',
                expectedDays: row.ts_expected === null ? null : Number(row.ts_expected),
                gapExplanation: row.ts_explanation,
                validatedByClientAt: row.ts_validated_client ? new Date(row.ts_validated_client).toISOString() : null,
                approverName: row.ts_approver_name || row.ts_approver_email || null,
                anomalies: row.ts_anomalies ?? [],
                remindersSent: row.ts_reminders ?? 0,
                lastReminderAt: row.ts_last_reminder ? new Date(row.ts_last_reminder).toISOString() : null,
                rejectedAt: row.ts_rejected_at ? new Date(row.ts_rejected_at).toISOString() : null,
                rejectionReason: row.ts_rejection_reason,
                contestedDays: row.ts_contested_days === null ? null : Number(row.ts_contested_days),
                correctionDeadline: row.ts_correction_deadline,
                submittedByName: row.ts_submitted_by_name || row.ts_submitted_by_email || null,
                internalReviewedAt: row.ts_internal_reviewed_at
                  ? new Date(row.ts_internal_reviewed_at).toISOString()
                  : null,
                internalReviewedByName: row.ts_internal_reviewed_by_name || row.ts_internal_reviewed_by_email || null,
              }
            : null,
          notApplicable:
            row.na_id && row.na_reason
              ? {
                  id: row.na_id,
                  reason: row.na_reason,
                  markedAt: row.na_created_at ? new Date(row.na_created_at).toISOString() : '',
                  markedByName: row.na_marked_by || null,
                }
              : null,
        },
        periodMonth,
        { today },
      ),
    )

    // Le résumé porte sur TOUT le mois, jamais sur la liste filtrée : le
    // calculer après filtre afficherait « 0 validé » là où dix le sont.
    const summary = summarizeTimesheets(items)
    let filtered = items
    if (query.status) filtered = filtered.filter(item => item.status === query.status)
    if (query.blockingOnly) filtered = filtered.filter(item => item.blocksInvoicing)

    return { month, items: filtered, summary }
  }

  /**
   * LE DOSSIER D'UN RELEVÉ — ce que le tiroir de validation lit (PDF-22 §05).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LA MAILLE EST (MISSION × MOIS × CONSULTANT), PAS L'IDENTIFIANT DU RELEVÉ
   * ─────────────────────────────────────────────────────────────────────────
   * Un mois SANS dépôt n'a pas d'identifiant de relevé — et c'est justement le
   * mois qu'on veut pouvoir ouvrir, parce que c'est celui qui coûte. Router sur
   * `:id` aurait rendu le tiroir inaccessible sur la moitié des lignes de
   * l'écran.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LA LIGNE VIENT DE `month()`, ELLE N'EST PAS RECONSTRUITE
   * ─────────────────────────────────────────────────────────────────────────
   * Une seconde requête écrite ici aurait divergé de celle de la liste — statut,
   * charge attendue, écart, blocage — et le tiroir aurait contredit la ligne
   * qu'on venait de cliquer. On réutilise le MÊME assemblage, filtré sur la
   * mission : la question posée au serveur est plus étroite, la dérivation est
   * la même.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ LES CONTRÔLES SE REFONT ICI, ILS NE SE RELISENT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * `anomalies` en base est une ARCHIVE : ce qui avait été vu le jour du dépôt,
   * en toutes lettres et en français. Elle voyage telle quelle sous
   * `recordedAnomalies`, parce qu'on archive et qu'on ne supprime pas. Mais le
   * VERDICT que lit un valideur se refait à la lecture — sinon un relevé déposé
   * avant qu'un doublon n'existe s'afficherait « rien à signaler » pour
   * toujours.
   */
  async review(workspaceId: string, query: TimesheetReviewQuery, now: Date = new Date()): Promise<TimesheetReview> {
    const { items } = await this.month(workspaceId, { month: query.month, missionId: query.missionId }, now)
    const wanted = query.consultantId ?? null
    const line = items.find(item => (item.consultantId ?? null) === wanted)
    if (!line) throw new NotFoundException('Relevé introuvable dans cet espace pour ce mois.')

    const periodMonth = `${query.month}-01`
    // Sans consultant, la lecture du chevauchement ne PART pas : on ne saurait
    // pas QUI croiser, et `runTimesheetChecks` le dira « non vérifié » plutôt
    // que « aucun chevauchement ».
    const [overlapping, duplicate] = await Promise.all([
      line.consultantId
        ? overlappingMissionAssignment(this.timesheets.manager, {
            workspaceId,
            consultantId: line.consultantId,
            missionId: line.missionId,
            periodMonth,
          })
        : Promise.resolve({ status: 'none' } as const),
      duplicateValidatedTimesheet(this.timesheets.manager, {
        missionId: line.missionId,
        periodMonth,
        consultantId: line.consultantId,
      }),
    ])
    if (overlapping.status === 'unreadable' || duplicate.status === 'unreadable') {
      this.logger.error('lecture croisée illisible pour la relecture d’un relevé', {
        tags: { missionId: line.missionId },
      })
    }

    const checks = runTimesheetChecks({
      hasDeclaration: line.timesheetId !== null,
      days: line.days,
      expectedDays: line.expectedDays,
      consultantId: line.consultantId,
      overlappingMission: toCrossCheck(overlapping, value => value.missionLabel),
      duplicateValidated: toCrossCheck(duplicate, value => value.consultantName),
    })

    return {
      timesheetId: line.timesheetId,
      missionId: line.missionId,
      missionLabel: line.missionLabel,
      accountName: line.accountName,
      consultantId: line.consultantId,
      consultantName: line.consultantName,
      periodMonth: line.periodMonth,
      status: line.status,
      days: line.days,
      expectedDays: line.expectedDays,
      gap: line.gap,
      gapExplanation: line.gapExplanation,
      blocksInvoicing: line.blocksInvoicing,
      validatedByClientAt: line.validatedByClientAt,
      internalReviewedAt: line.internalReviewedAt,
      internalReviewedByName: line.internalReviewedByName,
      rejectedAt: line.rejectedAt,
      rejectionReason: line.rejectionReason,
      contestedDays: line.contestedDays,
      correctionDeadline: line.correctionDeadline,
      remindersSent: line.remindersSent,
      lastReminderAt: line.lastReminderAt,
      recordedAnomalies: line.anomalies,
      checks,
      recommendation: recommendTimesheetAction({
        status: line.status,
        validatedByClientAt: line.validatedByClientAt,
        checks,
      }),
    }
  }

  /**
   * Explique un écart. C'est le geste qui débloque la facturation d'un mois
   * dont l'écart est connu et normal — des congés, une mission partielle.
   *
   * Il n'EFFACE pas l'écart : le nombre reste affiché à côté de son explication.
   * Le masquer donnerait un mois qui a l'air juste alors qu'il ne l'est pas.
   */
  async explainGap(
    workspaceId: string,
    timesheetId: string,
    explanation: string,
  ): Promise<{ id: string; gapExplanation: string }> {
    const trimmed = explanation.trim()
    if (!trimmed)
      throw new BadRequestException('Une explication vide ne débloque rien — dis pourquoi l’écart est normal.')

    const rows = await this.timesheets.manager.query<{ id: string }[]>(
      `UPDATE mission_timesheets ts
          SET gap_explanation = $3, updated_at = now()
         FROM missions m
        WHERE ts.id = $1 AND m.id = ts.mission_id AND m.workspace_id = $2
      RETURNING ts.id`,
      [timesheetId, workspaceId, trimmed],
    )
    // `firstReturnedRow` : TypeORM rend `[lignes, nombre]` sur un UPDATE, donc
    // `rows[0]` était le TABLEAU des lignes — « truthy » même quand rien n'a
    // été touché, et dont chaque champ vaut `undefined`.
    const row = firstReturnedRow<{ id: string }>(rows)
    if (!row) throw new NotFoundException('Relevé introuvable dans cet espace.')
    return { id: row.id, gapExplanation: trimmed }
  }

  /**
   * Enregistre la validation du CLIENT.
   *
   * C'est elle, et pas la validation interne, qui autorise à facturer. Les
   * confondre ferait facturer sur un relevé que le client n'a jamais vu — et
   * c'est le litige qu'on découvre cinq mois plus tard.
   */
  async validateByClient(
    workspaceId: string,
    userId: string,
    timesheetId: string,
    at?: string,
  ): Promise<{ id: string; at: string }> {
    const when = at ? new Date(at) : new Date()

    const rows = await this.timesheets.manager.query<{ id: string }[]>(
      `UPDATE mission_timesheets ts
          SET validated_by_client_at = $3, validated_by = $4, status = 'validated', updated_at = now()
         FROM missions m
        WHERE ts.id = $1 AND m.id = ts.mission_id AND m.workspace_id = $2
          -- Un relevé contesté ne se valide pas d'un clic : le litige se résout
          -- d'abord, sinon la contestation disparaît sans avoir été traitée.
          AND ts.status <> 'disputed'
      RETURNING ts.id`,
      [timesheetId, workspaceId, when, userId],
    )
    const row = firstReturnedRow<{ id: string }>(rows)
    if (!row) {
      throw new NotFoundException('Relevé introuvable, ou en litige — un litige se résout avant de valider.')
    }
    return { id: row.id, at: when.toISOString() }
  }

  /**
   * #2415.6 — MARQUE un relevé « vérifié en interne ».
   *
   * Un geste SÉPARÉ de `validateByClient` : jusqu'ici, « relu en interne » et
   * « transmis au client » étaient le MÊME clic (`validateByClient` posait les
   * deux à la fois). Ce n'est ni un statut ni une validation — additif pur :
   * ne touche ni `status`, ni `validated_by_client_at`. Fenêtre tenue par
   * `timesheetDecisionLock.canReviewInternally` côté écran (relevé `submitted`,
   * pas déjà revu), mais le SERVEUR ne la revérifie pas ici — une revue tardive
   * ou répétée n'a pas d'effet nuisible (elle n'écrase que sa propre trace).
   */
  async reviewInternally(
    workspaceId: string,
    userId: string,
    timesheetId: string,
    at?: string,
  ): Promise<{ id: string; at: string }> {
    const when = at ? new Date(at) : new Date()

    const rows = await this.timesheets.manager.query<{ id: string }[]>(
      `UPDATE mission_timesheets ts
          SET internal_reviewed_at = $3, internal_reviewed_by = $4, updated_at = now()
         FROM missions m
        WHERE ts.id = $1 AND m.id = ts.mission_id AND m.workspace_id = $2
      RETURNING ts.id`,
      [timesheetId, workspaceId, when, userId],
    )
    const row = firstReturnedRow<{ id: string }>(rows)
    if (!row) {
      throw new NotFoundException('Relevé introuvable dans cet espace.')
    }
    return { id: row.id, at: when.toISOString() }
  }

  /**
   * REJETTE un relevé, avec un motif OBLIGATOIRE.
   *
   * Le geste ordinaire du 5 du mois — « ces jours ne correspondent pas,
   * redépose » — n'existait pas. On remettait la ligne en brouillon à la main,
   * sans trace, et trois mois plus tard personne ne savait pourquoi ce mois
   * avait fait un aller-retour. Le dépôt applique déjà la règle deux fois :
   * annuler un « facturé » exige un motif, fermer un besoin aussi.
   *
   * Le motif est exigé ICI, côté serveur, et pas seulement dans l'écran. Trois
   * remparts, du plus extérieur au plus intérieur :
   *  1. `rejectTimesheetSchema` refuse un corps sans `reason` ;
   *  2. ce `trim()` refuse « trois espaces », qui passe toute validation
   *     de présence mais ne dit rien à personne ;
   *  3. `mission_timesheets_rejection_reason_check` refuse en BASE une date de
   *     rejet sans motif — le dernier rempart, celui qu'aucun appelant ne
   *     contourne.
   *
   * Ce que le rejet ne fait PAS :
   *  - il n'efface rien. Les jours déclarés restent, le relevé reste. On
   *    archive, on ne supprime pas ;
   *  - il ne ferme aucune porte. `submitTimesheet` ne refuse que les relevés
   *    `validated` : un relevé rejeté se redépose, et repasse en `submitted`.
   *    Un rejet dont on ne peut pas sortir serait une impasse ;
   *  - il n'est pas un acte comptable. Le produit s'arrête à « prêt à
   *    facturer » : rejeter un relevé dit qu'on ne facturera pas ce mois en
   *    l'état, pas qu'un avoir a été émis.
   *
   * Un relevé DÉJÀ validé par le client ne se rejette pas d'un clic : la
   * validation client est ce qui autorise à facturer, et la défaire en silence
   * est exactement le litige qu'on découvre cinq mois plus tard. Le chemin pour
   * ce cas est le litige (`disputed`), qui existe déjà.
   */
  async reject(
    workspaceId: string,
    userId: string,
    timesheetId: string,
    reason: string,
    contestedDays: number,
    correctionDeadline: string,
  ): Promise<{
    id: string
    status: TimesheetStatus
    rejectedAt: string
    rejectionReason: string
    contestedDays: number
    correctionDeadline: string
  }> {
    const trimmed = reason.trim()
    if (!trimmed) {
      throw new BadRequestException(
        'Un rejet sans motif ne dit rien à personne — dis ce qui ne va pas, pour que le relevé puisse être corrigé.',
      )
    }
    // #2415.7 — la quantité contestée et la deadline sont REQUISES, comme le
    // motif : `rejectTimesheetSchema` les exige déjà, ce contrôle est le
    // dernier rempart si un appelant les contourne.
    if (!(contestedDays > 0)) {
      throw new BadRequestException('Un rejet sans quantité contestée ne dit pas COMBIEN de jours posent problème.')
    }

    const when = new Date()
    const rows = await this.timesheets.manager.query<{ id: string }[]>(
      `UPDATE mission_timesheets ts
          SET status = 'rejected', rejected_at = $3, rejection_reason = $4, rejected_by = $5,
              contested_days = $6, correction_deadline = $7, updated_at = now()
         FROM missions m
        WHERE ts.id = $1 AND m.id = ts.mission_id AND m.workspace_id = $2
          -- Un relevé validé par le CLIENT ne se rejette pas : c'est cette
          -- validation qui autorise à facturer, et la défaire d'un clic ferait
          -- disparaître un accord obtenu ailleurs. Le litige est le bon chemin.
          AND ts.validated_by_client_at IS NULL
          -- La quantité contestée ne peut pas dépasser les jours déclarés :
          -- contester PLUS que ce qui a été déposé ne veut rien dire.
          AND $6::numeric <= ts.days
      RETURNING ts.id`,
      [timesheetId, workspaceId, when, trimmed, userId, contestedDays, correctionDeadline],
    )
    // `firstReturnedRow` : TypeORM rend `[lignes, nombre]` sur un UPDATE, donc
    // `rows[0]` serait le TABLEAU — « truthy » même quand rien n'a bougé.
    const row = firstReturnedRow<{ id: string }>(rows)
    if (!row) {
      throw new NotFoundException(
        'Relevé introuvable dans cet espace, déjà validé par le client (ouvre un litige), ou la quantité contestée dépasse les jours déclarés.',
      )
    }
    return {
      id: row.id,
      status: 'rejected',
      rejectedAt: when.toISOString(),
      rejectionReason: trimmed,
      contestedDays,
      correctionDeadline,
    }
  }

  /**
   * #2196.31 — MARQUE un relevé « non applicable » : une EXCEPTION TRACÉE.
   *
   * `not_required` était entièrement dérivé du contrat, recalculé à chaque
   * lecture : l'écrire sur `mission_timesheets` aurait été écrasé. L'exception
   * vit dans `mission_timesheet_exceptions`, et `month()` la lit.
   *
   * Trois remparts pour le motif, comme le rejet : le DTO, ce `trim()`, la
   * contrainte `mission_timesheet_exceptions_reason_check`.
   *
   * La ligne est lue par le MÊME assemblage que l'écran (`month()`) : le
   * refus se décide sur ce que l'écran affiche, pas sur une requête qui
   * divergerait. Refusé : une maille inconnue (404), un relevé DÉPOSÉ ou un
   * mois qui n'attend déjà rien (`canMarkTimesheetNotApplicable`), un mois déjà
   * marqué.
   */
  async markNotApplicable(
    workspaceId: string,
    userId: string,
    input: { missionId: string; month: string; consultantId: string | null; reason: string },
    now: Date = new Date(),
  ): Promise<TimesheetExceptionTrace> {
    const reason = input.reason.trim()
    if (!reason) {
      throw new BadRequestException(
        'Une exception sans motif ne dit rien à personne — dis pourquoi ce mois n’attend pas de relevé.',
      )
    }
    const { items } = await this.month(workspaceId, { month: input.month, missionId: input.missionId }, now)
    const line = items.find(item => (item.consultantId ?? null) === (input.consultantId ?? null))
    if (!line) throw new NotFoundException('Relevé introuvable dans cet espace.')
    if (line.notApplicable) {
      throw new BadRequestException('Ce mois est déjà marqué non applicable — annule l’exception pour revenir.')
    }
    if (!canMarkTimesheetNotApplicable(line.status)) {
      throw new BadRequestException(
        line.status === 'not_required'
          ? 'Ce mois n’attend déjà aucun relevé : il n’y a rien à marquer.'
          : 'Un relevé déposé ne se marque pas non applicable — rejette-le ou valide-le.',
      )
    }

    const periodMonth = `${input.month}-01`
    const rows = await this.timesheets.manager.query<{ id: string; created_at: Date; account_id: string | null }[]>(
      `INSERT INTO mission_timesheet_exceptions (workspace_id, mission_id, consultant_id, period_month, reason, created_by)
       VALUES ($1, $2, $3, $4::date, $5, $6)
       RETURNING id, created_at, (SELECT account_id FROM missions WHERE id = $2) AS account_id`,
      [workspaceId, input.missionId, input.consultantId ?? null, periodMonth, reason, userId],
    )
    const row = rows[0]
    if (!row) throw new NotFoundException('Relevé introuvable dans cet espace.')
    return {
      id: row.id,
      missionId: input.missionId,
      missionLabel: line.missionLabel,
      accountId: row.account_id,
      periodMonth,
      reason,
      at: new Date(row.created_at).toISOString(),
    }
  }

  /**
   * #2196.31 — ANNULE une exception : elle est RÉVOQUÉE (date, auteur), jamais
   * supprimée. La ligne reste — on archive, on ne supprime pas — et la
   * déduction du contrat reprend à la lecture suivante.
   */
  async revokeNotApplicable(
    workspaceId: string,
    userId: string,
    exceptionId: string,
  ): Promise<TimesheetExceptionTrace> {
    const rows = await this.timesheets.manager.query<
      {
        id: string
        mission_id: string
        mission_label: string | null
        account_id: string | null
        period_month: string | Date
        reason: string
        revoked_at: Date
      }[]
    >(
      `UPDATE mission_timesheet_exceptions x
          SET revoked_at = now(), revoked_by = $3
         FROM missions m
        WHERE x.id = $1 AND x.workspace_id = $2 AND m.id = x.mission_id AND m.workspace_id = $2
          AND x.revoked_at IS NULL
      RETURNING x.id, x.mission_id, m.label AS mission_label, m.account_id, x.period_month, x.reason, x.revoked_at`,
      [exceptionId, workspaceId, userId],
    )
    // `firstReturnedRow` : TypeORM rend `[lignes, nombre]` sur un UPDATE.
    const row = firstReturnedRow<(typeof rows)[number]>(rows)
    if (!row) throw new NotFoundException('Exception introuvable dans cet espace, ou déjà annulée.')
    return {
      id: row.id,
      missionId: row.mission_id,
      missionLabel: row.mission_label,
      accountId: row.account_id,
      periodMonth:
        row.period_month instanceof Date ? row.period_month.toISOString().slice(0, 10) : String(row.period_month),
      reason: row.reason,
      at: new Date(row.revoked_at).toISOString(),
    }
  }

  /**
   * Ouvre les relevés ATTENDUS d'un mois — une ligne par mission×consultant.
   *
   * Les lignes ne naissaient que d'une saisie : un mois où personne ne dépose
   * n'existait nulle part, donc ne se relançait pas. Matérialiser rend le trou
   * visible.
   *
   * Idempotent par CLÉ (mission, consultant, mois), comme les routines : rejouer
   * ne crée pas de doublon, et rater une ouverture se répare — en créer deux
   * ferait deux relances au même consultant.
   */
  async openExpected(workspaceId: string, month: string): Promise<{ created: number }> {
    const periodMonth = `${month}-01`
    try {
      const rows = await this.timesheets.manager.query<{ id: string }[]>(
        `INSERT INTO mission_timesheets (mission_id, consultant_id, period_month, days, status, anomalies)
         SELECT m.id, asg.consultant_id, $2::date, 0, 'expected', '[]'::jsonb
           FROM missions m
           JOIN mission_assignments asg ON asg.mission_id = m.id
          WHERE m.workspace_id = $1
            AND m.contract_kind = 'regie'
            AND m.status IN ('active', 'onboarding')
            AND (m.started_on IS NULL OR m.started_on <= ($2::date + interval '1 month' - interval '1 day'))
            AND (m.ends_on IS NULL OR m.ends_on >= $2::date)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [workspaceId, periodMonth],
      )
      return { created: rows.length }
    } catch (err) {
      this.logger.error('openExpected error', { error: err })
      return { created: 0 }
    }
  }

  /**
   * Les relances DUES sur les relevés d'un mois — et par quel canal.
   *
   * Le service DIT lesquelles ; il n'en envoie aucune. Décider d'écrire à
   * quelqu'un reste un geste humain, et c'est la même frontière que sur les
   * relances de facturation.
   *
   * Le canal est une CONCLUSION tirée de ce qui est branché, pas un réglage :
   * proposer « brouillon » sur un canal qui n'a pas de brouillon ferait
   * attendre un envoi qui ne partirait jamais (§7).
   */
  async dueReminders(
    workspaceId: string,
    userId: string,
    month?: string,
    now: Date = new Date(),
  ): Promise<{
    channel: ResolvedChannel
    items: Array<{ line: TimesheetLine; index: number; overdueDays: number; tone: ReminderTone }>
  }> {
    const capabilities = await this.capabilities(workspaceId, userId)
    const channel = resolveChannel(capabilities)
    const { items } = await this.month(workspaceId, { month }, now)

    const due = items.flatMap(line => {
      // Un relevé arrivé, validé ou en litige ne se relance pas. Le litige
      // surtout : relancer quelqu'un qui conteste transforme un désaccord en
      // conflit.
      if (line.status !== 'expected' && line.status !== 'missing' && line.status !== 'draft') return []
      const overdueDays = daysSinceMonthEnd(line.periodMonth, now)
      if (overdueDays === null) return []
      const threshold = REMINDER_SCHEDULE_DAYS[line.remindersSent]
      if (threshold === undefined || overdueDays < threshold) return []
      const index = line.remindersSent + 1
      const tone = toneForReminder(index)
      // Au-delà de trois, le sujet remonte à un humain : le produit s'arrête.
      if (!tone) return []
      return [{ line, index, overdueDays, tone }]
    })
    if (due.length === 0) return { channel, items: due }

    // #2416.36 / #2416.38 — deux des cinq conditions d'arrêt automatique de la
    // collecte CRA : une mission SUSPENDUE (`paused`) ou une période ANNULÉE
    // (`cancelled`) n'attend plus de dépôt. `month()` les inclut quand même
    // (`m.status <> 'draft'` seulement) : sans ce filtre, une mission mise en
    // pause continuait de recevoir des relances comme si de rien n'était.
    // Jointure ÉTROITE, même patron que `dueEscalations` juste au-dessus :
    // une requête de plus, seulement pour les missions déjà dues.
    const missionIds = [...new Set(due.map(item => item.line.missionId))]
    const stopped = await this.timesheets.manager.query<{ id: string }[]>(
      `SELECT m.id FROM missions m WHERE m.id = ANY($1::uuid[]) AND m.workspace_id = $2 AND m.status IN ('paused', 'cancelled')`,
      [missionIds, workspaceId],
    )
    const stoppedIds = new Set(stopped.map(row => row.id))
    const afterMissionStatus = due.filter(item => !stoppedIds.has(item.line.missionId))
    if (afterMissionStatus.length === 0) return { channel, items: afterMissionStatus }

    // #2416.40 — « intervention manuelle » : un humain a déjà agi sur ce
    // relevé. La revue INTERNE (`internalReviewedAt`, #2415.6) EST ce geste —
    // continuer à relancer un relevé qu'un ops a déjà pris en main ferait
    // relancer un sujet déjà traité par un humain. Le champ voyage déjà sur
    // `TimesheetLine` : aucune requête supplémentaire.
    const afterManualIntervention = afterMissionStatus.filter(item => item.line.internalReviewedAt === null)
    if (afterManualIntervention.length === 0) return { channel, items: afterManualIntervention }

    // #2416.39 — « changement de contact » : le contact CRA de la mission a
    // changé depuis la PREMIÈRE relance de la période en cours. Jointure
    // ÉTROITE, même patron que les deux requêtes précédentes — uniquement les
    // relevés déjà dus, comparés à l'instantané posé par `recordReminder`.
    const timesheetIds = afterManualIntervention.map(item => item.line.timesheetId).filter((id): id is string => !!id)
    const contactChanged =
      timesheetIds.length === 0
        ? []
        : await this.timesheets.manager.query<{ id: string }[]>(
            `SELECT ts.id FROM mission_timesheets ts
               JOIN missions m ON m.id = ts.mission_id
              WHERE ts.id = ANY($1::uuid[]) AND m.workspace_id = $2
                AND ts.reminder_contact_id IS NOT NULL
                AND ts.reminder_contact_id IS DISTINCT FROM m.cra_contact_id`,
            [timesheetIds, workspaceId],
          )
    const contactChangedIds = new Set(contactChanged.map(row => row.id))
    return {
      channel,
      items: afterManualIntervention.filter(item => !contactChangedIds.has(item.line.timesheetId ?? '')),
    }
  }

  /**
   * #2416.37 — la CINQUIÈME condition d'arrêt : l'opt-out. Résout, pour
   * chaque relance candidate, le CONTACT CRA à qui elle s'adresse
   * réellement — son instantané figé s'il existe déjà (`reminder_contact_id`,
   * posé par `recordReminder`), sinon le contact CRA actuel de la mission
   * (relevé jamais encore relancé). Le CONSULTANT qui dépose n'est jamais un
   * « contact » au sens de la porte PERSONNE (interne, absent de `contacts`).
   *
   * Lecture PURE, bornée aux tables de ce module (`missions`,
   * `mission_timesheets`) : ce service ne consulte PAS `ContactStopService`
   * lui-même (§3.2, garde GA-07 — un service n'importe pas le service d'un
   * voisin). C'est au CONTRÔLEUR, qui compose déjà les deux modules,
   * d'interroger la porte PERSONNE avec les identifiants rendus ici.
   */
  async craContactIdsFor(
    workspaceId: string,
    items: ReadonlyArray<{ timesheetId: string | null; missionId: string }>,
  ): Promise<Map<string, string | null>> {
    const keyOf = (item: { timesheetId: string | null; missionId: string }) =>
      item.timesheetId ?? `mission:${item.missionId}`

    const withTs = items.filter((item): item is { timesheetId: string; missionId: string } => !!item.timesheetId)
    const withoutTs = items.filter(item => !item.timesheetId)

    const tsContactRows = withTs.length
      ? await this.timesheets.manager.query<{ id: string; contact_id: string | null }[]>(
          `SELECT ts.id, COALESCE(ts.reminder_contact_id, m.cra_contact_id) AS contact_id
             FROM mission_timesheets ts
             JOIN missions m ON m.id = ts.mission_id
            WHERE ts.id = ANY($1::uuid[]) AND m.workspace_id = $2`,
          [withTs.map(item => item.timesheetId), workspaceId],
        )
      : []
    const missionIdsWithoutTs = [...new Set(withoutTs.map(item => item.missionId))]
    const missionContactRows = missionIdsWithoutTs.length
      ? await this.timesheets.manager.query<{ id: string; contact_id: string | null }[]>(
          `SELECT id, cra_contact_id AS contact_id FROM missions WHERE id = ANY($1::uuid[]) AND workspace_id = $2`,
          [missionIdsWithoutTs, workspaceId],
        )
      : []

    const contactByTsId = new Map(tsContactRows.map(row => [row.id, row.contact_id]))
    const contactByMissionId = new Map(missionContactRows.map(row => [row.id, row.contact_id]))

    return new Map(
      items.map(item => [
        keyOf(item),
        item.timesheetId
          ? (contactByTsId.get(item.timesheetId) ?? null)
          : (contactByMissionId.get(item.missionId) ?? null),
      ]),
    )
  }

  /**
   * Les relevés ESCALADÉS (#2196.24) — et vers QUI le sujet remonte. Le
   * commentaire de `dueReminders` le disait déjà : « au-delà de trois, le
   * sujet remonte à un humain » — mais rien ne nommait cet humain.
   *
   * #2972 : le PORTEUR de la mission (`missions.owner_id`, « distinct du
   * créateur : c'est lui qu'on alerte », `mission.entity.ts`) est une donnée
   * déjà là. Même patron que `InvoiceReadinessService.dueReminders` /
   * `reminderDue.joinOwner` : le JOIN reste ÉTROIT — une requête de plus,
   * seulement pour les missions qui ont un relevé escaladé ce mois-ci — et le
   * service DIT qui prévenir, il ne prévient personne lui-même : c'est Laura
   * qui prépare, un humain agit.
   *
   * `ownerId`/`ownerName` restent `null` quand la mission n'a pas de porteur
   * déclaré — une fiche incomplète, jamais une raison d'en deviner un.
   *
   * #2972 (lot V20b) — le routage à 5 rôles reste écarté par doctrine (ADV et
   * partenaire n'ont toujours aucune colonne), mais le lot du 28/09 après-midi
   * a établi que le MANAGER CLIENT est une donnée réelle
   * (`missions.client_manager_contact_id` → `contacts`, #2836, déjà affichée
   * sur `MissionDossierPage`/`account-missions.service.ts`). Router
   * AUTOMATIQUEMENT dessus inventerait une règle métier non écrite (« qui,
   * pour quel `contract_kind` ? ») — ce que la doctrine interdit. SURFACER le
   * candidat, à côté du porteur, sans en choisir un, n'invente rien : les deux
   * champs voyagent, un humain choisit qui prévenir. Même repli `null` que le
   * porteur : un manager client non désigné ne se devine pas.
   *
   * #2972 (lot V20b) — le CANAL de l'escalade (le 3ᵉ des cinq champs #2416.52-57)
   * n'a pas de destinataire externe à relancer, mais la question « par quel
   * moyen Laura préparerait-elle le mot ? » a la même réponse que pour une
   * relance CRA : `resolveChannel(capabilities)` dit déjà ce qui est
   * RÉELLEMENT branché sur l'espace (brouillon mail, message d'équipe, tâche
   * CRM), une CONCLUSION tirée du réel, jamais un réglage choisi. Même
   * fonction, même repli honnête (`in_app`) — pas une seconde règle à
   * maintenir. Constant pour tout le lot (même espace, même appelant) :
   * calculé UNE fois, porté par chaque ligne.
   *
   * #2972 (lot V20b) — le DÉLAI de l'escalade (le 1er des cinq champs
   * #2416.52-57) : `daysSinceMonthEnd`, la MÊME fonction que `dueReminders`
   * utilise pour `overdueDays`, appliquée à `line.periodMonth`. Pas une
   * seconde règle : le nombre de jours écoulés depuis la fin de la période
   * ne dépend pas de savoir SI le relevé est dû ou déjà escaladé, seulement
   * de QUAND la période s'est terminée — la même dérivation vaut donc ici.
   */
  async dueEscalations(
    workspaceId: string,
    userId: string,
    month?: string,
    now: Date = new Date(),
  ): Promise<
    Array<{
      line: TimesheetLine
      ownerId: string | null
      ownerName: string | null
      clientManagerId: string | null
      clientManagerName: string | null
      advContactId: string | null
      advName: string | null
      partnerName: string | null
      level: number
      channel: ResolvedChannel
      delayDays: number | null
    }>
  > {
    const { items } = await this.month(workspaceId, { month, status: 'escalated' }, now)
    if (items.length === 0) return []

    const channel = resolveChannel(await this.capabilities(workspaceId, userId))
    const missionIds = [...new Set(items.map(line => line.missionId))]
    const owners = await this.timesheets.manager.query<
      {
        id: string
        owner_id: string | null
        owner_name: string | null
        owner_email: string | null
        client_manager_contact_id: string | null
        client_manager_name: string | null
        billing_contact_id: string | null
        billing_contact_name: string | null
      }[]
    >(
      `SELECT m.id, m.owner_id,
              NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS owner_name,
              p.email AS owner_email,
              m.client_manager_contact_id,
              c.full_name AS client_manager_name,
              m.billing_contact_id,
              b.full_name AS billing_contact_name
         FROM missions m
         LEFT JOIN profiles p ON p.user_id = m.owner_id
         LEFT JOIN contacts c ON c.id = m.client_manager_contact_id
         LEFT JOIN contacts b ON b.id = m.billing_contact_id
        WHERE m.id = ANY($1::uuid[])`,
      [missionIds],
    )
    const ownerByMission = new Map(owners.map(row => [row.id, row]))

    // #2972 — le PARTENAIRE : le compte partenaire DÉCLARÉ du consultant en
    // sous-traitance (`consultants.partner_account_id`, E-09). Une requête de
    // plus, ÉTROITE (les consultants des lignes escaladées), scopée à l'espace ;
    // un consultant salarié ou une ligne sans consultant n'a pas de partenaire.
    const consultantIds = [...new Set(items.map(line => line.consultantId).filter((id): id is string => Boolean(id)))]
    const partnerRows = consultantIds.length
      ? await this.timesheets.manager.query<{ consultant_id: string; partner_name: string | null }[]>(
          `SELECT c.id AS consultant_id, acc.company_name AS partner_name
             FROM consultants c
             JOIN accounts acc ON acc.id = c.partner_account_id
            WHERE c.id = ANY($1::uuid[]) AND c.workspace_id = $2`,
          [consultantIds, workspaceId],
        )
      : []
    const partnerByConsultant = new Map(partnerRows.map(row => [row.consultant_id, row.partner_name?.trim() || null]))

    return items.map(line => {
      const owner = ownerByMission.get(line.missionId)
      return {
        line,
        ownerId: owner?.owner_id ?? null,
        ownerName: (owner?.owner_name || owner?.owner_email) ?? null,
        clientManagerId: owner?.client_manager_contact_id ?? null,
        clientManagerName: owner?.client_manager_name?.trim() || null,
        // #2972 — l'ADV : le contact de FACTURATION de la mission (qui REÇOIT la
        // facture, distinct du contact CRA qui valide le relevé). Même repli
        // `null` : un contact non désigné ne se devine pas.
        advContactId: owner?.billing_contact_id ?? null,
        advName: owner?.billing_contact_name?.trim() || null,
        partnerName: line.consultantId ? (partnerByConsultant.get(line.consultantId) ?? null) : null,
        // #2972 — le NIVEAU : le nombre de relances envoyées AU-DELÀ du seuil
        // d'escalade (la 3ᵉ pose `escalated`, `recordReminder`) — 3ᵉ ⇒ 1, 4ᵉ ⇒ 2.
        // Un FAIT compté, pas une hiérarchie de destinataires inventée.
        level: Math.max(1, line.remindersSent - 2),
        channel,
        delayDays: daysSinceMonthEnd(line.periodMonth, now),
      }
    })
  }

  /**
   * Ce qui est réellement branché sur l'espace.
   *
   * Lu en SQL et non via les services des autres modules : c'est une lecture
   * d'état, et la règle §3.2 veut qu'un service n'aille pas chercher celui d'un
   * autre domaine. Une erreur ici rend « rien de branché » — le repli honnête,
   * qui produit une ligne dans l'app plutôt qu'une promesse d'envoi.
   */
  private async capabilities(workspaceId: string, userId: string): Promise<ReminderCapabilities> {
    try {
      const rows = await this.timesheets.manager.query<{ mailbox: boolean; chat: boolean; crm: boolean }[]>(
        // Une messagerie d'ÉQUIPE, pas « une intégration sortante quelconque ».
        // La table `integrations` couvre aussi le webhook générique : un espace
        // branché sur Zapier et sur rien d'autre se voyait proposer un canal de
        // messagerie d'équipe qu'il n'a pas (défaut trouvé en croisant le PDF 6).
        `SELECT
           EXISTS (SELECT 1 FROM google_connections WHERE user_id = $2)
             OR EXISTS (SELECT 1 FROM microsoft_connections WHERE user_id = $2) AS mailbox,
           EXISTS (
             SELECT 1 FROM integrations
              WHERE user_id = $2 AND enabled
                AND provider IN ('slack', 'discord', 'teams', 'googlechat', 'mattermost')
           ) AS chat,
           EXISTS (SELECT 1 FROM crm_connections WHERE workspace_id = $1) AS crm`,
        [workspaceId, userId],
      )
      const row = rows[0]
      // La capacité de BROUILLON, et non l'existence d'une connexion : un jeton
      // peut être valide sans accorder l'écriture. Annoncer « je créerai un
      // brouillon » sur une messagerie qui le refusera, c'est promettre avant le
      // clic exactement ce qui échouera après.
      const mailboxDraft = Boolean(row?.mailbox) && (await this.canDraft(userId))
      return {
        mailboxDraft,
        teamChat: Boolean(row?.chat),
        crmTask: Boolean(row?.crm),
      }
    } catch (err) {
      this.logger.error('reminder capabilities error', { error: err })
      return { mailboxDraft: false, teamChat: false, crmTask: false }
    }
  }

  /**
   * Le jeton accorde-t-il l'écriture d'un brouillon ?
   *
   * Lu depuis les portées réellement accordées, jamais depuis la présence d'une
   * ligne : c'est la portée qui décide, et elle peut avoir été refusée à la
   * connexion ou retirée depuis.
   */
  private async canDraft(userId: string): Promise<boolean> {
    const rows = await this.timesheets.manager.query<{ scope: string | null }[]>(
      `SELECT scope FROM google_connections WHERE user_id = $1
       UNION ALL
       SELECT scope FROM microsoft_connections WHERE user_id = $1`,
      [userId],
    )
    return rows.some(row => {
      const scopes = (row.scope ?? '').toLowerCase()
      // #2078.22.d — revue sécurité du lot K : la SEULE portée qui accorde la
      // capacité de brouillon Gmail est `GOOGLE_SCOPE.gmailCompose`, définie
      // une fois dans `google-config.ts` (GA-26). `gmail.modify` ouvre une
      // AUTRE capacité (classer, archiver — jamais composer), et
      // `https://mail.google.com/` n'est la portée d'AUCUNE capacité que ce
      // produit demande ou vérifie ailleurs : accepter l'une ou l'autre ici
      // aurait accordé un brouillon que le contrôle d'écriture de
      // `GoogleService.requireWriteAccess` refuse. Graph : `Mail.ReadWrite`.
      return scopes.includes(GOOGLE_SCOPE.gmailCompose.toLowerCase()) || scopes.includes('mail.readwrite')
    })
  }

  /**
   * Enregistre qu'une relance est PARTIE. Le compteur est la seule chose qui
   * empêche d'en envoyer une quatrième.
   *
   * #2196.24 — la TROISIÈME relance pose aussi `escalated` : `dueReminders`
   * dit depuis le début « au-delà de trois, le sujet remonte à un humain »,
   * et rien ne posait cette conclusion nulle part. Le seuil est calculé dans
   * la MÊME écriture atomique (`reminders_sent + 1 >= 3`), pas après une
   * lecture séparée — sinon deux relances enregistrées à la même seconde
   * pourraient toutes deux se croire la troisième. La garde de statut
   * (`status IN ('expected', 'missing', 'draft')`) protège les relevés déjà
   * soumis, validés, contestés ou rejetés : une relance enregistrée par
   * erreur sur l'un d'eux ne doit RIEN changer à son statut.
   */
  async recordReminder(workspaceId: string, timesheetId: string): Promise<{ remindersSent: number }> {
    const rows = await this.timesheets.manager.query<{ reminders_sent: number }[]>(
      `UPDATE mission_timesheets ts
          SET reminders_sent = ts.reminders_sent + 1, last_reminder_at = now(), updated_at = now(),
              status = CASE
                WHEN ts.reminders_sent + 1 >= 3 AND ts.status IN ('expected', 'missing', 'draft')
                  THEN 'escalated'
                ELSE ts.status
              END,
              -- #2416.39 — l'instantané du contact CRA, posé une seule fois : à
              -- la PREMIÈRE relance de la période (reminder_contact_id encore
              -- NULL). Les relances suivantes ne le rafraîchissent pas — c'est
              -- justement l'écart avec la valeur ACTUELLE que dueReminders
              -- doit pouvoir constater.
              reminder_contact_id = COALESCE(ts.reminder_contact_id, m.cra_contact_id)
         FROM missions m
        WHERE ts.id = $1 AND m.id = ts.mission_id AND m.workspace_id = $2
      RETURNING ts.reminders_sent`,
      [timesheetId, workspaceId],
    )
    const row = firstReturnedRow<{ reminders_sent: number }>(rows)
    if (!row) throw new NotFoundException('Relevé introuvable dans cet espace.')
    return { remindersSent: row.reminders_sent }
  }

  /** Une mission attend-elle un relevé ? Réexporté pour l'appelant qui n'a que
   *  la nature du contrat sous la main. */
  static expects(kind: ContractKind): boolean {
    return expectsTimesheet(kind)
  }
}

/**
 * Une lecture croisée, traduite en ce que le contrôle attend.
 *
 * Les trois issues se transportent sans se perdre — et surtout `unreadable`,
 * dont tout l'intérêt est de ne PAS se confondre avec « rien trouvé ». Le nom de
 * ce qui a été croisé est extrait par l'appelant, parce que ce n'est pas le même
 * champ selon le contrôle.
 */
function toCrossCheck<T>(outcome: CrossCheckOutcome<T>, subjectOf: (value: T) => string | null): TimesheetCrossCheck {
  if (outcome.status === 'unreadable') return { status: 'unreadable' }
  if (outcome.status === 'none') return { status: 'none' }
  return { status: 'found', subject: subjectOf(outcome.value) }
}

/**
 * Depuis combien de jours le mois est-il fini ?
 *
 * Les relances se comptent APRÈS le mois, jamais pendant : un relevé de
 * septembre ne se relance pas le 6 septembre.
 */
function daysSinceMonthEnd(periodMonth: string, now: Date): number | null {
  const start = Date.parse(`${periodMonth.slice(0, 7)}-01T00:00:00Z`)
  if (Number.isNaN(start)) return null
  const monthEnd = new Date(start)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)
  return Math.floor((now.getTime() - monthEnd.getTime()) / 86_400_000)
}

/** Le mois précédent, en `YYYY-MM`. */
function previousMonth(now: Date): string {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return cursor.toISOString().slice(0, 7)
}

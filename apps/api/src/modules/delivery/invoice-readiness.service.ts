import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  type BillingCadence,
  assessInvoiceReadiness,
  canMarkTimesheetNotApplicable,
  dayGap,
  isInvoicedState,
  invoicingNeedsTimesheet,
  legalContractCoverage,
  milestonesDueInMonthCents,
  prorateRetainerCents,
  redactFinance,
  reminderDue,
  summarizeReadiness,
  type ContractKind,
  type LegalContract,
  type TimesheetStatus,
  type InvoiceBlocker,
  type InvoiceReadiness,
  type InvoiceReadinessQuery,
  type ReadinessSummary,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { recordAttachedPayment } from './invoice-payments.service'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { asDay } from '../../common/day'
import { ownerDisplayName } from './owner-display-name'

type MonthRow = {
  mission_id: string
  mission_label: string | null
  account_name: string | null
  /**
   * `a.id`, sélectionné par le `LEFT JOIN accounts a` juste en dessous
   * (30/08/2026, §9). `null` quand la mission n'a pas de compte — le JOIN est
   * un LEFT JOIN, pas un INNER : ce cas existe et n'est pas une erreur.
   */
  account_id: string | null
  daily_rate: string | number | null
  requires_po: boolean | null
  po_number: string | null
  billing_cadence: string | null
  /** Le coût CHARGÉ (D43) — `mission_commercial_terms.loaded_daily_cost_cents`,
   *  un `bigint` que pg rend en CHAÎNE. Distinct du TJM vendu (`daily_rate`),
   *  déjà lu deux lignes plus haut. */
  loaded_daily_cost_cents: string | number | null
  ts_status: string | null
  ts_days: string | number | null
  ts_anomalies: string[] | null
  ts_expected: string | number | null
  ts_explanation: string | null
  contract_kind: string | null
  billing_contact_id: string | null
  started_on: string | Date | null
  invoiced_at: Date | null
  /** #2197.41 — QUI a marqué le mois facturé (`markInvoiced`), résolu en nom
   *  par le `LEFT JOIN profiles d` juste en dessous. `null` = jamais déclaré,
   *  ou déclaré avant que la colonne ne soit rendue. */
  invoiced_by: string | null
  declarer_first_name: string | null
  declarer_last_name: string | null
  declarer_email: string | null
  invoice_reference: string | null
  invoiced_amount_cents: string | number | null
  due_on: string | Date | null
  reminders_sent: number | null
  last_reminder_at: Date | null
  /**
   * #2419.8 — LA PREUVE DU CONNECTEUR sur la DERNIÈRE relance, s'il y en a une.
   *
   * ⚠️ Cette colonne n'est écrite NULLE PART aujourd'hui : `recordReminder`
   * consigne un geste déclaratif humain (doctrine `c31_relance_encaissement`,
   * « rien ne part tout seul »), jamais un envoi réel — aucun connecteur de
   * messagerie n'atteint cet écran. Elle reste donc TOUJOURS `null`, et c'est
   * la vérité : « Fait ne porte jamais de preuve d'envoi » tant qu'aucune
   * capacité de messagerie n'est branchée ici. `?:` pour le deploy-skew, comme
   * `not_applicable`/`ends_on` juste en dessous — une ligne écrite avant cette
   * migration n'a pas la colonne.
   */
  last_reminder_message_id?: string | null
  paid_at: Date | null
  paid_amount_cents: string | number | null
  disputed_at: Date | null
  dispute_reason: string | null
  dispute_resolved_at: Date | null
  /** `mission_commercial_terms.channel` (30/08/2026, §9 de ce lot) — la
   *  facture ENTRANTE d'un sous-traitant n'est attendue que sur ce canal. */
  channel: string | null
  /** `true` dès qu'AU MOINS une facture fournisseur date de ce mois — voir la
   *  jointure LATERAL juste en dessous. `null`/`undefined` jamais rendu par
   *  cette colonne : `EXISTS (...)` répond toujours par un booléen. */
  supplier_invoice_received: boolean | null
  /** #2196.31 — une exception « non applicable » ACTIVE couvre ce mois. */
  not_applicable?: boolean | null
  /** #2566.2 — la date jusqu'à laquelle le bon de commande COUVRE. */
  po_valid_until: string | Date | null
  /** #2563 — jours SAISIS sans CRA et N° de BC du mois (`mission_month_preparations`).
   *  Optionnels : un faux qui ne les nomme pas lit « rien de saisi ». */
  prep_manual_days?: string | number | null
  prep_po_number?: string | null
  /** #2566.2 — le CHARGÉ D'AFFAIRES (`missions.owner_id`), et son nom résolu
   *  par le `LEFT JOIN profiles` juste en dessous. */
  owner_id: string | null
  owner_first_name: string | null
  owner_last_name: string | null
  owner_email: string | null
  /** #2417.3/.4 — la fin de mission, les jalons vivants et le retainer DÉCLARÉS
   *  (`mission_billing_declarations`, decisions §8). Optionnels : un faux de
   *  test qui ne les nomme pas lit « rien de déclaré ». */
  ends_on?: string | Date | null
  declared_milestones?: { dueOn: string; amountCents: number | string }[] | null
  retainer_monthly_cents?: string | number | null
  /** #2198.20 — l'INTERLOCUTEUR de facturation, résolu en nom par le
   *  `LEFT JOIN contacts` juste en dessous. `null` = aucun contact saisi. */
  billing_contact_name?: string | null
  /** #2197.9 — LA SOCIÉTÉ DE L'ESN qui émettrait, résolue en nom par le
   *  `LEFT JOIN legal_entities` juste en dessous. `null` = `missions.
   *  legal_entity_id` est vide, une fiche incomplète et non une raison d'en
   *  deviner une. Optionnel, même raison que `billing_contact_name`. */
  legal_entity_name?: string | null
  /** #2197.9, brute cette fois (`m.legal_entity_id`) — nécessaire pour
   *  #2422.9 (`legalContractCoverage`) : la seule correspondance vérifiable
   *  entre une mission et un contrat de l'espace est PAR SOCIÉTÉ, jamais un
   *  nom déjà résolu. */
  legal_entity_id?: string | null
  /** #2422.9 — les contrats de l'espace qui partagent la société de cette
   *  mission (même compte), résolus par la LATERAL juste en dessous. `null`
   *  quand `legal_entity_id` est vide : aucune comparaison possible. */
  matched_contracts?: { status: string; startsOn: string | null; endsOn: string | null }[] | null
}

/**
 * REVENUE PROTECTION — ce qui empêche de facturer, mois par mois.
 *
 * Le service ne produit AUCUNE facture (arbitrage Louis) : il produit la liste
 * des bloqueurs et un montant préparatoire, nommé comme tel partout.
 *
 * Deux décisions de conception :
 *
 * 1. **L'état est RECALCULÉ à chaque lecture**, jamais lu depuis la table. Un
 *    CRA validé ce matin doit sortir des bloqueurs ce matin — un état figé
 *    ferait relancer sur un problème déjà réglé, et c'est le genre de relance
 *    qui fait cesser de lire les relances.
 * 2. **La table ne garde que ce qui ne se recalcule pas** : le compteur de
 *    relances, la date de la dernière, et le fait qu'un mois a été facturé
 *    ailleurs. Tout le reste se déduit.
 */
@Injectable()
export class InvoiceReadinessService {
  private readonly logger = new Logger(InvoiceReadinessService.name)

  // L'espace de travail arrive du CONTRÔLEUR, résolu là-bas : la règle §3.2
  // interdit à un service d'aller chercher le service d'un autre module, et le
  // contrôleur est la couche où un geste utilisateur traverse deux domaines.
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly readiness: Repository<InvoiceReadinessEntity>,
  ) {}

  /**
   * L'état de facturabilité d'un mois, mission par mission.
   *
   * Le mois par défaut est le PRÉCÉDENT : le 5 du mois, la question n'est pas
   * « où en est le mois en cours » — il n'est pas fini — mais « qu'est-ce qui
   * bloque encore le mois qu'on devrait avoir facturé ».
   *
   * ⚠️ `canReadFinance` est OBLIGATOIRE, et il n'a pas de valeur par défaut.
   *
   * Les montants sortaient BRUTS. Cette liste est servie par
   * `GET /delivery/invoice-readiness` — une route sans permission déclarée, donc
   * ouverte à tout membre authentifié, `viewer` et `recruiter` compris — ET
   * relayée au copilote. Le montant préparé, facturé et encaissé de chaque mois
   * sortait donc à tout l'espace, pendant que les mêmes chiffres sont gardés par
   * `finance:read` sur `/delivery/finance/revenue`.
   *
   * Un défaut obligatoire plutôt qu'un `= false` : un appelant qui oublie le
   * drapeau doit être refusé par le compilateur, pas silencieusement servi.
   *
   * ⚠️ Ce qui se garde est l'ARGENT du mois, jamais le TJM ni les BLOQUEURS :
   * la liste reste entièrement lisible sans droit financier, parce que
   * « relevé manquant » et « pas de bon de commande » sont le geste d'un
   * gestionnaire de delivery, pas d'un comptable.
   */
  async list(
    workspaceId: string,
    query: InvoiceReadinessQuery,
    options: { canReadFinance: boolean },
    now: Date = new Date(),
  ): Promise<{
    items: InvoiceReadiness[]
    summary: ReadinessSummary
    month: string
    canReadFinance: boolean
  }> {
    const month = query.month ?? previousMonth(now)
    const periodMonth = `${month}-01`

    const rows = await this.readiness.manager.query<MonthRow[]>(
      `SELECT m.id AS mission_id, m.label AS mission_label, a.company_name AS account_name, a.id AS account_id,
              m.daily_rate, t.requires_po, t.po_number, t.billing_cadence, t.loaded_daily_cost_cents, t.channel,
              t.po_valid_until,
              -- #2563 — le mois PRÉPARÉ : jours saisis sans CRA, N° de BC du mois.
              prep.manual_days AS prep_manual_days, prep.po_number AS prep_po_number,
              m.contract_kind, m.billing_contact_id, m.started_on, m.owner_id,
              p.first_name AS owner_first_name, p.last_name AS owner_last_name, p.email AS owner_email,
              ts.status AS ts_status, ts.days AS ts_days, ts.anomalies AS ts_anomalies,
              ts.expected_days AS ts_expected, ts.gap_explanation AS ts_explanation,
              r.invoiced_at, r.invoice_reference, r.invoiced_amount_cents, r.due_on,
              r.reminders_sent, r.last_reminder_at, r.last_reminder_message_id, r.paid_at, r.paid_amount_cents,
              r.disputed_at, r.dispute_reason, r.dispute_resolved_at,
              -- #2197.41 : QUI a déclaré ce mois facturé. La colonne existait
              -- depuis l origine (markInvoiced) et n était jamais rendue.
              r.invoiced_by,
              d.first_name AS declarer_first_name, d.last_name AS declarer_last_name, d.email AS declarer_email,
              si.received AS supplier_invoice_received,
              na.excepted AS not_applicable,
              -- #2417.3/.4 — les montants DÉCLARÉS au contrat (decisions §8) :
              -- les jalons vivants de la mission, et le retainer mensuel.
              -- Le calcul (mois échu, prorata) vit dans billing-declarations.ts.
              m.ends_on,
              (SELECT json_agg(json_build_object('dueOn', ms.due_on::text, 'amountCents', ms.amount_cents))
                 FROM mission_milestones ms
                WHERE ms.mission_id = m.id AND ms.workspace_id = m.workspace_id AND ms.archived_at IS NULL
              ) AS declared_milestones,
              bd.retainer_monthly_cents,
              -- #2198.20 — l'INTERLOCUTEUR de facturation, résolu en nom.
              c.full_name AS billing_contact_name,
              -- #2197.9 — LA SOCIÉTÉ DE L'ESN qui émettrait, résolue en nom.
              -- legal_entities porte les sociétés qui ÉMETTENT, jamais à
              -- confondre avec account_entities (celles du CLIENT, qui
              -- REÇOIVENT — voir la note en tête du fichier web
              -- legal-entities/api.ts).
              le.name AS legal_entity_name,
              -- #2422.9 — la société BRUTE de la mission, pour la LATERAL
              -- juste en dessous (jamais le nom déjà résolu ci-dessus).
              m.legal_entity_id,
              lcc.matched_contracts
         FROM missions m
         LEFT JOIN accounts a ON a.id = m.account_id
         LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
         LEFT JOIN mission_month_preparations prep ON prep.mission_id = m.id AND prep.period_month = $2
         LEFT JOIN mission_billing_declarations bd ON bd.mission_id = m.id AND bd.workspace_id = m.workspace_id
         LEFT JOIN legal_entities le ON le.id = m.legal_entity_id
         -- #2566.2 — le CHARGÉ D'AFFAIRES, à qui remonte le blocage « bon de
         -- commande » : même JOIN étroit que delivery.service.ts (ownersOf),
         -- une seule table, jamais un montant derrière.
         LEFT JOIN profiles p ON p.user_id = m.owner_id
         -- #2198.20 — le contact de facturation : billing_contact_id est un
         -- FK direct vers contacts.id, déjà scopé à l'espace via m. Un LEFT
         -- JOIN, jamais un INNER : la mission existe sans lui (c'est
         -- justement le bloqueur missing_billing_contact).
         LEFT JOIN contacts c ON c.id = m.billing_contact_id
         LEFT JOIN mission_timesheets ts ON ts.mission_id = m.id AND ts.period_month = $2
         LEFT JOIN invoice_readiness r ON r.mission_id = m.id AND r.period_month = $2
         -- #2197.41 : le déclarant, résolu en nom, alias d DISTINCT de
         -- l alias p du propriétaire : les deux profils sont indépendants.
         LEFT JOIN profiles d ON d.user_id = r.invoiced_by
         -- La facture ENTRANTE d'un sous-traitant sur CE mois (30/08/2026,
         -- §9 de ce lot) - distincte de invoice_readiness ci-dessus, qui
         -- reste la facturation CLIENT. LATERAL + EXISTS plutot qu'un
         -- second LEFT JOIN direct sur supplier_invoices : une mission peut
         -- porter PLUSIEURS factures fournisseur sur le meme mois, et un JOIN
         -- direct dupliquerait la ligne - exactement le defaut de comptage
         -- qu'une jointure qui multiplie produit ailleurs dans ce depot.
         LEFT JOIN LATERAL (
           SELECT EXISTS (
             SELECT 1 FROM supplier_invoices si2
              WHERE si2.mission_id = m.id
                AND si2.invoice_date >= $2::date
                AND si2.invoice_date < ($2::date + interval '1 month')
           ) AS received
         ) si ON true
         -- #2196.31 — les exceptions « non applicable » VIVANTES de ce mois.
         -- Un relevé joint : celle de SON consultant. Rien de joint : il faut
         -- que CHAQUE consultant affecté ce mois-là soit excepté — une
         -- exception posée pour un seul ne lève jamais le « relevé manquant »
         -- d'un autre (défaut conservateur : on ne débloque pas par défaut).
         LEFT JOIN LATERAL (
           SELECT (
             SELECT count(*) FROM mission_timesheet_exceptions x
              WHERE x.mission_id = m.id
                AND x.period_month = $2::date
                AND x.revoked_at IS NULL
                AND (ts.id IS NULL OR x.consultant_id IS NOT DISTINCT FROM ts.consultant_id)
           ) >= CASE
                  WHEN ts.id IS NOT NULL THEN 1
                  ELSE GREATEST(1, (
                    SELECT count(*) FROM mission_assignments asg
                     WHERE asg.mission_id = m.id
                       AND (asg.ends_on IS NULL OR asg.ends_on >= $2::date)
                       AND asg.starts_on <= ($2::date + interval '1 month' - interval '1 day')
                  ))
                END AS excepted
         ) na ON true
         -- #2422.9 (épopée #2869) — les contrats de l'espace qui PARTAGENT la
         -- société de cette mission, même compte, même correspondance que le
         -- NO-GO (#2422.11, LegalContractService.list) : legal_contracts
         -- n'a toujours aucune colonne qui nomme LA mission qu'il couvre,
         -- c'est le seul lien vérifiable. NULL quand la mission n'a pas de
         -- société connue : legalContractCoverage (côté TS) ne bloque
         -- jamais sur une comparaison qu'on ne peut pas faire.
         LEFT JOIN LATERAL (
           SELECT json_agg(
                    json_build_object('status', lc.status, 'startsOn', lc.starts_on::text, 'endsOn', lc.ends_on::text)
                  ) AS matched_contracts
             FROM legal_contracts lc
            WHERE lc.workspace_id = m.workspace_id
              AND lc.account_id = m.account_id
              AND lc.legal_entity_id = m.legal_entity_id
         ) lcc ON m.legal_entity_id IS NOT NULL
        WHERE m.workspace_id = $1
          AND m.status <> 'draft'
          -- Une mission qui n'avait pas commencé, ou déjà finie avant le mois,
          -- n'a rien à facturer dessus. L'y inclure noierait la vue sous des
          -- bloqueurs qui n'en sont pas.
          AND (m.started_on IS NULL OR m.started_on <= ($2::date + interval '1 month' - interval '1 day'))
          AND (m.ends_on IS NULL OR m.ends_on >= $2::date)
          -- Le pendant de TimesheetsService.month (même forme de clause) : la
          -- fiche d'une mission resserre sur SA mission ; absent, le mois entier
          -- part comme avant.
          AND ($3::uuid IS NULL OR m.id = $3::uuid)
        ORDER BY a.company_name NULLS LAST, m.label`,
      [workspaceId, periodMonth, query.missionId ?? null],
    )

    const items = rows.map(row => {
      const kind = (row.contract_kind as ContractKind | null) ?? 'inconnu'
      const declared = row.ts_days === null ? null : Number(row.ts_days)
      const expected = row.ts_expected === null ? null : Number(row.ts_expected)
      // Le TJM d'une mission est en EUROS ; tout le reste du module compte en
      // CENTIMES. Converti ici, une fois — et exposé sur la ligne (#2563.1) :
      // le client demande explicitement à le VOIR sur la préparation.
      const dailyRateCents = row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100)
      // #2196.31 — l'exception PRIME sur la déduction, jamais sur un relevé
      // déposé : même règle que `buildTimesheetLine` (`canMarkTimesheetNotApplicable`).
      const excepted =
        row.not_applicable === true &&
        (row.ts_status === null || canMarkTimesheetNotApplicable(row.ts_status as TimesheetStatus))
      // #2563 — des jours SAISIS sans CRA débloquent un mois SANS relevé. Jamais
      // à la place d'un relevé déposé (il prime), jamais sur une exception
      // « non applicable ». La source est nommée sur la ligne (`daysSource`).
      const manualDays =
        row.prep_manual_days === null || row.prep_manual_days === undefined ? null : Number(row.prep_manual_days)
      const noReport = !row.ts_status || row.ts_status === 'expected' || row.ts_status === 'missing'
      const useManualDays = !excepted && manualDays !== null && noReport
      const assessment = assessInvoiceReadiness({
        timesheet: excepted
          ? { status: 'not_required', days: 0, anomalies: [], gap: null, gapExplanation: null }
          : useManualDays
            ? { status: 'validated', days: manualDays, anomalies: [], gap: null, gapExplanation: null }
            : row.ts_status
              ? {
                  status: row.ts_status as TimesheetStatus,
                  days: declared ?? 0,
                  anomalies: row.ts_anomalies ?? [],
                  gap: dayGap(declared, expected),
                  gapExplanation: row.ts_explanation,
                }
              : null,
        dailyRateCents,
        requiresPo: Boolean(row.requires_po),
        poNumber: row.prep_po_number ?? row.po_number,
        invoicedAt: row.invoiced_at ? new Date(row.invoiced_at).toISOString() : null,
        billingContactId: row.billing_contact_id,
        // #2566.2 — le mois FACTURÉ et l'échéance du bon de commande, pour que
        // `po_period_mismatch` puisse se déclencher.
        periodMonth,
        poValidUntil: asDay(row.po_valid_until),
        // Le coût CHARGÉ, en CENTIMES — jamais `undefined` : cette requête le
        // LIT toujours, donc l'appelant SAIT (contrairement à un ancien appel
        // qui ne posait pas encore la question). `null` = personne ne l'a
        // saisi ; `0` = saisi, et légitimement nul. `loadedCostCents` tient
        // les deux séparés.
        chargedCostCents: loadedCostCents(row.loaded_daily_cost_cents),
        startedOn: asDay(row.started_on),
        // #2422.9 — la policy que le contrat encode (voir la LATERAL
        // `lcc` ci-dessus) : `undefined` sans société connue, ou sans aucun
        // contrat qui la partage — jamais une exigence universelle codée en
        // dur.
        legalContractCoverage: row.legal_entity_id
          ? legalContractCoverage(
              { legalEntityId: row.legal_entity_id },
              (row.matched_contracts ?? []).map(c => ({
                legalEntityId: row.legal_entity_id as string,
                status: c.status as LegalContract['status'],
                startsOn: c.startsOn,
                endsOn: c.endsOn,
              })),
              now,
            )
          : undefined,
        // Un forfait ne se juge pas sur des jours : lui réclamer un relevé
        // produirait un bloqueur permanent que personne ne peut lever. Une
        // nature INCONNUE, elle, garde ses contrôles : « prêt à facturer » sans
        // relevé ferait facturer un montant que rien n'appuie.
        expectsTimesheet: invoicingNeedsTimesheet(kind),
        // La cadence était SAISIE, STOCKÉE et AFFICHÉE sur la fiche mission
        // depuis des mois — et ce calcul ne la lisait pas. Une mission au jalon
        // ou au forfait passait donc l'écran mensuel comme une régie : « prête
        // à facturer », tous les mois. Une cadence absente garde le
        // comportement d'avant : on ne devine pas.
        billingCadence: (row.billing_cadence as BillingCadence | null) ?? null,
        // #2417.3 / #2417.4 — le montant DÉCLARÉ au contrat pour ce mois : les
        // jalons échus d'abord, sinon le retainer au prorata des jours ouvrés.
        declaredAmountCents:
          milestonesDueInMonthCents(
            (row.declared_milestones ?? []).map(m => ({ dueOn: m.dueOn, amountCents: Number(m.amountCents) })),
            periodMonth,
          ) ??
          prorateRetainerCents(
            row.retainer_monthly_cents === null || row.retainer_monthly_cents === undefined
              ? null
              : Number(row.retainer_monthly_cents),
            periodMonth,
            asDay(row.started_on),
            asDay(row.ends_on),
          ),
      })

      return {
        missionId: row.mission_id,
        missionLabel: row.mission_label,
        accountName: row.account_name,
        accountId: row.account_id,
        periodMonth,
        state: assessment.state,
        blockers: assessment.blockers,
        days: assessment.days,
        daysSource: useManualDays
          ? ('manual' as const)
          : assessment.days !== null && row.ts_status
            ? ('cra' as const)
            : null,
        preparedAmountCents: assessment.preparedAmountCents,
        invoicedAt: row.invoiced_at ? new Date(row.invoiced_at).toISOString() : null,
        // #2197.41 — le nom du déclarant, SEULEMENT sur une ligne DÉCLARÉE :
        // une ligne prouvée par le connecteur n'a pas à porter cette mention,
        // et une ligne sans déclaration n'a personne à nommer.
        invoicedByName:
          assessment.state === 'invoiced_declared'
            ? ownerDisplayName(row.declarer_first_name, row.declarer_last_name, row.declarer_email)
            : null,
        invoiceReference: row.invoice_reference,
        invoicedAmountCents: row.invoiced_amount_cents === null ? null : Number(row.invoiced_amount_cents),
        // Un JOUR, jamais un horodatage : le contrat annonce `YYYY-MM-DD`, et
        // l'API rendait « 2026-08-25T00:00:00.000Z » — donc la veille pour tout
        // lecteur à l'ouest de Greenwich.
        dueOn: asDay(row.due_on),
        remindersSent: row.reminders_sent ?? 0,
        lastReminderAt: row.last_reminder_at ? new Date(row.last_reminder_at).toISOString() : null,
        // #2419.8 — TOUJOURS `null` aujourd'hui (voir `MonthRow.last_reminder_message_id`) :
        // aucun connecteur n'écrit cette colonne, `recordReminder` consigne un
        // geste humain déclaratif. `?? null` couvre aussi le deploy-skew.
        lastReminderMessageId: row.last_reminder_message_id ?? null,
        // L'encaissement (I-77). Ces deux colonnes étaient écrites par une
        // route et lues par le chiffre d'affaires — jamais rendues à l'écran,
        // qui ne pouvait donc pas distinguer « facturé » de « payé ».
        paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
        paidAmountCents: row.paid_amount_cents === null ? null : Number(row.paid_amount_cents),
        // Le LITIGE (BEL-MIS-011). Sans ces trois champs à l'écran, une facture
        // contestée est indiscernable d'une facture en retard — or l'une se
        // relance et l'autre se discute.
        disputedAt: row.disputed_at ? new Date(row.disputed_at).toISOString() : null,
        disputeReason: row.dispute_reason,
        disputeResolvedAt: row.dispute_resolved_at ? new Date(row.dispute_resolved_at).toISOString() : null,
        // La facture fournisseur (30/08/2026, §9) : NON gardée par
        // `canReadFinance`. Elle ne porte aucun montant, seulement un statut
        // — la même distinction que les BLOQUEURS juste au-dessus, lisibles
        // par tout gestionnaire de delivery, jamais l'argent qu'ils cachent.
        supplierInvoiceStatus:
          row.channel === 'subcontracting' ? (row.supplier_invoice_received ? 'received' : 'missing') : null,
        // #2563.1 — le TJM et la référence PO, pour la préparation affichée.
        dailyRateCents,
        poNumber: row.prep_po_number ?? row.po_number,
        // #2566.2 — le CHARGÉ D'AFFAIRES, à qui remonte le blocage « bon de
        // commande ». `null` sur les deux champs = pas de porteur déclaré, une
        // fiche incomplète et non une raison d'en deviner un.
        ownerId: row.owner_id,
        ownerName: ownerDisplayName(row.owner_first_name, row.owner_last_name, row.owner_email),
        // #2198.20 — l'INTERLOCUTEUR de facturation, pour l'écran des
        // encaissements : QUI appeler avant de relancer dans le vide.
        billingContactName: row.billing_contact_name ?? null,
        // #2197.9 — LA SOCIÉTÉ DE L'ESN qui émettrait, pour la colonne
        // « Société facturante » de `/missions/facturation`.
        legalEntityName: row.legal_entity_name ?? null,
      } satisfies InvoiceReadiness
    })

    const filtered = query.blockedOnly ? items.filter(item => item.state === 'blocked') : items
    // Le résumé porte sur TOUT le mois, pas sur la liste filtrée : le calculer
    // sur « bloqués seulement » afficherait « 0 prêt » alors que dix le sont.
    //
    // ⚠️ Le résumé est calculé sur les lignes AVANT rédaction, puis rédigé à son
    // tour. L'ordre compte : sommer des montants déjà mis à `null` rendrait
    // `0`, c'est-à-dire précisément le chiffre faux que la rédaction existe pour
    // éviter — et il aurait l'air d'un vrai total.
    const summary = summarizeReadiness(items)
    // #2197.6 — « Factures préparées » : `invoice_connector_write_requests`
    // se lisait jusqu'ici PAR MISSION (`MissionDetailTabs.tsx`), jamais agrégé
    // par mois de workspace. `summarizeReadiness` est PURE (aucun accès base)
    // et ne peut donc pas le porter : cette requête vit ici, à côté de la
    // requête `FROM missions m` juste au-dessus, avec les MÊMES trois
    // paramètres ($1 espace, $2 mois, $3 mission optionnelle) pour que le
    // compteur respecte exactement le même périmètre que le reste du résumé.
    //
    // ⚠️ `created` ET `sent` ensemble, jamais l'un sans l'autre : `created`
    // est transitoire (écrasé par `sent` dans le même appel, #2197.24) — les
    // deux décrivent la MÊME chose, « une tentative est en cours, sans
    // réponse `invoiced`/`failed`/`unknown` encore connue ».
    const connectorDraftRows = await this.readiness.manager.query<{ count: string | null }[]>(
      `SELECT COUNT(*) AS count
         FROM invoice_connector_write_requests
        WHERE workspace_id = $1 AND period_month = $2::date AND state IN ('created', 'sent')
          AND ($3::uuid IS NULL OR mission_id = $3::uuid)`,
      [workspaceId, periodMonth, query.missionId ?? null],
    )
    const preparedInvoicesCount = Number(connectorDraftRows[0]?.count ?? 0)
    // #2783 — « dont avenants » à l'échelle de l'espace, sur CE mois : même
    // requête et même distinction accepté/simulé que
    // `ForecastHorizonsService.compute` (GA-26) — COMPTÉS, jamais chiffrés
    // (`new_term` est un JSON libre sans contrat de clé vérifiable).
    const amendmentRows = await this.readiness.manager.query<{ status: string }[]>(
      `SELECT status FROM mission_amendments
        WHERE workspace_id = $1
          AND effective_from >= $2::date AND effective_from < ($2::date + interval '1 month')
          AND status IN ('proposed', 'accepted', 'active')`,
      [workspaceId, periodMonth],
    )
    const amendmentsAccepted = amendmentRows.filter(row => row.status === 'accepted' || row.status === 'active').length
    const amendmentsSimulated = amendmentRows.filter(row => row.status === 'proposed').length
    const fullSummary: ReadinessSummary = { ...summary, preparedInvoicesCount, amendmentsAccepted, amendmentsSimulated }
    // `redactFinance` et lui seul (D45) : la clé reste PRÉSENTE et vide, jamais
    // retirée et jamais à zéro. Les compteurs (`ready`, `blocked`,
    // `withoutAmount`…) ne portent pas de nom financier et traversent intacts —
    // savoir que six mois sont bloqués n'apprend rien de ce qu'ils valent.
    return {
      items: filtered.map(item => redactFinance(item, options.canReadFinance)),
      summary: redactFinance(fullSummary, options.canReadFinance),
      month,
      // Le DROIT voyage avec la réponse : sans lui, « pas le droit » et « pas
      // chiffrable » deviennent le même `null`, et l'écran ne peut plus les dire
      // différemment.
      canReadFinance: options.canReadFinance,
    }
  }

  /**
   * La fenêtre d'encaissements en UNE lecture : les lignes de CHAQUE mois reçu, sans filtre d'état
   * (c'est l'écran qui classe), plus le droit financier. L'écran l'obtenait par un `GET` par mois
   * (douze en rafale sur /pilotage/finance, Sentry BELLUM-WEB-2) ; la liste de mois reste celle du
   * navigateur, comme pour {@link exportCollections}.
   */
  async listWindow(
    workspaceId: string,
    months: readonly string[],
    options: { canReadFinance: boolean },
  ): Promise<{ items: InvoiceReadiness[]; canReadFinance: boolean }> {
    const pages = await Promise.all(months.map(month => this.list(workspaceId, { month, blockedOnly: false }, options)))
    return { items: pages.flatMap(page => page.items), canReadFinance: options.canReadFinance }
  }

  /**
   * #2198.45 — L'EXPORT de l'écran « encaissements ».
   *
   * `list()` est mensuel ; l'écran interroge une fenêtre glissante de douze
   * mois côté navigateur (`collections.ts`), qui les connaît déjà — c'est
   * cette LISTE, reçue en paramètre, qui est reparcourue ici, mois par mois,
   * jamais une fenêtre recalculée séparément qui finirait par diverger de ce
   * que l'écran affiche.
   *
   * Filtré sur `isInvoicedState` : même critère que `isCollectible` côté web
   * (`collections.ts:64-71`) — un mois pas encore facturé n'entre jamais dans
   * cet export, exactement comme il n'entre jamais dans la liste à l'écran.
   */
  async exportCollections(
    workspaceId: string,
    months: readonly string[],
    options: { canReadFinance: boolean },
  ): Promise<InvoiceReadiness[]> {
    const perMonth = await Promise.all(
      months.map(month => this.list(workspaceId, { month, blockedOnly: false }, options)),
    )
    return perMonth.flatMap(({ items }) => items).filter(item => isInvoicedState(item.state))
  }

  /**
   * Marque un mois comme facturé AILLEURS.
   *
   * Bellum n'émet rien : il enregistre que ce mois sort de sa surveillance. Sans
   * ce geste, on relancerait un client qui a déjà payé — la façon la plus sûre
   * de faire douter de tout le reste.
   *
   * #2197.41 — c'est une DÉCLARATION humaine, jamais une preuve de connecteur :
   * l'état écrit est `invoiced_declared`, jamais `invoiced`. `invoiced_by`
   * porte déjà l'acteur depuis l'origine ; c'est `list()` qui le résout
   * désormais en nom (`invoicedByName`).
   */
  async markInvoiced(
    workspaceId: string,
    userId: string,
    missionId: string,
    month: string,
    input: { invoicedAt?: string; reference?: string; amountCents?: number; dueOn?: string } = {},
  ): Promise<InvoiceReadiness> {
    await this.assertMission(missionId, workspaceId)
    const periodMonth = `${month}-01`

    // Les trois champs du §8 sont facultatifs et RESTENT à `null` quand ils ne
    // sont pas fournis : inventer une référence ou une échéance ferait
    // apparaître un impayé au bout de trente jours pour une facture dont
    // personne n'a jamais dit quand elle était due.
    await this.readiness.manager.query(
      `INSERT INTO invoice_readiness
         (workspace_id, mission_id, period_month, state, invoiced_at, invoiced_by,
          invoice_reference, invoiced_amount_cents, due_on, updated_at)
       VALUES ($1, $2, $3, 'invoiced_declared', $4, $5, $6, $7, $8::date, now())
       ON CONFLICT (mission_id, period_month) DO UPDATE SET
         state = 'invoiced_declared', invoiced_at = EXCLUDED.invoiced_at, invoiced_by = EXCLUDED.invoiced_by,
         invoice_reference = COALESCE(EXCLUDED.invoice_reference, invoice_readiness.invoice_reference),
         invoiced_amount_cents = COALESCE(EXCLUDED.invoiced_amount_cents, invoice_readiness.invoiced_amount_cents),
         due_on = COALESCE(EXCLUDED.due_on, invoice_readiness.due_on),
         updated_at = now()`,
      [
        workspaceId,
        missionId,
        periodMonth,
        input.invoicedAt ? new Date(input.invoicedAt) : new Date(),
        userId,
        input.reference ?? null,
        input.amountCents ?? null,
        input.dueOn ?? null,
      ],
    )

    return this.rowFor(workspaceId, missionId, month)
  }

  /**
   * Enregistre un PAIEMENT reçu.
   *
   * ⚠️ Le geste qui manquait. `paid_at` était LU par le chiffre d'affaires
   * encaissé et par le délai de paiement, et écrit par RIEN : les deux mesures
   * étaient structurellement vides. Bellum ne rapproche aucun compte bancaire
   * (D33) — il enregistre ce que quelqu'un CONSTATE, comme pour « facturé
   * ailleurs ».
   *
   * On ne peut payer que ce qui a été facturé : marquer payé un mois qu'aucune
   * facture ne couvre produirait un encaissé sans contrepartie, et c'est le
   * genre d'écart qu'on cherche justement à faire apparaître.
   */
  async recordPayment(
    workspaceId: string,
    missionId: string,
    month: string,
    input: { paidAt?: string; amountCents?: number } = {},
    userId: string | null = null,
  ): Promise<InvoiceReadiness> {
    await this.assertMission(missionId, workspaceId)
    const periodMonth = `${month}-01`
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date()

    const updated = returnedRows<{ id: string }>(
      await this.readiness.manager.query(
        `UPDATE invoice_readiness
            SET paid_at = $4, paid_amount_cents = $5, updated_at = now()
          WHERE workspace_id = $1 AND mission_id = $2 AND period_month = $3::date
            AND invoiced_at IS NOT NULL AND invoice_cancelled_at IS NULL
        RETURNING id`,
        [
          workspaceId,
          missionId,
          periodMonth,
          paidAt,
          // JAMAIS déduit du montant facturé : un paiement partiel est le cas
          // normal d'un litige, et le recopier ferait disparaître l'écart.
          input.amountCents ?? null,
        ],
      ),
    )
    const [row] = updated
    if (!row) {
      throw new ConflictException(
        "Ce mois n'a pas été marqué comme facturé : un paiement ne s'enregistre que sur une facture annoncée.",
      )
    }
    // #2419.1 — un montant saisi devient un PAIEMENT rattaché, et l'encaissé
    // de la ligne se recalcule en SOMME de ses paiements : un second paiement
    // s'ajoute au premier au lieu de l'écraser (#2419.5 le signale). Sans
    // montant, aucun paiement n'est créé — on n'invente pas un montant.
    if (input.amountCents !== undefined && input.amountCents > 0) {
      await recordAttachedPayment(this.readiness.manager, {
        workspaceId,
        userId,
        invoiceReadinessId: row.id,
        amountCents: input.amountCents,
        receivedOn: paidAt.toISOString().slice(0, 10),
      })
    }

    return this.rowFor(workspaceId, missionId, month)
  }

  /**
   * Annule un « marqué comme facturé » posé par erreur.
   *
   * Le geste était un ALLER SIMPLE : un mois marqué par erreur sortait
   * définitivement des relances — le client ne paie pas, personne ne le
   * relance, et rien ne le dit.
   *
   * On n'EFFACE pas la marque, on l'annule en gardant sa trace : effacer
   * `invoiced_at` ferait disparaître le fait qu'une facture a été annoncée.
   * Le motif est obligatoire, et la contrainte SQL le tient aussi.
   *
   * Un mois déjà PAYÉ ne s'annule pas : l'argent est arrivé, et prétendre que
   * la facture n'a jamais existé rendrait l'encaissé incohérent.
   */
  async cancelInvoiced(
    workspaceId: string,
    userId: string,
    missionId: string,
    month: string,
    reason: string,
  ): Promise<InvoiceReadiness> {
    await this.assertMission(missionId, workspaceId)
    const periodMonth = `${month}-01`

    const updated = returnedRows(
      await this.readiness.manager.query(
        `UPDATE invoice_readiness
            SET invoice_cancelled_at = now(), invoice_cancelled_reason = $4,
                invoice_cancelled_by = $5, invoiced_at = NULL, state = 'blocked', updated_at = now()
          WHERE workspace_id = $1 AND mission_id = $2 AND period_month = $3::date
            AND invoiced_at IS NOT NULL AND paid_at IS NULL
        RETURNING id`,
        [workspaceId, missionId, periodMonth, reason, userId],
      ),
    )
    if (updated.length === 0) {
      throw new ConflictException(
        "Rien à annuler : ce mois n'est pas marqué comme facturé, ou un paiement y a déjà été enregistré.",
      )
    }

    return this.rowFor(workspaceId, missionId, month)
  }

  /**
   * DÉCLARE un litige sur la facture d'un mois — BEL-MIS-011.
   *
   * **Le litige n'est pas un retard.** Sans ce geste, une contestation se
   * traitait en annulant le « facturé » : le mois repartait dans les relances,
   * et son délai gonflait le délai de paiement moyen du portefeuille. Les deux
   * effets sont faux, et le second est mesuré à l'euro près par un indicateur
   * qu'on montre à un dirigeant.
   *
   * Trois conditions dans le `WHERE`, chacune pour une bêtise précise :
   * `invoiced_at IS NOT NULL` (contester un mois que personne n'a facturé n'a
   * pas de sens), `invoice_cancelled_at IS NULL` (la marque a été retirée : il
   * n'y a plus de facture à contester) et `disputed_at IS NULL` (rouvrir
   * écraserait la date du premier litige, qui est justement ce qui explique le
   * délai).
   *
   * Rien d'autre n'est touché : ni la marque « facturé », ni le paiement. Le
   * mois reste ce qu'il est, avec un litige en plus.
   */
  async openDispute(workspaceId: string, missionId: string, month: string, reason: string): Promise<InvoiceReadiness> {
    await this.assertMission(missionId, workspaceId)
    const periodMonth = `${month}-01`

    const updated = returnedRows(
      await this.readiness.manager.query(
        `UPDATE invoice_readiness
            SET disputed_at = now(), dispute_reason = $4, dispute_resolved_at = NULL, updated_at = now()
          WHERE workspace_id = $1 AND mission_id = $2 AND period_month = $3::date
            AND invoiced_at IS NOT NULL AND invoice_cancelled_at IS NULL AND disputed_at IS NULL
        RETURNING id`,
        [workspaceId, missionId, periodMonth, reason],
      ),
    )
    if (updated.length === 0) {
      throw new ConflictException(
        "Aucune facture à contester sur ce mois : il n'est pas marqué comme facturé, ou un litige y court déjà.",
      )
    }

    return this.rowFor(workspaceId, missionId, month)
  }

  /**
   * LÈVE un litige — la contestation est réglée, la cadence peut reprendre.
   *
   * `disputed_at` n'est PAS remis à `null` : « cette facture a été contestée »
   * reste vrai et explique le délai qu'on lira plus tard. C'est la même règle
   * que l'annulation d'un « facturé », qui garde sa trace au lieu de l'effacer.
   *
   * Aucun motif demandé : la fin d'un litige n'a rien à justifier, et exiger une
   * phrase pour clore ferait laisser des litiges ouverts.
   */
  async resolveDispute(workspaceId: string, missionId: string, month: string): Promise<InvoiceReadiness> {
    await this.assertMission(missionId, workspaceId)
    const periodMonth = `${month}-01`

    const updated = returnedRows(
      await this.readiness.manager.query(
        `UPDATE invoice_readiness
            SET dispute_resolved_at = now(), updated_at = now()
          WHERE workspace_id = $1 AND mission_id = $2 AND period_month = $3::date
            AND disputed_at IS NOT NULL AND dispute_resolved_at IS NULL
        RETURNING id`,
        [workspaceId, missionId, periodMonth],
      ),
    )
    if (updated.length === 0) {
      throw new ConflictException("Aucun litige en cours sur ce mois : il n'y a rien à lever.")
    }

    return this.rowFor(workspaceId, missionId, month)
  }

  /**
   * Les relances d'ENCAISSEMENT dues sur un mois — le service dit lesquelles,
   * il n'en envoie aucune. Décider d'écrire à un client reste un geste humain.
   *
   * ⚠️ `blockedOnly` valait `true` : la liste ne contenait donc QUE des mois
   * bloqués, alors qu'une relance d'encaissement porte sur un mois FACTURÉ et
   * impayé. Le filtre écartait exactement les lignes que cette méthode cherche.
   *
   * `ownerId` rejoint le CHARGÉ D'AFFAIRES (`missions.owner_id`) au DERNIER
   * rang de la cadence (`joinOwner`, décidé par `reminderDue` — un réglage vit
   * à un seul endroit) : si deux relances au contact de facturation n'ont rien
   * donné, c'est le porteur de la mission qu'on prévient avant que le sujet ne
   * remonte à un humain. `null` sur les deux premiers rangs — et sur le
   * troisième si la mission n'a pas de porteur déclaré, ce qui reste une
   * fiche incomplète et non une raison de deviner.
   */
  async dueReminders(
    workspaceId: string,
    options: { month?: string; canReadFinance: boolean },
    now: Date = new Date(),
  ): Promise<
    { item: InvoiceReadiness; index: number; overdueDays: number; dueSince: string; ownerId: string | null }[]
  > {
    // ⚠️ Le droit financier traverse jusqu'ici. Chaque entrée porte l'`item`
    // ENTIER — donc `invoicedAmountCents` et `paidAmountCents` — et cette
    // méthode est servie par `GET /delivery/invoice-readiness/reminders`, une
    // route sans permission déclarée elle aussi. Sans ce passage, la file des
    // relances rouvrait la fuite que la liste vient de fermer.
    const { items } = await this.list(
      workspaceId,
      { month: options.month, blockedOnly: false },
      { canReadFinance: options.canReadFinance },
      now,
    )
    const due = items.flatMap(item => {
      const result = reminderDue(
        {
          state: item.state,
          dueOn: item.dueOn,
          paidAt: item.paidAt,
          // #2419.4 — un paiement partiel ne sort pas de la file : le refus de
          // relancer se décide sur le SOLDE, et le solde demande les deux
          // montants. Une date de règlement seule laissait un client qui a payé
          // la moitié quitter la cadence pour toujours.
          paidAmountCents: item.paidAmountCents,
          invoicedAmountCents: item.invoicedAmountCents,
          remindersSent: item.remindersSent,
          // Un litige OUVERT arrête la cadence (BEL-MIS-011) : le refus vit
          // dans `reminderDue`, avec les autres, et pas ici — un refus écrit à
          // côté des premiers finirait par diverger.
          disputedAt: item.disputedAt,
          disputeResolvedAt: item.disputeResolvedAt,
        },
        now,
      )
      return result ? [{ item, ...result }] : []
    })

    // Le JOIN reste ÉTROIT : une requête de plus, et seulement pour les
    // missions dont le rang l'exige — jamais un `SELECT *` sur toute la liste
    // du mois pour un champ que la plupart des lignes n'utiliseront pas.
    const missionIds = [...new Set(due.filter(entry => entry.joinOwner).map(entry => entry.item.missionId))]
    const ownerById = new Map<string, string | null>()
    if (missionIds.length > 0) {
      const owners = returnedRows<{ id: string; owner_id: string | null }>(
        await this.readiness.manager.query(`SELECT id, owner_id FROM missions WHERE id = ANY($1::uuid[])`, [
          missionIds,
        ]),
      )
      for (const owner of owners) ownerById.set(owner.id, owner.owner_id)
    }

    return due.map(({ joinOwner, ...entry }) => ({
      ...entry,
      ownerId: joinOwner ? (ownerById.get(entry.item.missionId) ?? null) : null,
    }))
  }

  /**
   * Enregistre qu'une relance est PARTIE.
   *
   * La trace est posée par le geste d'envoi, jamais déduite : compter une
   * relance qu'on n'a pas envoyée ferait taire la suivante, et le mois passerait.
   */
  async recordReminder(
    workspaceId: string,
    missionId: string,
    month: string,
    blockers: InvoiceBlocker[],
  ): Promise<void> {
    await this.assertMission(missionId, workspaceId)
    const periodMonth = `${month}-01`
    try {
      await this.readiness.manager.query(
        `INSERT INTO invoice_readiness (
           workspace_id, mission_id, period_month, state, blockers, reminders_sent, last_reminder_at, updated_at
         ) VALUES ($1, $2, $3, 'blocked', $4::jsonb, 1, now(), now())
         ON CONFLICT (mission_id, period_month) DO UPDATE SET
           blockers = EXCLUDED.blockers,
           reminders_sent = invoice_readiness.reminders_sent + 1,
           last_reminder_at = now(),
           updated_at = now()`,
        [workspaceId, missionId, periodMonth, JSON.stringify(blockers)],
      )
    } catch (error) {
      // La trace ne doit pas faire échouer un envoi déjà parti — mais elle est
      // journalisée bruyamment : sans elle, la relance suivante partira trop tôt.
      this.logger.error('Relance de facturation non tracée', {
        error,
        tags: { 'invoice.mission': missionId, 'invoice.month': month },
      })
    }
  }

  /**
   * La ligne du mois, relue APRÈS un geste.
   *
   * Elle repasse par `list`, donc par le calcul : rendre la ligne qu'on vient
   * d'écrire ferait répondre avec un état qui n'est pas celui que l'écran
   * affichera à la lecture suivante.
   *
   * ⚠️ Lue SANS rédaction (`canReadFinance: true`), et c'est le CONTRÔLEUR qui
   * rédige la réponse des cinq gestes d'écriture — parce que lui seul connaît
   * le droit de l'auteur du geste. Le faire ici obligerait à ajouter un
   * paramètre à cinq signatures dont l'une porte déjà un objet optionnel, et
   * « paramètre déclaré, jamais passé » est une cause racine nommée de ce
   * dépôt : mieux vaut une rédaction à la frontière, visible, qu'un drapeau de
   * plus qu'on oubliera de passer.
   *
   * Quatre des cinq gestes exigent `finance:write` (donc `finance:read` chez
   * tous les rôles qui le portent) ; le cinquième, « marquer comme facturé »,
   * est ouvert à `records:write` — c'est celui-là que la rédaction du
   * contrôleur protège réellement.
   */
  private async rowFor(workspaceId: string, missionId: string, month: string): Promise<InvoiceReadiness> {
    const { items } = await this.list(workspaceId, { month, blockedOnly: false }, { canReadFinance: true })
    const found = items.find(item => item.missionId === missionId)
    if (!found) throw new NotFoundException('Mission introuvable pour ce mois')
    return found
  }

  private async assertMission(missionId: string, workspaceId: string): Promise<void> {
    const rows = await this.readiness.manager.query<{ id: string }[]>(
      `SELECT id FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [missionId, workspaceId],
    )
    if (rows.length === 0) throw new NotFoundException('Mission introuvable')
  }
}

/**
 * Le mois PRÉCÉDENT, en `YYYY-MM`.
 *
 * Le 5 du mois, la question n'est pas « où en est le mois en cours » — il n'est
 * pas fini — mais « qu'est-ce qui bloque encore le mois qu'on devrait avoir
 * facturé ».
 */
function previousMonth(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Le coût chargé, en CENTIMES — `null` seulement quand la colonne l'est
 * VRAIMENT, jamais quand elle vaut `0`.
 *
 * ⚠️ `loaded_daily_cost_cents` est un `bigint` : pg le rend en CHAÎNE, y
 * compris `'0'`. Un test `=== null` distingue les deux ; un test de vérité
 * (`!raw`) les confondrait, puisque `'0'` est une chaîne non vide mais que
 * `Number('0')` est falsy — exactement le piège que ce bloqueur doit éviter
 * (un consultant interne peut légitimement avoir un coût chargé nul).
 */
function loadedCostCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const cents = Number(raw)
  if (!Number.isFinite(cents) || cents < 0) return null
  return cents
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  outgoingPaymentBlockers,
  redactFinance,
  summarizeOutgoingPayments,
  type GenerateOutgoingPaymentInput,
  type OutgoingPayment,
  type OutgoingPaymentStatus,
  type OutgoingPaymentsPage,
  type OutgoingPaymentsQuery,
  type RejectOutgoingPaymentInput,
  type RemindOutgoingPaymentsResult,
  type SettleOutgoingPaymentInput,
  type ValidateOutgoingPaymentInput,
} from '@bellum/contracts'
import { OutgoingPaymentEntity } from '../../database/entities/outgoing-payment.entity'
import { firstReturnedRow, returnedCount } from '../../database/returned-rows'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PAIEMENT SORTANT — ce qu'on doit au consultant, mois par mois
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Le miroir de `InvoiceReadinessService`, qui suit l'argent qui RENTRE du
 * client. Les deux ne partagent aucune colonne, et c'est pour ça qu'ils ne
 * partagent ni table ni service.
 *
 * ⚠️ **Bellum SUIT le paiement, il ne le DÉCLENCHE pas.** Aucune méthode de ce
 * fichier n'émet un ordre de virement, ne lit ni n'écrit un IBAN, et il n'y en
 * aura pas : le refus est écrit trois fois dans le dépôt (`admin-docs.ts`, la
 * migration `1788900000005-AdminDocsConnections`, le catalogue d'outils du
 * copilote), et ce lot ne le lève pas. `paid_on` est ce qu'un humain CONSTATE,
 * exactement comme `invoice_readiness.paid_at` côté client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA LECTURE COMPOSE, ET POURQUOI ELLE NE SÈME RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste est une PROJECTION de trois choses qui existaient déjà et qui
 * n'avaient jamais été jointes :
 *
 *  1. le RELEVÉ d'activité (`mission_timesheets`) et sa validation CLIENT —
 *     c'est elle qui AUTORISE le paiement (la colonne « VALIDATION » de la
 *     source). `CollectionsPage.tsx` écrit encore aujourd'hui que « la
 *     validation du relevé n'est jamais jointe à la ligne de facturation » :
 *     ici elle l'est, parce que les deux objets partagent la même maille —
 *     mission × consultant × mois ;
 *  2. la FACTURE ENTRANTE du sous-traitant (`supplier_invoices`) — c'est le
 *     document qui JUSTIFIE le paiement, et son montant. Rien n'est recodé :
 *     la table, ses routes et son cycle existent depuis le 30/08 ;
 *  3. la ligne de PAIEMENT elle-même (`outgoing_payments`), quand quelqu'un
 *     l'a préparée.
 *
 * ⚠️ **`non_genere` est DÉDUIT, jamais semé.** Une ligne par mois et par
 * consultant créée « au cas où » fabriquerait des milliers d'objets vides dont
 * aucun ne porte de décision — et le compteur « paiement non généré » de la
 * source mesurerait alors notre propre semis, pas un vrai retard.
 */
@Injectable()
export class OutgoingPaymentsService {
  constructor(
    @InjectRepository(OutgoingPaymentEntity)
    private readonly payments: Repository<OutgoingPaymentEntity>,
  ) {}

  /**
   * Le mois, consultant par consultant.
   *
   * Le mois par défaut est le PRÉCÉDENT, comme la vue des relevés et celle de
   * « prêt à facturer » : le 5 du mois, la question n'est pas « où en est le
   * mois en cours », c'est « qui n'a pas encore été payé pour le mois d'avant ».
   */
  async list(
    workspaceId: string,
    query: OutgoingPaymentsQuery,
    options: { canReadFinance: boolean },
    now: Date = new Date(),
  ): Promise<OutgoingPaymentsPage> {
    const month = query.month ?? previousMonth(now)
    const periodMonth = `${month}-01`

    /**
     * La LEFT JOIN sur les affectations est ce qui produit une ligne par
     * consultant — le même patron que `TimesheetsService.month`, à dessein :
     * deux requêtes qui produiraient des mailles différentes feraient deux
     * écrans qui ne parlent pas des mêmes gens.
     *
     * ⚠️ La jointure du paiement compare `consultant_id` en TOLÉRANT le `NULL`
     * des deux côtés (`IS NOT DISTINCT FROM` aurait fait la même chose ; la
     * forme explicite est celle que le dépôt écrit déjà). Sans cette seconde
     * branche, une mission sans affectation n'aurait JAMAIS retrouvé son propre
     * paiement — la jointure aurait été fausse en silence, et l'écran aurait
     * proposé de re-générer un paiement qui existait déjà.
     *
     * ⚠️ La facture entrante est prise par `supplier_invoice_id` quand le
     * paiement en porte une, et SINON par la plus récente facture de la
     * mission — parce que c'est elle qu'on est en train de rattacher. On ne
     * DEVINE pas au-delà : sans facture, `supplierInvoiceId` vaut `null`, et
     * l'écran NOMME le manque au lieu de laisser croire le dossier complet.
     */
    const rows = await this.payments.manager.query<PaymentRow[]>(
      `SELECT m.id AS mission_id, m.label AS mission_label,
              a.id AS account_id, a.company_name AS account_name,
              asg.consultant_id, c.full_name AS consultant_name, c.title AS consultant_title,
              ts.validated_by_client_at AS ts_validated, ts.days AS ts_days,
              op.id AS op_id, op.status AS op_status,
              op.amount_cents AS op_amount, op.settled_amount_cents AS op_settled,
              op.scheduled_on AS op_scheduled, op.paid_on AS op_paid,
              op.reminders_sent AS op_reminders, op.last_reminder_at AS op_last_reminder,
              op.validated_at AS op_validated_at, op.rejected_at AS op_rejected_at,
              op.rejection_reason AS op_rejection_reason,
              si.id AS si_id, si.reference AS si_reference, si.amount_cents AS si_amount
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
         LEFT JOIN outgoing_payments op
                ON op.mission_id = m.id
               AND op.period_month = $2
               AND op.workspace_id = $1
               AND (op.consultant_id = asg.consultant_id OR (op.consultant_id IS NULL AND asg.consultant_id IS NULL))
         LEFT JOIN LATERAL (
              SELECT s.id, s.reference, s.amount_cents
                FROM supplier_invoices s
               WHERE s.mission_id = m.id
                 AND s.workspace_id = $1
                 AND (op.supplier_invoice_id IS NULL OR s.id = op.supplier_invoice_id)
               ORDER BY s.invoice_date DESC, s.created_at DESC
               LIMIT 1
         ) si ON TRUE
        WHERE m.workspace_id = $1
          AND m.status <> 'draft'
          AND (m.started_on IS NULL OR m.started_on <= ($2::date + interval '1 month' - interval '1 day'))
          AND (m.ends_on IS NULL OR m.ends_on >= $2::date)
          AND ($3::uuid IS NULL OR m.account_id = $3::uuid)
        ORDER BY a.company_name NULLS LAST, c.full_name NULLS LAST, m.label`,
      [workspaceId, periodMonth, query.accountId ?? null],
    )

    const items = rows.map(row => toApi(row, periodMonth))

    // ⚠️ Le RÉSUMÉ porte sur TOUT le mois, jamais sur la liste filtrée : le
    // calculer après le filtre afficherait « 0 en retard » à quelqu'un qui
    // vient de cliquer « à valider ». Même arbitrage que `TimesheetsService`.
    const summary = summarizeOutgoingPayments(items, now)

    let filtered = items
    if (query.status) filtered = filtered.filter(item => item.status === query.status)
    if (query.search) {
      const needle = query.search.trim().toLowerCase()
      filtered = filtered.filter(item =>
        [item.consultantName, item.accountName, item.missionLabel].some(
          value => value !== null && value.toLowerCase().includes(needle),
        ),
      )
    }

    return {
      month,
      // `redactFinance` et pas un ternaire écrit à la main (D45) : le champ
      // reste PRÉSENT et vide, jamais retiré et jamais à zéro.
      items: filtered.map(item => redactFinance(item, options.canReadFinance)),
      summary: {
        ...summary,
        paid: redactFinance(summary.paid, options.canReadFinance),
        pending: redactFinance(summary.pending, options.canReadFinance),
        overdue: redactFinance(summary.overdue, options.canReadFinance),
        toValidate: redactFinance(summary.toValidate, options.canReadFinance),
      },
      canReadFinance: options.canReadFinance,
    }
  }

  /**
   * PRÉPARER le paiement d'un mois — `non_genere` → `a_valider`.
   *
   * Il ne fait sortir aucun euro : il matérialise l'objet à partir du relevé
   * VALIDÉ et de la facture entrante, pour qu'un humain ait quelque chose à
   * assumer. Le montant vient de la FACTURE et d'elle seule — on ne le déduit
   * pas de `jours × TJM`, qui est un chiffre de VENTE et n'a jamais été ce
   * qu'on doit à quelqu'un.
   *
   * ⚠️ Il REFUSE sur un relevé non validé. Ce n'est pas une commodité d'écran :
   * c'est la seule condition qui protège l'ESN d'un décaissement sur des jours
   * que le client n'a jamais signés, et un contrôle qui n'existe que dans un
   * formulaire est un contrôle qu'un appel direct contourne.
   */
  async generate(workspaceId: string, userId: string, input: GenerateOutgoingPaymentInput): Promise<OutgoingPayment> {
    const periodMonth = `${input.month}-01`
    const source = await this.readSlot(workspaceId, input.missionId, input.consultantId, periodMonth)
    if (!source) throw new NotFoundException('Mission introuvable dans cet espace, ou hors de ce mois.')
    if (source.op_id) throw new BadRequestException('Un paiement existe déjà pour ce consultant sur ce mois.')

    const line = toApi(source, periodMonth)
    const blockers = outgoingPaymentBlockers(line)
    if (blockers.includes('timesheet_not_validated')) {
      throw new BadRequestException(
        'Le relevé d’activité n’est pas validé par le client — c’est lui qui autorise le paiement.',
      )
    }

    const saved = await this.payments.save(
      this.payments.create({
        workspace_id: workspaceId,
        mission_id: input.missionId,
        consultant_id: input.consultantId,
        period_month: periodMonth,
        supplier_invoice_id: source.si_id,
        // Le dû vient de la facture entrante. `null` sans facture — jamais 0 :
        // « rien à payer » et « on n'a pas encore le document » ne se réparent
        // pas de la même façon.
        amount_cents: source.si_amount === null ? null : Number(source.si_amount),
        settled_amount_cents: null,
        status: 'a_valider',
        scheduled_on: input.scheduledOn ?? null,
        entered_by: userId,
        source: 'human',
      }),
    )
    return this.reread(workspaceId, saved.id)
  }

  /**
   * ASSUMER le paiement — `a_valider` → `valide`.
   *
   * Geste d'UTILISATEUR, donc auto-approuvé : le clic EST la décision. Les deux
   * conditions du contrat sont re-vérifiées ICI et pas seulement à l'écran —
   * une facture peut avoir été supprimée, ou un relevé remis en cause, entre le
   * moment où l'écran a été rendu et celui où le bouton est cliqué.
   */
  async validate(
    workspaceId: string,
    userId: string,
    paymentId: string,
    input: ValidateOutgoingPaymentInput,
  ): Promise<OutgoingPayment> {
    const current = await this.reread(workspaceId, paymentId)
    const blockers = outgoingPaymentBlockers(current)
    if (blockers.includes('already_settled')) {
      throw new BadRequestException('Ce paiement est déjà constaté payé — il n’y a plus rien à valider.')
    }
    if (blockers.includes('timesheet_not_validated')) {
      throw new BadRequestException(
        'Le relevé d’activité n’est pas validé par le client — c’est lui qui autorise le paiement.',
      )
    }
    if (blockers.includes('missing_supplier_invoice')) {
      throw new BadRequestException('Aucune facture du sous-traitant ne justifie ce paiement.')
    }

    await this.payments.update(
      { id: paymentId, workspace_id: workspaceId },
      {
        status: 'valide',
        validated_at: new Date(),
        validated_by: userId,
        // ⚠️ On n'ÉCRASE pas une date déjà saisie avec `null` : le geste ajoute
        // une date quand elle manquait, il n'en retire jamais une.
        ...(input.scheduledOn ? { scheduled_on: input.scheduledOn } : {}),
      },
    )
    return this.reread(workspaceId, paymentId)
  }

  /**
   * CONSTATER le paiement — `valide` → `paye`.
   *
   * Bellum ne rapproche aucun compte bancaire (D33) et n'a aucun accès
   * bancaire : il enregistre ce qu'un humain constate. Le montant SORTI n'est
   * jamais déduit du dû — un paiement partiel arrive, et le recopier ferait
   * disparaître exactement l'écart qu'on veut voir.
   */
  async settle(
    workspaceId: string,
    paymentId: string,
    input: SettleOutgoingPaymentInput,
    now: Date = new Date(),
  ): Promise<OutgoingPayment> {
    const current = await this.reread(workspaceId, paymentId)
    if (current.status === 'rejete') {
      throw new BadRequestException('Ce paiement a été refusé — il se rouvre avant de pouvoir être constaté payé.')
    }
    await this.payments.update(
      { id: paymentId, workspace_id: workspaceId },
      {
        status: 'paye',
        // La contrainte SQL exige une date dès que l'état est `paye` : un
        // paiement constaté sans date ne mesure aucun délai, donc ne sert à
        // rien. Absent = aujourd'hui, jamais `null`.
        paid_on: input.paidOn ?? now.toISOString().slice(0, 10),
        ...(input.settledAmountCents === undefined ? {} : { settled_amount_cents: input.settledAmountCents }),
      },
    )
    return this.reread(workspaceId, paymentId)
  }

  /**
   * REFUSER le paiement — le motif est OBLIGATOIRE, ici, dans le contrat, et
   * dans la contrainte SQL.
   *
   * ⚠️ On n'EFFACE rien : le montant, la facture rattachée et la date prévue
   * restent. « On archive, on ne supprime pas » — et ce qu'il faudra relire
   * dans six mois est justement « ce paiement a été préparé PUIS refusé, pour
   * cette raison-là ».
   */
  async reject(workspaceId: string, paymentId: string, input: RejectOutgoingPaymentInput): Promise<OutgoingPayment> {
    const current = await this.reread(workspaceId, paymentId)
    if (current.status === 'paye') {
      throw new BadRequestException('Ce paiement est déjà sorti — le refuser après coup ne le ferait pas revenir.')
    }
    await this.payments.update(
      { id: paymentId, workspace_id: workspaceId },
      { status: 'rejete', rejected_at: new Date(), rejection_reason: input.reason },
    )
    return this.reread(workspaceId, paymentId)
  }

  /**
   * CONSIGNER une relance sur un LOT — le bouton « Relancer les paiements ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * RIEN NE PART D'ICI, ET IL N'Y A PAS DE SECOND MÉCANISME D'ENVOI
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ Un mécanisme d'envoi GOUVERNÉ existe déjà — `POST /mailbox/batch`,
   * idempotent par `batchId`, adossé à la boîte PERSONNELLE de l'utilisateur,
   * avec sa déduplication, son opt-out et son arrêt après trois échecs. Ce
   * service n'en écrit pas un second : deux portes vers le même envoi
   * finiraient par diverger sur l'approbation ou sur le journal.
   *
   * Il ne l'APPELLE pas non plus, et c'est la doctrine du produit : « le
   * copilote prépare, le commercial envoie ». Ce que ce lot apporte est ce qui
   * manquait vraiment — consigner en UN geste ce qui se consignait ligne par
   * ligne, sur les lignes qu'on a sous les yeux.
   *
   * ⚠️ `skipped` n'est pas décoratif. Un paiement payé ou refusé entre-temps ne
   * se relance pas, et rendre « 12 relancés » quand trois ont été écartés
   * ferait croire à un geste qui n'a pas eu lieu : « une erreur se remarque,
   * une liste vide se croit. »
   */
  async remind(workspaceId: string, paymentIds: readonly string[]): Promise<RemindOutgoingPaymentsResult> {
    // Un seul aller-retour, et c'est le SQL qui tient le refus : filtrer en
    // mémoire après une lecture laisserait passer un paiement constaté payé
    // entre les deux requêtes.
    const rows = await this.payments.manager.query<{ id: string }[]>(
      `UPDATE outgoing_payments
          SET reminders_sent = reminders_sent + 1, last_reminder_at = now(), updated_at = now()
        WHERE workspace_id = $1
          AND id = ANY($2::uuid[])
          AND status NOT IN ('paye', 'rejete')
      RETURNING id`,
      [workspaceId, [...paymentIds]],
    )
    // ⚠️ `returnedCount` et jamais `rows.length` : sur un `UPDATE … RETURNING`,
    // TypeORM rend `[lignes, nombre]`, si bien que `rows.length` vaudrait `2`
    // quel que soit le nombre de lignes réellement touchées — « 2 relances
    // consignées » sur un lot de trente. C'est la cause racine que
    // `returned-rows.ts` existe pour refermer, et une garde refuse les appels
    // qui l'oublient.
    const reminded = returnedCount(rows)
    return { reminded, skipped: Math.max(paymentIds.length - reminded, 0) }
  }

  /** Une ligne, relue APRÈS écriture — la source de vérité est la base, jamais
   *  l'objet qu'on vient de composer en mémoire. */
  private async reread(workspaceId: string, paymentId: string): Promise<OutgoingPayment> {
    const rows = await this.payments.manager.query<PaymentRow[]>(
      `${SELECT_BY_ID} WHERE op.id = $1 AND op.workspace_id = $2`,
      [paymentId, workspaceId],
    )
    const row = firstReturnedRow<PaymentRow>(rows)
    if (!row) throw new NotFoundException('Paiement introuvable dans cet espace.')
    return toApi(row, String(row.period_month).slice(0, 10))
  }

  /** La MAILLE d'un mois : la mission, son consultant, son relevé, sa facture —
   *  et le paiement s'il existe déjà. */
  private async readSlot(
    workspaceId: string,
    missionId: string,
    consultantId: string | null,
    periodMonth: string,
  ): Promise<PaymentRow | null> {
    const rows = await this.payments.manager.query<PaymentRow[]>(
      `SELECT m.id AS mission_id, m.label AS mission_label,
              a.id AS account_id, a.company_name AS account_name,
              $3::uuid AS consultant_id, c.full_name AS consultant_name, c.title AS consultant_title,
              ts.validated_by_client_at AS ts_validated, ts.days AS ts_days,
              op.id AS op_id, op.status AS op_status,
              op.amount_cents AS op_amount, op.settled_amount_cents AS op_settled,
              op.scheduled_on AS op_scheduled, op.paid_on AS op_paid,
              op.reminders_sent AS op_reminders, op.last_reminder_at AS op_last_reminder,
              op.validated_at AS op_validated_at, op.rejected_at AS op_rejected_at,
              op.rejection_reason AS op_rejection_reason,
              si.id AS si_id, si.reference AS si_reference, si.amount_cents AS si_amount
         FROM missions m
         LEFT JOIN accounts a ON a.id = m.account_id
         LEFT JOIN consultants c ON c.id = $3::uuid
         LEFT JOIN mission_timesheets ts
                ON ts.mission_id = m.id
               AND ts.period_month = $4
               AND (ts.consultant_id = $3::uuid OR (ts.consultant_id IS NULL AND $3::uuid IS NULL))
         LEFT JOIN outgoing_payments op
                ON op.mission_id = m.id
               AND op.period_month = $4
               AND op.workspace_id = $2
               AND (op.consultant_id = $3::uuid OR (op.consultant_id IS NULL AND $3::uuid IS NULL))
         LEFT JOIN LATERAL (
              SELECT s.id, s.reference, s.amount_cents
                FROM supplier_invoices s
               WHERE s.mission_id = m.id AND s.workspace_id = $2
               ORDER BY s.invoice_date DESC, s.created_at DESC
               LIMIT 1
         ) si ON TRUE
        WHERE m.id = $1 AND m.workspace_id = $2
        LIMIT 1`,
      [missionId, workspaceId, consultantId, periodMonth],
    )
    return firstReturnedRow<PaymentRow>(rows) ?? null
  }
}

/** La requête de relecture d'UNE ligne — elle part du paiement et remonte. */
const SELECT_BY_ID = `
  SELECT m.id AS mission_id, m.label AS mission_label,
         a.id AS account_id, a.company_name AS account_name,
         op.period_month,
         op.consultant_id, c.full_name AS consultant_name, c.title AS consultant_title,
         ts.validated_by_client_at AS ts_validated, ts.days AS ts_days,
         op.id AS op_id, op.status AS op_status,
         op.amount_cents AS op_amount, op.settled_amount_cents AS op_settled,
         op.scheduled_on AS op_scheduled, op.paid_on AS op_paid,
         op.reminders_sent AS op_reminders, op.last_reminder_at AS op_last_reminder,
         op.validated_at AS op_validated_at, op.rejected_at AS op_rejected_at,
         op.rejection_reason AS op_rejection_reason,
         si.id AS si_id, si.reference AS si_reference, si.amount_cents AS si_amount
    FROM outgoing_payments op
    JOIN missions m ON m.id = op.mission_id
    LEFT JOIN accounts a ON a.id = m.account_id
    LEFT JOIN consultants c ON c.id = op.consultant_id
    LEFT JOIN mission_timesheets ts
           ON ts.mission_id = op.mission_id
          AND ts.period_month = op.period_month
          AND (ts.consultant_id = op.consultant_id OR (ts.consultant_id IS NULL AND op.consultant_id IS NULL))
    LEFT JOIN supplier_invoices si ON si.id = op.supplier_invoice_id
`

/** La ligne brute, telle que les trois requêtes la rendent. */
type PaymentRow = {
  mission_id: string
  mission_label: string | null
  account_id: string | null
  account_name: string | null
  period_month?: string | Date
  consultant_id: string | null
  consultant_name: string | null
  consultant_title: string | null
  ts_validated: string | Date | null
  ts_days: string | number | null
  op_id: string | null
  op_status: string | null
  op_amount: string | number | null
  op_settled: string | number | null
  op_scheduled: string | Date | null
  op_paid: string | Date | null
  op_reminders: number | null
  op_last_reminder: string | Date | null
  op_validated_at: string | Date | null
  op_rejected_at: string | Date | null
  op_rejection_reason: string | null
  si_id: string | null
  si_reference: string | null
  si_amount: string | number | null
}

/**
 * La ligne brute → la ligne d'API.
 *
 * ⚠️ Trois absences distinctes, trois rendus distincts, et les replier l'une
 * sur l'autre est exactement ce qui produit « 0 € » partout :
 *  - pas de ligne en base ⇒ `id: null` et `status: 'non_genere'` — DÉDUIT ;
 *  - pas de facture ⇒ `payableAmountCents: null`, jamais 0 ;
 *  - pas de relevé ⇒ `timesheetDays: null`, jamais 0 jour travaillé.
 */
function toApi(row: PaymentRow, periodMonth: string): OutgoingPayment {
  // Le montant DÛ : celui du paiement quand il est posé, sinon celui de la
  // facture qu'on s'apprête à rattacher. Jamais `jours × TJM` — c'est un
  // chiffre de VENTE, et il n'a jamais été ce qu'on doit à quelqu'un.
  const payable = row.op_amount ?? row.si_amount
  return {
    id: row.op_id,
    missionId: row.mission_id,
    missionLabel: row.mission_label,
    accountId: row.account_id,
    accountName: row.account_name,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    consultantTitle: row.consultant_title,
    periodMonth: row.period_month ? isoDay(row.period_month) : periodMonth,
    // ⚠️ La branche par DÉFAUT n'est pas un fourre-tout : elle est `non_genere`
    // parce que c'est ce que « aucune ligne en base » veut dire, et une valeur
    // inconnue qui arriverait ici se lirait « à préparer » — le plus prudent
    // des cinq états, jamais « validé » ni « payé ».
    status: isPaymentStatus(row.op_status) ? row.op_status : 'non_genere',
    payableAmountCents: payable === null || payable === undefined ? null : Number(payable),
    settledAmountCents: row.op_settled === null || row.op_settled === undefined ? null : Number(row.op_settled),
    supplierInvoiceId: row.si_id,
    supplierInvoiceReference: row.si_reference,
    timesheetValidatedAt: row.ts_validated ? new Date(row.ts_validated).toISOString() : null,
    timesheetDays: row.ts_days === null || row.ts_days === undefined ? null : Number(row.ts_days),
    scheduledOn: row.op_scheduled ? isoDay(row.op_scheduled) : null,
    paidOn: row.op_paid ? isoDay(row.op_paid) : null,
    remindersSent: row.op_reminders ?? 0,
    lastReminderAt: row.op_last_reminder ? new Date(row.op_last_reminder).toISOString() : null,
    validatedAt: row.op_validated_at ? new Date(row.op_validated_at).toISOString() : null,
    rejectedAt: row.op_rejected_at ? new Date(row.op_rejected_at).toISOString() : null,
    rejectionReason: row.op_rejection_reason,
  }
}

/**
 * Le garde de l'énumération — la taxonomie NOMMÉE, pas une union recopiée.
 *
 * Réécrite à la main, elle divergerait le jour où une valeur s'ajoute : c'est
 * le compilateur qui doit trouver le trou, pas la production.
 */
function isPaymentStatus(value: string | null): value is OutgoingPaymentStatus {
  return value === 'non_genere' || value === 'a_valider' || value === 'valide' || value === 'paye' || value === 'rejete'
}

/** Une colonne `date` de Postgres → `YYYY-MM-DD`, quel que soit le pilote.
 *  `node-postgres` rend tantôt une chaîne, tantôt un `Date` selon le type. */
function isoDay(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

/** Le mois PRÉCÉDENT, au format `YYYY-MM`. Partir du 1er en UTC évite le piège
 *  du 31 mars moins un mois, qui rendrait le 3 mars. */
function previousMonth(now: Date): string {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  return cursor.toISOString().slice(0, 7)
}

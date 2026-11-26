import { z } from 'zod'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PAIEMENT SORTANT — l'argent qui SORT vers le consultant
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Le dépôt ne connaissait que l'argent qui RENTRE du client
 * (`invoice-readiness.ts`, l'écran `/missions/encaissements`). L'autre moitié —
 * ce qu'on DOIT au consultant, au freelance, au sous-traitant, mois par mois —
 * n'existait nulle part : ni livrée, ni refusée. Zéro occurrence de
 * `consultant_payment` / `supplier_payment` / `freelance_payment` avant ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BELLUM SUIT, BELLUM NE PAIE PAS — et ce n'est pas une nuance
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Aucun ordre de virement, aucun IBAN, nulle part.** Le refus est déjà
 * écrit trois fois dans le dépôt, dans ces mots-là — « Bellum ne signe rien,
 * ne paie rien et **ne stocke aucun IBAN** » (`admin-docs.ts`, la migration
 * `1788900000005-AdminDocsConnections`, le catalogue d'outils du copilote) — et
 * **ce lot ne le lève pas**. Ce fichier n'a donc aucun champ bancaire, aucun
 * moyen d'en porter un, et aucune fonction qui déclenche quoi que ce soit.
 *
 * Ce qu'il fait est ce que personne ne fait aujourd'hui : dire, mois par mois
 * et consultant par consultant, **où en est le paiement qu'on lui doit** — s'il
 * est validé, quand il devait partir, de combien de jours il est en retard, et
 * quel geste HUMAIN vient ensuite.
 *
 * Trois règles gouvernent le fichier, et ce sont celles de son miroir entrant :
 *
 * 1. **Un montant qu'on ne connaît pas vaut `null`, jamais `0` €.** « Zéro à
 *    payer » et « on n'a pas encore la facture du sous-traitant » ne se
 *    corrigent pas de la même façon.
 * 2. **Un état est CONCLU, jamais coché à la main sans sa condition.** Un
 *    paiement ne se valide pas si le relevé qui l'autorise n'est pas validé.
 * 3. **Rien ne part tout seul.** Aucune fonction ici n'envoie, n'ordonne ni ne
 *    déclenche. « Relancer » nomme ce qu'un humain va faire ; le produit
 *    CONSIGNE ce qui est parti.
 */

/**
 * Le cycle d'un paiement sortant. Liste FERMÉE, dans l'ordre du cycle.
 *
 * ⚠️ Ordre = celui de la vie de l'objet, et il ne se réordonne pas : une valeur
 * s'AJOUTE EN FIN (GA-08), jamais au milieu, et sa contrainte SQL est élargie
 * AVANT le code qui l'écrit (GA-11 / GA-12).
 *
 *  - `non_genere` — le mois est là, le relevé aussi, et personne n'a encore
 *    préparé le paiement. C'est l'état par DÉFAUT et le plus coûteux : il ne se
 *    signale nulle part, et le consultant s'en aperçoit avant nous.
 *  - `a_valider` — préparé, en attente d'un humain qui l'assume.
 *  - `valide` — un humain l'a assumé. Le virement peut partir, AILLEURS.
 *  - `paye` — quelqu'un a CONSTATÉ que l'argent est parti. Bellum ne le
 *    constate pas tout seul : il n'a aucun accès bancaire, et prétendre le
 *    contraire serait un chiffre inventé.
 *  - `rejete` — refusé, avec son MOTIF. Un rejet sans raison ne se relit pas
 *    six mois plus tard, quand on cherchera pourquoi ce consultant a été payé
 *    avec deux mois de retard.
 */
export const OUTGOING_PAYMENT_STATUSES = ['non_genere', 'a_valider', 'valide', 'paye', 'rejete'] as const
export const outgoingPaymentStatusSchema = z.enum(OUTGOING_PAYMENT_STATUSES)
export type OutgoingPaymentStatus = (typeof OUTGOING_PAYMENT_STATUSES)[number]

/**
 * Le motif de rejet, borné.
 *
 * Même borne que `rejectTimesheetSchema` et que `cancelInvoicedSchema` : un
 * champ qui laisse taper ce que le serveur refuse ment à celui qui l'écrit. Le
 * réglage vit ICI et le formulaire l'importe — deux `500` recopiés divergent.
 */
export const OUTGOING_PAYMENT_REASON_MAX = 500

/**
 * La ligne que l'écran affiche : un mois, un consultant, une mission.
 *
 * ⚠️ `id` est NULLABLE, et c'est le cœur du modèle. Un paiement `non_genere`
 * n'a PAS de ligne en base — il est DÉDUIT d'un relevé validé qu'aucun paiement
 * ne couvre encore. Créer une ligne par mois et par consultant « au cas où »
 * fabriquerait des milliers d'objets vides dont aucun ne porte de décision, et
 * le compteur « paiement non généré » mesurerait alors notre propre semis.
 */
export const outgoingPaymentSchema = z.object({
  /** `null` = rien n'est encore en base : le paiement est DÉDUIT du relevé. */
  id: z.string().guid().nullable(),
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  accountId: z.string().guid().nullable(),
  accountName: z.string().nullable(),
  /** Le consultant payé. `null` sur une mission sans affectation lisible — le
   *  mois existe quand même, et le taire le ferait disparaître. */
  consultantId: z.string().guid().nullable(),
  consultantName: z.string().nullable(),
  /** Le métier, tel que le vivier le porte (`consultants.title`). Il n'entre
   *  dans AUCUN classement : il désigne, il n'ordonne pas. */
  consultantTitle: z.string().nullable(),
  /** Mois couvert, au premier du mois (`YYYY-MM-DD`). */
  periodMonth: z.string(),
  status: outgoingPaymentStatusSchema,
  /**
   * Ce qu'on DOIT, en centimes. `null` = on ne sait pas encore.
   *
   * ⚠️ JAMAIS `0`. Le montant vient de la facture ENTRANTE du sous-traitant
   * quand elle existe, et d'elle seule — on ne le déduit pas de `jours × TJM`,
   * qui est un chiffre de VENTE et n'a jamais été ce qu'on doit à quelqu'un.
   *
   * ⚠️ Le nom est PROPRE (pas `amountCents`) parce qu'il est inscrit dans
   * `REDACTED_FINANCE_FIELDS` : c'est `redactFinance` qui le vide sans
   * `finance:read`, et un nom partagé avec les frais et les factures
   * fournisseur aurait vidé des champs que personne n'a demandé de vider.
   */
  payableAmountCents: z.number().int().nullable(),
  /**
   * Ce qui est réellement SORTI, en centimes. Distinct du dû — et l'écart EST
   * l'information, exactement comme entre `invoicedAmountCents` et
   * `paidAmountCents` côté client. `null` tant que rien n'est constaté.
   */
  settledAmountCents: z.number().int().nullable(),
  /**
   * La facture entrante qui JUSTIFIE ce paiement (`supplier_invoices`).
   *
   * `null` = aucune facture rattachée : on ne paie pas sur parole, et l'écran
   * le NOMME au lieu de laisser croire que le dossier est complet.
   */
  supplierInvoiceId: z.string().guid().nullable(),
  supplierInvoiceReference: z.string().nullable(),
  /**
   * Quand le relevé d'activité a été VALIDÉ par le client — la colonne
   * « VALIDATION » de la source.
   *
   * C'est elle qui AUTORISE le paiement, et c'est la jointure que
   * `/missions/encaissements` disait ne pas avoir (« la validation du relevé
   * n'est jamais jointe à la ligne de facturation »). Ici elle l'est, parce que
   * les deux objets partagent la même maille : mission × consultant × mois.
   */
  timesheetValidatedAt: z.string().nullable(),
  /** Les jours du relevé. `null` = aucun relevé — surtout pas 0. */
  timesheetDays: z.number().nullable(),
  /** La date à laquelle le paiement DEVAIT partir. Sans elle, aucun retard
   *  n'est calculable — et « 0 jour de retard » se lirait « il vient
   *  d'échoir ». */
  scheduledOn: z.string().nullable(),
  /** Quand le paiement a été CONSTATÉ. Bellum ne rapproche aucun compte
   *  bancaire (D33) : il enregistre ce que quelqu'un constate. */
  paidOn: z.string().nullable(),
  /** Combien de relances ont été CONSIGNÉES. `0` est ici une VRAIE valeur. */
  remindersSent: z.number().int().nonnegative(),
  lastReminderAt: z.string().nullable(),
  validatedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  /** Ce qu'on reproche au paiement, dans les mots de celui qui l'a refusé.
   *  Jamais vide quand l'état est `rejete` — la contrainte SQL le tient aussi. */
  rejectionReason: z.string().nullable(),
})
export type OutgoingPayment = z.infer<typeof outgoingPaymentSchema>

/**
 * Le retard, en jours pleins, à l'instant `now`.
 *
 * ⚠️ La formule est celle d'`overdueDaysAt` sur les encaissements, à dessein :
 * les deux écrans sont des miroirs, et deux calculs de retard qui divergent de
 * un jour suffisent à ce que personne ne croie plus ni l'un ni l'autre. Ce qui
 * change est le PIVOT — l'échéance de RÈGLEMENT côté client, la date de
 * paiement PRÉVUE côté consultant.
 *
 * `null` sans date lisible : « on ne sait pas » et « zéro jour de retard » ne
 * se corrigent pas de la même façon.
 *
 * Le jour prévu, le retard vaut 0 : il vient d'échoir.
 */
export function paymentOverdueDays(scheduledOn: string | null, now: Date): number | null {
  if (!scheduledOn) return null
  const due = Date.parse(`${scheduledOn.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due)) return null
  return Math.floor((now.getTime() - due) / 86_400_000)
}

/**
 * Les SEAUX de l'entête — les quatre tuiles de la source.
 *
 * ⚠️ Ce ne sont PAS les cinq états : `a_valider` et `non_genere` sont deux
 * choses différentes pour le cycle et **la même** pour la trésorerie — de
 * l'argent qui n'est pas encore sorti. Les tuiles répondent à « où en est
 * l'argent », l'état répond à « qu'est-ce qui bloque ». Les confondre ferait
 * une tuile de plus qui ne dit rien de neuf.
 *
 *  - `paid` — c'est sorti.
 *  - `pending` — validé, pas encore constaté payé, et pas en retard.
 *  - `overdue` — validé, pas payé, et la date prévue est passée.
 *  - `toValidate` — `a_valider` ET `non_genere` : personne ne l'a assumé.
 *
 * Un paiement `rejete` n'entre dans AUCUN seau : il n'est ni sorti, ni en
 * attente de sortir. Le compter en attente promettrait un décaissement que
 * quelqu'un vient explicitement de refuser. Il est compté à part
 * ({@link OutgoingPaymentsSummary.rejected}).
 */
export type OutgoingPaymentBucket = 'paid' | 'pending' | 'overdue' | 'toValidate'

export function outgoingPaymentBucket(payment: OutgoingPayment, now: Date): OutgoingPaymentBucket | null {
  if (payment.status === 'rejete') return null
  if (payment.status === 'paye') return 'paid'
  if (payment.status === 'non_genere' || payment.status === 'a_valider') return 'toValidate'
  // `valide` et rien d'autre à partir d'ici. Sans date prévue, la ligne reste
  // EN ATTENTE : « en retard » n'a pas de sens sans pivot, et « à jour » serait
  // un verdict conclu d'un silence.
  const days = paymentOverdueDays(payment.scheduledOn, now)
  return days !== null && days > 0 ? 'overdue' : 'pending'
}

/**
 * Ce qu'un HUMAIN va faire ensuite sur cette ligne.
 *
 * ⚠️ Aucune de ces actions ne fait sortir un euro. « Relancer le paiement »
 * nomme un geste hors de Bellum et CONSIGNE qu'il a eu lieu ; « valider »
 * assume une décision ; « préparer » réclame la pièce qui manque. Le virement,
 * lui, se fait dans la banque — Bellum n'y a aucun accès et n'en veut aucun.
 *
 * `null` = rien à faire (c'est payé, ou c'est refusé et la décision est prise).
 */
export type OutgoingPaymentAction =
  | { kind: 'attach_supplier_invoice' }
  | { kind: 'await_timesheet_validation' }
  | { kind: 'generate_payment' }
  | { kind: 'validate_payment' }
  | { kind: 'set_scheduled_date' }
  | { kind: 'remind_payment' }
  | { kind: 'wait' }

export function nextOutgoingPaymentAction(payment: OutgoingPayment, now: Date): OutgoingPaymentAction | null {
  // Une décision PRISE ne réclame plus rien. Un rejet se rouvre par un geste
  // explicite, pas par une action suggérée qui ferait oublier qu'un humain a
  // dit non.
  if (payment.status === 'paye' || payment.status === 'rejete') return null

  // Le relevé passe AVANT tout le reste : sans validation client, il n'y a rien
  // à payer, et proposer « valider le paiement » ferait sauter la seule
  // condition qui protège l'ESN d'un décaissement sur des jours contestés.
  if (!payment.timesheetValidatedAt) return { kind: 'await_timesheet_validation' }

  // Puis la pièce. On ne paie pas sur parole : sans facture entrante, le
  // paiement n'a aucun justificatif, et c'est le geste amont qui manque.
  if (!payment.supplierInvoiceId) return { kind: 'attach_supplier_invoice' }

  if (payment.status === 'non_genere') return { kind: 'generate_payment' }
  if (payment.status === 'a_valider') return { kind: 'validate_payment' }

  // `valide` à partir d'ici. Réparable en une saisie, et le taire ferait passer
  // le paiement pour « sous contrôle ».
  if (!payment.scheduledOn) return { kind: 'set_scheduled_date' }
  const days = paymentOverdueDays(payment.scheduledOn, now)
  return days !== null && days > 0 ? { kind: 'remind_payment' } : { kind: 'wait' }
}

/**
 * Un seau : combien de lignes, et combien d'euros QUAND c'est lisible.
 *
 * ⚠️ `amountCents` vaut `null` quand aucune ligne du seau n'a de montant —
 * sans `finance:read` le serveur les vide TOUTES, et une somme qui rendrait
 * alors `0` annoncerait « rien à payer » à quelqu'un qui n'a simplement pas le
 * droit de voir. C'est le défaut « COALESCE d'une somme transforme une absence
 * en zéro », déjà payé une fois sur l'écran miroir.
 *
 * Sur un seau VIDE, `0` est VRAI : il n'y a rien, et c'est une information.
 */
export type OutgoingPaymentTotals = {
  count: number
  totalAmountCents: number | null
  /** Combien de lignes du seau n'ont AUCUN montant. Sans ce compteur, un total
   *  partiel se lit comme un total. */
  withoutAmount: number
}

export type OutgoingPaymentsSummary = {
  paid: OutgoingPaymentTotals
  pending: OutgoingPaymentTotals
  overdue: OutgoingPaymentTotals
  toValidate: OutgoingPaymentTotals
  /** Les refusés, comptés à part et hors des quatre tuiles. */
  rejected: number
  /** Les paiements validés dont personne n'a saisi la date prévue : ni « à
   *  venir », ni « en retard ». Les ranger en attente sans le dire ferait
   *  croire qu'ils sont sous contrôle. */
  withoutScheduledDate: number
}

export function summarizeOutgoingPayments(payments: readonly OutgoingPayment[], now: Date): OutgoingPaymentsSummary {
  const buckets: Record<OutgoingPaymentBucket, { count: number; known: number; withoutAmount: number }> = {
    paid: { count: 0, known: 0, withoutAmount: 0 },
    pending: { count: 0, known: 0, withoutAmount: 0 },
    overdue: { count: 0, known: 0, withoutAmount: 0 },
    toValidate: { count: 0, known: 0, withoutAmount: 0 },
  }
  let rejected = 0
  let withoutScheduledDate = 0

  for (const payment of payments) {
    const bucket = outgoingPaymentBucket(payment, now)
    if (bucket === null) {
      rejected += 1
      continue
    }
    const totals = buckets[bucket]
    totals.count += 1
    if (payment.status === 'valide' && !payment.scheduledOn) withoutScheduledDate += 1
    // Le montant qui compte pour un seau : ce qui est SORTI sur un paiement
    // constaté, ce qui est DÛ partout ailleurs. Les confondre ferait compter
    // deux fois un paiement partiel — le défaut déjà payé sur l'écran miroir.
    const amount = bucket === 'paid' ? payment.settledAmountCents : payment.payableAmountCents
    if (amount === null || !Number.isFinite(amount)) totals.withoutAmount += 1
    else totals.known += amount
  }

  const seal = (totals: { count: number; known: number; withoutAmount: number }): OutgoingPaymentTotals => ({
    count: totals.count,
    // Aucun montant lisible sur un seau NON VIDE ⇒ on ne sait pas, jamais 0.
    totalAmountCents: totals.count > 0 && totals.withoutAmount === totals.count ? null : totals.known,
    withoutAmount: totals.withoutAmount,
  })

  return {
    paid: seal(buckets.paid),
    pending: seal(buckets.pending),
    overdue: seal(buckets.overdue),
    toValidate: seal(buckets.toValidate),
    rejected,
    withoutScheduledDate,
  }
}

/**
 * Peut-on VALIDER ce paiement, et sinon pourquoi ?
 *
 * ⚠️ Ce prédicat vit ICI et le serveur l'importe : c'est lui qui refuse, pas
 * l'écran. Un contrôle qui n'existe que dans un formulaire est un contrôle
 * qu'un appel direct contourne — et ce qu'il protège est un décaissement.
 *
 * Deux conditions, dans cet ordre, parce que le premier manque rend le second
 * sans objet :
 *  1. le relevé d'activité est VALIDÉ par le client (la colonne « VALIDATION ») ;
 *  2. une facture entrante justifie le montant.
 */
export type OutgoingPaymentBlocker = 'timesheet_not_validated' | 'missing_supplier_invoice' | 'already_settled'

export function outgoingPaymentBlockers(
  payment: Pick<OutgoingPayment, 'status' | 'timesheetValidatedAt' | 'supplierInvoiceId'>,
): OutgoingPaymentBlocker[] {
  const blockers: OutgoingPaymentBlocker[] = []
  // Un paiement déjà constaté payé ne se re-valide pas : le geste serait sans
  // effet, et le proposer ferait douter de ce que « payé » veut dire.
  if (payment.status === 'paye') blockers.push('already_settled')
  if (!payment.timesheetValidatedAt) blockers.push('timesheet_not_validated')
  if (!payment.supplierInvoiceId) blockers.push('missing_supplier_invoice')
  return blockers
}

/** La fenêtre que l'écran interroge, en mois. Le réglage vit ICI (GA-26) :
 *  l'API et l'écran l'importent tous les deux, et deux `12` recopiés
 *  divergeraient le jour où l'un des deux change. */
export const OUTGOING_PAYMENTS_WINDOW_MONTHS = 12

export const outgoingPaymentsQuerySchema = z
  .object({
    /** Mois à examiner (`YYYY-MM`). Défaut côté service : le mois précédent —
     *  le 5 du mois, la question n'est pas « où en est le mois en cours ». */
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
      .optional(),
    status: outgoingPaymentStatusSchema.optional(),
    /** Resserre sur un compte CLIENT — le filtre « Tous les clients ». */
    accountId: z.string().guid().optional(),
    /** Recherche libre sur le consultant, le client ou la mission. */
    search: z.string().trim().max(120).optional(),
  })
  .strict()
export type OutgoingPaymentsQuery = z.infer<typeof outgoingPaymentsQuerySchema>

/**
 * PRÉPARER le paiement d'un mois — `non_genere` → `a_valider`.
 *
 * Il ne fait sortir aucun euro : il matérialise l'objet à partir du relevé
 * validé et de la facture entrante, pour qu'un humain ait quelque chose à
 * assumer. Le montant n'est PAS demandé ici : il vient de la facture, et le
 * saisir à la main ferait deux vérités pour un seul dû.
 */
export const generateOutgoingPaymentSchema = z
  .object({
    missionId: z.string().guid(),
    /** `null` explicite = la mission n'a pas d'affectation lisible sur ce mois.
     *  On le DIT, on ne l'omet pas — un champ absent d'un objet littéral est
     *  exactement ce qu'un « facultatif » laisse oublier. */
    consultantId: z.string().guid().nullable(),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    /** La date à laquelle le paiement devrait partir (`YYYY-MM-DD`).
     *  Optionnelle : on ne DEVINE pas une date de paiement, et l'écran nomme
     *  celle qui manque au lieu d'en inventer une. */
    scheduledOn: z.string().date().optional(),
  })
  .strict()
export type GenerateOutgoingPaymentInput = z.infer<typeof generateOutgoingPaymentSchema>

/** Assumer le paiement — `a_valider` → `valide`. Un geste d'UTILISATEUR, donc
 *  auto-approuvé : le clic EST la décision. */
export const validateOutgoingPaymentSchema = z
  .object({
    /** La date prévue, si elle n'a pas encore été posée. */
    scheduledOn: z.string().date().optional(),
  })
  .strict()
export type ValidateOutgoingPaymentInput = z.infer<typeof validateOutgoingPaymentSchema>

/**
 * CONSTATER le paiement — `valide` → `paye`.
 *
 * Bellum ne rapproche aucun compte bancaire (D33) et n'a aucun accès bancaire :
 * il enregistre ce qu'un humain constate. C'est la même honnêteté que
 * « facturé ailleurs » côté client.
 */
export const settleOutgoingPaymentSchema = z
  .object({
    /** Quand l'argent est parti (`YYYY-MM-DD`). Absent = aujourd'hui. */
    paidOn: z.string().date().optional(),
    /** Ce qui est réellement sorti, en centimes. JAMAIS déduit du dû : un
     *  paiement partiel arrive, et le recopier ferait disparaître l'écart. */
    settledAmountCents: z.number().int().positive().optional(),
  })
  .strict()
export type SettleOutgoingPaymentInput = z.infer<typeof settleOutgoingPaymentSchema>

/**
 * REFUSER le paiement — le motif est OBLIGATOIRE, ici comme en base.
 *
 * Même forme que `rejectTimesheetSchema` et `cancelInvoicedSchema`, à dessein :
 * un rejet sans raison est exactement ce qu'on ne saura pas relire dans six
 * mois, et le consultant qui demande pourquoi mérite mieux qu'un état.
 */
export const rejectOutgoingPaymentSchema = z
  .object({ reason: z.string().trim().min(1).max(OUTGOING_PAYMENT_REASON_MAX) })
  .strict()
export type RejectOutgoingPaymentInput = z.infer<typeof rejectOutgoingPaymentSchema>

/**
 * CONSIGNER une relance, sur un LOT — le bouton « Relancer les paiements ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'ENVOIE PAS, ET POURQUOI IL N'ÉCRIT PAS UN SECOND MÉCANISME
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Rien ne part d'ici.** Un mécanisme d'envoi GOUVERNÉ existe déjà —
 * `POST /mailbox/batch`, idempotent par `batchId`, adossé à la boîte
 * PERSONNELLE de l'utilisateur et à son approbation. En écrire un second
 * signifierait deux portes vers le même envoi, et l'une des deux finirait par
 * diverger de l'autre sur l'approbation ou sur le journal.
 *
 * Ce lot ne l'appelle pas non plus : la doctrine du produit est « le copilote
 * prépare, le commercial envoie », et la relance d'un paiement se fait dans les
 * mots de celui qui la fait. Ce que le produit apporte est ce qui manquait —
 * consigner en UN geste ce qui se consignait ligne par ligne, sur les lignes
 * qu'on a sous les yeux.
 */
export const remindOutgoingPaymentsSchema = z
  .object({
    /** Les paiements à marquer relancés. Bornée : un lot qui traverse tout
     *  l'espace n'est plus un geste, c'est une routine — et une routine
     *  passerait par une porte, avec sa prévisualisation figée. */
    paymentIds: z.array(z.string().guid()).min(1).max(200),
  })
  .strict()
export type RemindOutgoingPaymentsInput = z.infer<typeof remindOutgoingPaymentsSchema>

/**
 * Ce qu'un lot de relances a RÉELLEMENT fait.
 *
 * ⚠️ `skipped` n'est pas décoratif : un paiement payé ou refusé entre-temps ne
 * se relance pas, et rendre « 12 relancés » quand trois ont été écartés ferait
 * croire à un geste qui n'a pas eu lieu. « Une erreur se remarque, une liste
 * vide se croit. »
 */
export const remindOutgoingPaymentsResultSchema = z.object({
  reminded: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})
export type RemindOutgoingPaymentsResult = z.infer<typeof remindOutgoingPaymentsResultSchema>

/**
 * L'état QUALIFIÉ que la route de liste rend — jamais un tableau nu.
 *
 * « Une erreur se remarque, une liste vide se croit » : sans `canReadFinance`
 * ni `month`, un écran vide se lit « rien à payer ce mois-ci » aussi bien que
 * « tu n'as pas le droit de voir les montants » ou « la fenêtre est le mauvais
 * mois ». Les trois se réparent différemment.
 */
export const outgoingPaymentsPageSchema = z.object({
  month: z.string(),
  items: z.array(outgoingPaymentSchema),
  summary: z.object({
    paid: z.object({
      count: z.number().int().nonnegative(),
      totalAmountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    pending: z.object({
      count: z.number().int().nonnegative(),
      totalAmountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    overdue: z.object({
      count: z.number().int().nonnegative(),
      totalAmountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    toValidate: z.object({
      count: z.number().int().nonnegative(),
      totalAmountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    rejected: z.number().int().nonnegative(),
    withoutScheduledDate: z.number().int().nonnegative(),
  }),
  /** Le lecteur a-t-il le droit de voir les montants ? `false` = ils sont
   *  RETIRÉS (`null`), jamais mis à zéro — un champ financier se retire. */
  canReadFinance: z.boolean(),
})
export type OutgoingPaymentsPage = z.infer<typeof outgoingPaymentsPageSchema>

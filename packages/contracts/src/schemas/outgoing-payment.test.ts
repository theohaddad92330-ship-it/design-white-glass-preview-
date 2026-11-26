import { describe, expect, it } from 'vitest'
import { redactFinance } from './staffing.js'
import {
  nextOutgoingPaymentAction,
  outgoingPaymentBlockers,
  outgoingPaymentBucket,
  outgoingPaymentSchema,
  OUTGOING_PAYMENT_STATUSES,
  paymentOverdueDays,
  rejectOutgoingPaymentSchema,
  remindOutgoingPaymentsSchema,
  settleOutgoingPaymentSchema,
  summarizeOutgoingPayments,
  type OutgoingPayment,
} from './outgoing-payment.js'

/** Une ligne minimale et VALIDE — chaque test ne surcharge que ce qu'il teste. */
function payment(overrides: Partial<OutgoingPayment> = {}): OutgoingPayment {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    missionId: '22222222-2222-4222-8222-222222222222',
    missionLabel: 'Renfort exploitation',
    accountId: '33333333-3333-4333-8333-333333333333',
    accountName: 'NOVA LOGISTIQUE',
    consultantId: '44444444-4444-4444-8444-444444444444',
    consultantName: 'Salomé Dufour',
    consultantTitle: 'Data Engineer',
    periodMonth: '2026-07-01',
    status: 'valide',
    payableAmountCents: 1_497_300,
    settledAmountCents: null,
    supplierInvoiceId: '55555555-5555-4555-8555-555555555555',
    supplierInvoiceReference: 'F-2026-0714',
    timesheetValidatedAt: '2026-07-14T09:00:00.000Z',
    timesheetDays: 18,
    scheduledOn: '2026-07-15',
    paidOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    validatedAt: '2026-07-10T09:00:00.000Z',
    rejectedAt: null,
    rejectionReason: null,
    ...overrides,
  }
}

const NOW = new Date('2026-07-20T12:00:00.000Z')

describe('le contrat du paiement sortant', () => {
  it('accepte une ligne complète', () => {
    expect(outgoingPaymentSchema.parse(payment())).toBeTruthy()
  })

  it('accepte un paiement SANS ligne en base — `non_genere` est déduit, pas semé', () => {
    const deduced = payment({ id: null, status: 'non_genere', validatedAt: null })
    expect(outgoingPaymentSchema.parse(deduced).id).toBeNull()
  })

  it('garde l’ordre du cycle — une valeur s’ajoute EN FIN, jamais au milieu (GA-08)', () => {
    // Réordonner cet enum réécrirait le sens de valeurs déjà en base.
    expect(OUTGOING_PAYMENT_STATUSES).toEqual(['non_genere', 'a_valider', 'valide', 'paye', 'rejete'])
  })

  it('refuse un montant qui n’est pas un entier de centimes', () => {
    expect(() => outgoingPaymentSchema.parse(payment({ payableAmountCents: 12.5 }))).toThrow()
  })

  it('accepte un montant ABSENT — « non mesuré » n’est jamais « 0 »', () => {
    expect(outgoingPaymentSchema.parse(payment({ payableAmountCents: null })).payableAmountCents).toBeNull()
  })
})

describe('le retard, en jours', () => {
  it('compte les jours pleins depuis la date prévue', () => {
    expect(paymentOverdueDays('2026-07-15', NOW)).toBe(5)
  })

  it('vaut 0 le jour prévu — il vient d’échoir, il n’est pas en retard', () => {
    expect(paymentOverdueDays('2026-07-20', NOW)).toBe(0)
  })

  it('rend `null` sans date — « on ne sait pas » ne se répare pas comme « zéro »', () => {
    expect(paymentOverdueDays(null, NOW)).toBeNull()
  })

  it('rend `null` sur une date illisible plutôt qu’un NaN qui se propage', () => {
    expect(paymentOverdueDays('pas-une-date', NOW)).toBeNull()
  })

  it('rend un nombre NÉGATIF avant l’échéance — le pivot ne s’écrase pas à zéro', () => {
    expect(paymentOverdueDays('2026-07-30', NOW)).toBe(-10)
  })
})

describe('les quatre seaux de l’entête', () => {
  it('range un paiement constaté payé dans « payé »', () => {
    expect(outgoingPaymentBucket(payment({ status: 'paye', paidOn: '2026-07-14' }), NOW)).toBe('paid')
  })

  it('range `non_genere` ET `a_valider` dans le MÊME seau — les deux ne sont pas sortis', () => {
    expect(outgoingPaymentBucket(payment({ status: 'non_genere', id: null }), NOW)).toBe('toValidate')
    expect(outgoingPaymentBucket(payment({ status: 'a_valider' }), NOW)).toBe('toValidate')
  })

  it('range un validé dont la date est passée dans « en retard »', () => {
    expect(outgoingPaymentBucket(payment({ scheduledOn: '2026-07-15' }), NOW)).toBe('overdue')
  })

  it('range un validé SANS date prévue en attente, jamais en retard', () => {
    // « En retard » n'a pas de sens sans pivot ; « à jour » serait un verdict
    // conclu d'un silence. C'est `withoutScheduledDate` qui porte la vérité.
    expect(outgoingPaymentBucket(payment({ scheduledOn: null }), NOW)).toBe('pending')
  })

  it('n’range un REJETÉ dans AUCUN seau — il n’est ni sorti, ni en attente de sortir', () => {
    const rejected = payment({ status: 'rejete', rejectedAt: '2026-07-12T09:00:00Z', rejectionReason: 'Doublon' })
    expect(outgoingPaymentBucket(rejected, NOW)).toBeNull()
  })
})

describe('le résumé de la fenêtre', () => {
  it('compte les lignes et somme les montants par seau', () => {
    const summary = summarizeOutgoingPayments(
      [
        // Le seau « payé » somme ce qui est SORTI, pas ce qui était dû : les
        // confondre ferait compter deux fois un paiement partiel.
        payment({ status: 'paye', paidOn: '2026-07-14', payableAmountCents: 1_200_00, settledAmountCents: 1_000_00 }),
        payment({ scheduledOn: '2026-07-15', payableAmountCents: 500_00 }),
        payment({ scheduledOn: '2026-07-15', payableAmountCents: 300_00 }),
      ],
      NOW,
    )
    expect(summary.paid).toEqual({ count: 1, totalAmountCents: 1_000_00, withoutAmount: 0 })
    expect(summary.overdue).toEqual({ count: 2, totalAmountCents: 800_00, withoutAmount: 0 })
  })

  it('compte un paiement constaté SANS montant sorti comme « sans montant », jamais comme 0 €', () => {
    // Le cas réel : quelqu'un marque « payé » sans saisir ce qui est parti.
    // Sommer le DÛ à sa place annoncerait un décaissement qui n'a pas été
    // constaté, et sommer `0` annoncerait qu'il n'y en a pas eu.
    const summary = summarizeOutgoingPayments(
      [payment({ status: 'paye', paidOn: '2026-07-14', payableAmountCents: 900_00, settledAmountCents: null })],
      NOW,
    )
    expect(summary.paid).toEqual({ count: 1, totalAmountCents: null, withoutAmount: 1 })
  })

  it('rend `null` — jamais 0 — quand AUCUNE ligne du seau n’a de montant', () => {
    // Le défaut « COALESCE d'une somme transforme une absence en zéro » : sans
    // `finance:read`, le serveur vide tous les montants, et « 0 € à payer » se
    // lirait « rien à payer » par quelqu'un qui n'a pas le droit de voir.
    const summary = summarizeOutgoingPayments(
      [payment({ payableAmountCents: null }), payment({ payableAmountCents: null })],
      NOW,
    )
    expect(summary.overdue.totalAmountCents).toBeNull()
    expect(summary.overdue.withoutAmount).toBe(2)
  })

  it('rend 0 sur un seau VIDE — là, zéro est VRAI', () => {
    expect(summarizeOutgoingPayments([], NOW).paid).toEqual({ count: 0, totalAmountCents: 0, withoutAmount: 0 })
  })

  it('somme ce qui est chiffré et COMPTE ce qui ne l’est pas, sans confondre les deux', () => {
    const summary = summarizeOutgoingPayments(
      [payment({ payableAmountCents: 400_00 }), payment({ payableAmountCents: null })],
      NOW,
    )
    expect(summary.overdue).toEqual({ count: 2, totalAmountCents: 400_00, withoutAmount: 1 })
  })

  it('compte les rejetés À PART, hors des quatre tuiles', () => {
    const summary = summarizeOutgoingPayments(
      [payment({ status: 'rejete', rejectionReason: 'Facture en double' }), payment()],
      NOW,
    )
    expect(summary.rejected).toBe(1)
    expect(summary.paid.count + summary.pending.count + summary.overdue.count + summary.toValidate.count).toBe(1)
  })

  it('compte les validés sans date prévue — les ranger en attente sans le dire les ferait croire sous contrôle', () => {
    const summary = summarizeOutgoingPayments([payment({ scheduledOn: null })], NOW)
    expect(summary.withoutScheduledDate).toBe(1)
  })
})

describe('la prochaine action — et aucune ne fait sortir un euro', () => {
  it('ne propose RIEN sur un paiement constaté payé', () => {
    expect(nextOutgoingPaymentAction(payment({ status: 'paye', paidOn: '2026-07-14' }), NOW)).toBeNull()
  })

  it('ne propose RIEN sur un rejet — un humain a dit non, la décision est prise', () => {
    const rejected = payment({ status: 'rejete', rejectionReason: 'Doublon' })
    expect(nextOutgoingPaymentAction(rejected, NOW)).toBeNull()
  })

  it('réclame la VALIDATION du relevé avant tout le reste', () => {
    // Sans elle, il n'y a rien à payer, et proposer « valider le paiement »
    // ferait sauter la seule condition qui protège d'un décaissement sur des
    // jours que le client n'a jamais signés.
    const notValidated = payment({ status: 'a_valider', timesheetValidatedAt: null, supplierInvoiceId: null })
    expect(nextOutgoingPaymentAction(notValidated, NOW)).toEqual({ kind: 'await_timesheet_validation' })
  })

  it('réclame ensuite la facture entrante — on ne paie pas sur parole', () => {
    const noInvoice = payment({ status: 'a_valider', supplierInvoiceId: null, supplierInvoiceReference: null })
    expect(nextOutgoingPaymentAction(noInvoice, NOW)).toEqual({ kind: 'attach_supplier_invoice' })
  })

  it('propose de préparer le paiement quand rien n’est en base', () => {
    expect(nextOutgoingPaymentAction(payment({ id: null, status: 'non_genere' }), NOW)).toEqual({
      kind: 'generate_payment',
    })
  })

  it('propose de valider un paiement préparé', () => {
    expect(nextOutgoingPaymentAction(payment({ status: 'a_valider' }), NOW)).toEqual({ kind: 'validate_payment' })
  })

  it('propose de saisir la date prévue quand elle manque — réparable en une saisie', () => {
    expect(nextOutgoingPaymentAction(payment({ scheduledOn: null }), NOW)).toEqual({ kind: 'set_scheduled_date' })
  })

  it('propose de relancer un paiement validé et en retard', () => {
    expect(nextOutgoingPaymentAction(payment({ scheduledOn: '2026-07-15' }), NOW)).toEqual({ kind: 'remind_payment' })
  })

  it('dit d’attendre quand la date prévue n’est pas encore passée', () => {
    expect(nextOutgoingPaymentAction(payment({ scheduledOn: '2026-07-30' }), NOW)).toEqual({ kind: 'wait' })
  })
})

describe('ce qui EMPÊCHE de valider un paiement', () => {
  it('ne bloque rien quand le relevé est validé et la facture rattachée', () => {
    expect(outgoingPaymentBlockers(payment({ status: 'a_valider' }))).toEqual([])
  })

  it('nomme le relevé non validé', () => {
    expect(outgoingPaymentBlockers(payment({ status: 'a_valider', timesheetValidatedAt: null }))).toContain(
      'timesheet_not_validated',
    )
  })

  it('nomme la facture entrante manquante', () => {
    expect(outgoingPaymentBlockers(payment({ status: 'a_valider', supplierInvoiceId: null }))).toContain(
      'missing_supplier_invoice',
    )
  })

  it('refuse de re-valider un paiement déjà constaté payé', () => {
    expect(outgoingPaymentBlockers(payment({ status: 'paye' }))).toContain('already_settled')
  })
})

describe('les entrées d’écriture', () => {
  it('exige un motif NON VIDE au rejet', () => {
    expect(() => rejectOutgoingPaymentSchema.parse({ reason: '   ' })).toThrow()
    expect(rejectOutgoingPaymentSchema.parse({ reason: '  Facture en double  ' }).reason).toBe('Facture en double')
  })

  it('borne le motif de rejet comme le formulaire le borne', () => {
    expect(() => rejectOutgoingPaymentSchema.parse({ reason: 'x'.repeat(501) })).toThrow()
  })

  it('refuse un montant constaté nul ou négatif — un décaissement de 0 € n’est pas un paiement', () => {
    expect(() => settleOutgoingPaymentSchema.parse({ settledAmountCents: 0 })).toThrow()
    expect(() => settleOutgoingPaymentSchema.parse({ settledAmountCents: -1 })).toThrow()
  })

  it('n’accepte AUCUN champ bancaire — Bellum ne stocke aucun IBAN', () => {
    // `.strict()` est ce qui tient le refus : un champ de plus est rejeté, il
    // n'est pas silencieusement ignoré. C'est la garde qui sait dire NON.
    expect(() => settleOutgoingPaymentSchema.parse({ iban: 'FR7630006000011234567890189' })).toThrow()
    expect(() => rejectOutgoingPaymentSchema.parse({ reason: 'ok', iban: 'FR76' })).toThrow()
  })

  it('borne le lot de relances — au-delà, ce n’est plus un geste, c’est une routine', () => {
    expect(() => remindOutgoingPaymentsSchema.parse({ paymentIds: [] })).toThrow()
    const ids = Array.from({ length: 201 }, () => '11111111-1111-4111-8111-111111111111')
    expect(() => remindOutgoingPaymentsSchema.parse({ paymentIds: ids })).toThrow()
  })
})

describe('la rédaction financière atteint RÉELLEMENT les montants de cet écran', () => {
  it('vide les trois champs de montant sans `finance:read` — et ne les met JAMAIS à 0', () => {
    // ⚠️ La garde qui manquait au moment d'écrire ce lot : `redactFinance` ne
    // vide que les noms inscrits dans `REDACTED_FINANCE_FIELDS`. Un champ
    // nommé `amountCents` serait passé À TRAVERS sans que rien ne le dise —
    // c'est le défaut « garde borgne » : verte sur ce qu'elle ne regarde pas.
    // C'est aussi la raison pour laquelle les trois champs portent un nom
    // PROPRE plutôt que le `amountCents` des frais et des factures.
    const redacted = redactFinance(
      { payableAmountCents: 1_000_00, settledAmountCents: 900_00, totalAmountCents: 1_900_00 },
      false,
    )
    expect(redacted).toEqual({ payableAmountCents: null, settledAmountCents: null, totalAmountCents: null })
  })

  it('sait dire NON — avec le droit, elle ne touche à rien', () => {
    const kept = { payableAmountCents: 1_000_00, settledAmountCents: 900_00, totalAmountCents: 1_900_00 }
    expect(redactFinance({ ...kept }, true)).toEqual(kept)
  })

  it('laisse le NOMBRE de lignes intact — compter n’est pas une donnée financière', () => {
    // Le nombre de paiements en retard doit rester lisible par un gestionnaire
    // qui n'a pas le droit aux montants : c'est ce qui lui permet d'aller les
    // chercher. Seul le MONTANT se retire.
    expect(redactFinance({ count: 3, totalAmountCents: 500_00, withoutAmount: 0 }, false)).toEqual({
      count: 3,
      totalAmountCents: null,
      withoutAmount: 0,
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  MAX_REMINDERS,
  PAYMENT_REMINDER_SCHEDULE_DAYS,
  REMINDER_SCHEDULE_DAYS,
  TIMESHEET_REMINDER_SCHEDULE_DAYS,
  assessInvoiceReadiness,
  craStatusOf,
  disputeInvoiceSchema,
  invoiceReadinessQuerySchema,
  invoiceReadinessSchema,
  isCraBlocked,
  isDisputeOpen,
  isPartiallyPaid,
  isSettled,
  outstandingAmountCents,
  reminderDue,
  summarizeReadiness,
  type InvoiceBlocker,
  type InvoiceReadiness,
} from './invoice-readiness.js'

// ── Le `missionId` de la fiche mission (30/08/2026) ─────────────────────────
//
// `invoiceReadinessQuerySchema` est `.strict()` : un champ non déclaré est
// REFUSÉ, ce qui est le point — un appelant qui devine un nom de paramètre
// silencieusement ignoré ne le saurait jamais. Ce test prouve que le champ est
// bien DÉCLARÉ, optionnel, et qu'un UUID malformé reste refusé.
describe('invoiceReadinessQuerySchema — resserrer sur UNE mission', () => {
  const MISSION = '00000000-0000-4000-8000-000000000001'

  it('accepte un `missionId` UUID, en plus du mois', () => {
    const result = invoiceReadinessQuerySchema.safeParse({ month: '2026-08', missionId: MISSION })
    expect(result.success).toBe(true)
    expect(result.success && result.data.missionId).toBe(MISSION)
  })

  it('reste optionnel — l’ancien appelant, sans `missionId`, n’est pas cassé', () => {
    const result = invoiceReadinessQuerySchema.safeParse({ blockedOnly: 'true' })
    expect(result.success).toBe(true)
    expect(result.success && result.data.missionId).toBeUndefined()
  })

  it('refuse un `missionId` qui n’est pas un UUID — on ne devine pas un identifiant', () => {
    expect(invoiceReadinessQuerySchema.safeParse({ missionId: 'pas-un-uuid' }).success).toBe(false)
  })
})

const RATE = 65_000 // 650 € en centimes

function validated(days = 18) {
  return { status: 'validated' as const, days, anomalies: [] as string[] }
}

describe('assessInvoiceReadiness', () => {
  it('est PRÊT quand tout est là', () => {
    const result = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.state).toBe('ready')
    expect(result.blockers).toEqual([])
    expect(result.preparedAmountCents).toBe(18 * RATE)
  })

  it('met « relevé manquant » EN TÊTE — c’est le mois qui passe sans qu’on le voie', () => {
    const result = assessInvoiceReadiness({
      timesheet: null,
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.blockers[0]).toBe('missing_timesheet')
    expect(result.state).toBe('blocked')
  })

  it('distingue « pas de relevé » de « zéro jour »', () => {
    // Un mois sans relevé n'est pas un mois à zéro jour travaillé : les deux ne
    // se corrigent pas de la même façon.
    const none = assessInvoiceReadiness({
      timesheet: null,
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(none.days).toBeNull()
    expect(none.preparedAmountCents).toBeNull()
  })

  it('bloque sur un relevé non soumis, non validé, ou contesté', () => {
    const draft = assessInvoiceReadiness({
      timesheet: { status: 'draft', days: 18, anomalies: [] },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(draft.blockers).toContain('timesheet_not_submitted')

    const submitted = assessInvoiceReadiness({
      timesheet: { status: 'submitted', days: 18, anomalies: [] },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(submitted.blockers).toContain('timesheet_not_validated')

    const disputed = assessInvoiceReadiness({
      timesheet: { status: 'disputed', days: 18, anomalies: [] },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    // Facturer par-dessus une contestation la transforme en litige.
    expect(disputed.blockers).toContain('timesheet_disputed')
  })

  it('bloque sur une ANOMALIE même quand le client a validé', () => {
    // Le client a signé, mais l'écart n'a pas été expliqué : il reviendra dans
    // trois mois sous forme d'avoir.
    const result = assessInvoiceReadiness({
      timesheet: { status: 'validated', days: 22, anomalies: ['2 jours au-delà de la charge attendue'] },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.blockers).toContain('timesheet_anomalies')
    expect(result.state).toBe('blocked')
  })

  /**
   * L'EXPLICATION D'ÉCART LÈVE L'ANOMALIE D'ÉCART — et rien d'autre.
   *
   * `BLOCKER_ACTIONS.timesheet_anomalies` déclare `action: 'explain_gap'` : le
   * geste qui lève ce bloqueur EST l'explication. Elle ne le levait pas. Sur un
   * espace réel (01/09/2026), après avoir expliqué les sept écarts du mois,
   * NEUF missions restaient « bloquées : anomalies » — pendant que l'écran des
   * relevés disait `blocksInvoicing: false` sur les mêmes lignes. Deux écrans,
   * le même fait, deux réponses opposées, et aucun geste pour sortir.
   */
  it('ne bloque plus sur l’anomalie d’écart une fois l’écart EXPLIQUÉ', () => {
    const result = assessInvoiceReadiness({
      timesheet: {
        status: 'validated',
        days: 17,
        gap: -4,
        gapExplanation: 'Congés posés et validés par le client',
        anomalies: ['Il manque 4 jour(s) par rapport aux jours ouvrés du mois (21).'],
      },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.blockers).not.toContain('timesheet_anomalies')
    expect(result.blockers).not.toContain('unexplained_gap')
  })

  it('bloque toujours tant que l’écart n’est PAS expliqué', () => {
    const result = assessInvoiceReadiness({
      timesheet: {
        status: 'validated',
        days: 17,
        gap: -4,
        gapExplanation: null,
        anomalies: ['Il manque 4 jour(s) par rapport aux jours ouvrés du mois (21).'],
      },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.blockers).toContain('timesheet_anomalies')
  })

  it('une anomalie que l’écart n’explique PAS continue de bloquer — doublon, chevauchement, quart de journée', () => {
    const result = assessInvoiceReadiness({
      timesheet: {
        status: 'validated',
        days: 17,
        gap: -4,
        gapExplanation: 'Congés posés et validés par le client',
        anomalies: [
          'Il manque 4 jour(s) par rapport aux jours ouvrés du mois (21).',
          'Un autre relevé sur cette mission pour ce mois a déjà été validé (Marie Dupont) — vérifier qu’il ne s’agit pas d’un doublon.',
        ],
      },
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.blockers).toContain('timesheet_anomalies')
  })

  it('exige le bon de commande SEULEMENT quand la mission le demande', () => {
    const notRequired = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(notRequired.blockers).not.toContain('missing_po')

    const required = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: true,
      poNumber: null,
      invoicedAt: null,
    })
    expect(required.blockers).toContain('missing_po')
  })

  it('ne chiffre RIEN sans TJM, et le dit comme bloqueur', () => {
    const result = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: null,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
    })
    expect(result.blockers).toContain('missing_rate')
    expect(result.preparedAmountCents).toBeNull()
  })

  it('sort un mois déjà facturé AILLEURS de toute surveillance', () => {
    // On ne relance pas un client qui a payé : ce serait la façon la plus sûre
    // de faire douter de tout le reste.
    const result = assessInvoiceReadiness({
      timesheet: null,
      dailyRateCents: null,
      requiresPo: true,
      poNumber: null,
      invoicedAt: '2026-08-10T09:00:00.000Z',
    })
    // #2197.41 — une déclaration humaine n'est pas une preuve de connecteur.
    // Sans `invoiceConfirmedByConnector`, un `invoicedAt` posé est une
    // DÉCLARATION, jamais une facture prouvée : c'est le seul chemin
    // d'écriture qui existe aujourd'hui (`markInvoiced`), et le confondre avec
    // `'invoiced'` est exactement ce que la doctrine du 21/09/2026 corrige.
    expect(result.state).toBe('invoiced_declared')
    expect(result.blockers).toEqual([])
  })

  it('#2197.41 — un `invoicedAt` CONFIRMÉ par le connecteur est PROUVÉ, distinct de la déclaration', () => {
    const result = assessInvoiceReadiness({
      timesheet: null,
      dailyRateCents: null,
      requiresPo: true,
      poNumber: null,
      invoicedAt: '2026-08-10T09:00:00.000Z',
      invoiceConfirmedByConnector: true,
    })
    expect(result.state).toBe('invoiced')
    expect(result.blockers).toEqual([])
  })
})

describe('reminderDue — les relances d’ENCAISSEMENT', () => {
  // Échéance de règlement au 30 septembre. C’est le PIVOT : la source
  // (PDF 6 §6.4) compte les relances À PARTIR DE L’ÉCHÉANCE, pas à partir de
  // la fin du mois travaillé. Un mois d’août facturé à 60 jours n’est pas en
  // retard le 5 septembre : il n’est même pas encore dû.
  const DUE = '2026-09-30'
  // Le litige est ÉCRIT ici, à `null`, et non omis : les deux champs sont
  // obligatoires depuis que leur facultativité a laissé l'écran appeler ce
  // calcul sans eux. « Pas de litige » se dit.
  const invoiced = {
    state: 'invoiced' as const,
    dueOn: DUE,
    paidAt: null,
    // Les deux montants du solde sont ÉCRITS, comme le litige, et pour la même
    // raison : ce qui arrête la cadence est un solde, pas une date (#2419.4).
    paidAmountCents: null,
    invoicedAmountCents: 10_000_00,
    remindersSent: 0,
    disputedAt: null,
    disputeResolvedAt: null,
  }

  it('ne relance PAS avant l’échéance', () => {
    expect(reminderDue(invoiced, new Date('2026-09-20T09:00:00Z'))).toBeNull()
    // Le jour même de l’échéance non plus : elle vient d’échoir.
    expect(reminderDue(invoiced, new Date('2026-09-30T09:00:00Z'))).toBeNull()
  })

  it('le pivot est l’ÉCHÉANCE, jamais la fin du mois travaillé', () => {
    // Le mois travaillé (août) est fini depuis 36 jours le 6 septembre, et
    // l’ancien calcul aurait relancé trois fois. L’échéance, elle, est le 30.
    expect(reminderDue(invoiced, new Date('2026-09-06T09:00:00Z'))).toBeNull()

    // La cadence de PAIEMENT : 7 / 15 / 30 jours après l’échéance — jamais
    // 5 / 12 / 20, qui est la cadence du RELEVÉ et ne relance pas la même
    // personne pour la même raison.
    const due = reminderDue(invoiced, new Date('2026-10-07T09:00:00Z'))
    expect(due?.index).toBe(1)
    expect(due?.overdueDays).toBe(7)
    // L’échéance de la relance elle-même : échéance + le seuil de son rang.
    expect(due?.dueSince).toBe('2026-10-07')
  })

  it('J+6 ne suffit plus — avant le 30/08/2026, la cadence PARTAGÉE relançait déjà à J+5', () => {
    // Le défaut mesuré : relancer un CLIENT à J+5 quand sa facture est réglée
    // à 30 jours l’agace deux à dix jours trop tôt. La cadence de paiement
    // demande désormais J+7 pour le premier rang.
    expect(reminderDue(invoiced, new Date('2026-10-06T09:00:00Z'))).toBeNull()
  })

  it('une échéance INCONNUE ne produit AUCUNE relance', () => {
    // On ne devine pas une date. Sans échéance, « en retard » n’a pas de sens,
    // et relancer au jugé ferait réclamer un paiement qui n’est pas dû.
    expect(reminderDue({ ...invoiced, dueOn: null }, new Date('2027-01-01T09:00:00Z'))).toBeNull()
  })

  it('une échéance ILLISIBLE ne relance pas au hasard', () => {
    expect(reminderDue({ ...invoiced, dueOn: 'plus-tard' }, new Date('2027-01-01T09:00:00Z'))).toBeNull()
  })

  it('n’empile pas : rien avant l’échéance de la relance suivante', () => {
    const sent = { ...invoiced, remindersSent: 1 }
    expect(reminderDue(sent, new Date('2026-10-05T09:00:00Z'))).toBeNull()
    const second = reminderDue(sent, new Date('2026-10-15T09:00:00Z'))
    expect(second?.index).toBe(2)
    expect(second?.overdueDays).toBe(15)
    // Le rang 2 n’est pas le dernier : il ne rejoint pas encore le chargé
    // d’affaires.
    expect(second?.joinOwner).toBe(false)
  })

  it('S’ARRÊTE après trois — au-delà c’est un sujet de management', () => {
    expect(reminderDue({ ...invoiced, remindersSent: MAX_REMINDERS }, new Date('2027-01-01T09:00:00Z'))).toBeNull()
  })

  it('ne relance JAMAIS un client qui a payé', () => {
    expect(
      reminderDue({ ...invoiced, paidAt: '2026-10-02T09:00:00.000Z' }, new Date('2026-12-01T09:00:00Z')),
    ).toBeNull()
  })

  it('ne relance rien qui n’a pas été facturé', () => {
    // Un mois bloqué ou prêt n’a AUCUNE facture à encaisser. Le relancer, c’est
    // réclamer un paiement pour un document qui n’existe pas. La relance du
    // RELEVÉ est un autre geste, et elle a sa propre cadence (timesheets).
    for (const state of ['blocked', 'ready', 'not_due'] as const) {
      expect(reminderDue({ ...invoiced, state }, new Date('2027-01-01T09:00:00Z'))).toBeNull()
    }
  })

  it('les trois rangs suivent la cadence de PAIEMENT, jamais un chiffre recopié', () => {
    // La cadence vient de PAYMENT_REMINDER_SCHEDULE_DAYS — 7 / 15 / 30, pas
    // celle du relevé (5 / 12 / 20) : la changer ici doit changer le test, pas
    // le contraire.
    PAYMENT_REMINDER_SCHEDULE_DAYS.forEach((threshold, rank) => {
      const at = new Date(Date.parse(`${DUE}T00:00:00Z`) + threshold * 86_400_000)
      const justBefore = new Date(at.getTime() - 86_400_000)
      expect(reminderDue({ ...invoiced, remindersSent: rank }, justBefore)).toBeNull()
      const due = reminderDue({ ...invoiced, remindersSent: rank }, at)
      expect(due?.index).toBe(rank + 1)
      // Seul le DERNIER rang rejoint le chargé d'affaires.
      expect(due?.joinOwner).toBe(rank + 1 === PAYMENT_REMINDER_SCHEDULE_DAYS.length)
    })
  })

  it('la cadence de RELEVÉ ne bouge pas — c’est une autre relance, un autre destinataire', () => {
    // Le manque isolé : les deux cadences vivaient sur le MÊME tableau. La
    // scission ne doit rien changer côté relevé.
    expect(TIMESHEET_REMINDER_SCHEDULE_DAYS).toEqual([5, 12, 20])
    expect(REMINDER_SCHEDULE_DAYS).toEqual(TIMESHEET_REMINDER_SCHEDULE_DAYS)
    expect(PAYMENT_REMINDER_SCHEDULE_DAYS).toEqual([7, 15, 30])
    expect(PAYMENT_REMINDER_SCHEDULE_DAYS).not.toEqual(TIMESHEET_REMINDER_SCHEDULE_DAYS)
  })

  it('NE RELANCE PAS un mois dont la facture est contestée', () => {
    // ⚠️ Porté à la main le 27/08 : ce test et le pivot `dueOn` viennent de
    // deux lots parallèles. Il raisonnait sur l'état `blocked` ; le pivot l'a
    // remplacé par « facture partie et impayée ». Le refus vaut toujours, et
    // il vaut mieux là — une facture échue, impayée ET contestée est le cas
    // où la cadence ferait le plus de dégâts.
    // Le litige n'est pas un retard : le client sait qu'il n'a pas payé, il
    // refuse de payer. Relancer pendant qu'un litige court le durcit.
    expect(
      reminderDue(
        {
          state: 'invoiced',
          dueOn: '2026-08-31',
          paidAt: null,
          remindersSent: 0,
          disputedAt: '2026-09-03T09:00:00.000Z',
          disputeResolvedAt: null,
        },
        new Date('2026-09-06T09:00:00Z'),
      ),
    ).toBeNull()
  })

  it('REPREND la cadence dès que le litige est levé', () => {
    // Sans cette moitié, déclarer un litige ferait taire le mois pour toujours
    // — et un mois qu'on ne relance plus est un mois qui ne se facture pas.
    // ⚠️ Échéance au 31/08, échue de 7 jours le 7/09 : le seuil PAIEMENT du
    // premier rang (avant : 5, désormais 7).
    const due = reminderDue(
      {
        state: 'invoiced',
        dueOn: '2026-08-31',
        paidAt: null,
        remindersSent: 0,
        disputedAt: '2026-09-03T09:00:00.000Z',
        disputeResolvedAt: '2026-09-05T09:00:00.000Z',
      },
      new Date('2026-09-07T09:00:00Z'),
    )
    expect(due?.index).toBe(1)
  })

  // #2197.41 — un mois DÉCLARÉ facturé (non prouvé) attend toujours son
  // règlement : la cadence de relance ne dépend pas de la preuve de
  // connecteur, seulement de l'échéance et du solde. Sans cette branche, un
  // « déclaré facturé » sortirait purement et simplement de toute relance.
  it('relance aussi un mois DÉCLARÉ facturé — la preuve ne conditionne pas le rappel', () => {
    const due = reminderDue({ ...invoiced, state: 'invoiced_declared' }, new Date('2026-10-07T09:00:00Z'))
    expect(due?.index).toBe(1)
  })
})

describe('le geste de litige', () => {
  it('REFUSE un litige sans motif — « en litige » seul ne se relit pas', () => {
    expect(disputeInvoiceSchema.safeParse({ reason: '   ' }).success).toBe(false)
    expect(disputeInvoiceSchema.safeParse({}).success).toBe(false)
    expect(disputeInvoiceSchema.safeParse({ reason: 'Conteste 3 jours de mars' }).success).toBe(true)
  })

  it('un litige LEVÉ n’est plus ouvert, et une ligne jamais contestée non plus', () => {
    expect(isDisputeOpen({ disputedAt: '2026-09-03T09:00:00.000Z', disputeResolvedAt: null })).toBe(true)
    expect(
      isDisputeOpen({ disputedAt: '2026-09-03T09:00:00.000Z', disputeResolvedAt: '2026-09-09T09:00:00.000Z' }),
    ).toBe(false)
    expect(isDisputeOpen({ disputedAt: null, disputeResolvedAt: null })).toBe(false)
  })
})

describe('les trois bloqueurs qui manquaient', () => {
  const base = {
    timesheet: { status: 'validated' as const, days: 20, anomalies: [] },
    dailyRateCents: 50_000,
    requiresPo: false,
    poNumber: null,
    invoicedAt: null,
  }

  it('nomme l’absence de contact de facturation', () => {
    // Le bloqueur le plus bête et le plus fréquent : tout est prêt, et le
    // document reste sur un bureau.
    expect(assessInvoiceReadiness({ ...base, billingContactId: null }).blockers).toContain('missing_billing_contact')
  })

  it('ne bloque PAS sur une information qu’on ne lui a pas donnée', () => {
    // `undefined` = l'appelant ne sait pas. `null` = on a regardé, il n'y en a
    // pas. Les confondre ferait bloquer tous les mois d'un espace dont la vue
    // ne lit pas encore ce champ.
    expect(assessInvoiceReadiness(base).blockers).toEqual([])
  })

  it('nomme l’absence de date de début', () => {
    expect(assessInvoiceReadiness({ ...base, startedOn: null }).blockers).toContain('missing_start_date')
  })

  it('bloque sur un écart de jours que personne n’a expliqué', () => {
    const blocked = assessInvoiceReadiness({
      ...base,
      timesheet: { status: 'validated', days: 12, anomalies: [], gap: -9, gapExplanation: null },
    })
    expect(blocked.blockers).toContain('unexplained_gap')
  })

  it('accepte l’écart une fois EXPLIQUÉ', () => {
    const ok = assessInvoiceReadiness({
      ...base,
      timesheet: { status: 'validated', days: 12, anomalies: [], gap: -9, gapExplanation: 'Congés' },
    })
    expect(ok.blockers).not.toContain('unexplained_gap')
    expect(ok.state).toBe('ready')
  })

  it('ne réclame ni relevé ni TJM à un contrat qui n’en a pas', () => {
    // Un forfait se facture aux jalons. Lui réclamer un relevé produit un
    // bloqueur permanent que personne ne peut lever.
    const forfait = assessInvoiceReadiness({
      ...base,
      timesheet: null,
      dailyRateCents: null,
      expectsTimesheet: false,
    })
    expect(forfait.blockers).toEqual([])
  })

  it('traite « attendu » et « manquant » comme un relevé absent', () => {
    for (const status of ['expected', 'missing'] as const) {
      const result = assessInvoiceReadiness({ ...base, timesheet: { status, days: 0, anomalies: [] } })
      expect(result.blockers).toContain('missing_timesheet')
      // Et surtout : 0 jour déclaré ne se lit pas comme « zéro jour travaillé ».
      expect(result.days).toBeNull()
    }
  })
})

// ── #2566.2 — le bon de commande doit COUVRIR la période facturée ───────────
//
// `missing_po` couvre déjà l'ABSENCE. Il manquait la troisième cause nommée
// par le client : une référence qui existe mais ne couvre plus le mois qu'on
// facture — le cas concret étant un bon de commande qui EXPIRE en cours de
// mission longue. `poValidUntil` est optionnel comme `billingContactId` et
// `chargedCostCents` juste au-dessus : `undefined` = l'appelant ne sait pas,
// on ne bloque pas sur une information qu'on n'a pas demandée.
describe('assessInvoiceReadiness — le bon de commande doit couvrir la période (#2566.2)', () => {
  const base = {
    timesheet: { status: 'validated' as const, days: 20, anomalies: [] },
    dailyRateCents: 50_000,
    requiresPo: true,
    poNumber: 'PO-2026-0042',
    invoicedAt: null,
    periodMonth: '2026-08-01',
  }

  it('bloque quand le bon de commande expire AVANT la fin du mois facturé', () => {
    // Le cas du critère de recette : un PO qui expire au milieu de la
    // période (ici le 15 août, sur un mois qui va jusqu'au 31).
    const result = assessInvoiceReadiness({ ...base, poValidUntil: '2026-08-15' })
    expect(result.blockers).toContain('po_period_mismatch')
    expect(result.state).toBe('blocked')
  })

  it('ne bloque PAS quand le bon de commande couvre le mois entier', () => {
    const result = assessInvoiceReadiness({ ...base, poValidUntil: '2026-09-30' })
    expect(result.blockers).not.toContain('po_period_mismatch')
    expect(result.state).toBe('ready')
  })

  it('couvre PILE le dernier jour du mois — la borne est INCLUSE', () => {
    // Le 31 août est le dernier jour d'un mois facturé sur août : le bon de
    // commande le couvre encore, il n'a pas encore expiré CE jour-là.
    const result = assessInvoiceReadiness({ ...base, poValidUntil: '2026-08-31' })
    expect(result.blockers).not.toContain('po_period_mismatch')
  })

  it('ne bloque PAS sur une validité qu’on ne lui a pas donnée', () => {
    // `undefined` = l'appelant ne sait pas — même règle que `billingContactId`
    // et `chargedCostCents`. Un appelant qui ne lit pas encore cette colonne ne
    // doit pas voir tous ses mois basculer « bloqué » du jour au lendemain.
    expect(assessInvoiceReadiness(base).blockers).not.toContain('po_period_mismatch')
  })

  it('ne bloque pas un mois sans bon de commande EXIGÉ, même avec une date passée', () => {
    // La question ne se pose que si l'espace exige un bon de commande sur
    // cette mission — `requiresPo: false` a déjà tout dit sur ce mois.
    const result = assessInvoiceReadiness({
      ...base,
      requiresPo: false,
      poNumber: null,
      poValidUntil: '2020-01-01',
    })
    expect(result.blockers).not.toContain('po_period_mismatch')
  })

  it('l’absence de PO reste `missing_po`, jamais confondue avec une expiration', () => {
    // Sans numéro, le bloqueur qui parle est `missing_po` — pas une expiration
    // qu'on ne peut pas mesurer sur un PO qui n'existe pas.
    const result = assessInvoiceReadiness({ ...base, poNumber: null, poValidUntil: '2020-01-01' })
    expect(result.blockers).toContain('missing_po')
    expect(result.blockers).not.toContain('po_period_mismatch')
  })
})

// ── Le bloqueur qui manquait — le coût chargé ────────────────────────────────
//
// Un mois pouvait partir « prêt à facturer » avec un TJM VENDU renseigné et
// un coût CHARGÉ absent : la marge se calculait alors sans son coût, et le
// chiffre sortait faux dans le sens qui arrange. `missing_rate` ne couvrait
// que le TJM vendu — jamais le coût chargé.
describe('assessInvoiceReadiness — le coût chargé manquant', () => {
  const base = {
    timesheet: { status: 'validated' as const, days: 20, anomalies: [] },
    dailyRateCents: 50_000,
    requiresPo: false,
    poNumber: null,
    invoicedAt: null,
  }

  it('un TJM renseigné et un coût chargé `null` ne part PAS « prêt à facturer »', () => {
    // Le test qui compte : la donnée existe déjà (le coût chargé de la
    // mission), c'est le bloqueur qui manquait.
    const result = assessInvoiceReadiness({ ...base, chargedCostCents: null })
    expect(result.blockers).toContain('missing_cost')
    expect(result.state).toBe('blocked')
  })

  it('ne bloque PAS sur un coût chargé qu’on ne lui a pas demandé', () => {
    // `undefined` = l'appelant ne sait pas — même règle que `billingContactId`.
    // Un appelant qui ne lit pas encore cette colonne ne doit pas voir tous ses
    // mois basculer « bloqué » du jour au lendemain.
    expect(assessInvoiceReadiness(base).blockers).not.toContain('missing_cost')
  })

  it('un coût chargé à ZÉRO n’est pas un coût chargé ABSENT', () => {
    // Le piège : `mission_commercial_terms.loaded_daily_cost_cents` est un
    // `bigint` NULLABLE sans contrainte `>= 0` — `null` et `0` sont deux
    // valeurs DISTINCTES en base, et un consultant interne peut légitimement
    // avoir un coût chargé nul sur certains montages. Les confondre bloquerait
    // une mission dont le coût est réellement zéro.
    const result = assessInvoiceReadiness({ ...base, chargedCostCents: 0 })
    expect(result.blockers).not.toContain('missing_cost')
    expect(result.state).toBe('ready')
  })

  it('n’est PAS gardé par `expectsTimesheet` — un forfait a lui aussi un coût interne', () => {
    // Contrairement à `missing_rate` : le TJM vendu ne veut rien dire sur un
    // forfait, mais le coût interne existe quelle que soit la cadence de
    // facturation — la marge s'en sert toujours.
    const result = assessInvoiceReadiness({
      ...base,
      timesheet: null,
      dailyRateCents: null,
      expectsTimesheet: false,
      chargedCostCents: null,
    })
    expect(result.blockers).toContain('missing_cost')
    expect(result.blockers).not.toContain('missing_rate')
  })

  it('reste visible sur un mois NON DÛ, comme les autres bloqueurs de fiche', () => {
    const result = assessInvoiceReadiness({
      ...base,
      chargedCostCents: null,
      billingCadence: 'milestone',
    })
    expect(result.state).toBe('not_due')
    expect(result.blockers).toContain('missing_cost')
  })
})

describe('summarizeReadiness', () => {
  function row(over: Partial<InvoiceReadiness>): Pick<InvoiceReadiness, 'state' | 'preparedAmountCents' | 'blockers'> {
    return { state: 'blocked', preparedAmountCents: 100_000, blockers: [], ...over }
  }

  it('compte à part ce qui n’a pas pu être chiffré', () => {
    // Sans ce compteur, un total partiel se lit comme un total.
    const summary = summarizeReadiness([row({ state: 'ready' }), row({ preparedAmountCents: null })])
    expect(summary.preparedAmountCents).toBe(100_000)
    expect(summary.withoutAmount).toBe(1)
  })

  it('ne MÉLANGE pas ce qui est prêt et ce qui est bloqué', () => {
    // Le défaut du §8 : le total additionnait les deux. Un mois bloqué n'est
    // pas de l'argent qu'on va facturer — c'est de l'argent qu'on ne PEUT pas
    // facturer, et le fondre dans un chiffre unique annonce une facturation
    // qui n'aura pas lieu.
    const summary = summarizeReadiness([row({ state: 'ready' }), row({ state: 'blocked' })])
    expect(summary.preparedAmountCents).toBe(100_000)
    expect(summary.blockedAmountCents).toBe(100_000)
  })

  it('EXCLUT du préparatoire ce qui est déjà facturé ailleurs', () => {
    // L'y garder gonflerait un chiffre censé représenter ce qui reste à faire.
    const summary = summarizeReadiness([
      row({ state: 'invoiced', preparedAmountCents: 500_000 }),
      row({ state: 'ready' }),
    ])
    expect(summary.preparedAmountCents).toBe(100_000)
    expect(summary.invoiced).toBe(1)
  })

  it('rend un résumé vide sans erreur', () => {
    expect(summarizeReadiness([])).toEqual({
      ready: 0,
      blocked: 0,
      invoiced: 0,
      invoicedDeclared: 0,
      preparedAmountCents: 0,
      blockedAmountCents: 0,
      withoutAmount: 0,
      notDue: 0,
      unexplainedGapCount: 0,
    })
  })

  /**
   * #2197.7 — le motif `unexplained_gap` existait déjà PAR LIGNE
   * (`readiness.blockers.unexplained_gap`) mais aucun compteur agrégé ne le
   * résumait pour une tuile de `/missions/facturation`.
   */
  it('#2197.7 — compte les mois dont l’écart de période n’est pas expliqué', () => {
    const summary = summarizeReadiness([
      row({ state: 'blocked', blockers: ['unexplained_gap'] }),
      row({ state: 'blocked', blockers: ['missing_po'] }),
      row({ state: 'ready', blockers: [] }),
    ])
    expect(summary.unexplainedGapCount).toBe(1)
  })

  // #2197.41 — LE TEST QUI COMPTE : un agrégat ne doit JAMAIS compter un
  // « déclaré facturé » comme un « facturé » prouvé. Avant ce lot, les deux
  // partageaient le même état `invoiced` et ce total les fondait : un
  // encaissement annoncé « facturé » pouvait n'être qu'une déclaration
  // manuscrite, sans aucune preuve de connecteur.
  it('#2197.41 — NE COMPTE PAS un déclaré comme un prouvé', () => {
    const summary = summarizeReadiness([
      row({ state: 'invoiced', preparedAmountCents: 500_000 }),
      row({ state: 'invoiced_declared', preparedAmountCents: 300_000 }),
      row({ state: 'ready' }),
    ])
    // Une ligne PROUVÉE et une ligne DÉCLARÉE : deux compteurs distincts, et
    // aucun des deux ne double l'autre.
    expect(summary.invoiced).toBe(1)
    expect(summary.invoicedDeclared).toBe(1)
    // Ni l'une ni l'autre ne regonfle le préparatoire : les deux sont sorties
    // de la surveillance, comme `invoiced` l'a toujours été.
    expect(summary.preparedAmountCents).toBe(100_000)
    expect(summary.withoutAmount).toBe(0)
  })
})

// ── La cadence de facturation ────────────────────────────────────────────────
//
// `billing_cadence` existait depuis des mois — colonne, contrainte, écriture,
// lecture, rendu sur la fiche mission — et le calcul de préparation ne la
// lisait pas. Une mission au jalon ou au forfait passait l'écran mensuel comme
// une mission en régie : « prête à facturer », tous les mois.

describe('assessInvoiceReadiness — la cadence de facturation', () => {
  it('un mois de mission au JALON n’est ni prêt ni bloqué : il n’est pas dû', () => {
    const result = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
      billingCadence: 'milestone',
    })
    expect(result.state).toBe('not_due')
    // Rien n'est cassé : proposer un bloqueur enverrait quelqu'un réparer ce
    // qui va bien.
    expect(result.blockers).toEqual([])
    // Et surtout : aucun montant. `jours × TJM` n'est pas ce qui sera facturé
    // sur un jalon, et l'annoncer serait un chiffre inventé.
    expect(result.preparedAmountCents).toBeNull()
  })

  it('un FORFAIT non plus', () => {
    const result = assessInvoiceReadiness({
      timesheet: null,
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
      expectsTimesheet: false,
      billingCadence: 'fixed_price',
    })
    expect(result.state).toBe('not_due')
  })

  it('`monthly` garde EXACTEMENT le comportement d’avant', () => {
    const result = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
      billingCadence: 'monthly',
    })
    expect(result.state).toBe('ready')
    expect(result.preparedAmountCents).toBe(18 * RATE)
  })

  it('une cadence INCONNUE garde le comportement d’avant — on ne devine pas', () => {
    // `null` veut dire « on ne sait pas ». Sur ce point précis le statu quo est
    // le mensuel : en déduire l'inverse ferait disparaître de l'écran des
    // missions qu'on facture réellement chaque mois.
    for (const cadence of [null, undefined]) {
      const result = assessInvoiceReadiness({
        timesheet: validated(),
        dailyRateCents: RATE,
        requiresPo: false,
        poNumber: null,
        invoicedAt: null,
        billingCadence: cadence,
      })
      expect(result.state).toBe('ready')
    }
  })

  it('un mois DÉJÀ FACTURÉ reste facturé (déclaré), quelle que soit la cadence', () => {
    // L'ordre compte : « facturé ailleurs » sort de toute surveillance, et une
    // cadence non mensuelle ne doit pas l'y ramener. #2197.41 — sans
    // confirmation du connecteur, c'est une DÉCLARATION.
    const result = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: '2026-08-01T00:00:00.000Z',
      billingCadence: 'milestone',
    })
    expect(result.state).toBe('invoiced_declared')
  })

  it('un mois NON DÛ ne cache pas un vrai bloqueur qui le concerne quand même', () => {
    // Une mission au jalon sans date de début reste une fiche incomplète. Mais
    // ce n'est pas la question du mois : l'état dit « pas dû », et le bloqueur
    // reste visible pour qui répare les fiches.
    const result = assessInvoiceReadiness({
      timesheet: validated(),
      dailyRateCents: RATE,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
      startedOn: null,
      billingCadence: 'milestone',
    })
    expect(result.state).toBe('not_due')
    expect(result.blockers).toContain('missing_start_date')
  })
})

describe('summarizeReadiness — le quatrième état ne se fond dans aucun autre', () => {
  const row = (state: InvoiceReadiness['state'], amount: number | null) =>
    ({ state, preparedAmountCents: amount }) as Pick<InvoiceReadiness, 'state' | 'preparedAmountCents'>

  it('compte les NON DÛS à part, et ne les prend ni pour des facturés ni pour des bloqués', () => {
    // ⚠️ Le défaut que ce test garde : le `else` final comptait tout ce qui
    // n'était ni `ready` ni `blocked` comme `invoiced`. Une valeur ajoutée à
    // l'énumération se serait donc annoncée « facturée » sans que rien ne casse.
    const summary = summarizeReadiness([
      row('ready', 1_000),
      row('blocked', 2_000),
      row('invoiced', 3_000),
      // #2197.41 — un DÉCLARÉ n'est ni un facturé PROUVÉ, ni un non-dû : la
      // même faille reviendrait si cette branche tombait dans le `else`.
      row('invoiced_declared', 5_000),
      row('not_due', 4_000),
      row('not_due', null),
    ])
    expect(summary.ready).toBe(1)
    expect(summary.blocked).toBe(1)
    expect(summary.invoiced).toBe(1)
    expect(summary.invoicedDeclared).toBe(1)
    expect(summary.notDue).toBe(2)
  })

  it('un montant NON DÛ n’entre dans aucun total', () => {
    // Ni dans le préparatoire (il ne sera pas facturé ce mois), ni dans le
    // bloqué (rien ne l'empêche), ni dans « sans montant » (ce n'est pas un
    // chiffrage raté, c'est une question qui ne se pose pas).
    const summary = summarizeReadiness([row('ready', 1_000), row('not_due', 4_000), row('not_due', null)])
    expect(summary.preparedAmountCents).toBe(1_000)
    expect(summary.blockedAmountCents).toBe(0)
    expect(summary.withoutAmount).toBe(0)
  })
})

// ── `accountId` (30/08/2026, §9) ────────────────────────────────────────────
//
// `invoiceReadiness` est calculé PAR MISSION, et la ligne rendue ne portait
// que `accountName` — une CHAÎNE — alors que la requête joint déjà
// `accounts`. Faute d'identifiant, l'écran des comptes devait rejoindre par
// `missionId` via `GET /delivery/missions`, plafonné à 200 lignes : un compte
// dont toutes les missions tombent au-delà du plafond s'affichait « non
// mesuré » sans raison. Joindre par NOM aurait été pire — deux comptes
// peuvent porter le même nom, et un nom peut être `null`.
const MISSION_ID = '00000000-0000-4000-8000-000000000001'
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000002'

/** Une ligne complète et valide, pour ne faire varier QUE `accountId`. */
function fullRow(accountId: string | null) {
  return {
    missionId: MISSION_ID,
    missionLabel: 'Renfort plateforme',
    accountName: 'ACME',
    accountId,
    periodMonth: '2026-08-01',
    state: 'ready' as const,
    blockers: [] as const,
    days: 18,
    preparedAmountCents: 1_170_000,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
  }
}

describe('invoiceReadinessSchema — `accountId`, le pendant NULLABLE de `accountName`', () => {
  it('accepte un `accountId` UUID valide', () => {
    const result = invoiceReadinessSchema.safeParse(fullRow(ACCOUNT_ID))
    expect(result.success).toBe(true)
    expect(result.success && result.data.accountId).toBe(ACCOUNT_ID)
  })

  it('accepte `accountId: null` — la jointure est un LEFT JOIN, une mission sans compte existe', () => {
    const result = invoiceReadinessSchema.safeParse(fullRow(null))
    expect(result.success).toBe(true)
    expect(result.success && result.data.accountId).toBeNull()
  })

  it('refuse un `accountId` qui n’est pas un UUID — on ne devine pas un identifiant', () => {
    const result = invoiceReadinessSchema.safeParse(fullRow('pas-un-uuid' as unknown as string))
    expect(result.success).toBe(false)
  })

  it('refuse une ligne où `accountId` est absent — le champ est OBLIGATOIRE, seule sa valeur peut être `null`', () => {
    const { accountId: _accountId, ...withoutAccountId } = fullRow(ACCOUNT_ID)
    const result = invoiceReadinessSchema.safeParse(withoutAccountId)
    expect(result.success).toBe(false)
  })
})

// ── `supplierInvoiceStatus` — la facture ENTRANTE du sous-traitant ─────────
//
// La facturation `/missions/facturation` du 31/08/2026 (PDF-22 §6).

describe('invoiceReadinessSchema — `supplierInvoiceStatus`, OPTIONNEL à dessein', () => {
  it('accepte une ligne qui ne le porte pas — les constructeurs hors de ce lot ne le passent pas', () => {
    const result = invoiceReadinessSchema.safeParse(fullRow(ACCOUNT_ID))
    expect(result.success).toBe(true)
    expect(result.success && result.data.supplierInvoiceStatus).toBeUndefined()
  })

  it.each(['missing', 'received'] as const)('accepte `%s`', value => {
    const result = invoiceReadinessSchema.safeParse({ ...fullRow(ACCOUNT_ID), supplierInvoiceStatus: value })
    expect(result.success).toBe(true)
    expect(result.success && result.data.supplierInvoiceStatus).toBe(value)
  })

  it('accepte `null` — la mission n’est pas sous-traitée, la question ne se pose pas', () => {
    const result = invoiceReadinessSchema.safeParse({ ...fullRow(ACCOUNT_ID), supplierInvoiceStatus: null })
    expect(result.success).toBe(true)
    expect(result.success && result.data.supplierInvoiceStatus).toBeNull()
  })

  it('refuse une valeur qui n’est pas dans l’énumération — pas de « brouillon » ici non plus', () => {
    const result = invoiceReadinessSchema.safeParse({ ...fullRow(ACCOUNT_ID), supplierInvoiceStatus: 'draft' })
    expect(result.success).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  `craStatusOf` — le filtre « Statut CRA » de /missions/facturation          */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Le piège nommé par la fiche de lecture du 26/08 : « l'état "conflit"
 * n'existe pas. Ne pas l'ajouter : il se dérive d'un écart non expliqué. »
 * Ces tests prouvent la dérivation contre les VRAIS codes de
 * {@link InvoiceBlocker} — pas contre une copie devinée des six noms.
 */
describe('craStatusOf — quatre valeurs, jamais un cinquième état stocké', () => {
  function row(blockers: readonly InvoiceBlocker[], state: InvoiceReadiness['state'] = 'blocked') {
    return { blockers: [...blockers], state }
  }

  it('aucun des six codes CRA → validé, même si un AUTRE bloqueur traîne (bon de commande…)', () => {
    expect(craStatusOf(row(['missing_po', 'missing_billing_contact'], 'blocked'))).toBe('validated')
  })

  it.each(['missing_timesheet', 'timesheet_not_submitted', 'timesheet_rejected'] as const)(
    '%s → à compléter',
    blocker => {
      expect(craStatusOf(row([blocker]))).toBe('not_submitted')
    },
  )

  it('timesheet_not_validated → à valider', () => {
    expect(craStatusOf(row(['timesheet_not_validated']))).toBe('to_validate')
  })

  it.each(['timesheet_disputed', 'timesheet_anomalies'] as const)('%s → conflit, jamais un septième état', blocker => {
    expect(craStatusOf(row([blocker]))).toBe('conflict')
  })

  it('un mois NON DÛ (forfait, jalon) ne porte aucun statut CRA — `null`, pas « validé »', () => {
    expect(craStatusOf(row([], 'not_due'))).toBeNull()
    // Même avec un bloqueur CRA porté malgré tout (fiche incomplète) : la
    // question « ce mois est-il dû » prime sur le statut du relevé.
    expect(craStatusOf(row(['timesheet_disputed'], 'not_due'))).toBeNull()
  })

  it('l’état « prêt » ou « facturé » sans aucun code CRA reste « validé »', () => {
    expect(craStatusOf(row([], 'ready'))).toBe('validated')
    expect(craStatusOf(row([], 'invoiced'))).toBe('validated')
  })

  it('priorité : non-déposé avant conflit — un écart ne s’explique pas avant d’avoir été soumis', () => {
    expect(craStatusOf(row(['timesheet_not_submitted', 'timesheet_anomalies']))).toBe('not_submitted')
  })
})

describe('isCraBlocked — la tuile « CRA bloqué », union des SIX codes timesheet_*', () => {
  function row(blockers: readonly InvoiceBlocker[], state: InvoiceReadiness['state'] = 'blocked') {
    return { blockers: [...blockers], state }
  }

  it('faux quand validé', () => {
    expect(isCraBlocked(row([]))).toBe(false)
  })

  it('faux sur un mois non dû — il ne compte ni bloqué ni validé', () => {
    expect(isCraBlocked(row([], 'not_due'))).toBe(false)
  })

  it.each([
    'missing_timesheet',
    'timesheet_not_submitted',
    'timesheet_not_validated',
    'timesheet_disputed',
    'timesheet_anomalies',
    'timesheet_rejected',
  ] as const)('vrai pour %s', blocker => {
    expect(isCraBlocked(row([blocker]))).toBe(true)
  })

  it('faux pour un bloqueur qui n’est PAS un des six — la tuile ne compte que le CRA', () => {
    expect(isCraBlocked(row(['missing_po']))).toBe(false)
  })
})

// #2419.4 — un paiement partiel ne sort pas de la file
describe('le RESTE DÛ — un paiement partiel n’est pas un paiement', () => {
  /**
   * `paid_at` et `paid_amount_cents` sont DEUX colonnes, toutes deux
   * constatées à la main. Conclure « payé » de la seule DATE laissait un
   * client qui règle 5 000 € sur 10 000 € quitter la file de relance : les
   * 5 000 € restants n'étaient plus jamais réclamés, et aucun écran ne le
   * disait.
   */
  const settled = {
    invoicedAmountCents: 10_000_00,
    paidAt: '2026-10-02T09:00:00.000Z',
    paidAmountCents: 10_000_00,
  }

  /** La même ligne, vue par la CADENCE : échéance au 30/09, rien de contesté. */
  const cadence = {
    state: 'invoiced' as const,
    dueOn: '2026-09-30',
    remindersSent: 0,
    disputedAt: null,
    disputeResolvedAt: null,
    ...settled,
  }

  it('nomme le reste dû d’un règlement PARTIEL', () => {
    expect(outstandingAmountCents({ ...settled, paidAmountCents: 5_000_00 })).toBe(5_000_00)
    expect(isPartiallyPaid({ ...settled, paidAmountCents: 5_000_00 })).toBe(true)
    expect(isSettled({ ...settled, paidAmountCents: 5_000_00 })).toBe(false)
  })

  it('SOLDE la ligne quand le règlement couvre le facturé', () => {
    expect(outstandingAmountCents(settled)).toBe(0)
    expect(isPartiallyPaid(settled)).toBe(false)
    expect(isSettled(settled)).toBe(true)
  })

  it('ne réclame RIEN de plus quand le client a payé au-delà du facturé', () => {
    // Un trop-perçu est un sujet comptable ; ce n'est pas un reste dû négatif.
    expect(outstandingAmountCents({ ...settled, paidAmountCents: 11_000_00 })).toBe(0)
    expect(isPartiallyPaid({ ...settled, paidAmountCents: 11_000_00 })).toBe(false)
  })

  /**
   * ⚠️ « Non mesuré » n'est JAMAIS « 0 » (GA-18 / GA-19) — et il n'est pas
   * non plus « partiel ». Une ligne payée d'un montant qu'on ne connaît pas
   * reste SOLDÉE : la basculer en partiel accuserait un client à tort et la
   * remettrait dans une file de relance sur la foi d'une absence.
   */
  it('ne conclut PAS « partiel » d’un montant encaissé inconnu', () => {
    const unknownPaid = { ...settled, paidAmountCents: null }
    expect(outstandingAmountCents(unknownPaid)).toBeNull()
    expect(isPartiallyPaid(unknownPaid)).toBe(false)
    expect(isSettled(unknownPaid)).toBe(true)
  })

  /** Le dénominateur aussi peut manquer : sans montant FACTURÉ, le rapport est
   *  indéterminé — la ligne ne peut pas être dite partielle. */
  it('ne conclut PAS « partiel » d’un montant facturé inconnu', () => {
    const unknownInvoiced = { ...settled, invoicedAmountCents: null, paidAmountCents: 5_000_00 }
    expect(outstandingAmountCents(unknownInvoiced)).toBeNull()
    expect(isPartiallyPaid(unknownInvoiced)).toBe(false)
    expect(isSettled(unknownInvoiced)).toBe(true)
  })

  it('sur une ligne IMPAYÉE, le reste dû est le facturé ENTIER', () => {
    const unpaid = { invoicedAmountCents: 10_000_00, paidAt: null, paidAmountCents: null }
    expect(outstandingAmountCents(unpaid)).toBe(10_000_00)
    expect(isPartiallyPaid(unpaid)).toBe(false)
    expect(isSettled(unpaid)).toBe(false)
  })

  it('sur une ligne impayée SANS montant facturé, le reste dû est inconnu — jamais 0', () => {
    expect(outstandingAmountCents({ invoicedAmountCents: null, paidAt: null, paidAmountCents: null })).toBeNull()
  })

  /**
   * LE CAS QUI A MOTIVÉ LE CORRECTIF : 5 000 € sur 10 000 €. La cadence DOIT
   * continuer — c'est la seule chose qui réclame les 5 000 € restants.
   */
  it('CONTINUE de relancer un règlement partiel', () => {
    const due = reminderDue({ ...cadence, paidAmountCents: 5_000_00 }, new Date('2026-12-01T09:00:00Z'))
    expect(due).not.toBeNull()
    expect(due?.index).toBe(1)
  })

  it('n’en relance AUCUNE quand le montant encaissé est inconnu — on n’accuse pas', () => {
    expect(reminderDue({ ...cadence, paidAmountCents: null }, new Date('2026-12-01T09:00:00Z'))).toBeNull()
  })

  it('n’en relance AUCUNE quand le règlement SOLDE la facture', () => {
    expect(reminderDue(cadence, new Date('2026-12-01T09:00:00Z'))).toBeNull()
  })
})

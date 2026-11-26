import {
  MANUAL_BILLING_MAX_REMINDERS,
  MANUAL_BILLING_REMINDER_SCHEDULE_DAYS,
  prepareReminder,
  type ClientForReminder,
  type InvoiceForReminder,
  type LoggedReminder,
} from './manual-billing-reminder'
import { PAYMENT_TERM_DAYS, addDays } from './manual-billing-schedule'

/**
 * #1655 — préparer une relance depuis une cellule « en retard ».
 *
 * Les quatre règles de l'issue, chacune avec son test :
 *  1. le message est PRÉPARÉ, jamais envoyé — prouvé par l'ABSENCE de chemin
 *     d'envoi, dans `manual-billing-reminder-no-send.spec.ts` ;
 *  2. aucune relance sur une facture en LITIGE — le test que l'issue demande ;
 *  3. le ton est paramétrable — et le résultat DIT qu'il a été forcé ;
 *  4. chaque relance est journalisée — l'historique nourrit la cadence ET le
 *     texte des rangs 2 et 3.
 */

const CLIENT: ClientForReminder = {
  workspaceName: 'ESN Alpha',
  billedToName: null,
  billingEmail: 'compta@esn-alpha.fr',
}

/** Période de juin, échéance dérivée au 01/07 (`period_start` + 30 jours). */
const FACTURE: InvoiceForReminder = {
  id: 'inv-1',
  reference: 'F-2026-0142',
  amountCents: 119_000,
  currency: 'EUR',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  paid: false,
  disputedAt: null,
  disputeResolvedAt: null,
  reminders: [],
}

const relance = (index: number, at: string, tone: LoggedReminder['tone']): LoggedReminder => ({
  at: `${at}T09:00:00.000Z`,
  by: 'louis@bellum-it.com',
  tone,
  index,
})

describe('la cadence LIT quelque chose', () => {
  it('trois échelons, et la borne se lit dans la cadence', () => {
    // Contrôle positif : une cadence vide rendrait « aucune relance jamais »,
    // donc une garde verte qui n'a rien mesuré.
    expect(MANUAL_BILLING_REMINDER_SCHEDULE_DAYS).toEqual([3, 15, 30])
    expect(MANUAL_BILLING_MAX_REMINDERS).toBe(MANUAL_BILLING_REMINDER_SCHEDULE_DAYS.length)
  })

  it('le pivot est l’échéance DÉRIVÉE du module de facturation, pas un 30 recopié', () => {
    const out = prepareReminder({ invoice: FACTURE, client: CLIENT, today: '2026-07-04' })
    expect(out.prepared).toBe(true)
    // Si `PAYMENT_TERM_DAYS` bouge un jour, ce test suit tout seul — c'est ce
    // qui prouve que le seuil est LU et non recopié.
    expect(out.prepared && out.dueOn).toBe(addDays(FACTURE.periodStart, PAYMENT_TERM_DAYS))
    expect(out.prepared && out.dueOn).toBe('2026-07-01')
  })
})

describe('⚠️ règle 2 — aucune relance sur une facture en LITIGE', () => {
  it('facture marquée en litige → aucune relance proposée', () => {
    const out = prepareReminder({
      invoice: { ...FACTURE, disputedAt: '2026-07-02T10:00:00.000Z' },
      client: CLIENT,
      disputeReason: 'Deux jours de prestation contestés sur juin',
      today: '2026-07-20',
    })
    expect(out.prepared).toBe(false)
    expect(out.prepared === false && out.reason).toBe('dispute_open')
    // Le refus PORTE le motif : « en litige » sans rien d'autre ne se relit pas.
    expect(out.prepared === false && out.disputeReason).toBe('Deux jours de prestation contestés sur juin')
  })

  it('le litige prime sur TOUT le reste — y compris sur une donnée manquante', () => {
    // Les deux refus sont vrais en même temps ; un seul est actionnable. Saisir
    // la référence pendant qu'un litige court ne redémarrerait rien.
    const out = prepareReminder({
      invoice: { ...FACTURE, reference: null, disputedAt: '2026-07-02T10:00:00.000Z' },
      client: { ...CLIENT, billingEmail: null },
      today: '2026-08-30',
    })
    expect(out.prepared === false && out.reason).toBe('dispute_open')
  })

  it('un litige LEVÉ ne bloque plus — la cadence reprend', () => {
    const out = prepareReminder({
      invoice: {
        ...FACTURE,
        disputedAt: '2026-07-02T10:00:00.000Z',
        disputeResolvedAt: '2026-07-10T10:00:00.000Z',
      },
      client: CLIENT,
      today: '2026-07-20',
    })
    expect(out.prepared).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une date de LEVÉE sans litige déclaré ne bloque rien', () => {
    const out = prepareReminder({
      invoice: { ...FACTURE, disputeResolvedAt: '2026-07-10T10:00:00.000Z' },
      client: CLIENT,
      today: '2026-07-20',
    })
    expect(out.prepared).toBe(true)
  })
})

describe('les trois niveaux', () => {
  it('J+3 → ton courtois : rappel, référence, montant', () => {
    const out = prepareReminder({ invoice: FACTURE, client: CLIENT, today: '2026-07-04' })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    expect(out).toMatchObject({ index: 1, tone: 'neutral', toneOverridden: false, overdueDays: 3 })
    expect(out.subject).toContain('F-2026-0142')
    // ⚠️ « 190,00 » et non « 1 190,00 » : `fr-FR` sépare les milliers par une
    // ESPACE FINE INSÉCABLE (U+202F), pas par l'espace qu'on tape. Un littéral
    // recopié à la main ferait échouer un test parfaitement juste.
    expect(out.subject).toContain('190,00')
    expect(out.body).toContain('F-2026-0142')
    expect(out.body).toContain('190,00')
    expect(out.body).toContain('01/07/2026')
    // Un premier rappel qui accuse est un premier rappel qu'on ne relit pas.
    expect(out.body).toContain('Si le règlement est déjà parti')
    expect(out.legalNotice).toBeNull()
  })

  it('J+15 avec une relance consignée → ton ferme : récapitulatif et demande de date', () => {
    const out = prepareReminder({
      invoice: { ...FACTURE, reminders: [relance(1, '2026-07-04', 'neutral')] },
      client: CLIENT,
      today: '2026-07-16',
    })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    expect(out).toMatchObject({ index: 2, tone: 'firm', overdueDays: 15 })
    expect(out.body).toContain('Récapitulatif')
    expect(out.body).toContain('Pouvez-vous nous indiquer la date')
    // L'historique consigné apparaît dans le récapitulatif, avec sa VRAIE date.
    expect(out.body).toContain('Relance n°1 : le 04/07/2026 (ton courtois)')
    expect(out.legalNotice).toBeNull()
  })

  it('J+30 avec deux relances consignées → ton escalade : les pénalités légales, CITÉES', () => {
    const out = prepareReminder({
      invoice: {
        ...FACTURE,
        reminders: [relance(1, '2026-07-04', 'neutral'), relance(2, '2026-07-16', 'firm')],
      },
      client: CLIENT,
      today: '2026-07-31',
    })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    expect(out).toMatchObject({ index: 3, tone: 'escalate', overdueDays: 30 })
    // ⚠️ Le taux et l'indemnité ne sont pas inventés : ce sont ceux des CGV de
    // BellumAI (`apps/website/src/app/[locale]/cgv/page.tsx`).
    expect(out.legalNotice).toContain('L. 441-10')
    expect(out.legalNotice).toContain('trois fois le taux d’intérêt légal')
    expect(out.legalNotice).toContain('quarante')
    expect(out.legalNotice).toContain('D. 441-5')
    expect(out.body).toContain('L. 441-10')
    expect(out.body).toContain('Malgré nos relances précédentes (04/07/2026, 16/07/2026)')
  })

  it('AUCUN montant de pénalité n’est calculé — la règle est énoncée, la somme ne l’est pas', () => {
    const out = prepareReminder({
      invoice: {
        ...FACTURE,
        reminders: [relance(1, '2026-07-04', 'neutral'), relance(2, '2026-07-16', 'firm')],
      },
      client: CLIENT,
      today: '2026-07-31',
    })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    // Le seul montant du message est celui de la FACTURE. Un « 40,00 € » ou un
    // intérêt chiffré serait un montant légal inventé : le taux légal change
    // deux fois par an et n'est écrit nulle part dans ce dépôt.
    // ⚠️ L'attendu se FORMATE, il ne se recopie pas : `fr-FR` sépare les
    // milliers par une espace fine insécable, invisible dans un littéral.
    const attendu = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(1190)
    expect(out.body.match(/\d[\d\s]*,\d{2}\s?€/gu) ?? []).toEqual([attendu])
    // Et l'indemnité forfaitaire reste EN TOUTES LETTRES, comme dans les CGV :
    // c'est une citation, pas un calcul.
    expect(out.body).toContain('quarante euros')
  })

  it('quatre relances n’existent pas — le silence après trois est un sujet de management', () => {
    const out = prepareReminder({
      invoice: {
        ...FACTURE,
        reminders: [
          relance(1, '2026-07-04', 'neutral'),
          relance(2, '2026-07-16', 'firm'),
          relance(3, '2026-07-31', 'escalate'),
        ],
      },
      client: CLIENT,
      today: '2026-09-30',
    })
    expect(out.prepared === false && out.reason).toBe('cadence_exhausted')
  })
})

describe('⚠️ règle 3 — le ton est paramétrable, et le résultat DIT qu’il a été forcé', () => {
  it('un ton choisi prime sur celui de la cadence', () => {
    const out = prepareReminder({
      invoice: FACTURE,
      client: CLIENT,
      today: '2026-07-04',
      requestedTone: 'firm',
    })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    expect(out.tone).toBe('firm')
    // La cadence n'a pas changé d'avis : c'est l'opérateur qui a tranché, et
    // l'écran doit pouvoir le dire.
    expect(out.toneSuggested).toBe('neutral')
    expect(out.toneOverridden).toBe(true)
    expect(out.body).toContain('Récapitulatif')
  })

  it('une escalade FORCÉE au rang 1 n’invente aucune relance passée', () => {
    const out = prepareReminder({
      invoice: FACTURE,
      client: CLIENT,
      today: '2026-07-04',
      requestedTone: 'escalate',
    })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    // Le piège : « Malgré nos relances du  » suivi de rien. La phrase
    // d'ouverture se choisit sur ce qui a été RÉELLEMENT consigné.
    expect(out.body).not.toContain('Malgré nos relances')
    expect(out.legalNotice).not.toBeNull()
  })
})

describe('ce qui refuse la préparation, et le DIT', () => {
  it('aucune facture pour la période → on ne réclame pas un document qui n’existe pas', () => {
    const out = prepareReminder({ invoice: null, client: CLIENT, today: '2026-09-30' })
    expect(out.prepared === false && out.reason).toBe('no_invoice')
  })

  it('facture encaissée → on ne relance pas un client qui a payé', () => {
    const out = prepareReminder({ invoice: { ...FACTURE, paid: true }, client: CLIENT, today: '2026-09-30' })
    expect(out.prepared === false && out.reason).toBe('already_paid')
  })

  it('pas encore due → rien, et l’échéance est quand même dite', () => {
    const out = prepareReminder({ invoice: FACTURE, client: CLIENT, today: '2026-07-03' })
    expect(out.prepared === false && out.reason).toBe('not_overdue_yet')
    expect(out.prepared === false && out.dueOn).toBe('2026-07-01')
  })

  it('⚠️ une donnée manquante NOMME ce qui manque — la relance ne se prépare pas avec un blanc', () => {
    const out = prepareReminder({
      invoice: { ...FACTURE, reference: '  ', amountCents: null, currency: null },
      client: { ...CLIENT, billingEmail: null },
      today: '2026-07-20',
    })
    expect(out.prepared === false && out.reason).toBe('incomplete')
    // Tout en une fois : l'opérateur ne découvre pas les trous un par un.
    expect(out.prepared === false && out.missing).toEqual([
      'la référence de la facture',
      'le montant facturé',
      'l’adresse de facturation du client',
    ])
  })

  it('un montant à ZÉRO n’est pas un montant manquant', () => {
    // « Non mesuré » n'est pas « 0 », et l'inverse est vrai aussi : une facture
    // à 0 € existe (un avoir, un geste commercial) et se relance.
    const out = prepareReminder({ invoice: { ...FACTURE, amountCents: 0 }, client: CLIENT, today: '2026-07-20' })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    expect(out.body).toContain('0,00')
  })
})

describe('le montant et la référence viennent de la FACTURE, jamais du contrat', () => {
  it('une facture émise pour un montant différent du contrat porte SON montant', () => {
    const out = prepareReminder({
      invoice: { ...FACTURE, reference: 'F-2026-0999', amountCents: 59_500, currency: 'CHF' },
      client: { ...CLIENT, billedToName: 'Alpha Holding SAS' },
      today: '2026-07-20',
    })
    expect(out.prepared).toBe(true)
    if (!out.prepared) return
    expect(out.subject).toContain('F-2026-0999')
    expect(out.subject).toContain('CHF')
    expect(out.recipientEmail).toBe('compta@esn-alpha.fr')
  })

  it('le récapitulatif nomme le destinataire des CONDITIONS, pas l’espace', () => {
    // Un bêta-testeur facturé à titre particulier pendant qu'il travaille dans
    // une ESN est un cas courant : le nom de l'espace serait le mauvais.
    const out = prepareReminder({
      invoice: FACTURE,
      client: { ...CLIENT, billedToName: 'Alpha Holding SAS' },
      today: '2026-07-20',
      requestedTone: 'firm',
    })
    expect(out.prepared).toBe(true)
    expect(out.prepared && out.body).toContain('Alpha Holding SAS')
    expect(out.prepared && out.body).not.toContain('ESN Alpha')
  })
})

describe('`today` est un paramètre, jamais l’horloge', () => {
  it('deux dates différentes rendent deux verdicts différents sur la MÊME facture', () => {
    const tot = prepareReminder({ invoice: FACTURE, client: CLIENT, today: '2026-07-02' })
    const tard = prepareReminder({ invoice: FACTURE, client: CLIENT, today: '2026-07-04' })
    expect(tot.prepared).toBe(false)
    expect(tard.prepared).toBe(true)
  })
})

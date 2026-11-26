import { REMINDER_SCHEDULE_DAYS, reminderDue, type InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  COLLECTIONS_WINDOW_MONTHS,
  collectionMonths,
  collectionStatus,
  isCollectible,
  lastCollectionAction,
  nextCollectionAction,
  overdueDaysAt,
  overdueSeverity,
  summarizeCollections,
  unmatchedPaymentsBucket,
} from './collections'

const NOW = new Date('2026-08-29T12:00:00.000Z')

function line(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-06-01',
    state: 'invoiced',
    blockers: [],
    days: 20,
    preparedAmountCents: 12_000_00,
    invoicedAt: '2026-07-05T12:00:00.000Z',
    invoiceReference: 'F-2026-118',
    invoicedAmountCents: 12_000_00,
    dueOn: '2026-08-04',
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  }
}

/**
 * LES DÉRIVATIONS DE L'ÉCRAN « ENCAISSEMENTS ».
 *
 * Elles vivent à UN endroit, ici, et l'écran ne recalcule rien : deux chemins
 * qui referaient le même retard divergeraient, et « 12 jours » sur une colonne
 * contre « 11 » sur un compteur suffit à ce que personne ne croie plus ni l'un
 * ni l'autre.
 */
describe('la fenêtre de collecte', () => {
  it('remonte douze mois, du mois courant vers le plus ancien', () => {
    const months = collectionMonths(NOW)
    expect(months).toHaveLength(COLLECTIONS_WINDOW_MONTHS)
    expect(months[0]).toBe('2026-08')
    expect(months[1]).toBe('2026-07')
    expect(months.at(-1)).toBe('2025-09')
  })

  it('passe l’année sans se tromper de mois', () => {
    expect(collectionMonths(new Date('2026-01-15T12:00:00.000Z'), 3)).toEqual(['2026-01', '2025-12', '2025-11'])
  })
})

describe('ce qui entre dans l’écran', () => {
  /**
   * L'encaissement commence à la FACTURE. Ce qui n'est pas encore facturé se
   * répare sur l'écran de facturation, avec ses bloqueurs — le montrer ici
   * ferait deux écrans qui disent la même chose et une file d'impayés qu'on ne
   * lit plus parce qu'elle est pleine de mois qui ne sont pas dus.
   */
  it('ne retient que les mois FACTURÉS', () => {
    expect(isCollectible(line({ state: 'invoiced' }))).toBe(true)
    for (const state of ['blocked', 'ready', 'not_due'] as const) {
      expect(isCollectible(line({ state }))).toBe(false)
    }
  })

  // #2197.41 — un mois DÉCLARÉ facturé (sans preuve de connecteur) attend
  // toujours son règlement : l'exclure du suivi d'encaissement ferait
  // disparaître un impayé que personne n'a prouvé mais que personne ne
  // relance plus non plus.
  it('#2197.41 — retient AUSSI les mois DÉCLARÉS facturés, comme les PROUVÉS', () => {
    expect(isCollectible(line({ state: 'invoiced_declared' }))).toBe(true)
  })
})

describe('le retard, en jours', () => {
  it('vaut 0 le jour de l’échéance — elle vient d’échoir', () => {
    expect(overdueDaysAt('2026-08-29', NOW)).toBe(0)
  })

  it('compte les jours passés depuis l’échéance', () => {
    expect(overdueDaysAt('2026-08-04', NOW)).toBe(25)
  })

  it('est NÉGATIF avant l’échéance — une facture à venir n’est pas en retard', () => {
    expect(overdueDaysAt('2026-09-10', NOW)).toBeLessThan(0)
  })

  /**
   * ⚠️ « on ne sait pas » et « zéro jour de retard » ne se corrigent pas de la
   * même façon : la première se répare en saisissant une échéance, la seconde
   * ne se répare pas du tout.
   */
  it('rend `null` sans échéance, et jamais 0', () => {
    expect(overdueDaysAt(null, NOW)).toBeNull()
    expect(overdueDaysAt('pas une date', NOW)).toBeNull()
  })

  /**
   * LE TEST QUI EMPÊCHE LES DEUX CALCULS DE DIVERGER.
   *
   * `reminderDue` compte lui aussi les jours depuis l'échéance, et il ne les
   * expose que lorsqu'une relance est due. Les deux formules DOIVENT rendre le
   * même nombre — sinon la colonne « Retard » et la relance qu'elle justifie se
   * contrediraient sur la même ligne.
   */
  it('rend exactement le retard que `reminderDue` a compté', () => {
    const item = line({ dueOn: '2026-08-04', remindersSent: 0 })
    const due = reminderDue(
      {
        state: item.state,
        dueOn: item.dueOn,
        paidAt: item.paidAt,
        paidAmountCents: item.paidAmountCents,
        invoicedAmountCents: item.invoicedAmountCents,
        remindersSent: item.remindersSent,
        disputedAt: item.disputedAt,
        disputeResolvedAt: item.disputeResolvedAt,
      },
      NOW,
    )
    expect(due).not.toBeNull()
    expect(overdueDaysAt(item.dueOn, NOW)).toBe(due?.overdueDays)
  })
})

describe('la gravité du retard', () => {
  /**
   * ⚠️ Elle suit les JOURS, pas le rang de relance. Le rang dépend de combien
   * de relances sont déjà parties : deux factures également en retard
   * s'affichaient de deux couleurs différentes selon qu'on avait pensé à
   * consigner une relance.
   *
   * Et les seuils ne sont pas réinventés : ce sont ceux de la cadence, qui vit
   * à un seul endroit.
   */
  it('monte aux seuils de la cadence, et nulle part ailleurs', () => {
    expect(overdueSeverity(0)).toBe('fresh')
    expect(overdueSeverity(REMINDER_SCHEDULE_DAYS[0] - 1)).toBe('fresh')
    expect(overdueSeverity(REMINDER_SCHEDULE_DAYS[0])).toBe('late')
    expect(overdueSeverity(REMINDER_SCHEDULE_DAYS[2] - 1)).toBe('late')
    expect(overdueSeverity(REMINDER_SCHEDULE_DAYS[2])).toBe('critical')
  })
})

describe('le statut d’encaissement', () => {
  it('dit PAYÉ quand le règlement est constaté', () => {
    expect(collectionStatus(line({ paidAt: '2026-08-20T12:00:00.000Z' }), NOW)).toBe('paid')
  })

  /**
   * Le litige passe AVANT le paiement : un client qui règle ce qu'il ne
   * conteste pas laisse une ligne à la fois payée ET contestée, et c'est le
   * litige qui appelle un geste.
   */
  it('dit CONTESTÉ tant que le litige court, paiement partiel compris', () => {
    expect(
      collectionStatus(line({ disputedAt: '2026-07-20T12:00:00.000Z', paidAt: '2026-08-01T12:00:00.000Z' }), NOW),
    ).toBe('disputed')
  })

  it('redevient lisible quand le litige est LEVÉ', () => {
    expect(
      collectionStatus(
        line({
          disputedAt: '2026-07-20T12:00:00.000Z',
          disputeResolvedAt: '2026-08-10T12:00:00.000Z',
          paidAt: '2026-08-12T12:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe('paid')
  })

  it('dit EN RETARD passé l’échéance', () => {
    expect(collectionStatus(line({ dueOn: '2026-08-04' }), NOW)).toBe('overdue')
  })

  it('dit EN ATTENTE avant l’échéance', () => {
    expect(collectionStatus(line({ dueOn: '2026-09-30' }), NOW)).toBe('pending')
  })

  /**
   * ⚠️ Sans échéance, « en retard » n'a pas de sens — et « à jour » serait un
   * verdict conclu d'un silence. La ligne reste en attente, et l'écran NOMME
   * l'échéance manquante ailleurs.
   */
  it('reste EN ATTENTE sans échéance — jamais « en retard » deviné', () => {
    expect(collectionStatus(line({ dueOn: null }), NOW)).toBe('pending')
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * #2419.4 — UN PAIEMENT PARTIEL NE SORT PAS DE LA FILE
   * ─────────────────────────────────────────────────────────────────────────
   * Le statut ne regardait que la DATE. Un client qui règle 5 000 € sur une
   * facture de 10 000 € faisait poser `paidAt` : la ligne devenait « payée »,
   * quittait la file de relance, et les 5 000 € restants n'étaient plus jamais
   * réclamés. Aucune alerte, aucun écran ne le disait.
   *
   * L'ARBITRAGE : la ligne RESTE dans sa file (`overdue` / `pending`), avec
   * son reste dû NOMMÉ — pas de cinquième statut. Un statut distinct la
   * sortirait des seaux « en retard », c'est-à-dire referait le défaut en plus
   * doux : le geste à faire sur une facture réglée à moitié est exactement
   * celui d'une facture impayée — relancer.
   */
  it('reste EN RETARD quand le règlement est PARTIEL — 5 000 € sur 10 000 €', () => {
    expect(
      collectionStatus(
        line({
          invoicedAmountCents: 10_000_00,
          paidAt: '2026-08-20T12:00:00.000Z',
          paidAmountCents: 5_000_00,
          dueOn: '2026-08-04',
        }),
        NOW,
      ),
    ).toBe('overdue')
  })

  it('reste EN ATTENTE quand le règlement est partiel et l’échéance à venir', () => {
    expect(
      collectionStatus(
        line({
          invoicedAmountCents: 10_000_00,
          paidAt: '2026-08-20T12:00:00.000Z',
          paidAmountCents: 5_000_00,
          dueOn: '2026-09-30',
        }),
        NOW,
      ),
    ).toBe('pending')
  })

  /**
   * ⚠️ « Non mesuré » n'est jamais « 0 », et ce n'est pas non plus « partiel ».
   * Basculer en retard une ligne dont on ignore le montant encaissé
   * accuserait un client d'un impayé sur la foi d'une absence.
   */
  it('dit PAYÉ quand le montant encaissé est INCONNU — on n’accuse pas d’un silence', () => {
    expect(
      collectionStatus(
        line({ invoicedAmountCents: 10_000_00, paidAt: '2026-08-20T12:00:00.000Z', paidAmountCents: null }),
        NOW,
      ),
    ).toBe('paid')
  })

  /** Sans montant FACTURÉ, le dénominateur manque : le rapport est
   *  indéterminé, la ligne ne peut pas être dite partielle. */
  it('dit PAYÉ quand le montant FACTURÉ est inconnu — le rapport est indéterminé', () => {
    expect(
      collectionStatus(
        line({ invoicedAmountCents: null, paidAt: '2026-08-20T12:00:00.000Z', paidAmountCents: 5_000_00 }),
        NOW,
      ),
    ).toBe('paid')
  })

  /** Le litige garde sa priorité : il passe avant le paiement partiel, comme
   *  il passait déjà avant le paiement tout court. */
  it('dit CONTESTÉ même sur un règlement partiel — le litige garde la main', () => {
    expect(
      collectionStatus(
        line({
          invoicedAmountCents: 10_000_00,
          paidAt: '2026-08-20T12:00:00.000Z',
          paidAmountCents: 5_000_00,
          disputedAt: '2026-07-20T12:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe('disputed')
  })
})

describe('la prochaine action', () => {
  it('ne réclame rien sur un mois payé', () => {
    expect(nextCollectionAction(line({ paidAt: '2026-08-20T12:00:00.000Z' }), NOW)).toBeNull()
  })

  /** #2419.4 — c'est la relance qui réclame le reste dû : rien d'autre ne le
   *  fait, et personne ne le voit si la ligne quitte la file. */
  it('RELANCE encore sur un règlement PARTIEL', () => {
    expect(
      nextCollectionAction(
        line({
          invoicedAmountCents: 10_000_00,
          paidAt: '2026-08-20T12:00:00.000Z',
          paidAmountCents: 5_000_00,
          dueOn: '2026-08-04',
          remindersSent: 0,
        }),
        NOW,
      ),
    ).toEqual({ kind: 'remind', index: 1 })
  })

  it('ne réclame rien quand le montant encaissé est inconnu', () => {
    expect(
      nextCollectionAction(
        line({ invoicedAmountCents: 10_000_00, paidAt: '2026-08-20T12:00:00.000Z', paidAmountCents: null }),
        NOW,
      ),
    ).toBeNull()
  })

  it('renvoie au litige tant qu’il court — relancer le durcirait', () => {
    expect(nextCollectionAction(line({ disputedAt: '2026-07-20T12:00:00.000Z' }), NOW)).toEqual({
      kind: 'resolve_dispute',
    })
  })

  it('réclame l’échéance quand elle manque — la cadence ne peut pas démarrer', () => {
    expect(nextCollectionAction(line({ dueOn: null }), NOW)).toEqual({ kind: 'set_due_date' })
  })

  it('nomme le RANG de la relance due', () => {
    expect(nextCollectionAction(line({ dueOn: '2026-08-04', remindersSent: 0 }), NOW)).toEqual({
      kind: 'remind',
      index: 1,
    })
  })

  /**
   * Le silence après trois relances est un sujet de management, pas de cadence
   * — et le produit ne relance personne tout seul de toute façon.
   */
  it('remonte à un humain au-delà de la cadence', () => {
    expect(nextCollectionAction(line({ dueOn: '2026-06-04', remindersSent: 3 }), NOW)).toEqual({
      kind: 'escalate_to_human',
    })
  })

  it('dit d’ATTENDRE avant l’échéance de la relance suivante', () => {
    expect(nextCollectionAction(line({ dueOn: '2026-09-30', remindersSent: 0 }), NOW)).toEqual({ kind: 'wait' })
  })
})

// #2198.7 — la DERNIÈRE action consignée sur la ligne, tous types confondus :
// relance, règlement, ouverture ou levée de litige. Aucune de ces quatre dates
// n'est recalculée ici — elle vit déjà sur `InvoiceReadiness`, ce bloc ne fait
// que retenir la plus RÉCENTE des quatre, et nommer laquelle.
describe('la dernière action consignée', () => {
  it('ne rend rien tant qu’aucune des quatre actions n’a eu lieu', () => {
    expect(lastCollectionAction(line())).toBeNull()
  })

  it('nomme la relance quand c’est la seule action', () => {
    expect(lastCollectionAction(line({ lastReminderAt: '2026-08-10T09:00:00.000Z' }))).toEqual({
      kind: 'reminder',
      at: '2026-08-10T09:00:00.000Z',
    })
  })

  it('retient la PLUS RÉCENTE des quatre, pas la première trouvée', () => {
    expect(
      lastCollectionAction(
        line({
          lastReminderAt: '2026-08-01T09:00:00.000Z',
          disputedAt: '2026-08-15T09:00:00.000Z',
          paidAt: null,
        }),
      ),
    ).toEqual({ kind: 'disputed', at: '2026-08-15T09:00:00.000Z' })
  })

  it('la levée du litige l’emporte sur son ouverture quand elle est plus récente', () => {
    expect(
      lastCollectionAction(
        line({
          disputedAt: '2026-08-01T09:00:00.000Z',
          disputeResolvedAt: '2026-08-05T09:00:00.000Z',
        }),
      ),
    ).toEqual({ kind: 'dispute_resolved', at: '2026-08-05T09:00:00.000Z' })
  })

  it('le règlement l’emporte quand il est postérieur à la dernière relance', () => {
    expect(
      lastCollectionAction(
        line({
          lastReminderAt: '2026-08-01T09:00:00.000Z',
          paidAt: '2026-08-20T12:00:00.000Z',
        }),
      ),
    ).toEqual({ kind: 'paid', at: '2026-08-20T12:00:00.000Z' })
  })
})

/**
 * #2419.9 — le tableau de bord cash sépare FACTURÉ, à échéance, en retard,
 * encaissé et litige. « Facturé » est un AGRÉGAT (la somme de ce qui est parti),
 * jamais un cinquième statut de ligne (c72) — et sa SOURCE se nomme (c80) : la
 * part DÉCLARÉE est comptée à part.
 */
describe('#2419.9 — le seau « facturé », un agrégat qui nomme sa source', () => {
  it('totalise le FACTURÉ de toutes les lignes parties, quel que soit leur statut', () => {
    const summary = summarizeCollections(
      [
        line({ paidAt: '2026-08-01T12:00:00.000Z', invoicedAmountCents: 10_000_00, paidAmountCents: 10_000_00 }),
        line({ dueOn: '2026-09-30', invoicedAmountCents: 3_000_00 }),
        line({ state: 'invoiced_declared', dueOn: '2026-08-04', invoicedAmountCents: 7_000_00 }),
      ],
      NOW,
    )
    expect(summary.invoiced).toEqual({ count: 3, amountCents: 20_000_00, withoutAmount: 0, declared: 1 })
  })

  it('rend `null` — jamais 0 — quand aucun facturé n’est lisible', () => {
    const summary = summarizeCollections([line({ invoicedAmountCents: null })], NOW)
    expect(summary.invoiced.amountCents).toBeNull()
    expect(summary.invoiced.withoutAmount).toBe(1)
  })
})

/**
 * #2419.9 — LE SEAU « NON RAPPROCHÉ », séparé des quatre statuts d'encaissement.
 *
 * Sa source n'est PAS `invoice_readiness` : ce sont les paiements CONSTATÉS
 * (#2419.1, `GET /delivery/payments`, `unmatched`) qu'aucun humain n'a encore
 * rattachés à une facture. Un agrégat de PAIEMENTS, jamais un cinquième statut
 * de LIGNE facturée (c72) — c'est le paiement qui est « non rapproché »,
 * jamais la facture.
 */
describe('#2419.9 — le seau « non rapproché », séparé des quatre statuts (c72)', () => {
  it('compte et totalise les paiements SANS facture rattachée', () => {
    const bucket = unmatchedPaymentsBucket([{ amountCents: 4_800_00 }, { amountCents: 1_200_00 }])
    expect(bucket).toEqual({ count: 2, amountCents: 6_000_00, withoutAmount: 0 })
  })

  it('rend un seau VIDE à 0 — aucun paiement en attente est un fait vrai, pas une absence de mesure', () => {
    expect(unmatchedPaymentsBucket([])).toEqual({ count: 0, amountCents: 0, withoutAmount: 0 })
  })
})

describe('les quatre compteurs', () => {
  it('compte et TOTALISE chaque seau séparément', () => {
    const summary = summarizeCollections(
      [
        // ⚠️ Ces deux lignes portaient `paidAt` avec un montant encaissé
        // INFÉRIEUR au facturé (12 000 € par défaut) : elles étaient
        // partiellement réglées et comptées comme soldées. C'était le défaut
        // #2419.4, écrit dans le test. Elles SOLDENT désormais leur facture —
        // le cas partiel a son propre test, juste dessous.
        line({ paidAt: '2026-08-01T12:00:00.000Z', invoicedAmountCents: 10_000_00, paidAmountCents: 10_000_00 }),
        line({ paidAt: '2026-08-02T12:00:00.000Z', invoicedAmountCents: 5_000_00, paidAmountCents: 5_000_00 }),
        line({ dueOn: '2026-09-30', invoicedAmountCents: 3_000_00 }),
        line({ dueOn: '2026-08-04', invoicedAmountCents: 7_000_00 }),
        line({ disputedAt: '2026-07-20T12:00:00.000Z', invoicedAmountCents: 2_000_00 }),
      ],
      NOW,
    )
    expect(summary.paid).toEqual({ count: 2, amountCents: 15_000_00, withoutAmount: 0 })
    expect(summary.pending).toEqual({ count: 1, amountCents: 3_000_00, withoutAmount: 0 })
    expect(summary.overdue).toEqual({ count: 1, amountCents: 7_000_00, withoutAmount: 0 })
    expect(summary.disputed).toEqual({ count: 1, amountCents: 2_000_00, withoutAmount: 0 })
  })

  /**
   * ⚠️ LE DÉFAUT DÉJÀ PAYÉ ICI : « encaissé : 0 € » partout, parce qu'une somme
   * sur zéro montant lisible rendait 0. Sans droit financier, TOUTES les lignes
   * arrivent avec des montants `null` — le seau doit dire « on ne sait pas »,
   * jamais « zéro euro ».
   */
  it('rend `null` — jamais 0 — quand aucun montant du seau n’est lisible', () => {
    const summary = summarizeCollections([line({ paidAt: '2026-08-01T12:00:00.000Z', paidAmountCents: null })], NOW)
    expect(summary.paid.amountCents).toBeNull()
    expect(summary.paid.count).toBe(1)
    expect(summary.paid.withoutAmount).toBe(1)
  })

  /**
   * Un total PARTIEL se lit comme un total tant que rien ne dit combien de
   * lignes manquent — c'est la règle du compteur « N non chiffrés » de l'écran
   * de facturation, et elle vaut ici pour la même raison.
   */
  it('NOMME les lignes sans montant à côté d’un total partiel', () => {
    const summary = summarizeCollections(
      [
        line({ dueOn: '2026-08-04', invoicedAmountCents: 7_000_00 }),
        line({ dueOn: '2026-08-04', invoicedAmountCents: null }),
      ],
      NOW,
    )
    expect(summary.overdue.amountCents).toBe(7_000_00)
    expect(summary.overdue.withoutAmount).toBe(1)
  })

  it('vaut zéro euro sur un seau VIDE — là, « 0 » est vrai', () => {
    const summary = summarizeCollections([], NOW)
    expect(summary.paid).toEqual({ count: 0, amountCents: 0, withoutAmount: 0 })
  })

  /**
   * #2197.41 — l'agrégat COMPTE un mois DÉCLARÉ comme un mois collectible, au
   * même titre qu'un PROUVÉ. C'est le test qui échoue si `summarizeCollections`
   * retombe sur un filtre `state === 'invoiced'` strict : le mois déclaré
   * sortirait alors silencieusement du seau « en retard ».
   */
  it('#2197.41 — un mois DÉCLARÉ facturé en retard entre dans le seau « en retard », comme un PROUVÉ', () => {
    const summary = summarizeCollections(
      [line({ state: 'invoiced_declared', dueOn: '2026-08-04', invoicedAmountCents: 7_000_00 })],
      NOW,
    )
    expect(summary.overdue).toEqual({ count: 1, amountCents: 7_000_00, withoutAmount: 0 })
  })

  /**
   * Une facture impayée dont personne n'a saisi l'échéance n'est ni « à venir »
   * ni « en retard ». La ranger en attente sans le dire ferait croire qu'elle
   * est sous contrôle.
   */
  it('compte à part les impayés SANS échéance', () => {
    const summary = summarizeCollections([line({ dueOn: null }), line({ dueOn: '2026-09-30' })], NOW)
    expect(summary.withoutDueDate).toBe(1)
    expect(summary.pending.count).toBe(2)
  })

  /**
   * #2419.4 — le seau des retards totalise ce qui RESTE DÛ, pas le facturé.
   * Compter 10 000 € sur une facture déjà réglée à moitié réclamerait deux
   * fois les 5 000 € encaissés : c'est exactement la confusion que
   * `bucketAmountCents` refusait déjà entre « rentré » et « dû ».
   */
  it('totalise le RESTE DÛ d’un règlement partiel, jamais le facturé entier', () => {
    const summary = summarizeCollections(
      [
        line({
          invoicedAmountCents: 10_000_00,
          paidAt: '2026-08-20T12:00:00.000Z',
          paidAmountCents: 5_000_00,
          dueOn: '2026-08-04',
        }),
      ],
      NOW,
    )
    expect(summary.paid.count).toBe(0)
    expect(summary.overdue).toEqual({ count: 1, amountCents: 5_000_00, withoutAmount: 0 })
  })

  /** Payée d'un montant NON MESURÉ : la ligne reste dans le seau « payé », et
   *  c'est son montant qui est inconnu — jamais « 0 € encaissé ». */
  it('range dans PAYÉ une ligne réglée d’un montant inconnu, sans chiffrer', () => {
    const summary = summarizeCollections(
      [line({ invoicedAmountCents: 10_000_00, paidAt: '2026-08-20T12:00:00.000Z', paidAmountCents: null })],
      NOW,
    )
    expect(summary.paid).toEqual({ count: 1, amountCents: null, withoutAmount: 1 })
    expect(summary.overdue.count).toBe(0)
  })

  it('ignore ce qui n’est pas facturé', () => {
    const summary = summarizeCollections([line({ state: 'ready', preparedAmountCents: 9_000_00 })], NOW)
    expect(summary.pending.count).toBe(0)
    expect(summary.overdue.count).toBe(0)
  })
})

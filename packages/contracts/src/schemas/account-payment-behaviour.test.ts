import { describe, expect, it } from 'vitest'
import {
  PAYMENT_BEHAVIOUR_MIN_INVOICES,
  PAYMENT_BEHAVIOUR_WINDOW_MONTHS,
  accountPaymentBehaviour,
  type PaymentBehaviourInvoice,
} from './invoice-readiness.js'

/**
 * Un jugement sur un CLIENT se mesure ou ne s'affiche pas.
 *
 * Les tests portent sur des invariants — « le dénominateur est le nombre de
 * factures retenues », « sous le seuil, aucun décompte ne sort », « une facture
 * sans échéance est comptée à part » — jamais sur la valeur du seuil, qui est un
 * réglage.
 */

const TODAY = new Date('2026-09-01T00:00:00.000Z')

/** Une facture ÉMISE avec une échéance connue, réglée avant l'heure. */
function onTime(index: number): PaymentBehaviourInvoice {
  return {
    invoicedAt: `2026-0${(index % 8) + 1}-01T00:00:00.000Z`,
    dueOn: '2026-08-31',
    paidAt: '2026-08-01T00:00:00.000Z',
    // #2419.4 — le décompte tient désormais les deux montants du solde : un
    // règlement partiel n'est pas un règlement à l'heure.
    paidAmountCents: 10_000_00,
    invoicedAmountCents: 10_000_00,
    disputedAt: null,
  }
}

function times(count: number, build: (index: number) => PaymentBehaviourInvoice): PaymentBehaviourInvoice[] {
  return Array.from({ length: count }, (_, index) => build(index))
}

/** De quoi passer le seuil, quel qu'il soit. */
const ENOUGH = PAYMENT_BEHAVIOUR_MIN_INVOICES

describe('accountPaymentBehaviour — un DÉCOMPTE, avec son dénominateur et sa période', () => {
  it('sous le seuil, il n’y a pas de comportement de paiement — et aucun décompte ne sort', () => {
    // « Un compte avec deux factures dans l'historique n'a pas de comportement
    // de paiement : il a pas assez d'historique pour mesurer. »
    const result = accountPaymentBehaviour(times(ENOUGH - 1, onTime), { now: TODAY })
    expect(result.measurability.measurable).toBe(false)
    expect(result.measurability.observed).toBe(ENOUGH - 1)
    expect(result.measurability.missing).toBe(1)
    // ⚠️ Les décomptes ne valent PAS 0 : « zéro retard » est une bonne nouvelle,
    // et on n'a rien mesuré du tout.
    expect(result.lateCount).toBeNull()
    expect(result.disputedCount).toBeNull()
  })

  it('au seuil, les décomptes sortent — avec le dénominateur qui les fonde', () => {
    const result = accountPaymentBehaviour(times(ENOUGH, onTime), { now: TODAY })
    expect(result.measurability.measurable).toBe(true)
    expect(result.invoiceCount).toBe(ENOUGH)
    // Un décompte NUL sur un dénominateur réel vaut bien 0 : « 0 retard sur 5 »
    // est une mesure, et c'est même la bonne nouvelle qu'on veut pouvoir dire.
    expect(result.lateCount).toBe(0)
    expect(result.disputedCount).toBe(0)
  })

  it('compte comme EN RETARD une facture réglée après son échéance', () => {
    const late: PaymentBehaviourInvoice = {
      invoicedAt: '2026-05-01T00:00:00.000Z',
      dueOn: '2026-06-30',
      paidAt: '2026-07-15T00:00:00.000Z',
      disputedAt: null,
    }
    const result = accountPaymentBehaviour([late, ...times(ENOUGH - 1, onTime)], { now: TODAY })
    expect(result.lateCount).toBe(1)
    expect(result.invoiceCount).toBe(ENOUGH)
  })

  it('compte comme EN RETARD une facture NON réglée dont l’échéance est passée', () => {
    // L'argent qui n'est pas rentré est le fait le plus important des deux.
    const overdue: PaymentBehaviourInvoice = {
      invoicedAt: '2026-05-01T00:00:00.000Z',
      dueOn: '2026-06-30',
      paidAt: null,
      disputedAt: null,
    }
    expect(accountPaymentBehaviour([overdue, ...times(ENOUGH - 1, onTime)], { now: TODAY }).lateCount).toBe(1)
  })

  it('une facture NON réglée dont l’échéance N’EST PAS passée n’est pas un retard', () => {
    const pending: PaymentBehaviourInvoice = {
      invoicedAt: '2026-08-01T00:00:00.000Z',
      dueOn: '2026-10-31',
      paidAt: null,
      disputedAt: null,
    }
    expect(accountPaymentBehaviour([pending, ...times(ENOUGH - 1, onTime)], { now: TODAY }).lateCount).toBe(0)
  })

  it('une facture sans ÉCHÉANCE est comptée à part, jamais absorbée', () => {
    // Sans échéance, il n'y a pas de retard à constater — et un historique mal
    // daté ne doit pas se lire comme un historique propre.
    const undated: PaymentBehaviourInvoice = {
      invoicedAt: '2026-05-01T00:00:00.000Z',
      dueOn: null,
      paidAt: '2026-07-15T00:00:00.000Z',
      disputedAt: null,
    }
    const result = accountPaymentBehaviour([undated, ...times(ENOUGH, onTime)], { now: TODAY })
    expect(result.withoutDueDate).toBe(1)
    expect(result.invoiceCount).toBe(ENOUGH)
    expect(result.lateCount).toBe(0)
  })

  it('les LITIGES se comptent sur la même population, et se disent à part du retard', () => {
    // Un litige n'est pas un retard : le client ne paie pas parce qu'il
    // conteste, et les fondre ferait passer un désaccord pour de la mauvaise
    // volonté.
    const disputed: PaymentBehaviourInvoice = {
      invoicedAt: '2026-05-01T00:00:00.000Z',
      dueOn: '2026-06-30',
      paidAt: null,
      disputedAt: '2026-07-02T00:00:00.000Z',
    }
    const result = accountPaymentBehaviour([disputed, ...times(ENOUGH - 1, onTime)], { now: TODAY })
    expect(result.disputedCount).toBe(1)
    expect(result.invoiceCount).toBe(ENOUGH)
  })

  it('la fenêtre est GLISSANTE et elle est DITE — ce qui est plus vieux sort', () => {
    const old: PaymentBehaviourInvoice = {
      invoicedAt: '2020-01-01T00:00:00.000Z',
      dueOn: '2020-02-29',
      paidAt: null,
      disputedAt: null,
    }
    const result = accountPaymentBehaviour([old, ...times(ENOUGH, onTime)], { now: TODAY })
    expect(result.windowMonths).toBe(PAYMENT_BEHAVIOUR_WINDOW_MONTHS)
    expect(result.invoiceCount).toBe(ENOUGH)
    expect(result.lateCount).toBe(0)
  })

  it('une facture jamais ÉMISE n’entre pas — elle n’a pas encore d’histoire', () => {
    const notIssued: PaymentBehaviourInvoice = {
      invoicedAt: null,
      dueOn: '2026-06-30',
      paidAt: null,
      disputedAt: null,
    }
    const result = accountPaymentBehaviour([notIssued, ...times(ENOUGH, onTime)], { now: TODAY })
    expect(result.invoiceCount).toBe(ENOUGH)
    expect(result.withoutDueDate).toBe(0)
  })

  it('aucune facture du tout : non mesurable, et surtout pas « ce client paie bien »', () => {
    const result = accountPaymentBehaviour([], { now: TODAY })
    expect(result.measurability.measurable).toBe(false)
    expect(result.invoiceCount).toBe(0)
    expect(result.lateCount).toBeNull()
    expect(result.disputedCount).toBeNull()
  })

  it('ne rend AUCUN taux, AUCUN score, AUCUNE probabilité — que des décomptes entiers', () => {
    // Doctrine : aucune probabilité, et ce n'est pas un classement de clients.
    // On dit ce qui s'est passé sur CE compte.
    const result = accountPaymentBehaviour(times(ENOUGH + 3, onTime), { now: TODAY })
    for (const value of [result.lateCount, result.disputedCount, result.invoiceCount, result.withoutDueDate]) {
      if (value === null) continue
      expect(Number.isInteger(value)).toBe(true)
    }
    expect(Object.keys(result).sort()).toEqual(
      ['disputedCount', 'invoiceCount', 'lateCount', 'measurability', 'windowMonths', 'withoutDueDate'].sort(),
    )
  })

  it('le seuil et la fenêtre sont des réglages utilisables', () => {
    expect(PAYMENT_BEHAVIOUR_MIN_INVOICES).toBeGreaterThanOrEqual(2)
    expect(PAYMENT_BEHAVIOUR_WINDOW_MONTHS).toBeGreaterThan(0)
  })

  /**
   * ───────────────────────────────────────────────────────────────────────
   * #2419.4 — UN PAIEMENT PARTIEL N'EST PAS UN PAIEMENT À L'HEURE
   * ───────────────────────────────────────────────────────────────────────
   * Ce décompte ne tenait AUCUN montant : quatre champs, tous des dates. Un
   * client qui règle 500 € sur 10 000 € le jour de l'échéance était donc
   * compté « à l'heure », et son `lateCount` restait à zéro. C'est le bloc
   * qu'on montre AVANT de renégocier des conditions de règlement — il disait
   * exactement l'inverse de ce qui s'est passé.
   */
  describe('le règlement PARTIEL', () => {
    /** Réglée à moitié, le jour même de l'échéance. */
    function halfPaid(index: number): PaymentBehaviourInvoice {
      return {
        ...onTime(index),
        paidAt: '2026-08-01T00:00:00.000Z',
        paidAmountCents: 500_00,
        invoicedAmountCents: 10_000_00,
      }
    }

    it('compte EN RETARD une facture réglée à moitié dont l’échéance est passée', () => {
      const result = accountPaymentBehaviour(
        times(ENOUGH, index => ({ ...halfPaid(index), dueOn: '2026-08-10' })),
        { now: TODAY },
      )
      expect(result.lateCount).toBe(ENOUGH)
    })

    /** Le solde n'est pas encore dû : la date d'échéance n'est pas passée, il
     *  n'y a aucun retard à constater. On ne condamne pas par avance. */
    it('ne compte AUCUN retard tant que l’échéance n’est pas passée', () => {
      const result = accountPaymentBehaviour(
        times(ENOUGH, index => ({ ...halfPaid(index), dueOn: '2026-12-31' })),
        { now: TODAY },
      )
      expect(result.lateCount).toBe(0)
    })

    /** ⚠️ Montant encaissé inconnu : on n'accuse pas un client d'un impayé sur
     *  la foi d'une absence. Le règlement compte comme un solde. */
    it('ne compte AUCUN retard quand le montant encaissé est inconnu', () => {
      const result = accountPaymentBehaviour(
        times(ENOUGH, index => ({ ...halfPaid(index), dueOn: '2026-08-10', paidAmountCents: null })),
        { now: TODAY },
      )
      expect(result.lateCount).toBe(0)
    })

    it('ne compte AUCUN retard quand le montant facturé est inconnu', () => {
      const result = accountPaymentBehaviour(
        times(ENOUGH, index => ({ ...halfPaid(index), dueOn: '2026-08-10', invoicedAmountCents: null })),
        { now: TODAY },
      )
      expect(result.lateCount).toBe(0)
    })

    it('laisse un règlement COMPLET à l’heure exactement où il était', () => {
      const result = accountPaymentBehaviour(
        times(ENOUGH, index => ({ ...halfPaid(index), paidAmountCents: 10_000_00 })),
        { now: TODAY },
      )
      expect(result.lateCount).toBe(0)
    })
  })
})

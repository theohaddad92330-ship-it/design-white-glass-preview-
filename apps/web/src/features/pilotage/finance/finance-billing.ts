import type { InvoiceBlocker, InvoiceReadiness } from '@bellum/contracts'
import { isInvoicedState } from '@bellum/contracts'

/**
 * Les bloqueurs qui disent « le TEMPS n'est pas encore bon ». Une ligne bloquée
 * sans aucun d'eux a ses temps validés : ce qui l'empêche est ailleurs (tarif,
 * bon de commande, contact) — c'est elle qu'il reste à PRÉPARER.
 */
const TIMESHEET_BLOCKERS: ReadonlySet<InvoiceBlocker> = new Set([
  'missing_timesheet',
  'timesheet_not_submitted',
  'timesheet_not_validated',
  'timesheet_disputed',
  'timesheet_anomalies',
  'timesheet_rejected',
  'unexplained_gap',
])

type Group = { count: number; amountCents: number | null; withoutAmount: number }

function seal(lines: readonly InvoiceReadiness[], amountOf: (line: InvoiceReadiness) => number | null): Group {
  let known = 0
  let withoutAmount = 0
  for (const line of lines) {
    const amount = amountOf(line)
    if (amount === null || !Number.isFinite(amount)) withoutAmount += 1
    else known += amount
  }
  // Aucun montant lisible sur un groupe non vide ⇒ on ne sait pas, jamais 0.
  // Un groupe vide n'a pas de montant du tout : l'appelant ne l'affiche pas.
  return {
    count: lines.length,
    amountCents: lines.length > 0 && withoutAmount < lines.length ? known : null,
    withoutAmount,
  }
}

/**
 * Les trois lectures de la rangée FACTURATION, dérivées de la MÊME lecture que
 * le CA par mission (`invoice-readiness`) — aucune requête de plus.
 *
 *  - PRÉPARÉ : les lignes prêtes (`ready`) — tout est réuni, le commercial émet
 *    dans son outil. « Préparée » n'est ni « créée » ni « envoyée ».
 *  - FACTURÉ : les lignes `invoiced` (PROUVÉES par le connecteur) et
 *    `invoiced_declared` (déclarées sans preuve) — la source se nomme.
 *  - À PRÉPARER : temps validés non facturés qu'un autre bloqueur retient.
 */
export function financeBilling(items: readonly InvoiceReadiness[]): {
  prepared: Group
  invoiced: Group & { proven: number; declared: number }
  toPrepare: Group
} {
  const ready = items.filter(item => item.state === 'ready')
  const invoiced = items.filter(item => isInvoicedState(item.state))
  const toPrepare = items.filter(
    item => item.state === 'blocked' && !item.blockers.some(blocker => TIMESHEET_BLOCKERS.has(blocker)),
  )
  return {
    prepared: seal(ready, item => item.preparedAmountCents),
    invoiced: {
      ...seal(invoiced, item => item.invoicedAmountCents),
      proven: invoiced.filter(item => item.state === 'invoiced').length,
      declared: invoiced.filter(item => item.state === 'invoiced_declared').length,
    },
    toPrepare: seal(toPrepare, item => item.preparedAmountCents),
  }
}

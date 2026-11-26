import { isDisputeOpen, isSettled, overdueDaysFromDueOn } from './invoice-readiness.js'

/**
 * #2408 (épopée #2979, décision Louis 15/10/2026) — LE BADGE DE FACTURATION D'UNE MISSION.
 *
 * Un seul badge sur la ligne de mission, qui mène à Facturation : facture bloquée, facture échue, paiement en
 * retard. PAS de vue ni de tuile de plus — la lecture complète reste sur Facturation / Encaissements.
 *
 * Il ne RECALCULE rien : « soldée », « litige ouvert » et « jours de retard » sont les dérivations de
 * `invoice-readiness.ts` (GA-26), les mêmes que l'écran Encaissements. Le plus grave gagne : une facture échue
 * avant un reste dû en retard avant une facturation bloquée.
 */
export type MissionBillingAlert = 'invoice_overdue' | 'payment_late' | 'invoice_blocked'

type ReceivableRow = {
  invoicedAmountCents: number | null
  paidAt: string | null
  paidAmountCents: number | null
  dueOn: string | null
  disputedAt: string | null
  disputeResolvedAt: string | null
}

/** Une facture ÉMISE : en retard (`invoice_overdue`, rien réglé), reste dû en retard (`payment_late`), ou rien. */
export function billingAlertOf(row: ReceivableRow, now: Date): 'invoice_overdue' | 'payment_late' | null {
  // Un litige ouvert est une autre file (Encaissements › litiges) : jamais accuser un client qui conteste.
  if (isDisputeOpen(row) || isSettled(row)) return null
  const days = overdueDaysFromDueOn(row.dueOn, now)
  if (days === null || days <= 0) return null
  return row.paidAt ? 'payment_late' : 'invoice_overdue'
}

export function missionBillingAlert(input: {
  blocked: boolean
  receivables: readonly ('invoice_overdue' | 'payment_late')[]
}): MissionBillingAlert | null {
  if (input.receivables.includes('invoice_overdue')) return 'invoice_overdue'
  if (input.receivables.includes('payment_late')) return 'payment_late'
  return input.blocked ? 'invoice_blocked' : null
}

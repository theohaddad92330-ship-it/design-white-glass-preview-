/**
 * Fixtures de la livraison (facturation, encaissements) partagées par les
 * parcours X41 23 et 24 — mêmes formes que `InvoiceReadiness` /
 * `ReadinessSummary` (`packages/contracts/src/schemas/invoice-readiness.ts`).
 * Données fictives : aucun client, aucun montant réel.
 */

export function readinessItem(over: Record<string, unknown> = {}) {
  return {
    missionId: 'm1',
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-09-01',
    state: 'blocked',
    blockers: ['missing_timesheet'],
    days: null,
    preparedAmountCents: null,
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
    ...over,
  }
}

export function readinessSummary(over: Record<string, unknown> = {}) {
  return {
    ready: 0,
    blocked: 0,
    invoiced: 0,
    invoicedDeclared: 0,
    preparedAmountCents: 0,
    blockedAmountCents: 0,
    withoutAmount: 0,
    notDue: 0,
    unexplainedGapCount: 0,
    preparedInvoicesCount: 0,
    amendmentsAccepted: 0,
    amendmentsSimulated: 0,
    ...over,
  }
}

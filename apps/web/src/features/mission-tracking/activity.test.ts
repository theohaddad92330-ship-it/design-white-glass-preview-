import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import type { TimesheetLine } from '@/features/missions/api'
import { buildRecentActivity } from './activity'

function line(over: Partial<TimesheetLine> = {}): TimesheetLine {
  return {
    timesheetId: 't1',
    missionId: 'm1',
    missionLabel: 'Transformation IT Europe',
    accountName: 'Airbus',
    consultantId: 'c1',
    consultantName: 'D. Économique',
    periodMonth: '2026-08-01',
    status: 'validated',
    days: 20,
    expectedDays: 20,
    gap: 0,
    gapKind: 'none',
    gapExplanation: null,
    blocksInvoicing: false,
    validatedByClientAt: null,
    approverName: null,
    anomalies: [],
    remindersSent: 0,
    lastReminderAt: null,
    rejectedAt: null,
    rejectionReason: null,
    contestedDays: null,
    correctionDeadline: null,
    submittedByName: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
    notApplicable: null,
    preDeadlineReminder: null,
    ...over,
  }
}

function row(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: 'm2',
    missionLabel: 'Supply Chain Excellence',
    accountId: 'a2',
    accountName: "L'Oréal",
    periodMonth: '2026-07-01',
    state: 'invoiced',
    blockers: [],
    days: 20,
    preparedAmountCents: 1_200_000,
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

describe('buildRecentActivity', () => {
  it('n’invente aucun auteur — seuls kind, mission et date sortent', () => {
    const events = buildRecentActivity([line({ validatedByClientAt: '2026-08-30T10:00:00.000Z' })], [], 5)
    expect(events).toEqual([
      {
        kind: 'cra_validated',
        at: '2026-08-30T10:00:00.000Z',
        missionId: 'm1',
        missionLabel: 'Transformation IT Europe',
      },
    ])
  })

  it('trie du plus récent au plus ancien, toutes natures mêlées', () => {
    const events = buildRecentActivity(
      [line({ validatedByClientAt: '2026-08-20T10:00:00.000Z' })],
      [row({ invoicedAt: '2026-08-25T10:00:00.000Z' }), row({ paidAt: '2026-08-30T10:00:00.000Z', missionId: 'm3' })],
      5,
    )
    expect(events.map(e => e.kind)).toEqual(['payment_received', 'invoice_issued', 'cra_validated'])
  })

  it('borne au nombre demandé', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ paidAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, missionId: `m-${i}` }),
    )
    expect(buildRecentActivity([], rows, 5)).toHaveLength(5)
  })

  it('ignore une date illisible plutôt que de faire échouer le tri', () => {
    const events = buildRecentActivity([], [row({ paidAt: 'not-a-date' })], 5)
    expect(events).toEqual([])
  })

  it('rend une facture, un paiement et une relance de la MÊME ligne comme trois événements', () => {
    const events = buildRecentActivity(
      [],
      [
        row({
          invoicedAt: '2026-08-01T00:00:00.000Z',
          paidAt: '2026-08-15T00:00:00.000Z',
          lastReminderAt: '2026-08-10T00:00:00.000Z',
        }),
      ],
      5,
    )
    expect(events.map(e => e.kind).sort()).toEqual(['invoice_issued', 'payment_received', 'reminder_sent'])
  })
})

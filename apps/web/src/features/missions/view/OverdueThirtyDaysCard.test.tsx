import type { InvoiceReadiness } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const collectionsWindow = vi.fn()

vi.mock('../api', () => ({
  useCollectionsWindow: () => collectionsWindow(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { OverdueThirtyDaysCard } = await import('./OverdueThirtyDaysCard')

// #3192.2 — recette G3 11/10 : « /missions/facturation — carte « facture 30 jours » ABSENTE ».
// Le bulle de Laura est budgétée (une par écran et par visite) : l'écran de catalogue porte
// donc sa propre carte, déterministe, lue des mêmes factures que l'écran Encaissements.
const NOW = new Date('2026-10-11T09:00:00.000Z')

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
    dueOn: '2026-08-03',
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  } as InvoiceReadiness
}

function show(items: InvoiceReadiness[], extra: Record<string, unknown> = {}) {
  collectionsWindow.mockReturnValue({ items, canReadFinance: true, isLoading: false, failedMonths: 0, ...extra })
  render(<OverdueThirtyDaysCard now={NOW} />)
}

afterEach(() => {
  cleanup()
  collectionsWindow.mockReset()
})

describe('OverdueThirtyDaysCard (#3192.2)', () => {
  it('nomme les factures à plus de 30 jours de retard et le plus ancien retard, avec le chemin vers les encaissements', () => {
    show([line(), line({ missionId: '22222222-2222-4222-8222-222222222222', dueOn: '2026-08-20' })])
    const card = screen.getByRole('status')
    expect(card.textContent).toMatch(/30 jours/)
    expect(card.textContent).toMatch(/2/)
    // 2026-08-03 → 2026-10-11 : 69 jours, la même formule que le brief.
    expect(card.textContent).toMatch(/69 jours/)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/missions/encaissements')
  })

  it('sait dire NON : réglée, contestée, sans échéance ou à moins de 30 jours ne fait aucune carte', () => {
    show([
      line({ paidAt: '2026-09-01T00:00:00.000Z' }),
      line({ disputedAt: '2026-09-02T00:00:00.000Z', disputeReason: 'x' }),
      line({ dueOn: null }),
      line({ dueOn: '2026-09-20' }),
    ])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ne dit rien pendant le chargement (un zéro de chargement ment)', () => {
    show([line()], { isLoading: true })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ne montre aucun montant : BellumAI suit le financier, il ne comptabilise pas', () => {
    show([line()])
    expect(screen.getByRole('status').textContent).not.toMatch(/€/)
  })
})

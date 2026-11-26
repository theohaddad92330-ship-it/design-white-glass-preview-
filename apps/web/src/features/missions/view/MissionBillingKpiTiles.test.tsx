import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCents } from '@/lib/money'

const readiness = vi.fn()
const collections = vi.fn()
vi.mock('../api', () => ({
  useInvoiceReadiness: () => readiness(),
  useCollectionsWindow: () => collections(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { MissionBillingKpiTiles } = await import('./MissionBillingKpiTiles')

/**
 * #2408.68 / #2408.69 — CA facturable non facturé et factures échues, en tête
 * de /missions. Les deux LISENT les dérivations déjà servies à Facturation et
 * Encaissements (`summary.preparedAmountCents`, `summarizeCollections`) —
 * jamais recalculées. « 0 » = zéro réel ; une source indisponible = non mesuré.
 */
afterEach(cleanup)
const normalize = (value: string) => value.replace(/\s/g, ' ')

describe('MissionBillingKpiTiles', () => {
  it('rend les deux montants MESURÉS, et un zéro réel reste zéro', () => {
    readiness.mockReturnValue({
      data: { canReadFinance: true, summary: { preparedAmountCents: 1_250_000 } },
      isError: false,
    })
    collections.mockReturnValue({
      canReadFinance: true,
      isLoading: false,
      failedMonths: 0,
      items: [],
    })
    render(<MissionBillingKpiTiles now={new Date('2026-11-01T12:00:00Z')} />)
    expect(screen.getByText('CA facturable non facturé')).toBeInTheDocument()
    expect(screen.getByText(normalize(formatCents(1_250_000, 'EUR')))).toBeInTheDocument()
    expect(screen.getByText('Factures échues')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('sait dire NON : source en échec = « non mesuré », jamais « 0 € »', () => {
    readiness.mockReturnValue({ data: undefined, isError: true })
    collections.mockReturnValue({ canReadFinance: true, isLoading: false, failedMonths: 12, items: [] })
    render(<MissionBillingKpiTiles now={new Date('2026-11-01T12:00:00Z')} />)
    expect(screen.getAllByText(/non mesuré/i).length).toBe(2)
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

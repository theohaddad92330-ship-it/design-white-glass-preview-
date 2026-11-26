import type { ExpenseReportSummaryView } from '@bellum/contracts'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Refonte Théo PR12 (23/10/2026) — la STRUCTURE de `c/missions-notes-de-frais`, tenue.
 *
 * Ce fichier dit NON si l'écran perd l'ordre de la maquette (en-tête → parcours → tuiles → barre
 * d'outils → tableau → deux cartes), une colonne du tableau, un état vide nommé, ou si « Exporter »
 * redevient un bouton mort.
 */

const reports = vi.fn()
const dataExit = vi.fn()
const download = vi.fn()

vi.mock('../api', () => ({
  useExpenseReports: (filters: unknown) => reports(filters),
  useExpensePolicies: () => ({ data: { policies: [], accounts: [] }, isLoading: false, isError: false }),
  useExpenseReportDetail: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('./ExpenseReportDrawer', () => ({ ExpenseReportDrawer: () => null }))
vi.mock('./ExpenseReportEditor', () => ({ ExpenseReportEditor: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit() }))
vi.mock('@/lib/export-csv', () => ({ downloadCSV: (...args: unknown[]) => download(...args) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const { ExpenseReportsPage } = await import('./ExpenseReportsPage')

const ROW: ExpenseReportSummaryView = {
  id: '11111111-1111-4111-8111-111111111111',
  reference: 'NDF-2026-10-014',
  bearerName: 'Yanis Berthier',
  accountName: 'SNCF',
  missionId: null,
  missionLabel: 'Fiabilisation plateforme',
  periodMonth: '2026-10',
  status: 'pending',
  lineCount: 3,
  totalAmountCents: 41200,
  submittedAt: '2026-10-10T09:00:00.000Z',
  decidedAt: null,
  decidedByName: null,
  policyCheck: { verdict: 'compliant', overageCount: 0, unmeasuredLineCount: 0, worstOverage: null },
}

function answer(items: ExpenseReportSummaryView[], rejected = 0) {
  return {
    data: {
      items,
      tiles: {
        pending: { count: 2, totalAmountCents: 64800 },
        validated: { count: 1, totalAmountCents: 18000 },
        rejected: { count: rejected, totalAmountCents: rejected === 0 ? null : 1000 },
        draft: { count: 1, totalAmountCents: 9640 },
      },
      verification: {
        overages: [],
        unmeasuredLineCount: 0,
        lineCount: 0,
        attachmentCount: 0,
        reportsWithoutReceipt: 0,
      },
      canReadFinance: true,
      total: items.length,
      page: 1,
      pageSize: 20,
    },
    isLoading: false,
    isError: false,
  }
}

beforeEach(() => {
  cleanup()
  reports.mockReset()
  download.mockReset()
  dataExit.mockReturnValue({ allowed: true, grant: {} })
})

/** Le rang, dans le document, du premier élément qui porte ce marqueur. */
function order(container: HTMLElement, selectors: string[]): number[] {
  const all = Array.from(container.querySelectorAll('*'))
  return selectors.map(selector => all.indexOf(container.querySelector(selector) as Element))
}

describe('Notes de frais — la structure de la maquette', () => {
  it('pose les blocs dans l’ordre de la maquette', () => {
    reports.mockReturnValue(answer([ROW]))
    const { container } = render(<ExpenseReportsPage />)
    const ranks = order(container, [
      '[data-theo-block="head"]',
      '[data-theo-block="guide"]',
      '[data-theo-block="stats"]',
      '[data-theo-block="toolbar"]',
      'table',
      '#expense-verification-title',
      '#expense-applied-title',
    ])
    expect(ranks.every(rank => rank >= 0)).toBe(true)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('le titre de l’écran est le h1 de la maquette, ses deux gestes à droite', () => {
    reports.mockReturnValue(answer([ROW]))
    render(<ExpenseReportsPage />)
    const head = screen.getByRole('banner')
    expect(within(head).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Les frais du mois, vérifiés avant d’être remboursés.',
    )
    expect(within(head).getByRole('button', { name: 'Exporter' })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: 'Déposer une note' })).toBeInTheDocument()
  })

  it('le tableau porte les sept colonnes de la maquette, dans l’ordre', () => {
    reports.mockReturnValue(answer([ROW]))
    render(<ExpenseReportsPage />)
    const headers = screen.getAllByRole('columnheader').map(header => header.textContent)
    expect(headers).toEqual(['Porteur · mission', 'Référence', '# Lignes', 'Montant TTC', 'Barème', 'Statut', 'Ouvrir'])
  })

  it('les quatre tuiles nomment l’état ; un compteur vide se dit « Aucune », jamais « 0 »', () => {
    reports.mockReturnValue(answer([ROW], 0))
    render(<ExpenseReportsPage />)
    const stats = screen.getByRole('group', { name: 'Les notes de la période, par état' })
    const labels = within(stats)
      .getAllByRole('button')
      .map(button => button.getAttribute('data-theo-stat'))
    expect(labels).toEqual(['pending', 'validated', 'rejected', 'draft'])
    const rejected = within(stats).getAllByRole('button')[2] as HTMLElement
    expect(within(rejected).getByText('Aucune')).toBeInTheDocument()
    expect(within(stats).queryByText('0')).not.toBeInTheDocument()
  })

  it('la barre d’outils étiquette Mois · Compte · Recherche, et mène au barème', () => {
    reports.mockReturnValue(answer([ROW]))
    const { container } = render(<ExpenseReportsPage />)
    const toolbar = container.querySelector('[data-theo-block="toolbar"]') as HTMLElement
    expect(toolbar.textContent).toMatch(/Mois.*Compte.*Recherche/)
    expect(within(toolbar).getByRole('link', { name: 'Barème de frais' })).toHaveAttribute('href', '/expenses/bareme')
  })

  it('« Exporter » sort le CSV des notes affichées, par la porte de l’espace', async () => {
    reports.mockReturnValue(answer([ROW]))
    render(<ExpenseReportsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    expect(download).toHaveBeenCalledTimes(1)
    const [csv, filename] = download.mock.calls[0] as [string, string]
    expect(filename).toBe('notes-de-frais.csv')
    expect(csv).toContain('NDF-2026-10-014')
    expect(csv).toContain('412.00')
  })

  it('sans autorisation de sortie, « Exporter » n’existe pas (jamais un bouton qui refuse après coup)', () => {
    dataExit.mockReturnValue({ allowed: false, grant: null })
    reports.mockReturnValue(answer([ROW]))
    render(<ExpenseReportsPage />)
    expect(screen.queryByRole('button', { name: 'Exporter' })).not.toBeInTheDocument()
  })

  it('une période vide le DIT, sans tableau à zéro ligne', () => {
    reports.mockReturnValue({
      ...answer([]),
      data: {
        ...answer([]).data,
        tiles: {
          pending: { count: 0, totalAmountCents: null },
          validated: { count: 0, totalAmountCents: null },
          rejected: { count: 0, totalAmountCents: null },
          draft: { count: 0, totalAmountCents: null },
        },
      },
    })
    render(<ExpenseReportsPage />)
    expect(screen.getByText('Aucune note de frais sur cette période')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Théo C missions-finance — la vue financière sous Missions : le droit Finance
 * (A6) la rend ou la remplace par une demande d'accès, et la section Cessions
 * (A2, amendement 22/10) y est dépliée, ancrée `#cessions`.
 */

const access = vi.fn()

const revenue = vi.fn()
const margin = vi.fn()
const collections = vi.fn()
const readiness = vi.fn()
const missions = vi.fn()
const expenses = vi.fn()
vi.mock('@/features/propagation/api', () => ({ useFinanceAccess: () => access() }))
vi.mock('../api', () => ({
  useRevenue: () => revenue(),
  useAggregateMargin: () => margin(),
  useCollectionsWindow: () => collections(),
  useInvoiceReadiness: () => readiness(),
  useMissions: () => missions(),
  useInvoicePayments: () => ({ data: { unmatched: [{ amountCents: 5_000_00 }] } }),
}))
vi.mock('@/features/expenses/api', () => ({ useExpenseReports: () => expenses() }))
/** Ce que les quatre lectures « par mission » rendent par défaut : rien encore. */
function quietReads() {
  readiness.mockReturnValue({ data: undefined, isLoading: false })
  missions.mockReturnValue({ data: undefined })
  expenses.mockReturnValue({ data: undefined, isLoading: false })
}
vi.mock('@/features/factoring/view/CessionsSection', () => ({
  CessionsSection: () => <section id="cessions">cessions-section</section>,
}))
vi.mock('@/features/payments/view/PaymentsPage', () => ({
  PaymentsPage: ({ embedded }: { embedded?: boolean }) => (
    <div>paiements sortants {embedded ? 'embarqués' : 'seuls'}</div>
  ),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    children,
    pageTitle,
    pageTitleBadge,
    screenGuide,
  }: {
    children: ReactNode
    pageTitle?: string
    pageTitleBadge?: ReactNode
    screenGuide?: ReactNode
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {pageTitleBadge}
      <div data-testid="guide">{screenGuide}</div>
      {children}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <a href={String(to)} {...rest}>
      {children}
    </a>
  ),
}))

const { MissionsFinancePage } = await import('./MissionsFinancePage')

describe('MissionsFinancePage — le droit Finance', () => {
  beforeEach(() => {
    access.mockReset()
    revenue.mockReset()
    margin.mockReset()
    collections.mockReset()
    revenue.mockReturnValue({ data: undefined })
    margin.mockReturnValue({ data: undefined })
    collections.mockReturnValue({ items: [], canReadFinance: true, isLoading: false, failedMonths: 0 })
    quietReads()
  })

  it('avec le droit : la pastille dit pourquoi l’écran est visible, et les Cessions sont là', () => {
    access.mockReturnValue({ digest: {}, denied: false, failed: false, canReadFinance: true })
    render(<MissionsFinancePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Revenu, marge et trésorerie' })).toBeInTheDocument()
    expect(screen.getByText('Visible avec le droit Finance')).toBeInTheDocument()
    expect(screen.getByText('cessions-section')).toBeInTheDocument()
  })

  // Maquette Théo V22 (23/10) : « Ce qui sort » vit ici ; /missions/paiements y renvoie.
  it('« Ce qui sort » embarque les paiements sortants, ancrés #sorties', () => {
    access.mockReturnValue({ digest: {}, denied: false, failed: false, canReadFinance: true })
    const { container } = render(<MissionsFinancePage />)
    expect(container.querySelector('#sorties')).not.toBeNull()
    expect(screen.getByText('paiements sortants embarqués')).toBeInTheDocument()
  })

  it('sans le droit : demande d’accès à la place des chiffres — aucune cession, aucun montant', () => {
    access.mockReturnValue({ denied: true, failed: false, canReadFinance: false })
    render(<MissionsFinancePage />)
    expect(screen.getByText('La vue financière demande le droit Finance')).toBeInTheDocument()
    expect(screen.queryByText('cessions-section')).toBeNull()
  })

  it('les renvois A2/A3/A4/A5 sont des liens réels', () => {
    access.mockReturnValue({ digest: {}, denied: false, failed: false, canReadFinance: true })
    render(<MissionsFinancePage />)
    expect(screen.getByRole('link', { name: 'Notes de frais' })).toHaveAttribute('href', '/expenses')
    expect(screen.getByRole('link', { name: 'Barème des frais' })).toHaveAttribute('href', '/expenses/bareme')
    expect(screen.getByRole('link', { name: 'Réglages finance' })).toHaveAttribute('href', '/settings/finance')
  })

  it('sans le droit, AUCUNE lecture financière ne part (le corps n’est pas monté)', () => {
    access.mockReturnValue({ denied: true, failed: false, canReadFinance: false })
    render(<MissionsFinancePage />)
    expect(revenue).not.toHaveBeenCalled()
    expect(margin).not.toHaveBeenCalled()
    expect(collections).not.toHaveBeenCalled()
  })
})

// Refonte Théo du 23/10 — chiffres du mois, marge, quatre semaines.
describe('MissionsFinancePage — la refonte du 23/10', () => {
  const NOW = new Date('2026-10-22T12:00:00.000Z')
  const granted = () => access.mockReturnValue({ digest: {}, denied: false, failed: false, canReadFinance: true })
  const lineOf = (kind: string, amountCents: number | null, over: Record<string, unknown> = {}) => ({
    kind,
    amountCents,
    withoutAmount: 0,
    unavailableReason: null,
    sourceRows: null,
    ...over,
  })

  beforeEach(() => {
    access.mockReset()
    revenue.mockReset()
    margin.mockReset()
    collections.mockReset()
    revenue.mockReturnValue({ data: undefined })
    margin.mockReturnValue({ data: undefined })
    collections.mockReturnValue({ items: [], canReadFinance: true, isLoading: false, failedMonths: 0 })
    quietReads()
  })

  it('passe son guide à la coque (un seul « Comment travailler ici ? »)', () => {
    granted()
    render(<MissionsFinancePage now={NOW} />)
    expect(
      within(screen.getByTestId('guide')).getByText('Lire séparément production, marge et trésorerie'),
    ).toBeInTheDocument()
  })

  it('les quatre chiffres du mois : production, facturé, encaissé, encours', () => {
    granted()
    revenue.mockReturnValue({
      data: {
        periodMonth: '2026-09-01',
        lines: [
          lineOf('signed', 40_000_00),
          lineOf('produced', 35_000_00),
          lineOf('invoiced', 24_200_00),
          lineOf('collected', 12_960_00),
        ],
      },
    })
    render(<MissionsFinancePage now={NOW} />)
    for (const label of [
      'Production validée',
      'Facturé sur cette activité',
      'Encaissements du mois',
      'Encours total',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(/35\s?000\s?€/)).toBeInTheDocument()
    expect(screen.getByText(/24\s?200\s?€/)).toBeInTheDocument()
  })

  it('un chiffre sans source dit sa raison, jamais « 0 € »', () => {
    granted()
    revenue.mockReturnValue({
      data: {
        periodMonth: '2026-09-01',
        lines: [
          lineOf('signed', null),
          lineOf('produced', null, { unavailableReason: 'aucun tarif renseigné' }),
          lineOf('invoiced', null),
          lineOf('collected', null),
        ],
      },
    })
    // Sans droit sur la fenêtre d'encaissement, l'encours est nommé « réservé », lui aussi — jamais « 0 € ».
    collections.mockReturnValue({ items: [], canReadFinance: false, isLoading: false, failedMonths: 0 })
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.queryByText(/^0\s?€$/)).toBeNull()
    expect(screen.getByText(/aucun tarif renseigné/)).toBeInTheDocument()
  })

  it('la marge reste un pourcentage mesuré, avec ce qui n’a pas pu l’être', () => {
    granted()
    margin.mockReturnValue({ data: { marginPercent: 32.1, measured: 2, unmeasured: 1, threshold: null, alerts: [] } })
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.getByText(/32,1\s?%/)).toBeInTheDocument()
    expect(screen.getByText(/Sur 2 missions mesurées · 1 sans coût connu/)).toBeInTheDocument()
  })

  it('une marge non mesurée n’est jamais « 0 % »', () => {
    granted()
    margin.mockReturnValue({ data: { marginPercent: null, measured: 0, unmeasured: 3, threshold: null, alerts: [] } })
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.queryByText(/^0\s?%$/)).toBeNull()
    expect(screen.getByText(/non mesuré — aucune mission avec activité et coût connus/)).toBeInTheDocument()
  })

  it('les quatre prochaines semaines : un règlement attendu est placé, l’échu est compté à part', () => {
    granted()
    const row = (over: Record<string, unknown>) => ({
      missionId: '11111111-1111-4111-8111-111111111111',
      missionLabel: 'M',
      accountId: null,
      accountName: 'ACME',
      periodMonth: '2026-09-01',
      state: 'invoiced',
      blockers: [],
      days: 20,
      preparedAmountCents: null,
      invoicedAt: '2026-09-05T12:00:00.000Z',
      invoiceReference: 'F-1',
      invoicedAmountCents: 13_440_00,
      dueOn: '2026-11-04',
      remindersSent: 0,
      lastReminderAt: null,
      paidAt: null,
      paidAmountCents: null,
      disputedAt: null,
      disputeReason: null,
      disputeResolvedAt: null,
      ...over,
    })
    collections.mockReturnValue({
      items: [row({}), row({ dueOn: '2026-10-01', invoicedAmountCents: 14_880_00 })],
      canReadFinance: true,
      isLoading: false,
      failedMonths: 0,
    })
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.getByText('Les quatre prochaines semaines')).toBeInTheDocument()
    expect(screen.getAllByText(/13\s?440\s?€/).length).toBeGreaterThan(0)
    expect(screen.getByText(/1 facture à replanifier, en litige ou sans échéance \(14\s?880\s?€\)/)).toBeInTheDocument()
    expect(screen.getAllByText('Aucun règlement attendu').length).toBe(3)
  })

  it('choisir une période relit le mois choisi', async () => {
    granted()
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<MissionsFinancePage now={NOW} />)
    const input = screen.getByLabelText('Période d’activité') as HTMLInputElement
    await userEvent.setup().type(input, '2026-09')
    expect(input.value).toBe('2026-09')
    expect(screen.getByRole('button', { name: 'Revenir au mois courant' })).toBeInTheDocument()
  })

  it('l’ancienneté de l’encours n’est PAS recopiée : sa carte mène à Encaissements, sans tranche', () => {
    granted()
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.queryByText('Non échus')).toBeNull()
    expect(screen.getByRole('link', { name: 'Voir l’ancienneté de l’encours' })).toHaveAttribute(
      'href',
      '/missions/encaissements',
    )
  })

  const activity = (over: Record<string, unknown>) => ({
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Fiabilisation plateforme',
    accountId: null,
    accountName: 'SNCF',
    ownerName: 'Maëva Coet',
    periodMonth: '2026-09-01',
    state: 'ready',
    blockers: [],
    days: 20,
    preparedAmountCents: 13_000_00,
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
  })

  // Théo `.v18-table` — la rentabilité, mission par mission : un coût inconnu reste inconnu.
  it('la rentabilité mission par mission : jours, production, coût documenté, marge — ou « Non calculée »', () => {
    granted()
    readiness.mockReturnValue({
      isLoading: false,
      data: {
        month: '2026-09-01',
        summary: { ready: 1, blocked: 1, invoiced: 0, invoicedDeclared: 0 },
        items: [
          activity({}),
          activity({
            missionId: '22222222-2222-4222-8222-222222222222',
            missionLabel: 'Industrialisation data',
            accountName: 'Orange',
            ownerName: 'Théo Haddad',
            preparedAmountCents: 11_200_00,
          }),
          activity({
            missionId: '33333333-3333-4333-8333-333333333333',
            missionLabel: 'EDI clôture',
            accountName: 'Renault',
            state: 'blocked',
            blockers: ['timesheet_not_validated', 'missing_po'],
            days: null,
            preparedAmountCents: null,
          }),
        ],
      },
    })
    missions.mockReturnValue({
      data: {
        missions: [
          { id: '11111111-1111-4111-8111-111111111111', marginPercent: 33.85 },
          { id: '22222222-2222-4222-8222-222222222222', marginPercent: null },
        ],
      },
    })
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.getByRole('heading', { level: 2, name: 'La rentabilité, mission par mission' })).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('columnheader')
        .slice(0, 6)
        .map(cell => cell.textContent),
    ).toEqual(['Mission', 'Jours validés', 'Production HT', 'Coût documenté', 'Marge', 'À faire'])
    const sncf = screen.getByRole('row', { name: /Fiabilisation plateforme/ })
    expect(within(sncf).getByText(/8\s?599,50\s?€|8\s?600\s?€/)).toBeInTheDocument()
    expect(within(sncf).getByText('33,85 % du revenu')).toBeInTheDocument()
    const orange = screen.getByRole('row', { name: /Industrialisation data/ })
    expect(within(orange).getByText('Non calculée')).toBeInTheDocument()
    expect(within(orange).getByRole('link', { name: 'Renseigner le coût' })).toBeInTheDocument()
    const renault = screen.getByRole('row', { name: /EDI clôture/ })
    expect(within(renault).getByText('À valider')).toBeInTheDocument()
    expect(within(renault).getByText('Activité à valider')).toBeInTheDocument()
    // « Ce qui mérite une décision » compte ce que la période porte : un dossier bloqué, une commande manquante.
    expect(screen.getByText('1 dossier à débloquer')).toBeInTheDocument()
    expect(screen.getByText('1 bon de commande manquant')).toBeInTheDocument()
    // La revue du mois : relevés, facturation, coûts et cash.
    expect(screen.getByText('1 relevé sans validation client')).toBeInTheDocument()
    expect(screen.getByText('1 à compléter · 1 prêts')).toBeInTheDocument()
    expect(screen.getByText(/5\s?000\s?€ à rapprocher/)).toBeInTheDocument()
  })

  it('les frais de mission : une ligne par note, son état et ses dépassements du barème', () => {
    granted()
    expenses.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          {
            id: 'n1',
            reference: 'NDF-12',
            bearerName: 'Inès Kaczmarek',
            accountName: 'Orange',
            missionLabel: 'Industrialisation data',
            lineCount: 2,
            totalAmountCents: 236_00,
            submittedAt: '2026-10-09T08:00:00.000Z',
            status: 'pending',
            policyCheck: { overageCount: 1 },
          },
        ],
      },
    })
    render(<MissionsFinancePage now={NOW} />)
    const row = screen.getByRole('row', { name: /Inès Kaczmarek/ })
    expect(within(row).getByText('En attente')).toBeInTheDocument()
    expect(within(row).getByText('1 dépassement du barème')).toBeInTheDocument()
  })

  // Refonte Théo — la STRUCTURE de `c/missions-finance.html`, dans son ordre.
  it('suit la maquette : chiffres, marge et décisions, missions, semaines, achats, sorties, frais, revue', () => {
    granted()
    render(<MissionsFinancePage now={NOW} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      'MARGE OPÉRATIONNELLE DOCUMENTÉE',
      'Ce qui mérite une décision',
      'La rentabilité, mission par mission',
      'Les quatre prochaines semaines',
      'Ancienneté de l’encours',
      'Achats et factures fournisseurs',
      'Les pièces se tiennent dans chaque mission',
      'Ce qui sort : paiements et cessions',
      'Frais de mission',
      'La revue opérationnelle du mois',
    ])
    // Les cessions sont repliées sous « Ce qui sort » (`details`), jamais à part.
    expect(screen.getByText('Cessions à l’affacturage').closest('details')).not.toBeNull()
  })
})

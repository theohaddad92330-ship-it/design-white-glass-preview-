import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account, AccountMissions } from '@bellum/contracts'

/**
 * #2124.23/.24/.30/.31 (lot M1-9) — le statut de renouvellement et les
 * risques identifiés, affichés directement (et non plus seulement digérés
 * dans `nextAction`), plus les deux actions « Ajouter une mission » et
 * « Importer mon historique » — chacune ouvre le flux EXISTANT.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))
vi.mock('@tanstack/react-router', () => ({
  // #4424.6 — la création d'une mission propose « Préparer le RDV » : le hook de création lit la navigation.
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { TabMissions } = await import('./TabMissions')

const ACCOUNT = { id: 'acc-1' } as Account
const SOURCE = { kind: 'missions' as const, href: '/missions?accountId=acc-1', label: 'Les missions de ce compte' }

const EMPTY: AccountMissions = {
  accountId: 'acc-1',
  canReadFinance: true,
  source: SOURCE,
  editable: false,
  active: [],
  past: [],
  placedConsultants: [],
  buying: null,
  notRenewed: [],
  paymentBehaviour: null,
  historicalInvoicedRevenueCents: null,
}

const activeRow = (over: Partial<AccountMissions['active'][number]> = {}): AccountMissions['active'][number] => ({
  missionId: 'm-1',
  label: 'Fiabilisation plateforme',
  roleTitle: 'Ingénieur d’exploitation',
  startedOn: '2026-01-05',
  endsOn: '2026-12-31',
  status: 'active',
  consultants: [{ consultantId: 'c-1', fullName: 'Yanis Berthier' }],
  businessManagerName: null,
  clientManagerName: null,
  daysRemaining: 68,
  renewal: 'far',
  soldDailyRateCents: 62000,
  marginPercent: 30.6,
  nextAction: 'none',
  ...over,
})

function draw(payload: AccountMissions) {
  mockFetch.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabMissions account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabMissions — statut de renouvellement et risques (#2124.23/.24)', () => {
  it('affiche le statut de renouvellement DIRECTEMENT, pas seulement digéré dans la prochaine action', async () => {
    draw({ ...EMPTY, active: [activeRow({ renewal: 'j30' })] })
    expect(await screen.findByText('J-30')).toBeInTheDocument()
  })

  it('une mission sans risque affiche « rien à signaler », jamais un tableau vide muet', async () => {
    draw({ ...EMPTY, active: [activeRow({ renewal: 'far', marginPercent: 25 })] })
    expect(await screen.findByText('Rien à signaler')).toBeInTheDocument()
  })

  it('cumule les risques identifiés (renouvellement ET marge) en badges nommés', async () => {
    draw({ ...EMPTY, active: [activeRow({ renewal: 'overdue', marginPercent: -5 })] })
    expect(await screen.findByText('Renouvellement non engagé')).toBeInTheDocument()
    expect(screen.getByText('Marge à risque')).toBeInTheDocument()
  })

  // ⚠️ LE TEST QUI SAIT DIRE NON — sans le droit financier, jamais de risque de
  // marge, même si `marginPercent` était renseigné par erreur : ce serait un
  // jugement financier porté sans le droit de le porter.
  it('sans le droit financier, aucun risque de marge ne s’affiche', async () => {
    draw({ ...EMPTY, canReadFinance: false, active: [activeRow({ renewal: 'far', marginPercent: -20 })] })
    expect(await screen.findByText('Fiabilisation plateforme')).toBeInTheDocument()
    expect(screen.queryByText('Marge à risque')).not.toBeInTheDocument()
    expect(screen.queryByText('Marge non mesurée')).not.toBeInTheDocument()
  })

  it('une mission suspendue dit que les risques ne se calculent pas, jamais « rien à signaler »', async () => {
    draw({ ...EMPTY, active: [activeRow({ status: 'paused' })] })
    expect(await screen.findByText(/ne se calculent que sur une mission en cours/)).toBeInTheDocument()
    expect(screen.queryByText('Rien à signaler')).not.toBeInTheDocument()
  })
})

describe('TabMissions — actions directes (#2124.30/.31)', () => {
  it('« Ajouter une mission » ouvre le flux EXISTANT (/missions/nouvelle)', async () => {
    draw({ ...EMPTY, active: [activeRow()] })
    const link = await screen.findByRole('link', { name: 'Ajouter une mission' })
    expect(link).toHaveAttribute('href', '/missions/nouvelle')
  })

  it('« Importer mon historique » ouvre le flux EXISTANT (Mes données › Imports)', async () => {
    draw({ ...EMPTY, active: [activeRow()] })
    const link = await screen.findByRole('link', { name: 'Importer mon historique' })
    expect(link).toHaveAttribute('href', '/settings/mes-donnees')
  })

  it('les deux actions restent disponibles même sur un compte SANS mission (#2124.30)', async () => {
    draw(EMPTY)
    expect(await screen.findByRole('link', { name: 'Ajouter une mission' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Importer mon historique' })).toBeInTheDocument()
  })
})

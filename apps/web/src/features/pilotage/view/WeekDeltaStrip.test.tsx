import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WeekDelta, WeekDeltaOpportunityBucket } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
vi.mock('../api', () => ({ pilotageApi: { weekDelta: vi.fn() } }))
vi.mock('@/components/feedback/QueryLoadError', () => ({ QueryLoadError: () => <div data-testid="load-error" /> }))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, children, params }: { to?: string; children: React.ReactNode; params?: Record<string, string> }) => (
      <a href={(to ?? '#').replace('$id', params?.id ?? '')}>{children}</a>
    ),
  }
})

const { WeekDeltaStrip } = await import('./WeekDeltaStrip')

const bucket = (
  count: number,
  amount: number | null,
  lines: WeekDeltaOpportunityBucket['lines'] = [],
): WeekDeltaOpportunityBucket => ({ count, amount, lines })

function delta(overrides: Partial<WeekDelta> = {}): WeekDelta {
  return {
    period: { from: '2026-10-07T10:00:00.000Z', to: '2026-10-14T10:00:00.000Z' },
    generatedAt: '2026-10-14T10:00:00.000Z',
    created: bucket(3, 30000),
    advanced: bucket(2, 15000, [
      {
        id: 'o1',
        label: 'Refonte SI',
        accountName: 'Société Générale',
        amount: 10000,
        from: 'qualified',
        to: 'confirmed',
      },
      {
        id: 'o2',
        label: 'Data platform',
        accountName: 'Airbus',
        amount: 5000,
        from: 'confirmed',
        to: 'profiles_submitted',
      },
    ]),
    regressed: bucket(0, 0),
    lost: bucket(1, null),
    won: bucket(1, 9000),
    missionsEnding: {
      count: 1,
      horizonDays: 30,
      lines: [{ id: 'm1', consultantName: 'Julie Martin', accountName: 'Orange', endsOn: '2026-10-30' }],
    },
    cashIn: {
      count: 3,
      amountCents: 620000,
      lines: [{ accountId: 'a1', accountName: 'Airbus', amountCents: 500000, count: 2 }],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useQuery.mockReturnValue({ data: delta(), isLoading: false, isError: false })
})

describe('WeekDeltaStrip', () => {
  it('dit sa période et le caractère non pondéré des sommes', () => {
    render(<WeekDeltaStrip />)
    expect(screen.getByRole('heading', { name: 'Ce qui a bougé' })).toBeInTheDocument()
    expect(screen.getAllByText('sur les 7 derniers jours').length).toBeGreaterThan(0)
    expect(screen.getByText(/non pondérées/i)).toBeInTheDocument()
  })

  it('une catégorie mesurée à zéro affiche 0 ; une catégorie illisible (null) n’est pas affichée', () => {
    useQuery.mockReturnValue({ data: delta({ lost: null, regressed: bucket(0, 0) }), isLoading: false, isError: false })
    render(<WeekDeltaStrip />)
    expect(screen.getByTestId('week-delta-regressed')).toHaveTextContent('0')
    expect(screen.queryByTestId('week-delta-lost')).not.toBeInTheDocument()
  })

  it('un montant jamais saisi est dit « montant non saisi », jamais 0 €', () => {
    render(<WeekDeltaStrip />)
    expect(screen.getByTestId('week-delta-lost')).toHaveTextContent('montant non saisi')
    expect(screen.getByTestId('week-delta-lost')).not.toHaveTextContent('0 €')
  })

  it('chaque compteur déplie sa liste (compte, libellé, de → vers) et la replie', async () => {
    render(<WeekDeltaStrip />)
    const advanced = screen.getByTestId('week-delta-advanced')
    expect(advanced).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Société Générale')).not.toBeInTheDocument()

    await userEvent.click(advanced)
    expect(advanced).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Société Générale')).toBeInTheDocument()
    expect(screen.getByText(/Qualifié → Besoin exprimé/)).toBeInTheDocument()

    await userEvent.click(advanced)
    expect(screen.queryByText('Société Générale')).not.toBeInTheDocument()
  })

  it('un compteur à 0 n’a aucune liste à déplier : une absence ne fait AUCUNE ligne', () => {
    render(<WeekDeltaStrip />)
    expect(screen.getByTestId('week-delta-regressed')).not.toHaveAttribute('aria-expanded')
  })

  it('missions qui finissent : consultant, client, date ; l’horizon est dit', async () => {
    render(<WeekDeltaStrip />)
    expect(screen.getByTestId('week-delta-missionsEnding')).toHaveTextContent('à venir sous 30 jours')
    await userEvent.click(screen.getByTestId('week-delta-missionsEnding'))
    expect(screen.getByText('Julie Martin')).toBeInTheDocument()
    expect(screen.getByText(/Orange/)).toBeInTheDocument()
  })

  it('encaissé : la somme réglée, lignes groupées par client', async () => {
    render(<WeekDeltaStrip />)
    expect(screen.getByTestId('week-delta-cashIn')).toHaveTextContent(/6\s?200/)
    await userEvent.click(screen.getByTestId('week-delta-cashIn'))
    expect(screen.getByText('Airbus')).toBeInTheDocument()
    expect(screen.getByText(/2 règlements/)).toBeInTheDocument()
  })

  it('tous les compteurs sont des cibles ≥ 44 px et tabulables', () => {
    render(<WeekDeltaStrip />)
    for (const id of ['created', 'advanced', 'regressed', 'won']) {
      const node = screen.getByTestId(`week-delta-${id}`)
      expect(node.className).toContain('min-h-11')
      expect(node).not.toHaveAttribute('tabindex', '-1')
    }
  })

  it('toutes les sources illisibles : une erreur de lecture, pas une rangée de zéros', () => {
    useQuery.mockReturnValue({
      data: delta({
        created: null,
        advanced: null,
        regressed: null,
        lost: null,
        won: null,
        missionsEnding: null,
        cashIn: null,
      }),
      isLoading: false,
      isError: false,
    })
    render(<WeekDeltaStrip />)
    expect(screen.getByTestId('load-error')).toBeInTheDocument()
  })
})

describe('WeekDeltaStrip — #3295.r42, « perdues » se lit et se suit', () => {
  it('« 1 perdue » mène à la liste des perdues et au REX ; chaque ligne ouvre l’affaire', async () => {
    useQuery.mockReturnValue({
      data: delta({
        lost: bucket(1, null, [
          {
            id: 'o9',
            label: 'Assistance à la recette',
            accountName: 'Alstom',
            amount: null,
            from: 'profiles_submitted',
            to: 'lost',
          },
        ]),
      }),
      isLoading: false,
      isError: false,
    })
    render(<WeekDeltaStrip />)
    expect(screen.getByRole('link', { name: 'Voir les affaires perdues' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: /retours d’expérience/ })).toHaveAttribute('href', '/pilotage/rex')
    await userEvent.click(screen.getByTestId('week-delta-lost'))
    expect(screen.getByRole('link', { name: 'Alstom' })).toHaveAttribute('href', '/projects/o9')
  })

  it('SAIT DIRE NON : aucune perdue → aucun lien', () => {
    useQuery.mockReturnValue({ data: delta({ lost: bucket(0, 0) }), isLoading: false, isError: false })
    render(<WeekDeltaStrip />)
    expect(screen.queryByTestId('week-delta-lost-link')).toBeNull()
  })
})

import { render as baseRender, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalLine, WorkspaceSignalHistory } from '@bellum/contracts'
import { historyItemsOf } from '../model/account-history'

/** Lot 773 (a, c, d) — l'Historique se lit d'un coup d'œil : lignes compactes, reformulations repliées, 5 puis « Voir les N autres ». */
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))
const { SignalsHistory } = await import('./SignalsHistory')

const render = (ui: ReactElement) =>
  baseRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const line = (id: string, title: string, over: Partial<AccountSignalLine> = {}): AccountSignalLine => ({
  id,
  title,
  type: 'projet',
  date: '2026-05-10',
  date_precision: 'month',
  period: 'past',
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})

const history = (lines: AccountSignalLine[]): WorkspaceSignalHistory =>
  ({
    accounts: [
      {
        account_id: 'A',
        company_name: 'TotalEnergies',
        sector: null,
        logo_url: null,
        website: null,
        lines,
      },
    ],
  }) as unknown as WorkspaceSignalHistory

const PANGEA = [
  line('p1', 'TotalEnergies a annoncé la signature d’un contrat avec Dell Technologies et NVIDIA pour Pangea 5'),
  line('p2', 'Signature d’un contrat pour le calcul haute performance Pangea 5'),
  line('p3', 'Signature du contrat Pangea 5 avec Dell'),
]

describe('SignalsHistory — historique lisible', () => {
  it('3 phrases Pangea 5 = UNE ligne « ×3 sources » ; le compteur compte la ligne regroupée', async () => {
    const user = userEvent.setup()
    render(<SignalsHistory items={historyItemsOf(history(PANGEA))} loading={false} />)
    expect(screen.getByTestId('history-count').textContent).toMatch(/1 besoin passé/)
    await user.click(within(screen.getByTestId('history-row')).getAllByRole('button')[0]!)
    expect(screen.getAllByTestId('history-line')).toHaveLength(1)
    expect(screen.getByTestId('signal-group-count').textContent).toMatch(/×3/)
  })

  it('« Personne de connu ne recoupe » + « Trouver qui contacter » : une fois par compte, pas par ligne', async () => {
    const user = userEvent.setup()
    render(
      <SignalsHistory
        items={historyItemsOf(
          history([
            line('a', 'Migration SI vers Azure Raffinage'),
            line('b', 'Refonte portail Clients Mobilité'),
            line('c', 'Programme data Marketing'),
          ]),
        )}
        loading={false}
      />,
    )
    await user.click(within(screen.getByTestId('history-row')).getAllByRole('button')[0]!)
    expect(screen.getAllByTestId('history-line')).toHaveLength(3)
    expect(screen.getAllByTestId('history-nobody')).toHaveLength(1)
    expect(screen.getAllByText('Trouver qui contacter')).toHaveLength(1)
  })

  it('9 besoins : 5 lignes puis « Voir les 4 autres besoins »', async () => {
    const user = userEvent.setup()
    const nine = Array.from({ length: 9 }, (_, index) =>
      line(`n${index}`, `Besoin distinct numéro ${index} Alpha${index} Beta${index}`, {
        date: `2026-0${(index % 9) + 1}-10`,
      }),
    )
    render(<SignalsHistory items={historyItemsOf(history(nine))} loading={false} />)
    await user.click(within(screen.getByTestId('history-row')).getAllByRole('button')[0]!)
    expect(screen.getAllByTestId('history-line')).toHaveLength(5)
    await user.click(screen.getByTestId('history-more'))
    expect(screen.getAllByTestId('history-line')).toHaveLength(9)
    expect(screen.queryByTestId('history-more')).toBeNull()
  })
})

describe('SignalsHistory — les besoins de tout le groupe (lot 773 e)', () => {
  it('un besoin d’une autre entité du groupe dit « Base commune · <entité> », et la phrase de tête compte besoins et entités', async () => {
    const user = userEvent.setup()
    render(
      <SignalsHistory
        items={historyItemsOf(
          history([
            line('s1', 'Renfort SAP siège', { type: 'besoin_passe', origin_kind: 'memoire' }),
            line('s2', 'Migration ERP filiale', { type: 'besoin_passe', origin_kind: 'memoire', entity: 'Martin Sud' }),
          ]),
        )}
        loading={false}
      />,
    )
    await user.click(within(screen.getByTestId('history-row')).getAllByRole('button')[0]!)
    expect(screen.getByTestId('signal-group-entities').textContent).toBe('2 besoins sur 2 entités du groupe')
    expect(screen.getByText(/Base commune · Martin Sud/)).toBeInTheDocument()
  })
})

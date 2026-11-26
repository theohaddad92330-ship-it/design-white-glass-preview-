import { render as baseRender, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalLine, WorkspaceSignalHistory } from '@bellum/contracts'
import { historyItemsOf } from '../model/account-history'

/**
 * Lot 767 — le dépli de Signaux › Historique rend la MÊME ligne que l'onglet compte : besoins en détail,
 * faits dans un groupe replié, compteurs de BESOINS seulement, jamais un domaine brut.
 */
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({ useContactsByAccount: () => ({ data: [] }) }))
vi.mock('@/features/accounts/hooks/useAccountPerimeter', () => ({ useAccountPerimeter: () => undefined }))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn() }),
}))
vi.mock('@/features/watchlist/view/WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: ({ item }: { item: { companyName: string; signalLabel: string } }) => (
    <div data-testid="watchlist-signal-detail">
      {item.companyName} · {item.signalLabel}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

const { SignalsHistory } = await import('./SignalsHistory')

const render = (ui: ReactElement) =>
  baseRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const line = (
  over: Partial<AccountSignalLine> & Pick<AccountSignalLine, 'id' | 'type' | 'title'>,
): AccountSignalLine => ({
  date: '2025-11-27',
  date_precision: 'day',
  period: 'past',
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})

const account = (id: string, name: string, lines: AccountSignalLine[]) => ({
  account_id: id,
  company_name: name,
  sector: null,
  logo_url: null,
  website: null,
  lines: lines as WorkspaceSignalHistory['accounts'][number]['lines'],
})

const HISTORY: WorkspaceSignalHistory = {
  accounts: [
    account('A', 'SEMA FRANCE', [
      line({
        id: 'need',
        type: 'besoin_passe',
        title: 'Architecte data — migration cloud',
        detail: 'Renfort pour la migration',
        url: 'https://bodacc.fr/annonce/1',
        technologies: ['Azure', 'Spark'],
        tjm_eur: 650,
        outcome: 'won',
        people_hints: { names: ['Jeanne Martin'], roles: ['DSI'], location: null },
      }),
      line({ id: 'fact', type: 'fait', title: 'La société est active, sous forme d’EURL' }),
    ]),
    account('B', 'Facts SA', [line({ id: 'fact-b', type: 'annonce_legale', title: 'Modifications diverses' })]),
  ],
}

describe('SignalsHistory — le dépli au niveau de l’onglet compte', () => {
  it('rend le besoin en détail, range le fait dans « Autres faits », ne compte que les besoins', async () => {
    const user = userEvent.setup()
    render(<SignalsHistory items={historyItemsOf(HISTORY)} loading={false} />)
    // c) le total ne compte que les BESOINS ; le compte sans besoin dit « 1 fait », jamais « 0 besoin ».
    expect(screen.getByTestId('history-count').textContent).toMatch(/1 besoin passé/)
    const [factsRow, ...others] = screen.getAllByTestId('history-row')
    expect(others).toHaveLength(1)
    const rows = [others[0]!, factsRow!] // trié par date puis nom : « Facts SA » passe avant
    expect(within(rows[0]!).getByText(/1 besoin passé/)).toBeTruthy()
    expect(within(rows[1]!).getByText(/1 fait/)).toBeTruthy()
    expect(rows[1]!.textContent).not.toMatch(/0 besoin/)

    await user.click(within(rows[0]!).getAllByRole('button')[0]!)
    // d) la ligne riche : type, titre, détail, compétences, TJM, prescripteur, issue, lien.
    const needs = within(rows[0]!).getByTestId('history-needs')
    // Lot 773 — ligne compacte : le détail se lit au dépli de la ligne.
    expect(needs.textContent).not.toContain('Renfort pour la migration')
    await user.click(within(needs).getAllByRole('button')[0]!)
    expect(within(needs).getByTestId('signal-title').textContent).toBe('Architecte data — migration cloud')
    const dialog = screen.getByRole('dialog')
    // #5191 — détail, compétences et lien : ceux de WatchlistSignalDetail (même modale que les signaux récents).
    expect(within(dialog).getByTestId('watchlist-signal-detail').textContent).toContain(
      'Architecte data — migration cloud',
    )
    expect(within(dialog).queryByTestId('signal-skills')).toBeNull()
    expect(dialog.textContent).toContain('650')
    expect(within(dialog).getByTestId('signal-prescriber').textContent).toContain('Jeanne Martin')
    expect(within(dialog).getByTestId('signal-outcome')).toBeTruthy()
    await user.keyboard('{Escape}')
    // e) jamais de domaine brut dans le texte affiché ; l'URL reste derrière le lien.
    expect(rows[0]!.textContent).not.toContain('bodacc.fr')
    // a) le fait n'est pas dans les besoins : il vit dans le groupe replié.
    expect(needs.textContent).not.toContain('EURL')
    const facts = within(rows[0]!).getByTestId('history-facts')
    expect(facts.textContent).toContain('Autres faits (1)')
    expect(facts.textContent).toContain('EURL')
  })
})

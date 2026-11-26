import { fireEvent, render as baseRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkspaceSignalHistory } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { historyItemsOf } from '../model/account-history'
vi.mock('@bellum/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@bellum/ui')>()
  return {
    ...actual,
    // Radix ne se pilote pas en jsdom : un <select> natif porte les mêmes options.
    SelectField: ({
      value,
      onChange,
      options,
      emptyOption,
      ariaLabel,
    }: {
      value: string
      onChange: (next: string) => void
      options: readonly { value: string; label: string }[]
      emptyOption?: { label: string }
      ariaLabel?: string
    }) => (
      <select aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)}>
        {emptyOption ? <option value="">{emptyOption.label}</option> : null}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }
})
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

const { SignalsHistory } = await import('./SignalsHistory')

const render = (ui: ReactElement) =>
  baseRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

/**
 * Lot 785 (#5213) — l'Historique arrive PAR PAGES : le compteur dit le total du SERVEUR (même requête), la liste
 * rend ce qui est chargé, « Voir plus » charge la page suivante.
 */
const DAY = 24 * 60 * 60 * 1000
const line = (id: string, title: string) => ({
  id,
  date: new Date(Date.now() - 200 * DAY).toISOString().slice(0, 10),
  date_precision: 'day' as const,
  period: 'past' as const,
  type: 'recrutement' as const,
  title,
  detail: null,
  url: null,
  merged: [],
  people_hints: { location: null },
})
const account = (n: number) => ({
  account_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  company_name: `Compte ${n}`,
  sector: null,
  logo_url: null,
  website: null,
  lines: [line(`job:${n}`, `Offre ${n}`)],
})
const items = (count: number) =>
  historyItemsOf({
    accounts: Array.from({ length: count }, (_, i) => account(i + 1)),
  } as unknown as WorkspaceSignalHistory)

describe('SignalsHistory — par pages', () => {
  it('le compteur dit le total du serveur, la liste rend les comptes chargés, « Voir plus » charge la suite', async () => {
    const onLoadMore = vi.fn()
    render(<SignalsHistory items={items(2)} loading={false} total={1325} hasMore onLoadMore={onLoadMore} />)
    expect(screen.getAllByTestId('history-row')).toHaveLength(2)
    expect(screen.getByTestId('history-count')).toHaveTextContent('1325 comptes')
    expect(screen.getByTestId('history-more-accounts')).toHaveTextContent('2 sur 1325')
    await userEvent.click(screen.getByTestId('history-more-accounts'))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('tout est chargé : plus de « Voir plus », le compteur redevient celui des lignes rendues', () => {
    render(<SignalsHistory items={items(2)} loading={false} total={2} hasMore={false} onLoadMore={vi.fn()} />)
    expect(screen.queryByTestId('history-more-accounts')).not.toBeInTheDocument()
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 comptes')
  })

  it('un filtre croisé s’applique à TOUT l’historique : il charge les pages restantes au lieu de filtrer une moitié', () => {
    const onLoadMore = vi.fn()
    render(<SignalsHistory items={items(2)} loading={false} total={120} hasMore onLoadMore={onLoadMore} />)
    expect(onLoadMore).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: 'over24m' } })
    expect(onLoadMore).toHaveBeenCalled()
    expect(screen.queryByTestId('history-more-accounts')).not.toBeInTheDocument()
  })
})

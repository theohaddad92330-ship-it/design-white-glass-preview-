import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalLine } from '@bellum/contracts'
import { signalLineToWatchlistItem } from '@/features/signals-library/model/account-history'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import type { CompactPerson } from './SignalCompactRow'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/features/watchlist/view/WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: ({ item }: { item: { signalLabel: string } }) => (
    <div data-testid="watchlist-signal-detail">{item.signalLabel}</div>
  ),
}))
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({
  useContactsByAccount: () => ({
    data: [
      {
        id: 'c1',
        full_name: 'Claire Martin',
        title: 'Directrice des systèmes d’information',
        location: 'Lille',
        email: null,
        phone: null,
        excluded_at: null,
        hidden: false,
      },
    ],
  }),
}))
vi.mock('@/features/accounts/hooks/useAccountPerimeter', () => ({ useAccountPerimeter: () => undefined }))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn() }),
}))
const { SignalBrowserDialog } = await import('./SignalBrowserDialog')

const ACCOUNT = { id: 'acc-1', companyName: 'Norauto', sector: 'Distribution' }
const line = (id: string, over: Partial<AccountSignalLine> = {}): AccountSignalLine => ({
  id,
  date: '2026-10-12',
  date_precision: 'day',
  period: 'now',
  type: 'recrutement',
  title: `Offre ${id}`,
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: 'Lille' },
  ...over,
})
const person = (name: string, title: string): CompactPerson => ({
  person: { id: name, full_name: name, title } as CompactPerson['person'],
  reason: null,
  full: null,
  onAddToPlan: vi.fn(),
})

describe('SignalBrowserDialog — LA modale d’un signal (#5191)', () => {
  it('« 1 sur N » parcourt la liste affichée : suivant change de signal, l’en-tête dit le compte', async () => {
    const entries = ['a', 'b', 'c'].map(id => ({
      item: signalLineToWatchlistItem(line(id), ACCOUNT),
      people: [],
    }))
    const Harness = () => {
      const [openId, setOpenId] = React.useState<string | undefined>('acc-1:b')
      return <SignalBrowserDialog entries={entries} openId={openId} onOpenChange={setOpenId} />
    }
    const React = await import('react')
    render(<Harness />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Norauto' })).toBeInTheDocument()
    expect(within(dialog).getByText('2 sur 3')).toBeInTheDocument()
    expect(within(dialog).getByTestId('watchlist-signal-detail')).toHaveTextContent('Offre b')
    await userEvent.click(within(dialog).getByRole('button', { name: /suivant/i }))
    expect(within(dialog).getByText('3 sur 3')).toBeInTheDocument()
    expect(within(dialog).getByTestId('watchlist-signal-detail')).toHaveTextContent('Offre c')
  })

  it('dit le lieu et le SITE de publication de l’offre (jamais un fournisseur)', () => {
    const item = signalLineToWatchlistItem(line('a', { origin: 'LinkedIn', tjm_eur: 620 }), ACCOUNT)
    render(<SignalBrowserDialog entries={[{ item, people: [] }]} openId={item.id} onOpenChange={vi.fn()} />)
    expect(screen.getByTestId('signal-detail-meta')).toHaveTextContent(/Lieu : Lille/)
    expect(screen.getByTestId('signal-detail-meta')).toHaveTextContent(/Publiée sur LinkedIn/)
    expect(screen.getByTestId('signal-tjm')).toHaveTextContent(/620/)
  })

  it('les personnes à contacter : nom, poste, lien vers la fiche', () => {
    const item = signalLineToWatchlistItem(line('a'), ACCOUNT)
    const { rerender } = render(
      <SignalBrowserDialog
        entries={[{ item, people: [person('Louis Dupont', 'DSI'), person('Awa Diallo', 'VP Engineering')] }]}
        openId={item.id}
        onOpenChange={vi.fn()}
      />,
    )
    const people = screen.getByTestId('signal-people')
    expect(within(people).getByRole('heading', { name: 'Personnes à contacter' })).toBeInTheDocument()
    expect(within(people).getAllByTestId('signal-person')).toHaveLength(2)
    expect(within(people).getByText('Louis Dupont')).toBeInTheDocument()
    expect(within(people).getByText(/VP Engineering/)).toBeInTheDocument()
  })

  it('un signal du flux sans ligne : la modale propose elle-même les personnes du compte', () => {
    const base = signalLineToWatchlistItem(line('a'), ACCOUNT)
    const feedItem: WatchlistItem = { ...base, id: 'feed-1', signalLine: undefined, signalLineType: undefined }
    render(<SignalBrowserDialog entries={[{ item: feedItem }]} openId="feed-1" onOpenChange={vi.fn()} />)
    expect(within(screen.getByTestId('signal-people')).getByText('Claire Martin')).toBeInTheDocument()
  })

  it('lot 787 — l’écran n’a proposé personne : la modale applique la règle du compte (`proposalForLine`)', () => {
    const item = signalLineToWatchlistItem(line('a'), ACCOUNT)
    render(<SignalBrowserDialog entries={[{ item, people: [] }]} openId={item.id} onOpenChange={vi.fn()} />)
    expect(within(screen.getByTestId('signal-people')).getByText('Claire Martin')).toBeInTheDocument()
  })

  it('lot 787 — personne ne recoupe : le bloc reste, il le DIT et mène aux contacts (jamais une liste générique)', () => {
    const item = signalLineToWatchlistItem(
      line('z', { title: 'Offre z', people_hints: { names: [], roles: [], location: 'Brest' } }),
      ACCOUNT,
    )
    render(<SignalBrowserDialog entries={[{ item }]} openId={item.id} onOpenChange={vi.fn()} />)
    const people = screen.getByTestId('signal-people')
    expect(within(people).getByRole('heading', { name: 'Personnes à contacter' })).toBeInTheDocument()
    expect(within(people).getByTestId('signal-people-none')).toHaveTextContent(/Personne de connu ne recoupe ce signal/)
    expect(within(people).queryAllByTestId('signal-person')).toHaveLength(0)
    expect(within(people).getByRole('button', { name: 'Trouver qui contacter' })).toBeInTheDocument()
  })
})

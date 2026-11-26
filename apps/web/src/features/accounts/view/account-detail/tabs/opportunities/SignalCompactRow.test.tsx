import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalLine } from '@bellum/contracts'
import type { CompactPerson } from './SignalCompactRow'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({ useContactsByAccount: () => ({ data: [] }) }))
vi.mock('@/features/accounts/hooks/useAccountPerimeter', () => ({ useAccountPerimeter: () => undefined }))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn() }),
}))
// Le détail (WatchlistSignalDetail) a ses propres tests : ici on prouve QU'IL est monté, avec l'élément adapté.
vi.mock('@/features/watchlist/view/WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: ({
    item,
  }: {
    item: { companyName: string; signalLabel: string; salesImplication: string | null }
  }) => (
    <div data-testid="watchlist-signal-detail">
      {item.companyName} · {item.signalLabel} · {item.salesImplication}
    </div>
  ),
}))
const { SignalCompactRow: Row } = await import('./SignalCompactRow')
const ACCOUNT = { id: 'acc-1', companyName: 'TotalEnergies' }
const SignalCompactRow = (props: Omit<React.ComponentProps<typeof Row>, 'account'>) => (
  <Row account={ACCOUNT} {...props} />
)

/** Lot 773 (a) — UNE ligne compacte partagée : repliée sur une ligne, détail au clic/Entrée. */
const line = (over: Partial<AccountSignalLine> = {}): AccountSignalLine => ({
  id: 'l1',
  date: '2026-05-12',
  date_precision: 'month',
  period: 'past',
  type: 'projet',
  origin_kind: 'analyse',
  title:
    'TotalEnergies a annoncé la signature d’un contrat avec Dell Technologies et NVIDIA pour le supercalculateur Pangea 5',
  detail: 'Le contrat couvre le supercalculateur de Pau.',
  url: 'https://exemple.test/pangea',
  technologies: ['HPC', 'GPU'],
  tjm_eur: 700,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})

const person = (name: string): CompactPerson => ({
  person: { id: name, full_name: name, title: 'DSI' } as CompactPerson['person'],
  reason: null,
  full: null,
  onAddToPlan: vi.fn(),
})

describe('SignalCompactRow', () => {
  it('replié : titre sur une ligne (ellipsis, complet en title), « source · date », aucun détail ni bouton', () => {
    render(<SignalCompactRow line={line()} people={[]} />)
    const toggle = screen.getByRole('button', { name: /Pangea 5/ })
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog')
    const title = screen.getByTestId('signal-title')
    expect(title.className).toMatch(/truncate/)
    expect(title).toHaveAttribute('title', line().title)
    expect(screen.getByTestId('signal-meta').textContent).toMatch(/^Analyse · /)
    expect(screen.queryByText(/supercalculateur de Pau/)).toBeNull()
    expect(screen.queryByText('Trouver qui contacter')).toBeNull()
    expect(screen.queryByText(/Tout lire/)).toBeNull()
    expect(toggle.className).toMatch(/min-h-11/)
  })

  it('Entrée / clic ouvre la MÊME modale que les signaux récents (BrowsableDialog + WatchlistSignalDetail), plus de dépliage', async () => {
    render(<SignalCompactRow line={line({ people_hints: { names: [], roles: [], location: 'Pau' } })} people={[]} />)
    const toggle = screen.getByRole('button', { name: /Pangea 5/ })
    expect(toggle).not.toHaveAttribute('aria-expanded')
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog')
    expect(screen.getByTestId('signal-title').className).toMatch(/truncate/)
    expect(within(dialog).getByRole('heading', { name: 'TotalEnergies' })).toBeInTheDocument()
    expect(within(dialog).getByTestId('watchlist-signal-detail').textContent).toContain(line().title)
    expect(within(dialog).getByTestId('watchlist-signal-detail').textContent).toContain('supercalculateur de Pau')
    // Ce que WatchlistSignalDetail ne dit pas reste dit : période, lieu, TJM.
    expect(within(dialog).getByTestId('signal-detail-meta').textContent).toMatch(/Pau/)
    expect(within(dialog).getByText(/TJM ≈ 700 €/)).toBeInTheDocument()
    // …et n'est pas dit deux fois : compétences et lien viennent de WatchlistSignalDetail seul.
    expect(within(dialog).queryByTestId('signal-skills')).toBeNull()
    expect(within(dialog).queryByRole('link', { name: /Lire/ })).toBeNull()
  })

  it('Échap ferme la modale ; une absence ne fait aucune ligne (pas de lieu)', async () => {
    render(<SignalCompactRow line={line()} people={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Pangea 5/ }))
    expect(screen.getByTestId('signal-detail-meta').textContent).not.toMatch(/Lieu/)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('1-2 contacts en puces compactes sur la ligne repliée ; aucune puce sans contact', () => {
    const { rerender } = render(
      <SignalCompactRow line={line()} people={[person('Alice Martin'), person('Bob Durand')]} />,
    )
    const chips = screen.getByTestId('signal-chips')
    expect(within(chips).getByText('Alice Martin')).toBeInTheDocument()
    expect(within(chips).getByText('Bob Durand')).toBeInTheDocument()
    rerender(<SignalCompactRow line={line()} people={[]} />)
    expect(screen.queryByTestId('signal-chips')).toBeNull()
  })

  it('un groupe de reformulations dit « ×3 sources » et liste ses 3 formulations dans la modale', async () => {
    const members = [
      line(),
      line({ id: 'l2', title: 'Signature d’un contrat pour… Pangea 5' }),
      line({ id: 'l3', title: 'Signature du contrat Pangea 5 avec Dell', url: null }),
    ]
    render(<SignalCompactRow line={members[0]!} members={members} people={[]} />)
    expect(screen.getByTestId('signal-group-count').textContent).toMatch(/×3/)
    await userEvent.click(screen.getByRole('button', { name: /Pangea 5/ }))
    expect(
      within(within(screen.getByRole('dialog')).getByTestId('signal-formulations')).getAllByRole('listitem'),
    ).toHaveLength(3)
  })

  it('la personne à contacter (Préparer le message, Au plan) vit dans la modale, pas sur la ligne repliée', async () => {
    render(<SignalCompactRow line={line()} people={[person('Alice Martin')]} />)
    expect(screen.queryByRole('button', { name: /Au plan|Ajouter au plan/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Pangea 5/ }))
    expect(screen.getByRole('button', { name: /Ajouter au plan/ })).toBeInTheDocument()
  })
})

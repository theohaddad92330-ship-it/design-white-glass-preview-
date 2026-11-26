import { render as baseRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSignalLine, HistoryContact, WorkspaceSignalHistory } from '@bellum/contracts'
import { historyContactsOf, historyItemsOf } from '../model/account-history'

/**
 * Lot 768 — Signaux › Historique : (a) la personne à contacter sur chaque besoin passé, avec la règle et le rendu
 * de l'onglet du compte ; (b) la recherche par pertinence : « power bi » trouve PowerBI, comptes rangés par leur
 * meilleur besoin, mots surlignés, « N comptes · M besoins correspondent », état vide qui le dit.
 */
const { openEngagement, getOne, addAction, navigate } = vi.hoisted(() => ({
  openEngagement: vi.fn(),
  getOne: vi.fn(),
  addAction: vi.fn(),
  navigate: vi.fn(),
}))

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
vi.mock('@/features/watchlist/view/WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: ({ item }: { item: { companyName: string; signalLabel: string } }) => (
    <div data-testid="watchlist-signal-detail">
      {item.companyName} · {item.signalLabel}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => ({ openEngagement }),
}))
vi.mock('@/features/contacts/api', () => ({
  contactKeys: { detail: (id: string) => ['contact', id] },
  contactsApi: { getOne },
}))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction }),
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

const contact = (over: Partial<HistoryContact> & Pick<HistoryContact, 'id' | 'full_name'>): HistoryContact => ({
  title: null,
  location: null,
  place: null,
  email_verified: false,
  ...over,
})

const account = (
  id: string,
  name: string,
  lines: AccountSignalLine[],
  contacts: HistoryContact[] = [],
): WorkspaceSignalHistory['accounts'][number] => ({
  account_id: id,
  company_name: name,
  sector: null,
  logo_url: null,
  website: null,
  lines: lines as WorkspaceSignalHistory['accounts'][number]['lines'],
  contacts,
})

const HISTORY: WorkspaceSignalHistory = {
  accounts: [
    account(
      'A',
      'Banque Alpha',
      [
        line({
          id: 'a-pbi',
          type: 'besoin_passe',
          title: 'Consultant Power-BI senior',
          date: '2025-06-10',
          people_hints: { names: ['Léa Martin'], roles: [], location: null },
        }),
        line({ id: 'a-other', type: 'besoin_passe', title: 'Architecte réseau', date: '2025-09-10' }),
      ],
      [
        contact({ id: 'c-lea', full_name: 'Léa Martin', title: 'Directrice des opérations', email_verified: true }),
        contact({ id: 'c-paul', full_name: 'Paul Roy', title: 'Responsable réseau et sécurité' }),
      ],
    ),
    account('B', 'Assurance Beta', [
      line({
        id: 'b-detail',
        type: 'besoin_passe',
        title: 'Consultant reporting',
        detail: 'Déploiement de tableaux de bord PowerBI',
        date: '2025-12-10',
      }),
    ]),
    account(
      'C',
      'Chimie Gamma',
      [line({ id: 'c-po', type: 'besoin_passe', title: 'Product Owner data', date: '2025-03-10' })],
      [contact({ id: 'c-zoe', full_name: 'Zoé Petit', title: 'Directrice marketing' })],
    ),
  ],
}

const mount = (history: WorkspaceSignalHistory = HISTORY) =>
  render(
    <SignalsHistory items={historyItemsOf(history)} contactsByAccount={historyContactsOf(history)} loading={false} />,
  )
const rowOf = (name: string) => screen.getAllByTestId('history-row').find(row => row.textContent?.includes(name))!
/** Lot 773 — la ligne est compacte : son détail (personnes à contacter comprises) se lit dans la MODALE (#5191). */
const expandLine = async (user: ReturnType<typeof userEvent.setup>, line: HTMLElement) =>
  user.click(within(line).getAllByRole('button')[0]!)
const search = () => screen.getByRole('searchbox', { name: 'Rechercher dans les besoins passés' })

beforeEach(() => {
  openEngagement.mockReset()
  getOne.mockReset()
  addAction.mockReset().mockResolvedValue({})
  navigate.mockReset()
})

describe('lot 768 a) — la personne à contacter sur chaque besoin passé', () => {
  it('le prescripteur qui est un contact du compte passe en tête : « a porté ce besoin », boutons de l’onglet compte', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(within(rowOf('Banque Alpha')).getAllByRole('button')[0]!)
    const lines = within(rowOf('Banque Alpha')).getAllByTestId('history-line')
    const pbi = lines.find(l => l.textContent?.includes('Power-BI'))!
    await expandLine(user, pbi)
    const person = within(screen.getByRole('dialog')).getByTestId('signal-person')
    expect(person.textContent).toContain('Léa Martin')
    expect(within(person).getByTestId('signal-person-reason').textContent).toBe('→ a porté ce besoin')
    expect(person.textContent).toContain('E-mail ✓') // vérifié oui — l'adresse elle-même ne voyage pas
    expect(within(person).getByRole('button', { name: /Préparer le message/ })).toBeTruthy()
    expect(within(person).getByRole('button', { name: /Ajouter au plan/ })).toBeTruthy()
  })

  it('la même règle que l’onglet : un métier en commun donne « même métier », jamais « manager »', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(within(rowOf('Banque Alpha')).getAllByRole('button')[0]!)
    const other = within(rowOf('Banque Alpha'))
      .getAllByTestId('history-line')
      .find(l => l.textContent?.includes('Architecte réseau'))!
    await expandLine(user, other)
    expect(within(screen.getByRole('dialog')).getByTestId('signal-person-reason').textContent).toMatch(
      /même métier : réseau/,
    )
    expect(screen.getByRole('dialog').textContent).not.toMatch(/manager/i)
  })

  it('personne ne recoupe ⇒ « Trouver qui contacter », jamais une liste générique', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(within(rowOf('Chimie Gamma')).getAllByRole('button')[0]!)
    // Lot 773 (b) — UNE seule fois, en tête du dépli du compte, jamais par ligne.
    const gamma = rowOf('Chimie Gamma')
    expect(within(gamma).getAllByTestId('history-nobody')).toHaveLength(1)
    expect(within(gamma).getByTestId('history-nobody').textContent).toContain('Trouver qui contacter')
    expect(within(within(gamma).getByTestId('history-line')).queryByTestId('history-nobody')).toBeNull()
    expect(gamma.textContent).not.toContain('Zoé Petit')
    // Un compte sans aucun contact connu : même geste.
    await user.click(within(rowOf('Assurance Beta')).getAllByRole('button')[0]!)
    expect(within(rowOf('Assurance Beta')).getByTestId('history-nobody')).toBeTruthy()
  })

  it('« Préparer le message » charge la fiche de CETTE personne, au clic seulement ; « Au plan » écrit l’action', async () => {
    const user = userEvent.setup()
    getOne.mockResolvedValue({ id: 'c-lea', full_name: 'Léa Martin' })
    mount()
    await user.click(within(rowOf('Banque Alpha')).getAllByRole('button')[0]!)
    expect(getOne).not.toHaveBeenCalled()
    const pbi = within(rowOf('Banque Alpha'))
      .getAllByTestId('history-line')
      .find(l => l.textContent?.includes('Power-BI'))!
    await expandLine(user, pbi)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Préparer le message/ }))
    await waitFor(() => expect(openEngagement).toHaveBeenCalledTimes(1))
    expect(getOne).toHaveBeenCalledTimes(1)
    expect(getOne).toHaveBeenCalledWith('c-lea')
    expect(openEngagement.mock.calls[0]![1]).toBe('email')

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Ajouter au plan/ }))
    await waitFor(() => expect(addAction).toHaveBeenCalledTimes(1))
    expect(addAction.mock.calls[0]![0].label).toContain('Léa Martin')
  })

  it('les faits (autres que les besoins) ne proposent personne', async () => {
    const user = userEvent.setup()
    mount({
      accounts: [
        account(
          'F',
          'Faits SA',
          [
            line({ id: 'need', type: 'besoin_passe', title: 'Mission cloud' }),
            line({ id: 'fact', type: 'fait', title: 'Société active sous forme d’EURL' }),
          ],
          [contact({ id: 'c-x', full_name: 'Xavier Cloud', title: 'Architecte cloud' })],
        ),
      ],
    })
    await user.click(within(rowOf('Faits SA')).getAllByRole('button')[0]!)
    const facts = within(rowOf('Faits SA')).getByTestId('history-facts')
    facts.setAttribute('open', '')
    expect(within(facts).queryByTestId('history-people')).toBeNull()
  })
})

describe('lot 768 b) — la recherche par pertinence', () => {
  it('« power bi » trouve PowerBI et Power-BI ; le titre passe devant le détail, malgré une date plus ancienne', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(search(), 'power bi')
    const names = screen.getAllByTestId('history-row').map(row => row.textContent ?? '')
    expect(names).toHaveLength(2)
    expect(names[0]).toContain('Banque Alpha') // titre « Power-BI »
    expect(names[1]).toContain('Assurance Beta') // « PowerBI » dans le détail seulement
    expect(screen.getByTestId('history-count').textContent).toBe('2 comptes · 2 besoins correspondent')
  })

  it('« po » trouve Product Owner', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(search(), 'po')
    expect(screen.getAllByTestId('history-row')).toHaveLength(1)
    expect(screen.getByTestId('history-row').textContent).toContain('Chimie Gamma')
    expect(screen.getByTestId('history-count').textContent).toBe('1 compte · 1 besoin correspond')
  })

  it('dans le dépli, le besoin qui correspond passe en tête, mots surlignés ; l’autre suit', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(search(), 'power bi')
    await user.click(within(rowOf('Banque Alpha')).getAllByRole('button')[0]!)
    const lines = within(rowOf('Banque Alpha')).getAllByTestId('history-line')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.textContent).toContain('Power-BI')
    expect(within(lines[0]!).getByTestId('search-mark').textContent).toBe('Power-BI')
    expect(within(lines[1]!).queryByTestId('search-mark')).toBeNull()
  })

  it('« Pertinence » est le tri par défaut quand on cherche ; « Récents » reprend l’ordre par date', async () => {
    const user = userEvent.setup()
    mount()
    expect(screen.queryByRole('option', { name: 'Pertinence' })).toBeNull()
    await user.type(search(), 'power bi')
    const sort = screen.getByRole('combobox', { name: 'Trier les comptes' }) as HTMLSelectElement
    expect(sort.value).toBe('relevance')
    await user.selectOptions(sort, 'recent')
    const names = screen.getAllByTestId('history-row').map(row => row.textContent ?? '')
    expect(names[0]).toContain('Assurance Beta') // décembre 2025 avant juin 2025
  })

  it('rien trouvé ⇒ un état vide qui le DIT, avec « Effacer la recherche »', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(search(), 'kubernetes')
    const empty = screen.getByTestId('history-no-result')
    expect(empty.textContent).toContain('Aucun besoin ne correspond à « kubernetes »')
    await user.click(within(empty).getByRole('button', { name: 'Effacer la recherche' }))
    expect(screen.getAllByTestId('history-row')).toHaveLength(3)
    expect(search()).toHaveValue('')
  })

  it('lot 788 — le serveur ne ramène rien pour « Java » : le champ RESTE, l’écran le dit et propose d’effacer', async () => {
    const user = userEvent.setup()
    const onDraftChange = vi.fn()
    render(<SignalsHistory items={[]} loading={false} query="Java" draft="Java" onDraftChange={onDraftChange} />)
    expect(screen.getByRole('searchbox', { name: /rechercher/i })).toHaveValue('Java')
    const empty = screen.getByTestId('history-no-result')
    expect(empty.textContent).toContain('Aucun besoin ne correspond à « Java »')
    expect(screen.queryByText(/aucun besoin passé pour l.instant/i)).toBeNull()
    await user.click(within(empty).getByRole('button', { name: 'Effacer la recherche' }))
    expect(onDraftChange).toHaveBeenCalledWith('')
  })

  it('lot 788 — sans recherche ni compte, l’état vide d’origine reste « Aucun besoin passé pour l’instant »', () => {
    render(<SignalsHistory items={[]} loading={false} query="" draft="" onDraftChange={vi.fn()} />)
    expect(screen.getByText(/aucun besoin passé pour l.instant/i)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})

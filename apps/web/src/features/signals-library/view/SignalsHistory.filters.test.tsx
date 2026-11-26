import { fireEvent, render as baseRender, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'

/**
 * #4756 — l'onglet Historique se CROISE : « Java à Lille ». Ce que ces tests savent dire NON :
 *  · un filtre qui ne filtre pas (la liste reviendrait ENTIÈRE) — chaque filtre est prouvé par deux valeurs ET un cas vide ;
 *  · un « 0 résultat » muet : c'est un état vide NOMMÉ, jamais une liste vide ni un « 0 » ;
 *  · un besoin sans date glissé dans une tranche.
 */
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

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)

const item = (over: Partial<WatchlistItem>): WatchlistItem => ({
  accountId: 'A',
  companyName: 'Alpha',
  id: 'x',
  sector: 'Distribution',
  signalDate: daysAgo(100),
  signalLabel: 'Offre : Développeur Java',
  signalSource: 'Page carrières',
  sourceUrl: null,
  sourceKind: null,
  signalType: 'recrutement',
  score: 5,
  status: 'new',
  archived: true,
  firstDetectedAt: null,
  firstDetectionExact: false,
  lastSeenAt: null,
  changeCount: 0,
  resolved: false,
  resolvedAt: null,
  importance: null,
  triggeredActionLabel: null,
  lastVerifiedAt: null,
  temporalStatus: 'STALE',
  salesImplication: null,
  impact: null,
  logoUrl: null,
  website: null,
  ...over,
})
const skills = (list: string[]): WatchlistItem['offerAttachment'] => ({
  status: 'attached',
  fact_type: 'hiring',
  skills: list,
  job_family: null,
  extract: null,
})

const ITEMS: WatchlistItem[] = [
  item({ id: '1', location: 'Lille (59)', offerAttachment: skills(['Java']) }),
  item({ id: '2', location: 'Lille', offerAttachment: skills(['Java']), signalDate: daysAgo(200) }),
  item({
    id: '3',
    accountId: 'B',
    companyName: 'Beta',
    signalLabel: 'Offre : Data analyst',
    location: 'Paris (75)',
    offerAttachment: skills(['Python']),
  }),
  item({
    id: '4',
    accountId: 'C',
    companyName: 'Gamma',
    signalLabel: 'Offre : Dev PHP sans date',
    signalDate: 'date inconnue',
    offerAttachment: skills(['PHP']),
  }),
]

const names = () => screen.queryAllByTestId('history-row').map(row => row.textContent ?? '')

describe('Historique — chercher et croiser', () => {
  it('lot 769 — pendant la requête, l’état de chargement est affiché (jamais une page vide)', () => {
    render(<SignalsHistory items={[]} loading />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('history-count')).not.toBeInTheDocument()
  })

  it('le compte de résultats est dit, comptes et besoins', () => {
    render(<SignalsHistory items={ITEMS} loading={false} />)
    expect(screen.getByTestId('history-count')).toHaveTextContent('3 comptes · 4 besoins passés')
  })

  it('texte : deux mots rendent deux listes différentes, un mot absent rend l’état vide NOMMÉ', async () => {
    const user = userEvent.setup()
    render(<SignalsHistory items={ITEMS} loading={false} />)
    const search = screen.getByRole('searchbox', { name: 'Rechercher dans les besoins passés' })

    await user.type(search, 'analyst')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Beta')

    await user.clear(search)
    await user.type(search, 'developpeur')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Alpha')

    await user.clear(search)
    await user.type(search, 'zzzz')
    expect(names()).toHaveLength(0)
    expect(screen.getByTestId('history-no-result')).toHaveTextContent('Aucun besoin ne correspond')
    expect(screen.queryByTestId('history-count')).not.toBeInTheDocument()
  })

  it('techno × zone se croisent : « Java » à « Hauts-de-France » rend Alpha, à « Île-de-France » rend l’état vide', () => {
    render(<SignalsHistory items={ITEMS} loading={false} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Métier ou techno' }), { target: { value: 'Java' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Zone' }), { target: { value: '32' } })
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Alpha')

    fireEvent.change(screen.getByRole('combobox', { name: 'Zone' }), { target: { value: '11' } })
    expect(screen.getByTestId('history-no-result')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Zone' })).toBeInTheDocument()
  })

  it('période : « 6 à 12 mois » ≠ « Moins de 6 mois » ; l’offre sans date est comptée à part, dite, dans aucune tranche', () => {
    render(<SignalsHistory items={ITEMS} loading={false} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: 'under6m' } })
    expect(names().map(n => n.includes('Alpha') || n.includes('Beta'))).toEqual([true, true])
    expect(screen.getByTestId('history-undated')).toHaveTextContent('1 besoin sans date lisible')

    fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: '6to12m' } })
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Alpha')

    fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: 'over24m' } })
    expect(screen.getByTestId('history-no-result')).toBeInTheDocument()
  })

  it('volume : « au moins 2 » n’existe pas — trois paliers ; ≥ 3 sur ce jeu rend l’état vide', () => {
    render(<SignalsHistory items={ITEMS} loading={false} />)
    const volume = screen.getByRole('combobox', { name: 'Volume de besoins vus' })
    expect([...volume.querySelectorAll('option')].map(o => o.textContent)).toEqual([
      'Tout volume',
      'Au moins 1 besoin',
      'Au moins 3 besoins',
      'Au moins 5 besoins',
    ])
    fireEvent.change(volume, { target: { value: '1' } })
    expect(names()).toHaveLength(3)
    fireEvent.change(volume, { target: { value: '3' } })
    expect(screen.getByTestId('history-no-result')).toBeInTheDocument()
  })

  it('« Effacer les filtres » rend toute la liste', async () => {
    const user = userEvent.setup()
    render(<SignalsHistory items={ITEMS} loading={false} />)
    expect(screen.queryByRole('button', { name: 'Effacer les filtres' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: 'over24m' } })
    // Sans résultat, le geste est porté UNE fois : l'état vide le prend, la barre le rend (GA-26).
    expect(screen.getAllByRole('button', { name: 'Effacer les filtres' })).toHaveLength(1)
    await user.click(
      within(screen.getByTestId('history-no-result')).getByRole('button', { name: 'Effacer les filtres' }),
    )
    expect(names()).toHaveLength(3)
  })

  it('lot 768 — une recherche sans résultat le DIT et porte « Effacer la recherche »', async () => {
    const user = userEvent.setup()
    render(<SignalsHistory items={ITEMS} loading={false} />)
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans les besoins passés' }), 'zzzz')
    expect(names()).toHaveLength(0)
    const empty = screen.getByTestId('history-no-result')
    expect(empty).toHaveTextContent('Aucun besoin ne correspond à « zzzz »')
    await user.click(within(empty).getByRole('button', { name: 'Effacer la recherche' }))
    expect(names()).toHaveLength(3)
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans les besoins passés' })).toHaveValue('')
  })

  it('aucune région ne s’offre sans offre située : « France » reste nommable, jamais posé tout seul', () => {
    render(<SignalsHistory items={ITEMS} loading={false} />)
    const zone = screen.getByRole('combobox', { name: 'Zone' })
    expect((zone as HTMLSelectElement).value).toBe('')
    expect([...zone.querySelectorAll('option')].map(o => o.textContent)).toEqual([
      'Toutes les zones',
      'Hauts-de-France (2)',
      'Île-de-France (1)',
      'Toute la France',
    ])
  })

  it('#4816 — aucun besoin passé ne porte de région : « Toute la France » n’est pas proposée', () => {
    render(<SignalsHistory items={[item({ id: '9' })]} loading={false} />)
    const zone = screen.getByRole('combobox', { name: 'Zone' })
    expect([...zone.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Toutes les zones'])
  })
})

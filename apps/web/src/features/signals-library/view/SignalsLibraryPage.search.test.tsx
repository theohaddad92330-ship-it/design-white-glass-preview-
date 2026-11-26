import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSearch } from '@tanstack/react-router'
import type { AccountSignalItem, SessionUser, WorkspaceSignalHistory } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * Lot 768 c) + b) côté « Signaux » — UNE recherche pour les deux onglets, dans l'URL (`?q=`), qui survit au passage
 * Actuel ↔ Historique ; « Pertinence » est le tri par défaut quand on cherche ; rien trouvé ⇒ un état vide qui le dit.
 */
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('@/features/watchlist/view/AddSignalDialog', () => ({ AddSignalDialog: () => null }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
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
      ariaLabel,
    }: {
      value: string
      onChange: (next: string) => void
      options: readonly { value: string; label: string }[]
      ariaLabel?: string
    }) => (
      <select aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }
})

const { SignalsLibraryContent } = await import('./SignalsLibraryPage')

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'

const signal = (
  n: number,
  account: string,
  company: string,
  label: string,
  days: number,
  over: Partial<AccountSignalItem> = {},
): AccountSignalItem => ({
  id: `${account}-signal-${n}`,
  account_id: account,
  account_created_at: daysAgo(100),
  account_score: 5,
  company_name: company,
  date: daysAgo(days),
  label,
  sector: 'Services',
  source: 'Presse',
  type: 'Projet',
  freshness: 'current',
  ...over,
})

const SIGNALS: AccountSignalItem[] = [
  // Récent, mais « Power BI » seulement dans l'extrait.
  signal(0, A1, 'Nordia', 'Programme reporting annoncé', 2, {
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: [],
      job_family: null,
      extract: 'Déploiement Power BI',
    },
  }),
  // Plus ancien, « PowerBI » dans le TITRE : doit passer devant.
  signal(1, A1, 'Nordia', 'Recrute un consultant PowerBI', 40),
  signal(2, A2, 'Velmore', 'Recrutement Product Owner', 10),
  signal(3, A2, 'Velmore', 'Ouverture d’un site', 5),
]

const HISTORY: WorkspaceSignalHistory = {
  accounts: [
    {
      account_id: A2,
      company_name: 'Velmore',
      sector: null,
      logo_url: null,
      website: null,
      lines: [
        {
          id: 'h1',
          date: daysAgo(400),
          date_precision: 'day',
          period: 'past',
          type: 'besoin_passe',
          title: 'Mission Power BI passée',
          detail: null,
          url: null,
          people_hints: { names: [], roles: [], location: null },
        },
      ],
      contacts: [],
    },
  ],
}

function mockApi() {
  apiFetch.mockImplementation(async (args?: { path: string; method?: string }) => {
    const path = args?.path ?? ''
    if (path === '/accounts/signals') return SIGNALS
    if (path.startsWith('/accounts/signal-history')) return HISTORY
    if (path === '/signal-states') return { items: [] }
    if (path === '/account-follows')
      return { max: 5, followed: [], archived: [], suggestion: null, migration_notice: false }
    if (path === '/watchlist/rules') return []
    if (path.startsWith('/accounts?')) return { data: [], pagination: { hasNext: false, currentPage: 1, size: 100 } }
    return {}
  })
}

/** Lit `?q=` comme le fait le routeur : la preuve que la requête vit dans l'URL. */
function UrlProbe() {
  const { q } = useSearch({ strict: false }) as { q?: unknown }
  return <output data-testid="url-q">{q === undefined ? '' : String(q)}</output>
}

function renderPage(path = '/signals') {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: 'u-search' } as SessionUser, loading: false }}>
      <UrlProbe />
      <SignalsLibraryContent />
    </SessionContext.Provider>,
    path,
  )
}

const searchbox = () => screen.getByRole('searchbox')
const titles = () => screen.getAllByTestId('signal-card').map(card => card.textContent ?? '')

beforeEach(() => apiFetch.mockReset())

describe('Signaux › Actuel — la recherche par pertinence', () => {
  it('« power bi » trouve PowerBI ; le titre passe devant l’extrait, malgré une date plus ancienne', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ouverture d’un site')
    await user.type(searchbox(), 'power bi')
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(2))
    expect(titles()[0]).toContain('Recrute un consultant PowerBI')
    expect(titles()[1]).toContain('Programme reporting annoncé')
    // « Pertinence » devient le tri par défaut ; « Plus récents » remet l'ordre par date.
    const sort = screen.getByRole('combobox', { name: 'Trier les signaux' }) as HTMLSelectElement
    expect(sort.value).toBe('relevance')
    await user.selectOptions(sort, 'recent')
    expect(titles()[0]).toContain('Programme reporting annoncé')
  })

  it('« po » trouve Product Owner', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ouverture d’un site')
    await user.type(searchbox(), 'po')
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(1))
    expect(titles()[0]).toContain('Recrutement Product Owner')
  })

  it('sans requête, pas d’option « Pertinence »', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Ouverture d’un site')
    expect(screen.queryByRole('option', { name: 'Pertinence' })).toBeNull()
  })

  it('rien trouvé ⇒ un état vide qui le DIT, avec « Effacer la recherche »', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ouverture d’un site')
    await user.type(searchbox(), 'kubernetes')
    expect(await screen.findByText('Aucun signal pour « kubernetes »')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(4))
    expect(searchbox()).toHaveValue('')
  })
})

describe('Signaux — la requête vit dans l’URL (?q=)', () => {
  it('un lien partagé ouvre la recherche déjà posée', async () => {
    mockApi()
    renderPage('/signals?q=owner')
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(1))
    expect(titles()[0]).toContain('Product Owner')
    expect(searchbox()).toHaveValue('owner')
  })

  it('taper écrit ?q= (après le délai), l’effacer le retire', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ouverture d’un site')
    await user.type(searchbox(), 'data')
    await waitFor(() => expect(screen.getByTestId('url-q')).toHaveTextContent('data'))
    await user.clear(searchbox())
    await waitFor(() => expect(screen.getByTestId('url-q')).toHaveTextContent(''))
  })

  it('la requête survit au passage Actuel → Historique, et le même champ y cherche', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage('/signals?q=power%20bi')
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(2))
    await user.click(screen.getByRole('tab', { name: 'Historique' }))
    const history = await screen.findByTestId('history-list')
    expect(within(history).getAllByTestId('history-row')).toHaveLength(1)
    expect(searchbox()).toHaveValue('power bi')
    expect(screen.getByTestId('history-count').textContent).toBe('1 compte · 1 besoin correspond')
    await user.click(screen.getByRole('tab', { name: 'Signaux' }))
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(2))
  })
})

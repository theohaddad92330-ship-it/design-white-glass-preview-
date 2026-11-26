import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountSignalItem, SessionUser, WorkspaceSignalHistory } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4755 — deux onglets de premier niveau : « Signaux » (ce qui tombe) et « Historique » (ce que MES comptes ont
 * montré par le passé). Ce que ces tests doivent savoir dire NON :
 *  · les trois filtres de #4505 ne sont pas supprimés, ils descendent DANS « Signaux » ;
 *  · un compte sans besoin passé ne fait aucune ligne, et aucune ligne ne dit « 0 » ;
 *  · l'onglet « Historique » ne porte ni recherche ni filtre croisé (c'est #4756).
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('@/features/watchlist/view/AddSignalDialog', () => ({ AddSignalDialog: () => null }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { SignalsLibraryContent } = await import('./SignalsLibraryPage')

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
const NORAUTO = '11111111-1111-4111-8111-111111111111'
const NORDIA = '22222222-2222-4222-8222-222222222222'

const offer = (n: number, days: number, skills: string[]): AccountSignalItem => ({
  id: `${NORAUTO}-signal-${n}`,
  account_id: NORAUTO,
  account_created_at: daysAgo(400),
  account_score: 7,
  company_name: 'Norauto',
  date: daysAgo(days),
  label: `Offre passée n°${n}`,
  sector: 'Distribution',
  source: 'Page carrières',
  type: 'recrutement',
  freshness: 'archive',
  offer_attachment: { status: 'attached', fact_type: 'hiring', skills, job_family: null, extract: null },
})

const SIGNALS: AccountSignalItem[] = [
  offer(0, 100, ['Java', 'Spring']),
  offer(1, 160, ['Java']),
  {
    id: `${NORDIA}-signal-0`,
    account_id: NORDIA,
    account_created_at: daysAgo(30),
    account_score: 9,
    company_name: 'Nordia',
    date: daysAgo(2),
    label: 'Programme data annoncé',
    sector: 'Services',
    source: 'Les Échos',
    type: 'Projet',
    freshness: 'current',
  },
]

const ACME = '33333333-3333-4333-8333-333333333333'
type HistoryLine = WorkspaceSignalHistory['accounts'][number]['lines'][number]
const pastLine = (
  id: string,
  type: HistoryLine['type'],
  title: string,
  days: number,
  over: Partial<HistoryLine> = {},
) =>
  ({
    id,
    date: daysAgo(days),
    date_precision: 'day',
    period: 'past',
    type,
    title,
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: null },
    ...over,
  }) satisfies HistoryLine

/**
 * Lot 764 — l'Historique lit `GET /accounts/signal-history` : la MÊME lecture que l'onglet de chaque compte.
 * Acme n'a QUE du CRM (une affaire close) : avant le lot, il n'apparaissait pas.
 */
const HISTORY: WorkspaceSignalHistory = {
  accounts: [
    {
      account_id: NORAUTO,
      company_name: 'Norauto',
      sector: 'Distribution',
      logo_url: null,
      website: null,
      lines: [
        pastLine('job:0', 'recrutement', 'Offre passée n°0', 200, { technologies: ['Java', 'Spring'] }),
        pastLine('job:1', 'recrutement', 'Offre passée n°1', 260, { technologies: ['Java'] }),
      ],
    },
    {
      account_id: ACME,
      company_name: 'Acme',
      sector: null,
      logo_url: null,
      website: null,
      lines: [pastLine('crm-deal:x', 'affaire', 'Refonte du portail client', 400, { outcome: 'won' })],
    },
  ],
}

function mockApi(signals: AccountSignalItem[] = SIGNALS, history: WorkspaceSignalHistory | Error = HISTORY) {
  apiFetch.mockImplementation(async (args?: { path: string; method?: string }) => {
    const path = args?.path ?? ''
    if (path === '/accounts/signals') return signals
    if (path.startsWith('/accounts/signal-history')) {
      if (history instanceof Error) throw history
      return history
    }
    if (path === '/signal-states') return { items: [] }
    if (path === '/account-follows')
      return { max: 5, followed: [], archived: [], suggestion: null, migration_notice: false }
    if (path === '/watchlist/rules') return []
    if (path.startsWith('/accounts?')) return { data: [], pagination: { hasNext: false, currentPage: 1, size: 100 } }
    return {}
  })
}

function renderPage(userId = 'u-hist') {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: userId } as SessionUser, loading: false }}>
      <SignalsLibraryContent />
    </SessionContext.Provider>,
    '/signals',
  )
}

beforeEach(() => apiFetch.mockReset())

describe('Signaux — deux onglets, « Signaux » et « Historique »', () => {
  it('« Signaux » est ouvert à l’arrivée et porte Tous / Enregistrés / Écartés en filtres', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')

    const top = screen.getByRole('tablist', { name: 'Signaux ou historique' })
    const tabs = within(top).getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Signaux', 'Historique'])
    expect(within(top).getByRole('tab', { name: 'Signaux' })).toHaveAttribute('aria-selected', 'true')

    const inner = screen.getByRole('tablist', { name: 'Ce que tu as fait de chaque signal' })
    expect(within(inner).getByRole('tab', { name: /Tous les signaux/ })).toBeInTheDocument()
    expect(within(inner).getByRole('tab', { name: /Enregistrés/ })).toBeInTheDocument()
    expect(within(inner).getByRole('tab', { name: /Écartés/ })).toBeInTheDocument()
  })

  it('lot 785 — « Historique » est PAGINÉ : 1re page de 50, total serveur au compteur, « Voir plus » charge la suite', async () => {
    mockApi()
    const [norauto, acme] = HISTORY.accounts
    const asked: string[] = []
    const base = apiFetch.getMockImplementation()!
    apiFetch.mockImplementation(async (args?: { path: string }) => {
      const path = args?.path ?? ''
      if (!path.startsWith('/accounts/signal-history')) return base(args)
      asked.push(path)
      const offset = Number(new URL(path, 'http://x').searchParams.get('offset'))
      return { accounts: [offset === 0 ? norauto : acme], page: { total: 2, offset, limit: 50 } }
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))

    expect(await screen.findAllByTestId('history-row')).toHaveLength(1)
    expect(asked[0]).toBe('/accounts/signal-history?limit=50&offset=0')
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 comptes')
    await user.click(screen.getByTestId('history-more-accounts'))
    expect(await screen.findAllByTestId('history-row')).toHaveLength(2)
    expect(asked[1]).toBe('/accounts/signal-history?limit=50&offset=1')
    expect(screen.queryByTestId('history-more-accounts')).not.toBeInTheDocument()
  })

  it('« Historique » : UNE ligne par compte, avec besoins passés, compétences et dernier besoin vu', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')

    await user.click(screen.getByRole('tab', { name: 'Historique' }))

    const rows = await screen.findAllByTestId('history-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Norauto')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent(/2 besoins passés · Java, Spring · dernier besoin vu il y a 7 mois/)
    // Les filtres de « Signaux » et la liste de signaux ont quitté la vue.
    expect(screen.queryByRole('tablist', { name: 'Ce que tu as fait de chaque signal' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('signal-grid')).not.toBeInTheDocument()
  })

  it('un compte sans besoin passé ne fait aucune ligne, et aucune ligne ne dit « 0 »', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))
    await screen.findAllByTestId('history-row')

    expect(screen.queryByText('Nordia')).not.toBeInTheDocument()
    expect(screen.getByTestId('history-list').textContent).not.toMatch(/\b0\b/)
  })

  it('la ligne se déplie sur les offres passées du compte (bouton, aria-expanded)', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))

    const toggle = await screen.findByRole('button', { name: /Norauto/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Offre passée n°0')).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Offre passée n°0')).toBeInTheDocument()
    expect(screen.getByText('Offre passée n°1')).toBeInTheDocument()
  })

  it('sans aucun besoin passé : un état vide qui le dit, aucune ligne', async () => {
    mockApi([SIGNALS[2]!], { accounts: [] })
    const user = userEvent.setup()
    // Autre utilisateur : le cache du flux est clé sur lui, il ne doit pas servir les lignes d’un autre test.
    renderPage('u-hist-empty')
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))

    expect(await screen.findByText('Aucun besoin passé pour l’instant')).toBeInTheDocument()
    expect(screen.queryAllByTestId('history-row')).toHaveLength(0)
  })

  it('revenir sur « Signaux » rend la liste, filtres compris', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))
    await user.click(screen.getByRole('tab', { name: 'Signaux' }))
    expect(await screen.findByText('Programme data annoncé')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Ce que tu as fait de chaque signal' })).toBeInTheDocument()
  })

  it('lot 764 — un compte qui n’a QUE du CRM apparaît, et son clic mène à son onglet « Signaux et besoins », période Historique', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage('u-hist-crm')
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))

    const acme = await screen.findByRole('button', { name: /Acme/ })
    expect(acme).toHaveTextContent(/1 besoin passé/)
    await user.click(acme)
    expect(screen.getByText('Refonte du portail client')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'Ouvrir le compte' })
    expect(links.at(-1)).toHaveAttribute('href', `/accounts/${ACME}?tab=veille&sp=past`)
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 comptes · 3 besoins passés')
  })

  it('l’historique ne se charge pas : une erreur qui le DIT, jamais « aucun besoin passé »', async () => {
    mockApi(SIGNALS, new Error('500'))
    const user = userEvent.setup()
    renderPage('u-hist-error')
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('tab', { name: 'Historique' }))

    expect(await screen.findByText('Impossible de charger l’historique. Recharge la page.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun besoin passé pour l’instant')).not.toBeInTheDocument()
  })
})

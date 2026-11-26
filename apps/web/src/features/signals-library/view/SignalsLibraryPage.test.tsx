import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { signalStateKey, type AccountSignalItem, type SessionUser } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * Théo A signaux — la bibliothèque d'informations par compte, et ce que l'ancien écran `/mes-cibles` portait.
 *
 * Ce que ces tests doivent savoir dire NON :
 *  · un signal sans URL vérifiée n'a AUCUN lien (rien d'inventé) ; avec une URL, le lien est SUR la carte, nomme
 *    le site de l'éditeur, s'ouvre dans un autre onglet — et son clic n'ouvre pas la lecture ;
 *  · enregistrer / écarter écrit un ÉTAT, jamais une suppression ;
 *  · la vue « Par compte » garde le plateau de veille d'avant (rien ne se perd) ;
 *  · la liste dit qu'elle ne lance aucune recherche.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('@/features/watchlist/view/AddSignalDialog', () => ({
  AddSignalDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Ajouter un signal" /> : null,
}))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { SignalsLibraryContent } = await import('./SignalsLibraryPage')

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'

const SIGNALS: AccountSignalItem[] = [
  {
    id: `${A1}-signal-0`,
    account_id: A1,
    account_created_at: daysAgo(5),
    account_score: 9,
    company_name: 'Nordia',
    date: daysAgo(2),
    label: 'Programme data annoncé',
    sector: 'Services',
    source: 'Les Échos',
    source_url: 'https://www.lesechos.fr/tech/programme-data',
    type: 'Projet',
    freshness: 'current',
  },
  {
    id: `${A1}-signal-1`,
    account_id: A1,
    account_created_at: daysAgo(5),
    account_score: 9,
    company_name: 'Nordia',
    date: daysAgo(40),
    label: 'Refonte SI engagée',
    sector: 'Services',
    source: 'Presse',
    type: 'Projet',
    freshness: 'current',
  },
  {
    id: `${A2}-signal-0`,
    account_id: A2,
    account_created_at: daysAgo(200),
    account_score: 3,
    company_name: 'Velmore',
    date: daysAgo(10),
    label: 'Recrute 12 ingénieurs data',
    sector: 'Industrie',
    source: 'Offre',
    type: 'hiring',
    freshness: 'current',
  },
]

const CONTACTS_A2 = [
  { id: 'c-data', full_name: 'Romain Bitoun', title: 'Directeur data et ingénierie', email: null, phone: null },
]
const FOLLOWS = { max: 5, followed: [], archived: [], suggestion: null, migration_notice: false }

function mockApi(states: Array<{ account_id: string; signal_key: string; state: string }> = []) {
  apiFetch.mockImplementation(async (args?: { path: string; method?: string; body?: unknown }) => {
    const path = args?.path ?? ''
    if (path === '/accounts/signals') return SIGNALS
    if (path === '/signal-states' && (args?.method ?? 'GET') === 'GET') {
      return { items: states.map(s => ({ ...s, updated_at: '2026-10-22T08:00:00.000Z' })) }
    }
    if (path === '/signal-states') return { updated: 1 }
    if (path === `/contacts/account/${A2}`) return CONTACTS_A2
    if (path === '/account-follows') return FOLLOWS
    if (path === '/watchlist/rules') return []
    if (path.startsWith('/accounts?')) return { data: [], pagination: { hasNext: false, currentPage: 1, size: 100 } }
    return {}
  })
}

function renderPage() {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: 'u-sig' } as SessionUser, loading: false }}>
      <SignalsLibraryContent />
    </SessionContext.Provider>,
    '/signals',
  )
}

beforeEach(() => apiFetch.mockReset())

describe('Signaux — la bibliothèque', () => {
  it('liste TOUS les signaux d’un coup, les recrutements en tête puis du plus récent au plus ancien (#5191)', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('Programme data annoncé')).toBeInTheDocument()
    const cards = screen.getAllByTestId('signal-card')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]!).getByText('Recrute 12 ingénieurs data')).toBeInTheDocument()
    expect(within(cards[1]!).getByText('Programme data annoncé')).toBeInTheDocument()
    expect(within(cards[2]!).getByText('Refonte SI engagée')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Signaux' })).toBeInTheDocument()
  })

  it('dit qu’aucune recherche n’est lancée (pied de liste)', async () => {
    mockApi()
    renderPage()
    expect(
      await screen.findByText('3 sur 3 · Résultats déjà disponibles, aucune recherche supplémentaire'),
    ).toBeInTheDocument()
  })

  it('le lien de la source est SUR la carte : site de l’éditeur, nouvel onglet, nom accessible', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')

    const link = screen.getByRole('link', { name: 'Ouvrir la source : Presse' })
    expect(link).toHaveAttribute('href', 'https://www.lesechos.fr/tech/programme-data')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link.className).toMatch(/min-h-11/)
    // Lot 772 f) — la source ne se nomme jamais par son domaine : sa nature, l’adresse reste derrière le lien.
    expect(link).toHaveTextContent('Presse')
    expect(link.textContent).not.toMatch(/lesechos|\.fr/)
    // Un signal SANS url vérifiée n’a aucun lien : une seule source ouvrable sur trois cartes.
    expect(screen.getAllByRole('link', { name: /^Ouvrir la source/ })).toHaveLength(1)
  })

  it('le clic sur la source n’ouvre PAS la lecture du signal', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')
    fireEvent.click(screen.getByRole('link', { name: 'Ouvrir la source : Presse' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('« Recrutement salarié ≠ mission ouverte » ne s’écrit que sous un recrutement', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Recrute 12 ingénieurs data')
    expect(screen.getAllByText('Recrutement salarié ≠ mission ouverte')).toHaveLength(1)
  })

  it('« Enregistrer » écrit un ÉTAT (jamais une suppression)', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Recrute 12 ingénieurs data')

    await user.click(screen.getByRole('button', { name: 'Actions sur le signal : Recrute 12 ingénieurs data' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/signal-states',
        method: 'PUT',
        body: { items: [{ account_id: A2, signal_key: signalStateKey('Recrute 12 ingénieurs data') }], state: 'saved' },
      }),
    )
  })

  it('un signal écarté quitte « Tous » et se retrouve dans « Écartés », jamais supprimé', async () => {
    mockApi([{ account_id: A2, signal_key: signalStateKey('Recrute 12 ingénieurs data'), state: 'discarded' }])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await waitFor(() => expect(screen.queryByText('Recrute 12 ingénieurs data')).not.toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: /Écartés/ }))
    expect(await screen.findByText('Recrute 12 ingénieurs data')).toBeInTheDocument()
  })

  it('la vue « Par compte » garde le plateau de veille d’avant (rien ne se perd)', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')

    await user.click(screen.getByRole('button', { name: 'Par compte' }))
    expect(await screen.findByRole('group', { name: 'Facettes de la veille' })).toBeInTheDocument()
  })

  it('« Mes veilles » mène aux veilles', async () => {
    mockApi()
    renderPage()
    expect(await screen.findByRole('button', { name: 'Mes veilles' })).toBeInTheDocument()
  })

  it('« En faire une action » est SUR la carte, plus dans le menu « … »', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    const card = (await screen.findAllByTestId('signal-card'))[0]!
    expect(within(card).getByRole('button', { name: 'En faire une action' })).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /^Actions sur le signal/ }))
    await screen.findByRole('menuitem', { name: 'Enregistrer' })
    expect(screen.queryByRole('menuitem', { name: 'En faire une action' })).not.toBeInTheDocument()
  })
})

describe('#4505 — la page au dessin de la maquette V22', () => {
  it('se lit dans l’ordre : en-tête → onglets → barre → ligne méta → grille', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')
    const order = [
      screen.getByTestId('signals-header'),
      screen.getByRole('tablist', { name: 'Ce que tu as fait de chaque signal' }),
      screen.getByRole('search', { name: 'Rechercher et trier les signaux' }),
      screen.getByTestId('signals-meta'),
      screen.getByTestId('signal-grid'),
    ]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('en-tête : surtitre, titre, phrase, Mes veilles et Ajouter un signal', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    const header = await screen.findByTestId('signals-header')
    expect(within(header).getByText('Veille commerciale')).toBeInTheDocument()
    expect(within(header).getByRole('heading', { level: 1, name: 'Signaux' })).toBeInTheDocument()
    expect(within(header).getByText('L’actualité de tes comptes, au même endroit.')).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Mes veilles' })).toBeInTheDocument()
    await user.click(within(header).getByRole('button', { name: 'Ajouter un signal' }))
    expect(screen.getByRole('dialog', { name: 'Ajouter un signal' })).toBeInTheDocument()
  })

  it('onglets : Tous · Enregistrés · Écartés · Corbeille (à droite)', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')
    const tabs = within(screen.getByRole('tablist', { name: 'Ce que tu as fait de chaque signal' })).getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Tous les signaux', 'Enregistrés', 'Écartés', 'Corbeille'])
    expect(tabs[3]!.className).toMatch(/ml-auto/)
  })

  it('la phrase « Tu suis N comptes… » et le mur de puces de comptes ont QUITTÉ la page', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')
    expect(screen.queryByText(/Tu suis/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Nordia/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrer par compte' })).not.toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/account-follows/suggestion' }))
  })

  it('« Tous les comptes » est une liste déroulante qui filtre RÉELLEMENT', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await user.click(screen.getByRole('button', { name: 'Filtrer par compte' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Velmore/ }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(1))
    expect(screen.getByText('Recrute 12 ingénieurs data')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtrer par compte' })).toHaveTextContent('Velmore')
  })

  it('la recherche lit le titre et le compte', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Programme data annoncé')
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher les signaux' }), 'velmore')
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(1))
  })

  it('ligne méta « Sélectionner les N affichés » · « N signaux », et grille 3 colonnes / 1 en mobile', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')
    const meta = screen.getByTestId('signals-meta')
    expect(within(meta).getByText('Sélectionner les 3 affichés')).toBeInTheDocument()
    expect(meta).toHaveTextContent('3 signaux')
    const grid = screen.getByTestId('signal-grid')
    expect(grid.className).toMatch(/\bgrid-cols-1\b/)
    expect(grid.className).toMatch(/\blg:grid-cols-3\b/)
  })

  it('carte : nature, compte, titre, puis pied « source · date »', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Programme data annoncé')
    const card = screen.getByText('Programme data annoncé').closest<HTMLElement>('[data-testid="signal-card"]')!
    expect(
      within(within(card).getByTestId('signal-card-head')).getByText('Projet & transformation'),
    ).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Nordia' })).toBeInTheDocument()
    const footer = within(card).getByTestId('signal-card-footer')
    expect(within(footer).getByRole('link', { name: 'Ouvrir la source : Presse' })).toBeInTheDocument()
  })

  it('lot 787 — la modale d’un signal montre TOUJOURS les personnes à contacter du compte', async () => {
    mockApi()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Lire le signal : Recrute 12 ingénieurs data/ }))
    const dialog = await screen.findByRole('dialog')
    const people = await within(dialog).findByTestId('signal-people')
    expect(within(people).getByText('Romain Bitoun')).toBeInTheDocument()
  })

  it('lot 787 — même modale que l’Historique : même description, même structure (nature, personnes en dernier)', async () => {
    mockApi()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Lire le signal : Recrute 12 ingénieurs data/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleDescription('Détail du besoin')
    const extras = await within(dialog).findByTestId('signal-detail-extras')
    expect(within(extras).getByTestId('line-nature')).toBeInTheDocument()
    const children = [...extras.children].map(node => node.getAttribute('data-testid') ?? node.tagName)
    expect(children[children.length - 1]).toBe('signal-people')
  })
})

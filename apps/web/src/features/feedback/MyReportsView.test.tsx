import { screen, waitFor, within } from '@testing-library/react'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as MyReportsModule from './myReports'
import type { MyReport } from './myReports'
import { onReportRequest } from './reportLink'

/**
 * #1960.10 — « MES SIGNALEMENTS » (décision de Louis du 13/09/2026).
 *
 * Ce qui se teste ici n'est pas la mise en page, c'est qu'aucune phrase ne soit
 * fausse : un état non mesuré ne se lit jamais « reçu », une liste vide dit
 * comment en créer une, et rien ne mène hors de l'application — ni lien, ni nom
 * d'outil, ni marque (un espace en marque blanche lit la même page).
 */
const fixtures = vi.hoisted(() => ({ list: vi.fn(), isDemo: false }))

vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => fixtures.isDemo }))

vi.mock('./myReports', async importOriginal => ({
  ...(await importOriginal<typeof MyReportsModule>()),
  myReportsApi: { list: () => fixtures.list() },
}))

const { MyReportsView } = await import('./MyReportsView')

const REPORTS: MyReport[] = [
  {
    id: 'fb-1',
    createdAt: '2026-09-12T10:00:00.000Z',
    category: 'bug',
    message: 'Le bouton Enrichir ne répond plus\nDétails : depuis ce matin',
    reference: 913,
    status: 'in_progress',
  },
  {
    id: 'fb-2',
    createdAt: '2026-09-10T10:00:00.000Z',
    category: 'bug',
    message: 'La liste des comptes se vide',
    reference: 880,
    status: 'fixed',
  },
  {
    id: 'fb-3',
    createdAt: '2026-09-09T10:00:00.000Z',
    category: 'metier',
    message: 'Une idée de filtre',
    reference: 870,
    status: 'received',
  },
  {
    id: 'fb-4',
    createdAt: '2026-09-08T10:00:00.000Z',
    category: 'autre',
    message: 'Une question sur l’export',
    reference: 860,
    status: 'closed_unresolved',
  },
  {
    id: 'fb-5',
    createdAt: '2026-09-07T10:00:00.000Z',
    category: 'bug',
    message: 'Envoyé pendant une coupure',
    reference: null,
    status: null,
  },
]

function renderView() {
  resetTestQueryClient()
  return renderWithRouter(<MyReportsView />)
}

/** Refonte Théo V22 : le tableau commun — une ligne par signalement, l'en-tête de colonnes exclu. */
async function findReportRows() {
  const rows = await screen.findAllByRole('row')
  return rows.slice(1)
}

beforeEach(() => {
  fixtures.list.mockReset()
  fixtures.list.mockResolvedValue(REPORTS)
  fixtures.isDemo = false
})

describe('#1960.10 — Mes signalements', () => {
  it('se présente sous son nom', async () => {
    renderView()
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes signalements' })).toBeInTheDocument()
  })

  it('liste chaque signalement : référence, date, ce que la personne a écrit, état', async () => {
    renderView()

    const items = await findReportRows()
    expect(items).toHaveLength(5)

    const first = within(items[0]!)
    expect(first.getByText('Signalement n° 913')).toBeInTheDocument()
    // SON texte, sa première ligne : la liste résume, elle ne relit pas.
    expect(first.getByText('Le bouton Enrichir ne répond plus')).toBeInTheDocument()
    expect(first.queryByText(/depuis ce matin/)).toBeNull()
    expect(first.getAllByText(/12 septembre 2026/)[0]).toBeInTheDocument()
    expect(first.getByText('En cours')).toBeInTheDocument()

    expect(within(items[1]!).getByText('Corrigé')).toBeInTheDocument()
    expect(within(items[2]!).getByText('Reçu')).toBeInTheDocument()
    expect(within(items[3]!).getByText('Fermé sans suite')).toBeInTheDocument()
  })

  it('un signalement sans numéro le dit, et son état s’écrit « État indisponible » — jamais « Reçu »', async () => {
    renderView()

    const items = await findReportRows()
    const last = within(items[4]!)
    expect(last.getByText('Sans numéro')).toBeInTheDocument()
    expect(last.getByText('État indisponible')).toBeInTheDocument()
    expect(last.queryByText('Reçu')).toBeNull()
  })

  it('quand l’état d’un signalement NUMÉROTÉ n’a pas pu être lu, la page le dit en tête', async () => {
    fixtures.list.mockResolvedValue([{ ...REPORTS[0]!, status: null }, REPORTS[4]!])
    renderView()

    expect(await screen.findByText("L'état de 1 signalement n'a pas pu être lu pour le moment.")).toBeInTheDocument()
  })

  // NON : un signalement sans numéro n'a pas d'état à lire — ce n'est pas une
  // lecture qui a échoué, et l'annoncer comme telle ferait croire à une panne.
  it('ne l’annonce PAS quand seul un signalement sans numéro est sans état', async () => {
    fixtures.list.mockResolvedValue([REPORTS[4]!])
    renderView()

    await findReportRows()
    expect(screen.queryByText(/n'a pas pu être lu/)).toBeNull()
  })

  it('état vide honnête : rien n’a été signalé, et comment le faire', async () => {
    fixtures.list.mockResolvedValue([])
    renderView()

    expect(await screen.findByText("Tu n'as encore rien signalé.")).toBeInTheDocument()
    expect(screen.getByText(/Signaler un problème/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  // Intégration du lot (13/09/2026) — `an-empty-column-offers-a-way-out.test.ts` :
  // un état vide porte un GESTE. La page disait « le bouton en bas de l'écran en
  // ouvre un » sans en porter aucun. Le geste demande l'ouverture du formulaire
  // (le même que le bouton flottant et que le lien de Laura) et n'envoie RIEN :
  // en démonstration, c'est le widget qui répond par son message.
  it('#1960.10 — état vide : un bouton ouvre le formulaire de signalement, sans rien envoyer', async () => {
    const user = userEvent.setup()
    const requests: { message: string }[] = []
    const stopListening = onReportRequest(request => requests.push(request))
    fixtures.list.mockResolvedValue([])
    renderView()

    await user.click(await screen.findByRole('button', { name: 'Signaler un problème' }))
    stopListening()

    expect(requests).toEqual([{ message: '' }])
  })

  // NON : en salle de démonstration, « il apparaît ici dès qu'il est envoyé »
  // serait une promesse fausse — la démonstration n'envoie pas de signalement.
  it('#1960.10 — en démonstration, l’état vide ne promet pas un envoi qui n’aura pas lieu', async () => {
    fixtures.isDemo = true
    fixtures.list.mockResolvedValue([])
    renderView()

    expect(await screen.findByText("Tu n'as encore rien signalé.")).toBeInTheDocument()
    expect(screen.getByText(/La démonstration n'envoie pas de signalement/)).toBeInTheDocument()
    expect(screen.queryByText(/dès qu'il est envoyé/)).toBeNull()
  })

  it('erreur de chargement : le dit, et propose de réessayer', async () => {
    const user = userEvent.setup()
    fixtures.list.mockRejectedValueOnce(new Error('500'))
    renderView()

    expect(await screen.findByRole('alert')).toHaveTextContent("Tes signalements n'ont pas pu être chargés.")
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(fixtures.list).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Signalement n° 913')).toBeInTheDocument()
  })

  it('ne mène nulle part hors de l’application : aucun lien, aucun nom d’outil, aucune marque, aucune adresse', async () => {
    const { container } = renderView()

    await findReportRows()
    expect(container.querySelectorAll('a')).toHaveLength(0)
    // La marque passe par `{{brand}}` dans les traductions : si l'écran en
    // citait une, elle se résoudrait ici en « Bellum » et ce test tomberait.
    expect(container.textContent).not.toMatch(/bellum|github|linear|@/i)
  })

  it('structure Théo V22 (aide) : le titre et « Préparer un signalement », puis le tableau — colonnes nommées', async () => {
    renderView()
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Mes signalements' })
    expect(screen.getByRole('button', { name: /Préparer un signalement/ })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Mes signalements' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(th => th.textContent),
    ).toEqual(['Signalement', 'Catégorie', 'Envoyé', 'État'])
    expect(h1.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('« Préparer un signalement » ouvre le formulaire, sans rien envoyer', async () => {
    const user = userEvent.setup()
    const requests: { message: string }[] = []
    const stopListening = onReportRequest(request => requests.push(request))
    renderView()
    await user.click(await screen.findByRole('button', { name: /Préparer un signalement/ }))
    stopListening()
    expect(requests).toEqual([{ message: '' }])
  })
})

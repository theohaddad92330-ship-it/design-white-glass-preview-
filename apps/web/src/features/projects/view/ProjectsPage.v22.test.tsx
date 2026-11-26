import type { PipelineColumn, ProjectRow } from '@bellum/contracts'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4499 (Louis 23/10, contrat validé le 24/10) — /projects repris au dessin de la maquette V22, écran Affaires.
 * Ce test sait dire NON sur la STRUCTURE : l'en-tête ne porte que Importer · Nouvelle affaire, les onglets sont dans
 * l'ordre, la barre a ses contrôles et son menu « … » à droite de Kanban | Liste, une ligne de synthèse remplace les
 * quatre cartes et « Par commercial », et chaque geste retiré est présent à son nouvel endroit.
 */
const downloadCSV = vi.fn()
// Refonte Théo — la ligne « Hors pipe » compte les archivées : le hook est neutralisé ici.
// #2170.43 — les seuils d'étape de l'espace : non lus ici, la page retombe sur 7/14/30.
vi.mock('@/features/projects/model/use-stage-sla-rows', () => ({ useStageSlaRows: () => undefined }))
vi.mock('../hooks/useArchivedProjects', () => ({
  useArchivedProjects: () => ({ data: [], isLoading: false, isError: false }),
}))

// #4499 — l'entrée « Exporter pour un partenaire » lit la liste serveur des besoins.
const openNeedsList = vi.fn((): { data: { data: { id: string }[] } | undefined } => ({ data: undefined }))
vi.mock('../open-needs/hooks/useOpenNeeds', () => ({ useOpenNeeds: () => openNeedsList() }))
vi.mock('@/lib/export-csv', () => ({
  downloadCSV: (...args: unknown[]) => downloadCSV(...args),
  downloadJSON: vi.fn(),
}))
const dataExit = vi.fn()
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit(), workspaceRuleRefusalText: () => null }))

const pipeline = vi.fn()
const projects = vi.fn()
const accountNeeds = vi.fn()

// #4016 L1 — le panneau du CA probable lit sa propre requête ; hors périmètre de cette suite.
// #4193 — les compteurs viennent de `GET /crm-counters` (`useQuery`) ; cet
// écran ne monte pas de `QueryClientProvider`.
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('../probability/ProbableQuarterPanel', () => ({ ProbableQuarterPanel: () => null }))
// #4016.1b — la probabilité des cartes vient d'une requête : hors sujet ici.
vi.mock('../probability/useDealProbability', () => ({ useDealProbability: () => () => null }))
// #4016 L6 — la ligne « pistes à revoir » (ex-bande, #4191 D3) a ses propres tests ; ici elle se tait.
vi.mock('@/features/projects/pipeline-detections/view/PipelineDetectionsLink', () => ({
  PipelineDetectionsLink: () => null,
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => pipeline() }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => projects() }))
vi.mock('@/features/projects/hooks/useUpdateProjectStage', () => ({
  useUpdateProjectStage: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/projects/portfolio/hooks/useAccountNeeds', () => ({ useAccountNeeds: () => accountNeeds() }))
// Le hook des porteurs lit react-query ; ce test n'a rien à faire des porteurs.
vi.mock('@/features/projects/hooks/useProjectOwners', () => ({
  useProjectOwners: () => ({
    selfId: 'u-1',
    ownerName: (id: string | null) => (id === 'u-1' ? 'Théo Haddad' : null),
    members: [{ id: 'u-1', name: 'Théo Haddad' }],
  }),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
// #2170.52 — voir le même mock dans `ProjectsPage.quickFilters.test.tsx` :
// sans lui, `SavedPipelineViews` (rendu sans condition dans la barre d'outils)
// appelle `useQuery` pour de vrai, et cet écran n'a jamais monté de
// `QueryClientProvider`.
vi.mock('@/features/projects/view/SavedPipelineViews', () => ({
  SavedPipelineViews: () => <button type="button">Mes vues</button>,
}))
// #4545 — `ProjectsPage` monte `PistesDrawer` sans condition (il décide lui-même de
// s'ouvrir sur `?pistes=1`) et il appelle `usePlanFeature` → `useCredits` →
// `useSession`, que cet écran n'a jamais monté. Le panneau a son propre test.
vi.mock('@/features/projects/pipeline-detections/view/PistesDrawer', () => ({
  PistesDrawer: () => null,
}))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    createFileRoute: () => (options: Record<string, unknown>) => ({ ...options, useSearch: () => ({}) }),
    Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  }
})

const { ProjectsPage } = await import('./ProjectsPage')

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null })
const MORE = 'Plus d’actions sur le pipe'

const column = (stage: string, label: string, count: number): PipelineColumn =>
  ({ stage, label, count, amount_cents: 1_000_000, without_amount: 0, without_next_action: 0 }) as PipelineColumn

function project(id: string, label: string, stage: string, over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id,
    label,
    stage,
    company_name: 'Cliente SA',
    amount_cents: 1_000_000,
    stage_entered_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    first_detected_at: '2026-08-01T00:00:00.000Z',
    owner_id: null,
    source: null,
    has_mission: false,
    access_mode: null,
    ...over,
  } as unknown as ProjectRow
}

/** Au pipe : deux affaires prises en main. */
const QUALIFIED = project('p-q', 'Socle data', 'qualified', { owner_id: 'u-1' })
const NEGOTIATION = project('p-n', 'Refonte du SI paiement', 'negotiation')
/** DANS L'ENTONNOIR : repérée par une analyse, jamais prise en main. C'est elle
 *  qui ne doit apparaître dans AUCUNE des deux vues. */
const DETECTED = project('p-d', 'Reprise du parc applicatif', 'detected')

beforeEach(async () => {
  cleanup()
  vi.clearAllMocks()
  pipeline.mockReturnValue(
    ok({
      columns: [column('qualified', 'Qualifié', 1), column('negotiation', 'Négociation', 1)],
      intake: 1,
      signals: 0,
      total_count: 2,
      total_amount_cents: 2_000_000,
      total_without_amount: 0,
      signed_count: 0,
      signed_amount_cents: 0,
      signed_without_amount: 0,
    }),
  )
  projects.mockReturnValue(ok([QUALIFIED, NEGOTIATION, DETECTED]))
  accountNeeds.mockReturnValue(ok([]))
  await act(async () => {
    await i18n.changeLanguage('fr')
  })
})

describe('#4499 — Affaires, au dessin de la maquette V22', () => {
  beforeEach(() => dataExit.mockReturnValue({ allowed: true, grant: {} }))

  it('1. en-tête : « Affaires », sa phrase, et à droite Importer · Nouvelle affaire SEULEMENT', () => {
    render(<ProjectsPage />)
    expect(screen.getByText('Affaires')).toBeInTheDocument()
    expect(
      screen.getByText('Du premier échange au démarrage. Chaque dossier conserve son besoin et ses présentations.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle affaire' })).toBeInTheDocument()
    // NON : les gestes retirés de l'en-tête n'y sont plus.
    for (const gone of ['Exporter', 'Exporter les besoins', 'Exporter pour un partenaire', 'Créer un besoin']) {
      expect(screen.queryByRole('button', { name: gone }), gone).toBeNull()
    }
  })

  it('2. onglets : Pipeline · Besoins · Présentations, dans cet ordre ; Besoins ouvre l’écran des besoins', () => {
    render(<ProjectsPage />)
    const tabs = within(screen.getByRole('navigation', { name: /Affaires/ }))
      .getAllByRole('link')
      .map(link => link.textContent)
    expect(tabs).toEqual(['Pipeline', 'Besoins', 'Présentations'])
  })

  it('3. barre : recherche · Tous les responsables · Tout le portefeuille · … · Kanban | Liste puis « … »', () => {
    render(<ProjectsPage />)
    const toolbar = screen.getByTestId('pipeline-toolbar')
    const search = within(toolbar).getByPlaceholderText('Rechercher une affaire ou un compte…')
    const owner = within(toolbar).getByRole('button', { name: /^Responsable : Tous les responsables/ })
    const state = within(toolbar).getByRole('button', { name: /^État des affaires : Tout le portefeuille/ })
    const kanban = within(toolbar).getByRole('button', { name: 'Kanban' })
    const list = within(toolbar).getByRole('button', { name: 'Liste' })
    const more = within(toolbar).getByRole('button', { name: MORE })
    // Gardés hors maquette produit (la page appliquée les porte : PIP.A4 / PIP.A5).
    expect(within(toolbar).getByRole('button', { name: 'Filtres rapides du pipe' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Mes vues' })).toBeInTheDocument()
    const order = [search, owner, state, kanban, list, more]
    for (let i = 1; i < order.length; i += 1) {
      const previous = order[i - 1] as HTMLElement
      expect(previous.compareDocumentPosition(order[i] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('« … » porte Exporter et Exporter pour un partenaire', async () => {
    openNeedsList.mockReturnValue({ data: { data: [{ id: 'n-1' }] } })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    await user.click(screen.getByRole('button', { name: MORE }))
    expect(await screen.findByRole('menuitem', { name: 'Exporter' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Exporter pour un partenaire' })).toBeInTheDocument()
  })

  it('4. une ligne de synthèse à la place des quatre cartes et de « Par commercial »', () => {
    render(<ProjectsPage />)
    const line = screen.getByTestId('pipeline-summary')
    const text = (line.textContent ?? '').replace(/\s+/g, ' ')
    expect(screen.getByTestId('pipeline-in-view')).toHaveAccessibleName('affaires actives : 2')
    expect(text).toMatch(/pipe ouvert HT.*20\s?000\s?€.*estimation non pondérée/)
    expect(text).toMatch(/Les signaux restent dans\s?Signaux/)
    expect(screen.queryByTestId('pipeline-kpis')).toBeNull()
    for (const gone of ['Projets actifs', 'Sans prochaine action', 'Affaires à qualifier', 'Par commercial']) {
      expect(screen.queryByText(gone), gone).toBeNull()
    }
    expect(screen.queryByText(/probabilit|pondéré(?!e)/i)).toBeNull()
    const board = screen.getByTestId('pipeline-board')
    expect(line.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('5. Kanban : colonnes au nom d’étape du PRODUIT, nombre, « X € estimés » ; carte : montant, responsable', () => {
    render(<ProjectsPage />)
    const board = screen.getByTestId('pipeline-board')
    expect(within(board).getByText('Qualifié')).toBeInTheDocument()
    expect(within(board).getByText('Négociation')).toBeInTheDocument()
    expect(within(board).getAllByText(/10\s?000\s?€ estimés/)).toHaveLength(2)
    const card = within(board).getAllByTestId('pipeline-card')[0] as HTMLElement
    expect(within(card).getByText('Cliente SA')).toBeInTheDocument()
    expect(within(card).getByText(/10\s?000\s?€/)).toBeInTheDocument()
    expect(within(card).getByText('Théo')).toBeInTheDocument()
    // NON : les noms d'étapes de la démo de la maquette ne sont pas repris.
    expect(within(board).queryByText('Cadrage')).toBeNull()
    expect(within(board).queryByText('Profils présentés')).toBeNull()
  })
})

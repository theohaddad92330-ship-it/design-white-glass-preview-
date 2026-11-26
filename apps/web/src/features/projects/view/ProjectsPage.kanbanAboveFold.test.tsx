import type { PipelineColumn, ProjectRow, SessionUser } from '@bellum/contracts'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4191 (recette 15/10, D3) — LE KANBAN AU-DESSUS DU PLI. Critère d'acceptation
 * de l'épopée : le kanban commence à moins de 600 px du haut. Ce qui le poussait
 * à y≈942 px : la bande « Détecté, à revoir » (une carte par détection) et des
 * tuiles hautes.
 *
 * DÉCISION (Louis, recette 15/10) : les pistes détectées vivent dans l'onglet
 * Pistes ; le Pipe n'affiche qu'UNE ligne compacte « N pistes à revoir → Pistes »,
 * et rien quand N = 0 (on n'affiche pas ce qu'on n'a pas).
 */

const revenue = vi.fn()
const pipeline = vi.fn()
const missions = vi.fn()
const capacity = vi.fn()
const interventions = vi.fn()
const projects = vi.fn()
const accountNeeds = vi.fn()
const navigate = vi.fn()

let routerSearch: Record<string, unknown> = {}

// #4016 L1 — le panneau du CA probable lit sa propre requête ; hors périmètre de cette suite.
// #4193 — les compteurs viennent de `GET /crm-counters` (`useQuery`) ; cet
// écran ne monte pas de `QueryClientProvider`.
// #4191 (recette 3, F1) — la ligne « N pistes à revoir » lit le compteur `pistes_to_review`.
const pistesToReview = vi.hoisted(() => ({ value: null as number | null }))
// Refonte Théo — la ligne « Hors pipe » compte les archivées : le hook est neutralisé ici.
// #2170.43 — les seuils d'étape de l'espace : non lus ici, la page retombe sur 7/14/30.
vi.mock('@/features/projects/model/use-stage-sla-rows', () => ({ useStageSlaRows: () => undefined }))
vi.mock('../hooks/useArchivedProjects', () => ({
  useArchivedProjects: () => ({ data: [], isLoading: false, isError: false }),
}))

// #4295.14 — le bouton des besoins lit la liste serveur : hors sujet ici.
vi.mock('./PipelineMoreMenu', () => ({ PipelineMoreMenu: () => null }))
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({
    data:
      pistesToReview.value === null
        ? undefined
        : {
            counters: {
              opportunities_active: { value: 1, measured: true },
              pistes_to_review: { value: pistesToReview.value, measured: true },
            },
          },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('../probability/ProbableQuarterPanel', () => ({
  ProbableQuarterPanel: () => <div data-testid="probable-quarter-panel" />,
}))
// #4016.1b — la probabilité des cartes vient d'une requête : hors sujet ici.
vi.mock('../probability/useDealProbability', () => ({ useDealProbability: () => () => null }))
vi.mock('./ArchivedProjectsList', () => ({ ArchivedProjectsList: () => <div data-testid="archived-list" /> }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@/features/missions/api', () => ({
  useRevenue: () => revenue(),
  useMissions: () => missions(),
  useCapacity: (month: string) => capacity(month),
}))
vi.mock('@/features/playbooks/api', () => ({ useInterventions: () => interventions() }))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => pipeline() }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => projects() }))
vi.mock('@/features/projects/hooks/useUpdateProjectStage', () => ({
  useUpdateProjectStage: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/projects/portfolio/hooks/useAccountNeeds', () => ({ useAccountNeeds: () => accountNeeds() }))
vi.mock('@/features/projects/hooks/useProjectOwners', () => ({
  useProjectOwners: () => ({ selfId: null, ownerName: () => null }),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
// #2170.52 — les vues enregistrées du pipe ont leur PROPRE test
// (`SavedPipelineViews.test.tsx`) qui mocke déjà `@/features/governance/api` et
// `usePlanFeature`. Sans ce mock, le panneau (rendu sans condition dans la
// barre d'outils) appelle `useQuery` pour de vrai — cet écran n'a jamais
// monté de `QueryClientProvider`, exactement le motif documenté par
// `useProjectOwners.ts` pour `useSession()`.
vi.mock('@/features/projects/view/SavedPipelineViews', () => ({
  SavedPipelineViews: () => null,
}))

// #4545 — le panneau des pistes est monté sans condition par `ProjectsPage` (il
// décide lui-même de s'ouvrir sur `?pistes=1`), et il appelle `usePlanFeature`
// → `useCredits` → `useSession`. MÊME motif que `SavedPipelineViews` juste
// au-dessus : cet écran n'a jamais monté de `SessionProvider`. Le panneau a son
// propre test (`PistesDrawer`), ce fichier-ci parle du kanban.
vi.mock('@/features/projects/pipeline-detections/view/PistesDrawer', () => ({
  PistesDrawer: () => null,
}))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    createFileRoute: () => (options: Record<string, unknown>) => ({
      ...options,
      useSearch: () => routerSearch,
    }),
    Link: ({ to, children }: { to?: string; children: ReactNode }) => <a href={to ?? '#'}>{children}</a>,
  }
})

const { ProjectsPage } = await import('./ProjectsPage')
const { useCurrentUserStore } = await import('@/stores/currentUserStore')

const ME: SessionUser = {
  id: 'moi',
  email: 'commercial@exemple.fr',
  created_at: '2026-01-01T00:00:00.000Z',
  roles: ['customer'],
}

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null })

function summary() {
  return ok({
    columns: [
      { stage: 'qualified', label: 'Qualifié', count: 1, amount_cents: 1_000_000, without_amount: 0 },
      { stage: 'negotiation', label: 'Négociation', count: 2, amount_cents: 4_000_000, without_amount: 0 },
    ],
    intake: 0,
    signals: 0,
    total_count: 3,
    total_amount_cents: 5_000_000,
    total_without_amount: 0,
  })
}

const PROJECT = {
  id: 'p1',
  label: 'Refonte SI',
  stage: 'qualified',
  company_name: 'Cliente SA',
  amount_cents: 1_000_000,
  stage_entered_at: new Date(Date.now() - 86_400_000).toISOString(),
  has_mission: false,
  access_mode: null,
} as unknown as ProjectRow

describe('ProjectsPage — le kanban au-dessus du pli (D3)', () => {
  beforeEach(async () => {
    cleanup()
    for (const mock of [revenue, pipeline, missions, capacity, interventions, projects, accountNeeds, navigate])
      mock.mockReset()
    routerSearch = {}
    pistesToReview.value = null
    revenue.mockReturnValue(ok({ months: [] }))
    pipeline.mockReturnValue(summary())
    missions.mockReturnValue(ok([]))
    capacity.mockReturnValue(ok(null))
    interventions.mockReturnValue(ok([]))
    projects.mockReturnValue(ok([PROJECT]))
    accountNeeds.mockReturnValue(ok([]))
    useCurrentUserStore.setState({ currentUser: ME })
    await i18n.changeLanguage('fr')
  })

  it('remplace le bloc « Détecté, à revoir » par UNE ligne-lien vers Pistes quand N > 0', () => {
    pistesToReview.value = 3
    render(<ProjectsPage />)
    expect(screen.queryByText('Détecté, à revoir')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Prendre en main|Confirmer|Écarter/ })).not.toBeInTheDocument()
    // Théo C Q7 (22/10/2026) — la ligne ouvre le tiroir « Pistes de Laura » dans le pipe (les signaux, eux, restent
    // dans Signaux : le tiroir porte le renvoi).
    expect(screen.getByRole('button', { name: /3 pistes à revoir/ })).toBeInTheDocument()
  })

  it('accorde au singulier', () => {
    pistesToReview.value = 1
    render(<ProjectsPage />)
    expect(screen.getByRole('button', { name: /1 piste à revoir/ })).toBeInTheDocument()
  })

  it('rien quand N = 0 ou non lu : on n’affiche pas ce qu’on n’a pas', () => {
    pistesToReview.value = 0
    const { rerender } = render(<ProjectsPage />)
    expect(screen.queryByRole('link', { name: /à revoir/ })).not.toBeInTheDocument()
    pistesToReview.value = null
    rerender(<ProjectsPage />)
    expect(screen.queryByRole('link', { name: /à revoir/ })).not.toBeInTheDocument()
  })

  // #4499 (Louis 23/10, maquette V22) — UNE ligne de synthèse remplace les quatre cartes et « Par commercial » ;
  // l'ordre est celui de la maquette : barre d'outils, synthèse, Kanban.
  it('une seule ligne de synthèse, sans cartes ni « Par commercial », et l’ordre est celui de la maquette', () => {
    pistesToReview.value = 0
    render(<ProjectsPage />)
    const row = screen.getByTestId('pipeline-summary')
    // Arbitrage Louis 24/10 (#4499) : la synthèse est rendue par `KeyFigureRow` (garde F2-FIX #4332), pas en cartes.
    expect(within(row).getByTestId('pipeline-key-figures')).toBeInTheDocument()
    expect(row.className).not.toMatch(/grid-cols/)
    expect(screen.queryByTestId('pipeline-kpis')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pipeline-by-owner')).not.toBeInTheDocument()
    expect(screen.queryByText('Par commercial')).not.toBeInTheDocument()
    const toolbar = screen.getByTestId('pipeline-toolbar')
    const board = screen.getByTestId('pipeline-board')
    expect(toolbar.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // NON : aucune probabilité de closing sur le Pipeline (doctrine #4016 L1).
    expect(screen.queryByText(/probabilit/i)).not.toBeInTheDocument()
  })

  it('l’en-tête porte « Affaires », Importer et « Nouvelle affaire » ; la barre d’outils ses contrôles', () => {
    render(<ProjectsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Affaires' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle affaire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^État des affaires : Tout le portefeuille$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtres rapides du pipe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('« Ajouter une affaire » au pied de la première colonne ouvre le formulaire de création', () => {
    render(<ProjectsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une affaire' }))
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})

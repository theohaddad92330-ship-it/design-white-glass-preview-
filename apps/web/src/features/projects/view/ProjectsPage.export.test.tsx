import type { PipelineColumn, ProjectRow } from '@bellum/contracts'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4295.14 (#4016.11) — « Exporter » existe dans le Kanban ET dans le Tableau, et exporte la liste FILTRÉE à l'écran
 * (la même que celle des deux vues : l'entonnoir « Détecté » n'en fait pas partie, ni ce que la recherche écarte).
 * #4499 — il vit dans le menu « … » de la barre (`PipelineMoreMenu`), plus dans l'en-tête.
 */
const downloadCSV = vi.fn()
// Refonte Théo — la ligne « Hors pipe » compte les archivées : le hook est neutralisé ici.
// #2170.43 — les seuils d'étape de l'espace : non lus ici, la page retombe sur 7/14/30.
vi.mock('@/features/projects/model/use-stage-sla-rows', () => ({ useStageSlaRows: () => undefined }))
vi.mock('../hooks/useArchivedProjects', () => ({
  useArchivedProjects: () => ({ data: [], isLoading: false, isError: false }),
}))

// #4499 — l'entrée « Exporter pour un partenaire » lit la liste serveur des besoins : aucune ici.
vi.mock('../open-needs/hooks/useOpenNeeds', () => ({ useOpenNeeds: () => ({ data: undefined }) }))
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
  useProjectOwners: () => ({ selfId: null, ownerName: () => null }),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
// #2170.52 — voir le même mock dans `ProjectsPage.quickFilters.test.tsx` :
// sans lui, `SavedPipelineViews` (rendu sans condition dans la barre d'outils)
// appelle `useQuery` pour de vrai, et cet écran n'a jamais monté de
// `QueryClientProvider`.
vi.mock('@/features/projects/view/SavedPipelineViews', () => ({
  SavedPipelineViews: () => null,
}))

// #4545 — le panneau des pistes est monté sans condition par `ProjectsPage` (il
// décide lui-même de s'ouvrir sur `?pistes=1`), et il appelle `usePlanFeature`
// → `useCredits` → `useSession`. MÊME motif que `SavedPipelineViews` juste
// au-dessus : cet écran n'a jamais monté de `SessionProvider`. Le panneau a son
// propre test (`PistesDrawer`), ce fichier-ci parle d'autre chose.
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

async function clickExport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: MORE }))
  await user.click(await screen.findByRole('menuitem', { name: 'Exporter' }))
}

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
const QUALIFIED = project('p-q', 'Socle data', 'qualified')
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

describe('#4295.14 / #4499 — Exporter, dans les deux vues, par le menu « … »', () => {
  beforeEach(() => dataExit.mockReturnValue({ allowed: true, grant: {} }))

  it.each([['Kanban'], ['Liste']])('la vue %s exporte les affaires du pipe, sans l’entonnoir', async view => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    await user.click(screen.getByRole('button', { name: view }))
    await clickExport(user)
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const csv = downloadCSV.mock.calls[0]?.[0] as string
    expect(csv).toContain('Socle data')
    expect(csv).toContain('Refonte du SI paiement')
    expect(csv).not.toContain('Reprise du parc applicatif')
  })

  it('exporte la liste FILTRÉE : une recherche qui écarte une affaire l’écarte du fichier', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    await user.type(screen.getByPlaceholderText(/Chercher/i), 'Socle')
    await clickExport(user)
    const csv = downloadCSV.mock.calls[0]?.[0] as string
    expect(csv).toContain('Socle data')
    expect(csv).not.toContain('Refonte du SI paiement')
  })

  it('NON : la règle d’espace refuse la sortie de données → aucun menu « … », dans aucune vue', async () => {
    dataExit.mockReturnValue({ allowed: false, grant: null })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Exporter' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Liste' }))
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })

  it('NON : les vues « Archivées » et « Perdues » n’offrent pas d’export de la liste du pipe', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    // Refonte Théo — Perdues / Archivées s'ouvrent par « État des affaires ».
    expect(screen.getByRole('button', { name: MORE })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^État des affaires/ }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Perdues' }))
    // Sans besoin à exporter pour un partenaire, le menu n'a plus aucune entrée : il disparaît.
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })
})

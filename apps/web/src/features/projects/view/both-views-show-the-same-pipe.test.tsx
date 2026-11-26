import type { PipelineColumn, ProjectRow } from '@bellum/contracts'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * LES DEUX VUES DU PIPE MONTRENT LA MÊME POPULATION — #1328 (9/9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RECETTE A TROUVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 03/09/2026, dans l'heure suivant la mise en ligne de
 * la vue Tableau. Le kanban montrait 8 cartes ; le tableau, sur la MÊME donnée,
 * rendait **86 lignes, dont 67 au stade « Détecté »**.
 *
 * Le kanban n'a jamais montré l'entonnoir : `detected` et `potential` n'ont
 * aucune colonne, ils ont leur propre porte — la carte « À qualifier ». Le
 * tableau, lui, rendait `projects` tel quel.
 *
 * La conséquence n'est pas cosmétique : la carte de tête annonçait « Projets
 * actifs · 8 » au-dessus d'un tableau de 86 lignes. Deux chiffres du même écran
 * qui se contredisent — et c'est le tableau qu'on croit, parce qu'on peut les
 * compter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'invariant de l'issue, mot pour mot : « la vue Tableau réutilise EXACTEMENT
 * les mêmes objets ». Elle bascule d'une vue à l'autre et compare ce qui est
 * réellement rendu — pas ce que le code a l'air de filtrer.
 *
 * ⚠️ Elle SAIT DIRE NON : retirer le `isPipelineStage(...)` de `visibleProjects`
 * fait apparaître « Reprise du parc applicatif » dans le tableau, et le premier
 * test tombe.
 */
const pipeline = vi.fn()
const projects = vi.fn()
const accountNeeds = vi.fn()

// #4016 L1 — le panneau du CA probable lit sa propre requête ; hors périmètre de cette suite.
// #4193 — les compteurs viennent de `GET /crm-counters` (`useQuery`) ; cet
// écran ne monte pas de `QueryClientProvider`.
// Refonte Théo — la ligne « Hors pipe » compte les archivées : le hook est neutralisé ici.
// #2170.43 — les seuils d'étape de l'espace : non lus ici, la page retombe sur 7/14/30.
vi.mock('@/features/projects/model/use-stage-sla-rows', () => ({ useStageSlaRows: () => undefined }))
vi.mock('../hooks/useArchivedProjects', () => ({
  useArchivedProjects: () => ({ data: [], isLoading: false, isError: false }),
}))

// #4295.14 — le bouton des besoins lit la liste serveur : hors sujet ici.
vi.mock('./PipelineMoreMenu', () => ({ PipelineMoreMenu: () => null }))
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

describe('#1328 — le Tableau et le Kanban montrent le même pipe', () => {
  it('le kanban ignore l’entonnoir — l’état d’avant, et il n’a pas bougé', () => {
    render(<ProjectsPage />)
    expect(screen.getByText('Socle data')).toBeInTheDocument()
    expect(screen.getByText('Refonte du SI paiement')).toBeInTheDocument()
    expect(screen.queryByText('Reprise du parc applicatif')).not.toBeInTheDocument()
  })

  it('le TABLEAU l’ignore aussi — 86 lignes sous une carte qui en annonçait 8', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    await user.click(screen.getByRole('button', { name: 'Liste' }))

    expect(await screen.findByText('Socle data')).toBeInTheDocument()
    expect(screen.getByText('Refonte du SI paiement')).toBeInTheDocument()
    // LE défaut de la recette du 03/09 : sans le filtre, cette ligne apparaît.
    expect(screen.queryByText('Reprise du parc applicatif')).not.toBeInTheDocument()
  })

  it('et la carte « Projets actifs » annonce bien ce que le tableau montre', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    await user.click(screen.getByRole('button', { name: 'Liste' }))

    // Deux affaires au pipe, deux lignes au tableau : c'est la seule chose que
    // l'utilisateur peut vérifier lui-même, et c'est ce qui rend la carte
    // croyable. `+ 1` pour la ligne d'entête.
    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(3)
  })
})

describe('#1328 — un montant absent ne fait pas gonfler la ligne', () => {
  it('rend le verdict seul, et sa raison au SURVOL', async () => {
    projects.mockReturnValue(ok([project('p-x', 'Cadrage sans budget', 'qualified', { amount_cents: null })]))
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ProjectsPage />)
    await user.click(screen.getByRole('button', { name: 'Liste' }))

    // Le verdict reste — jamais « 0 € », qui se lirait « gratuit ».
    const verdict = await screen.findByText('non mesuré')
    // ⚠️ Et il est SEUL : mesuré en production, la raison rendue à la suite du
    // verdict repliait la phrase sur six lignes et portait les lignes à 181 px,
    // là où l'issue en demande 60 à 68. La justification passe au survol.
    expect(verdict.textContent).toBe('non mesuré')
    const cell = verdict.closest('td')
    expect(cell?.getAttribute('title')).toMatch(/montant/i)
  })
})

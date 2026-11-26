import { cleanup, fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PistesBoard } from './PistesBoard'
import { ProjectsPage } from './ProjectsPage'

/**
 * « Aucun projet pour l'instant » — et rien pour en avoir un.
 *
 * Le pipe vide expliquait d'où viennent les projets (« des analyses de
 * comptes ») sans donner le moindre chemin pour en lancer une. La phrase était
 * juste ; l'écran restait un cul-de-sac.
 *
 * La lentille « Pistes à qualifier » du même écran porte les deux mêmes états vides que
 * l'écran Besoins — vide et filtré — et donc les deux mêmes portes.
 */
// #3283 — la lentille vit dans l'URL (`?lens=`) et se change depuis la barre de
// SECTION (`SectionTabs`), plus depuis une barre locale : le test pose donc la
// recherche de la route à la main et observe la navigation demandée.
const navigateMock = vi.fn()
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
// #4545 — `ProjectsPage` monte `PistesDrawer` sans condition (il décide lui-même de
// s'ouvrir sur `?pistes=1`) et il appelle `usePlanFeature` → `useCredits` →
// `useSession`, que cet écran n'a jamais monté. Le panneau a son propre test.
vi.mock('@/features/projects/pipeline-detections/view/PistesDrawer', () => ({
  PistesDrawer: () => null,
}))
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({ data: undefined, isLoading: false, isError: false }),
}))
// #4191 (D3) — la bande « détecté, à revoir » est montée par Pistes ; elle lit sa propre requête.
// Refonte Théo — ses lignes sont celles du tableau des pistes (`PistesBoard`) : la requête est doublée ici.
vi.mock('../pipeline-detections/api', () => ({
  usePipelineDetections: () => ({ data: { items: [], autoDetect: 'on' }, isLoading: false }),
  useConfirmPipelineDetection: () => ({ mutate: vi.fn(), isPending: false }),
  useDismissPipelineDetection: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../probability/ProbableQuarterPanel', () => ({ ProbableQuarterPanel: () => null }))
// #4016.1b — la probabilité des cartes vient d'une requête : hors sujet ici.
vi.mock('../probability/useDealProbability', () => ({ useDealProbability: () => () => null }))
vi.mock('@/routes/projects/index', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

const usePipelineMock = vi.fn()
const useProjectsMock = vi.fn()
const useAccountNeedsMock = vi.fn()

vi.mock('../hooks/usePipeline', () => ({ usePipeline: () => usePipelineMock() }))
vi.mock('../hooks/useProjects', () => ({ useProjects: () => useProjectsMock() }))
vi.mock('../hooks/useUpdateProjectStage', () => ({
  useUpdateProjectStage: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../portfolio/hooks/useAccountNeeds', () => ({
  useAccountNeeds: () => useAccountNeedsMock(),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// #2173.56 — même dialogue que l'écran Besoins ouverts, jamais réécrit :
// monté seulement à l'ouverture (`useAccounts` y lit la session).
const importNeedsDialogProps = vi.fn()
vi.mock('../open-needs/view/ImportNeedsDialog', () => ({
  ImportNeedsDialog: (props: { open: boolean }) => {
    importNeedsDialogProps(props)
    return null
  },
}))

/** `RouterProvider` monte de façon asynchrone : sans attente, le DOM est vide. */
async function mount(): Promise<void> {
  renderWithRouter(<ProjectsPage />)
  await screen.findByRole('heading', { level: 1 })
}

/** Ouvre « Pistes » (ex-lentille « Portefeuille », #2169.8 ; route `/projects/pistes` depuis #4197 ;
 *  panneau du Pipe depuis #4545, 25/10/2026 — Signaux l'avait porté du 19 au 25/10, #4340). */
async function openPortfolio() {
  cleanup()
  renderWithRouter(<PistesBoard onOpenAccount={() => {}} />)
  await screen.findByRole('textbox')
}

describe('ProjectsPage — un pipe vide donne le chemin pour le remplir', () => {
  beforeEach(async () => {
    usePipelineMock.mockReset()
    useProjectsMock.mockReset()
    useAccountNeedsMock.mockReset()
    usePipelineMock.mockReturnValue({
      data: { total_count: 0, intake: 0, stages: [] },
      isLoading: false,
      isError: false,
    })
    useProjectsMock.mockReturnValue({ data: [], isLoading: false })
    useAccountNeedsMock.mockReturnValue({ data: [], isError: false, isLoading: false })
    importNeedsDialogProps.mockClear()
    navigateMock.mockClear()
    await i18n.changeLanguage('fr')
  })

  it('#3660 — l’entête du Pipe ne porte plus « Demander à Laura quoi traiter en premier »', async () => {
    await mount()

    expect(screen.queryByRole('link', { name: /quoi traiter en premier/i })).not.toBeInTheDocument()
  })

  it("mène vers Découvrir quand aucun projet n'existe", async () => {
    await mount()

    // #2169.25 (23/09) — le titre du vide « pour de bon » a changé de libellé.
    expect(screen.getByText(/Ton pipe est vide, mais .+ peut déjà t’aider\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Découvrir/i })).toHaveAttribute('href', '/discover')
  })

  /**
   * #2169.26 à .28 — TROIS choix de plus que Découvrir : importer un CRM,
   * créer une opportunité (composant partagé `CreateProjectAction`, un
   * `<Link>`, GA-26), qualifier une piste détectée. Découvrir reste le
   * chemin CANONIQUE (« les projets naissent des analyses de comptes ») ;
   * ces trois-là s'y ajoutent, ils ne le remplacent pas.
   *
   * ⚠️ #2169.29 (« demander à Laura de retrouver les affaires ») n'ajoute PAS
   * de `<AskLaura>` ici — voir le commentaire dans `ProjectsPage.tsx` ; le lien
   * de PAGE a lui-même été retiré (#3660).
   */
  it('offre trois autres portes du vide « pour de bon »', async () => {
    await mount()

    const importLink = screen.getByRole('link', { name: 'Importer un CRM' })
    expect(importLink).toHaveAttribute('href', '/settings/knowledge')

    const createLink = screen.getByRole('link', { name: 'Créer une première opportunité' })
    // ⚠️ `renderWithRouter` (harnais minimal, sans `validateSearch`) sérialise
    // les chaînes de `search` en JSON (`create=%221%22`) là où le routeur réel
    // de l'app les rend nues (`create=1`, `MissionDossierPage.test.tsx` avec
    // un `@tanstack/react-router` mocké à la main) — la même route que le
    // bouton de la barre d'outils, jamais un second chemin (GA-26).
    const href = createLink.getAttribute('href') ?? ''
    expect(href.startsWith('/projects?')).toBe(true)
    expect(href).toMatch(/create=1(&|$)/)

    expect(screen.getByRole('button', { name: 'Qualifier une piste détectée' })).toBeInTheDocument()
  })

  it('#2169.28 — propose de qualifier une piste détectée, en ouvrant la lentille « Pistes à qualifier »', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Qualifier une piste détectée' }))
    expect(navigateMock).toHaveBeenCalledTimes(1)
    const call = navigateMock.mock.calls[0]?.[0]
    // #4545 (revient sur #4340) — le panneau des pistes du Pipe, ouvert par `?pistes=1`, plus Signaux.
    expect(call.to).toBe('/projects')
    expect(call).not.toHaveProperty('hash')
    expect(call.search({ stage: 'won' })).toEqual({ stage: 'won', pistes: 1 })
  })

  it("n'invente pas de porte sur une erreur de chargement du pipe", async () => {
    usePipelineMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    await mount()

    expect(screen.queryByRole('link', { name: /Découvrir/i })).not.toBeInTheDocument()
  })

  // #2958.107 (recette Hervé) — l'échec du PIPE s'annonçait « Impossible de
  // charger les besoins » : un persona non formé cherchait des besoins sur
  // l'onglet des affaires. L'erreur nomme ce qui n'a pas chargé.
  it('#2958.107 — un échec du pipe nomme le pipe, pas les besoins', async () => {
    usePipelineMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    await mount()

    expect(screen.getByText('Impossible de charger le pipe')).toBeInTheDocument()
    expect(screen.queryByText('Impossible de charger les besoins')).not.toBeInTheDocument()
  })

  it('porte les mêmes deux portes sur la lentille « Pistes à qualifier »', async () => {
    await mount()
    await openPortfolio()

    expect(screen.getByRole('link', { name: /Découvrir/i })).toHaveAttribute('href', '/discover')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'doctolib' } })

    expect(screen.queryByRole('link', { name: /Découvrir/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Effacer les filtres/i })).toBeInTheDocument()
  })

  it('efface réellement le filtre du portefeuille', async () => {
    await mount()
    await openPortfolio()

    const search = screen.getByRole('textbox')
    fireEvent.change(search, { target: { value: 'doctolib' } })
    fireEvent.click(screen.getByRole('button', { name: /Effacer les filtres/i }))

    expect(search).toHaveValue('')
    expect(screen.getByRole('link', { name: /Découvrir/i })).toBeInTheDocument()
  })

  // #2173.56 — l'écran vide des besoins ne proposait pas d'importer : seule
  // l'écran « Besoins ouverts » (`/projects/needs`) portait ce CTA. La
  // lentille « Pistes à qualifier » du même écran (`/projects`) rend le MÊME vide
  // « aucun besoin » et doit porter la MÊME porte — jamais sur le pipe, qui
  // ne parle pas de besoins.
  // FIX-E2E-4393 (#4344) — « Besoins à pourvoir » a quitté l'entête du pipe et les besoins vivent
  // dans le pipe : l'import (#2173.56) et la création de besoin n'ont plus d'autre porte que lui.
  it("propose l'import en masse et la création de besoin sur le pipe vide", async () => {
    await mount()

    expect(screen.getByRole('button', { name: 'Importer des fiches de poste' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un besoin' })).toBeInTheDocument()
  })

  it("le bouton d'import ouvre le MÊME dialogue que l'écran Besoins ouverts", async () => {
    await mount()
    await openPortfolio()

    expect(importNeedsDialogProps).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Importer des fiches de poste' }))

    expect(importNeedsDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }))
  })

  // #2169.28 — placé en DERNIER : ce test bascule la lentille depuis le geste
  // de l'empty state (plutôt que depuis l'onglet), un chemin distinct de
  // `openPortfolio()` ci-dessus qu'il vaut mieux ne pas mélanger avec les
  // autres scénarios de cette suite.
  it('le choix « qualifier une piste détectée » ouvre la lentille Pistes à qualifier', async () => {
    await mount()

    fireEvent.click(screen.getByRole('button', { name: 'Qualifier une piste détectée' }))

    expect(navigateMock).toHaveBeenCalledTimes(1)
  })
})

import type { PipelineColumn, ProjectRow, SessionUser } from '@bellum/contracts'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * §2.1 + §2.6 — LA BARRE DU PIPE FILTRE VRAIMENT L'ÉCRAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST TRAVERSE LES DEUX ÉCRANS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut du 28/08 n'était PAS un lien sans paramètre : c'était un lien JUSTE
 * et une route qui jetait le paramètre. Un test qui se contente de lire le
 * `href` de la barre serait donc resté vert pendant que le pipe entier
 * s'ouvrait. Celui-ci parcourt la chaîne complète :
 *
 *   1. l'entête de colonne du pipe est cliquée — elle vivait dans le bloc
 *      « Mon pipe » du brief jusqu'au 04/09, et le retour #1394 a fait partir
 *      ce bloc ; le lien a déménagé sur le kanban, qui NOMME déjà l'étape.
 *      Repointer ce test sur `/projects` sans déplacer le lien l'aurait rendu
 *      muet : `?stage=` n'aurait plus eu aucun émetteur, et la route aurait
 *      gardé un `validateSearch` que plus rien n'atteint ;
 *   2. ce qu'elle emporte passe par le VALIDATEUR DE LA ROUTE — celui que la
 *      route déclare vraiment (`Route.validateSearch`), pas une copie écrite
 *      ici : sans `validateSearch`, TanStack Router jette la recherche, et le
 *      test doit tomber exactement là ;
 *   3. l'écran `/projets` reçoit le résultat et ne montre QUE cette étape ;
 *   4. il DIT qu'il est filtré, et le filtre se lève.
 *
 * `createFileRoute` est le seul point où le vrai routeur est remplacé : le
 * module de route reste RÉEL, donc son `validateSearch` aussi.
 */

const revenue = vi.fn()
const pipeline = vi.fn()
const missions = vi.fn()
const capacity = vi.fn()
const interventions = vi.fn()
const projects = vi.fn()
const accountNeeds = vi.fn()
const navigate = vi.fn()

/** Ce que « le routeur » tient à cet instant — ce que `Route.useSearch()` rend. */
let routerSearch: Record<string, unknown> = {}

// #1322 / #1323 — l'écran porte maintenant un entête personnalisé, qui lit le
// profil. Ce test-ci ne mesure pas l'entête : il double la feuille plutôt que
// de monter un fournisseur de session dont il n'a rien à faire.
// #4016 L1 — le panneau du CA probable lit sa propre requête ; hors périmètre de cette suite.
// #4193 — les compteurs viennent de `GET /crm-counters` (`useQuery`) ; certains
// rendus de ce fichier ne montent pas de `QueryClientProvider`.
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
// #1328 — la lentille nomme le porteur de chaque projet et sait qui est « moi ».
// Le hook lit react-query ; ce test ne monte pas de `QueryClientProvider` et n'a
// rien à faire des porteurs. Il double la feuille, comme il double déjà le
// pipe, les projets et les besoins — c'est la convention de ce fichier.
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
// #2942 — `CreateNeedDialog` monte le NeedWizard complet (recherche de
// projet via react-query), et ce fichier ne monte pas de `QueryClientProvider`
// (même raison que `useProjectOwners` ci-dessus). Ce que ce test-ci garde est
// le CÂBLAGE — le paramètre `create_need` atteint le dialogue, avec les bons
// props — pas le formulaire lui-même, déjà couvert par `CreateNeedDialog.test.tsx`.
const createNeedDialogProps = vi.fn()
vi.mock('@/features/projects/open-needs/view/CreateNeedDialog', () => ({
  CreateNeedDialog: (props: Record<string, unknown>) => {
    createNeedDialogProps(props)
    return null
  },
}))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    // La route reste RÉELLE : seule sa fabrique est remplacée, ce qui laisse
    // `validateSearch` — le schéma que la route déclare vraiment — accessible au
    // test. C'est lui qui joue le rôle du routeur ci-dessous.
    createFileRoute: () => (options: Record<string, unknown>) => ({
      ...options,
      useSearch: () => routerSearch,
    }),
    Link: ({
      to,
      search,
      children,
      className,
    }: {
      to?: string
      search?: Record<string, unknown>
      children: ReactNode
      className?: string
    }) => (
      <a
        href={hrefOf(to, search)}
        className={className}
        onClick={event => {
          event.preventDefault()
          navigateTo(to, search)
        }}
      >
        {children}
      </a>
    ),
  }
})

const { Route } = await import('@/routes/projects/index')
const { ProjectsPage } = await import('./ProjectsPage')
const { MyActivityBlock } = await import('@/features/briefing/view/MyActivityBlock')
const { useCurrentUserStore } = await import('@/stores/currentUserStore')

/** `/projects` + `{ stage: 'negotiation' }` → `/projects?stage=negotiation`. */
function hrefOf(to: string | undefined, search: Record<string, unknown> | undefined): string {
  const query = new URLSearchParams(
    Object.entries(search ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, value]) => [key, value]),
  ).toString()
  return query ? `${to ?? '#'}?${query}` : (to ?? '#')
}

/**
 * CE QUE FAIT LE ROUTEUR, et rien de plus : il passe la recherche par le
 * `validateSearch` DE LA ROUTE VISÉE, et jette tout ce qui n'y est pas déclaré.
 *
 * ⚠️ C'est la moitié qui manquait le 28/08. Une route sans `validateSearch`
 * arrive ici avec `undefined` et la recherche est PERDUE — le test échoue alors
 * sur l'assertion « l'écran ne montre que cette étape », exactement comme
 * l'utilisateur le vivait.
 */
function navigateTo(to: string | undefined, search: Record<string, unknown> | undefined): void {
  if (to !== '/projects') return
  const validate = (Route as unknown as { validateSearch?: { parse: (input: unknown) => Record<string, unknown> } })
    .validateSearch
  routerSearch = validate ? validate.parse(search ?? {}) : {}
}

const ME: SessionUser = {
  id: 'moi',
  email: 'commercial@exemple.fr',
  created_at: '2026-01-01T00:00:00.000Z',
  roles: ['customer'],
}

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null })

const column = (stage: string, label: string, count: number, cents: number): PipelineColumn =>
  ({ stage, label, count, amount_cents: cents, without_amount: 0 }) as PipelineColumn

/** Le résumé rendu par `GET /projects/pipeline`, tel que les DEUX écrans le lisent. */
function summary() {
  return ok({
    columns: [
      column('qualified', 'Qualifié', 2, 1_000_000),
      column('negotiation', 'Négociation', 1, 4_000_000),
      column('won', 'Signé', 0, 0),
    ],
    intake: 4,
    signals: 0,
    total_count: 3,
    total_amount_cents: 5_000_000,
    total_without_amount: 0,
  })
}

/**
 * Un projet du board. Les champs non lus par le tableau sont omis puis castés :
 * les énumérer tous ferait un décor de trente lignes dont vingt-huit ne
 * protègent rien, et masquerait ce que le test regarde vraiment.
 */
function project(id: string, label: string, stage: string): ProjectRow {
  return {
    id,
    label,
    stage,
    company_name: 'Cliente SA',
    amount_cents: 1_000_000,
    stage_entered_at: '2026-08-20T00:00:00.000Z',
    has_mission: false,
    access_mode: null,
  } as unknown as ProjectRow
}

const QUALIFIED = project('p-q', 'Socle data', 'qualified')
const NEGOTIATION = project('p-n', 'Refonte du SI paiement', 'negotiation')

beforeEach(async () => {
  cleanup()
  vi.clearAllMocks()
  routerSearch = {}
  useCurrentUserStore.setState({ currentUser: ME })
  pipeline.mockReturnValue(summary())
  projects.mockReturnValue(ok([QUALIFIED, NEGOTIATION]))
  accountNeeds.mockReturnValue(ok([]))
  revenue.mockReturnValue(ok({ periodMonth: '2026-08-01', lines: [] }))
  missions.mockReturnValue(ok({ missions: [], canReadFinance: true }))
  capacity.mockImplementation((month: string) => ok({ periodMonth: `${month}-01`, availableDays: 1 }))
  interventions.mockReturnValue(ok([]))
  await act(async () => {
    await i18n.changeLanguage('fr')
  })
})

/* -------------------------------------------------------------------------- */
/*  1. La chaîne entière : la barre est cliquée, l'écran est filtré            */
/* -------------------------------------------------------------------------- */

describe('§2.1 — cliquer une barre du pipe ouvre la liste FILTRÉE', () => {
  it('l’entête porte son étape, la route la garde, et l’écran ne montre QUE cette étape', () => {
    const board = render(<ProjectsPage />)
    const bar = screen.getByText('Négociation').closest('a')
    expect(bar).toHaveAttribute('href', '/projects?stage=negotiation')

    // Le clic passe par le validateur DE LA ROUTE — la moitié qui manquait.
    fireEvent.click(bar as HTMLElement)
    expect(routerSearch).toEqual({ stage: 'negotiation' })
    board.unmount()

    render(<ProjectsPage />)
    // Une seule colonne, et c'est la bonne.
    expect(screen.getByText('Négociation')).toBeInTheDocument()
    expect(screen.queryByText('Qualifié')).not.toBeInTheDocument()
    // Et surtout : la CARTE d'une autre étape a disparu. C'est ce que le
    // 28/08 n'a pas su empêcher — le lien était juste, la liste était entière.
    expect(screen.getByText('Refonte du SI paiement')).toBeInTheDocument()
    expect(screen.queryByText('Socle data')).not.toBeInTheDocument()
  })

  it('sans filtre, le pipe ENTIER reste ouvert — une garde qui refuse tout ne protège rien', () => {
    render(<ProjectsPage />)
    expect(screen.getByText('Qualifié')).toBeInTheDocument()
    expect(screen.getByText('Négociation')).toBeInTheDocument()
    expect(screen.getByText('Socle data')).toBeInTheDocument()
    expect(screen.queryByText(/Cette liste est filtrée/)).not.toBeInTheDocument()
  })

  it('une étape sans colonne au tableau ne PRÉTEND pas filtrer — la barre ouvre le pipe entier', () => {
    // `detected` est l'entonnoir, pas une colonne. `.catch(undefined)` le ramène
    // à « pas de filtre » : mieux vaut le pipe entier qu'un tableau vide sans
    // rien pour dire pourquoi.
    navigateTo('/projects', { stage: 'detected' })
    expect(routerSearch).toEqual({ stage: undefined })
    render(<ProjectsPage />)
    expect(screen.getByText('Qualifié')).toBeInTheDocument()
    expect(screen.queryByText(/Cette liste est filtrée/)).not.toBeInTheDocument()
  })
})

/* -------------------------------------------------------------------------- */
/*  2. L'écran DIT qu'il est filtré, et le filtre se lève                      */
/* -------------------------------------------------------------------------- */

describe('§2.6 — un écran filtré le dit, et le filtre se lève', () => {
  it('NOMME l’étape avec le libellé de L’ESPACE, pas avec un identifiant brut', () => {
    routerSearch = { stage: 'negotiation' }
    render(<ProjectsPage />)
    expect(screen.getByText('Étape : Négociation')).toBeInTheDocument()
    expect(screen.getByText(/Cette liste est filtrée : elle ne montre pas tout ton pipe\./)).toBeInTheDocument()
    expect(screen.queryByText('negotiation')).not.toBeInTheDocument()
  })

  it('le bouton de retrait EFFACE l’étape — et rien d’autre de la recherche', () => {
    routerSearch = { stage: 'negotiation' }
    render(<ProjectsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre d’étape et voir tout le pipe' }))
    const updater = navigate.mock.calls.at(-1)?.[0] as { search: (prev: unknown) => unknown }
    // ⚠️ Un geste, pas un `<Navigate>` : celui-ci compare l'identité de ses
    // props et rejoue en boucle (GA-27).
    expect(updater.search({ stage: 'negotiation' })).toEqual({ stage: undefined })
  })

  it('un filtre qui ne ramène rien NOMME le filtre bloquant — jamais un écran muet', () => {
    routerSearch = { stage: 'won' }
    render(<ProjectsPage />)
    expect(screen.getByText('Aucune affaire sur ces critères.')).toBeInTheDocument()
    expect(screen.getByText(/Le filtre bloquant est étape = Signé\./)).toBeInTheDocument()
    // Le mensonge symétrique : « aucune affaire » lu comme un total serait aussi
    // faux que le pipe entier lu comme le périmètre d'une étape.
    expect(screen.getByText(/ton pipe en a peut-être à d’autres étapes/)).toBeInTheDocument()
  })

  it('et cet état vide a une SORTIE — un état vide sans porte est un cul-de-sac', () => {
    routerSearch = { stage: 'won' }
    render(<ProjectsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Lever le filtre' }))
    const updater = navigate.mock.calls.at(-1)?.[0] as { search: (prev: unknown) => unknown }
    expect(updater.search({ stage: 'won' })).toEqual({ stage: undefined })
  })

  it('un pipe RÉELLEMENT vide n’accuse pas le filtre — il n’y a rien à lever', () => {
    // Nommer un coupable qui n'en est pas un envoie lever un filtre au lieu de
    // lancer une analyse.
    pipeline.mockReturnValue(ok({ columns: [], intake: 0, signals: 0, total_count: 0, total_amount_cents: 0 }))
    projects.mockReturnValue(ok([]))
    routerSearch = { stage: 'negotiation' }
    render(<ProjectsPage />)
    // #2169.25 (23/09) — le titre du vide « pour de bon » a changé de libellé.
    expect(screen.getByText(/Ton pipe est vide, mais .+ peut déjà t’aider\./)).toBeInTheDocument()
    expect(screen.queryByText('Aucune affaire sur ces critères.')).not.toBeInTheDocument()
  })

  it('#2711.1 — « Nouvelle affaire » existe dans l’en-tête du pipe, pour ne pas se limiter aux projets de l’analyse', () => {
    // Retour SKAIZen Group (22/09/2026) : « Créer projet, à la main depuis la
    // liste dans opportunités ». Mesuré par l'issue elle-même : le formulaire
    // `CreateProjectDialog` existait déjà, ouvert par `/projects?create=1` —
    // mais SEUL `RenewalDecisionPanel` (une mission) le déclenchait. La liste
    // des opportunités (ce pipe) n'avait AUCUN bouton.
    // #2169.20 (23/09) — le libellé suit le vocabulaire unifié par #2169.1 :
    // « Créer un projet » devient « Créer une opportunité », puis (recette 10/10, #3683) « Préparer une opportunité » :
    // le formulaire est un brouillon, rien n'est créé avant sa validation.
    render(<ProjectsPage />)
    // Refonte Théo — l'action principale de l'en-tête s'appelle « Nouvelle affaire ».
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle affaire' }))
    const updater = navigate.mock.calls.at(-1)?.[0] as { search: (prev: unknown) => unknown }
    // Un projet créé à la main depuis la liste n'a ni compte ni mission déjà
    // choisis — c'est le formulaire qui les demande.
    expect(updater.search({ stage: 'negotiation' })).toEqual({ stage: 'negotiation', create: 1 })
  })

  /**
   * #2942 — recette écran 27/09/2026 : `/projects?create_need=1` « n'ouvrait
   * rien seul ». `CreateNeedDialog` (le brouillon compilé par Laura, carte
   * `compile_need` → `PendingActions.tsx`) vivait jusqu'ici À L'INTÉRIEUR de
   * `PipelineLens`, qui retourne tôt sur un pipe VIDE, EN ERREUR ou FILTRÉ à
   * zéro résultat — le paramètre d'URL n'atteignait alors jamais le dialogue.
   * `create=1` (`CreateProjectDialog`, l'affaire, test #2711.1 ci-dessus)
   * suivait déjà le bon patron : monté au niveau de `ProjectsPage`, donc
   * indépendant de ce que la lentille Pipe affiche. `create_need=1` suit
   * désormais le même patron — vérifié ici sur le pipe RÉELLEMENT VIDE, le
   * cas le plus probable pour un besoin sans opportunité encore ouverte
   * (#2558.1 : « la majorité des missions d'ESN n'ont pas de projet »).
   */
  it('#2942 — un pipe VIDE n’avale pas `create_need=1` : le brouillon compilé par Laura s’ouvre quand même', () => {
    pipeline.mockReturnValue(ok({ columns: [], intake: 0, signals: 0, total_count: 0, total_amount_cents: 0 }))
    projects.mockReturnValue(ok([]))
    routerSearch = {
      create_need: 1,
      need_title: 'Développeur Java',
      need_context: 'Renfort backend',
    }

    render(<ProjectsPage />)

    expect(createNeedDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        provenance: 'model',
        initialTitle: 'Développeur Java',
        initialContext: 'Renfort backend',
      }),
    )
  })

  it('le dit AUSSI en anglais — une phrase corrigée à l’aveugle se vérifie sur la VALEUR', async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    routerSearch = { stage: 'won' }
    const english = render(<ProjectsPage />)
    expect(english.getByText('No deal matches these criteria.')).toBeInTheDocument()
    expect(english.getByText(/The blocking filter is stage = Signé\./)).toBeInTheDocument()
    english.unmount()

    routerSearch = { stage: 'negotiation' }
    const filtered = render(<ProjectsPage />)
    expect(filtered.getByText('Stage: Négociation')).toBeInTheDocument()
    expect(filtered.getByText(/This list is filtered/)).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('fr')
    })
  })
})

/* #3281 / #3283 — la barre d'outils sur une ligne, les lentilles dans la barre de section */

describe('#3281 — la barre d’outils du pipe tient sur UNE ligne (desktop)', () => {
  it('refonte Théo — UNE barre d’outils : recherche, Responsable, État, Filtres, puis la bascule Kanban / Liste', () => {
    render(<ProjectsPage />)
    const toolbar = screen.getByTestId('pipeline-toolbar')
    const search = screen.getByPlaceholderText(/Rechercher une affaire ou un compte/i)
    expect(toolbar.contains(search)).toBe(true)
    expect(toolbar.className).toContain('flex-wrap')
    // Les filtres rapides ne sont plus une rangée de pastilles : un menu « Filtres », multi-sélection.
    expect(screen.queryByTestId('pipe-chips-frame')).toBeNull()
    expect(toolbar.contains(screen.getByRole('button', { name: 'Filtres rapides du pipe' }))).toBe(true)
    expect(toolbar.contains(screen.getByRole('button', { name: /^État des affaires/ }))).toBe(true)
    expect(toolbar.contains(screen.getByRole('button', { name: 'Liste' }))).toBe(true)
  })

  /**
   * #3377 — retour bêta 30/09 : « des éléments se chevauchent de manière
   * étrange ». La taille `sm` de `SearchInput` rend son `<input>` à
   * `lg:w-64` (256 px) par défaut — plus large que le wrapper posé ICI à
   * `md:w-52` (208 px, une largeur FIXE, pas un plafond). Sans correction,
   * l'input déborde de son wrapper et chevauche la rangée de pastilles juste
   * à droite dès `lg`. `w-full` sur l'input fait suivre le wrapper.
   */
  it('#3377 — l’input suit la largeur de son wrapper, jamais sa propre largeur `lg:w-64`', () => {
    render(<ProjectsPage />)
    const search = screen.getByPlaceholderText(/Rechercher une affaire ou un compte/i)
    expect(search.className).toMatch(/(?:^|\s)w-full(?:\s|$)/)
    expect(search.className).not.toMatch(/lg:w-64/)
  })
})

describe('#3283 — les lentilles ne sont plus une barre locale', () => {
  it('« Pipe » / « Pistes à qualifier » vivent dans la barre de section, pas dans l’écran', () => {
    render(<ProjectsPage />)
    expect(screen.queryByRole('button', { name: 'Pistes à qualifier' })).not.toBeInTheDocument()
  })

  it('#4197 — ?lens=portfolio ne rend PLUS les pistes ici : la route redirige avant le rendu', () => {
    // `/projects?lens=portfolio` → `/projects/pistes` (`beforeLoad`, voir
    // `crm-redirects.test.ts`) ; l'écran, lui, est toujours le Pipe.
    routerSearch = { lens: 'portfolio' }
    render(<ProjectsPage />)
    expect(screen.getByPlaceholderText(/Rechercher une affaire ou un compte/i)).toBeInTheDocument()
  })
})

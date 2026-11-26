import type { PipelineColumn, ProjectRow, SessionUser } from '@bellum/contracts'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2170.48/.49/.51 — TROIS FILTRES RAPIDES DE PLUS SUR LE PIPE : vieillissantes
 * (même définition que la carte, `staleOf`, GA-26), sans profil positionné
 * (`positioned_count === 0`, même donnée que #2170.19) et à signer
 * (`stage === 'negotiation'`, la dernière étape avant « gagné »).
 *
 * Même patron de test que `ProjectsPage.stageFilter.test.tsx` — cette page a
 * beaucoup de dépendances, et diverger du patron existant coûterait plus cher
 * qu'il ne protège.
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
// Refonte Théo — la ligne « Hors pipe » compte les archivées : le hook est neutralisé ici.
// #2170.43 — les seuils d'étape de l'espace : non lus ici, la page retombe sur 7/14/30.
let slaRows: unknown = undefined
vi.mock('@/features/projects/model/use-stage-sla-rows', () => ({ useStageSlaRows: () => slaRows }))
// #2170.53 — le panneau latéral a ses propres tests (`RecordPanel.test.tsx`) ; ici, seule compte la
// question que la PAGE lui passe pour Laura.
let lauraQuestion: string | undefined
vi.mock('@/features/records/RecordPanel', () => ({
  RecordPanel: (props: { lauraQuestion?: string }) => {
    lauraQuestion = props.lauraQuestion
    return null
  },
}))
vi.mock('../hooks/useArchivedProjects', () => ({
  useArchivedProjects: () => ({ data: [], isLoading: false, isError: false }),
}))

// #4295.14 — le bouton des besoins lit la liste serveur : hors sujet ici.
vi.mock('./PipelineMoreMenu', () => ({ PipelineMoreMenu: () => null }))
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('../probability/ProbableQuarterPanel', () => ({
  ProbableQuarterPanel: () => <div data-testid="probable-quarter-panel" />,
}))
// #4016.1b — la probabilité des cartes vient d'une requête : hors sujet ici.
vi.mock('../probability/useDealProbability', () => ({ useDealProbability: () => () => null }))
vi.mock('./ArchivedProjectsList', () => ({ ArchivedProjectsList: () => <div data-testid="archived-list" /> }))
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

const column = (stage: string, label: string, count: number, cents: number): PipelineColumn =>
  ({ stage, label, count, amount_cents: cents, without_amount: 0 }) as PipelineColumn

function summary() {
  return ok({
    columns: [column('qualified', 'Qualifié', 1, 1_000_000), column('negotiation', 'Négociation', 2, 4_000_000)],
    intake: 0,
    signals: 0,
    total_count: 3,
    total_amount_cents: 5_000_000,
    total_without_amount: 0,
  })
}

function project(over: Partial<ProjectRow> & { id: string; label: string; stage: string }): ProjectRow {
  return {
    company_name: 'Cliente SA',
    amount_cents: 1_000_000,
    stage_entered_at: '2026-09-20T00:00:00.000Z',
    has_mission: false,
    access_mode: null,
    ...over,
  } as unknown as ProjectRow
}

const FRESH = project({
  id: 'p-fresh',
  label: 'Récent',
  stage: 'qualified',
  // Relatif à « maintenant » : une date figée devenait « vieillissante » 7 jours
  // plus tard (le 27/09/2026, toutes les PR ont rougi sur ce test).
  stage_entered_at: new Date(Date.now() - 86_400_000).toISOString(),
})
const AGING = project({
  id: 'p-aging',
  label: 'Vieux dossier',
  stage: 'qualified',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
})
const NO_PROFILE = project({
  id: 'p-noprofile',
  label: 'Sans profil',
  stage: 'negotiation',
  positioned_count: 0,
})
const WITH_PROFILE = project({
  id: 'p-withprofile',
  label: 'Avec profil',
  stage: 'negotiation',
  positioned_count: 2,
})
// #2170.50 — un quatrième filtre : au moins un entretien prévu cette semaine
// (`interview_this_week`, dérivé serveur, même donnée que la carte #2170.5).
const WITH_INTERVIEW_THIS_WEEK = project({
  id: 'p-interview',
  label: 'Entretien prévu',
  stage: 'qualified',
  interview_this_week: true,
})
const WITHOUT_INTERVIEW = project({
  id: 'p-no-interview',
  label: 'Sans entretien',
  stage: 'qualified',
  interview_this_week: false,
})

beforeEach(async () => {
  cleanup()
  vi.clearAllMocks()
  routerSearch = {}
  useCurrentUserStore.setState({ currentUser: ME })
  pipeline.mockReturnValue(summary())
  projects.mockReturnValue(ok([FRESH, AGING, NO_PROFILE, WITH_PROFILE, WITH_INTERVIEW_THIS_WEEK, WITHOUT_INTERVIEW]))
  accountNeeds.mockReturnValue(ok([]))
  revenue.mockReturnValue(ok({ periodMonth: '2026-08-01', lines: [] }))
  missions.mockReturnValue(ok({ missions: [], canReadFinance: true }))
  capacity.mockImplementation((month: string) => ok({ periodMonth: `${month}-01`, availableDays: 1 }))
  interventions.mockReturnValue(ok([]))
  await act(async () => {
    await i18n.changeLanguage('fr')
  })
})

/** Refonte Théo — les filtres rapides vivent dans le menu « Filtres » : on l'ouvre, puis on coche. */
function pickFilter(label: string) {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Filtres rapides du pipe' }), { button: 0, ctrlKey: false })
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: new RegExp(`^${label}`) }))
}

/** Refonte Théo — Perdues, En sommeil, Archivées s'ouvrent par « État des affaires ». */
function pickState(label: string) {
  fireEvent.pointerDown(screen.getByRole('button', { name: /^État des affaires/ }), { button: 0, ctrlKey: false })
  fireEvent.click(screen.getByRole('menuitemradio', { name: label }))
}

describe('ProjectsPage — filtres rapides vieillissantes / sans profil / à signer (#2170.48/.49/.51)', () => {
  it('« Vieillissantes » ne garde que les projets immobiles ≥ 7 jours (même seuil que la carte)', () => {
    const { container } = render(<ProjectsPage />)
    pickFilter('Vieillissantes')
    if (!container.textContent?.includes('Vieux dossier')) {
      throw new Error('CONTENT: ' + (container.textContent ?? '').slice(0, 4000))
    }
    expect(screen.getByText('Vieux dossier')).toBeInTheDocument()
    expect(screen.queryByText('Récent')).not.toBeInTheDocument()
  })

  // #2170.43 — le seuil RÉGLÉ par l'espace pour l'étape (Règles → Pipe) fait foi : une qualification
  // réglée à 200 jours n'est pas vieillissante à ~120 jours. Sait dire NON : une page qui ne passe pas
  // les seuils au filtre garde « Vieux dossier ».
  it('« Vieillissantes » lit le seuil d’étape réglé par l’espace, pas 7 jours figés (#2170.43)', () => {
    slaRows = [{ stage: 'qualified', slaDays: 200, isDefault: false }]
    try {
      render(<ProjectsPage />)
      pickFilter('Vieillissantes')
      expect(screen.queryByText('Vieux dossier')).not.toBeInTheDocument()
    } finally {
      slaRows = undefined
    }
  })

  it('« Sans profil positionné » ne garde que les projets à positioned_count = 0', () => {
    render(<ProjectsPage />)
    pickFilter('Sans profil positionné')
    expect(screen.getByText('Sans profil')).toBeInTheDocument()
    expect(screen.queryByText('Avec profil')).not.toBeInTheDocument()
  })

  it('« À signer » ne garde que les projets en négociation', () => {
    render(<ProjectsPage />)
    pickFilter('À signer')
    expect(screen.queryByText('Récent')).not.toBeInTheDocument()
    expect(screen.getByText('Sans profil')).toBeInTheDocument()
    expect(screen.getByText('Avec profil')).toBeInTheDocument()
  })

  /**
   * #2170.50 — « Entretien cette semaine » ne garde que `interview_this_week
   * === true` (dérivé serveur, même donnée que la carte #2170.5).
   * `undefined` (API antérieure) ne compte jamais comme « rien cette
   * semaine » — c'est pourquoi FRESH (sans le champ) reste hors résultat sans
   * jamais y avoir été promis.
   */
  it('« Entretien cette semaine » ne garde que les projets avec un entretien prévu sous sept jours', () => {
    render(<ProjectsPage />)
    pickFilter('Entretien cette semaine')
    expect(screen.getByText('Entretien prévu')).toBeInTheDocument()
    expect(screen.queryByText('Sans entretien')).not.toBeInTheDocument()
    expect(screen.queryByText('Récent')).not.toBeInTheDocument()
  })
})

/**
 * #2169.19 — « TRAITER LES N DOSSIERS BLOQUÉS ».
 *
 * #4499 (Louis 23/10) — la carte KPI qui portait le CTA a quitté la page (une ligne de synthèse la remplace). Le
 * geste reste atteignable par le MÊME filtre local, « Sans prochaine action » du menu Filtres (GA-26, un seul état) ;
 * ce test prouve que le dossier bloqué se retrouve par là, et que plus aucun bouton-carte ne le double.
 */
describe('ProjectsPage — « Traiter les N dossiers bloqués » (#2169.19)', () => {
  const BLOCKED = project({
    id: 'p-blocked',
    label: 'Dossier bloqué',
    stage: 'qualified',
    next_action: null,
  })

  it('le filtre « Sans prochaine action » du menu Filtres ramène le dossier bloqué ; aucune carte KPI ne le double', () => {
    pipeline.mockReturnValue(
      ok({
        columns: [
          { ...column('qualified', 'Qualifié', 2, 1_000_000), without_next_action: 1 },
          { ...column('negotiation', 'Négociation', 2, 4_000_000), without_next_action: 0 },
        ],
        intake: 0,
        signals: 0,
        total_count: 4,
        total_amount_cents: 5_000_000,
        total_without_amount: 0,
      }),
    )
    projects.mockReturnValue(ok([FRESH, AGING, NO_PROFILE, WITH_PROFILE, BLOCKED]))

    render(<ProjectsPage />)
    expect(screen.queryByRole('button', { name: /traiter le dossier bloqué/i })).not.toBeInTheDocument()
    pickFilter('Sans prochaine action')

    expect(screen.getByText('Dossier bloqué')).toBeInTheDocument()
    expect(screen.queryByText('Récent')).not.toBeInTheDocument()
  })
})

// #4197 (L6) — le CA probable a QUITTÉ cet écran pour Pilotage › Pipe (`PipeScreen`) :
// le kanban monte à moins de 600 px du haut, et le chiffre n'apparaît qu'à un endroit (GA-26).
// #4137 — la vue « Archivés » reste, sans panneau au-dessus d'une liste de dossiers rangés.
describe('ProjectsPage — plus de CA probable (#4197), et la vue Archivés tient (#4137)', () => {
  it('ne rend le panneau ni en kanban ni en Archivés', () => {
    render(<ProjectsPage />)
    expect(screen.queryByTestId('probable-quarter-panel')).not.toBeInTheDocument()
    pickState('Archivées')
    expect(screen.queryByTestId('probable-quarter-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('archived-list')).toBeInTheDocument()
  })
})

describe('ProjectsPage — la question Laura du dossier ouvert (#2170.53)', () => {
  it('nomme le compte, et dit depuis combien de jours l’affaire n’a pas bougé au-delà du seuil', () => {
    render(<ProjectsPage />)
    fireEvent.click(screen.getByText('Vieux dossier'))
    expect(lauraQuestion).toContain('Le compte est Cliente SA.')
    expect(lauraQuestion).toMatch(/n’a pas bougé de son étape depuis \d+ jours/)
  })

  it('une affaire récente ne porte aucune phrase d’immobilité', () => {
    render(<ProjectsPage />)
    fireEvent.click(screen.getByText('Récent'))
    expect(lauraQuestion).toContain('Le compte est Cliente SA.')
    expect(lauraQuestion).not.toMatch(/n’a pas bougé/)
  })
})

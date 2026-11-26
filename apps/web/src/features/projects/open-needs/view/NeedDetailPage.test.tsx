import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * LA FICHE D'UN BESOIN — l'écran qui n'existait pas (PDF-02 §4.2).
 *
 * Ce fichier garde trois choses, et rien d'autre :
 *
 *  1. **elle est ATTEIGNABLE** — pas seulement servie. Une route qui répond à
 *     une URL tapée à la main n'est pas un écran : c'est une adresse. Le test
 *     du chemin de clics vit dans `OpenNeedsThirdDoor.test.tsx` (le rôle est un
 *     lien vers `/projects/needs/<id>`) ; ici on garde ce que la fiche MONTRE
 *     une fois ouverte ;
 *  2. **aucune absence ne s'écrit « 0 »** — et il y en a onze sur cet écran ;
 *  3. **trois vides ne se ressemblent pas** : « ça charge », « je n'ai pas pu
 *     lire », « ce besoin n'existe pas ici » appellent trois gestes différents.
 */

const navigate = vi.fn()
// #2175.1-.6, .41 — LA RECHERCHE DE LA ROUTE, DOUBLÉE.
//
// `NeedDetailPage.tsx` lit maintenant `Route.useSearch()` (import bouclé
// depuis `@/routes/projects/needs_.$needId`, même motif que `ProjectsPage.tsx`
// / `ProjectsPage.stageFilter.test.tsx`) pour dériver la famille active depuis
// `?tab=`. `routeSearch` est ce que le routeur tiendrait à cet instant — un
// test qui veut un deep link pose `routeSearch = { tab: 'matching' }` avant de
// monter l'écran.
let routeSearch: { tab?: string } = {}
// #4198 (L7) — la zone « Objets liés » lit une requête : sans ce double, ce fichier devrait porter un QueryClientProvider.
vi.mock('@/features/records/useRecordLinks', () => ({ useRecordLinks: () => ({ data: undefined }) }))
vi.mock('@/components/access/PrivateSwitch', () => ({ PrivateSwitch: () => null }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  createFileRoute: () => (options: Record<string, unknown>) => ({ ...options, useSearch: () => routeSearch }),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

const openNeed = vi.fn()
vi.mock('../hooks/useOpenNeed', () => ({ useOpenNeed: () => openNeed() }))
// #2175.9 — même fonction que la carte du pipe et le tableau : un nom
// d'owner recalculé à un quatrième endroit divergerait à la première retouche.
vi.mock('../../hooks/useProjectOwners', () => ({
  useProjectOwners: () => ({ selfId: null, ownerName: (id: string | null) => (id === 'u-1' ? 'Alice Martin' : null) }),
}))
// « Prioriser » réutilise `useNeedActions` — le MÊME hook que
// `NeedActionsMenu.test.tsx` garde déjà. Ici on garde seulement qu'il est
// MONTÉ sans faire planter l'écran hors d'un `QueryClientProvider`.
const prioritizeMutate = vi.fn()
vi.mock('../hooks/useNeedActions', () => ({
  useNeedActions: () => ({ mutate: prioritizeMutate, isPending: false }),
}))
// La question prioritaire par axe et les contradictions (#2323.32 et suivants)
// ont leur PROPRE suite (`NeedRequirementsCard.test.tsx`, avec un vrai
// `QueryClientProvider`) ; ici on garde seulement que le bloc est MONTÉ, sans
// exiger un `QueryClientProvider` que cette suite n'installe pas.
vi.mock('../hooks/useNeedQualification', () => ({
  useNeedQualification: () => ({
    questions: [],
    contradictions: [],
    notEvaluable: [],
    isLoading: false,
    isError: false,
  }),
}))
// LE PARCOURS DE CE DOSSIER (#1505) — même règle que les blocs voisins : il a
// sa propre suite (`ChainProgressBlock.test.tsx`) et il LIT une requête. Ici on
// garde seulement qu'il est MONTÉ, avec le bon sujet — un bloc juste que
// personne ne nourrit est le défaut n°1 de ce dépôt.
const chainEntries = vi.fn(() => undefined as unknown)
vi.mock('@/features/chains/api', () => ({ useChainForSubject: () => ({ data: chainEntries() }) }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({
  ChainProgressBlock: ({ subjectType, subjectId }: { subjectType: string; subjectId: string }) => (
    <div data-testid="chain-progress">{`${subjectType}:${subjectId}`}</div>
  ),
}))
// Refonte Théo — sur bureau, la coque nomme une page de détail dans le fil : la fiche rend SON en-tête
// (`titleInScreen`). Le double ne rend donc que le corps.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
const openLauraInPlace = vi.fn()
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => openLauraInPlace }))
// Le bloc du §4.2 a ses propres tests (`NeedRateComparison.test.tsx`) ; ici on
// vérifie seulement qu'il est MONTÉ — un bloc juste que personne n'appelle est
// le motif qui revient dans tous les chantiers de ce dépôt.
vi.mock('./NeedRateComparison', () => ({
  NeedRateComparison: () => <div data-testid="need-rate-comparison" />,
}))
vi.mock('./NeedConsultantDoor', () => ({
  NeedConsultantDoor: ({ need }: { need: OpenNeedRow | null }) =>
    need ? <div data-testid="door-open">{need.title}</div> : null,
}))
vi.mock('@/features/projects/view/ProjectSynthesisPanel', () => ({
  ProjectSynthesisPanel: ({ projectId }: { projectId: string }) => <div data-testid="synthesis-7q">{projectId}</div>,
}))
vi.mock('./NeedRowMenu', () => ({ NeedRowMenu: () => <div data-testid="need-row-menu" /> }))
vi.mock('./NeedStaffableControl', () => ({
  NeedStaffableControl: () => <div data-testid="staffable-control" />,
}))
// #2323.18 — même raison que `NeedStaffableControl` juste au-dessus : son
// PROPRE fichier de test (`NeedProfileTypeAgreementControl.test.tsx`) garde
// la mutation ; ici on garde seulement qu'il est MONTÉ, sans exiger un
// `QueryClientProvider` que cette suite n'installe pas.
vi.mock('./NeedProfileTypeAgreementControl', () => ({
  NeedProfileTypeAgreementControl: () => <div data-testid="profile-type-agreement-control" />,
}))
// #3409.2 — même raison : son PROPRE fichier de test
// (`NeedConvergenceStateControl.test.tsx`) garde la mutation.
vi.mock('./NeedConvergenceStateControl', () => ({
  NeedConvergenceStateControl: () => <div data-testid="convergence-state-control" />,
}))
// « Un besoin sans candidat ouvre une piste » a son PROPRE fichier de test
// (`NeedReverseProspects.test.tsx`) : ici on garde seulement qu'elle est
// MONTÉE, avec le bon besoin, et SEULEMENT quand personne n'est présenté.
vi.mock('./NeedReverseProspects', () => ({
  NeedReverseProspects: ({ needId }: { needId: string }) => <div data-testid="reverse-prospects">{needId}</div>,
}))
// #2818 — « Chercher hors vivier » a son PROPRE fichier de test
// (`NeedExternalSourcing.test.tsx`) : ici on garde seulement qu'elle est
// MONTÉE, avec le bon besoin, et SEULEMENT quand personne n'est présenté —
// même signal, même raison que `NeedReverseProspects` juste au-dessus.
vi.mock('./NeedExternalSourcing', () => ({
  NeedExternalSourcing: ({ needId }: { needId: string }) => <div data-testid="external-sourcing">{needId}</div>,
}))
// L'onglet Positionnements a son PROPRE fichier de test
// (`NeedPositioningsTab.test.tsx`) : ici on garde seulement qu'il est MONTÉ
// avec le bon besoin — un panneau juste que personne n'appelle est le motif
// n°1 de ce dépôt.
vi.mock('./NeedShortlistPreview', () => ({ NeedShortlistSection: () => <div data-testid="need-shortlist-section" /> }))
vi.mock('./NeedPositioningsTab', () => ({
  NeedPositioningsTab: ({ need: row }: { need: OpenNeedRow }) => <div data-testid="positioning-tab">{row.id}</div>,
}))
// Même règle pour les quatre panneaux neufs de ce lot : chacun a son PROPRE
// fichier de test (Staffing, Laura recommande, étapes cochables, documents,
// historique) — ici on garde seulement qu'ils sont MONTÉS, avec le bon besoin.
// Le verdict et ses profils sont montés en double ici : leur contenu a sa
// propre suite (`NeedVerdictBanner.test.tsx`), et tous deux lisent une requête
// — les monter pour de vrai demanderait un `QueryClientProvider` à un test qui
// vérifie l'AGENCEMENT de la fiche, pas les données.
// #2916 / #2399.2 (c93) — la ligne « lancé automatiquement » a son propre test
// (`NeedAutoMatchNote.test.tsx`) ; ici, seulement sa présence sur la fiche.
vi.mock('@/features/matching/view/NeedAutoMatchNote', () => ({
  NeedAutoMatchNote: ({ needId }: { needId: string }) => <div data-testid="need-auto-match-slot">{needId}</div>,
}))
// La carte qualité lit le verdict de la même fiche (`useNeedVerdict`, react-query) :
// ce fichier ne monte pas de QueryClient, le verdict est donc « pas encore lu ».
vi.mock('../hooks/useNeedVerdict', () => ({ useNeedVerdict: () => ({ verdict: undefined }) }))
vi.mock('./NeedVerdictBanner', () => ({
  NeedVerdictBanner: ({ needId }: { needId: string }) => <div data-testid="verdict-banner">{needId}</div>,
}))
vi.mock('./NeedVerdictProfiles', () => ({
  NeedVerdictProfiles: ({ needId }: { needId: string }) => <div data-testid="verdict-profiles">{needId}</div>,
}))
vi.mock('./NeedStaffingBanner', () => ({
  NeedStaffingBanner: ({ need: row }: { need: OpenNeedRow }) => <div data-testid="staffing-banner">{row.id}</div>,
}))
vi.mock('./NeedDetailRecommendation', () => ({
  NeedDetailRecommendation: ({ need: row }: { need: OpenNeedRow }) => (
    <div data-testid="recommendation-card">{row.id}</div>
  ),
}))
vi.mock('./NeedStepsCard', () => ({
  NeedStepsCard: ({ need: row }: { need: OpenNeedRow }) => <div data-testid="steps-card">{row.id}</div>,
}))
vi.mock('./NeedDocumentsTab', () => ({
  NeedDocumentsTab: ({ need: row }: { need: OpenNeedRow }) => <div data-testid="documents-tab">{row.id}</div>,
}))
vi.mock('./NeedBeforeMissionCard', () => ({
  NeedBeforeMissionCard: ({ needId }: { needId: string }) => <div data-theo-block="before-mission">{needId}</div>,
}))
vi.mock('./NeedHistoryTab', () => ({
  NeedHistoryTab: ({ need: row }: { need: OpenNeedRow }) => <div data-testid="history-tab">{row.id}</div>,
}))
// Même règle pour Notes & activités : `TimelinePanel` a les siens.
vi.mock('@/features/activities/view/TimelinePanel', () => ({
  TimelinePanel: ({ scope, entityId }: { scope: string; entityId: string }) => (
    <div data-testid="activity-tab">{`${scope}:${entityId}`}</div>
  ),
}))
// ⚠️ Rapprochement, lui, reste RÉEL (ni `NeedMatchTab` ni `MatchDrawer` ne
// sont mockés) : c'est le test qui compte — l'onglet doit montrer le MÊME
// contenu que le tiroir de la liste, pas une doublure qui le prétend.
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// #4270.3 (18/10) — le profil d'espace, `null` par défaut (comportement historique).
const workspaceProfile = vi.fn((): string | null => null)
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => workspaceProfile() }))

// #2323.46 — le résumé qualité lit les positionnements du projet ; l'écran le MONTE vraiment (pas de doublure).
vi.mock('@/features/submissions/api', () => ({
  useSubmissions: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}))

const { NeedDetailPage } = await import('./NeedDetailPage')

const MATCH_RUN = {
  runId: '44444444-4444-4444-8444-444444444444',
  need: {
    needId: 'n-1',
    role: 'Ingénieur données',
    accountName: 'NOVA LOGISTIQUE',
    accountSector: null,
    projectSectors: [],
    skills: [{ term: 'airflow', label: 'Airflow', required: true, level: null }],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: null,
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: 'regie',
  },
  weights: {
    must_have: 25,
    nice_to_have: 8,
    seniority: 10,
    sector: 8,
    environment: 7,
    language: 5,
    location: 8,
    availability: 12,
    contract_status: 4,
    rate: 7,
    evidence_quality: 4,
    client_constraints: 2,
    risks: 5,
  },
  threshold: 60,
  evaluatedCount: 1,
  prefilteredCount: 0,
  truncated: false,
  recommended: [
    {
      consultantId: 'c-1',
      axes: [{ axis: 'must_have', score: 90, weight: 25, detail: 'Airflow prouvé', evidence: [] }],
      correspondenceScore: 90,
      pushableScore: 80,
      bucket: 'recommended',
      exclusions: [],
      skills: [],
      gaps: [],
      adjacency: [],
      questionsToValidate: [],
      flags: [],
    },
  ],
  borderline: [],
  notEvaluable: [],
  excluded: [],
  exclusionCounts: [],
  identities: [{ consultantId: 'c-1', fullName: 'Sophie M.', title: 'Data Engineer' }],
  nextBestMove: null,
  feedbackLearnings: [],
  createdAt: '2026-08-30T10:00:00.000Z',
}

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    urgency: 'haute',
    skills: [{ term: 'Airflow', required: true, level: null }],
    seniority: 'confirmé',
    headcount: 2,
    target_tjm_cents: 580_00,
    start_on: '2026-10-01T00:00:00.000Z',
    duration_months: 6,
    location: 'Lyon',
    contract_kind: 'regie',
    deadline_at: null,
    status: 'matching',
    status_reason: null,
    status_changed_at: '2026-08-20T09:00:00.000Z',
    source: 'client_email',
    provenance: 'human',
    owner_id: null,
    shortlist_count: 2,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Portail transporteurs',
    project_stage: 'qualified',
    account_id: 'a-1',
    account_name: 'NOVA LOGISTIQUE',
    entity_id: null,
    entity_name: 'DSI',
    ...over,
  } as unknown as OpenNeedRow
}

const LOADED = (row: OpenNeedRow) => ({
  need: row,
  isPending: false,
  isError: false,
  notFound: false,
  refetch: vi.fn(),
})

beforeEach(() => {
  navigate.mockClear()
  openLauraInPlace.mockClear()
  routeSearch = {}
  openNeed.mockReturnValue(LOADED(need()))
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(MATCH_RUN)
  prioritizeMutate.mockClear()
  workspaceProfile.mockReturnValue(null)
})

describe('#4270.3 — en espace forfait, le besoin se lit comme un projet à cadrer', () => {
  const framedNeed = () =>
    LOADED(need({ context: 'Refonte du SI paie', decision_maker_name: 'Claire Martin', budget_cents: 120_000_00 }))

  // RV4-E-FIX 4291.7 — sans profil forfait, le besoin se lit AUSSI comme un projet à cadrer (recette prod 20/10 :
  // besoin LVMH sans sponsor ni périmètre en tête), et chaque champ n'apparaît toujours qu'UNE fois.
  it('sans profil : la carte « Projet à cadrer » est là, sans doublon plus bas', () => {
    openNeed.mockReturnValue(framedNeed())
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('heading', { name: 'Projet à cadrer' })).toBeInTheDocument()
    expect(screen.getAllByText('Claire Martin')).toHaveLength(1)
    expect(screen.queryByText('Contexte et objectifs')).toBeNull()
  })

  it('sans profil : un besoin sans sponsor ni périmètre les nomme « à cadrer », rien d’inventé', () => {
    openNeed.mockReturnValue(LOADED(need({ context: null, decision_maker_name: null, budget_cents: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getAllByText(/à cadrer :/).length).toBeGreaterThanOrEqual(3)
  })

  it('en forfait : périmètre, sponsor, budget en tête, chacun UNE fois', () => {
    workspaceProfile.mockReturnValue('forfait_conseil')
    openNeed.mockReturnValue(framedNeed())
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('heading', { name: 'Projet à cadrer' })).toBeInTheDocument()
    expect(screen.getAllByText('Refonte du SI paie')).toHaveLength(1)
    expect(screen.getAllByText('Claire Martin')).toHaveLength(1)
    expect(screen.queryByText('Contexte et objectifs')).toBeNull()
    expect(screen.queryByText('Décideur')).toBeNull()
  })
})

describe('#4270.4 — un besoin gagné en espace forfait devient un projet suivi', () => {
  it('forfait + gagné : carte « Projet gagné », plus de bandeau staffing', async () => {
    workspaceProfile.mockReturnValue('forfait_conseil')
    openNeed.mockReturnValue(LOADED(need({ status: 'won' })))
    render(<NeedDetailPage needId="n-1" />)
    // Refonte Théo — le suivi du staffing vit sous « Profils ».
    await userEvent.click(screen.getByRole('button', { name: /^Profils/ }))
    expect(screen.getByRole('heading', { name: 'Projet gagné' })).toBeInTheDocument()
    expect(screen.queryByTestId('staffing-banner')).toBeNull()
  })

  it('régie (sans profil) + gagné : le bandeau staffing reste, inchangé', async () => {
    openNeed.mockReturnValue(LOADED(need({ status: 'won' })))
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Profils/ }))
    expect(screen.queryByRole('heading', { name: 'Projet gagné' })).toBeNull()
    expect(screen.getByTestId('staffing-banner')).toBeInTheDocument()
  })
})

describe('#2323.46 — le résumé qualité se lit sur la fiche', () => {
  it('dit « matchable, mais pas encore présentable » et nomme ce qui manque', () => {
    render(<NeedDetailPage needId="n-1" />)
    const card = screen.getByTestId('need-quality-summary')
    expect(card).toHaveTextContent(/matchable, mais pas encore présentable/i)
    expect(card).toHaveTextContent(/Il manque : .*le destinataire/i)
  })
})

describe('#4344.4 — la shortlist se lit sur la fiche du besoin', () => {
  it('l’onglet Profils monte la section shortlist du besoin', async () => {
    openNeed.mockReturnValue(LOADED(need()))
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Profils/ }))
    expect(screen.getByTestId('need-shortlist-section')).toBeInTheDocument()
  })
})

describe('la fiche MONTRE ce que la liste ne pouvait pas tenir', () => {
  // X66 / #3547 — le forfait encadré se lit sur la fiche du BESOIN (il se lisait
  // seulement à la mission) : mode + rôle tenu + équipe côté client, et rien sur un
  // besoin staffé.
  it('#3547 — un besoin au forfait encadré dit son mode, son rôle tenu et l’équipe côté client', () => {
    openNeed.mockReturnValue(
      LOADED(
        need({
          contract_kind: 'forfait',
          delivery_mode: 'supervised',
          supervision_role: 'framing',
          client_team_size: 8,
          client_team_names: ['Marie Dupont', 'Paul Martin'],
        }),
      ),
    )
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Forfait encadré · Cadrage')).toBeInTheDocument()
    expect(screen.getByText(/8 personnes · Marie Dupont, Paul Martin/)).toBeInTheDocument()
  })

  it('#3547 — une équipe non renseignée se dit « Non renseignée », jamais « 0 »', () => {
    openNeed.mockReturnValue(
      LOADED(need({ contract_kind: 'forfait', delivery_mode: 'supervised', supervision_role: null })),
    )
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Forfait encadré')).toBeInTheDocument()
    expect(screen.getByText('Non renseignée')).toBeInTheDocument()
  })

  it('#3547 — un besoin staffé n’affiche aucune ligne de forfait encadré', () => {
    openNeed.mockReturnValue(LOADED(need({ contract_kind: 'regie' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByText(/Forfait encadré/)).not.toBeInTheDocument()
  })

  it('monte le parcours de CE besoin (#1505)', () => {
    // Avec le bon sujet, pas seulement présent : un bloc juste que personne ne
    // nourrit rend un encart vide sur un écran quotidien.
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('chain-progress')).toHaveTextContent('need:n-1')
  })

  it('porte le rôle, le compte, l’entité et l’affaire', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('heading', { name: 'Ingénieur données' })).toBeInTheDocument()
    expect(screen.getByText(/NOVA LOGISTIQUE/)).toBeInTheDocument()
    expect(screen.getByText(/DSI/)).toBeInTheDocument()
    expect(screen.getByText(/Portail transporteurs/)).toBeInTheDocument()
  })

  it('#2446.17 — l’affaire est un LIEN vers son dossier : le parcours besoin → mission ne casse pas d’écran', () => {
    render(<NeedDetailPage needId="n-1" />)
    // Refonte Théo — le bandeau nomme l'affaire et « Ouvrir l'affaire » y mène.
    expect(screen.getByText(/Relié à l’affaire « Portail transporteurs »/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir l’affaire' })).toHaveAttribute('href', '/projects/$id')
  })

  it('#2446.17 — sans affaire rattachée, aucun lien (sait dire NON)', () => {
    openNeed.mockReturnValue(LOADED(need({ project_id: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByRole('link', { name: /Portail transporteurs/ })).not.toBeInTheDocument()
  })

  it('#2773 — un besoin sans affaire NI nom n’écrit aucune phrase « Sur l’affaire « » » (sait dire NON)', () => {
    openNeed.mockReturnValue(LOADED(need({ project_id: null, project_label: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByText(/Sur l.affaire/)).not.toBeInTheDocument()
  })

  it('#2773 / #4463 — la fiche annonce « Gratuit. » près du lancement du matching, sans parler de crédit', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-match-free-note')).toHaveTextContent('Gratuit.')
    expect(screen.getByTestId('need-match-free-note')).not.toHaveTextContent(/crédit/i)
  })

  it('#2916 / c93 — la fiche monte la ligne « matching lancé automatiquement » de CE besoin', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-auto-match-slot')).toHaveTextContent('n-1')
  })

  it('#2773 — un nom d’affaire vide ou blanc ne s’affiche pas non plus', () => {
    openNeed.mockReturnValue(LOADED(need({ project_label: '  ' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByText(/Sur l.affaire/)).not.toBeInTheDocument()
  })

  it('monte le bloc « tarif cible vs tarif vendu » du §4.2', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-rate-comparison')).toBeInTheDocument()
  })

  it('affiche le MOTIF de l’état — servi depuis toujours, affiché nulle part', () => {
    // C'est la seule chose qui permet de rouvrir un besoin en veille : sans
    // lui, rien ne dit ce qu'on attend ni de qui.
    openNeed.mockReturnValue(
      LOADED(need({ status: 'on_hold', status_reason: 'Budget gelé jusqu’à l’arbitrage de novembre.' })),
    )
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText(/Budget gelé jusqu’à l’arbitrage de novembre/)).toBeInTheDocument()
  })

  it('#3389.13 — affiche la REPRISE PRÉVUE d’une veille, et rien quand la date n’est pas posée', () => {
    openNeed.mockReturnValue(LOADED(need({ status: 'on_hold', status_reason: 'Budget gelé', resume_on: '2099-01-15' })))
    const { unmount } = render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Reprise prévue')).toBeInTheDocument()
    unmount()

    openNeed.mockReturnValue(LOADED(need({ status: 'on_hold', status_reason: 'Budget gelé', resume_on: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByText('Reprise prévue')).toBeNull()
  })

  it('offre les sept gestes sur CE besoin — le même menu que la liste', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-row-menu')).toBeInTheDocument()
  })

  it('« Prioriser » réutilise le geste `set_urgency` existant, en urgence haute', async () => {
    // La fixture par défaut porte déjà `urgency: 'haute'` — le bouton y est
    // désactivé, à dessein (voir le test suivant). Ici on part d'une urgence
    // NON haute pour observer le clic.
    openNeed.mockReturnValue(LOADED(need({ urgency: 'normale' })))
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Prioriser' }))
    expect(prioritizeMutate).toHaveBeenCalledWith(
      { kind: 'set_urgency', needIds: ['n-1'], urgency: 'haute' },
      expect.anything(),
    )
  })

  it('« Prioriser » est désactivé quand le besoin est déjà en urgence haute', () => {
    openNeed.mockReturnValue(LOADED(need({ urgency: 'haute' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('button', { name: 'Prioriser' })).toBeDisabled()
  })

  it('« Partager » est offert sur la fiche', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument()
  })

  it('ouvre la porte G3 quand la question n’a pas été posée', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('staffable-control')).toBeInTheDocument()
  })

  it('rend le VERDICT et son motif quand la question a été tranchée', () => {
    openNeed.mockReturnValue(LOADED(need({ staffable: 'no', staffable_reason: 'Pas de compétence Airflow interne.' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText(/Pas de compétence Airflow interne/)).toBeInTheDocument()
    // Le contrôle disparaît : reposer la question sur un verdict rendu ferait
    // croire qu'il n'a pas été enregistré.
    expect(screen.queryByTestId('staffable-control')).not.toBeInTheDocument()
  })
})

describe('#3348 — l’entête dit « périmé » comme Laura, d’après le MÊME verdict', () => {
  it('démarrage dépassé : badge « Périmé — à revérifier » à côté de l’état', () => {
    openNeed.mockReturnValue(LOADED(need({ start_on: '2020-01-01T00:00:00.000Z', status: 'matching' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-stale-badge')).toBeInTheDocument()
  })

  it('échéance dépassée : même badge', () => {
    openNeed.mockReturnValue(
      LOADED(need({ start_on: '2099-01-01T00:00:00.000Z', deadline_at: '2020-01-01T00:00:00.000Z' })),
    )
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-stale-badge')).toBeInTheDocument()
  })

  it('dates à venir : AUCUN badge (sait dire non)', () => {
    openNeed.mockReturnValue(LOADED(need({ start_on: '2099-01-01T00:00:00.000Z', deadline_at: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByTestId('need-stale-badge')).toBeNull()
  })
})

describe('la fiche n’écrit JAMAIS « 0 » à la place d’une absence', () => {
  it('dit chaque champ manquant plutôt que d’en inventer la valeur', () => {
    openNeed.mockReturnValue(
      LOADED(
        need({
          skills: [],
          seniority: null,
          target_tjm_cents: null,
          start_on: null,
          duration_months: null,
          location: null,
          deadline_at: null,
          status_changed_at: null,
          source: null,
          provenance: null,
          // #2175.8 / #2175.9 (lot W20) — deux absences de plus, même règle :
          // un responsable ou un interlocuteur non désignés ne sont pas « 0 »
          // ni un nom deviné, ils sont NON MESURÉS comme leurs dix voisins.
          owner_id: null,
          contact_name: null,
          // #2175.12 (lot W41) — une troisième absence de plus : aucun
          // objectif écrit sur l'affaire n'est pas « rien à dire », c'est
          // NON MESURÉ comme le contexte juste à côté.
          project_objective: null,
        }),
      ),
    )
    const { container } = render(<NeedDetailPage needId="n-1" />)
    const text = container.textContent ?? ''
    // ⚠️ LES ZÉROS D'ABORD. C'est la règle ; le comptage des « non mesuré » qui
    // suit n'en est que le corollaire, et il est plus GROSSIER — un seul champ
    // replié sur `?? 0` ferait passer le compte de dix à neuf, donc au ras du
    // seuil. Les vérifier dans cet ordre fait dire au test la bonne phrase.
    //
    // ⚠️ `[^0-9]` devant le zéro : sans lui, la garde mordrait sur le zéro final
    // de « 560 € » et refuserait du code juste.
    expect(text).not.toMatch(/(?:^|[^0-9])0\s*€/u)
    expect(text).not.toMatch(/(?:^|[^0-9])0\s*(?:j\b|mois)/u)
    // Dix absences, dix « non mesuré » — plus deux depuis #2175.8/#2175.9,
    // plus une depuis #2175.12 (résultat attendu).
    // ⚠️ Le libellé vient de `common.unknownValue`, en minuscules. Une garde
    // écrite sur « Non mesuré » resterait à zéro et ne dirait jamais pourquoi :
    // c'est le faux zéro silencieux, dans un test cette fois.
    expect(text.match(/non mesuré/g)?.length ?? 0).toBeGreaterThanOrEqual(12)
  })

  it('compte la shortlist à ZÉRO — c’est la seule vraie réponse nulle de l’écran', () => {
    // La requête a compté les positionnements, elle a trouvé personne. C'est
    // l'alerte du §16, pas une mesure manquante : elle ne passe donc PAS par
    // « non mesuré ».
    openNeed.mockReturnValue(LOADED(need({ shortlist_count: 0 })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('aucune')).toBeInTheDocument()
  })

  it('n’affiche pas de badge d’urgence quand personne ne l’a dite', () => {
    // Un « normale » par défaut ferait passer pour un arbitrage ce qui n'est
    // qu'une absence de réponse.
    openNeed.mockReturnValue(LOADED(need({ urgency: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByText('Normale')).not.toBeInTheDocument()
  })

  it('ne range PAS une origine absente dans « saisi à la main »', () => {
    // Une provenance inventée se relit six mois plus tard comme un fait.
    openNeed.mockReturnValue(LOADED(need({ source: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByText('Saisi à la main')).not.toBeInTheDocument()
  })
})

/**
 * #2175.12 (lot W41, registre 16/09) — « RÉSULTAT ATTENDU », dans la
 * Synthèse. Relit `project_objective` (= `ProjectRow.objective`, joint côté
 * API sans second calcul, GA-26) — jamais deviné dans `context`.
 */
describe('#2175.12 — le résultat attendu, à côté du contexte', () => {
  it('affiche l’objectif écrit sur l’affaire', () => {
    openNeed.mockReturnValue(LOADED(need({ project_objective: 'Uniformiser les temps de réponse client' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Uniformiser les temps de réponse client')).toBeInTheDocument()
  })

  it('dit « non mesuré » plutôt que de deviner dans le contexte, quand aucun objectif n’est écrit', () => {
    openNeed.mockReturnValue(LOADED(need({ project_objective: null, context: 'Le client migre son ERP.' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Le client migre son ERP.')).toBeInTheDocument()
    // Le libellé visible reste « non mesuré » (`common.unknownValue`) ; la
    // RAISON, elle, vit dans le `title` (`UnknownValue.tsx`) — jamais devinée
    // à partir du contexte ci-dessus.
    expect(screen.getByTitle(/Aucun objectif n’a été écrit sur cette affaire/)).toBeInTheDocument()
  })
})

/**
 * #2175.8 / #2175.9 (lot W20, registre 16/09) — L'INTERLOCUTEUR ET LE
 * RESPONSABLE, dans « Le suivi ». Les deux existaient déjà ailleurs
 * (`contact_id`/`contact_name` sur `OpenNeedRow` depuis ce même lot,
 * `owner_id` déjà lu par la LISTE des besoins ouverts) — la FICHE, elle, ne
 * les nommait pas.
 */
describe('l’owner et l’interlocuteur, dans « Le suivi »', () => {
  it('nomme le responsable résolu', () => {
    openNeed.mockReturnValue(LOADED(need({ owner_id: 'u-1' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  })

  it('nomme l’interlocuteur', () => {
    openNeed.mockReturnValue(LOADED(need({ contact_id: 'c-1', contact_name: 'Camille Petit' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText('Camille Petit')).toBeInTheDocument()
  })
})

describe('trois vides, trois phrases', () => {
  it('« ça charge » ne dit rien d’autre', () => {
    openNeed.mockReturnValue({ need: undefined, isPending: true, isError: false, notFound: false, refetch: vi.fn() })
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText(/Je charge ce besoin/)).toBeInTheDocument()
  })

  it('« je n’ai pas pu lire » propose de RÉESSAYER', () => {
    const refetch = vi.fn()
    openNeed.mockReturnValue({ need: undefined, isPending: false, isError: true, notFound: false, refetch })
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText(/La lecture a échoué/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('« ce besoin n’existe pas ici » ne propose PAS de réessayer', () => {
    // Recharger une page qui ne changera jamais est le geste qu'on regrette :
    // ces deux vides appellent des gestes opposés.
    openNeed.mockReturnValue({ need: undefined, isPending: false, isError: false, notFound: true, refetch: vi.fn() })
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByText(/n’existe pas dans cet espace/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    // Mais le retour à la liste est offert dans les trois cas.
    expect(screen.getByRole('link', { name: /Retour aux besoins/ })).toHaveAttribute('href', '/projects/needs')
  })
})

describe('la troisième porte, sur la fiche aussi', () => {
  it('s’offre quand personne n’est positionné, et ouvre le formulaire EN PLACE', async () => {
    openNeed.mockReturnValue(LOADED(need({ shortlist_count: 0 })))
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer un consultant/ }))
    expect(screen.getByTestId('door-open')).toHaveTextContent('Ingénieur données')
    // ⚠️ La règle de la source : rien ne navigue.
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ne s’offre PAS sur un besoin qui porte déjà des profils', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByRole('button', { name: /Enregistrer un consultant/ })).not.toBeInTheDocument()
  })

  it('« Trouver des profils » lance le rapprochement de CE besoin SUR PLACE, sans quitter la fiche', async () => {
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(
      within(screen.getByTestId('page-actions')).getByRole('button', { name: 'Trouver des profils' }),
    )
    expect(await screen.findByText('Sophie M.')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('désactive le rapprochement sur un besoin sans compétence, et DIT pourquoi', () => {
    // Un bouton actif qui rend une liste vide est pire qu'un bouton désactivé
    // qui dit pourquoi : le premier fait croire que le vivier ne contient
    // personne d'utile.
    openNeed.mockReturnValue(LOADED(need({ skills: [] })))
    render(<NeedDetailPage needId="n-1" />)
    const button = within(screen.getByTestId('page-actions')).getByRole('button', { name: 'Trouver des profils' })
    expect(button).toBeDisabled()
    expect(button.getAttribute('title')).toMatch(/compétence/)
  })
})

describe('« un besoin sans candidat ouvre une piste »', () => {
  it('se monte, avec CE besoin, quand personne n’est présenté', async () => {
    // Le MÊME signal que la troisième porte — l'alerte du §16.
    openNeed.mockReturnValue(LOADED(need({ shortlist_count: 0 })))
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Profils' }))
    expect(screen.getByTestId('reverse-prospects')).toHaveTextContent('n-1')
  })

  it('ne se monte PAS quand des profils sont déjà sur la table', () => {
    // La fixture par défaut porte `shortlist_count: 2` : rien à ouvrir ici.
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByTestId('reverse-prospects')).not.toBeInTheDocument()
  })
})

describe('#2818 — « chercher hors vivier »', () => {
  it('se monte, avec CE besoin, quand personne n’est présenté', async () => {
    openNeed.mockReturnValue(LOADED(need({ shortlist_count: 0 })))
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Profils' }))
    expect(screen.getByTestId('external-sourcing')).toHaveTextContent('n-1')
  })

  it('ne se monte PAS quand des profils sont déjà sur la table', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByTestId('external-sourcing')).not.toBeInTheDocument()
  })
})

describe('#2175.1 — quatre familles visibles, panneaux MONTÉS, pas réécrits', () => {
  it('ouvre sur « Synthèse », et propose les trois autres familles sans y naviguer', () => {
    render(<NeedDetailPage needId="n-1" />)
    // Le contenu d'aujourd'hui reste visible sans cliquer nulle part — c'est
    // la famille par défaut qu'un lien entrant doit continuer de voir.
    expect(screen.getByText(/NOVA LOGISTIQUE/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Synthèse' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Profils/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avancement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument()
    // Les six anciens noms d'onglet ne sont plus des boutons de premier niveau.
    expect(screen.queryByRole('button', { name: 'Rapprochement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Historique' })).not.toBeInTheDocument()
  })

  it('la « Synthèse » monte les étapes cochables ; « Profils », le bandeau Staffing et la carte Laura', async () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('steps-card')).toHaveTextContent('n-1')
    expect(screen.queryByTestId('staffing-banner')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^Profils/ }))
    expect(screen.getByTestId('staffing-banner')).toHaveTextContent('n-1')
    expect(screen.getByTestId('recommendation-card')).toHaveTextContent('n-1')
  })

  it('« Documents » et « Avancement » : deux vrais onglets, jamais empilés — l’historique vit sous Avancement', async () => {
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(screen.getByTestId('documents-tab')).toHaveTextContent('n-1')
    expect(screen.queryByTestId('history-tab')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Avancement' }))
    expect(screen.getByTestId('history-tab')).toHaveTextContent('n-1')
    expect(screen.queryByTestId('documents-tab')).toBeNull()
  })

  it('LE TEST QUI COMPTE : « Profils & positionnements » montre le MÊME contenu de rapprochement que le tiroir de la liste, sans naviguer', async () => {
    // Un besoin qui « a un rapprochement en cours » — la fixture par défaut
    // porte déjà `shortlist_count: 2`.
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Profils/ }))
    expect(screen.getByTestId('positioning-tab')).toHaveTextContent('n-1')
    await userEvent.click(
      within(screen.getByTestId('need-profiles-panel')).getByRole('button', { name: 'Trouver des profils' }),
    )
    // Le MÊME classement que `MatchDrawer.test.tsx` garde pour le tiroir de la
    // liste : le bloc « Recommandés », le profil nommé — puis, dans le sous-onglet
    // « Positionnements », ceux de CE besoin (jamais empilés avec le rapprochement).
    expect(await screen.findByText(/Recommandés \(1\)/)).toBeInTheDocument()
    expect(await screen.findByText('Sophie M.')).toBeInTheDocument()
    expect(screen.queryByTestId('positioning-tab')).toBeNull()
    // ⚠️ La règle de la source : rien ne navigue.
    expect(navigate).not.toHaveBeenCalled()
  })

  it('« Profils & positionnements » dit pourquoi sur un besoin sans compétence, sans interroger le moteur', async () => {
    openNeed.mockReturnValue(LOADED(need({ skills: [] })))
    // `?tab=matching` ouvre le rapprochement même quand le bouton est désactivé : il dit pourquoi.
    routeSearch = { tab: 'matching' }
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    expect(await screen.findByText(/n'a pas de compétence renseignée/)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('« Avancement » monte le fil du PROJET porteur, et le dit', async () => {
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Avancement' }))
    // `project_id` de la fixture par défaut : `p-1`.
    expect(screen.getByTestId('activity-tab')).toHaveTextContent('project:p-1')
    // Le nom de l'affaire apparaît à la fois dans l'en-tête (toujours visible)
    // et dans le rappel de périmètre de cet onglet — d'où `getAllByText`.
    expect(screen.getAllByText(/Portail transporteurs/).length).toBeGreaterThanOrEqual(2)
  })
})

describe('#2175.2-.6, .41 — les cinq deep links historiques ouvrent directement la bonne famille', () => {
  it('« ?tab=matching » ouvre « Profils » sur le sous-onglet Rapprochement sans clic', async () => {
    routeSearch = { tab: 'matching' }
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    expect(await screen.findByText('Sophie M.')).toBeInTheDocument()
    expect(screen.queryByTestId('positioning-tab')).toBeNull()
  })

  it('« ?tab=positioning » ouvre « Profils » sur le sous-onglet Positionnements sans clic', () => {
    routeSearch = { tab: 'positioning' }
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('positioning-tab')).toHaveTextContent('n-1')
  })

  it('« ?tab=activity » ouvre « Avancement » sans clic', () => {
    routeSearch = { tab: 'activity' }
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('activity-tab')).toHaveTextContent('project:p-1')
  })

  it('« ?tab=documents » ouvre « Documents & historique » sur Documents sans clic', () => {
    routeSearch = { tab: 'documents' }
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('documents-tab')).toHaveTextContent('n-1')
    expect(screen.queryByTestId('history-tab')).toBeNull()
  })

  it('« ?tab=history » ouvre « Avancement », où vit l’historique, sans clic', () => {
    routeSearch = { tab: 'history' }
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('history-tab')).toHaveTextContent('n-1')
  })

  it('sans `?tab=` (lien nu), la famille par défaut reste Synthèse', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('steps-card')).toHaveTextContent('n-1')
  })
})

describe('#3348 — une seule phase sur la fiche', () => {
  it('statut « Matching à lancer » dépassé par le parcours : le badge dit l’étape du parcours, une seule fois', () => {
    openNeed.mockReturnValue(LOADED(need({ status: 'to_match' })))
    chainEntries.mockReturnValue([
      {
        chain: {
          key: 'sourcing_matching',
          steps: [
            { position: 3, label: { fr: 'Matching lancé', en: 'Matching run' }, outsideTool: false },
            { position: 4, label: { fr: 'Profils retenus', en: 'Profiles retained' }, outsideTool: false },
          ],
        },
        projection: { derivation: { kind: 'at', position: 4 } },
      },
    ])
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-phase-badge')).toHaveTextContent('Profils retenus')
    expect(screen.queryAllByText('Matching à lancer')).toHaveLength(0)
  })

  it('sans parcours contredisant : le statut déclaré s’affiche UNE fois (plus de doublon « Suivi »)', () => {
    openNeed.mockReturnValue(LOADED(need({ status: 'to_match' })))
    chainEntries.mockReturnValue(undefined)
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryAllByText('Matching à lancer')).toHaveLength(1)
  })
})

// Théo C projects-besoin-fiche (22/10, HT-8) — la fiche dans la grammaire de la fiche affaire.
describe('Théo C projects-besoin-fiche — l’en-tête de la fiche affaire', () => {
  it('R1 — « Besoin · compte · porté par » sous le titre', () => {
    openNeed.mockReturnValue(LOADED(need({ owner_id: 'u-1' })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent('Besoin · NOVA LOGISTIQUE · porté par Alice Martin')
  })

  it('R1 — SAIT DIRE NON : sans porteur, aucun « porté par » inventé', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('page-subtitle')).not.toHaveTextContent('porté par')
  })

  it('R2 — la ligne d’état : statut affiché · postes · démarrage envisagé', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('need-status-line')).toHaveTextContent('Ouvert · 2 postes · démarrage envisagé le')
  })

  it('R3 — « Relié à l’affaire » mène à l’affaire par « Ouvrir l’affaire » ; sans affaire, rien', () => {
    const { unmount } = render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('link', { name: 'Ouvrir l’affaire' })).toHaveAttribute('href', '/projects/$id')
    unmount()
    openNeed.mockReturnValue(LOADED(need({ project_id: null, project_label: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByRole('link', { name: 'Ouvrir l’affaire' })).not.toBeInTheDocument()
  })

  it('R4 — l’onglet Profils porte son compte ; un besoin sans profil n’écrit pas « (0) »', () => {
    const { unmount } = render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('button', { name: 'Profils (2)' })).toBeInTheDocument()
    unmount()
    openNeed.mockReturnValue(LOADED(need({ shortlist_count: 0 })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByRole('button', { name: /Profils \(0\)/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Profils' })).toBeInTheDocument()
  })

  it('N1 — la synthèse en 7 questions de l’affaire est en tête de Synthèse ; sans affaire, absente', () => {
    const { unmount } = render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByTestId('synthesis-7q')).toHaveTextContent('p-1')
    unmount()
    openNeed.mockReturnValue(LOADED(need({ project_id: null, project_label: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByTestId('synthesis-7q')).not.toBeInTheDocument()
  })

  it('N2 — la page d’origine du besoin est un lien visible sous l’en-tête ; sans URL, aucun lien', () => {
    openNeed.mockReturnValue(LOADED(need({ source_url: 'https://careers.airbus.com/offre/1' })))
    const { unmount } = render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('link', { name: 'Ouvrir la source : careers.airbus.com' })).toHaveAttribute(
      'href',
      'https://careers.airbus.com/offre/1',
    )
    unmount()
    openNeed.mockReturnValue(LOADED(need({ source_url: null })))
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByRole('link', { name: /Ouvrir la source/ })).not.toBeInTheDocument()
  })

  it('N3 — « La proposition commerciale » vit sur l’affaire : « Préparer la proposition » y mène', async () => {
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Documents/ }))
    expect(screen.getByRole('link', { name: 'Préparer la proposition' })).toHaveAttribute('href', '/projects/$id')
  })
})

// Refonte Théo (23/10) — la fiche posée à côté de la maquette `c/projects-besoin-fiche` : même ordre, mêmes blocs.
describe('Théo C projects-besoin-fiche — la structure de la maquette', () => {
  const blocks = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[data-theo-block]')).map(node => node.getAttribute('data-theo-block'))

  it('l’en-tête de la fiche : titre, « Besoin · compte », puis Trouver des profils · Avec Laura · Partager', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Ingénieur données' })).toBeInTheDocument()
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent('Besoin · NOVA LOGISTIQUE')
    const actions = Array.from(screen.getByTestId('page-actions').querySelectorAll('button, a')).map(
      node => node.textContent?.trim() ?? '',
    )
    expect(actions.slice(0, 3)).toEqual(['Trouver des profils', 'Avec Laura', 'Partager'])
  })

  it('le haut de page dans l’ordre : bandeau d’état, onglets, puis les trois panneaux de Synthèse', () => {
    const { container } = render(<NeedDetailPage needId="n-1" />)
    expect(blocks(container)).toEqual(['status-banner', 'tabs', 'synthesis', 'need', 'actions', 'decide'])
  })

  it('les quatre onglets de la maquette : Synthèse · Profils (n) · Avancement · Documents', () => {
    render(<NeedDetailPage needId="n-1" />)
    const tabs = within(screen.getByTestId('need-tabs'))
      .getAllByRole('button')
      .map(node => node.textContent)
    expect(tabs).toEqual(['Synthèse', 'Profils (2)', 'Avancement', 'Documents'])
  })

  it('« Le besoin » : faits clés puis compétences indispensables et compléments souhaités', () => {
    openNeed.mockReturnValue(
      LOADED(
        need({
          skills: [
            { term: 'SAP S/4HANA', required: true, level: null },
            { term: 'Anglais', required: false, level: null },
          ],
        }),
      ),
    )
    render(<NeedDetailPage needId="n-1" />)
    const panel = screen.getByTestId('need-panel')
    expect(within(panel).getByRole('heading', { name: 'Le besoin' })).toBeInTheDocument()
    expect(within(panel).getByText('Démarrage envisagé')).toBeInTheDocument()
    expect(within(panel).getByText('Lieu / présence')).toBeInTheDocument()
    expect(within(panel).getByText('TJM vente cible')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'Compétences indispensables' })).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'Compléments souhaités' })).toBeInTheDocument()
    expect(within(panel).getByText('SAP S/4HANA')).toBeInTheDocument()
    expect(within(panel).getByText('Anglais')).toBeInTheDocument()
  })

  it('« Compléments souhaités » ne fait aucune ligne quand aucune compétence souhaitée n’est déclarée', () => {
    render(<NeedDetailPage needId="n-1" />)
    expect(screen.queryByRole('heading', { name: 'Compléments souhaités' })).not.toBeInTheDocument()
  })

  it('« Avec Laura » ouvre la bulle sur place, question préparée, jamais envoyée', async () => {
    render(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Avec Laura' }))
    expect(openLauraInPlace).toHaveBeenCalledWith(expect.stringContaining('Ingénieur données'))
  })

  it('« Profils » : le tableau des positionnés, puis « Trouver des profils » ouvre le rapprochement sur place', async () => {
    renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Profils/ }))
    expect(screen.getByTestId('positioning-tab')).toHaveTextContent('n-1')
    expect(screen.getByTestId('staffing-banner')).toHaveTextContent('n-1')
    await userEvent.click(
      within(screen.getByTestId('need-profiles-panel')).getByRole('button', { name: 'Trouver des profils' }),
    )
    expect(await screen.findByText('Sophie M.')).toBeInTheDocument()
    expect(screen.queryByTestId('positioning-tab')).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('« Avancement » : l’avancement du besoin, avant la mission et doublons, puis le fil de l’affaire', async () => {
    const { container } = renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Avancement' }))
    expect(screen.getByRole('heading', { name: 'Avancement du besoin' })).toBeInTheDocument()
    expect(blocks(container).slice(2)).toEqual(['progress', 'before-mission', 'project-thread'])
    expect(screen.getByTestId('history-tab')).toHaveTextContent('n-1')
    expect(screen.getByTestId('activity-tab')).toHaveTextContent('project:p-1')
  })

  it('« Documents » : les documents du besoin, puis la proposition commerciale', async () => {
    const { container } = renderWithQuery(<NeedDetailPage needId="n-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(screen.getByRole('heading', { name: 'Documents du besoin' })).toBeInTheDocument()
    expect(blocks(container).slice(2)).toEqual(['documents', 'proposal'])
  })
})

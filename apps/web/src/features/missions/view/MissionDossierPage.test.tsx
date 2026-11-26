import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'
import { resetLauraPageContext, useCurrentLauraContext } from '@/features/laura/bubble/page-context-store'

// LE PARCOURS DE CE DOSSIER (#1505) — même règle que les blocs voisins : il a
// sa propre suite (`ChainProgressBlock.test.tsx`) et il LIT une requête. Ici on
// garde seulement qu'il est MONTÉ, avec le bon sujet — un bloc juste que
// personne ne nourrit est le défaut n°1 de ce dépôt.
vi.mock('./MissionLifecycleActions', () => ({
  MissionLifecycleActions: () => null,
  MissionLifecycleDialog: ({ kind }: { kind: string }) => <div data-testid={`lifecycle-${kind}`} />,
  canRunLifecycle: () => true,
}))
// Les fenêtres du dossier ont leurs propres tests : ici on mesure qu'une porte les OUVRE sur la bonne mission.
vi.mock('./MissionPointClientDialog', () => ({
  MissionPointClientDialog: ({ mission }: { mission: { label: string } }) => (
    <div data-testid="point-client">{mission.label}</div>
  ),
}))
vi.mock('@/features/projects/open-needs/view/CreateNeedDialog', () => ({
  CreateNeedDialog: ({ initialTitle, initialAccountId }: { initialTitle?: string; initialAccountId?: string }) => (
    <div data-testid="relief">{`${initialTitle}|${initialAccountId}`}</div>
  ),
}))
vi.mock('./CreateMissionActionButton', () => ({
  CreateMissionActionButton: () => <button type="button">Créer une action</button>,
}))
// #4198 (L7) — la zone « Objets liés » lit une requête : sans ce double, ce fichier devrait porter un QueryClientProvider.
vi.mock('@/features/records/useRecordLinks', () => ({ useRecordLinks: () => ({ data: undefined }) }))
vi.mock('@/components/access/PrivateSwitch', () => ({ PrivateSwitch: () => null }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({
  ChainProgressBlock: ({ subjectType, subjectId }: { subjectType: string; subjectId: string }) => (
    <div data-testid="chain-progress">{`${subjectType}:${subjectId}`}</div>
  ),
}))

// LA CHAÎNE DE LIVRAISON (#2199) — même règle que le bloc de parcours
// au-dessus : elle a sa propre suite (`MissionChainStrip.test.tsx`) et elle LIT
// une requête. Ici on garde seulement qu'elle est MONTÉE, avec la bonne
// mission — un bloc juste que personne ne nourrit est le défaut n°1 du dépôt.
vi.mock('../chain/view/MissionChainStrip', () => ({
  MissionChainStrip: ({ mission }: { mission: { id: string } }) => <div data-testid="mission-chain">{mission.id}</div>,
}))

// #2338 / #2409 — le panneau de démarrage a sa propre suite
// (`MissionStartBlockers.test.tsx`, `MissionStartReadinessPanel.test.tsx`) ; ici on garde qu'il est MONTÉ, sur
// CETTE mission et avec SON statut.
vi.mock('./MissionMeetingPrepCard', () => ({
  MissionMeetingPrepCard: ({ accountId }: { accountId: string }) => (
    <div data-testid="meeting-prep-card">{accountId}</div>
  ),
}))
vi.mock('./MissionStartBlockers', () => ({
  MissionStartBlockers: ({ missionId, status }: { missionId: string; status: string }) => (
    <div data-testid="start-readiness">{`${missionId}:${status}`}</div>
  ),
}))

// #2414 (LAU-FINAL-128) / épopée #2986 — même règle que le panneau de
// démarrage juste au-dessus : sa propre suite (`MissionEndChecklistPanel.test.tsx`)
// couvre son comportement, ici on garde qu'il est MONTÉ, sur CETTE mission.
vi.mock('./MissionEndChecklistPanel', () => ({
  MissionEndChecklistPanel: ({ missionId, status }: { missionId: string; status: string }) => (
    <div data-testid="end-checklist">{`${missionId}:${status}`}</div>
  ),
}))

// #3269 (BEL-SC-240) / #3291 (reste) — même règle : sa propre suite
// (`MissionDeliveryMilestonesPanel.test.tsx`) couvre son comportement, ici on
// garde qu'il est MONTÉ, sur CETTE mission.
vi.mock('./MissionDeliveryMilestonesPanel', () => ({
  MissionDeliveryMilestonesPanel: ({ missionId }: { missionId: string }) => (
    <div data-testid="delivery-milestones">{missionId}</div>
  ),
}))

// #2414.54-59 (NO-GO) — même règle : sa propre suite
// (`MissionInterruptionPanel.test.tsx`) couvre son comportement, ici on garde
// qu'il est MONTÉ, sur CETTE mission.
vi.mock('./MissionInterruptionPanel', () => ({
  MissionInterruptionPanel: ({ missionId, status }: { missionId: string; status: string }) => (
    <div data-testid="interruption-panel">{`${missionId}:${status}`}</div>
  ),
}))

// #2953 (#2193.53, .57) — même règle que les quatre panneaux ci-dessus : sa
// propre suite (`MissionPrimaryActionBanner.test.tsx`) couvre le calcul, ici
// on garde qu'elle est MONTÉE, sur CETTE mission. Sans ce double, ce fichier
// devrait aussi fournir `useMissionStartReadiness`/`useMissionEndChecklist`/
// `useMissionInterruption` dans le double de `'../api'` juste plus bas — une
// capacité que ces tests ne regardent pas.
vi.mock('./MissionPrimaryActionBanner', () => ({
  MissionPrimaryActionBanner: ({ mission }: { mission: { id: string } }) => (
    <div data-testid="primary-action-banner">{mission.id}</div>
  ),
}))

const useMission = vi.fn()
const assignments = vi.fn()
const terms = vi.fn()
const scores = vi.fn()
const setTerms = vi.fn()
const fieldSources = vi.fn()

// La section d'avis lit le rôle via `useTeam` (session + requête) : sans équipe,
// elle rend l'information sans le bouton — ce que ces tests n'observent pas.
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: undefined }) }))
vi.mock('../api', () => ({
  // #2195 — les fenêtres de renouvellement sont arrivées par un AUTRE lot de la
  // même vague : ce fichier ne les teste pas, mais `OverviewTab` les consomme.
  // Un `vi.mock` remplace TOUT le module : un double incomplet fait échouer le
  // rendu entier avec « No export is defined on the mock », un rouge qui n'a
  // rien à voir avec ce qu'on mesure ici.
  useRenewalWindows: () => ({ data: undefined, isLoading: false, isError: false }),
  // L'avis de fin de mission (MissionFeedback) vit dans l'onglet d'ensemble.
  useMissionFeedback: () => ({ data: undefined, isLoading: false, isError: false }),
  useSubmitMissionFeedback: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMission: () => useMission(),
  useMissionAssignments: () => assignments(),
  useMissionTerms: () => terms(),
  useMissionScores: () => scores(),
  useSetMissionTerms: () => setTerms(),
  // #2407.3 — la provenance des champs principaux, MÊME règle que les autres
  // doubles de ce bloc : un double incomplet ferait échouer tout le rendu.
  useMissionFieldSources: () => fieldSources(),
  // #2953 — le HERO lit les affectations par cette fonction PURE, jamais le
  // champ brut (voir son docblock dans `../api`) : un double qui l'omettrait
  // ferait échouer tout le rendu, même règle que les autres doubles ci-dessus.
  assigneesOf: (mission: { assignees?: (string | { id: string | null; fullName: string })[] | null }) =>
    (mission.assignees ?? []).map(person =>
      typeof person === 'string' ? { id: null, fullName: person, photoUrl: null, loadPercent: null } : person,
    ),
  // #2193.54 — `missionEntryContext` (importé PAR ce dossier) lit `../api` lui
  // aussi : un double qui l'omettrait ferait échouer tout le rendu, exactement
  // comme `assigneesOf` au-dessus.
  assigneeNames: (mission: { assignees?: (string | { fullName: string })[] | null }) =>
    (mission.assignees ?? []).map(person => (typeof person === 'string' ? person : person.fullName)),
}))
// #2953 (#2193.17/.18) — `MissionObjectivePerimeterFields` (dans l'onglet
// Synthèse) lit `useUpdateMission`, qui a sa PROPRE lecture react-query
// (`useQueryClient`) : même raison exacte que `NotesPanel` juste en dessous —
// sans ce double, ce fichier devrait porter un `QueryClientProvider` pour une
// capacité qu'aucun de ses tests ne regarde (sa propre suite,
// `MissionDetailTabs.test.tsx`, la couvre).
// #3413 — la ligne « BU propriétaire » a ses propres tests (`MissionBusinessUnitLine.test.tsx`) ;
// ici on ne monte pas ses requêtes.
vi.mock('./MissionBusinessUnitLine', () => ({ MissionBusinessUnitLine: () => <span>bu</span> }))
vi.mock('./mission-panel.api', () => ({ useUpdateMission: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/activities/view/TimelinePanel', () => ({ TimelinePanel: () => <div>timeline</div> }))
// #2953 — le Suivi (`MissionTrackingSection`, dans l'onglet Synthèse) monte
// `NotesPanel`, qui a sa PROPRE lecture react-query (`useNotes`) : sans ce
// double, ce fichier devrait porter un `QueryClientProvider` pour une
// capacité qu'aucun de ses tests ne regarde — même raison que
// `useConnectedCapabilities` dans `MissionDetailTabs.test.tsx`.
vi.mock('@/features/crm-core/view/NotesPanel', () => ({ NotesPanel: () => <div>notes</div> }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: undefined }) }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// ⚠️ Le faux `Link` interpole `params`, ajoute `search` et garde les
// attributs qu'on lui passe : un faux qui les jette teste le mock et non le
// composant.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    let href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    if (search) href += `?${new URLSearchParams(search).toString()}`
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))

const { MissionDossierPage } = await import('./MissionDossierPage')

const ID = '11111111-1111-4111-8111-111111111111'

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: ID,
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active',
    started_on: '2026-02-01',
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    accountName: 'ACME',
    renewal: 'unknown',
    risks: [],
    marginPercent: null,
    assignees: [],
    ...over,
  }
}

function found(over: Partial<MissionView> = {}) {
  useMission.mockReturnValue({
    mission: mission(over),
    canReadFinance: true,
    isPending: false,
    isError: false,
    notFound: false,
    refetch: vi.fn(),
  })
}

beforeEach(() => {
  cleanup()
  useMission.mockReset()
  assignments.mockReset().mockReturnValue({ data: [], isError: false })
  terms.mockReset().mockReturnValue({ data: { canReadFinance: true, terms: null, margin: null }, isError: false })
  scores.mockReset().mockReturnValue({ data: undefined, isLoading: false, isError: false })
  setTerms.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  fieldSources.mockReset().mockReturnValue({ data: undefined })
  resetLauraPageContext()
})

afterEach(() => {
  resetLauraPageContext()
})

/** Lit ce que le dossier a PUBLIÉ à la bulle de Laura — même patron que
 *  `page-context-store.test.tsx`. */
function LauraContextReader() {
  const context = useCurrentLauraContext()
  return <span data-testid="laura-context">{context ? JSON.stringify(context) : 'rien'}</span>
}

/**
 * LE DOSSIER D'UNE MISSION — l'adresse qui manquait (D200, 30/08/2026).
 *
 * La mission avait six routes, toutes des LISTES. Le contenu existait déjà —
 * cinq onglets, quatre routes d'API — mais uniquement dans un tiroir, donc dans
 * la mémoire d'un écran : elle ne pouvait être ni partagée par lien, ni ouverte
 * dans un onglet, ni mentionnée ailleurs.
 */
describe('MissionDossierPage — le dossier d’une mission', () => {
  it('monte le parcours de CETTE mission (#1505)', () => {
    // Le bloc est monté avec le bon sujet, pas seulement présent : c'est la
    // moitié qui manque le plus souvent — un composant juste que personne ne
    // nourrit rend un encart vide sur un écran quotidien.
    found()
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByTestId('chain-progress')).toHaveTextContent(`mission:${ID}`)
  })

  it('Théo C missions-dossier — « Ce qui bloque le démarrage » ouvre la Synthèse, avant l’identité, et la frise de cycle est là', () => {
    found({ status: 'onboarding' })
    render(<MissionDossierPage missionId={ID} />)
    // Théo missions-dossier (point 5 de ses notes) — les prérequis de démarrage sont REPLIÉS dans « Cadre de la
    // mission », la carte qui suit l'identité : ils ne passent plus devant elle.
    const blockers = screen.getByTestId('start-readiness')
    const identity = screen.getByLabelText('Identité de la mission')
    expect(identity.compareDocumentPosition(blockers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('Cadre de la mission')).toContainElement(blockers)
    expect(screen.getByRole('navigation', { name: 'Cycle de vie de la mission' })).toBeInTheDocument()
  })

  it('#2338 / #2409 — monte le panneau de démarrage sur CETTE mission, avec son statut', () => {
    found({ status: 'onboarding' })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByTestId('start-readiness')).toHaveTextContent(`${ID}:onboarding`)
  })

  it('#2414 (LAU-FINAL-128) / épopée #2986 — monte la checklist de sortie sur CETTE mission, avec son statut', () => {
    found({ status: 'ending' })
    render(<MissionDossierPage missionId={ID} />)
    // Théo missions-dossier — la checklist de sortie vit dans « Équipe & suite », l'onglet qui parle de la suite.
    expect(screen.queryByTestId('end-checklist')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & suite' }))
    expect(screen.getByTestId('end-checklist')).toHaveTextContent(`${ID}:ending`)
  })

  it('#2414.54-59 — monte le panneau d’interruption sur CETTE mission, avec son statut', () => {
    found({ status: 'terminated' })
    render(<MissionDossierPage missionId={ID} />)
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & suite' }))
    expect(screen.getByTestId('interruption-panel')).toHaveTextContent(`${ID}:terminated`)
  })

  it('monte la chaîne de livraison de CETTE mission (#2199.17)', () => {
    // Même moitié manquante : les cinq écrans de la chaîne existaient déjà, et
    // rien ne les reliait. Une bande montée sur une AUTRE mission serait pire
    // qu'une bande absente — elle enverrait réparer le mauvais dossier.
    found()
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByTestId('mission-chain')).toHaveTextContent(ID)
  })

  it('rend LES MÊMES cinq onglets que le tiroir — un seul composant, pas deux', () => {
    found()
    render(<MissionDossierPage missionId={ID} />)
    for (const label of [
      'Synthèse',
      'Équipe & suite',
      'Conditions & finance',
      'Points d’attention',
      'Documents & suivi',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('nomme la mission et son compte porteur en entête', () => {
    found({ label: 'TMA socle data', accountName: 'Groupe Aurore' })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByRole('heading', { name: 'TMA socle data' })).toBeInTheDocument()
    expect(screen.getByText('Groupe Aurore')).toBeInTheDocument()
  })

  it('ouvre le staffing sans quitter le dossier — les onglets sont ceux du tiroir', async () => {
    found()
    assignments.mockReturnValue({ data: [{ id: 'a1', consultantName: 'Salomé Dufour', loadPercent: 100 }] })
    render(<MissionDossierPage missionId={ID} />)
    await userEvent.click(screen.getByRole('button', { name: /équipe & suite/i }))
    expect(screen.getByText(/Salomé Dufour/)).toBeInTheDocument()
  })

  /**
   * ⚠️ TROIS ÉTATS, PAS DEUX. « Je n'ai pas pu lire » envoie réessayer ; « cette
   * mission n'est pas ici » envoie chercher ailleurs. Les confondre ferait
   * recharger une page qui ne changera jamais, ou abandonner une lecture qui
   * aurait marché au second essai.
   */
  it('attend sans rien affirmer pendant la lecture', () => {
    useMission.mockReturnValue({ mission: undefined, isPending: true, isError: false, notFound: false })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByText(/ouverture du dossier/i)).toBeInTheDocument()
  })

  it('dit « la lecture a échoué » et propose de réessayer', async () => {
    const refetch = vi.fn()
    useMission.mockReturnValue({ mission: undefined, isPending: false, isError: true, notFound: false, refetch })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByText(/c’est la lecture qui a échoué/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(refetch).toHaveBeenCalled()
  })

  it('dit « pas dans cet espace » — une AUTRE phrase, sans bouton de réessai', () => {
    useMission.mockReturnValue({ mission: undefined, isPending: false, isError: false, notFound: true })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByText(/n’est pas dans cet espace/i)).toBeInTheDocument()
    // Réessayer ne changera rien : la lecture a ABOUTI.
    expect(screen.queryByRole('button', { name: /réessayer/i })).not.toBeInTheDocument()
  })

  it('offre le retour à la liste depuis les trois états', () => {
    for (const state of [
      { mission: undefined, isPending: false, isError: true, notFound: false, refetch: vi.fn() },
      { mission: undefined, isPending: false, isError: false, notFound: true },
      { mission: mission(), canReadFinance: true, isPending: false, isError: false, notFound: false },
    ]) {
      cleanup()
      useMission.mockReturnValue(state)
      render(<MissionDossierPage missionId={ID} />)
      // Une erreur ou une mission introuvable renvoient à la liste ; le dossier, lui, revient au PLANNING.
      const loaded = state.mission !== undefined
      expect(
        screen.getByRole('link', { name: loaded ? /revenir au planning/i : /retour aux missions/i }),
      ).toHaveAttribute('href', loaded ? '/missions/planification' : '/missions')
    }
  })

  /**
   * ⚠️ Une date se formate dans la langue de l'APP. Elle sortait du tiroir en
   * ISO brut (« 2026-02-01 ») : lisible par une machine, par personne d'autre.
   */
  it('#2711.1 — « Créer un projet » existe en entête (menu « ⋯ »), hors du seul cas du renouvellement', async () => {
    // Retour SKAIZen Group (22/09/2026) : « depuis mission, pour ne pas se
    // limiter aux projets ressortis par l'analyse ». Mesuré par l'issue :
    // `CreateProjectDialog` n'avait qu'un déclencheur, `RenewalDecisionPanel`
    // (le SEUL cas du renouvellement). Ce lien vit dans le dossier lui-même,
    // donc sur TOUTE mission — actif, terminée, sans fenêtre de renouvellement.
    found({ account_id: 'acc-77' })
    render(<MissionDossierPage missionId={ID} />)
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(screen.getByRole('button', { name: 'Plus d’actions sur la mission' }))
    const link = await screen.findByRole('menuitem', { name: 'Créer un projet' })
    expect(link).toHaveAttribute('href', `/projects?create=1&account_id=acc-77&mission_id=${ID}`)
  })

  it('affiche la date de démarrage dans la langue de l’app, jamais en ISO', () => {
    found({ started_on: '2026-02-01' })
    render(<MissionDossierPage missionId={ID} />)
    // L'identité de la Synthèse écrit la date en toutes lettres, dans la langue de l'app.
    expect(screen.getByText('1 févr. 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-02-01')).not.toBeInTheDocument()
  })

  /**
   * #2407.3 — RÉFUTÉ en prod le 23/09, DEUX FOIS :
   *  1. `GET …/field-sources` n'avait AUCUN appelant web (corrigé le jour même).
   *  2. Une fois monté, il rendait une ligne PAR CHAMP même sans source
   *     tracée (« provenance non renseignée » × 5, IDENTIQUE sur 3/3
   *     missions mesurées en prod) — la doctrine « on n'affiche pas ce qu'on
   *     n'a pas » veut une absence de LIGNE, jamais un placeholder répété.
   */
  it('#2407.3 — nomme la source de chaque champ principal, quand elle est tracée', () => {
    found()
    fieldSources.mockReturnValue({
      data: {
        accountId: { source: 'human', at: '2026-01-05T10:00:00.000Z' },
        label: { source: 'human', at: '2026-01-05T10:00:00.000Z' },
        startedOn: { source: 'human', at: '2026-01-06T10:00:00.000Z' },
        endsOn: null,
        dailyRate: null,
      },
    })
    const { container } = render(<MissionDossierPage missionId={ID} />)
    // Trois champs tracés : le même libellé de source apparaît trois fois,
    // chacun suivi de sa date (`Provenance` joint source et date en un seul
    // nœud de texte — d'où le motif plutôt qu'une égalité stricte).
    // #3672 revient sur le libellé « saisi par quelqu'un » (#2407.3), délibérément ; ce qui tient :
    // une source nommée par champ tracé, trois fois.
    expect(screen.getAllByText(/Information de ton équipe/)).toHaveLength(3)
    // Deux champs jamais tracés — `endsOn`, `dailyRate` — n'affichent AUCUNE
    // ligne : ni un placeholder « provenance non renseignée », ni même leur
    // libellé de champ (« Fin », « TJM »), scopé à la ligne de provenance
    // pour ne pas confondre avec un autre bloc du dossier qui emploierait
    // le même mot.
    expect(screen.queryByText('provenance non renseignée')).not.toBeInTheDocument()
    const group = container.querySelector('[aria-label="Provenance des champs principaux"]') as HTMLElement
    expect(group).not.toBeNull()
    expect(within(group).queryByText('Fin')).not.toBeInTheDocument()
    expect(within(group).queryByText('TJM')).not.toBeInTheDocument()
  })

  it('#2407.3 — aucun champ tracé : la ligne de provenance ne se rend pas du tout (jamais 5 placeholders)', () => {
    found()
    fieldSources.mockReturnValue({
      data: { accountId: null, label: null, startedOn: null, endsOn: null, dailyRate: null },
    })
    const { container } = render(<MissionDossierPage missionId={ID} />)
    expect(container.querySelector('[aria-label="Provenance des champs principaux"]')).toBeNull()
    expect(screen.queryByText('provenance non renseignée')).not.toBeInTheDocument()
  })

  it('#2407.3 — pendant le chargement, ne rend rien plutôt qu’une source devinée', () => {
    found()
    fieldSources.mockReturnValue({ data: undefined })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.queryByText('provenance non renseignée')).not.toBeInTheDocument()
  })

  /**
   * #2953 (#2193.3-8, .11) — LE HERO : les acteurs de la mission, sa période,
   * et sa prochaine action, réunis en entête plutôt qu'éparpillés dans les
   * cinq onglets. Chaque champ nomme son absence — jamais masqué, jamais
   * deviné.
   */
  describe('le hero — les acteurs, la période et la prochaine action (#2953)', () => {
    it('#2193 — l’entête, l’identité et les propriétés portent les sept attributs : compte, situation, consultant, responsable, manager client, période, prochaine étape', () => {
      found({})
      render(<MissionDossierPage missionId={ID} />)
      const props = screen.getByRole('complementary', { name: 'Propriétés de la mission' })
      for (const label of ['Situation de mission', 'Dates prévues', 'Responsable Bellum', 'Manager client']) {
        expect(within(props).getByText(label), label).toBeInTheDocument()
      }
      // le compte et la situation vivent dans l'entête ; le consultant et la prochaine étape, dans la Synthèse
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(screen.getByLabelText('Identité de la mission')).toBeInTheDocument()
      expect(screen.getByLabelText('Prochaine étape')).toBeInTheDocument()
    })

    it('#2193.15 — l’onglet des conditions se trouve par le nom « Finance »', () => {
      found({})
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText('Conditions & finance')).toBeInTheDocument()
    })

    it('nomme le consultant affecté, en lien vers sa fiche', () => {
      found({ assignees: [{ id: 'cons-1', fullName: 'Salomé Dufour', photoUrl: null, loadPercent: 100 }] })
      render(<MissionDossierPage missionId={ID} />)
      const link = screen.getByRole('link', { name: 'Salomé Dufour' })
      expect(link).toHaveAttribute('href', '/consultants/cons-1')
    })

    it('nomme l’absence de consultant affecté, jamais un vide muet', () => {
      found({ assignees: [] })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText(/aucun consultant affecté/)).toBeInTheDocument()
    })

    it('distingue « affectations non lues » de « personne d’affecté »', () => {
      found({ assignees: null })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText(/affectations non lues/)).toBeInTheDocument()
    })

    it('nomme le chargé d’affaires (BM) et le manager client, chacun avec sa raison quand absent', () => {
      found({ ownerName: null, clientManagerName: null })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText(/aucun porteur renseigné/)).toBeInTheDocument()
      expect(screen.getByText(/non désigné/)).toBeInTheDocument()
    })

    it('rend le chargé d’affaires et le manager client quand ils sont désignés', () => {
      found({ ownerName: 'Camille Perrin', clientManagerName: 'Nadia Kessler' })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText('Camille Perrin')).toBeInTheDocument()
      expect(screen.getByText('Nadia Kessler')).toBeInTheDocument()
    })

    // #2193.59 — le manager client est un contact RÉEL, avec une fiche : un
    // nom sans lien refusait exactement le même geste que le consultant.
    it('le manager client ouvre sa fiche contact — #2193.59', () => {
      found({ clientManagerName: 'Nadia Kessler', clientManagerContactId: 'contact-1' })
      render(<MissionDossierPage missionId={ID} />)
      const link = screen.getByRole('link', { name: 'Nadia Kessler' })
      expect(link).toHaveAttribute('href', '/contacts/contact-1')
    })

    it('le manager client reste du texte quand son id n’a pas pu être confirmé', () => {
      found({ clientManagerName: 'Nadia Kessler', clientManagerContactId: null })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText('Nadia Kessler')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Nadia Kessler' })).not.toBeInTheDocument()
    })

    it('affiche la période dans la langue de l’app, « sans date de fin » à défaut de terme', () => {
      found({ started_on: '2026-02-01', ends_on: null })
      render(<MissionDossierPage missionId={ID} />)
      // Scopé à la colonne des propriétés : l'identité de la Synthèse porte aussi la date de démarrage.
      const props = screen.getByRole('complementary', { name: 'Propriétés de la mission' })
      expect(within(props).getByText(/1 févr\./)).toBeInTheDocument()
      expect(within(props).getByText(/sans date de fin/i)).toBeInTheDocument()
    })

    it('rend la prochaine action en LIEN, comme sur `/missions` — jamais un second calcul', () => {
      found({ status: 'active', ends_on: null, nextAction: 'set_end_date' })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByRole('link', { name: /date de fin/i })).toBeInTheDocument()
    })

    it('nomme « non mesuré » quand le serveur ne rend pas encore la prochaine action', () => {
      found({ nextAction: undefined })
      render(<MissionDossierPage missionId={ID} />)
      expect(screen.getByText(/la prochaine action n’a pas encore été renvoyée/)).toBeInTheDocument()
    })
  })

  // #2953 (#2193.54) — LAURA VOIT LE DOSSIER MISSION, SANS RECOPIE.
  //
  // Aucun autre test de ce fichier ne regardait `useLauraContext` : le dossier
  // ne le publiait jamais (`git grep` vide sous `features/missions`), donc la
  // bulle de Laura, ouverte depuis une mission, ne recevait rien.
  describe('le contexte publié à Laura (#2193.54)', () => {
    it('publie la mission — jamais le compte porteur — comme objet cadré', () => {
      found({ label: 'TMA portail transporteurs', status: 'active' })
      render(
        <>
          <MissionDossierPage missionId={ID} />
          <LauraContextReader />
        </>,
      )
      const published = JSON.parse(screen.getByTestId('laura-context').textContent ?? 'null')
      expect(published.kind).toBe('mission')
      expect(published.entityId).toBe(ID)
      expect(published.label).toBe('TMA portail transporteurs')
    })

    it('reprend le consultant et le manager client déjà résolus par le hero', () => {
      found({
        assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null, loadPercent: 80 }],
        clientManagerName: 'Nadia Kessler',
      })
      render(
        <>
          <MissionDossierPage missionId={ID} />
          <LauraContextReader />
        </>,
      )
      const published = JSON.parse(screen.getByTestId('laura-context').textContent ?? 'null')
      expect(published.facets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: 'Salomé Dufour' }),
          expect.objectContaining({ value: 'Nadia Kessler' }),
        ]),
      )
    })

    it('dit « en chargement », jamais un fait deviné, tant que la mission n’est pas lue', () => {
      useMission.mockReturnValue({
        mission: undefined,
        canReadFinance: false,
        isPending: true,
        isError: false,
        notFound: false,
        refetch: vi.fn(),
      })
      render(
        <>
          <MissionDossierPage missionId={ID} />
          <LauraContextReader />
        </>,
      )
      const published = JSON.parse(screen.getByTestId('laura-context').textContent ?? 'null')
      expect(published.state).toBe('loading')
      expect(published.facets).toEqual([])
    })
  })

  // #4424.3 — la proposition ne vit plus seulement sous le toast d'une seconde : le dossier de la mission
  // garde un bouton « Préparer le RDV » qui mène au panneau R1/R2 de la fiche du compte. Un lien, rien ne part seul.
  it('#4424.3 — porte un bouton persistant « Préparer le RDV » vers le panneau R1/R2 du compte', () => {
    found()
    render(<MissionDossierPage missionId={ID} />)
    const link = screen.getByRole('link', { name: 'Préparer le RDV' })
    expect(link.getAttribute('href')).toBe('/accounts/33333333-3333-4333-8333-333333333333?tab=plan&prep=rdv')
  })
})

// Théo missions-dossier — l'entête, les cinq onglets, la colonne de propriétés et les deux fenêtres.
describe('MissionDossierPage — la refonte Théo', () => {
  it('écrit l’étiquette du type d’objet, le titre, le compte et la situation EN MOTS', () => {
    found({ label: 'Fiabilisation plateforme', status: 'active', ends_on: '2027-06-30', started_on: '2026-04-01' })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByText('Dossier de mission')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Fiabilisation plateforme' })).toBeInTheDocument()
    // « En cours » : la situation d'une mission commencée dont la fin est lointaine, jamais le statut brut.
    expect(
      within(screen.getByRole('complementary', { name: 'Propriétés de la mission' })).getByText('En cours'),
    ).toBeInTheDocument()
  })

  it('chaque onglet n’affiche que SON contenu — jamais des blocs empilés', () => {
    found({ status: 'terminated' })
    render(<MissionDossierPage missionId={ID} />)
    // Synthèse : l'identité et « Prochaine étape », pas l'équipe.
    expect(screen.getByLabelText('Identité de la mission')).toBeInTheDocument()
    expect(screen.queryByTestId('interruption-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & suite' }))
    expect(screen.queryByLabelText('Identité de la mission')).not.toBeInTheDocument()
    expect(screen.getByTestId('interruption-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Synthèse' }))
    expect(screen.getByLabelText('Identité de la mission')).toBeInTheDocument()
  })

  it('propose cinq onglets nommés comme la maquette', () => {
    found({})
    render(<MissionDossierPage missionId={ID} />)
    const nav = screen.getByRole('navigation', { name: 'Vues du dossier de mission' })
    for (const name of [
      'Synthèse',
      'Équipe & suite',
      'Conditions & finance',
      'Points d’attention',
      'Documents & suivi',
    ]) {
      expect(within(nav).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('« Préparer le point client » ouvre la fenêtre sur CETTE mission, depuis l’entête comme depuis « Prochaine étape »', () => {
    found({ label: 'Fiabilisation plateforme' })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.queryByTestId('point-client')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Préparer le point client' })[0] as HTMLElement)
    expect(screen.getByTestId('point-client')).toHaveTextContent('Fiabilisation plateforme')
  })

  it('« Chercher une relève / un renfort » crée un besoin PRÉREMPLI, sans toucher à l’affectation', () => {
    found({ label: 'Fiabilisation plateforme', account_id: 'acc-9' })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByText(/sans modifier l’affectation en cours/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Chercher une relève / un renfort' }))
    expect(screen.getByTestId('relief')).toHaveTextContent('Suite de mission — Fiabilisation plateforme|acc-9')
  })

  it('« Revenir au planning » ramène au planning', () => {
    found({})
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.getByRole('link', { name: 'Revenir au planning' })).toHaveAttribute('href', '/missions/planification')
  })

  it('la colonne des propriétés nomme l’expertise, le lieu et la source — et dit une absence, jamais un blanc', () => {
    found({
      assignedSkills: ['Kubernetes', 'Go'],
      location: 'Saint-Denis',
      opportunityLabel: null,
      opportunity_id: null,
    })
    render(<MissionDossierPage missionId={ID} />)
    const props = screen.getByRole('complementary', { name: 'Propriétés de la mission' })
    expect(within(props).getByText('Kubernetes')).toBeInTheDocument()
    expect(within(props).getByText('Go')).toBeInTheDocument()
    expect(within(props).getByText(/Saint-Denis/)).toBeInTheDocument()
    expect(within(props).getByText('Source de la mission')).toBeInTheDocument()
  })

  it('n’affiche aucun score en points (« 74 / 100 ») ni probabilité sur le dossier', () => {
    found({})
    const { container } = render(<MissionDossierPage missionId={ID} />)
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*100/)
    expect(container.textContent).not.toMatch(/probabilit/i)
  })
})

// Contrôle de fidélité Théo (23/10) — l'ORDRE et la FORME du dossier. Dit NON si un bloc change de place,
// si le cycle repasse en boutons d'entête, ou si l'objectif réapparaît en double sous l'identité.
describe('MissionDossierPage — structure de la maquette Théo', () => {
  it('empile relève, entête, onglets, identité, cadre, prochaine étape ; propriétés en colonne', () => {
    found({ status: 'active', objective: 'Fiabiliser la plateforme', perimeter: 'Astreinte N2' })
    const { container } = render(<MissionDossierPage missionId={ID} />)
    const order = [...container.querySelectorAll('[data-slot^="dossier-"]')].map(node => node.getAttribute('data-slot'))
    expect(order).toEqual([
      'dossier-relief',
      'dossier-head',
      'dossier-identity',
      'dossier-frame',
      'dossier-next-step',
      'dossier-props',
    ])
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // L'objectif se lit UNE fois (carte d'identité), le périmètre aussi.
    expect(screen.getAllByText('Fiabiliser la plateforme')).toHaveLength(1)
    expect(screen.getAllByText('Astreinte N2')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Modifier l’objectif et le périmètre' })).toBeInTheDocument()
  })

  it('le cycle (prolonger, terminer) vit dans le menu « ⋯ », pas en boutons d’entête', async () => {
    found({ status: 'active' })
    render(<MissionDossierPage missionId={ID} />)
    expect(screen.queryByRole('button', { name: 'Prolonger' })).not.toBeInTheDocument()
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(screen.getByRole('button', { name: 'Plus d’actions sur la mission' }))
    await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('menuitem', { name: 'Prolonger' }))
    expect(screen.getByTestId('lifecycle-extend')).toBeInTheDocument()
  })
})

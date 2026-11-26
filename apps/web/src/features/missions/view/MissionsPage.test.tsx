import type { Mission, PipelineSummary } from '@bellum/contracts'
import type { MissionView } from '../api'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * #1812 (09/09/2026) — « Demander à {{copilot}} » ne prend plus de place sur la
 * page : sur un poste de bureau, c'est la BULLE qui porte la question, et
 * `AskLaura` ne rend alors rien du tout.
 *
 * Ce test-ci ne mesure pas la bulle — il mesure que CET écran propose bien le
 * geste, avec le bon libellé et le bon contexte. On double donc le dépôt pour
 * dire « une autre instance porte la bulle », cas où `AskLaura` rend son lien
 * exactement comme avant. Le nouveau chemin a ses propres tests :
 * `laura-intro-store.test.tsx`, `LauraIntroBar.test.tsx`, `LauraDock.intro.test.tsx`
 * et `AskLaura.test.tsx`.
 */
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/**
 * #2408.54 — `SavedMissionViews` (pied de la barre) a SES tests dédiés
 * (`SavedMissionViews.test.tsx`) ; mocké ici comme `SavedTalentViews` dans
 * `TalentFilterDrawer.test.tsx` — ce fichier ne monte pas de
 * `QueryClientProvider`/`SessionProvider`, les trois hooks qu'il consomme
 * sont donc hors sujet pour un fichier qui mesure l'ÉCRAN.
 */
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: [], isLoading: false, isError: false }),
  useCreateSavedView: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveSavedView: () => ({ mutate: vi.fn(), isPending: false }),
}))
/**
 * #2408.64 / #2408.65 — `MissionCockpitKpiTiles` a SES tests dédiés
 * (`MissionCockpitKpiTiles.test.tsx`) ; le prévisionnel réel interroge un
 * VRAI `useQuery`, hors sujet pour ce fichier qui ne monte aucun
 * `QueryClientProvider` (même raison que `useSavedViews` juste au-dessus).
 */
const forecastHorizons = vi.fn((_horizon: string, _enabled: boolean) => ({
  data: undefined,
  isLoading: false,
  isError: false,
}))
vi.mock('@/features/pilotage/api', () => ({
  useForecastHorizons: (horizon: string, enabled: boolean) => forecastHorizons(horizon, enabled),
}))
/**
 * #4193 — « Missions actives » vient de `GET /crm-counters` : un VRAI `useQuery`,
 * et ce fichier ne monte aucun `QueryClient`. Non mesuré par défaut.
 */
const crmCounters = vi.fn((): { data: unknown; isLoading: boolean; isError: boolean } => ({
  data: undefined,
  isLoading: false,
  isError: false,
}))
vi.mock('@/features/crm-counters/useCrmCounters', () => ({ useCrmCounters: () => crmCounters() }))
beforeEach(() => {
  crmCounters.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: true }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'me' }, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const missions = vi.fn()
const pipeline = vi.fn()
// Le prénom vient du profil, pas de la chaîne. Mocké ICI parce que le hook
// réel lit `useProfile` + `useAuth`, deux dépendances que ce fichier de test
// n'a aucune raison de monter pour vérifier un entête.
const firstName = vi.fn(() => '')

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName() }))

// ⚠️ Le faux est PARTIEL : `assigneeNames` et les dérivations pures du même
// module doivent survivre au remplacement des deux hooks.
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  useMissions: () => missions(),
  // #3656 — la lentille d'échéance lit l'échelle de l'espace ; ce fichier ne monte aucun `QueryClient`.
  useRenewalWindows: () => ({ data: undefined }),
  // #2562 — sans elle, l'état vide monterait `CrmReprisalProposal`, qui
  // interroge un VRAI `useQuery` : ce fichier ne monte aucun `QueryClient`,
  // et ce n'est pas son objet (voir `CrmReprisalProposal.test.tsx`).
  useCrmReprisalCandidates: () => ({ data: { available: false, provider: null, deals: [] }, isLoading: false }),
  // #2408.68/.69 — les tuiles de facturation (sous finance:read) : même raison,
  // aucun `QueryClient` ici. Non mesuré par défaut.
  useInvoiceReadiness: () => ({ data: undefined, isError: false }),
  useCollectionsWindow: () => ({ items: [], canReadFinance: true, isLoading: true, failedMonths: 0 }),
}))
// L'état vide interroge le PIPE pour savoir quelle porte proposer : c'est lui
// qui distingue « aucun projet » de « aucun projet signé ».
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => pipeline() }))
// `Link` rend son `to` en `href` : c'est la DESTINATION qu'on veut asserter,
// pas seulement la présence d'un bouton.
// ⚠️ Le faux INTERPOLE les paramètres depuis que les cartes de renouvellement
// portent une prochaine action (#1366) : un `to` rendu tel quel afficherait
// « /missions/$id » et le test resterait vert sur un lien mort.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params?: Record<string, string>; children: React.ReactNode }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace('$' + key, value), to)}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
}))
// Le module de route est mocké — l'importer pour de vrai ferait une boucle (la
// route importe l'écran). Ces tests-ci décrivent l'écran NON filtré ; le lien
// de source a son propre fichier (`MissionsSourceFilter.test.tsx`).
vi.mock('@/routes/missions/index', () => ({ Route: { useSearch: () => ({}) } }))
// Les deux enfants lourds sont neutralisés : ce test est celui du FILTRE de
// l'onglet, et le panneau de facturation comme le tiroir de détail ont leurs
// propres garanties ailleurs.
vi.mock('./InvoiceReadinessPanel', () => ({ InvoiceReadinessPanel: () => null }))
vi.mock('./MissionDetailSheet', () => ({ MissionDetailSheet: () => null }))
// #2561/#2562 — la section des ventes Odoo lit son propre hook (react-query) : hors sujet ici.
vi.mock('./OdooSalesSection', () => ({ OdooSalesSection: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// #1687 — un espion, pas le module réel : ce fichier vérifie ce que
// `toggleFacet`/`RenewalWindowFilter.onSelect` ÉMETTENT.
const trackFilterApplied = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackFilterApplied: (...args: unknown[]) => trackFilterApplied(...args),
}))

const { MissionsPage } = await import('./MissionsPage')

function mission(over: Partial<Mission> = {}): Mission {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active',
    started_on: null,
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
    ...over,
  }
}

/** Un pipe dont on choisit les colonnes qui comptent ici : les SIGNÉS. */
function summary(over: { signed?: number; qualified?: number; intake?: number } = {}): PipelineSummary {
  const counts = {
    qualified: over.qualified ?? 0,
    confirmed: 0,
    profiles_submitted: 0,
    negotiation: 0,
    won: over.signed ?? 0,
  }
  const columns = Object.entries(counts).map(([stage, count]) => ({
    stage: stage as PipelineSummary['columns'][number]['stage'],
    label: stage,
    count,
    amount_cents: 0,
    without_amount: 0,
    without_next_action: 0,
  }))
  // ⚠️ Le signé sort du total depuis le 29/08 : il compte à part, sinon le
  // « total pipe » additionnerait deux statuts. Cette fabrique suit la règle du
  // contrat plutôt que de recopier une somme — c'est le compte des signés que
  // ce fichier fait varier.
  const open = columns.filter(column => column.stage !== 'won')
  const signed = columns.filter(column => column.stage === 'won')
  const count = (of: typeof columns) => of.reduce((sum, column) => sum + column.count, 0)
  return {
    columns,
    intake: over.intake ?? 0,
    signals: 0,
    total_count: count(open),
    total_amount_cents: 0,
    total_without_amount: 0,
    signed_count: count(signed),
    signed_amount_cents: 0,
    signed_without_amount: 0,
  }
}

/**
 * Mesuré en production le 27/08 : une mission `ended` s'affichait sous « En
 * cours », badge « Terminée » juste en dessous, et se retrouvait EN PLUS
 * proposée au renouvellement. La liste n'était filtrée sur aucun statut.
 */
describe('MissionsPage — ce qui tourne, et ce qui est fini', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })

  it('n’affiche PAS une mission terminée sous « En cours »', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ status: 'ended', label: 'Time-to-market des nouveaux marchés' })] },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(screen.queryByText('Time-to-market des nouveaux marchés')).not.toBeInTheDocument()
  })

  it('DIT pourquoi l’onglet est vide plutôt que de laisser un blanc', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ status: 'ended' }), mission({ id: 'b', status: 'terminated' })] },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(screen.getByText(/2 missions terminées/)).toBeInTheDocument()
  })

  it('garde ce qui tourne — y compris une mission suspendue, qui n’est pas finie', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ status: 'paused', label: 'Refonte du SI paiement' })] },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(screen.getByText('Refonte du SI paiement')).toBeInTheDocument()
  })

  it('garde une mission au statut INCONNU — la faire disparaître serait pire', () => {
    // Un statut illisible n'est pas un statut terminé : personne ne cherche ce
    // qu'il ne voit pas, alors qu'une ligne de trop se remarque.
    missions.mockReturnValue({
      data: { missions: [mission({ status: 'statut_venu_du_futur' as Mission['status'], label: 'Cas limite' })] },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(screen.getByText('Cas limite')).toBeInTheDocument()
  })
})

describe('#1687 — trackFilterApplied sur /missions', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    trackFilterApplied.mockClear()
    missions.mockReturnValue({ data: { missions: [] }, isLoading: false, isError: false })
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })

  it('une puce de la lentille « En cours » (toggleFacet) émet trackFilterApplied("/missions", <facette>)', async () => {
    missions.mockReturnValue({
      data: { missions: [mission({ label: 'Refonte du SI paiement' })] },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    // #3144 (recette 28/09/2026) — les pastilles rapides vivent désormais
    // sous le dépliable « Filtres ».
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: /À renouveler/ }))
    expect(trackFilterApplied).toHaveBeenCalledWith('/missions', 'toRenew')
  })
})

/**
 * Retour bêta du 27/08 (issue #1127). Devant « En cours » vide, Louis a écrit :
 * « Si je comprends bien, il faut d'abord ajouter des consultants en vivier
 * avant d'ajouter des missions ? ». Le modèle est AUTRE — une mission naît d'un
 * projet SIGNÉ — et qu'il ait fallu le deviner est le défaut.
 *
 * Ce que ces tests gardent : l'état vide NOMME l'origine, et il porte un chemin
 * TABULABLE vers elle. Et surtout, la porte dépend de ce que l'espace contient :
 * envoyer vers le pipe un espace qui n'a aucun projet ne ferait que déplacer le
 * vide d'un écran à l'autre.
 */
describe('MissionsPage — l’état vide dit d’où vient une mission, et y mène', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    missions.mockReturnValue({ data: { missions: [] }, isLoading: false, isError: false })
  })

  it('nomme le projet SIGNÉ comme origine — jamais le vivier', () => {
    pipeline.mockReturnValue({ data: summary({ qualified: 3 }), isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.getByText(/projet signé/i)).toBeInTheDocument()
    expect(screen.queryByText(/vivier/i)).not.toBeInTheDocument()
  })

  /**
   * #2192.48 — LE TITRE EXACT DE L'ISSUE : « Tu n’as aucune mission active. »
   *
   * ⚠️ Seul le TITRE change. La description reste la version CONTEXTUELLE
   * (#2557.1, D200) — plus riche que la phrase unique de l'issue, qui dit
   * seulement « importe tes missions actuelles ou crée-en une depuis une
   * opportunité signée » : « importer » suppose un import CROISÉ compte, qui
   * n'existe pas (`CreateMissionFromDocumentDialog` exige un `accountId`,
   * `ImportWizard` ne connaît pas les missions). Promettre ce mot ici
   * mentirait sur une capacité absente — la création EST offerte, elle,
   * juste en dessous (#2557.1).
   */
  it('#2192.48 — porte le titre EXACT de l’issue', () => {
    pipeline.mockReturnValue({ data: summary(), isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.getByText('Tu n’as aucune mission active.')).toBeInTheDocument()
  })

  it('offre un chemin TABULABLE vers le pipe quand des projets existent, ET la création directe (#2557.1)', () => {
    pipeline.mockReturnValue({ data: summary({ qualified: 3 }), isLoading: false, isError: false })
    render(<MissionsPage />)
    // `getByRole('link')` échoue sur un `<div onClick>` : c'est ce qui garde GA-35.
    expect(screen.getByRole('link', { name: /Ouvrir les projets/i })).toHaveAttribute('href', '/projects')
    // #2557.1 — le geste de création reste offert, même quand une porte contextuelle existe.
    expect(screen.getByRole('link', { name: /Nouvelle mission/i })).toHaveAttribute('href', '/missions/nouvelle')
  })

  it('compte les projets déjà signés plutôt que de laisser chercher', () => {
    pipeline.mockReturnValue({ data: summary({ signed: 2 }), isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.getByText(/2 projets sont déjà signés/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir les projets/i })).toHaveAttribute('href', '/projects')
  })

  it('mène à l’ANALYSE quand l’espace n’a aucun projet — pas vers un écran vide', () => {
    pipeline.mockReturnValue({ data: summary(), isLoading: false, isError: false })
    render(<MissionsPage />)
    // Le pipe serait vide lui aussi : une mauvaise porte est pire que pas de porte.
    expect(screen.getByRole('link', { name: /Lancer une analyse/i })).toHaveAttribute('href', '/search')
  })

  it('compte l’entonnoir d’entrée comme un projet — un besoin détecté remplit le pipe', () => {
    pipeline.mockReturnValue({ data: summary({ intake: 4 }), isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.getByRole('link', { name: /Ouvrir les projets/i })).toHaveAttribute('href', '/projects')
  })

  /**
   * #2557.1 — la porte de CRÉATION ne dépend d'aucune lecture du pipe : elle
   * est là pendant le chargement et après un échec, quand la porte
   * CONTEXTUELLE (qui dit D'OÙ vient une mission) n'a, elle, pas de réponse
   * sûre à donner.
   */
  it('offre quand même la création tant que le pipe n’est pas lu', () => {
    pipeline.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<MissionsPage />)
    expect(screen.getByRole('link', { name: /Nouvelle mission/i })).toHaveAttribute('href', '/missions/nouvelle')
    // Un « aucun projet » affirmé pendant le chargement serait faux une fois sur
    // deux — et enverrait vers la mauvaise porte contextuelle.
    expect(screen.queryByRole('link', { name: /projets|analyse/i })).not.toBeInTheDocument()
    expect(screen.getByText(/dès qu’un projet est signé/i)).toBeInTheDocument()
  })

  it('offre quand même la création si la lecture du pipe a échoué', () => {
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MissionsPage />)
    expect(screen.getByRole('link', { name: /Nouvelle mission/i })).toHaveAttribute('href', '/missions/nouvelle')
    expect(screen.queryByRole('link', { name: /projets|analyse/i })).not.toBeInTheDocument()
  })

  /**
   * ⚠️ Ce test AFFIRMAIT l'inverse jusqu'au 27/08 : « ne remplace PAS
   * l'explication par la porte », au motif qu'un espace ayant des missions
   * finies « a déjà sa réponse ». La recette live a montré que non — le retour
   * #1127 a été écrit dans exactement cet état.
   *
   * Ce qui était juste dans l'ancienne version est conservé : l'explication ne
   * doit pas DISPARAÎTRE au profit de la porte. Les deux coexistent.
   */
  it('garde l’explication « elles sont terminées » ET ouvre la porte', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ status: 'ended' })] },
      isLoading: false,
      isError: false,
    })
    pipeline.mockReturnValue({ data: summary(), isLoading: false, isError: false })
    render(<MissionsPage />)
    // le constat n'est pas remplacé — c'était la raison d'être de ce test
    expect(screen.getByText(/1 mission terminée/)).toBeInTheDocument()
    // et la porte contextuelle existe quand même
    expect(screen.getByRole('link', { name: /Lancer une analyse/i })).toBeInTheDocument()
    // #2557.1 — la création directe aussi, toujours
    expect(screen.getByRole('link', { name: /Nouvelle mission/i })).toHaveAttribute('href', '/missions/nouvelle')
  })
})

/**
 * Le cas EXACT du retour bêta #1127, trouvé en RECETTE LIVE le 27/08.
 *
 * L'espace de Louis portait UNE mission terminée. La première version de ce
 * correctif réservait la porte au cas « aucune mission, jamais » et n'affichait
 * ici qu'un constat — or c'est exactement l'écran sur lequel la question
 * « il faut d'abord ajouter des consultants ? » a été posée.
 *
 * « La question ne se pose pas ici » était une supposition sur ce que
 * l'utilisateur sait. Les tests unitaires la partageaient, donc ils étaient
 * verts ; seule la recette pouvait la contredire.
 */
describe('MissionsPage — une mission TERMINÉE ne prive pas l’écran de sa porte (#1127)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
  })

  it('dit ce qui est masqué ET où naît la suivante', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ status: 'ended' })] },
      isLoading: false,
      isError: false,
    })
    pipeline.mockReturnValue({ data: summary({ signed: 2 }), isLoading: false, isError: false })

    render(<MissionsPage />)

    // le FAIT : des missions existent, elles sont terminées
    expect(screen.getByText(/n’est pas listée ici/i)).toBeInTheDocument()
    // l'ORIGINE : nommée, pas supposée connue
    expect(screen.getByText(/projet signé/i)).toBeInTheDocument()
    // la PORTE : elle existe, et elle mène au pipe
    expect(screen.getByRole('link', { name: /projets/i })).toHaveAttribute('href', '/projects')
  })
})

/**
 * L'ENTÊTE — #1346, #1347, #1361.
 *
 * Les trois retours demandent le même geste sur trois lentilles : un titre qui
 * s'adresse à la personne, et une phrase qui dit à quoi la lentille sert.
 * Ils l'écrivent tous avec « Maëlle » EN DUR ; le prénom vient du profil.
 *
 * ⚠️ #1347 dit aussi « ne pas ajouter de paragraphe explicatif supplémentaire ».
 * L'ancien `page.subtitle` vivait DANS la lentille « En cours » : le garder
 * sous le nouveau sous-titre ferait deux phrases qui disent la même chose —
 * c'est la loi 4 du tome 7, et c'est exactement le défaut corrigé sur Comptes
 * la veille (#1345). Le test le vérifie, sinon la correction se défait seule.
 */
describe('MissionsPage — l’entête s’adresse à la personne (#1346, #1347, #1361)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    firstName.mockReturnValue('Maëlle')
    missions.mockReturnValue({ data: { missions: [mission()] }, isLoading: false, isError: false })
  })

  it('porte le prénom du PROFIL, jamais celui écrit dans l’issue', () => {
    firstName.mockReturnValue('Louis')
    render(<MissionsPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tes missions, Louis')
  })

  // #4197 (L6) — « Prêt à facturer » est le doublon de Facturation (`/missions/facturation`) :
  // la bascule « En cours / Prêt à facturer » (#3286) est SUPPRIMÉE de cet écran.
  it('#4197 — plus de bascule « Prêt à facturer » : la facturation a sa route', () => {
    render(<MissionsPage />)
    expect(screen.queryByRole('button', { name: 'Prêt à facturer' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('missions-lens-row')).not.toBeInTheDocument()
  })

  it('#4197 — même sans mission, rien de la bascule ne revient', () => {
    missions.mockReturnValue({ data: { missions: [] }, isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.queryByRole('button', { name: 'Prêt à facturer' })).not.toBeInTheDocument()
  })

  it('#4197 — trois puces « Fin sous 30 j · 60 j · 90 j », nombres de `GET /crm-counters` (sous « Filtres »)', async () => {
    const counter = (value: number) => ({ value, measured: true, definition_key: 'k' })
    crmCounters.mockReturnValue({
      data: {
        counters: {
          missions_active: counter(1),
          missions_ending_30: counter(2),
          missions_ending_60: counter(5),
          missions_ending_90: counter(9),
        },
        secured_revenue_month: { measured: false, amounts: null, definition_key: 'k' },
      },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    // Refonte Théo — les puces rejoignent « Filtres » ; le repère de tête porte le premier nombre.
    await openFilters()
    const chips = within(screen.getByTestId('missions-ending-chips'))
    expect(chips.getByRole('button', { name: /30 j/ })).toHaveTextContent('2')
    expect(chips.getByRole('button', { name: /60 j/ })).toHaveTextContent('5')
    expect(chips.getByRole('button', { name: /90 j/ })).toHaveTextContent('9')
  })

  it('#4197 — « Fin sous 30 j » resserre la liste sur les missions qui finissent dans 30 jours', async () => {
    const inDays = (days: number) => {
      const date = new Date()
      date.setDate(date.getDate() + days)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    missions.mockReturnValue({
      data: {
        missions: [
          mission({ id: '11111111-1111-4111-8111-1111111111aa', label: 'Mission proche', ends_on: inDays(10) }),
          mission({ id: '11111111-1111-4111-8111-1111111111bb', label: 'Mission lointaine', ends_on: inDays(200) }),
        ],
      },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(screen.getByText('Mission proche')).toBeInTheDocument()
    expect(screen.getByText('Mission lointaine')).toBeInTheDocument()
    await openFilters()
    fireEvent.click(within(screen.getByTestId('missions-ending-chips')).getByRole('button', { name: /30 j/ }))
    expect(screen.getByText('Mission proche')).toBeInTheDocument()
    expect(screen.queryByText('Mission lointaine')).not.toBeInTheDocument()
  })

  it('sait dire NON : sans prénom, la formule sans prénom — pas « Tes missions, »', () => {
    firstName.mockReturnValue('')
    render(<MissionsPage />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Tes missions')
    expect(heading.textContent).not.toContain(',')
  })

  it('#2192.6 — porte le point final EXACT de l’issue : « Tes missions, {prénom}. »', () => {
    firstName.mockReturnValue('Louis')
    render(<MissionsPage />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Tes missions, Louis.')
  })

  it('#2192.6 — sans prénom, le point final reste : « Tes missions. »', () => {
    firstName.mockReturnValue('')
    render(<MissionsPage />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Tes missions.')
  })

  it('remplace le sous-titre abstrait au lieu de s’ajouter à lui (#1347)', () => {
    render(<MissionsPage />)
    expect(screen.getByText(/démarrages/)).toBeInTheDocument()
    // L'ancienne phrase, celle que le retour qualifie de « trop abstraite ».
    expect(screen.queryByText(/pas par date de création/)).not.toBeInTheDocument()
  })

  /**
   * #2192.7 — LE SOUS-TITRE EXACT DE L'ISSUE.
   *
   * L'ancien texte (« Voici les missions actives qui nécessitent ton
   * attention, classées par urgence. ») ne nommait aucun des trois motifs que
   * l'issue liste explicitement — les démarrages, les échéances et les
   * renouvellements — alors que ce sont exactement les trois sujets que
   * l'écran organise (les trois onglets, les colonnes « Fin prévue » et
   * « Reconduction »).
   */
  it('#2192.7 — porte le sous-titre EXACT de l’issue', () => {
    render(<MissionsPage />)
    expect(
      screen.getByText(
        'Sécurise les démarrages, les échéances et les renouvellements avant qu’ils deviennent urgents.',
      ),
    ).toBeInTheDocument()
  })
})

/**
 * #2732.1 — LE GESTE DE CRÉATION RESTE OFFERT MÊME QUAND LA LISTE N'EST PAS VIDE.
 *
 * `MissionsEmptyState` (#2557.1) le dit déjà en toutes lettres : « le geste de
 * création… `/missions/nouvelle` est TOUJOURS offert ». Faux en pratique — ce
 * commentaire ne décrivait que l'état vide. Un espace avec des missions déjà
 * en cours (SKAIZen Group, retour bêta #2732) n'avait AUCUN bouton pour en
 * ajouter une : ni « Nouvelle mission » ni « Importer » nulle part sur
 * `/missions` dès que le tableau porte une ligne. Le seul chemin restant
 * (l'onglet Missions d'une fiche compte) suppose de savoir qu'il existe.
 */
describe('MissionsPage — la création reste offerte même quand la liste n’est pas vide (#2732.1)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    missions.mockReturnValue({ data: { missions: [mission()] }, isLoading: false, isError: false })
  })

  it('propose « Nouvelle mission » vers /missions/nouvelle, tableau déjà rempli', () => {
    render(<MissionsPage />)
    const link = screen.getByRole('link', { name: /nouvelle mission/i })
    expect(link.getAttribute('href')).toBe('/missions/nouvelle')
  })
})

/**
 * #3559 — /missions/renouvellements débordait de l'écran ; la route est
 * désormais un alias vers /missions (#3656). La borne `min-w-0`/`max-w-full`
 * posée alors sur la colonne de contenu de `RenewalsPage` (`752fe05e7`) a
 * disparu avec cette page : sans elle, un tableau large pousse à nouveau la
 * colonne flex au-delà de la largeur de l'écran. /missions, destination du
 * lien mort, doit porter la même borne.
 */
describe('MissionsPage — le contenu ne peut pas élargir la page (#3559)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })

  it('le tableau défile dans sa propre zone et la colonne de contenu est bornée', () => {
    missions.mockReturnValue({ data: { missions: [row({ label: 'Renfort data' })] }, isLoading: false, isError: false })
    render(<MissionsPage />)

    const table = screen.getByRole('table')
    expect(table.closest('[class*="overflow-x-auto"]')).not.toBeNull()

    const column = table.closest('[data-missions-content]')
    expect(column).not.toBeNull()
    expect(column?.className).toMatch(/\bmin-w-0\b/)
    expect(column?.className).toMatch(/\bmax-w-full\b/)
  })
})

/**
 * LA BARRE D'OUTILS DES DEUX LENTILLES — #1348, #1358, #1359, #1361, #1367, #1368.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Six retours demandaient six objets — une synthèse d'attention, une recherche,
 * trois filtres rapides, quatre indicateurs, un point d'entrée Laura, une
 * répartition en barres. Ils comptent les MÊMES populations, et ont été livrés
 * comme un seul objet : des pastilles comptées et cliquables.
 *
 * Ce qui se garde ici est donc la promesse commune : le compteur dit vrai, le
 * clic resserre, et un écran vidé par un filtre le DIT au lieu de se taire.
 */
/**
 * Une ligne DÉCORÉE, telle que `/delivery/missions` la rend — la mission à plat
 * PLUS ce que le service lit à côté (nom du compte, fenêtre, risques,
 * affectations). Le fixture `mission()` ne porte que la mission nue : passer
 * ces clés-là au travers d'un `Partial<Mission>` ne compilerait pas, et c'est
 * précisément le défaut « même nom, forme différente » que la garde de forme
 * (`delivery.shape.spec.ts`) existe pour attraper.
 */
function row(over: Partial<MissionView> = {}): MissionView {
  return { ...mission(), marginPercent: null, ...over } as MissionView
}

/**
 * #2408.60 — une date, `YYYY-MM-DD`, relative à l'horloge RÉELLE du test,
 * dans le fuseau du lecteur — même lecture que `isoDay` (`planning.ts`), que
 * `MissionsPage` utilise pour dater la facette « Consultants bientôt
 * disponibles ». Une date FIGÉE se serait périmée le jour où ce test tourne
 * après elle.
 */
function isoDateFromToday(daysFromToday: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** #3144 (27/09/2026, bêta) — les sept filtres vivent dans un dépliable
 *  « Filtres », fermé par défaut : tout test qui les exerce doit d'abord
 *  l'ouvrir, comme un utilisateur le ferait. */
async function openFilters(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Filtres' }))
}

/** Théo — les filtres secondaires (nature, porteur, canal, devise, BU) vivent sous « Plus de filtres ». */
async function openMoreFilters(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Plus de filtres' }))
}

describe('MissionsPage — chercher et resserrer (#1348, #1358, #1359, #1361, #1367, #1368)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false })
  })

  const running = (rows: unknown[]) =>
    missions.mockReturnValue({ data: { missions: rows, canReadFinance: true }, isLoading: false, isError: false })

  /**
   * #3144 (27/09/2026, bêta) — « header trop haut » : sept rangées de
   * filtres avant le tableau. Elles vivent désormais sous un dépliable
   * « Filtres », fermé à l'arrivée, avec le compteur de filtres ACTIFS
   * visible sur l'entête repliée.
   */
  describe('les filtres vivent sous un dépliable fermé par défaut (#3144)', () => {
    it('le dépliable est FERMÉ à l’arrivée — les options de filtre ne sont pas dans le DOM', () => {
      running([row({ id: 'a', label: 'TMA ACME', contract_kind: 'regie' })])
      render(<MissionsPage />)

      const toggle = screen.getByRole('button', { name: 'Filtres' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: /régie/i })).not.toBeInTheDocument()
    })

    it('sans filtre posé, aucun compteur ne s’affiche — jamais un « 0 »', () => {
      running([row({ id: 'a', label: 'TMA ACME', contract_kind: 'regie' })])
      render(<MissionsPage />)
      expect(screen.getByRole('button', { name: 'Filtres' })).not.toHaveTextContent('0')
    })

    it('poser un filtre le compte sur l’entête repliée', async () => {
      running([
        row({ id: 'a', label: 'TMA ACME', contract_kind: 'regie' }),
        row({ id: 'b', label: 'Forfait Delta', contract_kind: 'forfait' }),
      ])
      render(<MissionsPage />)
      await openFilters()
      await openMoreFilters()
      await userEvent.click(screen.getByRole('button', { name: /régie/i }))
      // Refermer révèle le compteur sur l'entête, sans quitter le filtre posé.
      await openFilters()
      expect(screen.getByRole('button', { name: 'Filtres' })).toHaveTextContent('1')
    })

    /**
     * Recette du 28/09/2026 (RÉFUTÉE) : mesuré en prod, le header fermé
     * faisait encore 511 px — les cinq pastilles rapides et le filtre
     * « Devise » restaient affichés HORS du dépliable, sur leurs propres
     * rangées toujours visibles. Ce test mesure la STRUCTURE : ce qui est
     * rendu quand c'est fermé ne porte plus aucune de ces deux rangées.
     */
    it('le header fermé ne porte plus les pastilles rapides ni le filtre devise, hors du dépliable', () => {
      running([
        row({ id: 'a', label: 'TMA ACME', renewal: 'j30', currency: 'CHF' }),
        row({ id: 'b', label: 'Forfait Delta', renewal: 'unknown', currency: 'EUR' }),
      ])
      render(<MissionsPage />)

      expect(screen.getByRole('button', { name: 'Filtres' })).toHaveAttribute('aria-expanded', 'false')
      for (const label of [
        'À renouveler',
        'Sans date de fin',
        'Avec risque',
        'Marge à risque',
        'Consultants bientôt disponibles',
      ]) {
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: /chf/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /devise/i })).not.toBeInTheDocument()

      // La recherche et l'action « Nouvelle mission » restent visibles :
      // seuls les FILTRES ont rejoint le dépliable.
      expect(screen.getByPlaceholderText(/rechercher une mission/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /nouvelle mission/i })).toBeInTheDocument()
    })

    it('poser une pastille rapide (facette) la compte AUSSI sur l’entête repliée', async () => {
      running([
        row({ id: 'a', label: 'TMA ACME', renewal: 'j30' }),
        row({ id: 'b', label: 'Forfait Delta', renewal: 'unknown' }),
      ])
      render(<MissionsPage />)
      await openFilters()
      await userEvent.click(screen.getByRole('button', { name: /à renouveler/i }))
      await openFilters()
      expect(screen.getByRole('button', { name: 'Filtres' })).toHaveTextContent('1')
    })

    it('poser le filtre devise le compte AUSSI sur l’entête repliée', async () => {
      running([
        row({ id: 'a', label: 'TMA ACME', currency: 'CHF' }),
        row({ id: 'b', label: 'Forfait Delta', currency: 'EUR' }),
      ])
      render(<MissionsPage />)
      await openFilters()
      await openMoreFilters()
      await userEvent.click(screen.getByRole('button', { name: /chf/i }))
      await openFilters()
      expect(screen.getByRole('button', { name: 'Filtres' })).toHaveTextContent('1')
    })

    /**
     * Recette du 28/09/2026, bis (RÉFUTÉE une seconde fois) : le dépliable de
     * la première correction #3144 (00h55) était bien fermé, mais mesuré en
     * prod ENSUITE, l'entête fermé faisait 589 px — PIRE que les 511 px
     * d'avant. La cause : `feat(web): 3 tuiles KPI cockpit missions`
     * (6ef8a6393) a fusionné SES tuiles, toujours visibles, APRÈS la première
     * correction — sans que ni l'une ni l'autre n'ait revu le total. Ce test
     * mesure la STRUCTURE : fermé, seule la rangée compacte (titre,
     * recherche, bouton « Filtres », action principale) rend quelque chose
     * au-dessus du tableau — ni les tuiles KPI, ni les pastilles rapides, ni
     * aucun des sept filtres.
     */
    it('fermé, seule la rangée compacte (titre, recherche, Filtres, action) rend quelque chose au-dessus du tableau', () => {
      running([
        row({ id: 'a', label: 'TMA ACME', renewal: 'j30', currency: 'CHF' }),
        row({ id: 'b', label: 'Forfait Delta', renewal: 'unknown', currency: 'EUR' }),
      ])
      render(<MissionsPage />)

      // La rangée compacte : le titre, la recherche, le bouton « Filtres »
      // (fermé) et l'action principale.
      expect(screen.getByRole('heading', { name: /tes missions/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/rechercher une mission/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Filtres' })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByRole('link', { name: /nouvelle mission/i })).toBeInTheDocument()

      // #2979 — les tuiles KPI (#2408.63/.64/.65) sont VISIBLES d'emblée dès 768 px
      // (recette prod 01/10 : « pas de tuile KPI » quand elles étaient repliées) ;
      // en mobile elles restent sous « Filtres » (voir le test mobile plus bas).
      expect(screen.getByTestId('mission-cockpit-kpis')).toBeInTheDocument()

      // Ni les pastilles rapides, ni « Devise », ni aucun des autres filtres.
      for (const label of [
        'À renouveler',
        'Sans date de fin',
        'Avec risque',
        'Marge à risque',
        'Consultants bientôt disponibles',
      ]) {
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: /chf/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /devise/i })).not.toBeInTheDocument()
    })

    it('déplier « Filtres » révèle « Devise » ; les tuiles KPI ne s’y répètent pas sur grand écran', async () => {
      running([
        row({ id: 'a', label: 'TMA ACME', currency: 'CHF' }),
        row({ id: 'b', label: 'Forfait Delta', currency: 'EUR' }),
      ])
      render(<MissionsPage />)
      await openFilters()
      await openMoreFilters()
      expect(screen.getAllByTestId('mission-cockpit-kpis')).toHaveLength(1)
      expect(screen.getByRole('button', { name: /chf/i })).toBeInTheDocument()
    })

    it('en mobile, les tuiles KPI restent sous « Filtres » — jamais un empilement de ~330 px en tête', async () => {
      const original = window.matchMedia
      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      })) as typeof window.matchMedia
      try {
        running([row({ id: 'a', label: 'TMA ACME' })])
        render(<MissionsPage />)
        expect(screen.queryByTestId('mission-cockpit-kpis')).not.toBeInTheDocument()
        await openFilters()
        expect(screen.getAllByTestId('mission-cockpit-kpis')).toHaveLength(1)
      } finally {
        window.matchMedia = original
      }
    })
  })

  /**
   * ⚠️ La requête passe par le PLACEHOLDER et non par `getByRole('searchbox')` :
   * `SearchInput` rend un `type="text"`, donc le rôle est `textbox`, et le
   * champ n'a pas d'autre nom accessible que son placeholder. C'est un manque
   * de la primitive PARTAGÉE — trente écrans la montent —, pas de cet écran :
   * le corriger ici en déclarerait un second, et se traiterait à part.
   */
  it('cherche sur le nom du compte comme sur celui du consultant (#1358)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', accountName: 'ACME' }),
      row({
        id: 'b',
        label: 'Renfort data',
        accountName: 'Nova Logistique',
        assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }],
      }),
    ])
    render(<MissionsPage />)
    await userEvent.type(screen.getByPlaceholderText(/rechercher une mission/i), 'salome')
    expect(screen.getByText('Renfort data')).toBeInTheDocument()
    expect(screen.queryByText('TMA ACME')).not.toBeInTheDocument()
  })

  /**
   * ⚠️ LE COMPTEUR EST LA PARTIE QUI MENT LE PLUS FACILEMENT.
   *
   * #1348 demandait « 1 renouvellement à engager · 3 missions sans date de
   * fin » — des chiffres. Un compteur juste au-dessus d'une liste qu'il ne
   * décrit pas est pire qu'aucun compteur : c'est ce que le lot 4 a payé le
   * plus cher. Ce test lie les deux.
   */
  it('compte chaque population, et le clic ne montre QUE celle-là (#1348, #1359)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', renewal: 'j30', risks: [] }),
      row({ id: 'b', label: 'Renfort data', renewal: 'unknown', risks: ['no_end_date'] }),
      row({ id: 'c', label: 'Cadrage Zenith', renewal: 'far', risks: [] }),
    ])
    render(<MissionsPage />)
    await openFilters()

    const toRenew = screen.getByRole('button', { name: /à renouveler/i })
    expect(toRenew).toHaveTextContent('1')

    await userEvent.click(toRenew)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Renfort data')).not.toBeInTheDocument()
    expect(screen.queryByText('Cadrage Zenith')).not.toBeInTheDocument()
  })

  /**
   * #2408.43 — LE FILTRE « NATURE », même patron que le filtre « Statut »
   * (#2407.5) : la colonne `contractKind` existait déjà (`columns.ts`), sans
   * filtre dessus — la seule porte était la recherche texte libre.
   */
  it('filtre par nature de contrat, sur le PARC entier (#2408.43)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', contract_kind: 'regie' }),
      row({ id: 'b', label: 'Forfait Delta', contract_kind: 'forfait' }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    const regie = screen.getByRole('button', { name: /régie/i })
    await userEvent.click(regie)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Forfait Delta')).not.toBeInTheDocument()
  })

  // Théo — décision Louis 23/10 : multi-sélection partout. Deux natures cochées s'ADDITIONNENT ; recocher en retire une.
  it('Théo — deux natures de contrat cochées s’additionnent, une troisième mission reste écartée', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', contract_kind: 'regie' }),
      row({ id: 'b', label: 'Forfait Delta', contract_kind: 'forfait' }),
      row({ id: 'c', label: 'Recrutement Zeta', contract_kind: 'recrutement' }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    await userEvent.click(screen.getByRole('button', { name: /régie/i }))
    await userEvent.click(screen.getByRole('button', { name: /forfait/i }))
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.getByText('Forfait Delta')).toBeInTheDocument()
    expect(screen.queryByText('Recrutement Zeta')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /régie/i }))
    expect(screen.queryByText('TMA ACME')).not.toBeInTheDocument()
    expect(screen.getByText('Forfait Delta')).toBeInTheDocument()
  })

  it('Théo — « Plus de filtres » est fermé à l’arrivée : nature et porteur n’y sont pas avant le clic', async () => {
    running([row({ id: 'a', label: 'TMA ACME', contract_kind: 'regie', ownerName: 'Camille Roy' })])
    render(<MissionsPage />)
    await openFilters()
    expect(screen.getByRole('button', { name: 'Plus de filtres' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /régie/i })).not.toBeInTheDocument()
    await openMoreFilters()
    expect(screen.getByRole('button', { name: /régie/i })).toBeInTheDocument()
  })

  /**
   * #2408.38 — LE FILTRE « PORTEUR », même patron que « Nature » juste
   * au-dessus. Sans porteur renseigné DU TOUT sur le parc, le filtre ne se
   * rend pas — testé séparément ci-dessous.
   */
  it('filtre par porteur, sur le PARC entier (#2408.38)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', ownerName: 'Camille Roy' }),
      row({ id: 'b', label: 'Forfait Delta', ownerName: 'Inès Kaczmarek' }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    const owner = screen.getByRole('button', { name: /camille roy/i })
    await userEvent.click(owner)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Forfait Delta')).not.toBeInTheDocument()
  })

  it('#2408.38 — aucun porteur renseigné sur le parc : le filtre ne se rend pas', async () => {
    running([row({ id: 'a', label: 'TMA ACME', ownerName: null })])
    render(<MissionsPage />)
    await openFilters()
    expect(screen.queryByRole('group', { name: /porteur/i })).not.toBeInTheDocument()
  })

  /**
   * #2408.52, #2408.62 — LE FILTRE « CANAL », même patron que « Nature » et
   * « Porteur » ci-dessus : `mission_commercial_terms.channel` remonte
   * désormais sur `/missions` (`DeliveryService.list`), sans porte de filtre
   * dessus jusqu'ici. C'est aussi ce qui rend la vue enregistrée
   * « Partenaires/rang 2 » atteignable : l'utilisateur clique ce filtre puis
   * l'enregistre lui-même (même mécanisme que #2408.54).
   */
  it('filtre par canal de staffing, sur le PARC entier (#2408.52)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', channel: 'partner' }),
      row({ id: 'b', label: 'Forfait Delta', channel: 'direct' }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    const partner = screen.getByRole('button', { name: /via partenaire/i })
    await userEvent.click(partner)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Forfait Delta')).not.toBeInTheDocument()
  })

  it('#2408.52 — aucun canal connu sur le parc (sans `finance:read`, ou pas de conditions commerciales) : le filtre ne se rend pas', async () => {
    running([row({ id: 'a', label: 'TMA ACME', channel: undefined })])
    render(<MissionsPage />)
    await openFilters()
    expect(screen.queryByRole('group', { name: /canal/i })).not.toBeInTheDocument()
  })

  /**
   * #2408.53 — LE FILTRE « DEVISE », même patron que « Canal » juste
   * au-dessus : `mission_commercial_terms.currency` remonte désormais sur
   * `/missions` (`DeliveryService.list`), sans porte de filtre dessus
   * jusqu'ici. Ensemble OUVERT (ISO 4217) : les options sont celles
   * RENCONTRÉES, pas une énumération de contrat.
   */
  it('filtre par devise, sur le PARC entier (#2408.53)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', currency: 'CHF' }),
      row({ id: 'b', label: 'Forfait Delta', currency: 'EUR' }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    const chf = screen.getByRole('button', { name: /chf/i })
    await userEvent.click(chf)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Forfait Delta')).not.toBeInTheDocument()
  })

  it('#2408.53 — aucune devise connue sur le parc (sans `finance:read`, ou devise non renseignée) : le filtre ne se rend pas', () => {
    running([row({ id: 'a', label: 'TMA ACME', currency: undefined })])
    render(<MissionsPage />)
    expect(screen.queryByRole('group', { name: /devise/i })).not.toBeInTheDocument()
  })

  it('#2408.53 — une devise `null` (ligne de conditions commerciales lue, mais non renseignée) ne rend pas le filtre non plus', () => {
    running([row({ id: 'a', label: 'TMA ACME', currency: null })])
    render(<MissionsPage />)
    expect(screen.queryByRole('group', { name: /devise/i })).not.toBeInTheDocument()
  })

  it('filtre par BU / agence du compte porteur, sur le PARC entier (#2408.39, #2408.40)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', businessUnitName: 'Agence Lyon' }),
      row({ id: 'b', label: 'Forfait Delta', businessUnitName: 'Agence Paris' }),
      row({ id: 'c', label: 'Régie Sans BU', businessUnitName: null }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    await userEvent.click(screen.getByRole('button', { name: /agence lyon/i }))
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Forfait Delta')).not.toBeInTheDocument()
    expect(screen.queryByText('Régie Sans BU')).not.toBeInTheDocument()
  })

  it('#2979 — le compteur du chip BU est celui de la vue ACTIVE : les missions terminées ne comptent pas', async () => {
    // Recette prod 02/10 : chip « Agence Lyon 14 » → 10 lignes. Le chip
    // comptait aussi les missions finies que la vue « En cours » écarte.
    running([
      row({ id: 'a', label: 'TMA ACME', businessUnitName: 'Agence Lyon' }),
      row({ id: 'b', label: 'Forfait Delta', businessUnitName: 'Agence Lyon' }),
      row({ id: 'c', label: 'Régie Finie', businessUnitName: 'Agence Lyon', status: 'ended' }),
      row({ id: 'd', label: 'Régie Finie Paris', businessUnitName: 'Agence Paris', status: 'terminated' }),
    ])
    render(<MissionsPage />)
    await openFilters()
    await openMoreFilters()

    const lyon = screen.getByRole('button', { name: /agence lyon/i })
    expect(lyon).toHaveTextContent('2')
    expect(lyon).not.toHaveTextContent('3')
    // Une BU que seules des missions finies portent n'a aucune pastille.
    expect(screen.queryByRole('button', { name: /agence paris/i })).not.toBeInTheDocument()
    await userEvent.click(lyon)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.getByText('Forfait Delta')).toBeInTheDocument()
    expect(screen.queryByText('Régie Finie')).not.toBeInTheDocument()
  })

  it('#2408.39 — aucune BU connue sur le parc : le filtre ne se rend pas', () => {
    running([row({ id: 'a', label: 'TMA ACME', businessUnitName: null })])
    render(<MissionsPage />)
    expect(screen.queryByRole('group', { name: /bu \/ agence/i })).not.toBeInTheDocument()
  })

  /**
   * #2408.60 — LA PASTILLE « Consultants bientôt disponibles », la vue
   * enregistrée que #2408 nomme (résolue par le mécanisme #2408.54, comme
   * .56/.59/.61/.62 : aucune persistance dédiée). Les dates sont calculées
   * relativement à l'horloge RÉELLE du test (`isoDateFromToday`), jamais une
   * date figée dans le semis — `userEvent` et les horloges FACTICES ne font
   * pas bon ménage (le clic n'aboutit jamais, `MissionsPage.test.tsx` n'en
   * utilise nulle part ailleurs).
   */
  describe('#2408.60 — la pastille « Consultants bientôt disponibles »', () => {
    it('filtre sur une fin CONFIRMÉE et proche, jamais une reconduction signée', async () => {
      running([
        row({
          id: 'a',
          label: 'TMA ACME',
          ends_on: isoDateFromToday(10),
          assignees: [{ id: 'c-1', fullName: 'Yanis Cordier', photoUrl: null }],
          renewal_status: null,
        }),
        row({
          id: 'b',
          label: 'Forfait Delta',
          ends_on: isoDateFromToday(10),
          assignees: [{ id: 'c-2', fullName: 'Camille Aubert', photoUrl: null }],
          renewal_status: 'renouvele',
        }),
      ])
      render(<MissionsPage />)
      await openFilters()

      const chip = screen.getByRole('button', { name: /consultants bientôt disponibles/i })
      await userEvent.click(chip)
      expect(screen.getByText('TMA ACME')).toBeInTheDocument()
      expect(screen.queryByText('Forfait Delta')).not.toBeInTheDocument()
    })

    it('affiche un ZÉRO compté quand aucune mission ne libère un consultant sous 30 jours', async () => {
      running([
        row({ id: 'a', label: 'TMA ACME', ends_on: isoDateFromToday(400), assignees: [], renewal_status: null }),
      ])
      render(<MissionsPage />)
      await openFilters()
      const group = screen.getByRole('group', { name: /filtres rapides/i })
      expect(within(group).getByText(/consultants bientôt disponibles/i)).toBeInTheDocument()
    })
  })

  /**
   * #2408.45 — LE FILTRE « FIN », complet sur les fenêtres individuelles.
   * `toRenew` ne resserre QUE sur échue/imminente/J-15/J-30 (`TO_RENEW_WINDOWS`,
   * `filters.ts`) : J-45 et J-60 n'avaient aucune porte de filtre sur cette
   * lentille, seule la colonne « Fin » les affichait.
   */
  it('filtre par fenêtre de fin, sur une valeur que « À renouveler » ne couvre pas (#2408.45)', async () => {
    running([row({ id: 'a', label: 'J45 ACME', renewal: 'j45' }), row({ id: 'b', label: 'J60 Delta', renewal: 'j60' })])
    render(<MissionsPage />)
    await openFilters()

    const j45 = screen.getByRole('button', { name: /sous 45 jours/i })
    await userEvent.click(j45)
    expect(screen.getByText('J45 ACME')).toBeInTheDocument()
    expect(screen.queryByText('J60 Delta')).not.toBeInTheDocument()
  })

  /**
   * ⚠️ `far` ne se sert QUE sur `/delivery/renewals` (`includeFar: true`,
   * `delivery.service.ts`) : `GET /delivery/missions` (cette lentille) ne
   * l'envoie jamais. Une pastille « far » resterait bloquée à zéro pour tout
   * le monde — même garde que la pastille « Marge » (#2408.49).
   */
  it('#2408.45 — la fenêtre « far » n’est PAS une option ici, cette lentille ne la sert jamais', async () => {
    running([row({ id: 'a', label: 'TMA ACME', renewal: 'j30' })])
    render(<MissionsPage />)
    await openFilters()
    expect(screen.queryByRole('button', { name: /au-delà de 60 jours/i })).not.toBeInTheDocument()
  })

  /**
   * #2408.41 — LE FILTRE « CLIENT », un SÉLECTEUR dédié en plus de la
   * recherche texte libre déjà là.
   */
  it('filtre par compte, sur le PARC entier (#2408.41)', async () => {
    running([
      row({ id: 'a', label: 'TMA ACME', accountName: 'ACME' }),
      row({ id: 'b', label: 'Refonte Nova', accountName: 'Nova Logistique' }),
    ])
    render(<MissionsPage />)
    await openFilters()

    const clientGroup = screen.getByRole('group', { name: /client/i })
    const acme = within(clientGroup).getByRole('button', { name: /ACME/i })
    await userEvent.click(acme)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Refonte Nova')).not.toBeInTheDocument()
  })

  /**
   * #2408.42 — LE FILTRE « CONSULTANT », même geste que « Client ».
   */
  it('filtre par consultant, sur le PARC entier (#2408.42)', async () => {
    running([
      row({
        id: 'a',
        label: 'TMA ACME',
        assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }],
      }),
      row({
        id: 'b',
        label: 'Refonte Nova',
        assignees: [{ id: 'c-2', fullName: 'Inès Kaczmarek', photoUrl: null }],
      }),
    ])
    render(<MissionsPage />)
    await openFilters()

    const salome = screen.getByRole('button', { name: /salomé dufour/i })
    await userEvent.click(salome)
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
    expect(screen.queryByText('Refonte Nova')).not.toBeInTheDocument()
  })

  it('DIT quand un filtre a tout vidé, au lieu de laisser un écran muet', async () => {
    running([row({ id: 'a', label: 'TMA ACME', renewal: 'far', risks: [] })])
    render(<MissionsPage />)
    await userEvent.type(screen.getByPlaceholderText(/rechercher une mission/i), 'introuvable')
    expect(screen.getByText(/aucune mission ne répond à ce filtre/i)).toBeInTheDocument()

    // La porte de sortie existe, et elle rend la liste entière.
    await userEvent.click(screen.getByRole('button', { name: /retirer les filtres/i }))
    expect(screen.getByText('TMA ACME')).toBeInTheDocument()
  })

  /**
   * #2408.89 — le NO-GO du registre : « interdit de mettre toutes les
   * missions au même niveau ». Le tri par défaut (rang d'urgence de
   * renouvellement, `RENEWAL_WINDOWS_IN_URGENCY_ORDER`) est ce qui l'empêche
   * concrètement — ce test le PROUVE en mesurant l'ORDRE DE RENDU, pas
   * seulement la présence des trois lignes.
   */
  it('sait dire NON : le tri par défaut ne met jamais deux missions au même rang (#2408.89)', () => {
    running([
      row({ id: 'a', label: 'Cadrage Zenith', renewal: 'far' }),
      row({ id: 'b', label: 'TMA ACME', renewal: 'overdue' }),
      row({ id: 'c', label: 'Renfort data', renewal: 'unknown' }),
    ])
    render(<MissionsPage />)
    const buttons = screen.getAllByRole('button', { name: /^(Cadrage Zenith|TMA ACME|Renfort data)$/ })
    // overdue < unknown < far dans l'échelle d'urgence : la mission en retard
    // de renouvellement remonte EN PREMIER, celle sans échéance connue ne
    // s'enterre pas derrière celle dont l'échéance est simplement lointaine.
    expect(buttons.map(b => b.textContent)).toEqual(['TMA ACME', 'Renfort data', 'Cadrage Zenith'])
  })

  /**
   * #1825 — « mettre colonne justifié à droite, sur la même ligne que
   * rechercher une mission pour gagner de l'espace sur la page ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUE CE TEST PEUT PROUVER, ET CE QU'IL NE PEUT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * jsdom ne met rien en page : il ne peut pas mesurer que deux éléments
   * s'affichent sur la même ligne visuelle. Il peut vérifier la STRUCTURE DOM
   * qui produit ce résultat — avant #1825, le sélecteur vivait dans un second
   * `<Box>` empilé SOUS la barre de recherche (deux rangées, quoi qu'on mette
   * dedans) ; il rejoint désormais le MÊME conteneur flex qu'elle.
   */
  it('met le sélecteur de colonnes SUR LA MÊME rangée que la recherche, lentille « En cours » (#1825)', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ label: 'TMA ACME' })] },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    const search = screen.getByPlaceholderText(/rechercher une mission/i)
    const columnsButton = screen.getByRole('button', { name: 'Colonnes' })
    // `SearchInput` enveloppe son `<input>` dans son propre `<div>` (l'icône),
    // et l'`<input>` porte LUI-MÊME la classe `flex` (mise en page de son
    // contenu, sans rapport avec la rangée) — d'où le départ au PARENT plutôt
    // que sur l'`<input>` lui-même, qui matcherait `.closest('.flex')` sur SOI.
    const row = search.parentElement?.closest('.flex')
    expect(row).not.toBeNull()
    expect(columnsButton.parentElement).toBe(row)
  })
})

/**
 * #2408.63 — L'APPELANT RÉEL de `MissionCockpitKpiTiles` : le formatage des
 * montants et la convention « non mesuré » ont déjà leurs tests
 * (`MissionCockpitKpiTiles.test.tsx`) ; celui-ci vérifie seulement que
 * l'écran la MONTE, avec le compte RÉEL de la lentille « En cours ».
 */
describe('MissionsPage — les tuiles KPI du cockpit (#2408.63)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    forecastHorizons.mockClear()
  })

  it('affiche le compte RÉEL de missions actives de cette lentille', async () => {
    missions.mockReturnValue({
      data: { missions: [mission({ label: 'TMA ACME' }), mission({ id: 'b', label: 'Refonte SI' })] },
      isLoading: false,
      isError: false,
    })
    crmCounters.mockReturnValue({
      data: {
        counters: { missions_active: { value: 2 } },
        secured_revenue_month: { measured: false },
      },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    // #2979 — visibles d'emblée sur grand écran (sous « Filtres » en mobile, #3144).
    expect(within(screen.getByTestId('mission-cockpit-kpis')).getByText('2')).toBeInTheDocument()
  })

  it('ne demande le prévisionnel qu’avec finance:read — jamais un 403 pour rien', () => {
    missions.mockReturnValue({
      data: { missions: [mission({ label: 'TMA ACME' })], canReadFinance: false },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(forecastHorizons).toHaveBeenCalledWith('month', false)
  })

  it('ne se rend pas sur une lentille vide — une tuile ne compte rien', () => {
    missions.mockReturnValue({ data: { missions: [] }, isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.queryByTestId('mission-cockpit-kpis')).not.toBeInTheDocument()
  })
})

/**
 * Refonte Théo (23/10) — la liste des missions dans la grammaire de `c/missions-planning`, vue
 * « Tableau » : en-tête, bandeau de source, trois repères cliquables, barre (vues, recherche,
 * filtres, colonnes), puis le tableau commun. Un test qui sait dire NON sur l'ordre des blocs.
 */
describe('Théo — la page Missions en vue Tableau', () => {
  const blocks = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[data-theo-block]')).map(node => node.getAttribute('data-theo-block'))
  const inDays = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    missions.mockReturnValue({
      data: {
        missions: [
          mission({ id: '11111111-1111-4111-8111-1111111111a1', label: 'Mission sans fin', ends_on: null }),
          mission({
            id: '11111111-1111-4111-8111-1111111111a2',
            label: 'Mission datée',
            ends_on: inDays(200),
            renewal: 'far',
          } as Partial<Mission>),
          mission({
            id: '11111111-1111-4111-8111-1111111111a3',
            label: 'Mission à démarrer',
            status: 'ready_to_start',
            ends_on: inDays(300),
            renewal: 'far',
          } as Partial<Mission>),
        ],
      },
      isLoading: false,
      isError: false,
    })
  })

  it('les blocs dans l’ordre de la maquette : repères, barre, tableau', () => {
    const { container } = render(<MissionsPage />)
    expect(blocks(container)).toEqual(['stats', 'toolbar', 'table'])
  })

  it('« Nouvelle mission » vit dans l’en-tête, à droite du titre', () => {
    render(<MissionsPage />)
    const head = screen.getByTestId('missions-page-head')
    expect(within(head).getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(within(head).getByRole('link', { name: 'Nouvelle mission' })).toHaveAttribute('href', '/missions/nouvelle')
  })

  it('la bascule de vue : Planning mène au planning, Tableau est la vue courante', () => {
    render(<MissionsPage />)
    const views = within(screen.getByRole('navigation', { name: 'Vues des missions' }))
    expect(views.getByRole('link', { name: 'Planning' })).toHaveAttribute('href', '/missions/planification')
    expect(views.getByText('Tableau')).toHaveAttribute('aria-current', 'page')
  })

  it('trois repères : fins sous 30 jours, démarrages prévus, fins non renseignées — une absence en mots', () => {
    const counter = (value: number) => ({ value, measured: true, definition_key: 'k' })
    crmCounters.mockReturnValue({
      data: {
        counters: { missions_active: counter(3), missions_ending_30: counter(0) },
        secured_revenue_month: { measured: false, amounts: null, definition_key: 'k' },
      },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    const stats = within(screen.getByTestId('missions-stats'))
    expect(stats.getByRole('button', { name: /Fins sous 30 jours/ })).toHaveTextContent('Aucune')
    expect(stats.getByRole('button', { name: /Démarrages prévus/ })).toHaveTextContent('1')
    expect(stats.getByRole('button', { name: /Fins non renseignées/ })).toHaveTextContent('1')
  })

  it('un repère se clique : « Fins non renseignées » ne laisse que les missions sans date de fin', () => {
    render(<MissionsPage />)
    fireEvent.click(within(screen.getByTestId('missions-stats')).getByRole('button', { name: /Fins non renseignées/ }))
    expect(screen.getByText('Mission sans fin')).toBeInTheDocument()
    expect(screen.queryByText('Mission datée')).not.toBeInTheDocument()
  })

  it('« Démarrages prévus » ne laisse que les missions signées pas encore démarrées, et se retire', () => {
    render(<MissionsPage />)
    const stat = within(screen.getByTestId('missions-stats')).getByRole('button', { name: /Démarrages prévus/ })
    fireEvent.click(stat)
    expect(stat).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Mission à démarrer')).toBeInTheDocument()
    expect(screen.queryByText('Mission datée')).not.toBeInTheDocument()
    fireEvent.click(stat)
    expect(screen.getByText('Mission datée')).toBeInTheDocument()
  })
})

/**
 * L15 (contrat Louis 31/10/2026) — les vues prêtes (#2408.54/.56/.57/.58/.59)
 * et les DROITS : un rôle sans `finance:read` ne voit ni les tuiles de
 * facturation (#2408.68/.69), ni la colonne Marge, ni la vue « Marge non
 * mesurée ».
 */
describe('MissionsPage — vues prêtes et droits finance (L15)', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    pipeline.mockReset()
    pipeline.mockReturnValue({ data: undefined, isLoading: false })
  })

  const rows = [
    { ...mission({ id: 'a1111111-1111-4111-8111-111111111111', label: 'TMA ACME' }), risks: ['timesheet_missing'] },
    { ...mission({ id: 'b1111111-1111-4111-8111-111111111111', label: 'Run Airbus' }), risks: ['margin_unknown'] },
  ]

  it('« CRA manquants » ne garde que la mission au relevé manquant ; un second clic la rend', async () => {
    missions.mockReturnValue({ data: { missions: rows, canReadFinance: true }, isLoading: false, isError: false })
    render(<MissionsPage />)
    const views = within(screen.getByTestId('mission-preset-views'))
    await userEvent.click(views.getByRole('button', { name: /CRA manquants/ }))
    expect(screen.getAllByText('TMA ACME').length).toBeGreaterThan(0)
    expect(screen.queryByText('Run Airbus')).not.toBeInTheDocument()
    await userEvent.click(views.getByRole('button', { name: /CRA manquants/ }))
    expect(screen.getAllByText('Run Airbus').length).toBeGreaterThan(0)
  })

  it('avec finance:read : les vues financières et les tuiles de facturation sont là', () => {
    missions.mockReturnValue({ data: { missions: rows, canReadFinance: true }, isLoading: false, isError: false })
    render(<MissionsPage />)
    const views = within(screen.getByTestId('mission-preset-views'))
    expect(views.getByRole('button', { name: /Marge non mesurée/ })).toBeInTheDocument()
    expect(within(screen.getByTestId('mission-cockpit-kpis')).getByText('Factures échues')).toBeInTheDocument()
  })

  it('sans finance:read : ni vue Marge, ni tuile de facturation, ni colonne Marge', () => {
    missions.mockReturnValue({ data: { missions: rows, canReadFinance: false }, isLoading: false, isError: false })
    render(<MissionsPage />)
    const views = within(screen.getByTestId('mission-preset-views'))
    expect(views.getByRole('button', { name: /CRA manquants/ })).toBeInTheDocument()
    expect(views.queryByRole('button', { name: /Marge non mesurée/ })).not.toBeInTheDocument()
    expect(views.queryByRole('button', { name: /Factures bloquées/ })).not.toBeInTheDocument()
    expect(screen.queryByText('CA facturable non facturé')).not.toBeInTheDocument()
    expect(screen.queryByText('Factures échues')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Marge' })).not.toBeInTheDocument()
  })
})

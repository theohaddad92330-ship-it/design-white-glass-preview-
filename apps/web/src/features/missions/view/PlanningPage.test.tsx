import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'
import { resetLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'

// #2989 (recette 27/09) — le refus de glisser une barre bloquée s'annonce par
// un toast (`toast.info`, `PlanningPage.tsx`) : le faux capture l'appel SANS
// monter de `<Toaster>` réel, ce fichier ne mesure pas le rendu de sonner.
const toastInfo = vi.fn()
// #4193 — les compteurs viennent de `GET /crm-counters` (`useQuery`) ; cet
// écran ne monte pas de `QueryClientProvider`.
const crmCounters = vi.hoisted(() => ({ endingIn30: null as number | null }))
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({
    data:
      crmCounters.endingIn30 === null
        ? undefined
        : { counters: { missions_ending_30: { value: crmCounters.endingIn30 } } },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { info: (...args: unknown[]) => toastInfo(...args) } }))

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

const missions = vi.fn()
// Point propre MISSIONS-A — la disponibilité déclarée vient du vivier (`available_from`).
const consultants = vi.hoisted(() => ({ list: [] as { id: string; available_from: string | null }[] }))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => ({ data: consultants.list }) }))
// L'entête (#1369) porte le prénom du profil. Le hook réel lit `useProfile` +
// `useAuth`, et `useAuth` réclame une session : ce fichier n'a aucune raison de
// monter l'authentification pour mesurer une frise.
const firstName = vi.fn(() => '')

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName() }))

// ⚠️ Le faux est PARTIEL, et il doit l'être : `assigneeNames` est une pure
// fonction du même module, et un faux exhaustif la ferait disparaître —
// l'écran plantait alors sur « No "assigneeNames" export is defined ».
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  useMissions: () => missions(),
}))
// #2989 — le catalogue des BU de l'espace, INDÉPENDANT des missions chargées
// (voir la doc de `businessUnitOptions`, `PlanningPage.tsx`). Faux minimal :
// vide par défaut (`beforeEach`), une entrée là où le test le pose.
const businessUnits = vi.fn(() => ({ data: { businessUnits: [] as { name: string }[], viewerAccess: 'workspace' } }))
vi.mock('@/features/business-units/hooks/useMyBusinessUnits', () => ({
  useMyBusinessUnits: () => businessUnits(),
}))
// #2194.44 — le glissement d'une barre écrit par le MÊME chemin que
// `MissionDateField` du panneau latéral (`useUpdateMission`), jamais une
// route inventée pour l'occasion. Faux minimal : ce fichier ne mesure pas
// l'écriture elle-même (mesurée en pur dans `planning.test.ts` et par
// composition dans `MissionDetailPanel.test.tsx`), seulement que la frise
// se monte sans réclamer un client de requêtes réel.
const updateMission = vi.fn(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('./mission-panel.api', () => ({
  useUpdateMission: () => updateMission(),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// #1375 — `AskLaura` rend un `<Link>` de TanStack, qui réclame un routeur monté.
// Le faux expose la QUESTION dans le `href` : c'est elle qu'on veut mesurer
// (« Laura reçoit la fenêtre temporelle et les filtres actifs »), pas la
// présence d'un bouton.
// #2194.33, #2194.34, #2194.35 — `params` en plus de `search` : le menu de
// ligne résout `/consultants/$id/reverse-market`, même précaution que
// `MissionDetailPanel.test.tsx` — un faux qui jette `params` teste le faux,
// pas le composant.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    params,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    params?: Record<string, string>
    children: React.ReactNode
  }) => {
    const resolved = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    return (
      <a href={search?.prompt ? `${resolved}?prompt=${encodeURIComponent(search.prompt)}` : resolved} {...rest}>
        {children}
      </a>
    )
  },
  useNavigate: () => () => undefined,
}))
// Le panneau a ses propres tests ; ici on vérifie qu'il S'OUVRE, pas ce qu'il
// contient — le monter en vrai tirerait plusieurs requêtes de plus.
vi.mock('./MissionDetailPanel', () => ({
  MissionDetailPanel: ({ mission }: { mission: { label: string } }) => (
    <div data-testid="detail-panel">{mission.label}</div>
  ),
}))

// Théo missions-planning — le COUP D'ŒIL a ses propres tests (`PlanningPeekDialog.test.tsx`) ; ici on mesure
// qu'une barre, une ligne ou « Détail » l'OUVRE sur la bonne mission.
vi.mock('./PlanningPeekDialog', () => ({
  PlanningPeekDialog: ({ mission, onMore }: { mission: { label: string }; onMore: () => void }) => (
    <div data-testid="peek">
      {mission.label}
      <button type="button" onClick={onMore}>
        Plus de détails
      </button>
    </div>
  ),
}))
// La fenêtre de création a ses propres tests (`PlanningCreateDialog.test.tsx`) : elle lit des requêtes.
vi.mock('./PlanningCreateDialog', () => ({
  PlanningCreateDialog: () => <div data-testid="create-dialog" />,
}))
// Le board lit ses données par requête : il a ses propres tests (`PlanningBoard.test.tsx`).
vi.mock('./PlanningBoard', () => ({ PlanningBoard: () => <div data-testid="board" /> }))
// #4291.8 — monté dans tout espace désormais ; son rendu a ses propres tests (PlanningSignedProjects.regie.test.tsx).
vi.mock('./PlanningSignedProjects', () => ({ PlanningSignedProjects: () => null }))
// Les vues enregistrées lisent le registre par requête : `PlanningViewsDialog.test.tsx`.
vi.mock('./PlanningViewsDialog', () => ({
  PlanningViewsDialog: ({ current, onApply }: { current: { scale: number }; onApply: (view: unknown) => void }) => (
    <div data-testid="views-dialog">
      <span data-testid="views-current-scale">{current.scale}</span>
      <button
        type="button"
        onClick={() =>
          onApply({
            filters: {
              account: ['ORION'],
              consultant: [],
              owner: [],
              situation: [],
              skill: [],
              clientTeam: [],
              availability: [],
              businessUnit: [],
            },
            chips: [],
            anchor: '2026-09',
            scale: 6,
            groupBy: 'account',
            withFinished: false,
          })
        }
      >
        Appliquer la vue
      </button>
    </div>
  ),
}))

// Théo C missions-planning.N6 — le bouton d'export a ses propres tests (il lit la règle d'espace, un `useQuery`).
vi.mock('./PlanningExportButton', () => ({ PlanningExportButton: () => null }))
// Théo C missions-planning.HT1 — le panneau « Bloquées » a ses propres tests ; ici on mesure qu'il REMPLACE la frise.
vi.mock('./PlanningBlockedPanel', () => ({
  PlanningBlockedPanel: ({ onClear }: { onClear: () => void }) => (
    <div data-testid="blocked-panel">
      <button type="button" onClick={onClear}>
        Retirer le filtre
      </button>
    </div>
  ),
}))

const { PlanningPage } = await import('./PlanningPage')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
/** Le 29 août 2026 : la fenêtre par défaut couvre juillet → octobre. */
const NOW = new Date(2026, 7, 29, 12, 0, 0)

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active',
    started_on: '2026-07-10',
    ends_on: '2026-09-20',
    daily_rate: 620,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: 'Ingénieur d’exploitation',
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    accountName: 'ACME',
    assignees: [{ id: 'c-1', fullName: 'Yanis Berthier', photoUrl: null }],
    marginPercent: null,
    ...over,
  }
}

function show(
  over: Partial<{
    data: { missions: MissionView[]; canReadFinance: boolean; intercontractCount?: number }
    isLoading: boolean
    isError: boolean
  }> = {},
) {
  missions.mockReturnValue({
    data: { missions: [mission()], canReadFinance: false },
    isLoading: false,
    isError: false,
    ...over,
  })
  return render(<PlanningPage now={NOW} />)
}

beforeEach(() => {
  cleanup()
  missions.mockReset()
  businessUnits.mockReset()
  businessUnits.mockReturnValue({ data: { businessUnits: [], viewerAccess: 'workspace' } })
  toastInfo.mockReset()
})

/**
 * L'ÉCRAN « PLANIFICATION » — la frise que PDF-22 appelle « celui qui manque le
 * plus », et qui rendait « Page introuvable » en production le 29/08/2026.
 *
 * Ce que ces tests gardent tient en une phrase : **aucune barre n'affirme une
 * date que personne n'a saisie.** Une fin absente, un démarrage absent, une
 * saisie incohérente et une mission hors fenêtre ont chacun leur rendu, et
 * aucun des quatre ne ressemble à « ça finit ici ».
 */
describe('PlanningPage — la frise', () => {
  // #2194.1
  it('écrit « Missions » et sa phrase d’ouverture, comme la maquette', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Missions' })).toBeInTheDocument()
    expect(screen.getByText(/qui intervient, jusqu’à quand/i)).toBeInTheDocument()
  })

  // #3558 — « supprime ce texte » : la règle de la barre ouverte n'est plus écrite.
  it('n’écrit plus la règle « la barre reste ouverte » sous l’entête (#3558)', () => {
    show()
    expect(screen.queryByText(/la barre reste ouverte/i)).not.toBeInTheDocument()
  })

  // #4351.1 — « En cours » n'est plus un onglet : sa liste et la création se joignent d'ici.
  it('joint la liste des missions et la création depuis Planning (#4351.1)', async () => {
    show()
    expect(screen.getByRole('link', { name: 'Liste des missions' })).toHaveAttribute('href', '/missions')
    // Théo missions-planning.R8 — « Nouvelle mission » ouvre la fenêtre aux trois portes, plus une page.
    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Nouvelle mission' }))
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument()
  })

  it('ouvre sur les quatre mois qui entourent aujourd’hui', () => {
    const { container } = show()
    // Juillet est le mois précédent : le repère « aujourd'hui » se lit au
    // milieu, pas collé au bord gauche.
    // ⚠️ La recherche est BORNÉE à l'entête de la frise : depuis #1373 la
    // colonne de droite écrit « Disponible à partir du 21 sept. », et une
    // recherche sur toute la page attraperait ce mois-là aussi.
    const header = container.querySelector('[data-slot="planning-months"]') as HTMLElement
    expect(header).not.toBeNull()
    for (const month of [/juil/i, /août/i, /sept/i, /oct/i]) {
      expect(within(header).getByText(month)).toBeInTheDocument()
    }
  })

  /**
   * #1374 — L'ÉCHELLE DE LA FRISE.
   *
   * Deux choix, et le plus court fait QUATRE mois, pas trois : la fenêtre de
   * renouvellement la plus large du produit est J+60, et une frise plus courte
   * ne montrerait jamais l'échéance qu'on demande d'anticiper ici.
   */
  it('propose deux échelles, et la plus courte couvre l’horizon de renouvellement', async () => {
    const { container } = show()
    // Théo — l'échelle est un SÉLECTEUR (« 4 mois »), plus une rangée de pastilles.
    expect(screen.getByRole('combobox', { name: 'Durée affichée' })).toHaveTextContent('4 mois')
    await user().click(screen.getByRole('combobox', { name: 'Durée affichée' }))
    await user().click(screen.getByRole('option', { name: '6 mois' }))
    const header = container.querySelector('[data-slot="planning-months"]') as HTMLElement
    // Juillet → décembre : deux mois de plus, et décembre n'était pas là avant.
    expect(within(header).getByText(/déc/i)).toBeInTheDocument()
  })

  it('dessine une barre par mission, ouvrable au clavier', async () => {
    show()
    const row = screen.getByRole('button', { name: /ouvrir la mission renfort plateforme/i })
    // ⚠️ Un `<div onClick>` n'a ni tabulation ni Entrée ni annonce (GA-35).
    expect(row.tagName).toBe('BUTTON')
    await user().click(row)
    // Théo missions-planning — d'abord le coup d'œil ; le panneau complet s'ouvre sur « Plus de détails ».
    expect(screen.getByTestId('peek')).toHaveTextContent('Renfort plateforme')
    expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Plus de détails' }))
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('Renfort plateforme')
  })

  it('« Détail », dans la colonne « Après la mission », ouvre la même mission', async () => {
    show()
    await user().click(screen.getByRole('button', { name: 'Détail de Renfort plateforme' }))
    expect(screen.getByTestId('peek')).toHaveTextContent('Renfort plateforme')
  })

  // #2194.11
  it('écrit le rôle sous le compte, et n’affiche AUCUNE ligne quand il est absent', () => {
    show({ data: { missions: [mission({ role_title: null })], canReadFinance: false } })
    expect(screen.queryByText('Ingénieur d’exploitation')).not.toBeInTheDocument()
  })

  it('écrit le rôle quand il est renseigné', () => {
    show()
    expect(screen.getByText('Ingénieur d’exploitation')).toBeInTheDocument()
  })

  // RV4-E-FIX 4291.1 (famille, recette prod 20/10) — « Assistant documentaire GenAI — pilote » tronqué par
  // `whitespace-nowrap` + ellipsis (scrollWidth 256 / clientWidth 191) : le nom passe à la ligne (2 lignes) et
  // reste lisible en entier à l'infobulle, jamais coupé sans recours.
  it('RV4-E-FIX 4291.1 — le nom de la mission est écrit SUR la barre, et se lit en entier à l’infobulle (jamais coupé sans recours)', () => {
    show({ data: { missions: [mission({ label: 'Assistant documentaire GenAI — pilote' })], canReadFinance: false } })
    const name = screen.getByText('Assistant documentaire GenAI — pilote')
    expect(name).toHaveAttribute('title', 'Assistant documentaire GenAI — pilote')
    // La barre est un dessin : son texte est décoratif, le nom accessible vit sur la poignée.
    expect(name.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  // #2194.17
  it('montre le risque de la mission quand il y en a un', () => {
    show({ data: { missions: [mission({ risks: ['timesheet_disputed'] })], canReadFinance: false } })
    expect(screen.getByText('Relevé contesté')).toBeInTheDocument()
  })

  it('ne montre RIEN sur le risque quand il n’y en a pas — pas de "aucun risque" sur une ligne de frise', () => {
    show({ data: { missions: [mission({ risks: [] })], canReadFinance: false } })
    expect(screen.queryByText(/risque/i)).not.toBeInTheDocument()
  })

  it('marque aujourd’hui dans la fenêtre, et RETIRE le repère quand il en sort', async () => {
    show()
    // Les boutons portent le même mot ; le REPÈRE est le seul à ne pas en être
    // un, et c'est lui qu'on mesure.
    expect(markers()).toHaveLength(1)

    const u = user()
    // Six mois plus loin, « aujourd'hui » n'est plus dans la fenêtre.
    for (let step = 0; step < 6; step += 1) {
      await u.click(screen.getByRole('button', { name: /fenêtre suivante/i }))
    }
    // ⚠️ Le repère DISPARAÎT — il ne retombe pas à 0 %, ce qui le poserait sur
    // le 1er du premier mois et tracerait « nous sommes ici » sur une date
    // fausse.
    expect(markers()).toHaveLength(0)
  })
})

/** Les mentions d'« aujourd'hui » qui ne sont PAS un bouton : le repère. */
function markers(): HTMLElement[] {
  return screen.queryAllByText(/aujourd’hui/i).filter(element => element.closest('button') === null)
}

describe('PlanningPage — ce qui n’a pas de date', () => {
  /**
   * #1372 — LA PHRASE A QUITTÉ LA BARRE, ELLE N'A PAS DISPARU.
   *
   * Le défaut mesuré en production : « Commencée avant la fenêtre. Sans date de
   * fin — le bord droit de la barre n'est pas une échéance. » s'écrivait
   * par-dessus la barre violette, illisible. Le retour tranche — un libellé
   * court sur la ligne, la phrase entière en infobulle.
   *
   * ⚠️ Ce test porte sur les DEUX : un correctif qui ne garderait que le
   * libellé court aurait perdu la règle, qui est ce qui explique un bord ouvert.
   */
  it('DIT qu’une mission sans fin n’a pas d’échéance — en court sur la ligne, en entier en infobulle', () => {
    show({ data: { missions: [mission({ ends_on: null })], canReadFinance: false } })
    const short = screen.getByText(/^fin inconnue$/i)
    expect(short).toBeInTheDocument()
    expect(short).toHaveAttribute('title', expect.stringContaining('n’est pas une échéance'))
    // Et elle est comptée à part : « 0 échéance » seul se lirait « rien à
    // renouveler », alors que la vérité est « rien n'a été promis ».
    expect(screen.getByRole('button', { name: /sans date de fin 1/i })).toBeInTheDocument()
  })

  /**
   * #1372 — LA PISTE NE PORTE QUE LE DESSIN.
   *
   * C'est la garde structurelle du correctif : tant qu'aucun texte ne vit dans
   * la piste, aucun texte ne peut s'écraser sur une barre. Vérifier la taille
   * de police ou la couleur n'aurait rien prouvé — c'est la POSITION qui était
   * fautive, et jsdom ne met rien en page.
   */
  it('ne laisse AUCUN texte dans la piste de la frise', () => {
    const { container } = show({
      data: {
        missions: [mission({ started_on: null, ends_on: null, id: 'x' }), mission({ started_on: '2026-01-05' })],
        canReadFinance: false,
      },
    })
    const tracks = container.querySelectorAll('span.relative.flex.min-w-0.flex-1.items-center')
    expect(tracks.length).toBeGreaterThan(0)
    for (const track of tracks) {
      // Le seul texte de la piste est celui de la BARRE (l'intitulé et la fin, décoratifs) : les notes de bord
      // et la disponibilité restent dans leur colonne, où rien ne les écrase.
      const clone = track.cloneNode(true) as HTMLElement
      for (const bar of clone.querySelectorAll('[aria-hidden="true"]')) bar.remove()
      expect((clone.textContent ?? '').trim()).toBe('')
    }
  })

  /**
   * #1373 — LA PROMESSE DE L'ÉCRAN, ÉCRITE.
   *
   * « Éviter que l'utilisateur soit obligé de lire mentalement la position de
   * la barre pour répondre à la question la plus importante. »
   */
  it('écrit quand la personne se libère, et n’estime RIEN sans date de fin', () => {
    show({
      data: {
        missions: [
          mission({ id: 'a', label: 'Avec fin', ends_on: '2026-09-20' }),
          mission({ id: 'b', label: 'Sans fin', ends_on: null }),
        ],
        canReadFinance: false,
      },
    })
    // `ends_on` est le dernier jour OCCUPÉ — la frise le compte ainsi (`+ 1`
    // sur la largeur). La disponibilité est donc le LENDEMAIN, et la date est
    // FORMATÉE, jamais l'ISO brut.
    expect(screen.getByText(/après le 21 sept\. 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/2026-09-21/)).not.toBeInTheDocument()
    // Sans date de fin : aucune disponibilité inventée.
    expect(screen.getByText(/^fin inconnue$/i)).toBeInTheDocument()
    expect(screen.queryByText(/après le.*sans fin/i)).not.toBeInTheDocument()
  })

  /**
   * #2410.60 (LAU-FINAL-124, NO-GO du chapitre) — un renouvellement OUVERT
   * n'affiche jamais une disponibilité certaine. `renewal_status` est
   * l'APPELANT réel du défaut : `availabilityFrom` recevait `ends_on` sans
   * lui, et « à renouveler » rendait le même vert qu'une fin confirmée.
   */
  it('n’affiche jamais le vert « certaine » sur un renouvellement ouvert, en discussion ou absent', () => {
    show({
      data: {
        missions: [
          mission({ id: 'a', label: 'À renouveler', ends_on: '2026-09-20', renewal_status: 'non_engage' }),
          mission({ id: 'b', label: 'En discussion', ends_on: '2026-09-20', renewal_status: 'discussion_en_cours' }),
          mission({ id: 'c', label: 'Sans statut', ends_on: '2026-09-20', renewal_status: undefined }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.getAllByText(/sous réserve de la suite/i)).toHaveLength(3)
    expect(screen.queryByText(/fin confirmée/i)).not.toBeInTheDocument()
  })

  it('une fin CONFIRMÉE par le client reste une disponibilité certaine, en vert, sans réserve', () => {
    show({
      data: {
        missions: [mission({ label: 'Mission close', ends_on: '2026-09-20', renewal_status: 'fin_confirmee' })],
        canReadFinance: false,
      },
    })
    expect(screen.getByText(/^après le 21 sept\. 2026$/i)).toBeInTheDocument()
    expect(screen.getByText(/^fin confirmée$/i)).toBeInTheDocument()
    expect(screen.queryByText(/sous réserve de la suite/i)).not.toBeInTheDocument()
  })

  it('une reconduction SIGNÉE ne libère personne à cette date', () => {
    show({
      data: {
        missions: [mission({ label: 'Reconduite', ends_on: '2026-09-20', renewal_status: 'renouvele' })],
        canReadFinance: false,
      },
    })
    expect(screen.getByText(/renouvelée — pas de disponibilité à cette date/i)).toBeInTheDocument()
    expect(screen.queryByText(/disponible/i)).not.toBeInTheDocument()
  })

  it('sort de la frise une mission sans AUCUNE date, et la nomme', () => {
    show({
      data: { missions: [mission({ started_on: null, ends_on: null })], canReadFinance: false },
    })
    const block = screen.getByRole('group', { name: /sans date exploitable/i })
    expect(within(block).getByText(/renfort plateforme/i)).toBeInTheDocument()
    expect(screen.getByText(/leur donnerait une date que personne n’a saisie/i)).toBeInTheDocument()
  })

  it('nomme une mission datée hors de la fenêtre plutôt que de la coller au bord', () => {
    show({
      data: {
        missions: [mission({ started_on: '2024-01-05', ends_on: '2024-03-04' })],
        canReadFinance: false,
      },
    })
    expect(screen.getByText(/1 mission est datée en dehors de ces mois/i)).toBeInTheDocument()
  })

  it('range à part une mission qui finit avant de commencer', () => {
    show({
      data: {
        missions: [mission({ started_on: '2026-09-20', ends_on: '2026-07-10' })],
        canReadFinance: false,
      },
    })
    expect(screen.getByRole('group', { name: /dates à corriger/i })).toBeInTheDocument()
  })

  it('distingue « personne d’affecté » de « les affectations n’ont pas pu être lues »', () => {
    show({ data: { missions: [mission({ assignees: null })], canReadFinance: false } })
    expect(screen.getByText(/les affectations n’ont pas pu être lues/i)).toBeInTheDocument()
    expect(screen.queryByText(/personne d’affecté/i)).not.toBeInTheDocument()

    cleanup()
    show({ data: { missions: [mission({ assignees: [] })], canReadFinance: false } })
    expect(screen.getByText(/personne d’affecté/i)).toBeInTheDocument()
  })
})

describe('PlanningPage — la fenêtre', () => {
  it('avance et recule d’un mois, et sait revenir à aujourd’hui', async () => {
    const { container } = show()
    const header = () => within(container.querySelector('[data-slot="planning-months"]') as HTMLElement)
    const u = user()
    await u.click(screen.getByRole('button', { name: /fenêtre suivante/i }))
    expect(header().getByText(/nov/i)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /^aujourd’hui$/i }))
    expect(header().queryByText(/nov/i)).not.toBeInTheDocument()
    expect(header().getByText(/juil/i)).toBeInTheDocument()
  })

  it('dit ce que la fenêtre ne contient pas, plutôt que de rendre une frise vide sans un mot', async () => {
    show({
      data: {
        missions: [mission({ started_on: '2024-01-05', ends_on: '2024-03-04' })],
        canReadFinance: false,
      },
    })
    expect(screen.getByText(/rien à planifier sur ces mois/i)).toBeInTheDocument()
  })
})

describe('PlanningPage — ce que l’écran refuse de dire', () => {
  it('n’affiche AUCUN compteur pendant le chargement', () => {
    show({ data: undefined, isLoading: true })
    // Le zéro de chargement ment : « 0 mission sur la fenêtre » le temps d'une
    // requête envoie chercher une panne qui n'existe pas.
    expect(screen.queryByText(/mission sur la fenêtre/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^0/)).not.toBeInTheDocument()
  })

  it('ne rend jamais un échec de lecture comme « aucune mission »', () => {
    show({ data: undefined, isError: true })
    expect(screen.getByText(/les missions n’ont pas pu être chargées/i)).toBeInTheDocument()
    expect(screen.queryByText(/rien à planifier/i)).not.toBeInTheDocument()
  })

  it('DIT que la lecture plafonne quand elle rend exactement le plafond', () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      mission({ id: `1111111${String(index).padStart(4, '0')}`, label: `Mission ${index}` }),
    )
    show({ data: { missions: rows, canReadFinance: false } })
    // Une frise qui montre 200 lignes sur 260 sans le dire est un sous-ensemble
    // faux sous un écran qui promet « la planification ».
    expect(screen.getByText(/plafonne à 200 lignes/i)).toBeInTheDocument()
  })

  it('n’écrit AUCUN montant, quel que soit le droit financier du lecteur', () => {
    // Un écran de planification répond « qui, jusqu'à quand », pas « combien ».
    // N'ayant aucun montant, il n'a pas non plus de « 0 € » possible — et le
    // TJM, lui, reste sur la fiche, où il est déjà gardé.
    show({ data: { missions: [mission({ daily_rate: 620 })], canReadFinance: true } })
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
    expect(screen.queryByText(/620/)).not.toBeInTheDocument()
    expect(screen.queryByText(/marge/i)).not.toBeInTheDocument()
  })

  it('ne dessine pas les missions terminées, et compte celles qu’il écarte', async () => {
    show({
      data: {
        missions: [mission(), mission({ id: 'ended-1', label: 'Ancienne mission', status: 'ended' })],
        canReadFinance: false,
      },
    })
    expect(screen.queryByRole('button', { name: /ouvrir la mission ancienne mission/i })).not.toBeInTheDocument()
    expect(screen.getByText(/1 mission terminée n’est pas dessinée/i)).toBeInTheDocument()
    await user().click(screen.getByRole('checkbox', { name: /inclure les missions terminées/i }))
    expect(screen.getByRole('button', { name: /ouvrir la mission ancienne mission/i })).toBeInTheDocument()
  })
})

describe('PlanningPage — la recherche', () => {
  it('resserre sur le nom du compte comme sur celui du consultant', async () => {
    show({
      data: {
        missions: [
          mission(),
          mission({
            id: 'other',
            label: 'Cadrage données',
            accountName: 'Zenith',
            assignees: [{ id: 'c-2', fullName: 'Inès Kaczmarek', photoUrl: null }],
          }),
        ],
        canReadFinance: false,
      },
    })
    const u = user()
    await u.type(screen.getByRole('searchbox', { name: /rechercher/i }), 'zenith')
    expect(screen.getByRole('button', { name: /ouvrir la mission cadrage données/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission renfort plateforme/i })).not.toBeInTheDocument()

    await u.clear(screen.getByRole('searchbox', { name: /rechercher/i }))
    await u.type(screen.getByRole('searchbox', { name: /rechercher/i }), 'kaczmarek')
    expect(screen.getByRole('button', { name: /ouvrir la mission cadrage données/i })).toBeInTheDocument()
  })
})

/**
 * LA SYNTHÈSE, LES FILTRES ET LAURA — #1370, #1371, #1374, #1375.
 */
/** Ouvre « Filtrer le planning », coche des valeurs (sous « Plus de filtres » si besoin) et applique. */
async function applyFilters(...labels: (string | RegExp)[]) {
  const u = user()
  await u.click(screen.getByRole('button', { name: /^filtres/i }))
  const dialog = screen.getByRole('dialog', { name: 'Filtrer le planning' })
  const more = within(dialog).queryByText('Plus de filtres')
  if (more) await u.click(more)
  for (const label of labels) await u.click(within(dialog).getByRole('checkbox', { name: label }))
  await u.click(within(dialog).getByRole('button', { name: 'Appliquer' }))
}

describe('PlanningPage — resserrer la frise (#1370, #1374)', () => {
  const missionsForFilters = () => [
    mission({
      id: 'a',
      label: 'Démarre dans la fenêtre',
      accountName: 'NOVA',
      started_on: '2026-08-03',
      ends_on: '2026-09-20',
      assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }],
      ownerName: 'Nadia Fontaine',
    }),
    mission({
      id: 'b',
      label: 'Sans fin connue',
      accountName: 'ORION',
      started_on: '2026-05-03',
      ends_on: null,
      status: 'paused',
      assignees: [{ id: 'c2', fullName: 'Sam Bertrand', photoUrl: null }],
      ownerName: 'Julien Roussel',
    }),
  ]

  it('compte les quatre pastilles, et n’en fait PAS une cinquième du total', () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    // Le total reste du TEXTE : une pastille qui filtre sur tout ne filtre rien.
    expect(screen.getByText(/2 missions sur la fenêtre/i)).toBeInTheDocument()
    // « a » finit le 20/09 (dans les 30 jours du 29/08) ; « b » n'a pas de fin ; rien ne démarre ; aucun conflit.
    expect(screen.getByRole('button', { name: /échéances sous 30 j 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sans date de fin 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /à démarrer 0/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /à vérifier 0/i })).toBeInTheDocument()
  })

  // #2194.3, #2194.4 — TRANCHÉ 16/09/2026 : « tout ajouter, en dur ».
  it('affiche les fins sous 30 jours et les consultants qui se libèrent bientôt, en TEXTE (pas une pastille)', () => {
    // #4193 — le nombre vient de `GET /crm-counters` (missions_ending_30), plus d'un calcul local.
    crmCounters.endingIn30 = 1
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    // Mission « a » finit le 20/09, dans les 30 jours du 29/08 (aujourd'hui du test).
    expect(screen.getByText(/1 finit sous 30 jours/i)).toBeInTheDocument()
    crmCounters.endingIn30 = null
    // Léa (mission « a ») se libère le 21/09 — dans la fenêtre de 30 jours.
    expect(screen.getByText(/1 consultant se libère bientôt/i)).toBeInTheDocument()
  })

  // #2194.7 / #2194.43
  it('lie vers le vivier ENTIER — un compte qui vient du serveur, jamais recalculé sur les 200 missions affichées', () => {
    show({
      data: { missions: missionsForFilters(), canReadFinance: false, intercontractCount: 4 },
    })
    const link = screen.getByRole('link', { name: /4 consultants en intercontrat/i })
    expect(link).toHaveAttribute('href', '/consultants')
  })

  it('rend 0 — jamais un texte manquant — quand l’API ne sert pas encore le compte (déploiement en cours)', () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    expect(screen.getByRole('link', { name: /0 consultant en intercontrat/i })).toBeInTheDocument()
  })

  it('« consultants qui se libèrent bientôt » reste un indicateur de PORTEFEUILLE — un filtre de compte ne le change pas', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    // Filtre sur ORION (mission « b », sans consultant bientôt libre) : la
    // frise se resserre, mais l'indicateur de portefeuille ne bouge pas —
    // Léa (mission « a », NOVA) reste bientôt disponible ailleurs.
    await applyFilters('ORION')
    expect(screen.getByText(/1 consultant se libère bientôt/i)).toBeInTheDocument()
  })

  // #2194.6
  it('n’affiche AUCUN bloc « conflits » quand il n’y en a pas', () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    expect(screen.queryByText(/conflit/i)).not.toBeInTheDocument()
  })

  it('signale un conflit, avec ses axes — jamais un total nu', () => {
    show({
      data: {
        missions: [
          mission({
            id: 'a',
            label: 'Première',
            started_on: '2026-08-01',
            ends_on: '2026-09-10',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }],
          }),
          mission({
            id: 'b',
            label: 'Seconde, en chevauchement',
            started_on: '2026-09-05',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }],
          }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.getByText(/1 conflit\b/i)).toBeInTheDocument()
    expect(screen.getByText(/1 chevauchement/i)).toBeInTheDocument()
  })

  // #2194.39
  it('signale une SURALLOCATION quand la même personne dépasse 100 % de charge aujourd’hui', () => {
    show({
      data: {
        missions: [
          mission({
            id: 'a',
            label: 'Première',
            started_on: '2026-08-01',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null, loadPercent: 70 }],
          }),
          mission({
            id: 'b',
            label: 'Seconde, EN COURS elle aussi aujourd’hui',
            started_on: '2026-08-10',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null, loadPercent: 60 }],
          }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.getByText(/1 surallocation/i)).toBeInTheDocument()
  })

  // #2989.2 — recette 26/09 : le résumé comptait déjà « 1 surallocation »,
  // mais aucune ligne ne nommait la personne ni son cumul.
  it('nomme la personne suralloué SUR SA LIGNE — « Suralloué · 130 % », pas seulement dans le résumé', () => {
    show({
      data: {
        missions: [
          mission({
            id: 'a',
            label: 'Première',
            started_on: '2026-08-01',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null, loadPercent: 70 }],
          }),
          mission({
            id: 'b',
            label: 'Seconde, EN COURS elle aussi aujourd’hui',
            started_on: '2026-08-10',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null, loadPercent: 60 }],
          }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.getAllByText(/suralloué · 130 %/i)).toHaveLength(2)
  })

  it('n’affiche AUCUN badge de surallocation quand personne ne dépasse 100 %', () => {
    show()
    expect(screen.queryByText(/suralloué/i)).not.toBeInTheDocument()
  })

  it('ne signale AUCUNE surallocation quand la charge des affectations n’est pas connue — jamais comptée 0', () => {
    show({
      data: {
        missions: [
          mission({
            id: 'a',
            started_on: '2026-08-01',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }],
          }),
          mission({
            id: 'b',
            started_on: '2026-08-10',
            ends_on: '2026-10-01',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }],
          }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.queryByText(/surallocation/i)).not.toBeInTheDocument()
  })

  it('une pastille RETIENT exactement ce qu’elle annonce', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: /sans date de fin 1/i }))
    expect(screen.getByRole('button', { name: /ouvrir la mission sans fin connue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).not.toBeInTheDocument()
  })

  it('les comptes des pastilles ne tombent PAS à zéro quand une autre est cochée', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: /sans date de fin 1/i }))
    // « Échéances sous 30 j » compte toujours 1 : un « 0 » qu'un clic remplit se lit
    // comme une panne.
    expect(screen.getByRole('button', { name: /échéances sous 30 j 1/i })).toBeInTheDocument()
  })

  it('filtre sur un consultant, et ne propose que ceux qui sont RÉELLEMENT là', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: /^filtres/i }))
    const dialog = screen.getByRole('dialog', { name: 'Filtrer le planning' })
    expect(within(dialog).getByRole('checkbox', { name: 'Léa Kaczmarek' })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'Sam Bertrand' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'Personne Inconnue' })).not.toBeInTheDocument()
    await user().click(within(dialog).getByRole('checkbox', { name: 'Léa Kaczmarek' }))
    await user().click(within(dialog).getByRole('button', { name: 'Appliquer' }))
    expect(screen.getByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission sans fin connue/i })).not.toBeInTheDocument()
  })

  it('filtre sur un compte', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await applyFilters('ORION')
    expect(screen.getByRole('button', { name: /ouvrir la mission sans fin connue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).not.toBeInTheDocument()
  })

  // Décision de Louis (23/10/2026) — multi-sélection partout : deux comptes cochés sont un OU.
  it('filtre sur PLUSIEURS comptes à la fois', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await applyFilters('NOVA', 'ORION')
    expect(screen.getByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ouvrir la mission sans fin connue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /filtres · 1/i })).toBeInTheDocument()
  })

  it('« Réinitialiser » dans la fenêtre remet tous les critères à vide avant d’appliquer', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await applyFilters('ORION')
    const u = user()
    await u.click(screen.getByRole('button', { name: /^filtres/i }))
    const dialog = screen.getByRole('dialog', { name: 'Filtrer le planning' })
    await u.click(within(dialog).getByRole('button', { name: 'Réinitialiser' }))
    await u.click(within(dialog).getByRole('button', { name: 'Appliquer' }))
    expect(screen.getByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).toBeInTheDocument()
  })

  it('range les critères secondaires sous « Plus de filtres », les pertinents d’abord', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: /^filtres/i }))
    const dialog = screen.getByRole('dialog', { name: 'Filtrer le planning' })
    const groups = [...dialog.querySelectorAll('fieldset[data-filter]')].map(node => node.getAttribute('data-filter'))
    expect(groups.slice(0, 4)).toEqual(['account', 'consultant', 'owner', 'situation'])
    expect(groups).toContain('availability')
    expect(within(dialog).getByText('Plus de filtres')).toBeInTheDocument()
  })

  // #2194.23
  it('filtre sur un porteur', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await applyFilters('Nadia Fontaine')
    expect(screen.getByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission sans fin connue/i })).not.toBeInTheDocument()
  })

  // #2194.22
  it('filtre sur une BU — celle du COMPTE porteur', async () => {
    show({
      data: {
        missions: [
          mission({
            id: 'a',
            label: 'Démarre dans la fenêtre',
            accountName: 'NOVA',
            started_on: '2026-08-03',
            ends_on: '2026-09-20',
            businessUnitName: 'Agence Lyon',
          }),
          mission({
            id: 'b',
            label: 'Sans fin connue',
            accountName: 'ORION',
            started_on: '2026-05-03',
            ends_on: null,
            status: 'paused',
            businessUnitName: 'Agence Paris',
          }),
        ],
        canReadFinance: false,
      },
    })
    await applyFilters('Agence Lyon')
    expect(screen.getByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission sans fin connue/i })).not.toBeInTheDocument()
  })

  it('ne propose AUCUNE option de BU quand l’espace n’en porte aucune', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: /^filtres/i }))
    expect(document.querySelector('fieldset[data-filter="businessUnit"]')).toBeNull()
  })

  /**
   * #2989 (26/09/2026, recette écran répétée) — le filtre restait ABSENT même
   * une fois le compte porteur d'exemple rattaché à une BU : ses options
   * venaient UNIQUEMENT des missions `narrowed` (recherche, AUTRES filtres
   * déjà posés) — un rail vide pour une raison sans rapport avec les BU
   * faisait disparaître le filtre lui-même, pas seulement ses valeurs. Il est
   * désormais visible dès que l'espace porte au moins une BU, MÊME quand
   * aucune mission actuellement chargée n'en porte une.
   */
  it('#2989 — le filtre BU reste visible même quand aucune mission chargée n’en porte une', async () => {
    businessUnits.mockReturnValue({
      data: { businessUnits: [{ name: 'Agence Lyon' }], viewerAccess: 'workspace' },
    })
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: /^filtres/i }))
    expect(document.querySelector('fieldset[data-filter="businessUnit"]')).not.toBeNull()
  })

  // #2194.26
  it('filtre sur une compétence portée par un affecté ACTIF', async () => {
    show({
      data: {
        missions: [
          mission({
            id: 'a',
            label: 'Démarre dans la fenêtre',
            accountName: 'NOVA',
            started_on: '2026-08-03',
            ends_on: '2026-09-20',
            assignedSkills: ['kubernetes'],
          }),
          mission({
            id: 'b',
            label: 'Sans fin connue',
            accountName: 'ORION',
            started_on: '2026-05-03',
            ends_on: null,
            status: 'paused',
            assignedSkills: ['react'],
          }),
        ],
        canReadFinance: false,
      },
    })
    await applyFilters('kubernetes')
    expect(screen.getByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission sans fin connue/i })).not.toBeInTheDocument()
  })

  it('ne confond jamais `null` (lecture illisible) et `[]` (aucune compétence) avec une compétence portée', async () => {
    show({
      data: {
        missions: [mission({ id: 'a', assignedSkills: null }), mission({ id: 'b', assignedSkills: [] })],
        canReadFinance: false,
      },
    })
    await user().click(screen.getByRole('button', { name: /^filtres/i }))
    expect(document.querySelector('fieldset[data-filter="skill"]')).toBeNull()
  })

  // #2194.28
  it('filtre sur la disponibilité', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    // « Sans fin connue » (id b) n'a pas de date de fin : disponibilité inconnue.
    await applyFilters('Inconnue')
    expect(screen.getByRole('button', { name: /ouvrir la mission sans fin connue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission démarre dans la fenêtre/i })).not.toBeInTheDocument()
  })

  it('un filtre qui vide la frise se DÉFAIT depuis l’état vide', async () => {
    show({ data: { missions: missionsForFilters(), canReadFinance: false } })
    await applyFilters('Léa Kaczmarek')
    await user().click(screen.getByRole('button', { name: /sans date de fin/i }))
    // Aucune ligne : Léa n'a pas de mission sans date de fin.
    expect(screen.getByText(/aucune mission ne correspond/i)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: /effacer la recherche/i }))
    expect(screen.getByRole('button', { name: /ouvrir la mission sans fin connue/i })).toBeInTheDocument()
  })
})

describe('PlanningPage — reconnaître les gens et les clients (#1371)', () => {
  it('dessine le logo du compte et l’avatar du consultant, sans imbriquer de lien dans la ligne', () => {
    const { container } = show({
      data: {
        missions: [
          mission({
            accountName: 'NOVA LOGISTIQUE',
            accountLogoUrl: 'https://example.test/nova.png',
            assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: 'https://example.test/lea.png' }],
          }),
        ],
        canReadFinance: false,
      },
    })
    const row = screen.getByRole('button', { name: /ouvrir la mission renfort plateforme/i })
    expect(within(row).getByText(/nova logistique/i)).toBeInTheDocument()
    expect(within(row).getByText(/léa kaczmarek/i)).toBeInTheDocument()
    // ⚠️ La ligne EST un bouton : un lien ou un bouton imbriqué produirait un
    // HTML invalide et un ordre de tabulation imprévisible (GA-35).
    expect(row.querySelectorAll('a, button').length).toBe(0)
    expect(container.querySelectorAll('button button').length).toBe(0)
  })
})

// #2194.33, #2194.34, #2194.35
describe('PlanningPage — le menu de la ligne', () => {
  it('porte le bouton « … » HORS de la ligne cliquable — jamais un bouton dans un bouton (GA-35)', () => {
    const { container } = show()
    const row = screen.getByRole('button', { name: /ouvrir la mission renfort plateforme/i })
    const kebab = screen.getByRole('button', { name: /actions sur renfort plateforme/i })
    expect(row).not.toBe(kebab)
    expect(row.contains(kebab)).toBe(false)
    expect(container.querySelectorAll('button button').length).toBe(0)
  })

  it('propose « Préparer le renouvellement », vers le dossier de la mission (#3656)', async () => {
    show()
    await user().click(screen.getByRole('button', { name: /actions sur renfort plateforme/i }))
    const link = screen.getByRole('menuitem', { name: /préparer le renouvellement/i })
    expect(link).toHaveAttribute('href', '/missions/11111111-1111-4111-8111-111111111111')
  })

  it('propose « Trouver des missions » pour une personne IDENTIFIÉE, vers sa fiche', async () => {
    show({
      data: {
        missions: [mission({ assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }] })],
        canReadFinance: false,
      },
    })
    await user().click(screen.getByRole('button', { name: /actions sur renfort plateforme/i }))
    const link = screen.getByRole('menuitem', { name: /trouver des missions pour léa kaczmarek/i })
    expect(link).toHaveAttribute('href', '/consultants/c1/reverse-market')
  })

  it('n’offre PAS « Trouver des missions » pour une affectation SANS identité — envoyer vers le premier homonyme serait pire (#1371)', async () => {
    show({
      data: {
        missions: [mission({ assignees: [{ id: null, fullName: 'Julien Roussel', photoUrl: null }] })],
        canReadFinance: false,
      },
    })
    await user().click(screen.getByRole('button', { name: /actions sur renfort plateforme/i }))
    expect(screen.queryByRole('menuitem', { name: /trouver des missions/i })).not.toBeInTheDocument()
  })

  it('propose « Créer un besoin interne »', async () => {
    show()
    await user().click(screen.getByRole('button', { name: /actions sur renfort plateforme/i }))
    const link = screen.getByRole('menuitem', { name: /créer un besoin interne/i })
    expect(link).toHaveAttribute('href', '/projects/needs')
  })
})

describe('PlanningPage — Laura (#1375)', () => {
  it('ouvre la conversation avec la FENÊTRE et les filtres actifs dans la question', async () => {
    show({
      data: {
        missions: [mission({ accountName: 'NOVA', assignees: [{ id: 'c1', fullName: 'Léa', photoUrl: null }] })],
        canReadFinance: false,
      },
    })
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, le CTA ouvre la bulle SUR PLACE : la question part
    // dans le magasin de Laura, lue ici comme la bulle la lit.
    const askedQuestion = async (): Promise<string> => {
      resetLauraIntro()
      await user().click(screen.getByRole('button', { name: /demander à laura sur mon planning/i }))
      return renderHook(() => useLauraOpenRequest()).result.current?.question ?? ''
    }
    const before = await askedQuestion()
    // La fenêtre est LISIBLE, jamais en ISO brut.
    expect(before).toMatch(/1 juillet 2026/i)
    expect(before).toMatch(/31 octobre 2026/i)
    expect(before).not.toMatch(/2026-07-01/)

    await applyFilters('NOVA')
    const after = await askedQuestion()
    expect(after).toMatch(/le compte NOVA/i)
  })
})

/**
 * LES SIGNES DE BORD, ET L'ENDROIT OÙ ILS SONT POSÉS — #1372.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CES DEUX TESTS EXISTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Défaut mesuré EN RECETTE le 04/09/2026, la veille du jour où ces lignes sont
 * écrites : les chevrons étaient posés en `-left-4` / `-right-4`, seize pixels
 * EN DEHORS de la barre. Un bord rogné touche par définition le bord de la
 * fenêtre — les treize chevrons de l'écran tombaient donc hors de la piste,
 * celui de gauche recouvert par la colonne collante (`bg-card`, `z-10`), celui
 * de droite à cheval sur la colonne voisine.
 *
 * ⚠️ **Aucun test ne pouvait le voir, et il faut savoir pourquoi.** jsdom ne
 * met rien en page : toute mesure de position y rend zéro. Une garde qui
 * cherche « le chevron est-il rendu ? » l'aurait trouvé rendu. Ce qui est
 * vérifiable ici est donc plus modeste, et c'est le seul angle honnête : le
 * chevron doit être un ENFANT de la barre, et ne porter aucun décalage négatif
 * qui l'en sortirait. Ces deux propriétés-là se lisent dans le DOM rendu, pas
 * dans le fichier source — et casser le correctif les fait rougir.
 */
describe('PlanningPage — les chevrons de bord rogné (#1372)', () => {
  function withClippedEdges() {
    return show({
      data: {
        missions: [
          // Commence avant juillet et finit après octobre : la barre est rognée
          // des DEUX côtés, donc les deux chevrons sont demandés.
          mission({ started_on: '2026-01-05', ends_on: '2027-06-30' }),
        ],
        canReadFinance: false,
      },
    })
  }

  it('pose les chevrons DANS la barre, jamais à côté', () => {
    const { container } = withClippedEdges()
    const chevrons = container.querySelectorAll('svg.lucide-chevrons-left, svg.lucide-chevrons-right')
    expect(chevrons).toHaveLength(2)
    for (const chevron of chevrons) {
      // La barre est le seul élément positionné qui porte la teinte et la
      // hauteur : le chevron doit y être IMBRIQUÉ pour être peint dessus.
      const bar = chevron.closest('span[style*="width"]')
      expect(bar).not.toBeNull()
      // ⚠️ Un décalage NÉGATIF sort le chevron de la barre — c'est le défaut
      // exact que la recette a trouvé, et la piste voisine le recouvre.
      expect(chevron.getAttribute('class')).not.toMatch(/(^|\s)-(left|right|top|bottom)-/)
    }
  })

  it('empile les notes de bord au lieu de les joindre, pour ne pas les tronquer', () => {
    withClippedEdges()
    // « Début avant période · Fin après période » fait ~230 px dans une colonne
    // qui en offre 176 : jointes, elles se coupaient au milieu du mot qui porte
    // le sens (« Fin après … »). Deux éléments, deux lignes, chacune entière.
    const before = screen.getByText('Début avant période')
    const after = screen.getByText('Fin après période')
    expect(before).not.toBe(after)
    expect(before.textContent).toBe('Début avant période')
    expect(after.textContent).toBe('Fin après période')
    // Et chacune garde SA phrase complète en infobulle, pas celle de l'autre.
    expect(before).toHaveAttribute('title', expect.stringContaining('Commencée avant la fenêtre'))
    expect(after).toHaveAttribute('title', expect.stringContaining('Continue après la fenêtre'))
  })
})

/**
 * #2194.44 — GLISSER UNE BARRE, AVEC APERÇU.
 *
 * Ces tests mesurent ce qui est atteignable SANS simuler un vrai pointeur
 * (jsdom ne met rien en page — même limite que documentée par les chevrons
 * ci-dessus) : la poignée existe, elle porte le bon rôle et le bon nom
 * accessible sur une barre aux deux bords connus, et elle est ABSENTE — pas
 * seulement désactivée — sur une barre qui inventerait une date en se
 * glissant. Le calcul lui-même (jours, dates, éligibilité) est testé en pur
 * dans `planning.test.ts` (`pixelsToDayDelta`, `shiftDateByDays`,
 * `canDragMission`) — ce fichier-ci ne le refait pas.
 */
describe('PlanningPage — glisser une barre, avec aperçu (#2194.44)', () => {
  it('une mission aux DEUX bords connus porte une poignée de glissement', () => {
    show()
    expect(screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })).toBeInTheDocument()
  })

  it('une mission SANS date de fin n’offre AUCUNE poignée — glisser inventerait la date qui manque', () => {
    show({ data: { missions: [mission({ ends_on: null })], canReadFinance: false } })
    expect(screen.queryByRole('button', { name: /glisser pour déplacer/i })).not.toBeInTheDocument()
  })

  it('une mission ROGNÉE (hors du champ affiché) n’offre AUCUNE poignée', () => {
    show({ data: { missions: [mission({ started_on: '2026-01-05' })], canReadFinance: false } })
    expect(screen.queryByRole('button', { name: /glisser pour déplacer/i })).not.toBeInTheDocument()
  })

  it('la ligne s’ouvre TOUJOURS depuis son propre bouton — glisser et ouvrir restent deux gestes distincts', async () => {
    show()
    await user().click(screen.getByRole('button', { name: /ouvrir la mission renfort plateforme/i }))
    expect(screen.getByTestId('peek')).toHaveTextContent('Renfort plateforme')
  })
})

/**
 * #2989.1 — RECETTE 26/09 : « sur 2 barres déplacées de 60 à 68 px, les
 * positions (left/width) sont identiques avant et après, la mission ne
 * bouge pas. » Le geste passait par les Hooks (`useDraggable`,
 * `useDndMonitor`) mais s'arrêtait au calcul (`planning.test.ts`) : AUCUN
 * test ne portait le pointeur, du DÉPÔT jusqu'à l'écriture — l'appelant réel
 * n'existait pas. Celui-ci simule le geste EN VRAI (pointerdown → pointermove
 * → pointerup) sur la poignée réellement rendue, et prouve que l'écriture ne
 * part JAMAIS seule : le dépôt ouvre une confirmation, « Déplacer » seul écrit.
 */
describe('PlanningPage — glisser une barre, jusqu’à la confirmation (#2989.1)', () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  // ⚠️ jsdom 20 (la version posée dans ce dépôt, `apps/web/package.json`)
  // n'implémente PAS `PointerEvent` : `window.PointerEvent` est `undefined`,
  // et Testing Library retombe alors sur un `Event` générique qui ne porte
  // ni `isPrimary` ni `button` ni `clientX` — exactement ce que `@dnd-kit`
  // exige de son capteur (`PointerSensor.activators`, `isPrimary`/`button`)
  // pour même COMMENCER un glissement. C'est la cause racine, mesurée ici,
  // du « aucun test ne portait le pointeur » : aucun test ne PEUT le porter
  // sans ce polyfill, borné à ce fichier — jamais `setup.ts` global, dont
  // la portée dépasserait cette seule suite.
  const originalPointerEvent = window.PointerEvent
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly isPrimary: boolean
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.isPrimary = params.isPrimary ?? false
    }
  }

  beforeEach(() => {
    // jsdom ne met rien en page : `clientWidth` vaut 0 partout. La piste a
    // besoin d'une largeur RÉELLE pour convertir un déplacement en jours
    // (`pixelsToDayDelta`) — même largeur que `planning.test.ts` (`WINDOW`,
    // juillet → octobre 2026, la fenêtre par défaut de cet écran).
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1220 })
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
  })

  afterEach(() => {
    if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    window.PointerEvent = originalPointerEvent
  })

  function drag(handle: HTMLElement, deltaPx: number) {
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 0, button: 0, isPrimary: true })
    // ⚠️ DEUX `pointermove`, jamais un seul : le premier qui franchit le seuil
    // d'activation (6 px, `activationConstraint.distance`) ARME le capteur
    // (`AbstractPointerSensor.handleStart`) mais ne rend PAS encore le delta —
    // c'est le second mouvement qui livre `onDragMove`/`onDragEnd` avec le
    // déplacement réel. Une seule poussée ferait un `onDragEnd` avec `delta`
    // à 0, exactement le symptôme rapporté en recette (#2989.1).
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 107, clientY: 0, isPrimary: true })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 100 + deltaPx, clientY: 0, isPrimary: true })
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 100 + deltaPx, clientY: 0, isPrimary: true })
  }

  it('n’écrit RIEN au dépôt — le glissement OUVRE une confirmation, avec l’aperçu des nouvelles dates', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    drag(handle, 64)

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/nouvelles dates :/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^déplacer$/i })).toBeInTheDocument()
  })

  // ⚠️ `@dnd-kit` pose lui-même un garde-fou anti-clic-fantôme au dépôt
  // (`AbstractPointerSensor.handleStart` : un `stopPropagation` capturé sur
  // `document`, retiré 50 ms après le relâchement) — sans ce délai, le CLIC
  // sur « Déplacer » serait avalé par CE garde-fou, pas par le code de
  // l'écran. On attend qu'il se retire avant de cliquer, comme le ferait un
  // commercial dont la souris met plus de 50 ms à rejoindre le bouton.
  async function afterDropGuard() {
    await new Promise(resolve => setTimeout(resolve, 60))
  }

  it('« Déplacer » écrit — le PATCH des dates de L’AFFECTATION EXISTANTE, jamais une autre route', async () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    drag(handle, 64)
    await afterDropGuard()
    fireEvent.click(screen.getByRole('button', { name: /^déplacer$/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload] = mutate.mock.calls[0] as [{ startedOn: string; endsOn: string }]
    // La mission par défaut court du 10 juillet au 20 septembre 2026 — un
    // déplacement VERS L'AVANT préserve la durée, jamais le mois de départ.
    expect(payload.startedOn > '2026-07-10').toBe(true)
    expect(payload.endsOn > '2026-09-20').toBe(true)
    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
  })

  it('« Annuler » n’écrit RIEN et referme la confirmation', async () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    drag(handle, 64)
    await afterDropGuard()
    fireEvent.click(screen.getByRole('button', { name: /^annuler$/i }))

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
  })

  it('un déplacement sous le seuil d’un jour ne propose AUCUNE confirmation', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    // 1 px sur 1220, 123 jours de fenêtre : largement sous l'arrondi d'1 jour.
    drag(handle, 1)

    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })
})

/**
 * #2989.3 — LA MÊME POIGNÉE SE GLISSE AU CLAVIER, PAS SEULEMENT AU POINTEUR.
 *
 * `PointerSensor` est le seul capteur monté (`Timeline` plus haut) : sans un
 * gestionnaire de touches sur la poignée elle-même, une barre déplaçable à la
 * souris resterait inatteignable au clavier — exactement ce que GA-35 refuse
 * déjà pour la ligne. Ces tests portent la touche EN VRAI (`fireEvent.keyDown`
 * sur la poignée réellement rendue), jamais un appel direct à une fonction
 * interne, même porte que les tests au pointeur ci-dessus : aucune touche
 * n'écrit seule, « Déplacer » (ici Entrée) seul déclenche le PATCH.
 */
describe('PlanningPage — glisser une barre au clavier (#2989.3)', () => {
  it('une flèche ouvre la confirmation avec l’aperçu, sans rien écrire', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/nouvelles dates :/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^déplacer$/i })).toBeInTheDocument()
  })

  it('Entrée écrit le PATCH des nouvelles dates, par le même écrivain que le pointeur', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'Enter' })

    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload] = mutate.mock.calls[0] as [{ startedOn: string; endsOn: string }]
    // La mission par défaut court du 10 juillet au 20 septembre 2026 — une
    // flèche vers la DROITE avance les deux dates d'un jour.
    expect(payload.startedOn > '2026-07-10').toBe(true)
    expect(payload.endsOn > '2026-09-20').toBe(true)
    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
  })

  it('Échap annule — referme la confirmation sans rien écrire', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show()
    const handle = screen.getByRole('button', { name: /glisser pour déplacer renfort plateforme/i })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'Escape' })

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
  })

  it('une mission ROGNÉE (aucune poignée) n’écoute aucune flèche', () => {
    show({ data: { missions: [mission({ started_on: '2026-01-05' })], canReadFinance: false } })
    expect(screen.queryByRole('button', { name: /glisser pour déplacer/i })).not.toBeInTheDocument()
  })
})

/**
 * #2989 (RECETTE 27/09) — « glisser une barre bloquée n’a AUCUN effet
 * visible ». Le blocage était déjà correct ({@link canDragMission} refuse
 * tout bord OUVERT ou ROGNÉ) mais totalement MUET : ni curseur, ni message,
 * ni annonce — un geste empêché en silence se lit comme un bouton cassé, pas
 * comme une règle. Ces tests portent le geste EN VRAI (clic, puis flèche et
 * Entrée au clavier) sur la poignée bloquée réellement rendue, et prouvent
 * qu'il NOMME la raison sans jamais écrire ni proposer de nouvelles dates.
 */
describe('PlanningPage — glisser une barre bloquée s’annonce (#2989, recette 27/09)', () => {
  // ⚠️ Même garde-fou que `#2989.1` (`afterDropGuard`) : un clic qui suit de
  // près le relâchement d'UN AUTRE test de glissement peut retomber dans la
  // fenêtre de 50 ms où `@dnd-kit` capture `click` sur `document` pour avaler
  // le clic fantôme qui suit son propre dépôt. Ce test ne glisse rien lui-même
  // mais partage le même `document` — sans l'attente, il hériterait parfois
  // du garde-fou d'un test voisin, pas du sien.
  async function afterDropGuard() {
    await new Promise(resolve => setTimeout(resolve, 60))
  }

  it('un clic sur la poignée bloquée NOMME la raison — aucune écriture, aucune confirmation', async () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show({ data: { missions: [mission({ ends_on: null })], canReadFinance: false } })
    const handle = screen.getByRole('button', { name: /glissement bloqué pour renfort plateforme/i })

    await afterDropGuard()
    fireEvent.click(handle)

    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo.mock.calls[0]?.[0]).toMatch(/sans date de fin/i)
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
  })

  it('une flèche au clavier sur la poignée bloquée NOMME la raison, jamais un déplacement', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show({ data: { missions: [mission({ started_on: '2026-01-05' })], canReadFinance: false } })
    const handle = screen.getByRole('button', { name: /glissement bloqué pour renfort plateforme/i })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })

    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo.mock.calls[0]?.[0]).toMatch(/commencée avant la fenêtre/i)
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.queryByText(/nouvelles dates :/i)).not.toBeInTheDocument()
  })

  it('Entrée sur la poignée bloquée NOMME la raison elle aussi, jamais un déplacement', () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show({ data: { missions: [mission({ ends_on: null })], canReadFinance: false } })
    const handle = screen.getByRole('button', { name: /glissement bloqué pour renfort plateforme/i })

    fireEvent.keyDown(handle, { key: 'Enter' })

    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('une barre qui SE GLISSE ne porte AUCUNE poignée bloquée', () => {
    show()
    expect(screen.queryByRole('button', { name: /glissement bloqué pour/i })).not.toBeInTheDocument()
  })
})

// Théo C missions-planning.HT1 — « Bloquées » est une pastille de filtre, pas un écran.
describe('PlanningPage — le filtre « Bloquées »', () => {
  it('la pastille remplace la frise par les dossiers incomplets, et « Retirer le filtre » la rend', async () => {
    show()
    expect(screen.queryByTestId('blocked-panel')).not.toBeInTheDocument()
    const pill = screen.getByRole('button', { name: 'Bloquées' })
    expect(pill).toHaveAttribute('aria-pressed', 'false')
    await user().click(pill)
    expect(screen.getByTestId('blocked-panel')).toBeInTheDocument()
    expect(screen.queryByText('Renfort plateforme')).not.toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Retirer le filtre' }))
    expect(screen.queryByTestId('blocked-panel')).not.toBeInTheDocument()
    expect(screen.getByText('Renfort plateforme')).toBeInTheDocument()
  })
})

// Théo C missions-planning.R2 / N1 — les quatre tuiles d'échéance et les cartes à préparer.
describe('PlanningPage — les échéances', () => {
  it('écrit les quatre tuiles et une carte pour la fin proche, sans montant', () => {
    show({ data: { missions: [mission({ ends_on: '2026-09-05' })], canReadFinance: false } })
    expect(screen.getByRole('group', { name: 'Échéances du planning' })).toBeInTheDocument()
    expect(screen.getByText('Fin dans 7 jours')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer la suite' })).toHaveAttribute('href', '/actions')
    expect(screen.getByRole('link', { name: 'Voir les actions' })).toHaveAttribute('href', '/actions')
  })
})

// Théo C missions-planning.A8 — pastille « ! » sur la barre en conflit + légende.
describe('PlanningPage — conflits et légende', () => {
  it('pose « ! » sur les deux missions qui se chevauchent et écrit la légende', () => {
    show({
      data: {
        missions: [
          mission({ id: 'a1', label: 'Mission A', started_on: '2026-08-01', ends_on: '2026-09-30' }),
          mission({ id: 'b1', label: 'Mission B', started_on: '2026-09-10', ends_on: '2026-12-31' }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.getAllByLabelText('Conflit de planning').length).toBeGreaterThanOrEqual(2)
    const legend = screen.getByRole('list', { name: 'Légende du planning' })
    expect(within(legend).getByText('Fin à anticiper')).toBeInTheDocument()
    expect(within(legend).getByText('Conflit de planning')).toBeInTheDocument()
  })
})

// Théo missions-planning.R2 — la tuile de tête et les trois tuiles d'échéance sont de VRAIS boutons.
describe('PlanningPage — les tuiles d’échéance cliquables', () => {
  const twoMissions = () => [
    mission({ id: 'a', label: 'Fin proche', ends_on: '2026-09-20', accountName: 'NOVA' }),
    mission({ id: 'b', label: 'Sans fin', ends_on: null, accountName: 'ORION' }),
  ]

  it('écrit « Missions à accompagner » en tête, avec le visage des personnes', () => {
    show({ data: { missions: twoMissions(), canReadFinance: false } })
    const summary = document.querySelector('[data-slot="planning-summary"]') as HTMLElement
    expect(within(summary).getByText('Missions à accompagner')).toBeInTheDocument()
    expect(within(summary).getByText('02')).toBeInTheDocument()
    expect(within(summary).getByRole('list', { name: 'Personnes sur une mission' })).toBeInTheDocument()
  })

  it('une tuile ouvre la même pastille que la barre — un seul état, deux portes', async () => {
    show({ data: { missions: twoMissions(), canReadFinance: false } })
    const tile = screen.getByRole('button', { name: /fins sous 30 jours/i })
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    await user().click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /échéances sous 30 j 1/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /ouvrir la mission sans fin\b/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ouvrir la mission fin proche/i })).toBeInTheDocument()
  })

  it('« Fins non renseignées » dit « Aucune » plutôt que 0 quand toutes les fins sont saisies', () => {
    show()
    const tile = screen.getByRole('button', { name: /fins non renseignées/i })
    expect(within(tile).getByText('Aucune')).toBeInTheDocument()
    expect(within(tile).getByText('Pas de date supposée')).toBeInTheDocument()
  })
})

// Théo missions-planning.R4/R5 — Planning · Tableau · Board, et « Réinitialiser ».
describe('PlanningPage — les vues, le regroupement et les pastilles', () => {
  const missionsToGroup = () => [
    mission({
      id: 'a',
      label: 'Mission A',
      accountName: 'NOVA',
      ends_on: '2026-12-31',
      assignees: [{ id: 'c1', fullName: 'Léa Kaczmarek', photoUrl: null }],
    }),
    mission({
      id: 'b',
      label: 'Mission B',
      accountName: 'NOVA',
      ends_on: '2026-12-31',
      assignees: [{ id: 'c2', fullName: 'Sam Bertrand', photoUrl: null }],
    }),
    mission({
      id: 'c',
      label: 'Mission C',
      accountName: 'ORION',
      ends_on: '2026-12-31',
      assignees: [{ id: 'c3', fullName: 'Yanis Berthier', photoUrl: null }],
    }),
  ]

  it('le tableau a six colonnes (dont Renouvellement, #4197.4), le même composant que les listes, et une ligne par mission', async () => {
    show({ data: { missions: missionsToGroup(), canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: 'Tableau' }))
    const table = screen.getByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(cell => cell.textContent)
    expect(headers.slice(0, 6)).toEqual([
      'Mission / consultant',
      'Compte',
      'Dates prévues',
      'Situation',
      'Renouvellement',
      'Responsable',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    // La frise cède la place au tableau : une seule vue à la fois.
    expect(screen.queryByText('Le planning de l’équipe')).not.toBeInTheDocument()
  })

  // #4197.4 — recette prod 31/10 : une seule puce « 30 j », pas de 60/90 ; pas de colonne Renouvellement.
  it('#4197.4 — le tableau porte la colonne « Renouvellement » : l’état dit, « — » si inconnu (jamais 0)', async () => {
    show({
      data: {
        missions: [
          mission({ id: 'a', label: 'Mission A', renewal_status: 'discussion_en_cours' }),
          mission({ id: 'b', label: 'Mission B', renewal_status: undefined }),
        ],
        canReadFinance: false,
      },
    })
    await user().click(screen.getByRole('button', { name: 'Tableau' }))
    const table = screen.getByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(cell => cell.textContent)
    expect(headers).toContain('Renouvellement')
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1] as HTMLElement).getByText('Discussion en cours')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).queryByText('0')).not.toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('—')).toBeInTheDocument()
  })

  it('#4197.4 — trois puces « 30 j · 60 j · 90 j » ; 60 et 90 filtrent les fins de la fenêtre (cumulatives)', async () => {
    // Aujourd’hui du test : 29/08/2026. « a » finit à J+17, « b » à J+47, « c » à J+77, « d » à J+120.
    show({
      data: {
        missions: [
          mission({ id: 'a', label: 'Fin à 17 j', ends_on: '2026-09-15' }),
          mission({ id: 'b', label: 'Fin à 47 j', ends_on: '2026-10-15' }),
          mission({ id: 'c', label: 'Fin à 77 j', ends_on: '2026-11-14' }),
          mission({ id: 'd', label: 'Fin à 120 j', ends_on: '2026-12-27' }),
        ],
        canReadFinance: false,
      },
    })
    expect(screen.getByRole('button', { name: /échéances sous 30 j 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /échéances sous 60 j 2/i })).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: /échéances sous 90 j 3/i }))
    await user().click(screen.getByRole('button', { name: 'Tableau' }))
    const table = screen.getByRole('table')
    expect(within(table).getByText('Fin à 77 j')).toBeInTheDocument()
    expect(within(table).queryByText('Fin à 120 j')).not.toBeInTheDocument()
  })

  it('une ligne du tableau ouvre la mission, et la situation s’écrit en mots', async () => {
    show({ data: { missions: [mission({ ends_on: '2026-09-20' })], canReadFinance: false } })
    await user().click(screen.getByRole('button', { name: 'Tableau' }))
    expect(screen.getByText('Fin proche')).toBeInTheDocument()
    await user().click(screen.getByRole('cell', { name: /yanis berthier/i }))
    expect(screen.getByTestId('peek')).toHaveTextContent('Renfort plateforme')
  })

  it('la vue « Board » monte le board, et revenir au Planning le range', async () => {
    show()
    await user().click(screen.getByRole('button', { name: 'Board' }))
    expect(screen.getByTestId('board')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Planning' }))
    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
  })

  it('« Par compte » met un intertitre par compte, « Par mission » n’en met aucun', async () => {
    show({ data: { missions: missionsToGroup(), canReadFinance: false } })
    expect(screen.queryByRole('heading', { level: 3, name: 'NOVA' })).not.toBeInTheDocument()
    await user().click(screen.getByRole('combobox', { name: 'Regrouper le planning' }))
    await user().click(screen.getByRole('option', { name: 'Par compte' }))
    expect(screen.getByRole('heading', { level: 3, name: 'NOVA' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'ORION' })).toBeInTheDocument()
  })

  it('« Par consultant » regroupe sur la première personne affectée', async () => {
    show({ data: { missions: missionsToGroup(), canReadFinance: false } })
    await user().click(screen.getByRole('combobox', { name: 'Regrouper le planning' }))
    await user().click(screen.getByRole('option', { name: 'Par consultant' }))
    expect(screen.getByRole('heading', { level: 3, name: 'Léa Kaczmarek' })).toBeInTheDocument()
  })

  it('« À démarrer » ne garde que les démarrages à venir, et « Réinitialiser » rend tout', async () => {
    show({
      data: {
        missions: [
          mission({ id: 'a', label: 'Déjà commencée', started_on: '2026-07-10' }),
          mission({ id: 'b', label: 'À venir', started_on: '2026-09-10', ends_on: '2026-12-01' }),
        ],
        canReadFinance: false,
      },
    })
    const u = user()
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /à démarrer 1/i }))
    expect(screen.getByRole('button', { name: /ouvrir la mission à venir/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission déjà commencée/i })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(screen.getByRole('button', { name: /ouvrir la mission déjà commencée/i })).toBeInTheDocument()
  })

  it('« À vérifier » retient les missions qui portent un conflit de planning', async () => {
    show({
      data: {
        missions: [
          mission({ id: 'a1', label: 'Mission A', started_on: '2026-08-01', ends_on: '2026-09-30' }),
          mission({ id: 'b1', label: 'Mission B', started_on: '2026-09-10', ends_on: '2026-12-31' }),
          mission({
            id: 'c1',
            label: 'Mission C',
            started_on: '2026-08-01',
            ends_on: '2026-09-30',
            assignees: [{ id: 'c9', fullName: 'Autre Personne', photoUrl: null }],
          }),
        ],
        canReadFinance: false,
      },
    })
    await user().click(screen.getByRole('button', { name: /à vérifier 2/i }))
    expect(screen.getByRole('button', { name: /ouvrir la mission mission a/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission mission c/i })).not.toBeInTheDocument()
  })

  it('« Mes vues » ouvre la fenêtre, et appliquer une vue reprend filtres, fenêtre et regroupement', async () => {
    const { container } = show({ data: { missions: missionsToGroup(), canReadFinance: false } })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Mes vues' }))
    expect(screen.getByTestId('views-current-scale')).toHaveTextContent('4')
    await u.click(screen.getByRole('button', { name: 'Appliquer la vue' }))
    // L'échelle de six mois, le compte ORION seul, regroupé par compte.
    const header = container.querySelector('[data-slot="planning-months"]') as HTMLElement
    expect(within(header).getByText(/déc/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ouvrir la mission mission c/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir la mission mission a/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'ORION' })).toBeInTheDocument()
  })
})

// Contrôle de fidélité Théo (23/10) — la STRUCTURE de l'écran, dans l'ordre de la maquette.
// Ce test dit NON si un bloc change de place, si la légende sort du panneau, si la fin
// quitte sa pastille ou si les échéances redeviennent des boutons pleins.
describe('PlanningPage — structure de la maquette Théo', () => {
  function slots(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[data-slot]')]
      .map(node => node.getAttribute('data-slot') ?? '')
      .filter(slot =>
        ['planning-feature', 'planning-stats', 'planning-panel', 'planning-legend', 'planning-deadline-card'].includes(
          slot,
        ),
      )
  }

  it('empile sur-titre + titre, tuile de tête, tuiles, panneau planning (légende dedans), puis échéances', () => {
    const { container } = show({ data: { missions: [mission({ ends_on: '2026-09-05' })], canReadFinance: false } })
    expect(screen.getByText('Delivery & suivi client')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Missions' })).toBeInTheDocument()
    const order = slots(container)
    expect([...new Set(order)]).toEqual([
      'planning-feature',
      'planning-stats',
      'planning-panel',
      'planning-legend',
      'planning-deadline-card',
    ])
    const panel = container.querySelector('[data-slot="planning-panel"]') as HTMLElement
    expect(within(panel).getByRole('heading', { level: 2, name: 'Le planning de l’équipe' })).toBeInTheDocument()
    expect(panel.querySelector('[data-slot="planning-legend"]')).not.toBeNull()
    // L'échelle est un sélecteur, plus une rangée de pastilles.
    expect(within(panel).getByRole('combobox', { name: 'Durée affichée' })).toBeInTheDocument()
  })

  it('les trois tuiles vivent dans UNE carte, et la fin d’une barre est une pastille', () => {
    const { container } = show({ data: { missions: [mission({ ends_on: '2026-09-05' })], canReadFinance: false } })
    const stats = container.querySelector('[data-slot="planning-stats"]') as HTMLElement
    expect(within(stats).getAllByRole('button')).toHaveLength(3)
    expect(container.querySelector('[data-slot="planning-bar-date"]')?.textContent).toMatch(/5 sept/)
  })

  it('une carte d’échéance mène par un LIEN, jamais par un bouton plein', () => {
    const { container } = show({ data: { missions: [mission({ ends_on: '2026-09-05' })], canReadFinance: false } })
    const card = container.querySelector('[data-slot="planning-deadline-card"]') as HTMLElement
    expect(within(card).getByRole('link', { name: 'Préparer la suite' })).toBeInTheDocument()
    expect(within(card).queryByRole('button')).toBeNull()
  })
})

describe('PlanningPage — la disponibilité déclarée gagne (point propre MISSIONS-A)', () => {
  afterEach(() => {
    consultants.list = []
  })

  it('écrit la date DÉCLARÉE sur la fiche plutôt que celle déduite de la fin de mission', () => {
    consultants.list = [{ id: 'c-1', available_from: '2026-11-03' }]
    show({ data: { missions: [mission({ ends_on: '2026-09-20' })], canReadFinance: false } })
    expect(screen.getByText('Disponible le 3 nov. 2026')).toBeInTheDocument()
    expect(screen.getByText(/Déclarée sur sa fiche/)).toBeInTheDocument()
    expect(screen.queryByText(/Après le 21 sept/)).not.toBeInTheDocument()
  })

  it('sans déclaration, garde la disponibilité déduite de la fin', () => {
    show({ data: { missions: [mission({ ends_on: '2026-09-20' })], canReadFinance: false } })
    expect(screen.queryByText(/Déclarée sur sa fiche/)).not.toBeInTheDocument()
  })
})

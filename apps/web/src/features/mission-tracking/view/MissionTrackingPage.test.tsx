import type * as MissionsApiModule from '@/features/missions/api'
import type { MissionView } from '@/features/missions/api'
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MissionTrackingRow } from '../derive'
import type * as MarginTrendModule from '../margin-trend'
import { resetLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'

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

const useMissionTrackingData = vi.fn()
const useAggregateMargin = vi.fn()
const useRoutines = vi.fn()
const useMarginTrend = vi.fn()
// Le prénom vient du profil : le hook réel lit `useProfile` + `useAuth`, deux
// dépendances que ce fichier n'a aucune raison de monter pour un entête.
const firstName = vi.fn(() => '')

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName() }))

vi.mock('../rows', () => ({ useMissionTrackingData: () => useMissionTrackingData() }))
vi.mock('@/features/missions/api', async () => {
  const actual = await vi.importActual<typeof MissionsApiModule>('@/features/missions/api')
  return { ...actual, useAggregateMargin: () => useAggregateMargin() }
})
vi.mock('@/features/routines/api', () => ({ useRoutines: () => useRoutines() }))
// Le panneau « missions qui dérapent » (PDF 5 §7.2) est une lecture À PART, avec
// sa propre requête : il ne touche aucune des colonnes que ces tests mesurent,
// et le monter ici demanderait un `QueryClientProvider` que ce fichier n'a pas.
vi.mock('./MissionDriftPanel', () => ({ MissionDriftPanel: () => null }))
vi.mock('../margin-trend', async () => {
  const actual = await vi.importActual<typeof MarginTrendModule>('../margin-trend')
  return { ...actual, useMarginTrend: () => useMarginTrend() }
})
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// ⚠️ Le faux expose la QUESTION posée à Laura dans le `href` : depuis #1383 et
// #1384 c'est elle qu'on mesure, pas la présence d'un lien. Les autres liens
// gardent leur `to` tel quel — un test asserte encore `/missions/cra`.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={search?.prompt ? `${to}?prompt=${encodeURIComponent(search.prompt)}` : to} {...rest}>
      {children}
    </a>
  ),
}))

const { MissionTrackingPage } = await import('./MissionTrackingPage')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: 'm1',
    workspace_id: 'w1',
    account_id: 'a1',
    opportunity_id: null,
    label: 'Transformation IT Europe',
    status: 'active',
    started_on: '2026-07-01',
    ends_on: '2026-10-31',
    daily_rate: 620,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    accountName: 'Airbus',
    renewal: 'far',
    risks: [],
    marginPercent: null,
    assignees: [{ id: 'c-1', fullName: 'D. Économique', photoUrl: null }],
    ...over,
  }
}

function row(over: Partial<MissionTrackingRow<MissionView>> = {}): MissionTrackingRow<MissionView> {
  return {
    mission: mission(),
    cra: 'unknown',
    invoicing: 'unknown',
    payment: 'unknown',
    nextAction: null,
    readiness: undefined,
    ...over,
  }
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

/**
 * #1378 — LA VUE PAR DÉFAUT EST « À TRAITER ».
 *
 * ⚠️ Conséquence pour les tests : une ligne SAINE n'est plus rendue au premier
 * affichage. Un test qui la cherchait sans basculer de vue cesserait de mesurer
 * la table — et resterait vert, parce que les tuiles écrivent elles aussi
 * « non mesuré ». D'où cet aiguillage explicite.
 */
async function showAllRows() {
  await user().click(screen.getByRole('button', { name: /tout le suivi/i }))
}

/** La table, bornée : les tuiles portent les mêmes mots qu'elle. */
function table() {
  return screen.getByRole('table')
}

function baseData(overrides: Partial<ReturnType<typeof useMissionTrackingData>> = {}) {
  return {
    isLoading: false,
    isError: false,
    rows: [row()],
    activeMissionsCount: 1,
    craSummary: {
      total: 1,
      awaiting: 1,
      submitted: 0,
      validated: 0,
      disputed: 0,
      rejected: 0,
      notRequired: 0,
      blocking: 0,
      declaredDays: null,
    },
    readinessSummary: {
      ready: 0,
      blocked: 0,
      invoiced: 0,
      preparedAmountCents: null,
      blockedAmountCents: null,
      withoutAmount: 0,
      notDue: 0,
    },
    readinessCanReadFinance: true,
    collectionsWindowMonths: 12,
    collectionsSummary: {
      paid: { count: 0, amountCents: 0, withoutAmount: 0 },
      pending: { count: 0, amountCents: 0, withoutAmount: 0 },
      overdue: { count: 0, amountCents: 0, withoutAmount: 0 },
      disputed: { count: 0, amountCents: 0, withoutAmount: 0 },
      withoutDueDate: 0,
    },
    collectionsCanReadFinance: true,
    collectionsFailedMonths: 0,
    collectionsLoading: false,
    recentActivity: [],
    ...overrides,
  }
}

describe('MissionTrackingPage', () => {
  it('rend « non mesuré » sur une ligne sans readiness — jamais « à faire »', async () => {
    useMissionTrackingData.mockReturnValue(baseData())
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)
    await showAllRows()

    // Trois colonnes, trois « non mesuré » — jamais un badge « à faire ».
    //
    // ⚠️ Borné à la TABLE, et en EXPRESSION RÉGULIÈRE. Ce test cherchait la
    // chaîne EXACTE sur toute la page : il ne matchait donc que les tuiles,
    // dont l'`UnknownValue` est nu, jamais les cellules — dont le texte est
    // « non mesuré — aucun relevé pour cette mission sur le mois consulté ».
    // Il restait vert avec une table vide. C'est la même famille que « une
    // garde qui LIT quelque chose » : un test doit prouver ce qu'il mesure.
    expect(within(table()).getAllByText(/non mesuré/).length).toBe(3)
    expect(screen.queryByText('À faire')).toBeNull()
  })

  it('rend « sans objet » distinct de « non mesuré » et de « à faire »', async () => {
    useMissionTrackingData.mockReturnValue(
      baseData({
        rows: [row({ cra: 'not_applicable', invoicing: 'not_due', payment: 'not_applicable' })],
      }),
    )
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)
    // Une ligne « sans objet » est SAINE : elle vit dans « Tout le suivi »,
    // pas dans la file de travail (#1378).
    await showAllRows()

    expect(screen.getAllByText('Sans objet').length).toBe(2) // CRA + Paiement
    expect(screen.getByText('Pas dû ce mois')).toBeTruthy() // Facturation
  })

  it('rend la « prochaine action » comme un LIEN, jamais un texte mort', () => {
    useMissionTrackingData.mockReturnValue(
      baseData({
        rows: [
          row({
            invoicing: 'blocked',
            // #1383 — le bloqueur SEUL : le libellé et la destination viennent
            // de `nextActionLink`, plus d'une copie portée par la ligne.
            nextAction: { kind: 'blocker', blocker: 'missing_timesheet' },
          }),
        ],
      }),
    )
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)

    const link = screen.getByRole('link', { name: 'ouvrir le relevé' })
    expect(link.getAttribute('href')).toBe('/missions/cra')
  })

  it('n’affiche AUCUN delta inventé sur les tuiles (« +0 vs mois dernier »)', () => {
    useMissionTrackingData.mockReturnValue(baseData())
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)

    expect(screen.queryByText(/vs mois dernier/i)).toBeNull()
    expect(screen.queryByText(/\+0/)).toBeNull()
  })

  it('ne rend AUCUNE bascule dans le rail « Automatisations » — il affiche, il n’édite pas', () => {
    useMissionTrackingData.mockReturnValue(baseData())
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)

    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('la marge brute affiche « non mesuré », jamais 0 %, sans donnée', () => {
    useMissionTrackingData.mockReturnValue(baseData())
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)

    expect(screen.queryByText('0 %')).toBeNull()
  })

  // Écart figma-sync — l'état d'ERREUR réutilisait le titre de l'état VIDE
  // (« Aucune mission active pour l'instant. »), qui dit exactement le
  // contraire de ce qui s'est passé : la table n'est pas vide, elle n'a pas pu
  // charger. Titre propre, distinct de l'état vide.
  it('l’état d’ERREUR porte son propre titre, jamais celui de l’état vide', () => {
    useMissionTrackingData.mockReturnValue(baseData({ isError: true, rows: [] }))
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })

    render(<MissionTrackingPage />)

    expect(screen.getByText('Suivi indisponible')).toBeTruthy()
    expect(screen.getByText('Une erreur est survenue')).toBeTruthy()
    expect(screen.queryByText('Aucune mission active pour l’instant.')).toBeNull()
  })
})

/**
 * L'ENTÊTE — #1377.
 *
 * Le retour ne demande pas seulement un titre : il redit à quoi la page sert.
 * « Ne pas faire de Suivi une deuxième liste de missions actives » — le
 * sous-titre nomme donc les blocages et le cash, pas le portefeuille.
 * Le prénom vient du profil ; l'issue l'écrit « Maëlle » en dur.
 */
describe('MissionTrackingPage — l’entête dit à quoi la page sert (#1377)', () => {
  afterEach(cleanup)

  it('porte le prénom du profil', () => {
    firstName.mockReturnValue('Louis')
    render(<MissionTrackingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ton suivi opérationnel, Louis')
  })

  it('sait dire NON : sans prénom, la formule sans prénom', () => {
    firstName.mockReturnValue('')
    render(<MissionTrackingPage />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Ton suivi opérationnel')
    expect(heading.textContent).not.toContain(',')
  })

  it('remplace l’ancien sous-titre au lieu de s’ajouter à lui', () => {
    firstName.mockReturnValue('Louis')
    render(<MissionTrackingPage />)
    expect(screen.getByText(/sécuriser tes missions et ton cash/i)).toBeInTheDocument()
    expect(screen.queryByText(/Pilote l’exécution, la facturation/)).not.toBeInTheDocument()
  })
})

/**
 * LA FILE À TRAITER — #1377, #1378, #1379, #1385.
 */
describe('MissionTrackingPage — la file de travail (#1378, #1379)', () => {
  const healthy = () =>
    row({
      mission: mission({ id: 'sain', label: 'Mission saine' }),
      cra: 'validated',
      invoicing: 'invoiced',
      payment: 'paid',
    })
  const overdue = () =>
    row({
      mission: mission({ id: 'retard', label: 'Paiement en retard' }),
      cra: 'validated',
      invoicing: 'invoiced',
      payment: 'overdue',
    })
  const ready = () =>
    row({
      mission: mission({ id: 'pret', label: 'Prête à facturer' }),
      cra: 'validated',
      invoicing: 'ready',
      payment: 'not_invoiced',
    })

  function showFile() {
    useMissionTrackingData.mockReturnValue(baseData({ rows: [healthy(), ready(), overdue()] }))
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })
    return render(<MissionTrackingPage />)
  }

  it('s’ouvre sur « À traiter », et la mission saine ne noie pas la file', () => {
    showFile()
    expect(within(table()).getByText('Paiement en retard')).toBeTruthy()
    expect(within(table()).getByText('Prête à facturer')).toBeTruthy()
    expect(within(table()).queryByText('Mission saine')).toBeNull()
  })

  it('compte les deux vues — sans le nombre, une file vide ne dit pas pourquoi', () => {
    showFile()
    expect(screen.getByRole('button', { name: /à traiter 2/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /tout le suivi 3/i })).toBeTruthy()
  })

  it('« Tout le suivi » remontre la mission saine, en la laissant EN BAS', async () => {
    showFile()
    await showAllRows()
    // L'urgence RÉELLE d'abord : le cash en retard, puis ce qui est prêt, puis
    // ce qui n'attend rien. Trier n'est pas filtrer.
    const order = within(table())
      .getAllByRole('row')
      .slice(1)
      .map(line => (line.textContent ?? '').replace(/\s+/g, ' '))
    expect(order).toHaveLength(3)
    expect(order[0]).toContain('Paiement en retard')
    expect(order[1]).toContain('Prête à facturer')
    expect(order[2]).toContain('Mission saine')
  })

  /**
   * #1379 — LES TUILES RENVOIENT, ELLES NE FILTRENT PAS.
   *
   * Mesuré en production le 04/09/2026 : la tuile « Paiements en retard »
   * annonçait 2 et son filtre rendait ZÉRO ligne ; « Prêt à facturer »
   * annonçait 9 pour 8 lignes. Les encaissements se lisent sur douze mois, la
   * facturation sur le mois précédent, et la table ne porte que les missions
   * actives : trois dénominateurs. Un filtre qui vide la table sous un
   * compteur à 2 transforme un chiffre juste en promesse fausse.
   */
  it('chaque indicateur mène à l’écran qui porte SA population', () => {
    showFile()
    const cible = (nom: RegExp) => screen.getByRole('link', { name: nom }).getAttribute('href')
    expect(cible(/ouvrir les relevés/i)).toBe('/missions/cra')
    expect(cible(/ouvrir la facturation/i)).toBe('/missions/facturation')
    expect(cible(/ouvrir les encaissements/i)).toBe('/missions/encaissements')
    expect(cible(/ouvrir le pilotage/i)).toBe('/pilotage')
  })

  it('« Missions actives » ouvre la vue complète — le seul filtrage exact d’une tuile', async () => {
    showFile()
    expect(within(table()).queryByText('Mission saine')).toBeNull()
    await user().click(screen.getByRole('button', { name: /montrer toutes les missions du suivi/i }))
    // Son compte EST celui de la table : trois lignes, trois lignes.
    expect(within(table()).getByText('Mission saine')).toBeTruthy()
  })

  it('nomme la période de chaque indicateur — « 1 CRA à valider » ne dit pas de quel mois', () => {
    showFile()
    // Les relevés et la facturation sont lus sans argument : le serveur rend le
    // mois précédent. La fenêtre des encaissements, elle, couvre douze mois.
    expect(screen.getAllByText(/sur 12 mois/i).length).toBeGreaterThanOrEqual(1)
  })

  it('marque les lignes à traiter d’un indicateur d’urgence NOMMÉ (#1385)', () => {
    showFile()
    // ⚠️ Pas une couleur seule : une pastille muette ne dit rien à qui ne
    // distingue pas les teintes, et rien du tout à un lecteur d'écran.
    expect(within(table()).getByRole('img', { name: /paiement en retard/i })).toBeTruthy()
    expect(within(table()).getByRole('img', { name: /prêt à facturer/i })).toBeTruthy()
  })

  it('ne pose AUCUN indicateur sur une ligne saine', async () => {
    showFile()
    await showAllRows()
    // Trois lignes, deux motifs : un point sur chaque ligne cesserait d'être un signal.
    expect(within(table()).getAllByRole('img', { name: /.+/ }).length).toBe(2)
  })
})

describe('MissionTrackingPage — Laura (#1383, #1384)', () => {
  function showOne(over: Partial<MissionTrackingRow<MissionView>> = {}) {
    useMissionTrackingData.mockReturnValue(baseData({ rows: [row({ cra: 'action_needed', ...over })] }))
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })
    render(<MissionTrackingPage />)
  }

  // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, le CTA ouvre la bulle SUR PLACE : la question part
  // dans le magasin de Laura, lue ici comme la bulle la lit.
  function askedQuestion(button: HTMLElement): string {
    resetLauraIntro()
    fireEvent.click(button)
    return renderHook(() => useLauraOpenRequest()).result.current?.question ?? ''
  }

  it('ouvre Laura sur la FILE, avec le nombre de missions à traiter (#1384)', () => {
    showOne()
    const button = screen.getByRole('button', { name: /demander à laura quoi débloquer/i })
    expect(askedQuestion(button)).toMatch(/1 mission à traiter/i)
  })

  it('propose Laura EN SECOND quand aucune action n’existe, sans en inventer une (#1383)', () => {
    showOne({ nextAction: null })
    expect(within(table()).getByText('Aucune action planifiée')).toBeTruthy()
    const button = within(table()).getByRole('button', { name: /^demander à laura$/i })
    // Elle POSE une question sur cette mission ; elle ne propose aucun geste
    // qu'Action OS ne connaît pas.
    expect(askedQuestion(button)).toMatch(/Transformation IT Europe/)
  })
})

describe('MissionTrackingPage — identité visuelle (#1381)', () => {
  it('écrit la période en clair, jamais deux dates numériques séparées d’un tiret', () => {
    useMissionTrackingData.mockReturnValue(
      baseData({
        rows: [row({ cra: 'action_needed', mission: mission({ started_on: '2026-05-08', ends_on: '2026-10-01' }) })],
      }),
    )
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })
    render(<MissionTrackingPage />)

    expect(within(table()).getByText('8 mai → 1 oct. 2026')).toBeTruthy()
    expect(within(table()).queryByText(/08\/05\/2026/)).toBeNull()
  })

  it('distingue « sans date de fin » d’une période absente', () => {
    useMissionTrackingData.mockReturnValue(
      baseData({
        rows: [row({ cra: 'action_needed', mission: mission({ started_on: '2026-05-08', ends_on: null }) })],
      }),
    )
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })
    render(<MissionTrackingPage />)

    // Une mission qui court est un FAIT, pas un trou : « — … » les confondait.
    expect(within(table()).getByText(/depuis le 8 mai 2026 — sans date de fin/i)).toBeTruthy()
  })
})

/**
 * LA PÉRIODE RÉCLAME SA LARGEUR — #1381, défaut mesuré en recette le 04/09/2026.
 *
 * Huit colonnes se partagent la largeur de la table, et celle-ci recevait
 * SOIXANTE-SIX pixels : « 17 août 2026 → 17 août 2027 » s'y cassait sur cinq
 * lignes — une cellule de 66 × 137, illisible, et exactement ce que #1381
 * demandait de réparer.
 *
 * ⚠️ jsdom ne met rien en page : la HAUTEUR de la cellule n'y est pas
 * mesurable. Ce qui l'est, c'est la consigne donnée au moteur de mise en page —
 * et c'est elle qui manquait.
 */
describe('MissionTrackingPage — la période tient sur une ligne (#1381)', () => {
  it('interdit le retour à la ligne à une période complète, et le laisse à une phrase', () => {
    useMissionTrackingData.mockReturnValue(
      baseData({
        rows: [
          row({ cra: 'action_needed', mission: mission({ id: 'a', started_on: '2026-08-17', ends_on: '2027-08-17' }) }),
          row({
            cra: 'action_needed',
            mission: mission({ id: 'b', label: 'Sans fin', started_on: '2026-05-08', ends_on: null }),
          }),
        ],
      }),
    )
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })
    render(<MissionTrackingPage />)

    expect(within(table()).getByText('17 août 2026 → 17 août 2027')).toHaveClass('whitespace-nowrap')
    // La forme partielle est une PHRASE : lui interdire de se replier lui
    // donnerait à elle seule la moitié du tableau.
    expect(within(table()).getByText(/depuis le 8 mai 2026 — sans date de fin/i)).not.toHaveClass('whitespace-nowrap')
  })
})

/**
 * LA COLONNE D'ACTION RESTE ATTEIGNABLE — #1383, mesuré en production le 04/09/2026.
 *
 * Sans borne, « Mission » prenait 394 px sur les 1 206 visibles et poussait
 * « Prochaine action » à x=1469 dans un conteneur qui finit à 1479 : la colonne
 * que #1383 appelle « la plus actionnable de la page » n'était plus atteignable
 * sans faire défiler la table.
 *
 * ⚠️ jsdom ne met rien en page — la largeur n'y est pas mesurable. Ce qui l'est,
 * c'est la BORNE posée sur la colonne, et c'est elle qui manquait.
 */
describe('MissionTrackingPage — la colonne « Prochaine action » reste en vue (#1383)', () => {
  it('borne la colonne « Mission » pour ne pas chasser les colonnes de droite', () => {
    useMissionTrackingData.mockReturnValue(baseData({ rows: [row({ cra: 'action_needed' })] }))
    useAggregateMargin.mockReturnValue({ data: undefined, isError: false })
    useRoutines.mockReturnValue({ data: [], isLoading: false, isError: false })
    useMarginTrend.mockReturnValue({ items: [], isLoading: false })
    render(<MissionTrackingPage />)

    const entete = within(table()).getByText('Mission').closest('th')
    expect(entete).toHaveClass('max-w-[15rem]')
    // Et la cellule tronque au lieu de pousser : une borne sans troncature
    // déborderait simplement de sa borne.
    const cellule = within(table()).getByText('Airbus', { selector: 'p' })
    expect(cellule).toHaveClass('truncate')
  })
})

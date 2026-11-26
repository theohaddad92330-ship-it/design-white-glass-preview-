import { computeMissionMargin, type MissionCommercialTerms } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'

const assignments = vi.fn()
const terms = vi.fn()
const scores = vi.fn()
const setTerms = vi.fn()
// #2412 — le double pouls de satisfaction. `mutate` par défaut : la plupart
// des tests de ce fichier ne regardent pas la soumission.
const missionFeedback = vi.fn()
const submitMissionFeedback = vi.fn()

vi.mock('../api', () => ({
  // #2195 — les fenêtres de renouvellement sont arrivées par un AUTRE lot de la
  // même vague : ce fichier ne les teste pas, mais `OverviewTab` les consomme.
  // Un `vi.mock` remplace TOUT le module : un double incomplet fait échouer le
  // rendu entier avec « No export is defined on the mock », un rouge qui n'a
  // rien à voir avec ce qu'on mesure ici.
  useRenewalWindows: () => ({ data: undefined, isLoading: false, isError: false }),
  useMissionAssignments: () => assignments(),
  useMissionTerms: () => terms(),
  useMissionScores: () => scores(),
  useMissionDrift: () => ({ data: undefined, isLoading: false, isError: false }),
  useSetMissionTerms: () => setTerms(),
  // #2420 — le simulateur du moteur de marge.
  useMissionMarginScenario: () => ({ mutate: vi.fn(), data: undefined, isPending: false, reset: vi.fn() }),
  // Les frais et les factures fournisseur sont arrivés par un AUTRE lot de la
  // même vague : ce fichier ne les teste pas, mais le composant les consomme,
  // et un double incomplet fait échouer le rendu entier avec « No export is
  // defined on the mock » — un rouge qui n'a rien à voir avec ce qu'on mesure.
  useMissionExpenses: () => ({ data: [], isLoading: false, isError: false }),
  useCreateMissionExpense: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateMissionExpense: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSupplierInvoices: () => ({ data: [], isLoading: false, isError: false }),
  useCreateSupplierInvoice: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetSupplierInvoiceStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // #2412 — les deux rails de satisfaction, sur la synthèse.
  useMissionFeedback: () => missionFeedback(),
  useSubmitMissionFeedback: () => submitMissionFeedback(),
  // #2193.51 — la section « Documents » de l'onglet Historique est arrivée
  // par un AUTRE lot de la même vague : ce fichier ne la teste pas, mais
  // `MissionDetailTabs` la monte désormais, même raison que les frais/factures
  // fournisseur juste au-dessus.
  useMissionDocuments: () => ({ items: [], isLoading: false, isError: false }),
  useCreateMissionDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMissionDocumentStatus: () => ({ mutate: vi.fn() }),
}))
// L'historique du compte a ses propres garanties : ici on vérifie l'ONGLET
// « Conditions commerciales », pas la timeline.
vi.mock('@/features/activities/view/TimelinePanel', () => ({ TimelinePanel: () => <div>timeline</div> }))
/**
 * #2565.9 — la PORTE facture nomme l'outil branché par INJECTION
 * (`connectedClientTools`, GA-44), jamais par un littéral. Ce hook lit
 * `useSession()` en interne (`@bellum/contracts` → `integration-center/api`) ;
 * sans ce double, chaque test de ce fichier devrait porter un
 * `<SessionProvider>` pour une capacité qu'il ne regarde pas.
 */
const connectedCapabilities = vi.fn()
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => connectedCapabilities(),
}))

/**
 * Les RELEVÉS (et bientôt la FACTURATION) de la mission parlent au serveur
 * DIRECTEMENT — `apiFetch`, pas `'../api'` — parce que les hooks portant un
 * `missionId` n'existaient pas encore côté client et que ce fichier reste hors
 * du périmètre de ce lot. `apiFetch` est donc mocké ICI, comme dans
 * `ContactMailboxCard.test.tsx`, et non via `'../api'`.
 */
/**
 * #2565.10 — la salle de DÉMONSTRATION : la porte facture y montre la
 * prévisualisation et dit qu'elle n'écrit dans aucun outil. Faux par défaut —
 * une surface réelle ne bascule jamais en démo par défaut (`useIsDemo.ts`).
 */
const isDemo = vi.fn(() => false)
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => isDemo() }))

/**
 * H25 (#2565.10) — le bouton « Déposer un brouillon de facture » lit le même
 * droit `finance:write` que le SERVEUR (`@RequirePermission('finance:write')`,
 * `invoice-connector-write.controller.ts`) : un rôle qui ne l'a pas ne doit
 * jamais voir un bouton qui rendrait 403 au clic. `owner` par défaut — la
 * plupart des tests de ce fichier ne regardent pas ce droit.
 */
const team = vi.fn(() => ({ team: { workspace: { role: 'owner' } } }))
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => team() }))

/**
 * #2953 (#2193.25-30) — LE SUIVI monte `NotesPanel`, un composant PARTAGÉ
 * (`account`, `contact`, `consultant` le montent déjà) qui a sa PROPRE lecture
 * (`useNotes`, react-query). Ici on garde seulement qu'il est MONTÉ, avec le
 * bon sujet — même règle que les autres doubles de ce fichier.
 */
vi.mock('@/features/crm-core/view/NotesPanel', () => ({
  NotesPanel: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="notes-panel">{`${entityType}:${entityId}`}</div>
  ),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'user-1' } }) }))

// #2953 (#2193.41-43) — `MissionFinanceQuickLinks` monte un `Link` réel
// (`@tanstack/react-router`) : hors d'un routeur, il lève « Cannot read
// properties of null (reading 'isServer') ». Même faux qu'ailleurs dans ce
// dépôt (`MissionDossierPage.test.tsx`) : il REND ce que le vrai rendrait
// (l'adresse, les attributs), un faux qui les jette teste le mock et non le
// composant.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

/** Ce que le composant a réellement demandé au serveur, route par route. */
function callsTo(path: string): { path: string }[] {
  return apiFetchMock.mock.calls
    .map(call => call[0] as { path: string })
    .filter(request => request.path.startsWith(path))
}

const { MissionDetailTabs } = await import('./MissionDetailTabs')

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
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

/**
 * Un cache NEUF par test, comme `ContactMailboxCard.test.tsx` : sans lui, les
 * relevés et la facturation d'un test resteraient en cache pour le suivant.
 */
function show(over: Partial<MissionView> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MissionDetailTabs mission={mission(over)} />
    </QueryClientProvider>,
  )
}

async function openTerms() {
  await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
}

/** Réponse par défaut de `/delivery/timesheets` — un mois SANS relevé, comme un
 *  serveur qui répond mais n'a rien à dire sur cette mission. */
function timesheetsPage(over: Record<string, unknown> = {}) {
  return { month: '2026-08', items: [], ...over }
}

/** Réponse par défaut de `/delivery/invoice-readiness` — même régime. */
function readinessPage(over: Record<string, unknown> = {}) {
  return { month: '2026-08', items: [], canReadFinance: true, ...over }
}

/**
 * Le routeur du mock `apiFetch` — une route à la fois, comme
 * `ContactMailboxCard.test.tsx`. Par défaut : un mois sans rien à montrer, pour
 * que les tests du bon de commande (qui ne parlent ni de relevés ni de
 * facturation) restent silencieux sur ces deux sections.
 */
function route(request: { path: string; method?: string }): unknown {
  if (request.path.startsWith('/delivery/timesheets')) return timesheetsPage()
  if (request.path.startsWith('/delivery/invoice-readiness')) return readinessPage()
  // #2953 (#2193.17/.18) — `PATCH /delivery/missions/:id`, la même route de
  // réparation que le contact de facturation (`useUpdateMission`).
  if (request.method === 'PATCH' && /^\/delivery\/missions\/[^/]+$/.test(request.path)) return {}
  // #2193.50 — le journal des corrections de la mission (`RecordHistory`,
  // onglet Historique), lecture seule, vide par défaut.
  if (/^\/delivery\/missions\/[^/]+\/history$/.test(request.path)) return { items: [] }
  throw new Error(`Route inattendue: ${request.path}`)
}

const FULL_TERMS: MissionCommercialTerms = {
  missionId: '11111111-1111-4111-8111-111111111111',
  channel: 'direct',
  loadedDailyCostCents: null,
  requiresPo: true,
  poNumber: 'PO-2026-0418',
  poIssuedOn: '2026-03-01',
  poAmountCents: 2_800_000,
  poVolumeDays: 50,
  poConsumedDays: 28,
  poConsumption: { percent: 56, remainingDays: 22 },
  poOtherMissions: [],
  billingCadence: 'monthly',
  partnerCommissionDailyCents: null,
  noticeDays: 30,
  notes: null,
  updatedAt: '2026-08-30T00:00:00.000Z',
}

function withTerms(over: Partial<MissionCommercialTerms> = {}) {
  terms.mockReturnValue({
    data: { canReadFinance: true, terms: { ...FULL_TERMS, ...over }, margin: null },
    isError: false,
  })
}

beforeEach(() => {
  cleanup()
  assignments.mockReset().mockReturnValue({ data: [], isError: false })
  terms.mockReset().mockReturnValue({ data: { canReadFinance: true, terms: null, margin: null }, isError: false })
  scores.mockReset().mockReturnValue({ data: undefined, isLoading: false, isError: false })
  setTerms.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  missionFeedback.mockReset().mockReturnValue({ data: undefined, isLoading: false, isError: false })
  submitMissionFeedback.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  // Aucun outil branché par défaut — le régime de la salle de démonstration
  // (#2565.9) : un test qui veut un outil connecté le déclare lui-même.
  connectedCapabilities.mockReset().mockReturnValue({ families: [], tools: [], isLoading: false })
  isDemo.mockReset().mockReturnValue(false)
  team.mockReset().mockReturnValue({ team: { workspace: { role: 'owner' } } })
  apiFetchMock.mockReset().mockImplementation(route)
})

/**
 * #2191.17 / #2191.18 — LE TÉLÉTRAVAIL ET LE LIEU, REPRIS DU BESOIN.
 *
 * Même patron que `role_title`/`started_on` juste au-dessus dans l'onglet
 * Synthèse : une absence NOMMÉE (`UnknownValue`), jamais masquée ni devinée.
 */
describe('MissionDetailTabs — Synthèse porte le télétravail et le lieu (#2191.17, #2191.18)', () => {
  it('affiche les deux, REPRIS du besoin', () => {
    show({ remote_preference: 'hybride', location: 'Paris' })
    expect(screen.getByText('Hybride')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
  })

  it('nomme l’absence — jamais masquée — sans reprise', () => {
    show({ remote_preference: null, location: null })
    expect(screen.getAllByTitle('non repris du besoin')).toHaveLength(2)
  })
})

// #3709 — « Préparer la facture du mois » visible dès la Synthèse d'une mission
// facturée au temps ; un forfait (jalons) n'a rien à préparer.
describe('MissionDetailTabs — Synthèse porte la préparation de facture (#3709)', () => {
  it('la montre sur une régie', async () => {
    show({ contract_kind: 'regie' })
    expect(await screen.findByText(/Préparer la facture de/)).toBeInTheDocument()
  })

  it('R3b-3 — la place EN HAUT de la Synthèse (avant les lignes de la fiche) pour une mission en cours', async () => {
    show({ contract_kind: 'regie', status: 'active' })
    const prep = await screen.findByText(/Préparer la facture de/)
    const firstLine = screen.getByText('Rôle cherché')
    expect(prep.compareDocumentPosition(firstLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ne la montre pas sur un forfait', async () => {
    show({ contract_kind: 'forfait' })
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(screen.queryByText(/Préparer la facture de/)).not.toBeInTheDocument()
  })
})

/**
 * #2953 (#2193.17 / #2193.18) — L'OBJECTIF ET LE PÉRIMÈTRE, SAISIS SUR LA
 * FICHE.
 *
 * Contrairement au télétravail/lieu ci-dessus (REPRIS du besoin), aucune
 * source ne porte ces deux champs : ils se saisissent ICI, par le même
 * formulaire de réparation (`useUpdateMission`) que le contact de facturation.
 */
describe('MissionDetailTabs — Synthèse porte l’objectif et le périmètre (#2953, #2193.17/.18)', () => {
  it('affiche les deux quand ils sont renseignés', () => {
    show({ objective: 'Reprendre le run applicatif', perimeter: 'TMA du portail transporteurs' })
    expect(screen.getByText('Reprendre le run applicatif')).toBeInTheDocument()
    expect(screen.getByText('TMA du portail transporteurs')).toBeInTheDocument()
  })

  it('nomme l’absence — jamais masquée, jamais devinée', () => {
    show({ objective: null, perimeter: null })
    expect(screen.getAllByTitle('non renseigné')).toHaveLength(2)
  })

  it('ÉCRIT les deux champs par le formulaire de réparation de la fiche', async () => {
    show({ objective: null, perimeter: null })
    await userEvent.click(screen.getByRole('button', { name: /modifier l’objectif et le périmètre/i }))
    await userEvent.type(screen.getByLabelText('Objectif de la mission'), 'Stabiliser la plateforme')
    await userEvent.type(screen.getByLabelText('Périmètre de la mission'), 'Refonte du module facturation')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      const patch = apiFetchMock.mock.calls.find(call => (call[0] as { method?: string }).method === 'PATCH')
      expect(patch?.[0]).toMatchObject({
        body: { objective: 'Stabiliser la plateforme', perimeter: 'Refonte du module facturation' },
      })
    })
  })

  it('ne renvoie AUCUNE clé pour un champ non touché', async () => {
    show({ objective: 'Déjà là', perimeter: null })
    await userEvent.click(screen.getByRole('button', { name: /modifier l’objectif et le périmètre/i }))
    await userEvent.type(screen.getByLabelText('Périmètre de la mission'), 'Nouveau périmètre')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      const patch = apiFetchMock.mock.calls.find(call => (call[0] as { method?: string }).method === 'PATCH')
      expect(patch?.[0]).toMatchObject({ body: { perimeter: 'Nouveau périmètre' } })
      expect((patch?.[0] as { body?: Record<string, unknown> }).body).not.toHaveProperty('objective')
    })
  })
})

describe('MissionDetailTabs — l’onglet Historique porte aussi le journal DE LA mission (#2953, #2193.50)', () => {
  it('demande le journal de CETTE mission, distinct de la timeline du compte', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Documents & suivi' }))

    await waitFor(() => {
      expect(callsTo('/delivery/missions/11111111-1111-4111-8111-111111111111/history')).toHaveLength(1)
    })
  })
})

/**
 * #2953 (#2193.25-30) — LE SUIVI, dans l'onglet Synthèse : le fil de notes
 * polymorphe (`notes`, déjà servi à `account`/`contact`/`consultant`) monté
 * sur CETTE mission — jamais un sixième onglet (voir le docblock de
 * `MissionTrackingSection`).
 */
describe('MissionDetailTabs — Synthèse porte le Suivi (#2953, #2193.25-30)', () => {
  it('monte le fil de notes sur CETTE mission — entityType "mission"', () => {
    show({ id: 'm-77' })
    expect(screen.getByTestId('notes-panel')).toHaveTextContent('mission:m-77')
  })
})

/**
 * #2930 (point couvert #2191.38) — LE BESOIN D'ORIGINE (`opportunity_id`).
 *
 * N'était pas un refus PRODUIT : `opportunity_id` sortait en UUID nu faute de
 * résolution GROUPÉE côté serveur (`DeliveryService.opportunitiesOf`). Cette
 * fiche lit désormais `opportunityLabel`, jamais l'identifiant brut.
 */
describe('MissionDetailTabs — Synthèse porte le besoin d’origine (#2930)', () => {
  it('affiche le libellé résolu, jamais l’UUID', () => {
    show({ opportunity_id: 'op-1', opportunityLabel: 'Refonte du SI paiement' })
    expect(screen.getByText('Refonte du SI paiement')).toBeInTheDocument()
    expect(screen.queryByText('op-1')).not.toBeInTheDocument()
  })

  it('nomme l’absence — jamais un UUID — sans besoin lié', () => {
    show({ opportunity_id: null, opportunityLabel: null })
    expect(screen.getByTitle('aucun besoin d’origine n’est lié à cette mission')).toBeInTheDocument()
  })

  // #2953 (#2193.59) — un objet source cité par son nom, sans pouvoir
  // l'ouvrir, est du texte mort : le libellé devient un lien vers le besoin.
  it('ouvre le besoin d’origine — le libellé est un LIEN (#2953, #2193.59)', () => {
    show({ opportunity_id: 'op-1', opportunityLabel: 'Refonte du SI paiement' })
    expect(screen.getByRole('link', { name: 'Refonte du SI paiement' })).toHaveAttribute('href', '/projects/op-1')
  })
})

/**
 * #2953 (#2193.48) — LE POSITIONNEMENT D'ORIGINE (`submission_id`), même
 * patron que le besoin d'origine juste au-dessus, sur `DeliveryService.
 * submissionsOf` cette fois. La ligne n'apparaît QUE quand un positionnement
 * est lié — pas un « aucun » nu sur un champ que la majorité des missions ne
 * portent pas.
 */
describe('MissionDetailTabs — Synthèse porte le positionnement d’origine (#2953, #2193.48)', () => {
  it('n’affiche AUCUNE ligne sans positionnement lié', () => {
    show({ submission_id: null, submissionLabel: null })
    expect(screen.queryByText('Positionnement d’origine')).not.toBeInTheDocument()
  })

  it('ouvre le positionnement — le libellé résolu est un LIEN, jamais l’UUID', () => {
    show({ submission_id: 'sub-1', submissionLabel: 'Awa Diop → Refonte du SI paiement' })
    expect(screen.getByText('Positionnement d’origine')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Awa Diop → Refonte du SI paiement' })
    expect(link).toHaveAttribute('href', '/submissions/sub-1')
    expect(screen.queryByText('sub-1')).not.toBeInTheDocument()
  })

  it('nomme l’absence — jamais un UUID — quand le positionnement lié est illisible', () => {
    show({ submission_id: 'sub-1', submissionLabel: null })
    expect(screen.getByTitle('aucun positionnement d’origine n’est lié à cette mission')).toBeInTheDocument()
  })
})

/**
 * #2953 (#2193.39) — LE PRÉAVIS devient SAISISSABLE.
 *
 * `noticeDays` existait déjà dans le contrat et était RECOPIÉ à chaque
 * écriture des conditions commerciales (`replacedFields`) — sans qu'aucun
 * écran ne le rende visible ni modifiable. Même défaut n°1 que partout dans
 * ce dépôt : un champ juste que personne ne nourrit.
 */
describe('MissionDetailTabs — le préavis devient saisissable (#2953, #2193.39)', () => {
  it('affiche le préavis déjà enregistré', async () => {
    withTerms({ noticeDays: 30 })
    show()
    await openTerms()
    expect(screen.getByLabelText(/préavis/i)).toHaveValue(30)
  })

  it('enregistre le préavis saisi, en recopiant les autres champs de remplacement', async () => {
    const mutate = vi.fn()
    setTerms.mockReturnValue({ mutate, isPending: false })
    withTerms({ noticeDays: null })
    show()
    await openTerms()

    await userEvent.type(screen.getByLabelText(/préavis/i), '45')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer le préavis/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const payload = mutate.mock.calls[0]?.[0]
    expect(payload.noticeDays).toBe(45)
    expect(payload.channel).toBe('direct')
  })

  it('efface le préavis avec un champ VIDÉ — jamais un zéro', async () => {
    const mutate = vi.fn()
    setTerms.mockReturnValue({ mutate, isPending: false })
    withTerms({ noticeDays: 30 })
    show()
    await openTerms()

    await userEvent.clear(screen.getByLabelText(/préavis/i))
    await userEvent.click(screen.getByRole('button', { name: /enregistrer le préavis/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0].noticeDays).toBeNull()
  })
})

/**
 * LE MANQUE : un bon de commande réduit à son numéro, et son numéro
 * recopié en lecture seule — même pas saisissable. Ce lot ajoute la date, le
 * montant, le volume de jours, et la barre qui dit ce qu'il en reste.
 */
describe('MissionDetailTabs — le bon de commande dit ce qu’il reste', () => {
  it('le NUMÉRO devient saisissable — il n’était que recopié', async () => {
    withTerms({ poNumber: 'PO-2026-0418' })
    show()
    await openTerms()
    expect(screen.getByLabelText(/numéro du bon de commande/i)).toHaveValue('PO-2026-0418')
  })

  it('enregistre les QUATRE champs du bon de commande en un seul geste', async () => {
    const mutate = vi.fn()
    setTerms.mockReturnValue({ mutate, isPending: false })
    withTerms({ poNumber: null, poIssuedOn: null, poAmountCents: null, poVolumeDays: null })
    show()
    await openTerms()

    await userEvent.type(screen.getByLabelText(/numéro du bon de commande/i), 'PO-2026-0777')
    const dateInput = screen.getByLabelText(/date du bon de commande/i)
    // `fireEvent`-style saisie directe : `userEvent.type` sur un `<input
    // type="date">` ne compose pas fiablement le format AAAA-MM-JJ selon
    // l'environnement de test.
    await userEvent.click(dateInput)
    await userEvent.paste('2026-03-01')
    await userEvent.type(screen.getByLabelText(/montant du bon de commande/i), '28000')
    await userEvent.type(screen.getByLabelText(/volume de jours/i), '50')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer le bon de commande/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const payload = mutate.mock.calls[0]?.[0]
    expect(payload.poNumber).toBe('PO-2026-0777')
    expect(payload.poIssuedOn).toBe('2026-03-01')
    expect(payload.poAmountCents).toBe(2_800_000)
    expect(payload.poVolumeDays).toBe(50)
    // Les champs de REMPLACEMENT sont recopiés : enregistrer le bon de
    // commande ne doit pas remettre le coût chargé ni le canal à « non
    // renseigné ».
    expect(payload.channel).toBe('direct')
  })

  // #2566.2 — la date de validité, saisissable comme les quatre autres champs.
  it('enregistre la date de VALIDITÉ du bon de commande', async () => {
    const mutate = vi.fn()
    setTerms.mockReturnValue({ mutate, isPending: false })
    withTerms({ poValidUntil: null })
    show()
    await openTerms()

    const validUntilInput = screen.getByLabelText(/valide jusqu.au/i)
    await userEvent.click(validUntilInput)
    await userEvent.paste('2026-09-30')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer le bon de commande/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0].poValidUntil).toBe('2026-09-30')
  })

  it('efface le montant et le volume avec un champ VIDÉ — jamais un zéro', async () => {
    const mutate = vi.fn()
    setTerms.mockReturnValue({ mutate, isPending: false })
    withTerms({ poAmountCents: 2_800_000, poVolumeDays: 50 })
    show()
    await openTerms()

    await userEvent.clear(screen.getByLabelText(/montant du bon de commande/i))
    await userEvent.clear(screen.getByLabelText(/volume de jours/i))
    await userEvent.click(screen.getByRole('button', { name: /enregistrer le bon de commande/i }))

    const payload = mutate.mock.calls[0]?.[0]
    expect(payload.poAmountCents).toBeNull()
    expect(payload.poVolumeDays).toBeNull()
  })

  describe('la barre de consommation — trois cas, séparément', () => {
    it('les DEUX connus : 56 % affiché', async () => {
      withTerms({ poVolumeDays: 50, poConsumedDays: 28, poConsumption: { percent: 56, remainingDays: 22 } })
      show()
      await openTerms()
      expect(screen.getByText(/56 % consommé/)).toBeInTheDocument()
    })

    it('le VOLUME manque : jamais une barre à 0 %, un message NOMMÉ à la place', async () => {
      withTerms({ poVolumeDays: null, poConsumedDays: null, poConsumption: null })
      show()
      await openTerms()
      expect(screen.getByText(/volume non renseigné/i)).toBeInTheDocument()
      expect(screen.queryByText(/0 % consommé/)).not.toBeInTheDocument()
    })

    it('la CONSOMMATION n’est pas mesurable : « non mesurée », jamais « 0 % consommé »', async () => {
      withTerms({ poVolumeDays: 50, poConsumedDays: null, poConsumption: null })
      show()
      await openTerms()
      expect(screen.getByText(/consommation non mesurée/i)).toBeInTheDocument()
      expect(screen.queryByText(/0 % consommé/)).not.toBeInTheDocument()
    })

    it('un DÉPASSEMENT se voit — le pourcentage dépasse 100 et le dit', async () => {
      withTerms({ poVolumeDays: 50, poConsumedDays: 60, poConsumption: { percent: 120, remainingDays: -10 } })
      show()
      await openTerms()
      expect(screen.getByText(/120 % consommé/)).toBeInTheDocument()
      expect(screen.getByText(/dépassé de 10 jours/i)).toBeInTheDocument()
    })
  })

  it('ne propose RIEN du bon de commande sans le droit financier', async () => {
    terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
    show()
    await openTerms()
    expect(screen.queryByLabelText(/numéro du bon de commande/i)).not.toBeInTheDocument()
  })
})

const MISSION_ID = '11111111-1111-4111-8111-111111111111'

/**
 * LE MANQUE (30/08/2026) : une mission ne montrait pas ses relevés d'activité —
 * il fallait quitter la fiche et retrouver la mission dans `/missions/cra`.
 *
 * ⚠️ `GET /delivery/timesheets` est une route SANS permission déclarée : la
 * section vit donc AVANT la porte `finance:read` de `TermsTab`, et le prouve —
 * elle reste visible même quand `canReadFinance: false`.
 */
/**
 * #2953 (#2193.41-43) — CRA, facturation, paiement : trois liens vers les
 * écrans qui traitent déjà ces trois sujets, montrés QUEL QUE SOIT le droit
 * financier (même légitimité que les deux sections juste au-dessus).
 */
describe('MissionDetailTabs — Finance pointe vers CRA, facturation et paiement (#2953)', () => {
  it('propose les trois liens dans l’onglet Conditions', async () => {
    show()
    await openTerms()
    expect(screen.getByRole('link', { name: /voir les cra/i })).toHaveAttribute('href', '/missions/cra')
    expect(screen.getByRole('link', { name: /voir la facturation/i })).toHaveAttribute('href', '/missions/facturation')
    expect(screen.getByRole('link', { name: /voir les encaissements/i })).toHaveAttribute(
      'href',
      '/missions/encaissements',
    )
  })

  it('reste visible SANS le droit financier — même légitimité que les relevés et la facturation', async () => {
    terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
    show()
    await openTerms()
    expect(screen.getByRole('link', { name: /voir les cra/i })).toBeInTheDocument()
  })
})

describe('MissionDetailTabs — les relevés d’activité de LA mission', () => {
  it('demande les relevés FILTRÉS sur cette mission — pas le mois entier', async () => {
    show()
    await openTerms()

    await waitFor(() => expect(callsTo('/delivery/timesheets')).toHaveLength(1))
    const call = callsTo('/delivery/timesheets')[0]
    expect(call?.path).toContain(`missionId=${MISSION_ID}`)
  })

  it('affiche le relevé de CETTE mission — statut et jours', async () => {
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith('/delivery/timesheets')) {
        return Promise.resolve(
          timesheetsPage({
            items: [
              {
                timesheetId: 'ts-1',
                missionId: MISSION_ID,
                missionLabel: 'Renfort plateforme',
                accountName: 'ACME',
                consultantId: 'c-1',
                consultantName: 'Chris Val',
                periodMonth: '2026-08-01',
                status: 'validated',
                days: 18,
                expectedDays: 18,
                gap: 0,
                gapKind: 'none',
                gapExplanation: null,
                blocksInvoicing: false,
                validatedByClientAt: '2026-09-02T00:00:00.000Z',
                anomalies: [],
                remindersSent: 0,
                lastReminderAt: null,
                rejectedAt: null,
                rejectionReason: null,
              },
            ],
          }),
        )
      }
      return Promise.resolve(readinessPage())
    })
    show()
    await openTerms()

    expect(await screen.findByText('Chris Val')).toBeInTheDocument()
    expect(screen.getByText('Validé')).toBeInTheDocument()
  })

  it('nomme l’absence de relevé sur ce mois — jamais un tableau simplement vide', async () => {
    show()
    await openTerms()
    expect(await screen.findByText(/aucun relevé sur ce mois pour cette mission/i)).toBeInTheDocument()
  })

  it('reste VISIBLE sans le droit financier — la liste est légitime pour tout le monde', async () => {
    // ⚠️ Le point qui compte : cette section vit AVANT la porte `finance:read`
    // de `TermsTab`. Un gestionnaire de delivery sans ce droit doit pouvoir
    // lire « relevé manquant » — même arbitrage que `GET /delivery/missions`.
    terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
    show()
    await openTerms()

    // Le texte « pas le droit financier » (finance.noAccess) reste affiché…
    expect(await screen.findByText(/pas dans ton périmètre/i)).toBeInTheDocument()
    // …et la section des relevés aussi, à côté : les deux ne s'excluent pas.
    expect(screen.getByText(/aucun relevé sur ce mois pour cette mission/i)).toBeInTheDocument()
  })
})

/**
 * LE MANQUE (30/08/2026), deuxième moitié : une mission ne montrait pas non
 * plus son état de facturation — il fallait la retrouver dans
 * `/missions/facturation`, sur le mois entier de l'espace.
 *
 * ⚠️ `invoiceReadinessQuerySchema` a gagné un `missionId` optionnel — un
 * changement de CONTRAT sur un schéma `.strict()`. `GET
 * /delivery/invoice-readiness` reste une route SANS permission déclarée : la
 * section vit donc AVANT la porte `finance:read`, comme les relevés.
 */
describe('MissionDetailTabs — la facturation de LA mission', () => {
  it('demande la facturation FILTRÉE sur cette mission — pas le mois entier', async () => {
    show()
    await openTerms()

    await waitFor(() => expect(callsTo('/delivery/invoice-readiness')).toHaveLength(1))
    const call = callsTo('/delivery/invoice-readiness')[0]
    expect(call?.path).toContain(`missionId=${MISSION_ID}`)
  })

  it('affiche l’état de facturation de CETTE mission — bloqueurs nommés', async () => {
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith('/delivery/invoice-readiness')) {
        return Promise.resolve(
          readinessPage({
            items: [
              {
                missionId: MISSION_ID,
                missionLabel: 'Renfort plateforme',
                accountName: 'ACME',
                periodMonth: '2026-08-01',
                state: 'blocked',
                blockers: ['missing_timesheet'],
                days: null,
                preparedAmountCents: null,
                invoicedAt: null,
                invoiceReference: null,
                invoicedAmountCents: null,
                dueOn: null,
                remindersSent: 0,
                lastReminderAt: null,
                paidAt: null,
                paidAmountCents: null,
                disputedAt: null,
                disputeReason: null,
                disputeResolvedAt: null,
              },
            ],
          }),
        )
      }
      return Promise.resolve(timesheetsPage())
    })
    show()
    await openTerms()

    expect(await screen.findByText('Bloqué')).toBeInTheDocument()
    expect(screen.getByText('Aucun relevé d’activité')).toBeInTheDocument()
  })

  it('nomme l’absence de facturation sur ce mois — le modèle réutilisé de l’écran global', async () => {
    show()
    await openTerms()
    // La même phrase que `/missions/facturation` : « Rien à surveiller sur ce
    // mois. » — l'état vide déjà cité en modèle dans ce dépôt, pas une
    // nouvelle formulation.
    expect(await screen.findByText('Rien à surveiller sur ce mois.')).toBeInTheDocument()
  })

  it('reste VISIBLE sans le droit financier — le montant seul est rédigé', async () => {
    // ⚠️ Le point qui compte : cette section vit AVANT la porte `finance:read`
    // de `TermsTab`. Un gestionnaire de delivery sans ce droit doit pouvoir
    // lire « bloqué » — même arbitrage que `GET /delivery/invoice-readiness`.
    terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith('/delivery/invoice-readiness')) {
        return Promise.resolve(
          readinessPage({
            canReadFinance: false,
            items: [
              {
                missionId: MISSION_ID,
                missionLabel: 'Renfort plateforme',
                accountName: 'ACME',
                periodMonth: '2026-08-01',
                state: 'blocked',
                blockers: ['missing_timesheet'],
                days: null,
                preparedAmountCents: null,
                invoicedAt: null,
                invoiceReference: null,
                invoicedAmountCents: null,
                dueOn: null,
                remindersSent: 0,
                lastReminderAt: null,
                paidAt: null,
                paidAmountCents: null,
                disputedAt: null,
                disputeReason: null,
                disputeResolvedAt: null,
              },
            ],
          }),
        )
      }
      return Promise.resolve(timesheetsPage())
    })
    show()
    await openTerms()

    // Le texte « pas le droit financier » reste affiché…
    expect(await screen.findByText(/pas dans ton périmètre/i)).toBeInTheDocument()
    // …et le bloqueur de facturation aussi, à côté : les deux ne s'excluent
    // pas, ce sont deux portes différentes.
    expect(screen.getByText('Bloqué')).toBeInTheDocument()
    // Aucun MONTANT, en revanche : c'est lui, et lui seul, qui est rédigé.
    expect(screen.queryByText(/€$/)).not.toBeInTheDocument()
  })

  // #2563.1 — le TJM manquait sur la préparation, alors que le client le
  // demande explicitement (« période, jours, TJM, montant »).
  it('affiche le TJM à côté des jours et du montant', async () => {
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith('/delivery/invoice-readiness')) {
        return Promise.resolve(
          readinessPage({
            items: [
              {
                missionId: MISSION_ID,
                missionLabel: 'Renfort plateforme',
                accountName: 'ACME',
                periodMonth: '2026-08-01',
                state: 'ready',
                blockers: [],
                days: 18,
                dailyRateCents: 65_000,
                preparedAmountCents: 18 * 65_000,
                invoicedAt: null,
                invoiceReference: null,
                invoicedAmountCents: null,
                dueOn: null,
                remindersSent: 0,
                lastReminderAt: null,
                paidAt: null,
                paidAmountCents: null,
                disputedAt: null,
                disputeReason: null,
                disputeResolvedAt: null,
              },
            ],
          }),
        )
      }
      return Promise.resolve(timesheetsPage())
    })
    show()
    await openTerms()

    expect(await screen.findByText(/650 €\/j/)).toBeInTheDocument()
  })

  // #2566.2 — le blocage nomme son OWNER, pas seulement l'écran où agir.
  it('nomme le CHARGÉ D’AFFAIRES sur le blocage « bon de commande expiré »', async () => {
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith('/delivery/invoice-readiness')) {
        return Promise.resolve(
          readinessPage({
            items: [
              {
                missionId: MISSION_ID,
                missionLabel: 'Renfort plateforme',
                accountName: 'ACME',
                periodMonth: '2026-08-01',
                state: 'blocked',
                blockers: ['po_period_mismatch'],
                days: 18,
                preparedAmountCents: null,
                invoicedAt: null,
                invoiceReference: null,
                invoicedAmountCents: null,
                dueOn: null,
                remindersSent: 0,
                lastReminderAt: null,
                paidAt: null,
                paidAmountCents: null,
                disputedAt: null,
                disputeReason: null,
                disputeResolvedAt: null,
                ownerId: 'u2',
                ownerName: 'Awa Diallo',
              },
            ],
          }),
        )
      }
      return Promise.resolve(timesheetsPage())
    })
    show()
    await openTerms()

    expect(await screen.findByText('Bon de commande expiré pour ce mois')).toBeInTheDocument()
    expect(screen.getByText(/Awa Diallo/)).toBeInTheDocument()
  })
})

/**
 * #2415.9 — un FORFAIT ne réclame pas de relevé, mais se facture aux jalons :
 * `GET /delivery/missions/:id/billing` (`MissionBillingService.read`, backend
 * livré par #2417.3) n'avait AUCUN appelant web (`git grep MissionBillingRead
 * apps/web` rendait zéro résultat) — « du code juste, calculé, testé, que
 * personne n'appelle ». Cette section le monte, gardée par `contractKind`.
 */
function billingRead(over: Record<string, unknown> = {}) {
  return {
    milestones: [],
    retainerMonthlyCents: null,
    retainerThisMonthCents: null,
    placementFeeCents: null,
    placementGuaranteeDays: null,
    placementGuarantee: null,
    source: 'manual',
    ...over,
  }
}

describe('MissionDetailTabs — le forfait affiche ses jalons (#2415.9)', () => {
  it('demande et affiche les jalons DÉCLARÉS d’un forfait — libellé, date, montant', async () => {
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith(`/delivery/missions/${MISSION_ID}/billing`)) {
        return Promise.resolve(
          billingRead({
            milestones: [
              { id: 'm1', label: 'Livraison V1', dueOn: '2026-10-01', amountCents: 500_000, source: 'manual' },
            ],
          }),
        )
      }
      if (request.path.startsWith('/delivery/invoice-readiness')) return Promise.resolve(readinessPage())
      return Promise.resolve(timesheetsPage())
    })
    show({ contract_kind: 'forfait' })
    await openTerms()

    expect(await screen.findByText('Livraison V1')).toBeInTheDocument()
    expect(screen.getByText('5000 €')).toBeInTheDocument()
  })

  it('nomme l’absence de jalon — jamais une liste simplement vide', async () => {
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith(`/delivery/missions/${MISSION_ID}/billing`)) {
        return Promise.resolve(billingRead())
      }
      if (request.path.startsWith('/delivery/invoice-readiness')) return Promise.resolve(readinessPage())
      return Promise.resolve(timesheetsPage())
    })
    show({ contract_kind: 'forfait' })
    await openTerms()

    expect(await screen.findByText('Aucun jalon déclaré')).toBeInTheDocument()
  })

  it('ne demande RIEN sur une mission en RÉGIE — la section ne se monte pas', async () => {
    show({ contract_kind: 'regie' })
    await openTerms()

    await waitFor(() => expect(callsTo('/delivery/invoice-readiness')).toHaveLength(1))
    expect(callsTo(`/delivery/missions/${MISSION_ID}/billing`)).toHaveLength(0)
    expect(screen.queryByText('Aucun jalon déclaré')).not.toBeInTheDocument()
  })
})

/**
 * #2565.9 — LA PORTE devant du code déjà écrit et testé côté serveur
 * (`InvoiceConnectorWriteService`, `InvoiceConnectorWriteController`) :
 * `git grep -rn "invoice-connector" -- apps/web` rendait ZÉRO avant ce lot.
 *
 * Un item de facturation PRÊT, complet — même régime que les autres blocs de
 * ce fichier : `readinessPage` + un item littéral, une route par test.
 */
function readyItem(over: Record<string, unknown> = {}) {
  return {
    missionId: MISSION_ID,
    missionLabel: 'Renfort plateforme',
    accountName: 'ACME',
    legalEntityName: null,
    periodMonth: '2026-08-01',
    state: 'ready',
    blockers: [],
    days: 18,
    dailyRateCents: 65_000,
    preparedAmountCents: 18 * 65_000,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  }
}

/** Le routeur de mock, étendu au connecteur : la même forme que les blocs
 *  précédents (une route par test, un catch-all sur les relevés). `connector`
 *  répond à la LECTURE (`GET .../:missionId/:periodMonth`) ; `send` est un
 *  mock SÉPARÉ, appelé par la ROUTE d'écriture (`POST .../send`), jamais par
 *  la même fonction — un test qui ne fournit pas `send` prouve que le clic
 *  « Valider » est le SEUL geste qui l'atteint. */
function routeConnector(options: {
  item?: Record<string, unknown> | null
  connector?: unknown
  send?: () => Promise<unknown>
}) {
  const { item = readyItem(), connector = null, send } = options
  apiFetchMock.mockImplementation((request: { path: string; method?: string }) => {
    if (request.path.startsWith('/delivery/invoice-readiness')) {
      return Promise.resolve(readinessPage({ items: item ? [item] : [] }))
    }
    if (request.path === '/delivery/invoice-connector/send') {
      if (!send) throw new Error('POST /delivery/invoice-connector/send inattendu dans ce test')
      return send()
    }
    if (request.path.startsWith('/delivery/invoice-connector/')) {
      return Promise.resolve(connector)
    }
    return Promise.resolve(timesheetsPage())
  })
}

describe('MissionDetailTabs — la facturation chez l’outil connecté (#2565.9)', () => {
  it('ne propose RIEN quand le mois n’est pas prêt à facturer', async () => {
    routeConnector({ item: readyItem({ state: 'blocked', blockers: ['missing_timesheet'] }) })
    show()
    await openTerms()

    await screen.findByText('Bloqué')
    expect(screen.queryByRole('button', { name: /brouillon de facture/i })).not.toBeInTheDocument()
  })

  it('propose de créer la facture quand le mois est PRÊT et qu’aucune écriture n’existe — nomme la CAPACITÉ sans outil branché', async () => {
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    expect(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    ).toBeInTheDocument()
  })

  it('nomme l’outil que l’ESPACE a BRANCHÉ, par injection — jamais un littéral (GA-44)', async () => {
    connectedCapabilities.mockReturnValue({
      families: ['admin_docs'],
      tools: [{ provider: 'odoo', family: 'admin_docs', name: 'Odoo' }],
      isLoading: false,
    })
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    expect(await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans Odoo' })).toBeInTheDocument()
  })

  it('ne nomme PAS un outil connecté qui n’est pas le connecteur facture — même prédicat que le serveur', async () => {
    // Un CRM branché (famille `crm`) ne doit JAMAIS prêter son nom à ce
    // geste : seule la famille `admin_docs`, ou Odoo par son identifiant,
    // reçoit l'écriture côté serveur (`InvoiceConnectorWriteController.
    // connectedInvoicingProvider`) — un mirroir qui diverge nommerait ici un
    // outil différent de celui qui répond vraiment.
    connectedCapabilities.mockReturnValue({
      families: ['crm'],
      tools: [{ provider: 'hubspot', family: 'crm', name: 'HubSpot' }],
      isLoading: false,
    })
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    expect(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/HubSpot/)).not.toBeInTheDocument()
  })

  it('prévisualise avant d’envoyer — le clic sur « Valider » est le SEUL geste qui écrit', async () => {
    const send = vi.fn(async () => ({
      id: 'w-1',
      missionId: MISSION_ID,
      periodMonth: '2026-08-01',
      state: 'invoiced',
      preview: [],
      invoiceReference: 'REF-42',
      detail: null,
      createdAt: '2026-08-05T00:00:00.000Z',
    }))
    routeConnector({ item: readyItem(), connector: null, send })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    // La prévisualisation FIGÉE : mission, client, ligne, montant HT — rien
    // n'est encore parti.
    expect(await screen.findByText('Vérifie le brouillon avant de le déposer')).toBeInTheDocument()
    expect(screen.getByText('Renfort plateforme')).toBeInTheDocument()
    expect(screen.getByText('ACME')).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()

    // #2565.10 — elle dit ce qui sera ÉCRIT, et que c'est un BROUILLON que
    // l'utilisateur valide lui-même dans son outil : Bellum n'émet rien.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Client')).toBeInTheDocument()
    expect(within(dialog).getByText('Ligne')).toBeInTheDocument()
    expect(within(dialog).getByText(/^18 j × 650/)).toBeInTheDocument()
    expect(within(dialog).getByText('Montant HT')).toBeInTheDocument()
    expect(within(dialog).getByText(/dépose un BROUILLON de facture/)).toBeInTheDocument()
    expect(within(dialog).getByText(/tu le valides toi-même/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        'Brouillon déposé dans ton outil de gestion — référence REF-42. À toi de le valider dans ton outil de gestion.',
      ),
    ).toBeInTheDocument()
  })

  /**
   * #2197.34 — le champ existe déjà côté contrat (`InvoiceReadiness.poNumber`,
   * exposé pour être affiché « dans les RÉFÉRENCES de la préparation ») mais
   * n'atteignait jamais ce dialogue précis : test ciblé, ne monte QUE l'onglet
   * Conditions (`openTerms()`), pas les autres onglets de la fiche.
   */
  it('la prévisualisation nomme la référence du bon de commande (#2197.34)', async () => {
    routeConnector({ item: readyItem({ poNumber: 'BDC-2026-118' }), connector: null })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Référence')).toBeInTheDocument()
    expect(within(dialog).getByText('BDC-2026-118')).toBeInTheDocument()
  })

  /**
   * #2197.29 — l'ENTITÉ (société facturante) est le premier des huit champs
   * que la préparation doit montrer avant tout dépôt ; elle avait sa propre
   * colonne sur le tableau (#2197.9) mais jamais cette ligne dans la
   * prévisualisation FIGÉE.
   */
  it('la prévisualisation nomme l’entité facturante (#2197.29)', async () => {
    routeConnector({ item: readyItem({ legalEntityName: 'Bellum Conseil' }) })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Société facturante')).toBeInTheDocument()
    expect(within(dialog).getByText('Bellum Conseil')).toBeInTheDocument()
  })

  it('la prévisualisation dit qu’aucune entité n’est rattachée, jamais une raison sociale inventée (#2197.29)', async () => {
    routeConnector({ item: readyItem({ legalEntityName: null }) })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Aucune société renseignée')).toBeInTheDocument()
  })

  it('la prévisualisation montre les pièces jointes de la facture préparée (#2814)', async () => {
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Pièces jointes')).toBeInTheDocument()
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({ path: `/delivery/invoice-attachments/${MISSION_ID}/2026-08-01` }),
    )
  })

  it('la prévisualisation dit qu’aucune référence n’est saisie, jamais une valeur inventée (#2197.34)', async () => {
    routeConnector({ item: readyItem({ poNumber: null }), connector: null })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Référence')).toBeInTheDocument()
    expect(within(dialog).getByText('Aucune référence saisie')).toBeInTheDocument()
  })

  it('un ÉCHEC est REJOUABLE — « Réessaie », jamais « Réessayez »', async () => {
    routeConnector({
      item: readyItem(),
      connector: {
        id: 'w-2',
        missionId: MISSION_ID,
        periodMonth: '2026-08-01',
        state: 'failed',
        preview: [],
        invoiceReference: null,
        detail:
          "Aucun connecteur d'écriture vérifié pour cet outil — fonctionnalité retenue (#2565). Rien n'est parti.",
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    })
    show()
    await openTerms()

    expect(await screen.findByRole('button', { name: 'Réessaie' })).toBeInTheDocument()
    expect(screen.queryByText(/Réessayez/)).not.toBeInTheDocument()
    expect(screen.getByText(/fonctionnalité retenue/)).toBeInTheDocument()
  })

  /**
   * #2565.9 — LE TEST QUI SAIT DIRE NON : « un timeout n'est pas un échec »,
   * et `unknown` ARRÊTE la reprise. Sans lui, un futur geste « pratique »
   * pourrait rebrancher un bouton de rejeu sur cet état précis — celui-là
   * même où une facture a pu partir sans qu'on le sache, où rejouer risque
   * un DOUBLE dépôt.
   */
  it('`unknown` n’offre AUCUN bouton de reprise — l’humain tranche', async () => {
    routeConnector({
      item: readyItem(),
      connector: {
        id: 'w-3',
        missionId: MISSION_ID,
        periodMonth: '2026-08-01',
        state: 'unknown',
        preview: [],
        invoiceReference: null,
        detail: 'Le distant ne répond plus.',
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    })
    show()
    await openTerms()

    expect(
      await screen.findByText('Nous ne savons pas si le brouillon a été déposé — vérifie dans ton outil de gestion.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /brouillon de facture|réessaie/i })).not.toBeInTheDocument()
  })

  /**
   * #2565.10 — craft rule n°9 : le geste existe AUSSI en démonstration. La
   * prévisualisation s'ouvre, dit « brouillon », et dit que la démo n'écrit
   * dans aucun outil — sans bouton « Valider », donc sans requête d'écriture.
   */
  it('en démonstration : la prévisualisation s’ouvre, dit qu’elle n’écrit dans aucun outil, et RIEN ne part', async () => {
    isDemo.mockReturnValue(true)
    // Aucun `send` fourni : un POST d'écriture ferait échouer ce test.
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/dépose un BROUILLON de facture/)).toBeInTheDocument()
    expect(
      within(dialog).getByText('Démonstration : rien n’est écrit dans aucun outil. Voici exactement ce qui partirait.'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
    expect(callsTo('/delivery/invoice-connector/send')).toHaveLength(0)
  })

  it('aucun outil branché — le refus SERVEUR s’affiche TEL QUEL, avant toute ligne', async () => {
    const send = vi.fn(async () => {
      throw new Error(
        'Aucun outil de gestion connecté : rien ne peut partir. Connecte-le dans Réglages › Intégrations.',
      )
    })
    routeConnector({ item: readyItem(), connector: null, send })
    show()
    await openTerms()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(
      await screen.findByText(
        'Aucun outil de gestion connecté : rien ne peut partir. Connecte-le dans Réglages › Intégrations.',
      ),
    ).toBeInTheDocument()
    // Le bouton reprend sa place : rien n'a été créé côté serveur (409 AVANT
    // toute ligne), donc l'état reste `null` — pas de tentative à rejouer.
    expect(
      screen.getByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    ).toBeInTheDocument()
  })

  /**
   * H25 (#2565.10) — un bouton qui promet un geste impossible est une
   * fausse affordance : le serveur exige déjà `finance:write`
   * (`@RequirePermission('finance:write')`, `invoice-connector-write.
   * controller.ts`) sur la route d'écriture. Sans ce droit, le clic
   * rendait un 403 — le bouton ne doit donc jamais apparaître, et la
   * raison de son absence se lit à sa place (même convention que
   * `RexScreen.tsx` : « On retire le GESTE, pas l'information »).
   */
  it('H25 — sans `finance:write`, le bouton disparaît et la raison se lit', async () => {
    team.mockReturnValue({ team: { workspace: { role: 'sales' } } })
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    expect(screen.queryByRole('button', { name: /brouillon de facture/i })).not.toBeInTheDocument()
    expect(
      await screen.findByText('Dépôt réservé — demande le droit d’écriture financière pour le faire toi-même.'),
    ).toBeInTheDocument()
  })

  it('H25 — avec `finance:write`, le bouton reste visible', async () => {
    team.mockReturnValue({ team: { workspace: { role: 'finance' } } })
    routeConnector({ item: readyItem(), connector: null })
    show()
    await openTerms()

    expect(
      await screen.findByRole('button', { name: 'Déposer un brouillon de facture dans ton outil de gestion' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Dépôt réservé — demande le droit d’écriture financière pour le faire toi-même.'),
    ).not.toBeInTheDocument()
  })
})

/**
 * LE DÉFAUT mesuré à l'œil le 30/08/2026 : la section « Facturation » de la
 * fiche affichait un mois ISO brut (« 2026-07 »), et c'était le mois
 * PRÉCÉDENT — un mois où une mission commencée le 06/08 n'existait pas
 * encore, alors que le mois COURANT avait, lui, des données.
 *
 * Le format (A) et le choix du mois (B) sont deux bugs DISTINCTS et testés
 * séparément : un mois juste mais brut, ou un mois formaté mais faux, ne se
 * corrigent pas de la même façon.
 *
 * ⚠️ Horloge FIGÉE sur la date exacte mesurée, jamais l'horloge réelle : un
 * test posé sur « aujourd'hui » passerait onze mois sur douze et ne garderait
 * donc rien le douzième — même remarque que `FinanceScreen.test.tsx`.
 */
describe('MissionDetailTabs — LE MOIS des deux sections mission-scopées', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-30T09:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('demande le mois COURANT aux deux routes — pas le mois précédent du rituel « 5 du mois »', async () => {
    show()
    await openTerms()

    await waitFor(() => expect(callsTo('/delivery/timesheets')).toHaveLength(1))
    await waitFor(() => expect(callsTo('/delivery/invoice-readiness')).toHaveLength(1))

    const timesheetsPath = callsTo('/delivery/timesheets')[0]?.path
    const readinessPath = callsTo('/delivery/invoice-readiness')[0]?.path
    expect(timesheetsPath).toContain('month=2026-08')
    expect(readinessPath).toContain('month=2026-08')
    // Le mois précédent — l'ancien défaut — ne doit apparaître nulle part.
    expect(timesheetsPath).not.toContain('month=2026-07')
    expect(readinessPath).not.toContain('month=2026-07')
  })

  it('affiche le mois FORMATÉ dans le titre — jamais l’ISO brut « 2026-08 »', async () => {
    show()
    await openTerms()

    expect(await screen.findByText(/facturation — août 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/2026-08/)).not.toBeInTheDocument()
  })

  it('une mission démarrée CE MOIS-CI voit son propre mois, pas un mois où elle n’existait pas', async () => {
    // L'exemple mesuré : la mission a commencé le 06/08/2026, on est le
    // 30/08/2026. Le mois précédent (juillet) n'aurait jamais pu la montrer —
    // elle n'existait pas encore.
    apiFetchMock.mockImplementation((request: { path: string }) => {
      if (request.path.startsWith('/delivery/invoice-readiness')) {
        return Promise.resolve(
          readinessPage({
            month: '2026-08',
            items: [
              {
                missionId: MISSION_ID,
                missionLabel: 'Renfort plateforme',
                accountName: 'ACME',
                periodMonth: '2026-08-01',
                state: 'blocked',
                blockers: ['missing_timesheet'],
                days: null,
                preparedAmountCents: null,
                invoicedAt: null,
                invoiceReference: null,
                invoicedAmountCents: null,
                dueOn: null,
                remindersSent: 0,
                lastReminderAt: null,
                paidAt: null,
                paidAmountCents: null,
                disputedAt: null,
                disputeReason: null,
                disputeResolvedAt: null,
              },
            ],
          }),
        )
      }
      return Promise.resolve(timesheetsPage({ month: '2026-08' }))
    })
    show({ started_on: '2026-08-06' })
    await openTerms()

    // Honnête : un bloqueur nommé, pas « rien à surveiller sur ce mois ».
    expect(await screen.findByText('Bloqué')).toBeInTheDocument()
    expect(screen.queryByText('Rien à surveiller sur ce mois.')).not.toBeInTheDocument()
  })
})

describe('MissionDetailTabs — le moteur de marge (#2420)', () => {
  it('quand la réponse le porte, la fiche montre la marge AVEC son état et ses sources, une seule fois', async () => {
    const marginEngine = computeMissionMargin({
      channel: 'direct',
      costSource: null,
      currency: 'EUR',
      costCurrency: null,
      dailyRateCents: 72_000,
      loadedDailyCostCents: 60_000,
      partnerCommissionDailyCents: null,
      breakdown: {},
      fixedPriceRevenueCents: null,
      expensesTotalCents: 0,
      supplierInvoicesTotalCents: 0,
      elapsedDays: 30,
      period: '2026-09',
      validatedDays: 18,
      unvalidatedDays: 0,
      thresholdPercent: null,
      costRecordedRateCents: null,
    })
    terms.mockReturnValue({
      data: {
        canReadFinance: true,
        terms: FULL_TERMS,
        margin: { amountCents: 12_000, percent: 16.7 },
        marginEngine,
      },
      isError: false,
    })
    show()
    await openTerms()
    expect(screen.getByText('Mesurée')).toBeInTheDocument()
    expect(screen.getByTestId('margin-basis')).toHaveTextContent('18 jours validés')
    // Le bloc historique ne répète pas le même chiffre sous une autre forme.
    expect(screen.queryByText(/% de marge/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer la source du coût' })).toBeInTheDocument()
  })

  it('la source du coût s’enregistre avec les champs de remplacement recopiés', async () => {
    const mutate = vi.fn()
    setTerms.mockReturnValue({ mutate, isPending: false })
    withTerms()
    show()
    await openTerms()
    await userEvent.click(screen.getByRole('button', { name: 'forfait' }))
    await userEvent.type(screen.getByLabelText('Temps équipe valorisé (€)'), '16500')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la source du coût' }))
    const payload = mutate.mock.calls[0]?.[0]
    expect(payload.costSource).toBe('fixed_price')
    expect(payload.costBreakdown).toEqual({ fixedPriceTeamTimeCostCents: 1_650_000 })
    expect(payload.channel).toBe(FULL_TERMS.channel)
  })
})

/**
 * #2407.4 (suite) — CONSENTEMENT, DOCUMENTS, RISQUES sur l'onglet
 * « affectations » (`StaffingTab`), lus par la route existante
 * (`useMissionAssignments` → `GET /delivery/missions/:id/assignments`).
 *
 * ⚠️ Absents, ils s'affichent « non renseigné(s) » — jamais silencieux :
 * un champ tu ne se distingue pas d'un champ qui n'existe pas.
 */
describe('MissionDetailTabs — consentement, documents, risques de l’affectation (#2407.4 suite)', () => {
  async function openStaffing() {
    await userEvent.click(screen.getByRole('button', { name: /équipe & suite/i }))
  }

  it('affiche les trois champs déclaratifs quand ils sont saisis', async () => {
    assignments.mockReturnValue({
      data: [
        {
          id: 'as-1',
          missionId: '11111111-1111-4111-8111-111111111111',
          missionLabel: 'Renfort plateforme',
          accountName: 'ACME',
          consultantId: 'c1',
          consultantName: 'Marie Curie',
          loadPercent: 100,
          startsOn: '2026-09-01',
          endsOn: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          consentGiven: true,
          consentDate: '2026-09-01',
          documentsExpected: 'Casier judiciaire, habilitation sécurité',
          documentsReceived: 'Casier judiciaire',
          declaredRisks: 'Dépendance à un seul expert sur la bascule',
        },
      ],
      isError: false,
    })
    show()
    await openStaffing()

    expect(screen.getByText(/donné le/)).toBeInTheDocument()
    expect(screen.getByText('Casier judiciaire, habilitation sécurité')).toBeInTheDocument()
    expect(screen.getByText('Casier judiciaire')).toBeInTheDocument()
    expect(screen.getByText('Dépendance à un seul expert sur la bascule')).toBeInTheDocument()
  })

  it('absents, ils disent « non renseigné(s) » — jamais silencieux', async () => {
    assignments.mockReturnValue({
      data: [
        {
          id: 'as-1',
          missionId: '11111111-1111-4111-8111-111111111111',
          missionLabel: 'Renfort plateforme',
          accountName: 'ACME',
          consultantId: 'c1',
          consultantName: 'Marie Curie',
          loadPercent: 100,
          startsOn: '2026-09-01',
          endsOn: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          consentGiven: null,
          consentDate: null,
          documentsExpected: null,
          documentsReceived: null,
          declaredRisks: null,
        },
      ],
      isError: false,
    })
    show()
    await openStaffing()

    // `UnknownValue` porte la raison dans son `title` — le texte visible est
    // « non mesuré — <raison> », découpé en deux nœuds de texte.
    expect(screen.getByTitle('non renseigné')).toBeInTheDocument()
    expect(screen.getAllByTitle('non renseignés').length).toBe(2)
    expect(screen.getByTitle('non déclarés')).toBeInTheDocument()
  })
})

/** Théo missions-dossier — les retours de mission (client / consultant) vivent dans « Équipe & suite ». */
function showStaffing() {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Équipe & suite' }))
}

describe('MissionDetailTabs — le double pouls de satisfaction d’une mission (#2412)', () => {
  const rails = {
    client: [
      {
        id: 'fb-client-1',
        missionId: '11111111-1111-4111-8111-111111111111',
        rail: 'client' as const,
        note: 'Le client est ravi de la réactivité sur les incidents.',
        private: false,
        source: 'human' as const,
        recordedByUserId: 'u1',
        createdAt: '2026-09-10T09:00:00.000Z',
      },
    ],
    consultant: [
      {
        id: 'fb-consultant-1',
        missionId: '11111111-1111-4111-8111-111111111111',
        rail: 'consultant' as const,
        note: 'La charge d’astreinte pèse depuis deux semaines.',
        private: false,
        source: 'human' as const,
        recordedByUserId: 'u1',
        createdAt: '2026-09-13T09:00:00.000Z',
      },
    ],
  }

  it('#2412.1/.8 — affiche les deux rails séparés, même en divergence, jamais fusionnés', () => {
    missionFeedback.mockReturnValue({ data: rails, isLoading: false, isError: false })
    showStaffing()

    expect(screen.getByText('Le client est ravi de la réactivité sur les incidents.')).toBeInTheDocument()
    expect(screen.getByText('La charge d’astreinte pèse depuis deux semaines.')).toBeInTheDocument()
  })

  it('#2412.6 — la visibilité d’une entrée est un fait affiché, pas seulement l’absence du badge privé', () => {
    missionFeedback.mockReturnValue({ data: rails, isLoading: false, isError: false })
    showStaffing()

    // Les deux entrées du fixture sont `private: false` : chacune porte le
    // badge « visible de l'équipe », jamais un silence qu'il faudrait déduire
    // de l'absence du badge « privé ».
    expect(screen.getAllByText(/visible de l’équipe/i).length).toBe(2)
  })

  it('#2412.6/.10 — une entrée privée porte son badge, jamais le badge équipe', () => {
    missionFeedback.mockReturnValue({
      data: {
        client: [{ ...rails.client[0], private: true }],
        consultant: [],
      },
      isLoading: false,
      isError: false,
    })
    showStaffing()

    expect(screen.getByText(/privé/i)).toBeInTheDocument()
    expect(screen.queryByText(/visible de l’équipe/i)).not.toBeInTheDocument()
  })

  it('un rail sans avis dit « pas encore d’avis », jamais 0', () => {
    missionFeedback.mockReturnValue({ data: { client: [], consultant: [] }, isLoading: false, isError: false })
    showStaffing()

    expect(screen.getAllByText(/pas encore d’avis/i).length).toBe(2)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('dépose une entrée sur le rail choisi, jamais en source « human » déguisée', async () => {
    missionFeedback.mockReturnValue({ data: { client: [], consultant: [] }, isLoading: false, isError: false })
    const mutate = vi.fn()
    submitMissionFeedback.mockReturnValue({ mutate, isPending: false })
    showStaffing()

    await userEvent.click(screen.getByRole('button', { name: 'Consultant' }))
    await userEvent.type(screen.getByLabelText(/avis/i), 'Suivi à faire sur la charge.')
    await userEvent.click(screen.getByRole('button', { name: /déposer/i }))

    expect(mutate).toHaveBeenCalledWith(
      { rail: 'consultant', note: 'Suivi à faire sur la charge.', private: false },
      expect.anything(),
    )
  })

  it('#2408.16 — le niveau se déclare en option et part avec l’entrée ; il s’affiche ensuite', async () => {
    missionFeedback.mockReturnValue({
      data: { client: [{ ...rails.client[0], level: 'low' as const }], consultant: [] },
      isLoading: false,
      isError: false,
    })
    const mutate = vi.fn()
    submitMissionFeedback.mockReturnValue({ mutate, isPending: false })
    showStaffing()

    expect(screen.getByText(/satisfaction basse/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^basse$/i }))
    await userEvent.type(screen.getByLabelText(/avis/i), 'Le client s’impatiente.')
    await userEvent.click(screen.getByRole('button', { name: /déposer/i }))

    expect(mutate).toHaveBeenCalledWith(
      { rail: 'client', note: 'Le client s’impatiente.', private: false, level: 'low' },
      expect.anything(),
    )
  })

  it('H25 — sans records:write, le geste disparaît, pas les rails', () => {
    team.mockReturnValue({ team: { workspace: { role: 'finance' } } })
    missionFeedback.mockReturnValue({ data: rails, isLoading: false, isError: false })
    showStaffing()

    expect(screen.getByText('Le client est ravi de la réactivité sur les incidents.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /déposer/i })).not.toBeInTheDocument()
  })
})

describe('MissionDetailTabs — #3547 le forfait encadré se lit sur la fiche', () => {
  afterEach(cleanup)

  it('dit le mode, le rôle tenu et l’équipe côté client (noms + nombre déclaré)', () => {
    show({
      contract_kind: 'forfait',
      delivery_mode: 'supervised',
      supervision_role: 'supervision',
      client_team_size: 8,
      client_team_names: ['Marie Dupont', 'Paul Martin'],
    })
    expect(screen.getByText('Forfait encadré · Supervision')).toBeInTheDocument()
    expect(screen.getByText(/8 personnes/)).toBeInTheDocument()
    expect(screen.getByText(/Marie Dupont, Paul Martin/)).toBeInTheDocument()
  })

  it('une équipe non renseignée se DIT « non renseignée », jamais « 0 »', () => {
    show({ contract_kind: 'forfait', delivery_mode: 'supervised', supervision_role: null })
    expect(screen.getByText('Forfait encadré')).toBeInTheDocument()
    const line = screen.getByText('Équipe côté client').parentElement as HTMLElement
    expect(within(line).getByText('Non renseignée')).toBeInTheDocument()
    expect(screen.queryByText(/^0\b/)).not.toBeInTheDocument()
  })

  it('une mission staffée n’affiche aucune ligne de forfait encadré', () => {
    show({ contract_kind: 'regie' })
    expect(screen.queryByText(/Forfait encadré/)).not.toBeInTheDocument()
  })
})

/**
 * X66 / #3547 — CHANGER LE MODE d'une mission DÉJÀ créée, depuis sa fiche : la
 * ligne « Réalisation » porte le geste (pas un bloc de plus), et l'écriture part
 * sur `PATCH /delivery/missions/:id` avec les champs du forfait encadré.
 */
/** Les écritures `PATCH` de la fiche — les lectures du montage ne comptent pas. */
function patches(): { path: string; method: string; body: unknown }[] {
  return apiFetchMock.mock.calls
    .map(call => call[0] as { path: string; method?: string; body: unknown })
    .filter(request => request.method === 'PATCH') as { path: string; method: string; body: unknown }[]
}

describe('MissionDetailTabs — #3547 changer le mode d’une mission existante', () => {
  afterEach(cleanup)

  it('un forfait staffé offre le geste ; il écrit mode, rôle tenu et équipe côté client', async () => {
    apiFetchMock.mockResolvedValue({})
    show({ contract_kind: 'forfait', delivery_mode: 'staffed' })
    const u = userEvent.setup()

    expect(screen.getByText('Avec consultants')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Changer le mode de réalisation' }))
    await u.click(screen.getByRole('switch', { name: 'Forfait encadré, sans consultants' }))
    await u.click(screen.getByRole('combobox', { name: 'Rôle tenu' }))
    await u.click(screen.getByRole('option', { name: 'Cadrage et supervision' }))
    await u.type(screen.getByLabelText('Équipe côté client (noms, facultatif)'), 'Marie Dupont, Paul Martin')
    await u.click(screen.getByRole('button', { name: 'Enregistrer le mode' }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    const call = patches()[0]!
    expect(call.method).toBe('PATCH')
    expect(call.body).toEqual({
      deliveryMode: 'supervised',
      supervisionRole: 'both',
      clientTeamNames: ['Marie Dupont', 'Paul Martin'],
    })
  })

  it('une mission encadrée peut REPASSER en staffé : seul le mode part, le serveur efface le reste', async () => {
    apiFetchMock.mockResolvedValue({})
    show({ contract_kind: 'forfait', delivery_mode: 'supervised', supervision_role: 'framing' })
    const u = userEvent.setup()

    await u.click(screen.getByRole('button', { name: 'Changer le mode de réalisation' }))
    await u.click(screen.getByRole('switch', { name: 'Forfait encadré, sans consultants' }))
    await u.click(screen.getByRole('button', { name: 'Enregistrer le mode' }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]!.body).toEqual({ deliveryMode: 'staffed' })
  })

  it('hors forfait, aucun geste : le mode encadré n’y existe pas', () => {
    show({ contract_kind: 'regie' })
    expect(screen.queryByRole('button', { name: 'Changer le mode de réalisation' })).not.toBeInTheDocument()
    expect(screen.queryByText('Avec consultants')).not.toBeInTheDocument()
  })
})

// Point propre du lot MISSIONS-A (23/10) — « aucun score en points » : le risque et l'opportunité se lisent
// EN MOTS (élevé / moyen / faible), axe par axe ; un axe non évaluable reste NOMMÉ. Aucun « /100 ».
describe('MissionDetailTabs — Points d’attention en mots', () => {
  it('écrit le niveau et les axes en mots, jamais un nombre sur 100', async () => {
    scores.mockReturnValue({
      data: {
        risk: {
          score: 72,
          evaluated: [
            { axis: 'renewal', value: 90 },
            { axis: 'timesheets', value: 50 },
            { axis: 'margin', value: 10 },
          ],
          notEvaluable: ['payment'],
        },
        opportunity: null,
      },
      isLoading: false,
      isError: false,
    })
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Points d’attention' }))
    const risk = screen.getByRole('region', { name: 'Risque' })
    expect(within(risk).getByText('Élevé')).toBeInTheDocument()
    expect(within(risk).getByText('Renouvellement : élevé')).toBeInTheDocument()
    expect(within(risk).getByText('Relevés d’activité : moyen')).toBeInTheDocument()
    expect(within(risk).getByText('Marge : faible')).toBeInTheDocument()
    expect(within(risk).getByText(/Non évaluable : Paiement/)).toBeInTheDocument()
    expect(risk.textContent).not.toMatch(/\d/)
  })
})

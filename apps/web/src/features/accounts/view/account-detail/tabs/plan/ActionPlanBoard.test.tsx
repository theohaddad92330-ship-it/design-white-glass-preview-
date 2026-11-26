import type { ActionPlanItem } from '@bellum/contracts'
import { MANUAL_ACTION_WEEK_INDEX } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionPlanBoard } from './ActionPlanBoard'
import { planItem } from './planItem.fixture'

const addAction = vi.fn(() => Promise.resolve())
const create = vi.fn((input: { label: string; owner_name: string | null; reason: string }) =>
  Promise.resolve(planItem({ id: 'created', label: input.label, week_index: MANUAL_ACTION_WEEK_INDEX })),
)
const setDone = vi.fn()
let items: ActionPlanItem[] = []
const toastInfo = vi.fn()

vi.mock('sonner', () => ({
  toast: { info: (...args: unknown[]) => toastInfo(...args), success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction, addAngle: vi.fn(), isPending: false }),
}))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({
  useTrackAction: () => ({ mutate: vi.fn(), isPending: false }),
}))
// #2871 — la projection canonique du compte : non lue ici, la fiche garde son rendu.
vi.mock('@/features/action-os/hooks/useAccountCanonicalActions', () => ({
  useAccountCanonicalActions: () => ({ data: undefined }),
}))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({
    items,
    isLoading: false,
    itemFor: () => undefined,
    create,
    setDone,
    setDueDate: vi.fn(),
    setStatus: vi.fn(),
    snooze: vi.fn(),
    assign: vi.fn(),
  }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [] }),
}))
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({
  useCrmStatus: () => ({ data: { connected: false } }),
}))
vi.mock('@/features/actions/components/ActionExecuteMenu', () => ({ ActionExecuteMenu: () => null }))
vi.mock('@/features/google/components/AddToCalendarButton', () => ({ AddToCalendarButton: () => null }))
vi.mock('@/features/microsoft/components/OutlookScheduleButton', () => ({ OutlookScheduleButton: () => null }))
vi.mock('./PlayFeedbackButtons', () => ({ PlayFeedbackButtons: () => null }))

// #2130.60 / #2130.61 — le double du traceur produit ANONYME, distinct de
// `useTrackAction` (mocké ci-dessus) : celui-ci porte un `account_id`, celui-là
// ne porte jamais que le geste et l'écran.
const tracker = vi.hoisted(() => ({ trackActionStarted: vi.fn(), trackActionCompleted: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

beforeEach(() => {
  items = []
  addAction.mockClear()
  create.mockClear()
  setDone.mockClear()
  tracker.trackActionStarted.mockClear()
  tracker.trackActionCompleted.mockClear()
})

/**
 * « Ajouter une action » ENREGISTRE l'action — et l'enregistre à UN seul endroit.
 *
 * Trouvé en recette live le 27/08 : l'action apparaissait à l'écran avec son
 * badge « manuel », et disparaissait à un simple rechargement. Le fil vers
 * `usePersistAccountPlan` a été posé, et il écrivait dans
 * `raw_analysis.user_plan_actions` — un blob que l'écran Actions ne lit pas.
 *
 * #2123.46 / #2123.47 — l'objet CANONIQUE est la ligne `action_plan_items`
 * (porte `POST /plan-items`) : celle que ce tableau affiche ET que `/actions`
 * liste. Ces tests exigent que le formulaire passe par elle, et par elle SEULE :
 * une seconde écriture dans le blob recréerait la copie qu'on retire.
 */
describe('ActionPlanBoard — l’action ajoutée à la main', () => {
  const ouvrirEtSaisir = async (texte: string) => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /ajouter une action/i }))
    await user.type(screen.getByPlaceholderText(/relancer marc/i), texte)
    // #2871 (#2395.8) — l'objectif est obligatoire à la création.
    await user.type(screen.getByPlaceholderText(/objectif \(obligatoire\)/i), 'Obtenir un rendez-vous')
    // #2395.8 — le résultat attendu est lui aussi obligatoire à la création.
    await user.type(screen.getByPlaceholderText(/résultat attendu \(obligatoire\)/i), 'Un rendez-vous fixé')
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }))
    return user
  }

  it('#2123.46 — part par la porte canonique POST /plan-items, jamais dans le blob de l’analyse', async () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await ouvrirEtSaisir('Relancer le DSI après le comité')

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      label: 'Relancer le DSI après le comité',
      owner_name: null,
      reason: 'Obtenir un rendez-vous',
      expected_outcome: 'Un rendez-vous fixé',
    })
    // #2123.47 — la seconde écriture est ce qui fabriquait la copie.
    expect(addAction).not.toHaveBeenCalled()
  })

  // #2871 (#2395.8) — sans objectif, le formulaire n'écrit RIEN.
  it('#2871 — sans objectif, « Ajouter » reste inactif et aucune action n’est créée', async () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /ajouter une action/i }))
    await user.type(screen.getByPlaceholderText(/relancer marc/i), 'Relancer le DSI')

    expect(screen.getByRole('button', { name: /^ajouter$/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }))
    expect(create).not.toHaveBeenCalled()
  })

  it('s’affiche pendant que la requête est en vol', async () => {
    // Une promesse qui ne se résout pas = le serveur n'a pas encore répondu.
    // C'est l'état où l'utilisateur regarde son écran, et il doit y voir ce
    // qu'il vient de taper.
    create.mockImplementationOnce(() => new Promise<ActionPlanItem>(() => undefined))
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await ouvrirEtSaisir('Préparer la soutenance')

    expect(screen.getByText('Préparer la soutenance')).toBeInTheDocument()
  })

  it('n’apparaît pas deux fois une fois que le serveur la renvoie', async () => {
    // Le piège de l'affichage optimiste : la copie locale ET la ligne
    // enregistrée coexistent, et l'action se dédouble sous les yeux de
    // l'utilisateur juste après l'avoir ajoutée.
    const { rerender } = render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await ouvrirEtSaisir('Relancer le DSI après le comité')
    items = [
      planItem({ id: 'created', label: 'Relancer le DSI après le comité', week_index: MANUAL_ACTION_WEEK_INDEX }),
    ]
    rerender(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(await screen.findAllByText('Relancer le DSI après le comité')).toHaveLength(1)
  })

  it('#2123.46 — une ligne manuelle enregistrée s’affiche, et se coche sur la LIGNE (même objet que /actions)', async () => {
    items = [
      planItem({ id: 'm1', label: 'Écrire au RSSI', week_index: MANUAL_ACTION_WEEK_INDEX, owner_name: 'Claire' }),
      // Une ligne du plan GÉNÉRÉ n'appartient pas à la section « ajoutées ».
      planItem({ id: 'g1', label: 'Ligne générée', week_index: 0 }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText('Écrire au RSSI')).toBeInTheDocument()
    expect(screen.queryByText('Ligne générée')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox'))
    expect(setDone).toHaveBeenCalledWith('m1', true)
  })

  // #2123.46 — la veille et le panneau besoin écrivent un résultat attendu et
  // un indicateur : la carte les montrait depuis le blob, elle les montre
  // depuis la LIGNE, sinon la bascule les aurait perdus à l'écran.
  it('#2123.46 — une ligne manuelle montre son résultat attendu et son indicateur', () => {
    items = [
      planItem({
        id: 'm2',
        label: 'Qualifier le signal : levée de fonds',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        expected_outcome: 'Obtenir un rendez-vous avec la DSI',
        kpi: 'RDV posé',
      }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText('Obtenir un rendez-vous avec la DSI')).toBeInTheDocument()
    expect(screen.getByText('RDV posé')).toBeInTheDocument()
  })

  // #2715.1 (corrigé 23/09) — le plan montre le statut d'envoi LU sur la
  // ligne persistée (`send_status`), sur l'action correspondante seulement —
  // et DISTINGUE l'e-mail vérifié du geste déclaratif (jamais un seul badge).
  it('#2715.1 — une ligne avec un e-mail vérifié montre « E-mail envoyé », une autre avec un geste déclaratif montre « Marqué fait »', () => {
    items = [
      planItem({
        id: 'm4',
        label: 'Relancer par e-mail',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        send_status: 'email_sent',
      }),
      planItem({
        id: 'm5',
        label: 'Relancer sur LinkedIn',
        week_index: MANUAL_ACTION_WEEK_INDEX + 1,
        send_status: 'declared',
      }),
      planItem({ id: 'm6', label: 'Appeler plus tard', week_index: MANUAL_ACTION_WEEK_INDEX + 2, send_status: null }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText('E-mail envoyé')).toBeInTheDocument()
    expect(screen.getByText('Marqué fait')).toBeInTheDocument()
    // Une seule ligne chacun — les badges ne se rendent pas partout.
    expect(screen.getAllByText('E-mail envoyé')).toHaveLength(1)
    expect(screen.getAllByText('Marqué fait')).toHaveLength(1)
  })

  it('#2123.47 — l’historique du blob reste LU (lecture de repli), sans être réécrit', () => {
    render(
      <ActionPlanBoard
        accountId="a1"
        weeks={[]}
        persistedActions={[{ text: 'Action saisie en août', outil: 'manuel' }]}
      />,
    )

    expect(screen.getByText('Action saisie en août')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    expect(addAction).not.toHaveBeenCalled()
  })
})

/**
 * #1931.19 — COCHER N'EST PAS CONTACTER.
 *
 * « Une tâche simplement cochée doit dire : "Cette tâche a été marquée comme
 * terminée. BellumAI n'a contacté personne." » (#1931, issue). Une case cochée
 * ne prouve aucun geste réel vers le contact — sans ce message, elle se lit
 * comme une preuve d'appel ou d'envoi.
 */
describe('ActionPlanBoard — cocher une tâche à la main', () => {
  it('dit que personne n’a été contacté quand une action générée est cochée', async () => {
    toastInfo.mockClear()
    const user = userEvent.setup()
    render(
      <ActionPlanBoard
        accountId="a1"
        weeks={[{ week: 1, title: 'Semaine 1', items: [{ text: 'Appeler Jean après le comité' }] }]}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /marquer l.action comme faite/i }))

    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo.mock.calls[0][0]).toMatch(/n.a contacté personne/)
  })

  it('dit la même chose quand une action ajoutée à la main est cochée', async () => {
    toastInfo.mockClear()
    const user = userEvent.setup()
    render(
      <ActionPlanBoard
        accountId="a1"
        weeks={[]}
        persistedActions={[{ text: 'Relancer le DSI après le comité', outil: 'manuel' }]}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /marquer l.action comme faite/i }))

    expect(toastInfo).toHaveBeenCalledTimes(1)
  })

  it('ne dit rien quand on DÉCOCHE une action — seul le fait de cocher parle', async () => {
    toastInfo.mockClear()
    const user = userEvent.setup()
    render(
      <ActionPlanBoard
        accountId="a1"
        weeks={[]}
        persistedActions={[{ text: 'Relancer le DSI après le comité', outil: 'manuel' }]}
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: /marquer l.action comme faite/i })
    await user.click(checkbox)
    toastInfo.mockClear()
    // Le même contrôle bascule vers « à faire » une fois coché — le décocher
    // ne prétend rien de plus qu'annuler une case, donc aucun message.
    await user.click(screen.getByRole('checkbox', { name: /marquer l.action comme à faire/i }))

    expect(toastInfo).not.toHaveBeenCalled()
  })

  // #2123.46 a introduit un second chemin de persistance (ligne `action_plan_items`
  // structurée, `plan.setDone`) SANS reprendre le message #1931.19 — deux fusions
  // jamais réconciliées avant #2005.5. Même case, même garantie.
  it('dit la même chose quand une ligne manuelle PERSISTÉE (structurée) est cochée', async () => {
    toastInfo.mockClear()
    items = [planItem({ id: 'm3', label: 'Écrire au RSSI', week_index: MANUAL_ACTION_WEEK_INDEX })]
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await user.click(screen.getByRole('checkbox'))

    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo.mock.calls[0][0]).toMatch(/n.a contacté personne/)
  })

  // #2317.9 — une action conditionnelle n'est pas exécutable tant que sa
  // dépendance n'est pas faite : la case se gèle, la ligne reste visible.
  it('gèle la case d’une action conditionnelle tant que sa dépendance n’est pas faite', async () => {
    toastInfo.mockClear()
    items = [
      planItem({ id: 'dep1', label: 'Qualifier le besoin', week_index: MANUAL_ACTION_WEEK_INDEX }),
      planItem({
        id: 'm4',
        label: 'Envoyer la proposition',
        week_index: MANUAL_ACTION_WEEK_INDEX + 1,
        depends_on_item_id: 'dep1',
      }),
    ]
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    const checkboxes = screen.getAllByRole('checkbox')
    const blocked = checkboxes[checkboxes.length - 1]
    expect(blocked).toBeDisabled()
    await user.click(blocked)

    expect(setDone).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('ne gèle plus la case une fois la dépendance faite', () => {
    items = [
      planItem({
        id: 'dep1',
        label: 'Qualifier le besoin',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        execution_status: 'done',
        done: true,
      }),
      planItem({
        id: 'm4',
        label: 'Envoyer la proposition',
        week_index: MANUAL_ACTION_WEEK_INDEX + 1,
        depends_on_item_id: 'dep1',
      }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[checkboxes.length - 1]).not.toBeDisabled()
  })
})

/**
 * L'état vide DIT pourquoi il est vide.
 *
 * Le tableau n'avait qu'une copie — « Aucune action dans le plan · Crée une
 * première action concrète » — servie quelle que soit la cause. Sur un dossier
 * dont la phase 4 vient de dépasser son budget de 260 s (huit fois en trente
 * jours, mesuré sur `bellum-ia-service`), elle demande à l'utilisateur d'écrire
 * ce que le moteur n'a pas su produire, pendant que le bandeau du dossier, lui,
 * annonce un échec. Deux phrases contradictoires sur le même fait.
 *
 * Ces tests portent sur la COPIE RENDUE et non sur `planAbsence` (couvert à
 * part) : c'est le fil entre les deux qui manquait, et c'est un fil qu'une
 * garde structurelle ne voit pas.
 */
describe('ActionPlanBoard — pourquoi le plan est vide', () => {
  const phraseAccusatrice = /Crée une première action concrète/i

  it("n'accuse pas l'utilisateur quand la dernière analyse ne s'est pas terminée", () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} absence="analysis-incomplete" />)

    expect(screen.getByText(/La dernière analyse ne s.est pas terminée/i)).toBeInTheDocument()
    expect(screen.queryByText(phraseAccusatrice)).not.toBeInTheDocument()
  })

  it("annonce que le plan arrive pendant que l'analyse tourne", () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} absence="analysis-running" />)

    expect(screen.getByText(/L.analyse est en cours/i)).toBeInTheDocument()
    expect(screen.queryByText(phraseAccusatrice)).not.toBeInTheDocument()
  })

  it("invite à lancer une analyse sur un dossier qui n'en a jamais eu", () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} absence="not-analyzed" />)

    expect(screen.getByText(/n.a pas encore été analysé/i)).toBeInTheDocument()
  })

  it("garde la copie d'origine quand l'analyse a abouti et que le plan est réellement vide", () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} absence="no-actions" />)

    expect(screen.getByText(phraseAccusatrice)).toBeInTheDocument()
  })

  it("sert la copie d'origine quand l'appelant ne dit rien — aucune régression", () => {
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText(phraseAccusatrice)).toBeInTheDocument()
  })
})

/**
 * #2130.60 / #2130.61 — CRÉER ET VALIDER UNE ACTION DE PLAN ÉMETTENT, EN PLUS
 * DE `useTrackAction` (le traceur MÉTIER, avec `account_id`).
 *
 * `trackPreparedActionStage` existe déjà mais couvre un cycle DIFFÉRENT — les
 * actions PRÉPARÉES par Laura (`CopilotCards.tsx`) — donc ces deux gestes
 * réutilisent `trackActionStarted`, déjà câblé ailleurs (`TabPartners.tsx`)
 * pour un geste sans notion de complétion asynchrone à suivre.
 */
/**
 * #2107.32 — UN LIEN EXTERNE AMÈNE SA LIGNE, PAS SEULEMENT L'ONGLET.
 *
 * `signal_history.action_id` existe depuis #2695.1 ; rien côté web ne menait
 * jusqu'à LA ligne créée — vingt lignes indiscernables. `highlightActionId`
 * (posé depuis `?item=action:<id>`, `useSignalAction.ts`) l'amène à l'écran et
 * lui donne le focus, par la même primitive que le cockpit (`revealTarget`).
 */
describe('ActionPlanBoard — amener une ligne précise (#2107.32)', () => {
  it('amène et focalise la ligne visée, une fois qu’elle est dans le plan', async () => {
    items = [planItem({ id: 'm9', label: 'Traiter le signal : levée de fonds', week_index: MANUAL_ACTION_WEEK_INDEX })]
    render(<ActionPlanBoard accountId="a1" weeks={[]} highlightActionId="m9" />)

    const row = await screen.findByText('Traiter le signal : levée de fonds')
    const anchor = row.closest('[id^="dossier-action-"]')
    expect(anchor).toHaveAttribute('id', 'dossier-action-m9')
    await vi.waitFor(() => expect(document.activeElement).toBe(anchor))
  })

  it('ne pose aucune destination sur les autres lignes', () => {
    items = [
      planItem({ id: 'm9', label: 'Traiter le signal : levée de fonds', week_index: MANUAL_ACTION_WEEK_INDEX }),
      planItem({ id: 'm10', label: 'Écrire au RSSI', week_index: MANUAL_ACTION_WEEK_INDEX + 1 }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={[]} highlightActionId="m9" />)

    expect(screen.getByText('Écrire au RSSI').closest('[id^="dossier-action-"]')).toBeNull()
  })

  it('ne fait rien sans `highlightActionId` — aucune régression', () => {
    items = [planItem({ id: 'm9', label: 'Traiter le signal : levée de fonds', week_index: MANUAL_ACTION_WEEK_INDEX })]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText('Traiter le signal : levée de fonds').closest('[id^="dossier-action-"]')).toBeNull()
  })
})

/**
 * #2317.6 / #2317.7 — une petite équipe ne reçoit pas quinze actions.
 *
 * `nextActions()` (verify-first, plafonné à `NEXT_ACTIONS_MAX`) existait dans
 * `@bellum/contracts`, testé, et sans appelant — la section « Ajoutées » de ce
 * tableau rendait les lignes manuelles sans aucune troncature. Voir l'APPELANT
 * MANQUANT, pas seulement la fonction (CLAUDE.md).
 */
describe('ActionPlanBoard — plafond des actions ajoutées (#2317.6, #2317.7)', () => {
  const manualItem = (id: string, overrides: Partial<ActionPlanItem> = {}) =>
    planItem({ id, label: `Action ${id}`, week_index: MANUAL_ACTION_WEEK_INDEX, ...overrides })

  it('n’affiche que les 3 premières quand plus de 3 lignes sont saisies à la main', () => {
    items = [manualItem('m1'), manualItem('m2'), manualItem('m3'), manualItem('m4'), manualItem('m5')]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText('Action m1')).toBeInTheDocument()
    expect(screen.getByText('Action m2')).toBeInTheDocument()
    expect(screen.getByText('Action m3')).toBeInTheDocument()
    expect(screen.queryByText('Action m4')).not.toBeInTheDocument()
    expect(screen.queryByText('Action m5')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /afficher les 5 actions/i })).toBeInTheDocument()
  })

  it('priorise ce qu’il faut VÉRIFIER (cible manquante) avant le reste, même arrivé plus tard', () => {
    // kind « meeting » (page propriétaire « agenda ») n'a pas de route dans
    // l'application (`ROUTE_BY_OWNER_PAGE`) : la puce reste un texte simple,
    // sans <Link> — évite d'exiger un contexte de routeur dans ce test.
    const readyTarget = { kind: 'meeting' as const, id: 'p1', label: 'Comité de pilotage' }
    items = [
      manualItem('m1', { target: readyTarget }),
      manualItem('m2', { target: readyTarget }),
      manualItem('m3', { target: readyTarget }),
      // target: null (défaut du fixture) — celle-ci manque de données, elle passe devant.
      manualItem('m4'),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.getByText('Action m4')).toBeInTheDocument()
    expect(screen.queryByText('Action m3')).not.toBeInTheDocument()
  })

  it('révèle les lignes cachées au clic, puis peut réduire à nouveau', async () => {
    items = [manualItem('m1'), manualItem('m2'), manualItem('m3'), manualItem('m4')]
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await user.click(screen.getByRole('button', { name: /afficher les 4 actions/i }))
    expect(screen.getByText('Action m4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /réduire à 3 actions/i }))
    expect(screen.queryByText('Action m4')).not.toBeInTheDocument()
  })

  it('n’affiche aucun bouton quand 3 lignes ou moins sont saisies à la main', () => {
    items = [manualItem('m1'), manualItem('m2'), manualItem('m3')]
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    expect(screen.queryByRole('button', { name: /afficher les .* actions/i })).not.toBeInTheDocument()
  })
})

describe('ActionPlanBoard — télémétrie (#2130.60, #2130.61)', () => {
  it('#2130.60 — ajouter une action à la main émet plan_action_created, agrégé par écran', async () => {
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await user.click(screen.getByRole('button', { name: /ajouter une action/i }))
    await user.type(screen.getByPlaceholderText(/relancer marc/i), 'Relancer Marc')
    await user.type(screen.getByPlaceholderText(/objectif \(obligatoire\)/i), 'Obtenir un rendez-vous')
    // #2395.8 — le résultat attendu est lui aussi obligatoire à la création.
    await user.type(screen.getByPlaceholderText(/résultat attendu \(obligatoire\)/i), 'Un rendez-vous fixé')
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('plan_action_created', '/accounts/$id')
  })

  it('#2130.61 — cocher une action émet plan_action_validated', async () => {
    items = [planItem({ id: 'm7', label: 'Écrire au RSSI', week_index: MANUAL_ACTION_WEEK_INDEX })]
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await user.click(screen.getByRole('checkbox'))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('plan_action_validated', '/accounts/$id')
  })

  it('#2130.61 — DÉCOCHER n’émet rien — seule la validation parle', async () => {
    items = [planItem({ id: 'm8', label: 'Écrire au RSSI', week_index: MANUAL_ACTION_WEEK_INDEX, done: true })]
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={[]} />)

    await user.click(screen.getByRole('checkbox'))

    expect(tracker.trackActionStarted).not.toHaveBeenCalledWith('plan_action_validated', expect.anything())
  })
})

/**
 * #1888 — « je veux que les phases soient repliées par défaut, genre la
 * première quand on l'a pas commencée est ouverte, puis c'est la 2 etc ».
 *
 * Le comportement de repli lui-même est couvert par `CollapsedSection.test.tsx`
 * (GA-26 — un seul endroit), et le choix de la phase ouverte par
 * `planPhases.test.ts` (l'état, jamais un rang). Ce fichier prouve le FIL entre
 * les deux : que le tableau branche bien l'un sur l'autre, qu'il ne se prononce
 * pas tant que l'état n'est pas connu, et — c'est la garde la plus importante —
 * qu'une phase repliée ne rend RIEN de faux à l'écran.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanWeek } from '../../helpers/plan'
import { ActionPlanBoard } from './ActionPlanBoard'
import { planItem } from './planItem.fixture'

const planItems = { itemFor: vi.fn(), items: [], isLoading: false, setDone: vi.fn(), setDueDate: vi.fn() }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn(() => Promise.resolve()), addAngle: vi.fn(), isPending: false }),
}))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({
  useTrackAction: () => ({ mutate: vi.fn(), isPending: false }),
}))
// #2871 — la projection canonique du compte : non lue ici, la fiche garde son rendu.
vi.mock('@/features/action-os/hooks/useAccountCanonicalActions', () => ({
  useAccountCanonicalActions: () => ({ data: undefined }),
}))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: () => planItems }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({ useCrmStatus: () => ({ data: { connected: false } }) }))
vi.mock('@/features/actions/components/ActionExecuteMenu', () => ({ ActionExecuteMenu: () => null }))
vi.mock('@/features/google/components/AddToCalendarButton', () => ({ AddToCalendarButton: () => null }))
vi.mock('@/features/microsoft/components/OutlookScheduleButton', () => ({ OutlookScheduleButton: () => null }))
vi.mock('./PlayFeedbackButtons', () => ({ PlayFeedbackButtons: () => null }))

const WEEKS: PlanWeek[] = [
  {
    week: 1,
    title: 'Prendre contact',
    objective: 'Ouvrir une porte chez la DSI',
    items: [{ text: 'Appeler le DSI' }, { text: 'Écrire au RSSI' }],
  },
  { week: 2, title: 'Qualifier le besoin', items: [{ text: 'Cadrer le périmètre' }] },
  { week: 3, title: 'Proposer', items: [{ text: 'Envoyer la proposition' }] },
]

/** L'état RÉEL rendu par le serveur : les positions listées sont faites. */
function serverSays(done: ReadonlyArray<readonly [number, number]>) {
  planItems.itemFor.mockImplementation((weekIndex: number, stepIndex: number) =>
    planItem({
      id: `${weekIndex}-${stepIndex}`,
      week_index: weekIndex,
      step_index: stepIndex,
      done: done.some(([w, s]) => w === weekIndex && s === stepIndex),
    }),
  )
}

beforeEach(() => {
  planItems.itemFor.mockReset()
  planItems.isLoading = false
  serverSays([])
})

const phase = (n: number, titre: string) => `Phase ${n} · ${titre}`

describe('ActionPlanBoard — les phases sont repliées, sauf celle qui appelle une action (#1888)', () => {
  it('rien de commencé : la phase 1 est ouverte, les autres repliées', () => {
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.getByRole('button', { name: phase(1, 'Prendre contact') })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: phase(2, 'Qualifier le besoin') })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('button', { name: phase(3, 'Proposer') })).toHaveAttribute('aria-expanded', 'false')

    // Replié = ABSENT du DOM (rendu conditionnel), jamais un `hidden` qu'une
    // classe `display` rouvrirait.
    expect(screen.getByText('Appeler le DSI')).toBeInTheDocument()
    expect(screen.queryByText('Cadrer le périmètre')).not.toBeInTheDocument()
    expect(screen.queryByText('Envoyer la proposition')).not.toBeInTheDocument()
  })

  it('la phase 1 terminée : c’est la 2 qui s’ouvre — le repli suit l’avancement', () => {
    serverSays([
      [0, 0],
      [0, 1],
    ])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.getByRole('button', { name: phase(1, 'Prendre contact') })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: phase(2, 'Qualifier le besoin') })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Cadrer le périmètre')).toBeInTheDocument()
  })

  it('sait dire NON : une phase 1 seulement ENTAMÉE reste ouverte, la 2 reste repliée', () => {
    // Le défaut qu'une lecture positionnelle produirait — « une case cochée,
    // donc on passe à la suivante ». Une phase inachevée appelle encore une
    // action : elle ne se referme pas sous les doigts de l'utilisateur.
    serverSays([[0, 0]])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.getByRole('button', { name: phase(1, 'Prendre contact') })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: phase(2, 'Qualifier le besoin') })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('tant que l’état n’est pas connu, aucune phase ne s’ouvre — un zéro de chargement n’est pas un vrai zéro', () => {
    // `usePlanItems` en vol rend `done: false` partout. S'en servir ouvrirait
    // la phase 1 sur un plan dont les deux premières sont finies, puis la
    // refermerait à l'arrivée des données : un mouvement qui ne dit rien.
    planItems.isLoading = true
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    for (const name of [phase(1, 'Prendre contact'), phase(2, 'Qualifier le besoin'), phase(3, 'Proposer')]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('le choix de l’utilisateur gagne sur l’automatisme, phase par phase', async () => {
    const user = userEvent.setup()
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    await user.click(screen.getByRole('button', { name: phase(3, 'Proposer') }))
    expect(screen.getByText('Envoyer la proposition')).toBeInTheDocument()
    // Ouvrir la 3 ne referme pas la 1 : chaque phase porte son propre état.
    expect(screen.getByRole('button', { name: phase(1, 'Prendre contact') })).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: phase(1, 'Prendre contact') }))
    expect(screen.queryByText('Appeler le DSI')).not.toBeInTheDocument()
  })
})

/**
 * ⚠️ LA GARDE QUI COMPTE : un repli ne doit jamais faire disparaître ce qui
 * QUALIFIE un chiffre. Une phase fermée laisse son numéro, son intitulé, son
 * objectif et son NOMBRE D'ACTIONS à l'écran — et le compteur d'ensemble du
 * tableau (« 1/4 ») ne bouge pas d'un repli, parce qu'il ne compte pas ce qui
 * est affiché, il compte ce qui existe.
 */
describe('ActionPlanBoard — replier ne rend rien faux', () => {
  it('une phase repliée garde son objectif et son nombre d’actions sous les yeux', () => {
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    // La phase 1 est ouverte ; les deux autres sont repliées et disent quand même
    // combien d'actions elles portent.
    expect(screen.getByText('Ouvrir une porte chez la DSI')).toBeInTheDocument()
    expect(screen.getAllByText('1 action')).toHaveLength(2)
    expect(screen.getByText('2 actions')).toBeInTheDocument()
  })

  it('le compteur d’ensemble compte TOUTES les actions, pas seulement celles dépliées', () => {
    serverSays([[0, 0]])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    // 4 actions au total dans les trois phases, 1 faite — alors qu'une seule
    // phase est dépliée. Un compteur qui n'aurait compté que le visible dirait
    // « 1/2 », et le pourcentage de progression serait faux.
    expect(screen.getByText('1/4')).toBeInTheDocument()
    expect(screen.getByText('4 actions à suivre pour engager ce compte.')).toBeInTheDocument()
  })

  // #3670 (R2 07/10) — la recette prod lisait « 0 actions » et « 0/0 » sur un compte sans plan.
  it('SAIT DIRE NON — un plan sans action n’écrit ni « 0 actions » ni « 0/0 »', () => {
    serverSays([])
    render(<ActionPlanBoard accountId="a1" weeks={[]} absence="not-analyzed" />)
    expect(screen.queryByText(/0 action/)).not.toBeInTheDocument()
    expect(screen.queryByText('0/0')).not.toBeInTheDocument()
    expect(screen.getByText("Ce dossier n'a pas encore été analysé")).toBeInTheDocument()
  })
})

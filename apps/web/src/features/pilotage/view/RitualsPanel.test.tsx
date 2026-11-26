import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RITUAL_CATALOG, type RitualPreference } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #2405.9 — un rituel préparé montre QUI le porte (un rôle, jamais une
 * personne) et couvre désormais prévisionnel + adoption, pas seulement
 * pipe/staffing. Le catalogue lui-même est gardé par
 * `packages/contracts/src/schemas/ritual.test.ts` ; ce fichier vérifie que
 * l'ÉCRAN affiche ce que le catalogue porte.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

const useQuery = vi.fn()
// #3298 — `markHeld` invalide via `useQueryClient`, absent avant ce lot.
const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQuery(options),
  useQueryClient: () => ({ invalidateQueries }),
}))

const rituals = vi.fn()
const hygiene = vi.fn()
const setRitualPreference = vi.fn().mockResolvedValue({ ritualKey: 'weekly', disabled: true })
const markRitualHeld = vi
  .fn()
  .mockResolvedValue({ ritualKey: 'weekly', heldAt: '2026-09-29T10:00:00.000Z', heldBy: 'u-1' })
vi.mock('../api', () => ({
  pilotageApi: {
    rituals: () => rituals(),
    hygiene: () => hygiene(),
    setRitualPreference: (...a: unknown[]) => setRitualPreference(...a),
    markRitualHeld: (...a: unknown[]) => markRitualHeld(...a),
  },
}))

// `owner` : team:manage — même rôle réel que `pilotage-role-gate.integration.test.tsx`.
const membersData = vi.fn(() => [{ userId: 'u-1', role: 'owner', isSelf: true }])
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: membersData() }) }))

// #3271.8 reste (épopée #3298) — le composeur de tâches EXISTANT, substitué
// par un stub qui expose son `onSubmit` : on prouve ce que l'écran des rituels
// lui passe (le rituel d'origine), pas le composeur lui-même (son propre test).
const createTask = vi.fn()
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useCreateTask: () => ({ mutate: createTask, isPending: false }) }))
vi.mock('@/features/tasks/view/TaskComposer', () => ({
  TaskComposer: ({ open, onSubmit }: { open: boolean; onSubmit: (draft: Record<string, string>) => void }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSubmit({ title: 'Relancer', dueOn: '2026-10-01', objective: 'Débloquer', expectedResult: 'Débloqué' })
        }
      >
        composeur-envoyer
      </button>
    ) : null,
}))

import { RitualsPanel } from './RitualsPanel'

function mockRitualsQuery(
  preferences: RitualPreference[] = [],
  extra: { effectiveness?: unknown[]; lastHeld?: unknown[]; actionsCreated?: unknown[] } = {},
) {
  useQuery.mockImplementation((options: { queryKey: string[] }) => {
    if (options.queryKey[0] === 'pilotage-rituals') {
      return {
        data: {
          items: RITUAL_CATALOG,
          preferences,
          effectiveness: extra.effectiveness ?? [],
          lastHeld: extra.lastHeld ?? [],
          actionsCreated: extra.actionsCreated ?? [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }
    }
    return { data: { lines: [] }, isLoading: false, isError: false }
  })
}

describe('RitualsPanel — #2405.9 owners et couverture prévisionnel/adoption', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mockRitualsQuery()
  })

  it('un point ouvert affiche le rôle qui le porte, jamais un nom', () => {
    render(<RitualsPanel />)
    const weekly = RITUAL_CATALOG.find(r => r.key === 'weekly')
    fireEvent.click(screen.getByText(weekly!.label.fr))

    expect(screen.getByText('Porté par sales ops')).toBeInTheDocument()
    expect(screen.getAllByText('Porté par le manager').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Alice|Martin/)).not.toBeInTheDocument()
  })

  it('#3294 (#3253.d) — la revue hebdomadaire ouvre sur le maillon faible ; le point quotidien non', () => {
    render(<RitualsPanel />)
    const weekly = RITUAL_CATALOG.find(r => r.key === 'weekly')
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')
    fireEvent.click(screen.getByText(daily!.label.fr))
    expect(screen.queryByTestId('weakest-link-summary')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(weekly!.label.fr))
    // Louis 14/10/2026 : le maillon faible vit SEULEMENT dans le Cockpit.
    expect(screen.queryByTestId('weakest-link-summary')).not.toBeInTheDocument()
  })

  it('la revue hebdomadaire porte désormais un point Prévisionnel et adoption', () => {
    render(<RitualsPanel />)
    const weekly = RITUAL_CATALOG.find(r => r.key === 'weekly')
    fireEvent.click(screen.getByText(weekly!.label.fr))

    expect(screen.getByText(/Prévisionnel et adoption/)).toBeInTheDocument()
  })
})

/**
 * BEL-SC-242 (#3271.8) — un rituel ouvert dit QUI doit être là et QUEL GENRE
 * de décision il doit produire — les deux attributs que la spec nomme et que
 * le catalogue ne portait pas encore.
 */
describe('RitualsPanel — #3271.8 participants et décision attendue', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mockRitualsQuery()
  })

  it('un rituel ouvert nomme ses participants (des RÔLES) et sa décision attendue', () => {
    render(<RitualsPanel />)
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')!
    fireEvent.click(screen.getByText(daily.label.fr))

    expect(screen.getByText('Participants')).toBeInTheDocument()
    expect(screen.getByText('Équipe · Manager')).toBeInTheDocument()
    expect(screen.getByText('Décision attendue')).toBeInTheDocument()
    expect(screen.getByText(daily.expectedDecisions.fr)).toBeInTheDocument()
  })
})

/**
 * BEL-SC-242 (#3271.10, .12) — « laisser le workspace personnaliser », en
 * masquant un rituel, jamais en supprimant sa définition (« on archive, on
 * ne supprime pas ») — et seulement pour qui porte `team:manage`.
 */
describe('RitualsPanel — #3271.10, .12 masquer / réafficher un rituel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    setRitualPreference.mockClear()
  })

  it('un rôle team:manage voit « Masquer », et le geste appelle la préférence — jamais une suppression', async () => {
    mockRitualsQuery()
    render(<RitualsPanel />)

    const buttons = screen.getAllByRole('button', { name: 'Masquer' })
    fireEvent.click(buttons[0]!)

    await waitFor(() => expect(setRitualPreference).toHaveBeenCalled())
    expect(setRitualPreference.mock.calls[0]![1]).toEqual({ disabled: true })
  })

  it('un rituel masqué reste NOMMÉ dans une section à part, avec un « Réafficher »', () => {
    mockRitualsQuery([{ ritualKey: 'weekly', disabled: true }])
    render(<RitualsPanel />)

    const weekly = RITUAL_CATALOG.find(r => r.key === 'weekly')!
    expect(screen.getByText('Rituels masqués (1)')).toBeInTheDocument()
    expect(screen.getByText(weekly.label.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réafficher' })).toBeInTheDocument()
    // Le rituel masqué ne fait plus partie de la liste ACTIVE (pas de bouton « Masquer » pour lui).
    expect(screen.getAllByRole('button', { name: 'Masquer' })).toHaveLength(RITUAL_CATALOG.length - 1)
  })

  it('sans team:manage, ni « Masquer » ni « Réafficher » ne s’affichent — lecture seule', () => {
    membersData.mockReturnValueOnce([{ userId: 'u-1', role: 'member', isSelf: true }])
    mockRitualsQuery([{ ritualKey: 'weekly', disabled: true }])
    render(<RitualsPanel />)

    expect(screen.queryByRole('button', { name: 'Masquer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Réafficher' })).toBeNull()
    // Le rituel masqué reste NOMMÉ, même en lecture seule.
    expect(screen.getByText('Rituels masqués (1)')).toBeInTheDocument()
  })
})

/**
 * #3271.11, .12, .8 (suite #3298) — l'écran montre désormais l'effet mesuré
 * d'un rituel et sa dernière tenue, tirés de la MÊME lecture `GET
 * /pilotage/rituals` — jamais une seconde requête.
 */
describe('RitualsPanel — #3298 effet mesurable et dernière tenue', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    setRitualPreference.mockClear()
    markRitualHeld.mockClear()
    invalidateQueries.mockClear()
  })

  it('un rituel monthly sans effet mesurable porte le badge, jamais un état silencieux', () => {
    mockRitualsQuery([], {
      effectiveness: [{ ritualKey: 'monthly', verdict: 'no_measurable_effect', watchedKeys: [], monthsCovered: 3 }],
    })
    render(<RitualsPanel />)

    expect(screen.getByText('Aucun effet mesurable récemment')).toBeInTheDocument()
  })

  // #3298 (reste, recette prod 30/09) : `not_evaluable` (moins de 3 photos)
  // n'avait AUCUN écran — le seul verdict visible était `no_measurable_effect`,
  // absent tant qu'un espace n'a pas trois mois d'historique (la quasi-totalité
  // des espaces bêta). Doctrine « un axe non évaluable est nommé ».
  it('un rituel monthly pas encore mesurable le nomme, jamais silencieux', () => {
    mockRitualsQuery([], {
      effectiveness: [{ ritualKey: 'monthly', verdict: 'not_evaluable', watchedKeys: [], monthsCovered: 2 }],
    })
    render(<RitualsPanel />)

    expect(screen.getByText('Mesure en cours (2/3 mois)')).toBeInTheDocument()
    expect(screen.queryByText('Aucun effet mesurable récemment')).toBeNull()
  })

  it("un rituel dont l'effet a bougé ne porte ni badge « sans effet » ni badge « en cours »", () => {
    mockRitualsQuery([], {
      effectiveness: [{ ritualKey: 'monthly', verdict: 'moved', watchedKeys: [], monthsCovered: 3 }],
    })
    render(<RitualsPanel />)

    expect(screen.queryByText('Aucun effet mesurable récemment')).toBeNull()
    expect(screen.queryByText(/Mesure en cours/)).toBeNull()
  })

  // #3298 (suite #3271.11, historique d'occurrence) — recette 30/09 :
  // l'écran doit nommer DEPUIS QUAND, pas seulement CONSTATER une absence.
  it('un rituel sans effet mesurable AVEC sinceMonth nomme le mois, jamais un simple constat', () => {
    mockRitualsQuery([], {
      effectiveness: [
        {
          ritualKey: 'monthly',
          verdict: 'no_measurable_effect',
          watchedKeys: [],
          monthsCovered: 4,
          sinceMonth: '2026-06',
        },
      ],
    })
    render(<RitualsPanel />)

    expect(screen.getByText('Aucun effet mesurable depuis juin 2026')).toBeInTheDocument()
    expect(screen.queryByText('Aucun effet mesurable récemment')).toBeNull()
  })

  it('un rituel jamais tenu le dit, jamais une date vide', () => {
    mockRitualsQuery()
    render(<RitualsPanel />)
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')!
    fireEvent.click(screen.getByText(daily.label.fr))

    expect(screen.getByText('jamais marqué comme tenu', { exact: false })).toBeInTheDocument()
  })

  it('une marque de dernière tenue affiche la date suivante, dérivée de la cadence', () => {
    mockRitualsQuery([], { lastHeld: [{ ritualKey: 'daily', heldAt: '2026-09-29T10:00:00.000Z', heldBy: 'u-1' }] })
    render(<RitualsPanel />)
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')!
    fireEvent.click(screen.getByText(daily.label.fr))

    expect(screen.getByText(/Prochaine session prévue le/)).toBeInTheDocument()
  })

  it('team:manage peut marquer un rituel comme tenu, et l’écran se rafraîchit', async () => {
    mockRitualsQuery()
    render(<RitualsPanel />)
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')!
    fireEvent.click(screen.getByText(daily.label.fr))

    fireEvent.click(screen.getAllByRole('button', { name: 'Marquer comme tenu aujourd’hui' })[0]!)

    await waitFor(() => expect(markRitualHeld).toHaveBeenCalledWith('daily'))
    expect(invalidateQueries).toHaveBeenCalled()
  })

  it('sans team:manage, le geste « marquer comme tenu » disparaît, la marque reste lisible', () => {
    membersData.mockReturnValue([{ userId: 'u-1', role: 'member', isSelf: true }])
    mockRitualsQuery()
    render(<RitualsPanel />)
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')!
    fireEvent.click(screen.getByText(daily.label.fr))

    expect(screen.queryByRole('button', { name: 'Marquer comme tenu aujourd’hui' })).toBeNull()
    expect(screen.getByText('jamais marqué comme tenu', { exact: false })).toBeInTheDocument()
  })
})

/**
 * #3271.8 reste (épopée #3298) — « actions créées » par rituel : le geste
 * « Créer une action » tague la tâche à sa création, le compte est une lecture.
 */
describe('RitualsPanel — #3298.5 proposition de masquer un rituel sans effet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    setRitualPreference.mockClear()
    membersData.mockReturnValue([{ userId: 'u-1', role: 'owner', isSelf: true }])
  })

  const noEffect = [
    { ritualKey: 'monthly', verdict: 'no_measurable_effect', watchedKeys: [], monthsCovered: 4, sinceMonth: '2026-06' },
  ]

  it('un rituel sans effet ouvert PROPOSE de le masquer, et le geste appelle la préférence', async () => {
    mockRitualsQuery([], { effectiveness: noEffect })
    render(<RitualsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Revue mensuelle/ }))

    expect(screen.getByText(/a-t-il encore sa place/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Masquer ce rituel' }))

    await waitFor(() => expect(setRitualPreference).toHaveBeenCalled())
    expect(setRitualPreference.mock.calls[0]![0]).toBe('monthly')
    expect(setRitualPreference.mock.calls[0]![1]).toEqual({ disabled: true })
  })

  it('un rituel dont l’effet a bougé ne reçoit aucune proposition', () => {
    mockRitualsQuery([], {
      effectiveness: [{ ritualKey: 'monthly', verdict: 'moved', watchedKeys: [], monthsCovered: 4 }],
    })
    render(<RitualsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Revue mensuelle/ }))

    expect(screen.queryByRole('button', { name: 'Masquer ce rituel' })).toBeNull()
  })

  it('sans team:manage, la proposition ne s’affiche pas — on ne propose pas un geste interdit', () => {
    membersData.mockReturnValue([{ userId: 'u-1', role: 'member', isSelf: true }])
    mockRitualsQuery([], { effectiveness: noEffect })
    render(<RitualsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Revue mensuelle/ }))

    expect(screen.queryByRole('button', { name: 'Masquer ce rituel' })).toBeNull()
  })
})

describe('RitualsPanel — #3271.8 actions créées par rituel', () => {
  beforeEach(async () => {
    createTask.mockClear()
    membersData.mockReturnValue([{ userId: 'u-1', role: 'owner', isSelf: true }])
    await i18n.changeLanguage('fr')
  })

  it('« Créer une action » pose le rituel d’origine sur la tâche créée', () => {
    mockRitualsQuery()
    render(<RitualsPanel />)
    const monthly = RITUAL_CATALOG.find(r => r.key === 'monthly')!
    fireEvent.click(screen.getByText(monthly.label.fr))
    fireEvent.click(screen.getByRole('button', { name: 'Créer une action' }))
    fireEvent.click(screen.getByRole('button', { name: 'composeur-envoyer' }))

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Relancer', ritualKey: 'monthly' }),
      expect.anything(),
    )
  })

  it('affiche le compte quand des actions sont taguées', () => {
    mockRitualsQuery([], { actionsCreated: [{ ritualKey: 'monthly', count: 3 }] })
    render(<RitualsPanel />)
    const monthly = RITUAL_CATALOG.find(r => r.key === 'monthly')!
    fireEvent.click(screen.getByText(monthly.label.fr))

    expect(screen.getByText('3 actions créées depuis ce rituel')).toBeInTheDocument()
  })

  it('aucune action taguée → aucune ligne de compte, jamais « 0 action »', () => {
    mockRitualsQuery()
    render(<RitualsPanel />)
    const monthly = RITUAL_CATALOG.find(r => r.key === 'monthly')!
    fireEvent.click(screen.getByText(monthly.label.fr))

    expect(screen.queryByText(/actions? créées? depuis/)).toBeNull()
    expect(screen.queryByText(/^0 /)).toBeNull()
  })

  it('le compte d’un rituel n’apparaît pas sur un autre', () => {
    mockRitualsQuery([], { actionsCreated: [{ ritualKey: 'monthly', count: 3 }] })
    render(<RitualsPanel />)
    const daily = RITUAL_CATALOG.find(r => r.key === 'daily')!
    fireEvent.click(screen.getByText(daily.label.fr))

    expect(screen.queryByText(/actions? créées? depuis/)).toBeNull()
  })
})

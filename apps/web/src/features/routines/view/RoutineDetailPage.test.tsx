import type { RoutineObservation, RoutineView } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const routines = vi.fn()
const observation = vi.fn()
const runNow = vi.fn()
vi.mock('../api', () => ({
  useRoutines: () => routines(),
  useRoutineObservation: () => observation(),
  useRunRoutineNow: () => runNow(),
  useUpdateRoutine: () => ({ mutate: vi.fn(), isPending: false }),
  useNoReplyFollowUpDryRun: () => ({ data: undefined, isLoading: false, isError: false }),
  useRoutineContent: () => ({ data: { key: 'blocked_needs', template: null }, isLoading: false, isError: false }),
  useSaveRoutineContent: () => ({ mutate: vi.fn(), isPending: false }),
  useResetRoutineContent: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { RoutineDetailPage } = await import('./RoutineDetailPage')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const mutate = vi.fn()
beforeEach(() => {
  mutate.mockReset()
  runNow.mockReturnValue({ mutate, isPending: false, data: undefined })
  observation.mockReturnValue({ data: { days: 30, runs: 0, notified: 0, failed: 0 }, isLoading: false, isError: false })
})

function view(over: Partial<RoutineView['subscription']> = {}): RoutineView {
  return {
    definition: {
      key: 'blocked_needs',
      name: { fr: 'Besoins bloqués', en: 'Stuck needs' },
      description: { fr: 'Les besoins ouverts sans mouvement.', en: 'Open needs with no movement.' },
      outcome: { fr: 'Une notification hebdomadaire.', en: 'A weekly notification.' },
      cadence: 'weekly',
      defaultHour: 9,
      defaultWeekday: 1,
      requires: [],
      defaultChannel: 'in_app',
      automationLevel: 'n1_prepare',
      condition: { fr: 'Un besoin est ouvert depuis 21 jours.', en: 'A need is open for 21 days.' },
      reads: { fr: 'Les besoins de l’espace.', en: 'The workspace needs.' },
      fallback: { fr: 'Une lecture en échec se dit non mesurée.', en: 'A failed read says not measured.' },
      acceptance: { fr: 'Une notification le lundi.', en: 'A Monday notification.' },
      defaultEnabled: false,
      example: { fr: 'Lundi 9 h : « 2 besoins bloqués ».', en: 'Monday 9 AM: "2 stuck needs".' },
      stopCondition: { fr: 'Un besoin sort dès qu’il change de statut.', en: 'A need leaves once its status changes.' },
      version: 1,
      roles: ['general'],
      workspaceProfiles: ['staffing', 'forfait_conseil'],
      scope: 'personal',
      steps: ['read', 'notify'],
      preparedActions: ['notification'],
      validations: ['review_before_acting'],
      budget: 'no_model_call',
    },
    subscription: {
      key: 'blocked_needs',
      status: 'paused',
      enabled: false,
      hour: 9,
      weekday: 1,
      channel: 'in_app',
      timeZone: 'Europe/Paris',
      maxItemsPerRun: null,
      autonomy: null,
      ownerUserId: null,
      ...over,
    },
    blockers: [],
    lastRunAt: null,
    lastOutcome: null,
    nextTriggerAt: null,
    updated: false,
  }
}

describe('RoutineDetailPage — le parcours d’activation (#2843.26)', () => {
  it('montre les sept étapes, dans l’ordre', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false })
    render(<RoutineDetailPage routineKey="blocked_needs" />)
    const steps = within(screen.getByRole('list', { name: /parcours d’activation/i })).getAllByRole('heading')
    expect(steps.map(step => step.textContent)).toEqual([
      '1. Comprendre',
      '2. Voir un exemple',
      '3. Simuler',
      '4. Configurer',
      '5. Valider',
      '6. Activer',
      '7. Observer',
    ])
    expect(screen.getByText(/2 besoins bloqués/)).toBeTruthy()
  })

  it('#2843.18 — trente jours sans exécution : « rien n’a été mesuré », jamais « 0 »', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false })
    render(<RoutineDetailPage routineKey="blocked_needs" />)
    expect(screen.getByText(/rien n’a été mesuré/i)).toBeTruthy()
    expect(screen.queryByText(/0 exécution/)).toBeNull()
  })

  it('#2843.18 — trente jours d’exécutions réelles, comptées', () => {
    observation.mockReturnValue({
      data: { days: 30, runs: 4, notified: 2, failed: 1 } satisfies RoutineObservation,
      isLoading: false,
      isError: false,
    })
    routines.mockReturnValue({ data: [view({ status: 'active', enabled: true })], isLoading: false, isError: false })
    render(<RoutineDetailPage routineKey="blocked_needs" />)
    expect(screen.getByText(/4 exécutions sur les 30 derniers jours/)).toBeTruthy()
    expect(screen.getByText(/2 notifications · 1 échec/)).toBeTruthy()
  })

  it('#2843.9 — une routine en statut `error` le dit, et se réactive d’un geste', () => {
    routines.mockReturnValue({ data: [view({ status: 'error', enabled: false })], isLoading: false, isError: false })
    render(<RoutineDetailPage routineKey="blocked_needs" />)
    expect(screen.getByText(/arrêtée après trois échecs/i)).toBeTruthy()
  })

  it('#2843.10 — « Lancer maintenant » exécute CETTE routine', async () => {
    routines.mockReturnValue({ data: [view({ status: 'active', enabled: true })], isLoading: false, isError: false })
    render(<RoutineDetailPage routineKey="blocked_needs" />)
    await userEvent.setup().click(screen.getByRole('button', { name: /lancer maintenant/i }))
    expect(mutate).toHaveBeenCalledWith('blocked_needs')
  })

  it('#2843.19/.21/.24 — aucun coût ni plafond d’usage n’est montré au client', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false })
    const { container } = render(<RoutineDetailPage routineKey="blocked_needs" />)
    expect(container.textContent).not.toMatch(/plafond d’usage|coût|crédit/i)
  })
})

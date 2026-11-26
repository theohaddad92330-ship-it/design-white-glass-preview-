import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FocusWeekPlan } from '@bellum/contracts'
import { WeeklyPlanCard } from './WeeklyPlanCard'

// #2770.55-.62 — la carte du PLAN DE SEMAINE : elle LIT `plan` (compilé par
// `chat_tools.py::propose_weekly_plan`), et chaque jour est rendu par la MÊME
// carte que le plan de journée (blocs, « Ajouter à mon agenda », Réalisé /
// Interrompu / Reporté, Résultat / durée) — jamais une seconde implémentation.

const confirmMutate = vi.fn()
vi.mock('@/features/briefing/api', () => ({
  useConfirmFocusPlanBlock: () => ({ mutate: confirmMutate, isPending: false }),
  useCancelFocusPlanBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useSetFocusPlanBlockOutcome: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function day(date: string, title: string) {
  return {
    date,
    time_zone: 'Europe/Paris',
    energy: null,
    blocks: [
      {
        type: 'call_session' as const,
        title,
        duration_minutes: 60,
        start_iso: `${date}T09:00:00+02:00`,
        end_iso: `${date}T10:00:00+02:00`,
        priority_reason: 'Trois comptes chauds',
        priority: 'high' as const,
        deadline: null,
        context: null,
        collision: null,
      },
    ],
    deferred_blocks: [],
    margin_minutes: 60,
  }
}

function week(overrides: Partial<FocusWeekPlan> = {}): FocusWeekPlan {
  return {
    week_start: '2026-10-05',
    time_zone: 'Europe/Paris',
    energy: null,
    days: [day('2026-10-05', 'Relances urgentes'), day('2026-10-07', 'Revue pipe')],
    deferred_blocks: [],
    margin_minutes: 300,
    ...overrides,
  }
}

describe('WeeklyPlanCard', () => {
  beforeEach(() => confirmMutate.mockReset())

  it('un seul cadre : titre de la semaine, garantie, et un bloc par jour — sans carte dans la carte', () => {
    render(<WeeklyPlanCard plan={week()} />)
    expect(screen.getAllByTestId('weekly-plan-card')).toHaveLength(1)
    expect(screen.queryByTestId('focus-plan-card')).not.toBeInTheDocument()
    expect(screen.getByText(/Plan de la semaine du/)).toBeInTheDocument()
    expect(screen.getAllByText(/Rien n'est créé dans ton agenda/)).toHaveLength(1)
    expect(screen.getAllByTestId('weekly-plan-day')).toHaveLength(2)
  })

  it('chaque jour reprend les gestes du plan de journée sur ses blocs', () => {
    render(<WeeklyPlanCard plan={week()} />)
    const days = screen.getAllByTestId('weekly-plan-day')
    fireEvent.click(within(days[1]).getByRole('button', { name: /Ajouter à mon agenda/ }))
    expect(confirmMutate).toHaveBeenCalledTimes(1)
    expect(confirmMutate.mock.calls[0][0]).toMatchObject({
      title: 'Revue pipe',
      start_iso: '2026-10-07T09:00:00+02:00',
    })
  })

  it('dit la marge de la semaine une seule fois, pas une par jour', () => {
    render(<WeeklyPlanCard plan={week()} />)
    expect(screen.getAllByText(/laissées libres/)).toHaveLength(1)
  })

  it('nomme les blocs non placés, et ne montre pas la section quand il n’y en a pas', () => {
    const { rerender } = render(<WeeklyPlanCard plan={week()} />)
    expect(screen.queryByText(/Non placé/)).not.toBeInTheDocument()
    rerender(
      <WeeklyPlanCard
        plan={week({
          deferred_blocks: [{ type: 'follow_ups', title: 'Relances clients', reason: 'capacite_atteinte' }],
        })}
      />,
    )
    expect(screen.getByText(/Non placé/)).toBeInTheDocument()
    expect(screen.getByText(/Relances clients/)).toBeInTheDocument()
  })

  it('#2770 — un report pour échéance dépassée ne dit PAS « capacité atteinte »', () => {
    render(
      <WeeklyPlanCard
        plan={week({
          deferred_blocks: [{ type: 'follow_ups', title: 'Relances clients', reason: 'echeance_depassee' }],
        })}
      />,
    )
    expect(screen.getByText(/aucun créneau libre avant l’échéance/)).toBeInTheDocument()
    expect(screen.queryByText(/capacité de la journée atteinte/)).not.toBeInTheDocument()
  })

  it('une semaine sans jour placé le dit au lieu d’une liste vide', () => {
    render(<WeeklyPlanCard plan={week({ days: [] })} />)
    expect(screen.getByText(/Aucun bloc n'a pu être placé cette semaine/)).toBeInTheDocument()
    expect(screen.queryAllByTestId('weekly-plan-day')).toHaveLength(0)
  })

  it('#2770 — aucun bloc placé : ni « heures libres » ni « pas assez de temps » à côté des reports', () => {
    render(
      <WeeklyPlanCard
        plan={week({
          days: [],
          margin_minutes: 1250,
          deferred_blocks: [{ type: 'follow_ups', title: 'Relances clients', reason: 'bloc_trop_long' }],
        })}
      />,
    )
    expect(screen.getByText(/plus long que ce qu’une journée libre peut accueillir/)).toBeInTheDocument()
    expect(screen.queryByText(/laissées libres/)).not.toBeInTheDocument()
    expect(screen.queryByText(/pas assez de temps libre/)).not.toBeInTheDocument()
    expect(screen.queryByText(/capacité de la journée atteinte/)).not.toBeInTheDocument()
  })

  it('#2770 — aucun bloc placé : une seule phrase de constat, sans la garantie « Rien n’est créé » en doublon', () => {
    render(<WeeklyPlanCard plan={week({ days: [] })} />)
    expect(screen.getByText(/Aucun bloc n'a pu être placé cette semaine/)).toBeInTheDocument()
    expect(screen.queryByText(/Rien n'est créé dans ton agenda/)).not.toBeInTheDocument()
  })

  it('copie la semaine entière en texte brut', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<WeeklyPlanCard plan={week()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copier le plan/ }))
    })
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text).toContain('Relances urgentes')
    expect(text).toContain('Revue pipe')
  })

  it('#2770.35/.36/.37 — la semaine nomme UNE fois ce qu’elle n’a pas pu prendre en compte', () => {
    render(<WeeklyPlanCard plan={week({ unread_sources: ['tools', 'role', 'team_policy'] })} />)
    expect(
      screen.getAllByText('Non pris en compte : les outils branchés, ton rôle, la politique d’équipe.'),
    ).toHaveLength(1)
  })

  it('#2770.35/.37 — outils branchés et politique d’équipe dits UNE fois pour la semaine', () => {
    render(
      <WeeklyPlanCard
        plan={week({
          connected_tools: ['calendar'],
          team_policy: {
            prospecting_windows: [],
            forbidden_windows: [],
            max_meetings_per_day: null,
            daily_call_target: 20,
          },
          unread_sources: ['role'],
        })}
      />,
    )
    expect(screen.getAllByText('Outils branchés pris en compte : agenda.')).toHaveLength(1)
    expect(screen.getAllByText('Politique d’équipe : objectif de 20 appels par jour.')).toHaveLength(1)
    // La semaine porte des sessions d'appels : l'objectif n'est pas « non couvert ».
    expect(screen.queryByText(/Aucune session d’appels/)).not.toBeInTheDocument()
  })
})

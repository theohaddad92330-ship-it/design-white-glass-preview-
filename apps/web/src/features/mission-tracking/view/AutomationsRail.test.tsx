import type { RoutineKey, RoutineView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useRoutines = vi.fn()

vi.mock('@/features/routines/api', () => ({
  useRoutines: () => useRoutines(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { AutomationsRail } = await import('./AutomationsRail')

/** La même routine, ACTIVE. Le fixture ci-dessous la rend inactive par défaut. */
function activeRoutine(key: RoutineKey): RoutineView {
  const base = routine(key)
  return { ...base, subscription: { ...base.subscription, status: 'active', enabled: true } }
}

function routine(key: RoutineKey, over: Partial<RoutineView> = {}): RoutineView {
  return {
    definition: {
      key,
      automationLevel: 'n1_prepare',
      condition: { fr: 'c', en: 'c' },
      reads: { fr: 'r', en: 'r' },
      fallback: { fr: 'f', en: 'f' },
      acceptance: { fr: 'a', en: 'a' },
      name: { fr: `Nom ${key}`, en: `Name ${key}` },
      description: { fr: `Description ${key}`, en: `Description ${key}` },
      outcome: { fr: 'o', en: 'o' },
      cadence: 'weekdays',
      defaultHour: 9,
      defaultWeekday: null,
      requires: ['ats'],
      defaultChannel: 'in_app',
      defaultEnabled: true,
    },
    subscription: {
      key,
      status: 'paused',
      enabled: false,
      hour: 9,
      weekday: null,
      channel: 'in_app',
      timeZone: 'Europe/Paris',
      maxItemsPerRun: null,
      autonomy: null,
      ownerUserId: null,
    },
    blockers: [],
    lastRunAt: null,
    lastOutcome: null,
    updated: false,
    ...over,
  } as RoutineView
}

describe('AutomationsRail — le rail AFFICHE, il n’ÉDITE rien', () => {
  it('ne rend AUCUNE bascule — pas d’interrupteur Actif/Inactif dans le rail', () => {
    useRoutines.mockReturnValue({
      data: [
        routine('timesheet_chase', {
          subscription: {
            key: 'timesheet_chase',
            status: 'active',
            enabled: true,
            hour: 9,
            weekday: null,
            channel: 'in_app',
            timeZone: 'Europe/Paris',
            maxItemsPerRun: null,
            autonomy: null,
            ownerUserId: null,
          },
        }),
        routine('mission_ending'),
        routine('invoice_readiness'),
        routine('margin_alert'),
      ],
      isLoading: false,
      isError: false,
    })
    render(<AutomationsRail gaps={[]} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  /**
   * #1380 — LE RAIL EST DEVENU UNE SYNTHÈSE.
   *
   * « Le panneau Automatisations permanent prend trop de largeur au tableau.
   * Conserver sa valeur mais le transformer en bloc compact : "3 automatisations
   * actives · 1 inactive". » Il ne liste donc plus les quatre routines une par
   * une — mais il les COMPTE toutes les quatre, et lui seul : une routine hors
   * périmètre missions n'entre dans aucun des deux nombres.
   */
  it('compte les QUATRE routines de mission, et n’en liste plus aucune', () => {
    useRoutines.mockReturnValue({
      data: [
        activeRoutine('timesheet_chase'),
        activeRoutine('mission_ending'),
        routine('invoice_readiness'),
        activeRoutine('margin_alert'),
        // Une routine hors périmètre missions : elle ne doit PAS être comptée.
        activeRoutine('daily_briefing'),
      ],
      isLoading: false,
      isError: false,
    })
    render(<AutomationsRail gaps={[]} />)
    expect(screen.getByText(/3 automatisation\(s\) active\(s\) · 1 inactive\(s\)/i)).toBeTruthy()
    // Plus de liste : c'est toute la largeur que le retour vient récupérer.
    expect(screen.queryByText('Nom timesheet_chase')).toBeNull()
    expect(screen.queryByText('Nom daily_briefing')).toBeNull()
  })

  /**
   * #1380 — « Ne montrer directement qu'une automatisation si elle est liée à
   * un problème visible. Exemple : "1 CRA manquant aurait dû déclencher une
   * relance." »
   */
  it('nomme le garde-fou éteint QUAND un problème le montre, et se tait sinon', () => {
    useRoutines.mockReturnValue({
      data: [routine('timesheet_chase')],
      isLoading: false,
      isError: false,
    })
    const { rerender } = render(<AutomationsRail gaps={[]} />)
    expect(screen.queryByText(/aurait dû déclencher une relance/i)).toBeNull()

    rerender(<AutomationsRail gaps={[{ routine: 'timesheet_chase', count: 1 }]} />)
    expect(screen.getByText(/1 relevé à corriger aurait dû déclencher une relance/i)).toBeTruthy()
    // La routine est nommée par son libellé RÉEL, pas par sa clé technique.
    expect(screen.getByText(/Nom timesheet_chase/)).toBeTruthy()
  })

  it('renvoie au réglage plutôt que de l’éditer', () => {
    useRoutines.mockReturnValue({ data: [routine('timesheet_chase')], isLoading: false, isError: false })
    render(<AutomationsRail gaps={[]} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/settings/routines')
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'
import { MissionPrimaryActionBanner } from './MissionPrimaryActionBanner'

const startReadiness = vi.fn()
const endChecklist = vi.fn()
const interruption = vi.fn()

// `vi.mock` est hissé au-dessus des imports par vitest — l'ordre d'écriture
// n'a pas d'effet sur l'ordre d'exécution, même si l'import du composant
// testé apparaît avant ici.
vi.mock('../api', () => ({
  useMissionStartReadiness: () => startReadiness(),
  useMissionEndChecklist: () => endChecklist(),
  useMissionInterruption: () => interruption(),
}))

const mission = (patch: Partial<MissionView> = {}): MissionView =>
  ({
    id: 'm1',
    status: 'active',
    risks: [],
    ...patch,
  }) as MissionView

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('#2953 (#2193.53, .57) — MissionPrimaryActionBanner', () => {
  it('ne rend rien tant que la checklist de sortie (active) est en cours de lecture', () => {
    startReadiness.mockReturnValue({ data: undefined })
    endChecklist.mockReturnValue({ data: undefined })
    interruption.mockReturnValue({ data: undefined })
    render(<MissionPrimaryActionBanner mission={mission()} />)
    expect(screen.queryByTestId('mission-primary-action')).toBeNull()
  })

  it('#2193.57 — nomme les prérequis manquants quand le démarrage est bloqué', () => {
    startReadiness.mockReturnValue({
      data: { verdict: 'blocked', agreementsPending: true, missing: ['client_agreement'], reserves: [], items: [] },
    })
    endChecklist.mockReturnValue({ data: undefined })
    interruption.mockReturnValue({ data: undefined })
    render(<MissionPrimaryActionBanner mission={mission({ status: 'onboarding' })} />)
    const banner = screen.getByTestId('mission-primary-action')
    expect(banner.textContent).toContain('Compléter le démarrage')
  })

  it('affiche « rien à faire » comme un état nommé, jamais un bandeau absent', () => {
    startReadiness.mockReturnValue({ data: undefined })
    endChecklist.mockReturnValue({ data: { verdict: 'complete', done: [], missing: [], items: [] } })
    interruption.mockReturnValue({ data: undefined })
    render(<MissionPrimaryActionBanner mission={mission({ status: 'active', risks: [] })} />)
    const banner = screen.getByTestId('mission-primary-action')
    expect(banner.textContent).toContain('Rien à faire')
  })

  it('NO-GO : une interruption non revalidée prime sur tout, sur une mission terminée', () => {
    startReadiness.mockReturnValue({ data: undefined })
    endChecklist.mockReturnValue({ data: { verdict: 'in_progress', done: [], missing: ['client_payment'], items: [] } })
    interruption.mockReturnValue({ data: { availabilityConfirmed: false } })
    render(<MissionPrimaryActionBanner mission={mission({ status: 'terminated' })} />)
    const banner = screen.getByTestId('mission-primary-action')
    expect(banner.textContent).toContain('Revalider la disponibilité')
  })

  it('#2953 (recette 30/09) — ne RELISTE pas la checklist : il en pointe le compte, le détail vit dans le panneau', () => {
    startReadiness.mockReturnValue({
      data: {
        verdict: 'blocked',
        agreementsPending: true,
        missing: ['client_agreement', 'consultant_agreement'],
        reserves: [],
        items: [],
      },
    })
    endChecklist.mockReturnValue({ data: undefined })
    interruption.mockReturnValue({ data: undefined })
    render(<MissionPrimaryActionBanner mission={mission({ status: 'onboarding' })} />)
    const banner = screen.getByTestId('mission-primary-action')
    expect(banner.textContent).toContain('2 points à compléter')
    expect(banner.textContent).not.toContain('Accord du client')
  })
})

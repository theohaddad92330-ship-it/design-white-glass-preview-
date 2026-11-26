import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MissionView } from '../api'
import { MissionLifecycleStrip } from './MissionLifecycleStrip'

const NOW = new Date('2026-10-22T10:00:00Z')

afterEach(cleanup)

function strip(status: MissionView['status'], endsOn: string | null) {
  render(<MissionLifecycleStrip mission={{ status, ends_on: endsOn } as MissionView} now={NOW} />)
  return screen.getByRole('navigation', { name: 'Cycle de vie de la mission' })
}

// Théo missions-dossier.N1 — la frise : une étape franchie porte une coche, une étape à venir porte son RANG.
describe('MissionLifecycleStrip', () => {
  it('une mission en cours : Accord et Démarrage cochés, Mission en cours, Passation (4) et Clôture (5) à venir', () => {
    const nav = strip('active', '2027-03-31')
    const steps = within(nav).getAllByRole('listitem')
    expect(steps.map(step => step.getAttribute('data-state'))).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(within(steps[3] as HTMLElement).getByText('4')).toBeInTheDocument()
    expect(within(steps[4] as HTMLElement).getByText('5')).toBeInTheDocument()
    expect(within(steps[0] as HTMLElement).queryByText('1')).not.toBeInTheDocument()
  })

  it('une fin sous 30 jours ouvre la Passation', () => {
    const nav = strip('active', '2026-10-30')
    expect(within(nav).getAllByRole('listitem')[3]).toHaveAttribute('aria-current', 'step')
  })

  it('le sens ne repose pas sur la couleur seule : l’étape courante porte aria-current et son nom', () => {
    const nav = strip('onboarding', null)
    const current = within(nav).getByText('Démarrage').closest('li')
    expect(current).toHaveAttribute('aria-current', 'step')
  })
})

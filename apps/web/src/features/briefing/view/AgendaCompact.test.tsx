import type { AgendaEvent } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgendaCompact } from './AgendaCompact'

function makeEvent(overrides: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'start' | 'end'>): AgendaEvent {
  return {
    summary: null,
    description: null,
    location: null,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: null,
    isExternal: true,
    cancelled: false,
    ...overrides,
  }
}

/**
 * #2101.33/.34/.35 — la ligne compacte dit la CAPACITÉ du jour (dossiers
 * ouvrables), au même endroit et sous la même forme que les autres segments —
 * un réglage vit à un seul endroit (GA-26) : aucune seconde ligne ailleurs.
 */
describe('#2101.33 — segment capacité de AgendaCompact', () => {
  it('affiche le nombre de dossiers ouvrables quand il y a du temps libre significatif', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
      makeEvent({ id: '2', start: '2026-09-25T13:30:00.000Z', end: '2026-09-25T14:00:00.000Z' }),
    ]

    render(<AgendaCompact events={events} now={now} />)

    expect(screen.getByText(/dossiers? ouvrable/)).toBeInTheDocument()
  })

  it('un segment à zéro ne fait aucune ligne (GA-18/GA-19) — pas de "0 dossier"', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
    ]

    render(<AgendaCompact events={events} now={now} />)

    expect(screen.queryByText(/ouvrable/)).not.toBeInTheDocument()
  })
})

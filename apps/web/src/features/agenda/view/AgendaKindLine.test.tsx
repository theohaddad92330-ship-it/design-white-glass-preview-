import type { AgendaEvent } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgendaKindLine } from './AgendaKindLine'

/** #2390.1 — la nature d'un évènement, dite une fois, depuis ce que le fournisseur rend. */
function ev(overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id: 'e1',
    summary: 'RDV',
    description: null,
    location: null,
    start: '2026-10-02T09:00:00.000Z',
    end: '2026-10-02T10:00:00.000Z',
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
    ...overrides,
  }
}

describe('AgendaKindLine', () => {
  it('nomme un rendez-vous externe', () => {
    const attendees = [{ email: 'c@client.fr', displayName: null, responseStatus: null, external: true }]
    render(<AgendaKindLine event={ev({ isExternal: true, attendees })} />)
    expect(screen.getByText('Rendez-vous externe')).toBeInTheDocument()
  })

  it('nomme une absence', () => {
    render(<AgendaKindLine event={ev({ providerEventType: 'outOfOffice' })} />)
    expect(screen.getByText('Absence')).toBeInTheDocument()
  })

  it('un créneau masqué se dit « Indisponible », sans rien de plus', () => {
    render(<AgendaKindLine event={ev({ busyOnly: true, isExternal: true })} />)
    expect(screen.getByText('Indisponible (détails privés)')).toBeInTheDocument()
  })
})

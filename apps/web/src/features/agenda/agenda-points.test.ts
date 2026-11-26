import type { AgendaEvent } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { agendaPointsOf, agendaVisualKind } from './agenda-view'

function event(partial: Partial<AgendaEvent>): AgendaEvent {
  return {
    id: 'e',
    summary: 'Point',
    description: null,
    location: null,
    start: '2026-10-22T12:00:00Z',
    end: '2026-10-22T13:00:00Z',
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
    ...partial,
  }
}

// Théo A today-agenda.A3 — une seule pastille « n points » par carte.
describe('agendaPointsOf', () => {
  it('ne compte rien pour un rendez-vous sans particularité', () => {
    expect(agendaPointsOf(event({}), false)).toBe(0)
  })

  it('compte un conflit', () => {
    expect(agendaPointsOf(event({}), true)).toBe(1)
  })

  it('compte les invités externes pour un point, jamais une salle comme invité', () => {
    const attendees: AgendaEvent['attendees'] = [
      { email: 'client@dehors.example', displayName: 'Client', responseStatus: 'accepted', external: true },
      {
        email: 'salle@bellum.example',
        displayName: 'Salle',
        responseStatus: 'accepted',
        external: false,
        resource: true,
      },
    ]
    expect(agendaPointsOf(event({ attendees }), false)).toBe(1)
  })

  it('cumule conflit et externes', () => {
    const attendees: AgendaEvent['attendees'] = [
      { email: 'client@dehors.example', displayName: 'Client', responseStatus: 'accepted', external: true },
    ]
    expect(agendaPointsOf(event({ attendees }), true)).toBe(2)
  })
})

// Théo A today-agenda.A6 — hachures (indisponible, absence), pointillé (créneau proposé).
describe('agendaVisualKind', () => {
  it('rend un créneau proposé en pointillé', () => {
    expect(agendaVisualKind(event({ status: 'tentative' }))).toBe('proposed')
  })

  it('rend une absence en hachures', () => {
    expect(agendaVisualKind(event({ providerEventType: 'outOfOffice' }))).toBe('busy')
  })

  it('rend un rendez-vous ordinaire en carte pleine', () => {
    expect(agendaVisualKind(event({}))).toBe('plain')
  })
})

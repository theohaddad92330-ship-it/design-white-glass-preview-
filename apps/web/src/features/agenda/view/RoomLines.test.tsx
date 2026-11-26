import type { AgendaEvent } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoomLines } from './RoomLines'

/** #2390.9 — la ligne « Salle » et son nombre de places, jamais un « 0 place ». */
function ev(attendees: AgendaEvent['attendees'], organizer: string | null = null): AgendaEvent {
  return {
    id: 'e1',
    summary: 'RDV',
    description: null,
    location: null,
    start: '2026-10-02T09:00:00.000Z',
    end: '2026-10-02T10:00:00.000Z',
    organizer,
    attendees,
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
  }
}
const person = (email: string): AgendaEvent['attendees'][number] => ({
  email,
  displayName: null,
  responseStatus: null,
  external: false,
})
const room = (capacity?: number): AgendaEvent['attendees'][number] => ({
  email: 'salle@bellum.example',
  displayName: 'Salle Debussy',
  responseStatus: null,
  external: false,
  resource: true,
  ...(capacity === undefined ? {} : { capacity }),
})

describe('RoomLines', () => {
  it('nomme la salle avec ses places quand la capacité est lue', () => {
    render(<RoomLines event={ev([person('a@x.fr'), room(8)])} />)
    expect(screen.getByText('Salle : Salle Debussy · 8 places')).toBeInTheDocument()
    expect(screen.queryByText(/trop petite/)).toBeNull()
  })

  it('sans capacité lue : la salle seule, aucune mention de places', () => {
    render(<RoomLines event={ev([person('a@x.fr'), room()])} />)
    expect(screen.getByText('Salle : Salle Debussy')).toBeInTheDocument()
    expect(screen.queryByText(/place/)).toBeNull()
  })

  it('signale une salle trop petite, avec les deux nombres', () => {
    render(<RoomLines event={ev([person('a@x.fr'), person('b@x.fr'), room(2)], 'orga@x.fr')} />)
    expect(screen.getByText('Salle trop petite : 3 personnes pour 2 places')).toBeInTheDocument()
  })

  it('aucune salle, aucune ligne', () => {
    const { container } = render(<RoomLines event={ev([person('a@x.fr')])} />)
    expect(container).toBeEmptyDOMElement()
  })
})

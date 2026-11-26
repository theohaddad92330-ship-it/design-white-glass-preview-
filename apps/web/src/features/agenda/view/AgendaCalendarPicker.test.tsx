import type { AgendaCalendars } from '@bellum/contracts'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2112.35 — « Menu riche — description ».
 *
 * Le seul champ disponible par agenda qui n'était pas déjà à l'écran est
 * `canWrite` (déjà dans le contrat, déjà servi par l'API — jamais fabriqué
 * ici) : un agenda partagé en lecture seule le dit, plutôt que de laisser
 * découvrir l'impossibilité d'écrire au moment de créer un événement dedans.
 */

const selectMany = vi.fn()
const selectAll = vi.fn()
let calendars: AgendaCalendars

vi.mock('../api', () => ({
  useAgendaCalendars: () => ({ data: calendars }),
  useSelectAgendaCalendars: () => ({ mutate: selectMany, isPending: false, isError: false }),
  useSelectAllAgendaCalendars: () => ({ mutate: selectAll, isPending: false, isError: false }),
}))

const { AgendaCalendarPicker } = await import('./AgendaCalendarPicker')

beforeEach(() => {
  selectMany.mockClear()
  selectAll.mockClear()
  calendars = {
    calendars: [
      { id: 'moi', name: 'Mon agenda', provider: 'google', primary: true, canWrite: true },
      { id: 'clients', name: 'Rendez-vous clients', provider: 'google', primary: false, canWrite: false },
    ],
    selectedCalendars: [],
    readsAll: true,
    unavailable: [],
  }
})

describe('le sélecteur d’agendas — description « lecture seule »', () => {
  it('nomme un agenda partagé en lecture seule', () => {
    render(<AgendaCalendarPicker enabled />)
    fireEvent.click(screen.getByRole('button', { name: /tous mes agendas/i }))

    const clients = screen.getByText('Rendez-vous clients').closest('label')
    expect(clients).not.toBeNull()
    expect(clients).toHaveTextContent(/lecture seule/i)
  })

  it('ne le dit pas pour un agenda où on peut écrire', () => {
    render(<AgendaCalendarPicker enabled />)
    fireEvent.click(screen.getByRole('button', { name: /tous mes agendas/i }))

    const moi = screen.getByText('Mon agenda').closest('label')
    expect(moi).not.toBeNull()
    expect(moi).not.toHaveTextContent(/lecture seule/i)
  })
})

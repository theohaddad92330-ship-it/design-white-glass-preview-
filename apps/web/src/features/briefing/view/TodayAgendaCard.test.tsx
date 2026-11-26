import type { AgendaConflict, AgendaEvent } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TodayAgendaCard } from './TodayAgendaCard'

const NOW = new Date('2026-10-22T08:00:00Z')

function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
  return {
    summary: 'Cadrage data',
    description: null,
    location: 'Orange · Nathalie Girard',
    start: '2026-10-22T12:00:00Z',
    end: '2026-10-22T13:00:00Z',
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...partial,
  } as AgendaEvent
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('TodayAgendaCard — « Les rendez-vous du jour » (refonte Théo)', () => {
  it('une rangée par rendez-vous : heure, titre, lieu, et « Ouvrir le rendez-vous » qui ouvre SON pré-brief', () => {
    const onOpenEvent = vi.fn()
    render(
      <TodayAgendaCard
        events={[event({ id: 'e1' })]}
        conflictsByEventId={new Map()}
        now={NOW}
        language="fr"
        onOpenEvent={onOpenEvent}
        onOpenConflict={vi.fn()}
      />,
    )
    expect(screen.getByText('Cadrage data')).toBeInTheDocument()
    expect(screen.getByText('Orange · Nathalie Girard')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir le rendez-vous — Cadrage data/ }))
    expect(onOpenEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
  })

  it('un chevauchement se nomme et ouvre la boîte de conflit ; sans conflit, aucune pastille', () => {
    const conflict = { id: 'c1' } as unknown as AgendaConflict
    const onOpenConflict = vi.fn()
    render(
      <TodayAgendaCard
        events={[event({ id: 'e1' }), event({ id: 'e2', summary: 'Point staffing' })]}
        conflictsByEventId={new Map([['e1', conflict]])}
        now={NOW}
        language="fr"
        onOpenEvent={vi.fn()}
        onOpenConflict={onOpenConflict}
      />,
    )
    const pills = screen.getAllByRole('button', { name: /conflit/i })
    expect(pills).toHaveLength(1)
    fireEvent.click(pills[0]!)
    expect(onOpenConflict).toHaveBeenCalledWith(conflict)
  })

  it('sait dire NON : un rendez-vous annulé ne fait aucune rangée, et une journée vide le dit', () => {
    render(
      <TodayAgendaCard
        events={[event({ id: 'e1', cancelled: true })]}
        conflictsByEventId={new Map()}
        now={NOW}
        language="fr"
        onOpenEvent={vi.fn()}
        onOpenConflict={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('today-agenda-rows')).not.toBeInTheDocument()
    expect(screen.queryByText('Cadrage data')).not.toBeInTheDocument()
  })

  it('un titre absent ne fait aucune ligne (#3533)', () => {
    render(
      <TodayAgendaCard
        events={[event({ id: 'e1', summary: '   ' })]}
        conflictsByEventId={new Map()}
        now={NOW}
        language="fr"
        onOpenEvent={vi.fn()}
        onOpenConflict={vi.fn()}
      />,
    )
    expect(screen.queryByText(/sans objet/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir le rendez-vous' })).toBeInTheDocument()
  })
})

import type { TimelineEvent } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { collapseTimelineEvents } from './collapseTimelineEvents'

function event(partial: Partial<TimelineEvent> & Pick<TimelineEvent, 'id' | 'at'>): TimelineEvent {
  return {
    kind: 'action',
    label: 'Fiche contact ouverte',
    detail: 'Gerald',
    type: 'plan_action_contact_opened',
    contactId: 'c-1',
    ...partial,
  }
}

describe('collapseTimelineEvents — #3405 / #3505 (recette prod 01/10)', () => {
  it('regroupe « Fiche contact ouverte · Gerald » ×4 le même jour en UNE ligne × 4', () => {
    const rows = [
      event({ id: 'a', at: '2026-09-30T15:00:00.000Z' }),
      event({ id: 'b', at: '2026-09-30T14:00:00.000Z' }),
      event({ id: 'c', at: '2026-09-30T11:00:00.000Z' }),
      event({ id: 'd', at: '2026-09-30T10:00:00.000Z' }),
    ]
    const out = collapseTimelineEvents(rows)
    expect(out).toHaveLength(1)
    expect(out[0]?.count).toBe(4)
    // La ligne porte l'instant de la plus RÉCENTE.
    expect(out[0]?.event.id).toBe('a')
  })

  it('sait dire NON : un autre jour, une autre personne ou un autre libellé ne se regroupent pas', () => {
    const out = collapseTimelineEvents([
      event({ id: 'a', at: '2026-09-30T15:00:00.000Z' }),
      event({ id: 'b', at: '2026-09-29T15:00:00.000Z' }),
      event({ id: 'c', at: '2026-09-30T14:00:00.000Z', detail: 'Marie', contactId: 'c-2' }),
      event({ id: 'd', at: '2026-09-30T13:00:00.000Z', label: 'Enrichissement demandé' }),
    ])
    expect(out.map(entry => entry.count)).toEqual([1, 1, 1, 1])
  })

  it('un changement de statut ou un mouvement de projet reste une ligne chacun', () => {
    const out = collapseTimelineEvents([
      event({ id: 'a', at: '2026-09-30T15:00:00.000Z', kind: 'opportunity', label: 'Signal' }),
      event({ id: 'b', at: '2026-09-30T14:00:00.000Z', kind: 'opportunity', label: 'Signal' }),
      event({
        id: 'c',
        at: '2026-09-30T13:00:00.000Z',
        label: 'Statut',
        transition: { from: 'watching', to: 'active' },
      }),
      event({
        id: 'd',
        at: '2026-09-30T12:00:00.000Z',
        label: 'Statut',
        transition: { from: 'watching', to: 'active' },
      }),
    ])
    expect(out).toHaveLength(4)
  })

  it('garde l’ordre d’entrée', () => {
    const out = collapseTimelineEvents([
      event({ id: 'a', at: '2026-09-30T15:00:00.000Z' }),
      event({ id: 'x', at: '2026-09-30T14:30:00.000Z', label: 'Autre', detail: null }),
      event({ id: 'b', at: '2026-09-30T14:00:00.000Z' }),
    ])
    expect(out.map(entry => entry.event.id)).toEqual(['a', 'x'])
    expect(out[0]?.count).toBe(2)
  })
})

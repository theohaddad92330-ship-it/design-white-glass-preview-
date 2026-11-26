import { describe, expect, it } from 'vitest'
import type { NotificationItem } from '@bellum/contracts'
import { newUnreadNotifications } from './relay-selection'

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n-1',
    type: 'buy_signal',
    title: 'Signal détecté',
    body: 'Corp X',
    link: null,
    read_at: null,
    created_at: '2026-09-16T08:00:00.000Z',
    // #2404.3 — champ requis depuis que le niveau nommé voyage jusqu'au wire.
    level: null,
    // #2404.7 — idem pour la source.
    source: null,
    // #3922.n — idem pour le lien externe du signal cité.
    source_url: null,
    source_kind: null,
    // #4158.14 — l'auteur et le caractère calculé voyagent aussi jusqu'au wire.
    actor_name: null,
    derived: false,
    ...overrides,
  }
}

describe('#1938.3 — newUnreadNotifications', () => {
  it('ne relaie rien tant que rien n’est NEUF', () => {
    const seen = new Set(['n-1'])
    expect(newUnreadNotifications(seen, [item({ id: 'n-1' })])).toEqual([])
  })

  it('relaie une notification neuve et NON LUE', () => {
    const seen = new Set<string>()
    const fresh = item({ id: 'n-2' })
    expect(newUnreadNotifications(seen, [fresh])).toEqual([fresh])
  })

  it('ne relaie jamais une notification déjà LUE, même neuve pour ce relais', () => {
    const seen = new Set<string>()
    const read = item({ id: 'n-3', read_at: '2026-09-16T08:05:00.000Z' })
    expect(newUnreadNotifications(seen, [read])).toEqual([])
  })

  it('un lot mixte ne rend QUE les entrées neuves et non lues', () => {
    const seen = new Set(['n-old'])
    const notifications = [
      item({ id: 'n-old' }),
      item({ id: 'n-new-unread' }),
      item({ id: 'n-new-read', read_at: '2026-09-16T08:05:00.000Z' }),
    ]
    expect(newUnreadNotifications(seen, notifications).map(n => n.id)).toEqual(['n-new-unread'])
  })

  it('une liste vide ne relaie rien — jamais une exception', () => {
    expect(newUnreadNotifications(new Set(), [])).toEqual([])
  })

  it('ne relaie jamais une entrée CALCULÉE : c’est un état, pas un événement (#4158.18)', () => {
    expect(newUnreadNotifications(new Set(), [item({ id: 'derived:esn', derived: true })])).toEqual([])
  })
})

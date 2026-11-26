import { describe, expect, it } from 'vitest'
import {
  consolidateNotifications,
  defaultNotificationPreferences,
  NOTIFICATION_OUTBOUND_PREFERENCE_KEYS,
  NOTIFICATION_TYPE_PURPOSES,
  notificationSchema,
  notificationTypeSchema,
  TEAM_NOTIFICATION_TYPES,
  type NotificationItem,
} from './notifications.js'

// #4158.14 / #4158.19 — la boîte de réception d'équipe.
describe('#4158 — boîte de réception entre collègues', () => {
  it('chaque type d’équipe est un type connu, avec sa finalité écrite', () => {
    for (const type of TEAM_NOTIFICATION_TYPES) {
      expect(notificationTypeSchema.options).toContain(type)
      expect(NOTIFICATION_TYPE_PURPOSES[type].length).toBeGreaterThan(20)
    }
  })

  it('les types de Laura et du produit ne sont PAS dans la catégorie Équipe', () => {
    expect(TEAM_NOTIFICATION_TYPES).not.toContain('buy_signal')
    expect(TEAM_NOTIFICATION_TYPES).not.toContain('credit_low')
  })

  it('les quatre e-mails entre collègues sont des ENVOIS, tous faux par défaut', () => {
    for (const key of [
      'email_on_assignment',
      'email_on_delegation',
      'email_on_mention',
      'email_on_manager_digest',
    ] as const) {
      expect(NOTIFICATION_OUTBOUND_PREFERENCE_KEYS).toContain(key)
      expect(defaultNotificationPreferences[key]).toBe(false)
    }
  })

  it('une ancienne notification sans auteur se lit actor_name null, derived faux', () => {
    const parsed = notificationSchema.parse({
      id: '00000000-0000-0000-0000-000000000001',
      type: 'system',
      title: 't',
      body: '',
      link: null,
      read_at: null,
      created_at: '2026-10-14T10:00:00.000Z',
    })
    expect(parsed.actor_name).toBeNull()
    expect(parsed.derived).toBe(false)
  })

  it('deux mentions de deux collègues au même endroit ne fusionnent JAMAIS', () => {
    const base = {
      type: 'team_mention',
      title: 'te mentionne',
      body: '',
      link: '/accounts/a1',
      read_at: null,
      level: null,
      source: null,
      source_url: null,
      source_kind: null,
      derived: false,
    } as const
    const a: NotificationItem = { ...base, id: 'a', created_at: '2026-10-14T08:00:00.000Z', actor_name: 'Alice Martin' }
    const b: NotificationItem = { ...base, id: 'b', created_at: '2026-10-14T09:00:00.000Z', actor_name: 'Bob Durand' }
    const merged = consolidateNotifications([a, b])
    expect(merged).toHaveLength(2)
    expect(merged.map(m => m.actor_name)).toEqual(['Alice Martin', 'Bob Durand'])
  })
})

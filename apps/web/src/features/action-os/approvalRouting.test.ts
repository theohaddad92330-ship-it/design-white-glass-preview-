import { describe, expect, it } from 'vitest'
import { assignableMembers, partitionSnoozed, snoozeChoices } from './approvalRouting'

const NOW = new Date('2026-09-25T10:00:00.000Z')

describe('partitionSnoozed (#2856)', () => {
  it('range une demande reportée dans le futur à part, et réveille celle dont la date est passée', () => {
    const items = [
      { id: 'a', snoozed_until: null },
      { id: 'b', snoozed_until: '2026-09-26T10:00:00.000Z' },
      { id: 'c', snoozed_until: '2026-09-24T10:00:00.000Z' },
      { id: 'd' },
    ]
    const { active, snoozed } = partitionSnoozed(items, NOW)
    expect(active.map(item => item.id)).toEqual(['a', 'c', 'd'])
    expect(snoozed.map(item => item.id)).toEqual(['b'])
  })
})

describe('snoozeChoices (#2856)', () => {
  it('ne propose que les reports qui tombent AVANT l’expiration', () => {
    const choices = snoozeChoices('2026-09-27T09:00:00.000Z', NOW)
    // +1 j tient (26/09 10 h < 27/09 9 h), +3 j non : la demande périrait endormie.
    expect(choices.map(choice => choice.key)).toEqual(['tomorrow'])
    expect(choices[0].until).toBe('2026-09-26T10:00:00.000Z')
  })

  it('ne propose rien quand l’expiration est trop proche', () => {
    expect(snoozeChoices('2026-09-25T12:00:00.000Z', NOW)).toEqual([])
  })
})

describe('assignableMembers (#2864)', () => {
  const members = [
    { userId: 'u1', email: 'moi@esn.fr', fullName: 'Moi', role: 'sales' as const, isSelf: true },
    { userId: 'u2', email: 'c@esn.fr', fullName: 'Claire', role: 'sales' as const, isSelf: false },
    { userId: 'u3', email: 'l@esn.fr', fullName: 'Lecteur', role: 'viewer' as const, isSelf: false },
    { userId: 'u4', email: 'm@esn.fr', fullName: null, role: 'admin' as const, isSelf: false },
  ]

  it('propose les collègues qui peuvent trancher — jamais soi-même, jamais un lecteur', () => {
    expect(assignableMembers(members).map(member => member.value)).toEqual(['u2', 'u4'])
  })

  it('nomme un collègue par son nom, à défaut son e-mail', () => {
    expect(assignableMembers(members).map(member => member.label)).toEqual(['Claire', 'm@esn.fr'])
  })
})

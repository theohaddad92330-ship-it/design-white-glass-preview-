import { describe, expect, it } from 'vitest'
import { guestLocalTimes } from './guest-time-zones'

/**
 * #2390.1 / #2390.8 — l'heure du rendez-vous dans le fuseau de l'invité, SI on
 * le connaît (le fuseau d'une fiche contact rattachée par son e-mail). Sinon,
 * rien : ni ligne, ni fuseau deviné depuis un pays ou un domaine.
 */

// 14:00 à Paris (UTC+2 fin septembre) = 08:00 à New York (UTC-4) = 12:00 UTC.
const START = '2026-09-30T12:00:00.000Z'
const event = (attendees: { email: string; external?: boolean; resource?: boolean }[]) => ({
  start: START,
  attendees: attendees.map(a => ({
    email: a.email,
    displayName: null,
    responseStatus: null,
    external: a.external ?? true,
    resource: a.resource,
  })),
})
const contact = (email: string, timezone: string | null | undefined, name = 'Ada Lovelace') => ({
  full_name: name,
  email,
  timezone,
})

describe('guestLocalTimes', () => {
  it('donne l’heure chez l’invité quand son fuseau (fiche contact) diffère du mien', () => {
    const result = guestLocalTimes(
      event([{ email: 'ada@client.com' }]),
      [contact('Ada@Client.com', 'America/New_York')],
      'Europe/Paris',
      'fr',
    )
    expect(result).toEqual([{ name: 'Ada Lovelace', timeZone: 'America/New_York', time: '08:00' }])
  })

  it('ne dit rien quand l’heure murale est la même que la mienne', () => {
    expect(
      guestLocalTimes(
        event([{ email: 'ada@client.com' }]),
        [contact('ada@client.com', 'Europe/Berlin')],
        'Europe/Paris',
        'fr',
      ),
    ).toEqual([])
  })

  it('ne dit rien sans fuseau connu : null, absent ou invalide', () => {
    const e = event([{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }, { email: 'd@x.com' }])
    const contacts = [
      contact('a@x.com', null),
      contact('b@x.com', undefined),
      contact('c@x.com', 'Mars/Olympus_Mons'),
      // d@x.com : aucune fiche
    ]
    expect(guestLocalTimes(e, contacts, 'Europe/Paris', 'fr')).toEqual([])
  })

  it('ne compte jamais une salle réservée', () => {
    expect(
      guestLocalTimes(
        event([{ email: 'salle@client.com', resource: true }]),
        [contact('salle@client.com', 'America/New_York')],
        'Europe/Paris',
        'fr',
      ),
    ).toEqual([])
  })

  it('nomme le jour quand il change chez l’invité', () => {
    // 23:30 UTC le 30/09 = 01:30 le 01/10 à Paris = 16:30 le 30/09 à Los Angeles.
    const result = guestLocalTimes(
      { start: '2026-09-30T23:30:00.000Z', attendees: event([{ email: 'ada@client.com' }]).attendees },
      [contact('ada@client.com', 'America/Los_Angeles')],
      'Europe/Paris',
      'en',
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.time).toMatch(/4:30/)
    expect(result[0]!.time).toMatch(/Wed/)
  })

  it('ignore un évènement sans heure ou « journée entière »', () => {
    const attendees = event([{ email: 'ada@client.com' }]).attendees
    const contacts = [contact('ada@client.com', 'America/New_York')]
    expect(guestLocalTimes({ start: null, attendees }, contacts, 'Europe/Paris', 'fr')).toEqual([])
    expect(guestLocalTimes({ start: '2026-09-30', attendees }, contacts, 'Europe/Paris', 'fr')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { guestResponseTally } from './guest-responses'

/**
 * #2390.14 — le critère de priorité « engagement des invités » : ce que les
 * invités ont RÉPONDU. Jamais un verdict (#2390.15) : un décompte, ou rien.
 */

const guest = (responseStatus: string | null, extra: { resource?: boolean } = {}) => ({
  email: `${Math.random()}@x.com`,
  displayName: null,
  responseStatus,
  external: true,
  ...extra,
})

describe('guestResponseTally', () => {
  it('compte les réponses de Google et de Microsoft sous les mêmes mots', () => {
    const tally = guestResponseTally({
      attendees: [
        guest('accepted'),
        guest('accepted'),
        guest('tentative'),
        guest('tentativelyAccepted'),
        guest('declined'),
        guest('needsAction'),
        guest('notResponded'),
      ],
    })
    expect(tally).toEqual({ accepted: 2, tentative: 2, declined: 1, pending: 2 })
  })

  it('rend null quand AUCUNE réponse ne se lit — « non mesuré » n’est pas « 0 accepté »', () => {
    expect(guestResponseTally({ attendees: [] })).toBeNull()
    expect(guestResponseTally({ attendees: [guest(null), guest('organizer'), guest('inconnu')] })).toBeNull()
  })

  it('ne compte jamais une salle réservée', () => {
    expect(guestResponseTally({ attendees: [guest('accepted', { resource: true })] })).toBeNull()
  })
})

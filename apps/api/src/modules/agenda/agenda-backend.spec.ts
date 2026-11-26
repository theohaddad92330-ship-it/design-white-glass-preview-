import type { AgendaEvent } from '@bellum/contracts'
import { isExternalAddress, isPrivateAgendaEvent, maskPrivateAgendaEvent } from './agenda-backend'

describe('isPrivateAgendaEvent (#2388.23)', () => {
  it('reconnaît la valeur Google "private"', () => {
    expect(isPrivateAgendaEvent('private')).toBe(true)
  })

  it('reconnaît la valeur Microsoft Graph "private" (sensitivity), insensible à la casse', () => {
    expect(isPrivateAgendaEvent('Private')).toBe(true)
  })

  it('ne signale pas un évènement par défaut/public/confidentiel comme privé', () => {
    expect(isPrivateAgendaEvent('default')).toBe(false)
    expect(isPrivateAgendaEvent('public')).toBe(false)
    expect(isPrivateAgendaEvent('confidential')).toBe(false)
  })

  it('rend faux sur une valeur absente — un évènement sans visibilité déclarée reste synchronisé', () => {
    expect(isPrivateAgendaEvent(null)).toBe(false)
    expect(isPrivateAgendaEvent(undefined)).toBe(false)
    expect(isPrivateAgendaEvent('')).toBe(false)
  })
})

// Garde non-régression : la fonction existante reste exportée et inchangée.
describe('isExternalAddress', () => {
  it('reste vraie pour un domaine différent', () => {
    expect(isExternalAddress('a@client.com', 'moi@bellum.fr')).toBe(true)
  })
})

describe('maskPrivateAgendaEvent (#2390.16) — seul « indisponible » reste visible', () => {
  const secret: AgendaEvent = {
    id: 'evt-1',
    summary: 'Rendez-vous médecin',
    description: 'Résultats analyses',
    location: '12 rue X',
    start: '2026-10-01T09:00:00Z',
    end: '2026-10-01T10:00:00Z',
    organizer: 'moi@bellum.fr',
    attendees: [{ email: 'dr@clinique.fr', displayName: 'Dr X', responseStatus: 'accepted', external: true }],
    conferenceUrl: 'https://meet.example/abc',
    webUrl: 'https://cal.example/evt-1',
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    visibility: 'private',
    recurring: true,
    providerEventType: 'default',
    showAs: 'busy',
  }

  it('garde le créneau et RIEN d’autre : ni titre, ni lieu, ni invité, ni lien', () => {
    const masked = maskPrivateAgendaEvent(secret)
    expect(masked).toMatchObject({ id: 'evt-1', start: secret.start, end: secret.end, busyOnly: true })
    expect(JSON.stringify(masked)).not.toMatch(/médecin|analyses|rue X|clinique|meet\.example|cal\.example|moi@/)
    expect(masked.attendees).toEqual([])
    expect(masked.isExternal).toBe(false)
  })

  it('garde l’annulation : un créneau libéré ne bloque plus personne', () => {
    expect(maskPrivateAgendaEvent({ ...secret, cancelled: true, status: 'cancelled' }).cancelled).toBe(true)
  })
})

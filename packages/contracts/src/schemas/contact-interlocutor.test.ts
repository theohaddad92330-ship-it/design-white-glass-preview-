import { describe, expect, it } from 'vitest'
import { contactSchema, contactSignalSchema } from './contact.js'
import { contactInterlocutorKind } from './contact-interlocutor.js'

// Théo B c5-fiche-contact.N4 — deux regroupements des rôles existants, aucune donnée nouvelle.
describe('contactInterlocutorKind', () => {
  it.each(['economic', 'technical', 'user', 'sponsor', 'operational'] as const)('%s → interlocuteur métier', role => {
    expect(contactInterlocutorKind(role)).toBe('business')
  })

  it.each(['champion', 'influencer', 'procurement', 'purchasing', 'blocker'] as const)('%s → appui / accès', role => {
    expect(contactInterlocutorKind(role)).toBe('access')
  })

  it('un rôle inconnu ou absent ne fait AUCUN type (jamais deviné)', () => {
    expect(contactInterlocutorKind('unknown')).toBeNull()
    expect(contactInterlocutorKind(null)).toBeNull()
    expect(contactInterlocutorKind(undefined)).toBeNull()
    expect(contactInterlocutorKind('autre')).toBeNull()
  })
})

describe('contrat fiche contact (Théo B c5)', () => {
  it('un signal garde l’URL de sa page d’origine quand on l’a', () => {
    const parsed = contactSignalSchema.parse({ label: 'Nommé DSI', source_url: 'https://www.exemple.fr/a' })
    expect(parsed.source_url).toBe('https://www.exemple.fr/a')
  })

  it('refuse une source_url qui n’est pas une URL http(s)', () => {
    expect(contactSignalSchema.safeParse({ label: 'x', source_url: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('la fiche garde le badge relationnel servi par l’API', () => {
    const shape = contactSchema.shape
    expect(shape.relation_badge).toBeDefined()
  })
})

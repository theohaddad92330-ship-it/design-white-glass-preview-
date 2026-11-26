import { describe, expect, it } from 'vitest'
import { activeMissionRowSchema } from './account-missions.js'
import { setMissionClientManagerSchema } from './mission.js'

/**
 * #2836 — LE MANAGER CLIENT : la personne, CHEZ LE CLIENT, qui encadre le
 * consultant au quotidien. Un contact du compte, jamais un utilisateur interne
 * (le chargé d'affaires, `businessManagerName`, est l'autre moitié du binôme).
 */
describe('#2836 — le manager client', () => {
  const UUID = 'c0000000-0000-4000-8000-000000000001'

  it("l'affectation prend un contact (uuid) ou le retire (null)", () => {
    expect(setMissionClientManagerSchema.parse({ contactId: UUID })).toEqual({ contactId: UUID })
    expect(setMissionClientManagerSchema.parse({ contactId: null })).toEqual({ contactId: null })
  })

  it('refuse un nom libre, un champ inconnu, un corps vide', () => {
    expect(setMissionClientManagerSchema.safeParse({ contactId: 'Julien Dubois' }).success).toBe(false)
    expect(setMissionClientManagerSchema.safeParse({ contactId: UUID, name: 'x' }).success).toBe(false)
    expect(setMissionClientManagerSchema.safeParse({}).success).toBe(false)
  })

  it('le résumé des missions porte le manager client, `null` quand personne', () => {
    const field = activeMissionRowSchema.shape.clientManagerName
    expect(field.parse(null)).toBeNull()
    expect(field.parse('Julien Dubois')).toBe('Julien Dubois')
    // Absent n'est pas « personne » : le champ est OBLIGATOIRE, jamais omis.
    expect(field.safeParse(undefined).success).toBe(false)
  })
})

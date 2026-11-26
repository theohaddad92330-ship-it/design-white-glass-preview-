import { describe, expect, it } from 'vitest'
import { canErasePerson, isContactOwner, PERSON_ERASURE_ADMIN_ROLES } from './person-erasure.js'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('isContactOwner — #2297 effacement', () => {
  it('le porteur de la fiche est celui qui l’a créée OU à qui elle est attribuée', () => {
    expect(isContactOwner({ user_id: ME, assigned_to: null }, ME)).toBe(true)
    expect(isContactOwner({ user_id: OTHER, assigned_to: ME }, ME)).toBe(true)
  })

  it('sait dire NON : une fiche d’un collègue, ou sans porteur connu', () => {
    expect(isContactOwner({ user_id: OTHER, assigned_to: OTHER }, ME)).toBe(false)
    expect(isContactOwner({}, ME)).toBe(false)
    expect(isContactOwner({ user_id: ME }, '')).toBe(false)
  })
})

describe('canErasePerson — #2297 effacement, qui a le droit', () => {
  it('un propriétaire ou un administrateur de l’espace efface n’importe quelle personne', () => {
    for (const role of PERSON_ERASURE_ADMIN_ROLES) {
      expect(canErasePerson({ role, extraPermissions: [], ownsContact: false })).toBe(true)
    }
  })

  it('le porteur de la fiche efface SA fiche, s’il a le droit d’écrire', () => {
    expect(canErasePerson({ role: 'sales', extraPermissions: [], ownsContact: true })).toBe(true)
    expect(canErasePerson({ role: 'member', extraPermissions: [], ownsContact: true })).toBe(true)
  })

  it('sait dire NON : un commercial sur la fiche d’un collègue', () => {
    expect(canErasePerson({ role: 'sales', extraPermissions: [], ownsContact: false })).toBe(false)
    expect(canErasePerson({ role: 'sales_ops', extraPermissions: [], ownsContact: false })).toBe(false)
  })

  it('sait dire NON : un siège en lecture seule, même porteur', () => {
    expect(canErasePerson({ role: 'viewer', extraPermissions: [], ownsContact: true })).toBe(false)
    expect(canErasePerson({ role: 'tech_admin', extraPermissions: [], ownsContact: true })).toBe(false)
  })
})

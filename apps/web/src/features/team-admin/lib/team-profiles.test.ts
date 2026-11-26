import { describe, expect, it } from 'vitest'
import { KNOWN_ROLES, PROFILE_OF_ROLE, RIGHTS_COLUMNS, RIGHTS_MATRIX, TEAM_PROFILES, profileOf } from './team-profiles'

// Théo D team-admin.R5 — sept (neuf) rôles stockés, cinq profils affichés : personne ne perd un droit.
describe('profils de la matrice de droits', () => {
  it('chaque rôle stocké appartient à un profil (la garde échoue si un rôle est ajouté sans profil)', () => {
    expect(KNOWN_ROLES.filter(role => !(role in PROFILE_OF_ROLE))).toEqual([])
    for (const role of KNOWN_ROLES) expect(TEAM_PROFILES).toContain(profileOf(role))
  })

  it('« Membre » se lit « Commercial », « Admin » se lit « Direction / administration »', () => {
    expect(profileOf('member')).toBe('commercial')
    expect(profileOf('admin')).toBe('direction')
    expect(profileOf('owner')).toBe('direction')
  })

  it('la colonne « Conversations privées » ne donne un nouvel accès à aucun profil', () => {
    for (const profile of TEAM_PROFILES) expect(RIGHTS_MATRIX[profile].privateConversations).toBe('noNewAccess')
  })

  it('chaque profil a une réponse pour chaque colonne', () => {
    for (const profile of TEAM_PROFILES) {
      for (const column of RIGHTS_COLUMNS) expect(RIGHTS_MATRIX[profile][column]).toBeTruthy()
    }
  })
})

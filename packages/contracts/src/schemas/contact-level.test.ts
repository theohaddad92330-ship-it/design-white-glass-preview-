import { describe, expect, it } from 'vitest'
import { resolveContactLevel } from './contact-level.js'

/**
 * #2165.35 — le référentiel PARTAGÉ de niveau. Garde « sait dire NON » : un
 * intitulé qui ne porte AUCUN indice ne rend jamais un niveau deviné.
 */
describe('resolveContactLevel', () => {
  it('lit un niveau C-Level depuis un intitulé (DSI)', () => {
    expect(resolveContactLevel({ title: 'DSI' })).toBe('c_level')
    expect(resolveContactLevel({ title: 'Directeur Général' })).toBe('c_level')
  })

  it('lit un niveau N-1 depuis un "Directeur" générique (hors Direction Générale)', () => {
    expect(resolveContactLevel({ title: 'Directeur des Opérations Cloud' })).toBe('n1')
  })

  it('lit N-1 pour un "Head of" et N-2 pour un "Manager"', () => {
    expect(resolveContactLevel({ title: 'Head of Engineering' })).toBe('n1')
    expect(resolveContactLevel({ title: 'Engineering Manager' })).toBe('n2')
  })

  it('retombe sur le rôle décisionnel quand le texte ne dit rien', () => {
    expect(resolveContactLevel({ title: null, decisionRole: 'economic' })).toBe('n1')
    expect(resolveContactLevel({ title: null, decisionRole: 'sponsor' })).toBe('n1')
    expect(resolveContactLevel({ title: null, decisionRole: 'user' })).toBe('n2')
  })

  it("rend null — jamais un niveau deviné — quand rien n'est exploitable", () => {
    expect(resolveContactLevel({ title: null, decisionRole: null })).toBeNull()
    expect(resolveContactLevel({ title: 'Assistant administratif', decisionRole: null })).toBeNull()
  })

  it('applique le raccourci famille "clevel" quand le titre ne se lit pas', () => {
    expect(resolveContactLevel({ title: 'Fonction non renseignée', family: 'C-Level' })).toBe('c_level')
  })
})

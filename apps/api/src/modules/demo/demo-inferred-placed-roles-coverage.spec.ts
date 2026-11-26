import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { effectiveInferredPlacedRoles } from '@bellum/contracts'
import { DEMO_ESN_PROFILE, DEMO_INFERRED_PLACED_ROLES } from './demo-dataset'

/**
 * Métiers placés DÉDUITS en démonstration (décision Louis 11/10/2026, craft
 * rule 9) : l'écran « Mon profil » montre au moins un métier « déduit » avec
 * ses indices, hors des métiers DÉCLARÉS de Bellum Conseil.
 */
describe('démo — métiers placés déduits (11/10)', () => {
  it('la vraie déduction sur le contexte semé rend des métiers, chacun avec ses indices', () => {
    expect(DEMO_INFERRED_PLACED_ROLES.length).toBeGreaterThan(0)
    for (const role of DEMO_INFERRED_PLACED_ROLES) {
      expect(role.evidence.length).toBeGreaterThan(0)
      expect(role.terms.length).toBeGreaterThan(0)
    }
  })

  it('la cybersécurité (expertise + portefeuille) ressort déduite, à côté des métiers déclarés', () => {
    const roles = DEMO_INFERRED_PLACED_ROLES.map(r => r.role)
    expect(roles).toContain('Consultant cybersécurité')
    expect(DEMO_ESN_PROFILE.placed_roles).not.toContain('Consultant cybersécurité')
    // Le déclaré gagne pour le tri : la démo ne pousse aucun déduit à l'IA.
    expect(effectiveInferredPlacedRoles(DEMO_INFERRED_PLACED_ROLES, DEMO_ESN_PROFILE.placed_roles, [])).toEqual([])
  })

  it('la semence écrit bien la colonne (lecture du code de `seedEsnProfile`)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toMatch(/UPDATE esn_profiles SET inferred_placed_roles = \$1::jsonb/)
    expect(seed).toContain('JSON.stringify(DEMO_INFERRED_PLACED_ROLES)')
  })
})

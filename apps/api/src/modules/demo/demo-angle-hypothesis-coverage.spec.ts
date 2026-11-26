import { angleEstimateKind, angleProofState } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4016.L4 — craft rule n°9 : la salle montre les DEUX côtés du badge « hypothèse » sur les angles
 * d'attaque — au moins un angle sans preuve mobilisable (badgé « hypothèse ») ET au moins un angle étayé
 * (sans badge). Une salle où tous les angles seraient badgés, ou aucun, ne montrerait pas la règle.
 */
/** Les angles que le plan LIT : toute liste `angles` du dossier semé (`raw_analysis`, `planViewData`). */
function seededAngles(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) value.forEach(item => seededAngles(item, found))
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'angles' && Array.isArray(child)) found.push(...child)
      else seededAngles(child, found)
    }
  }
  return found
}

describe('Démo — angles d’attaque en hypothèse (#4016.L4)', () => {
  const angles = seededAngles(DEMO_DOSSIERS)

  it('lit quelque chose : des angles sont semés', () => {
    expect(angles.length).toBeGreaterThan(0)
  })

  it('au moins un angle semé est une hypothèse, au moins un est étayé', () => {
    const kinds = angles.map(angle => angleEstimateKind(angleProofState(angle)))
    expect(kinds).toContain('hypothesis')
    expect(kinds).toContain(null)
  })
})

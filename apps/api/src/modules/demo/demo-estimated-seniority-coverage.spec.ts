import { displayedSeniority } from '@bellum/contracts'
import { DEMO_CONSULTANTS } from './demo-dataset'

/**
 * #4016 L4.3 — craft rule n°9 : la séniorité ESTIMÉE (déduite des années) est
 * SEMÉE en démonstration. Un profil du vivier a `inconnu` + des années saisies :
 * l'écran montre la tranche badgée « estimé » ; les autres gardent leur valeur
 * saisie, que l'estimation n'écrase jamais.
 */
describe('Démo — la séniorité estimée est semée (#4016 L4.3)', () => {
  it('au moins un profil a une séniorité inconnue ET des années saisies : la salle montre l’estimation', () => {
    const estimated = DEMO_CONSULTANTS.filter(
      c => displayedSeniority({ seniority: c.seniority, years_experience: c.years_experience }).estimated,
    )
    expect(estimated.length).toBeGreaterThanOrEqual(1)
  })

  it('et au moins un profil garde une séniorité saisie, jamais estimée', () => {
    const typed = DEMO_CONSULTANTS.filter(
      c => !displayedSeniority({ seniority: c.seniority, years_experience: c.years_experience }).estimated,
    )
    expect(typed.length).toBeGreaterThanOrEqual(1)
  })
})

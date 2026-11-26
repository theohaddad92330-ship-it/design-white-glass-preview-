import { DEMO_CRM_NAV_SCREENS } from './demo-crm-nav'
import { DEMO_DELIVERY_CLIENT, DEMO_RFP, DEMO_SG_COMPLETE_LEAD, DEMO_SUBMISSIONS_MIN_TOTAL } from './demo-dataset'

/**
 * #4197 (L6, craft n°9) — les écrans de la navigation Affaires · Talents ·
 * Missions ont de quoi se remplir en salle, et aucun ne porte « (test) ».
 */
describe('démo — Affaires · Talents · Missions', () => {
  it('chaque écran mis en avant a une semence NOMMÉE et non vide', () => {
    for (const screen of DEMO_CRM_NAV_SCREENS) {
      expect(`${screen.route} ${screen.seededBy.trim().length > 0}`).toBe(`${screen.route} true`)
    }
    // #4340 / #4341 / #4349 (Louis 19/10/2026) — les contenus ont changé d'ADRESSE, pas de semence.
    // #4528 (Louis 24/10/2026) — les présentations vivent à UN endroit : Affaires › Présentations.
    expect(DEMO_CRM_NAV_SCREENS.map(screen => screen.route)).toEqual([
      '/projects?pistes=1',
      '/projects?lens=rfp',
      '/projects/presentations',
    ])
  })

  it('au moins une piste détectée est visible dans le panneau des pistes du Pipe (/projects?pistes=1, #4545)', () => {
    expect(DEMO_SG_COMPLETE_LEAD.label.length).toBeGreaterThan(0)
    expect(DEMO_SG_COMPLETE_LEAD.detected_days_ago).toBeGreaterThanOrEqual(0)
  })

  // #4116.5 (recette D3 01/11) — l'appel d'offres public démo se lit « européen » : marqueur UE dans son détail.
  it('#4116.5 — l’appel d’offres public démo porte un marqueur UE visible', () => {
    expect(DEMO_SG_COMPLETE_LEAD.detail).toMatch(/\bUE\b|Union européenne/)
    expect({ ...DEMO_SG_COMPLETE_LEAD, detail: 'Appel d’offres public.' }.detail).not.toMatch(/\bUE\b|Union européenne/)
  })

  it('au moins un appel d’offres est visible dans le pipe (/projects?lens=rfp), titré « (démo) » et jamais « (test) »', () => {
    expect(DEMO_RFP.title).toMatch(/\(démo\)$/)
    expect(DEMO_RFP.title).not.toMatch(/\(test\)/i)
  })

  it('les présentations (/projects/presentations) dépassent une page de liste', () => {
    expect(DEMO_SUBMISSIONS_MIN_TOTAL).toBeGreaterThan(50)
  })

  it('le pipe porte des affaires datées pour le CA probable de Pilotage › Pipe', () => {
    expect(DEMO_DELIVERY_CLIENT.pipelineProjects.length).toBeGreaterThan(0)
  })
})

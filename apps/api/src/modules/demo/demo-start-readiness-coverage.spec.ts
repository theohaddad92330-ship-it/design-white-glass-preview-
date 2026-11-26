import { computeMissionStartReadiness } from '@bellum/contracts'
import { DEMO_CONSULTANTS, DEMO_START_READINESS_MISSION } from './demo-dataset'

/**
 * #2338 / #2409 — PARITÉ DÉMO (craft rule n°9). La mission pas encore démarrée
 * de la salle doit montrer ce que le panneau existe pour montrer : « Accords à
 * confirmer », un verdict « Bloqué » et un manque NOMMÉ — pas une checklist
 * vide, pas une checklist complète.
 */
describe('démo — la mission pas encore démarrée et sa checklist partielle', () => {
  const m = DEMO_START_READINESS_MISSION
  const readiness = computeMissionStartReadiness({
    declared: m.checks.map(c => ({
      key: c.item,
      proof: c.proof,
      confirmedBy: 'owner',
      confirmedAt: new Date(Date.now() - c.confirmed_days_ago * 86_400_000).toISOString(),
    })),
    data: { consultantAssigned: true, startDate: '2099-01-01', dailyRate: m.daily_rate },
    now: new Date(),
  })

  it('est une mission AVANT démarrage, affectée à un talent du vivier', () => {
    expect(['draft', 'onboarding']).toContain(m.status)
    expect(DEMO_CONSULTANTS.map(c => c.full_name)).toContain(m.consultant)
  })

  it('porte « accords à confirmer », verdict bloqué, l’accord du consultant nommé', () => {
    expect(readiness.agreementsPending).toBe(true)
    expect(readiness.verdict).toBe('blocked')
    expect(readiness.missing).toEqual(['consultant_agreement'])
    // partielle : au moins un geste confirmé, avec sa preuve
    expect(readiness.items.filter(i => i.state === 'done' && i.kind === 'declared').length).toBeGreaterThan(0)
  })
})

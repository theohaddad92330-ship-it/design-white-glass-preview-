import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #2783 — PARITÉ DÉMO DES AVENANTS (recette prod 30/09 : « consommation PO et
 * agrégation des avenants à prouver en salle démo »).
 *
 * La ligne « dont avenants » du prévisionnel (`ForecastHorizonsService`) COMPTE
 * les avenants à effet dans l'horizon, accepté/actif séparé de simulé. Sans
 * ligne `mission_amendments` en démo, elle dit « Aucun avenant » : la salle ne
 * montre jamais le croisement avenant × prévisionnel. Cette garde lit le semis.
 */
type SeededAmendment = { event_type: string; status: string; effective_in_days: number; proof: string }

const amendments = DEMO_DELIVERY_CLIENT.missions.flatMap(
  mission => ((mission as { amendments?: SeededAmendment[] }).amendments ?? []) as SeededAmendment[],
)

describe('#2783 — la démo porte des avenants à effet dans l’horizon', () => {
  it('est classée SEMÉE, plus « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('mission_amendments')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('mission_amendments')
  })

  it('un avenant ACCEPTÉ et un SIMULÉ (proposed), séparés par le prévisionnel', () => {
    expect(amendments.some(a => a.status === 'accepted')).toBe(true)
    expect(amendments.some(a => a.status === 'proposed')).toBe(true)
  })

  it('chacun prend effet dans les 90 jours à venir et porte sa preuve', () => {
    for (const a of amendments) {
      expect(a.effective_in_days).toBeGreaterThan(0)
      expect(a.effective_in_days).toBeLessThanOrEqual(90)
      expect(a.proof.trim().length).toBeGreaterThan(0)
    }
  })
})

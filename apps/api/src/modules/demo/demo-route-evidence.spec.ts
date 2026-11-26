import { demoRouteEvidenceOf } from './demo-route-evidence'
import { DEMO_ANALYSED_ACCOUNTS } from './demo-dataset'

// #3278.r42 — la route du plan de Thales cite sa preuve (source + date) et son historique de canal.
describe('demoRouteEvidenceOf — #3278.r42', () => {
  const today = new Date('2026-10-17T10:00:00Z')

  it('Thales : signal motivant, preuve citée avec source et jour, historique de canal — dates relatives au semis', () => {
    const evidence = demoRouteEvidenceOf('Thales', today)
    expect(evidence.motivating_signal).toMatch(/ · .+ · 2026-10-1\d$/)
    expect(evidence.proof_cited).toMatch(/source : .+ · 2026-10-\d{2}$/)
    expect(evidence.channel_history).toMatch(/email ×\d/)
    const later = demoRouteEvidenceOf('Thales', new Date('2026-12-01T10:00:00Z'))
    expect(later.motivating_signal).toMatch(/2026-11-\d{2}$|2026-12-\d{2}$/)
  })

  it('SAIT DIRE NON : un autre compte n’en porte pas', () => {
    expect(demoRouteEvidenceOf('Airbus', today)).toEqual({})
  })

  it('le compte Thales sème la route filiale_site AVEC ces citations dans plan.recommendedRoute', () => {
    const thales = DEMO_ANALYSED_ACCOUNTS.find(account => account.company_name === 'Thales')
    const plan = thales?.raw_analysis['plan'] as { recommendedRoute?: Record<string, string> } | undefined
    expect(plan?.recommendedRoute?.route).toBe('filiale_site')
    expect(plan?.recommendedRoute?.proof_cited).toBeTruthy()
    expect(plan?.recommendedRoute?.channel_history).toBeTruthy()
    expect(plan?.recommendedRoute?.motivating_signal).toBeTruthy()
  })
})

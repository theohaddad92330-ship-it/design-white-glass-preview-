import { signalRecurrenceOf } from '@bellum/contracts'
import { currentSignalFacts } from '../account-facts/account-facts.sources'
import { DEMO_WATCHLIST_RECURRENCE_COVERAGE } from './demo-coverage'
import { orangePublicSignals, resolveOrangeRelativeDates } from './orange-public-complement'

/**
 * #4072.4 (craft rule n°9) — la Watchlist de la démo montre « Ne signal de recrutement en 30 jours » : Orange porte des
 * offres RÉELLES à dates relatives (posées à l'ouverture de la salle). Lu par le MÊME lecteur que la production.
 */
describe('#4072.4 — récurrence d’un signal en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_WATCHLIST_RECURRENCE_COVERAGE.state).toBe('seede')
    expect(DEMO_WATCHLIST_RECURRENCE_COVERAGE.reason).toContain('#4072.4')
  })

  it.each(['2026-10-15', '2026-11-02', '2027-01-20'])(
    'Orange porte une récurrence de recrutement quand la salle ouvre le %s',
    day => {
      const now = Date.parse(`${day}T10:00:00.000Z`)
      const facts = currentSignalFacts(resolveOrangeRelativeDates(orangePublicSignals(), now))
      const recurrence = signalRecurrenceOf(facts, new Date(now))
      expect(recurrence?.kind).toBe('hiring')
      expect(recurrence?.count).toBeGreaterThanOrEqual(2)
    },
  )
})

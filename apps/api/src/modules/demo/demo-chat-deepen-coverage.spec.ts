import { buildDeepenQuote, deepenActionsFor, deepenTargetsFor } from '@bellum/contracts'
import { DEMO_CHAT_DEEPEN_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2452 — « et en démonstration, le devis d'approfondissement est-il rempli ? »
 *
 * Recalculé sur les dossiers RÉELS de la salle, avec les colonnes que
 * `DemoSeedService` leur écrit (dossier terminé, organigramme et stratégie
 * datés de quelques jours) : chaque action proposée rend des lignes et un coût
 * supplémentaire. Une classification affirme ; ce spec calcule.
 */
const DAY = 24 * 60 * 60 * 1000

function seededStates(now: Date) {
  return DEMO_DOSSIERS.map((dossier, index) => ({
    accountId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: dossier.account.company_name,
    hasDossier: true,
    invested: 0,
    freshness: {
      signals: null,
      contacts: null,
      entities: new Date(now.getTime() - 6 * DAY).toISOString(),
      strategy: new Date(now.getTime() - 4 * DAY).toISOString(),
    },
  }))
}

describe('DEMO_CHAT_DEEPEN_COVERAGE (#2452)', () => {
  const now = new Date('2026-09-22T20:00:00.000Z')
  const states = seededStates(now)

  it('la salle a des dossiers à approfondir', () => {
    expect(DEMO_CHAT_DEEPEN_COVERAGE.state).toBe('seede')
    expect(states.length).toBeGreaterThan(0)
  })

  it.each(deepenActionsFor(2))('« %s » rend un devis rempli sur chaque dossier de la salle', action => {
    for (const state of states) {
      const quote = buildDeepenQuote({
        targets: deepenTargetsFor(action, [state.accountId]),
        accounts: states,
        remaining: 10,
        now,
      })
      expect(quote.lines.length).toBeGreaterThan(0)
      expect(quote.delta).toBeGreaterThan(0)
      // Grand livre vide en démo : rien de « déjà investi » à afficher, jamais un zéro inventé.
      expect(quote.alreadyInvested).toBe(0)
    }
  })

  it('sait dire NON : un dossier non terminé ne se devise pas', () => {
    const quote = buildDeepenQuote({
      targets: deepenTargetsFor('verify_now', [states[0]!.accountId]),
      accounts: [{ ...states[0]!, hasDossier: false }],
      remaining: 10,
      now,
    })
    expect(quote.delta).toBe(0)
  })
})

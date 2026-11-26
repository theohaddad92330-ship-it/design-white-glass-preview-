import { ACCOUNT_SCORE_PRUDENT_MIN } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3420 (lot X80) — un compte NON ARBITRÉ (porte `pending`) ne porte pas le verdict « NO-GO » :
 * Groupe BPCE l'affichait face à une route « partenaire » recommandée.
 */
describe('verdict des comptes de la salle', () => {
  it('un dossier non arbitré n’est jamais sous le palier prudent (jamais « NO-GO »)', () => {
    const pending = DEMO_DOSSIERS.filter(d => d.account.priority_gate === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    for (const dossier of pending) {
      expect(dossier.account.priority_score).toBeGreaterThanOrEqual(ACCOUNT_SCORE_PRUDENT_MIN)
    }
  })
})

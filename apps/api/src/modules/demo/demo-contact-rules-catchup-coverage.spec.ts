import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CONTACT_RULES_CATCHUP_COVERAGE } from './demo-coverage'

// LUDOVIC-C LC.1 — le bandeau de remise aux règles est vide à dessein en démo, et le DIT.
describe('LC.1 — couverture démo de la remise des contacts aux règles actuelles', () => {
  it('est classée vide à dessein avec sa raison', () => {
    expect(DEMO_CONTACT_RULES_CATCHUP_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CONTACT_RULES_CATCHUP_COVERAGE.reason).toContain('LC.1')
  })
  it('le bandeau se tait réellement en démo (la garde lit le composant)', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../../web/src/features/accounts/view/account-detail/tabs/contacts/ContactsRulesCatchupNotice.tsx',
      ),
      'utf8',
    )
    expect(source).toMatch(/if \(isDemo\) return null/)
  })
})

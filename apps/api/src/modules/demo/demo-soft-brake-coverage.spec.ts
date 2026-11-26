import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_SOFT_BRAKE_COVERAGE } from './demo-coverage'

/**
 * #4464.5 — la garde qui LIT la raison du « vide à dessein » du frein doux : la démo ne s'épuise pas parce que le
 * débit court-circuite `isDemo`. Elle lit `credits.service.ts` sur le disque, jamais une copie collée ici (GA-26).
 */
export function demoNeverDebits(source: string): boolean {
  const consume = source.indexOf('async consumeEnrichmentCredit(')
  if (consume === -1) return false
  const body = source.slice(consume, consume + 4000)
  return /isDemo/.test(body) && /\bisDemo\s*\)\s*(?:\{|return)|isDemo\s*\?/.test(body)
}

describe('#4464.5 — le frein doux est vide à dessein en démo, pour la bonne raison', () => {
  const service = readFileSync(join(__dirname, '..', 'credits', 'credits.service.ts'), 'utf8')

  it('lit le vrai service de crédits : une salle de démo ne débite pas', () => {
    expect(service.length).toBeGreaterThan(20_000)
    expect(demoNeverDebits(service)).toBe(true)
  })

  it('classe le frein doux « vide à dessein » avec sa raison écrite', () => {
    expect(DEMO_SOFT_BRAKE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_SOFT_BRAKE_COVERAGE.reason).toMatch(/ne débite jamais/)
  })

  it('sait dire NON : un débit sans court-circuit démo rougit', () => {
    expect(demoNeverDebits('async consumeEnrichmentCredit(userId) { return this.debit(userId) }')).toBe(false)
    expect(demoNeverDebits('rien du tout')).toBe(false)
  })
})

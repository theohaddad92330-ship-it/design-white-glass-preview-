import { CRITERIA_WIDEN_MIN_RESULTS, criteriaWideningSchema, discoverResponseSchema } from '@bellum/contracts'
import { DEMO_CRITERIA_WIDENING_COVERAGE } from './demo-coverage'
import { withDemoWidening } from './demo-criteria-widening'
import { demoSkillSearchResponse } from './demo-discover-skill'

/**
 * #4433 (épopée, Louis 21/10) — craft rule n°9 : l'élargissement par paliers se voit en salle. « React » rend les
 * comptes exacts fictifs, puis deux comptes fictifs « proche : JavaScript », et la réponse DIT l'élargissement
 * (`query.widening`). « Revenir au strict » le retire.
 */
describe('#4433 — l’élargissement par paliers en démo', () => {
  it('est classé seedé, avec son appelant', () => {
    expect(DEMO_CRITERIA_WIDENING_COVERAGE.state).toBe('seede')
    expect(DEMO_CRITERIA_WIDENING_COVERAGE.reason).toContain('demo-criteria-widening-coverage.spec.ts')
  })

  it('« React » : l’exact en tête, puis des comptes « proche : JavaScript » étiquetés — contrat respecté', () => {
    const response = discoverResponseSchema.parse(
      withDemoWidening(demoSkillSearchResponse({ keywords: ['React'] }), { keywords: ['React'] }, false),
    )
    const widened = response.candidates.filter(c => c.widenedBy)
    expect(widened.length).toBeGreaterThan(0)
    expect(widened.every(c => c.widenedBy?.axis === 'skill' && c.widenedBy.code === 'javascript')).toBe(true)
    expect(widened.every(c => c.skillEvidence?.skill === 'JavaScript')).toBe(true)
    const firstWidened = response.candidates.findIndex(c => c.widenedBy)
    expect(response.candidates.slice(0, firstWidened).every(c => !c.widenedBy)).toBe(true)
    const widening = criteriaWideningSchema.parse(response.query.widening)
    expect(widening.minResults).toBe(CRITERIA_WIDEN_MIN_RESULTS)
    expect(widening.steps[0]?.codes).toEqual(['javascript'])
  })

  it('sait dire NON : en strict, rien n’est élargi ; une compétence inconnue tombe au domaine (#4433.2)', () => {
    const strict = withDemoWidening(demoSkillSearchResponse({ keywords: ['React'] }), { keywords: ['React'] }, true)
    expect(strict?.candidates.some(c => c.widenedBy)).toBe(false)
    expect(strict?.query.widening).toBeUndefined()
    const unknown = withDemoWidening(demoSkillSearchResponse({ keywords: ['Zephyr'] }), { keywords: ['Zephyr'] }, false)
    expect((unknown?.query.widening as { steps: unknown[] } | undefined)?.steps[0]).toMatchObject({
      axis: 'skill',
      tier: 2,
      codes: ['web'],
    })
    expect(withDemoWidening(null, {}, false)).toBeNull()
  })
})

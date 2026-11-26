import { describe, expect, it } from 'vitest'
import { diagnoseNeeds } from '../../../../tools/ci/ci-status.mjs'

const CI = `jobs:
  test-ia:
    name: Test (IA / Python)
    timeout-minutes: 30
    steps: []
  build:
    name: Build
    timeout-minutes: 15
    steps: []
`

describe('CI Status — nomme le job annulé ou rouge', () => {
  // #4869.2 — un cancelled par plafond se diagnostique : le job coupé est NOMMÉ avec son plafond.
  it('nomme un job annulé et son plafond timeout-minutes', () => {
    const d = diagnoseNeeds({ 'test-ia': { result: 'cancelled' }, build: { result: 'success' } }, CI)
    expect(d.cancelled).toEqual(['test-ia'])
    expect(d.lines.join('\n')).toContain('Test (IA / Python)')
    expect(d.lines.join('\n')).toContain('timeout-minutes: 30')
  })
  it('nomme un job rouge sans le confondre avec un annulé', () => {
    const d = diagnoseNeeds({ build: { result: 'failure' } }, CI)
    expect(d.failed).toEqual(['build'])
    expect(d.cancelled).toEqual([])
  })
  it('ne dit rien quand tout est vert ou sauté', () => {
    const d = diagnoseNeeds({ build: { result: 'success' }, 'test-ia': { result: 'skipped' } }, CI)
    expect(d.lines).toEqual([])
  })
  it('nomme quand même un job annulé dont le plafond est introuvable', () => {
    const d = diagnoseNeeds({ inconnu: { result: 'cancelled' } }, CI)
    expect(d.cancelled).toEqual(['inconnu'])
    expect(d.lines.join('\n')).toContain('inconnu')
  })
})

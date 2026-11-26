import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #3993 — les hypothèses qualifiées sont une section normale (à gauche, pleine
// colonne de lecture), pas une carte de 340 px coincée dans l'aside de droite.
describe('TabSignal — place des hypothèses qualifiées (#3993)', () => {
  const source = readFileSync(join(__dirname, 'TabSignal.tsx'), 'utf8')
  it('ne rend pas WatchHypothesesPanel dans <aside>', () => {
    const aside = source.slice(source.indexOf('<aside'), source.indexOf('</aside>'))
    expect(aside).not.toContain('<WatchHypothesesPanel')
    expect(source).toContain('<WatchHypothesesPanel')
  })
})

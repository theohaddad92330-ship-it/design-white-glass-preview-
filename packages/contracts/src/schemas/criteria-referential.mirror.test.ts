import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { criteriaReferentialMirror } from './criteria-referential.js'

/**
 * #4433 — le service IA lit le référentiel des critères depuis un MIROIR GÉNÉRÉ, jamais une seconde liste tenue
 * à la main. Cette garde compare le JSON commité à ce que le module TS produit, octet pour octet.
 * Régénérer : `UPDATE_CRITERIA_MIRROR=1 npx vitest run src/schemas/criteria-referential.mirror.test.ts`.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoRoot(): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, 'apps/ia/app/knowledge'))) return current
    current = dirname(current)
  }
  throw new Error(`apps/ia/app/knowledge introuvable en remontant depuis ${_here}`)
}

const MIRROR = join(monorepoRoot(), 'apps/ia/app/knowledge/criteria_referential.json')
const expected = `${JSON.stringify(criteriaReferentialMirror(), null, 2)}\n`

describe('#4433 — le miroir IA du référentiel des critères est GÉNÉRÉ', () => {
  it('le JSON commité est exactement celui du module TS', () => {
    if (process.env.UPDATE_CRITERIA_MIRROR === '1') writeFileSync(MIRROR, expected)
    expect(existsSync(MIRROR), `miroir absent : ${MIRROR}`).toBe(true)
    expect(readFileSync(MIRROR, 'utf8')).toBe(expected)
  })

  it('LIT vraiment le miroir (sinon la garde est borgne)', () => {
    const parsed = JSON.parse(readFileSync(MIRROR, 'utf8')) as { skills: Record<string, unknown>; minResults: number }
    expect(Object.keys(parsed.skills).length).toBeGreaterThanOrEqual(60)
    expect(parsed.minResults).toBe(25)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Garde #4554 — `multer` et `body-parser` sont des dépendances TRANSITIVES de
 * NestJS (platform-express) : aucun manifeste ne les déclare, seule une
 * override du `package.json` racine les maintient au correctif. Une override
 * retirée en silence ramène la faille high au prochain `pnpm install`.
 */

const REQUIRED_FLOORS: Readonly<Record<string, readonly [number, number, number]>> = {
  multer: [2, 5, 0],
  'body-parser': [2, 4, 0],
}

type RootManifest = { pnpm?: { overrides?: Record<string, string> } }

function findOverrideViolations(manifest: RootManifest): string[] {
  const overrides = manifest.pnpm?.overrides ?? {}
  const violations: string[] = []
  for (const [pkg, floor] of Object.entries(REQUIRED_FLOORS)) {
    const entry = Object.entries(overrides).find(([key]) => key.startsWith(`${pkg}@`))
    if (!entry) {
      violations.push(`${pkg} : override absente de pnpm.overrides`)
      continue
    }
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(entry[1])
    const got = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
    const below = got[0] !== floor[0] ? got[0] < floor[0] : got[1] !== floor[1] ? got[1] < floor[1] : got[2] < floor[2]
    if (below) violations.push(`${pkg} : override ${entry[1]} sous le correctif ${floor.join('.')}`)
  }
  return violations
}

describe('pnpm.overrides garde multer et body-parser au correctif (#4554)', () => {
  it('le package.json racine épingle les deux', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '../../../../package.json'), 'utf8')) as RootManifest
    expect(findOverrideViolations(manifest)).toEqual([])
  })

  it('sait dire NON : override retirée ou trop basse', () => {
    expect(findOverrideViolations({})).toHaveLength(2)
    expect(
      findOverrideViolations({ pnpm: { overrides: { 'multer@<2.5.0': '^2.4.0', 'body-parser@<2.4.0': '^2.4.0' } } }),
    ).toEqual(['multer : override ^2.4.0 sous le correctif 2.5.0'])
  })
})

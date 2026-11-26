import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
const DOC = 'agent_docs/migration-routes-golden-journeys.md'

/**
 * #2958.32-.63, .70 / #2154.26 — la liste des golden journeys de la migration de routes : chacun a son
 * spec E2E (un fichier qui EXISTE) ou sa raison écrite. Une ligne sans l'un ni l'autre fait échouer la CI.
 */
describe('#2958.32-.63 — golden journeys : un spec existant ou une raison, jamais un silence', () => {
  const source = readFileSync(join(REPO_ROOT, DOC), 'utf8')
  const rows = source.split('\n').filter(line => /^\| GJ ?\d+ /.test(line))

  it('liste les trente-deux golden journeys 1 à 32, plus le 37 (démo) et le 39 (reprise de job)', () => {
    const numbers = rows.map(row => Number(/^\| GJ ?(\d+) /.exec(row)?.[1]))
    const expected = [...Array.from({ length: 32 }, (_, i) => i + 1), 37, 39]
    expect(numbers).toEqual(expected)
  })

  it('chaque ligne cite un spec qui EXISTE, ou une raison écrite', () => {
    const bad: string[] = []
    for (const row of rows) {
      const cells = row.split('|').map(cell => cell.trim())
      const specCell = cells[3] ?? ''
      const reasonCell = cells[4] ?? ''
      const specs = [...specCell.matchAll(/`([^`]+\.spec\.ts)`/g)].map(match => match[1] as string)
      if (specs.length > 0) {
        for (const spec of specs) if (!existsSync(join(REPO_ROOT, spec))) bad.push(`${cells[1]} → ${spec} introuvable`)
      } else if (reasonCell.length < 30) {
        bad.push(`${cells[1]} : ni spec ni raison`)
      }
    }
    expect(bad).toEqual([])
  })

  it('le spec « démo » (#2154.26 / golden journey 37) est CONFIRMÉ : il existe et prouve la sortie de démo', () => {
    const demo = rows.find(row => row.startsWith('| GJ 37 '))
    expect(demo).toContain('golden-journey-demo-mode.spec.ts')
    const spec = readFileSync(join(REPO_ROOT, 'e2e/tests/web/golden-journey-demo-mode.spec.ts'), 'utf8')
    expect(spec).toMatch(/Mode démo/)
    expect(spec).toMatch(/\/login/)
  })

  it('la garde sait dire NON — un spec inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'e2e/tests/web/golden-journey-qui-nexiste-pas.spec.ts'))).toBe(false)
  })
})

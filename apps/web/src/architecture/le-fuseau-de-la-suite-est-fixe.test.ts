/**
 * perf(web) — le fuseau de la suite est fixé UNE fois, pas muté en cours de test.
 *
 * Les projets DOM tournent en pool `threads` (voir `vitest.config.ts`). Dans ce
 * pool, les fichiers d'un worker partagent le process : Node met le fuseau en
 * cache à la première `Date`, et un `process.env.TZ = …` posé dans un test
 * n'a plus d'effet — le test passe ou rougit selon ce qui a tourné avant lui.
 * C'est la cause qui avait fait refuser `threads` le 16/09/2026.
 *
 * Règle : un fichier de test qui écrit `process.env.TZ` pour AUTRE chose que
 * `SUITE_TIME_ZONE` doit être dans `SUITES_NEEDING_OWN_PROCESS` (pool `forks`,
 * un process par fichier). Lu sur le disque, comme GA-286.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SUITES_NEEDING_OWN_PROCESS, SUITE_TIME_ZONE } from '../test/projects'

const WEB_ROOT = resolve(__dirname, '../..')

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else found.push(relative(WEB_ROOT, full).split('\\').join('/'))
  }
  return found
}

const suites = walk(join(WEB_ROOT, 'src')).filter(file => /\.test\.tsx?$/.test(file))
const THIS_FILE = 'src/architecture/le-fuseau-de-la-suite-est-fixe.test.ts'

/** Les valeurs affectées à `process.env.TZ` dans un fichier (`= 'x'`, pas `==`). */
function assignedZones(source: string): string[] {
  return [...source.matchAll(/process\.env\.TZ\s*=(?!=)\s*([^\n;]+)/g)].map(match => match[1]!.trim())
}

describe('le fuseau de la suite est fixé une fois', () => {
  it('lit un corpus réel', () => {
    expect(suites.length).toBeGreaterThan(1000)
  })

  it('le fuseau de la suite est posé dans l’environnement du process de test', () => {
    // La config l'écrit avant le démarrage des workers, qui en héritent.
    expect(process.env.TZ).toBe(SUITE_TIME_ZONE)
    expect(new Date('2026-07-01T12:00:00Z').getTimezoneOffset()).toBe(-120)
  })

  it('aucune suite hors « process à part » ne mute un autre fuseau', () => {
    const offenders = suites
      .filter(file => file !== THIS_FILE && !SUITES_NEEDING_OWN_PROCESS.includes(file))
      .filter(file =>
        assignedZones(readFileSync(join(WEB_ROOT, file), 'utf8')).some(
          zone => zone.replace(/^['"`]|['"`]$/g, '') !== SUITE_TIME_ZONE,
        ),
      )
    expect(offenders).toEqual([])
  })

  it('chaque suite « process à part » existe encore et mute bien le fuseau', () => {
    for (const file of SUITES_NEEDING_OWN_PROCESS) {
      expect(existsSync(join(WEB_ROOT, file))).toBe(true)
      expect(assignedZones(readFileSync(join(WEB_ROOT, file), 'utf8')).length).toBeGreaterThan(0)
    }
  })

  it('sait dire NON — un fuseau muté hors liste serait vu', () => {
    expect(assignedZones("process.env.TZ = 'America/Toronto'")).toEqual(["'America/Toronto'"])
    expect(assignedZones('if (process.env.TZ === undefined) {}')).toEqual([])
  })
})

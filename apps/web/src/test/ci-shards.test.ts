import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DURATIONS_FILE,
  WEB_ROOT,
  durationsFromVitestReport,
  filesSelectedBy,
  listWebTestFiles,
  medianDuration,
  planShards,
  readDurations,
  resolveDurations,
} from '../../../../tools/ci/shard-by-duration.mjs'
import { ALL_SUITES_INCLUDE, matchesGlob } from './projects'

/**
 * La répartition des tests web par DURÉE (`tools/ci/shard-by-duration.mjs`,
 * appelée par le job `Test (Web)` de `.github/workflows/ci.yml`).
 *
 * Ce qu'elle ne doit jamais faire : perdre un fichier. Un fichier qui ne tombe
 * dans aucun paquet ne tourne plus jamais, et rien ne rougit. On vérifie donc
 * sur le DISQUE réel, et avec la règle de filtre de vitest (sous-chaîne du
 * chemin), que l'union des paquets est exactement la suite.
 */

/** Liste indépendante du script : le disque, filtré par les motifs de `projects.ts`. */
function testFilesOnDisk(): string[] {
  // Les racines viennent des motifs eux-mêmes (`src/**`, `vite-plugins/**`) :
  // parcourir tout `apps/web` traverserait `node_modules` pour rien.
  const roots = [...new Set(ALL_SUITES_INCLUDE.map(pattern => pattern.split('/')[0] ?? ''))]
  const entries = roots.flatMap(root => {
    try {
      return readdirSync(join(WEB_ROOT, root), { recursive: true, encoding: 'utf8' }).map(e => `${root}/${e}`)
    } catch {
      return []
    }
  })
  return entries
    .map(entry => entry.split('\\').join('/'))
    .filter(rel => !/(^|\/)(node_modules|dist)\//.test(rel))
    .filter(rel => ALL_SUITES_INCLUDE.some(pattern => matchesGlob(rel, pattern)))
    .sort()
}

/** Le nombre de paquets que le workflow demande, lu dans le workflow lui-même. */
function webShardCountInWorkflow(): number {
  const ci = readFileSync(join(WEB_ROOT, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8')
  const job = ci.slice(ci.indexOf('\n  test-web:'))
  const matrix = /shard:\s*\[([^\]]*)\]/.exec(job)?.[1] ?? ''
  const call = /shard-by-duration\.mjs --shard \$\{\{ matrix\.shard \}\}\/(\d+)/.exec(job)
  expect(call, 'le job Test (Web) passe par shard-by-duration.mjs').not.toBeNull()
  const count = Number(call?.[1])
  expect(matrix.split(',').map(s => Number(s.trim()))).toEqual(Array.from({ length: count }, (_, i) => i + 1))
  return count
}

describe('répartition des tests web par durée', () => {
  const all = listWebTestFiles()

  it('le script voit exactement les fichiers que la configuration vitest inclut', () => {
    expect(all.length).toBeGreaterThan(1000)
    expect(all).toEqual(testFilesOnDisk())
  })

  it('les paquets du workflow couvrent TOUTE la suite, sans doublon (règle de filtre de vitest)', () => {
    const count = webShardCountInWorkflow()
    const shards = planShards(all, readDurations(), count)
    const selected = shards.flatMap(shard => filesSelectedBy(all, shard.files))
    expect(selected.length).toBe(all.length)
    expect([...selected].sort()).toEqual(all)
    for (const shard of shards) expect(shard.files.length).toBeGreaterThan(0)
  })

  it('reste complet quel que soit le nombre de paquets', () => {
    for (const count of [1, 2, 5, 8]) {
      const selected = planShards(all, readDurations(), count).flatMap(s => filesSelectedBy(all, s.files))
      expect([...selected].sort()).toEqual(all)
    }
  })

  it('sait dire NON : un fichier dont le chemin en contient un autre part avec lui', () => {
    const files = ['src/a.test.ts', 'src/a.test.tsx', 'src/b.test.ts', 'src/c.test.ts']
    // Durées choisies pour que le glouton sépare `a.test.ts` de `a.test.tsx`
    // s'il ne les groupait pas.
    const durations = { 'src/a.test.ts': 9000, 'src/a.test.tsx': 9000, 'src/b.test.ts': 1, 'src/c.test.ts': 1 }
    const shards = planShards(files, durations, 2, 0)
    const withA = shards.find(s => s.files.includes('src/a.test.ts'))
    expect(withA?.files).toContain('src/a.test.tsx')
    // Et la vérification elle-même voit un doublon quand il existe.
    expect(filesSelectedBy(files, ['src/a.test.ts'])).toEqual(['src/a.test.ts', 'src/a.test.tsx'])
  })

  it('équilibre par durée, et un fichier jamais mesuré pèse la MÉDIANE (#B2 ci/1-caches)', () => {
    const files = ['src/lourd.test.ts', 'src/m1.test.ts', 'src/m2.test.ts', 'src/n1.test.ts', 'src/n2.test.ts']
    const durations = { 'src/lourd.test.ts': 10_000, 'src/m1.test.ts': 5_000, 'src/m2.test.ts': 5_000 }
    expect(medianDuration(files, durations)).toBe(5_000)
    const [first, second] = planShards(files, durations, 2, 0)
    // lourd (10 000) + un fichier de 5 000 d’un côté, trois fichiers de 5 000 de l’autre.
    expect(first?.loadMs).toBe(second?.loadMs)
    expect([...(first?.files ?? []), ...(second?.files ?? [])].sort()).toEqual([...files].sort())
    // Chaque paquet porte 15 000 (10 000 + 4 × 5 000) : les deux inconnus ont bien pesé 5 000, ils n'ont pas été comptés pour 0.
    expect(first?.loadMs).toBe(15_000)
  })

  it('préfère le fichier de durées frais, retombe sur le commité s’il est vide ou absent', () => {
    const missing = join(WEB_ROOT, 'src/__absent__/durations.json')
    expect(resolveDurations(missing).source).toBe(DURATIONS_FILE)
    expect(resolveDurations(undefined).source).toBe(DURATIONS_FILE)
    const fresh = join(tmpdir(), `durations-${process.pid}.json`)
    writeFileSync(fresh, JSON.stringify({ 'src/a.test.ts': 1 }))
    try {
      expect(resolveDurations(fresh)).toEqual({ durations: { 'src/a.test.ts': 1 }, source: fresh })
    } finally {
      rmSync(fresh, { force: true })
    }
  })

  it('relit un rapport JSON de vitest en durées par fichier', () => {
    const report = {
      testResults: [
        { name: join(WEB_ROOT, 'src/z.test.ts'), startTime: 1000, endTime: 3449 },
        { name: join(WEB_ROOT, 'src/a.test.tsx'), startTime: 0, endTime: 120 },
      ],
    }
    const durations = durationsFromVitestReport(report)
    expect(durations).toEqual({ 'src/a.test.tsx': 100, 'src/z.test.ts': 2400 })
    expect(Object.keys(durations)).toEqual(['src/a.test.tsx', 'src/z.test.ts'])
  })
})

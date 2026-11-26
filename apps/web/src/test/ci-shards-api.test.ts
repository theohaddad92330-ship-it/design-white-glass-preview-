import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { API_REPORT_PREFIX, latestRunArtifacts, mergeReports } from '../../../../tools/ci/fetch-durations.mjs'
import {
  API_ROOT,
  NO_DURATIONS_EXIT,
  filesSelectedBy,
  listApiTestFiles,
  planShards,
} from '../../../../tools/ci/shard-by-duration.mjs'
import { shardFiles, shardFilesByDuration } from '../../../../tools/ci/test-changed.mjs'

/**
 * `Test (API)` découpé par DURÉE (ci/shards-api-par-duree) : run 41606062617, shards de 28,7 à 45,2 min
 * pour 139 fichiers chacun. Mêmes garanties que le web : aucun fichier perdu ni doublon, repli
 * déterministe quand les durées manquent.
 */

const REPO = join(API_ROOT, '..', '..')
const CI = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8')

describe('découpage de Test (API) par durée', () => {
  const all = listApiTestFiles()

  it('voit les specs de apps/api, chemins relatifs à apps/api', () => {
    expect(all.length).toBeGreaterThan(1000)
    expect(all.every(f => f.startsWith('src/') && f.endsWith('.spec.ts'))).toBe(true)
  })

  it('couvre toute la suite sans doublon, quelles que soient les durées', () => {
    const durations = Object.fromEntries(all.slice(0, 300).map((f, i) => [f, (i % 7) * 9000 + 500]))
    for (const count of [1, 6, 8]) {
      const selected = planShards(all, durations, count, 0).flatMap(s => filesSelectedBy(all, s.files))
      expect([...selected].sort()).toEqual(all)
    }
  })

  it('équilibre mieux que le rang sur des durées en grappe (le cas du run 41606062617)', () => {
    const files = Array.from({ length: 60 }, (_, i) => `src/m/f${String(i).padStart(2, '0')}.spec.ts`)
    // Les 12 plus lourds sont consécutifs : le rang (i % 6) les répartit à peu près, pas parfaitement.
    const durations: Record<string, number> = Object.fromEntries(
      files.map((f, i) => [f, i < 12 ? 60_000 + i * 5_000 : 1_000]),
    )
    const span = (loads: number[]) => Math.max(...loads) / Math.min(...loads)
    const byRank = Array.from({ length: 6 }, (_, k) =>
      shardFiles(files, k + 1, 6).reduce((s: number, f: string) => s + (durations[f] ?? 0), 0),
    )
    const byDuration = planShards(files, durations, 6, 0).map(s => s.loadMs)
    expect(span(byDuration)).toBeLessThanOrEqual(span(byRank))
    expect(span(byDuration)).toBeLessThan(1.1)
  })

  it('shardFilesByDuration : sans durées, ou fichier absent/vide, rend le rang (repli déterministe)', () => {
    const files = ['apps/api/src/a.spec.ts', 'apps/api/src/b.spec.ts', 'apps/api/src/c.spec.ts']
    const dir = mkdtempSync(join(tmpdir(), 'api-dur-'))
    try {
      const empty = join(dir, 'vide.json')
      writeFileSync(empty, '{}')
      for (const file of ['', join(dir, 'absent.json'), empty])
        expect(shardFilesByDuration(files, 2, 2, file, 'apps/api/')).toEqual(shardFiles(files, 2, 2))
      const real = join(dir, 'd.json')
      writeFileSync(real, JSON.stringify({ 'src/a.spec.ts': 9000, 'src/b.spec.ts': 1000, 'src/c.spec.ts': 1000 }))
      expect(shardFilesByDuration(files, 1, 2, real, 'apps/api/')).toEqual(['apps/api/src/a.spec.ts'])
      expect(shardFilesByDuration(files, 2, 2, real, 'apps/api/')).toEqual([
        'apps/api/src/b.spec.ts',
        'apps/api/src/c.spec.ts',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('le CLI sans durées sort en code 3 et ne rend rien sur stdout (le workflow retombe sur jest --shard)', () => {
    const run = spawnSync(
      'node',
      [
        join(REPO, 'tools/ci/shard-by-duration.mjs'),
        '--suite',
        'api',
        '--shard',
        '1/6',
        '--durations',
        '/nulle/part.json',
      ],
      { encoding: 'utf8', env: { ...process.env, CI_API_DURATIONS_FILE: '' } },
    )
    expect(run.status).toBe(NO_DURATIONS_EXIT)
    expect(run.stdout).toBe('')
  })

  it('lit les rapports jest `api-test-report-*` et ignore ceux du web', () => {
    const artifacts = [
      { name: 'web-test-report-1', created_at: '2026-11-03T02:00:00Z', workflow_run: { id: 2, head_branch: 'main' } },
      { name: 'api-test-report-1', created_at: '2026-11-03T01:00:00Z', workflow_run: { id: 1, head_branch: 'main' } },
    ]
    expect(latestRunArtifacts(artifacts, 'main', API_REPORT_PREFIX).map(a => a.name)).toEqual(['api-test-report-1'])
    const merged = mergeReports(
      [{ testResults: [{ name: join(API_ROOT, 'src/z.spec.ts'), startTime: 0, endTime: 4000 }] }],
      API_ROOT,
    )
    expect(merged).toEqual({ 'src/z.spec.ts': 4000 })
  })
})

describe('Test (API) dans ci.yml', () => {
  const job = CI.slice(CI.indexOf('\n  test:\n'), CI.indexOf('\n  test-web:'))

  it('découpe par durée avec repli, et garde le découpage jest quand les durées manquent', () => {
    expect(job).toContain('fetch-durations.mjs --suite api')
    expect(job).toContain('shard-by-duration.mjs --suite api --shard ${{ matrix.shard }}/6')
    expect(job).toContain('--durations "$durations"')
    expect(job).toContain('npx jest --listTests --shard=${{ matrix.shard }}/6')
    expect(job).toContain('CI_DURATIONS_FRAICHES')
  })

  it('le nombre de shards est inchangé (6) et la matrice est cohérente', () => {
    expect(
      /shard:\s*\[([^\]]*)\]/
        .exec(job)?.[1]
        ?.split(',')
        .map(s => Number(s.trim())),
    ).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('garde-shard reçoit le nombre de fichiers réellement donné au shard', () => {
    expect(job).toMatch(/garde-shard\.sh .*"\$\{#files\[@\]\}"/)
  })
})

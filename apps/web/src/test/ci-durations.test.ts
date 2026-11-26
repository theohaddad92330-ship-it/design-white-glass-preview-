import { describe, expect, it } from 'vitest'

import {
  fetchLatestDurations,
  latestRunArtifacts,
  mergeReports,
  pruneToExisting,
} from '../../../../tools/ci/fetch-durations.mjs'
import { WEB_ROOT } from '../../../../tools/ci/shard-by-duration.mjs'

/**
 * Durées par fichier du dernier run complet de main (`tools/ci/fetch-durations.mjs`, lot B2 ci/1-caches).
 * Le repli sur le fichier commité est testé dans `ci-shards.test.ts` (`resolveDurations`).
 */

const artifact = (id: number, runId: number, branch: string, createdAt: string, expired = false) => ({
  name: `web-test-report-${id}`,
  expired,
  created_at: createdAt,
  archive_download_url: `https://api.example/zip/${runId}-${id}`,
  workflow_run: { id: runId, head_branch: branch },
})

describe('latestRunArtifacts', () => {
  it('ne garde que les rapports du DERNIER run de la branche, jamais ceux d’une PR ni d’un run plus ancien', () => {
    const picked = latestRunArtifacts([
      artifact(1, 10, 'main', '2026-10-30T01:00:00Z'),
      artifact(2, 10, 'main', '2026-10-30T01:01:00Z'),
      artifact(1, 11, 'main', '2026-10-31T01:00:00Z'),
      artifact(2, 11, 'main', '2026-10-31T01:01:00Z'),
      artifact(1, 12, 'feat/x', '2026-10-31T09:00:00Z'),
    ])
    expect(picked.map(a => a.archive_download_url).sort()).toEqual([
      'https://api.example/zip/11-1',
      'https://api.example/zip/11-2',
    ])
  })

  it('ignore les artefacts expirés et ceux qui ne sont pas des rapports', () => {
    expect(latestRunArtifacts([artifact(1, 11, 'main', '2026-10-31T01:00:00Z', true)])).toEqual([])
    expect(latestRunArtifacts([{ ...artifact(1, 11, 'main', '2026-10-31T01:00:00Z'), name: 'autre' }])).toEqual([])
  })
})

describe('mergeReports / pruneToExisting', () => {
  it('fusionne les paquets en un seul fichier trié', () => {
    const merged = mergeReports([
      { testResults: [{ name: `${WEB_ROOT}/src/z.test.ts`, startTime: 0, endTime: 900 }] },
      { testResults: [{ name: `${WEB_ROOT}/src/a.test.ts`, startTime: 0, endTime: 100 }] },
    ])
    expect(Object.keys(merged)).toEqual(['src/a.test.ts', 'src/z.test.ts'])
    expect(merged['src/z.test.ts']).toBe(900)
  })

  it('retire les fichiers disparus du disque', () => {
    expect(pruneToExisting({ 'src/a.test.ts': 1, 'src/mort.test.ts': 2 }, ['src/a.test.ts'])).toEqual({
      'src/a.test.ts': 1,
    })
  })
})

describe('fetchLatestDurations', () => {
  const json = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  })

  it('lit l’API REST, télécharge chaque rapport du dernier run et les fusionne', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string) => {
      urls.push(url)
      return url.includes('/actions/artifacts')
        ? json({
            artifacts: [
              artifact(1, 11, 'main', '2026-10-31T01:00:00Z'),
              artifact(2, 11, 'main', '2026-10-31T01:01:00Z'),
            ],
          })
        : json({})
    }
    let n = 0
    const readZip = () => ({
      testResults: [{ name: `${WEB_ROOT}/src/f${(n += 1)}.test.ts`, startTime: 0, endTime: 1000 * n }],
    })
    const found = await fetchLatestDurations({ repo: 'o/r', token: 't', fetchImpl, readZip })
    expect(found).toEqual({ durations: { 'src/f1.test.ts': 1000, 'src/f2.test.ts': 2000 }, runId: 11, count: 2 })
    expect(urls[0]).toContain('/repos/o/r/actions/artifacts')
  })

  it('rend null (donc repli sur le fichier commité) quand main n’a aucun rapport', async () => {
    const found = await fetchLatestDurations({
      repo: 'o/r',
      token: 't',
      fetchImpl: async () => json({ artifacts: [] }),
    })
    expect(found).toBeNull()
  })

  it('lève sur une réponse HTTP en erreur : le script l’attrape et se replie', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    await expect(fetchLatestDurations({ repo: 'o/r', token: 't', fetchImpl })).rejects.toThrow('HTTP 403')
  })
})

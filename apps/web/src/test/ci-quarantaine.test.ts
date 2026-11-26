import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { repoRelative, resultsFromReport, updateQuarantine } from '../../../../tools/ci/flaky.mjs'
import { alertBody, previousFromBody, marker, repeatedMisses, sloMisses } from '../../../../tools/ci/meteo-alerte.mjs'
import { QUARANTINE_FILE, decide, failedTests, readQuarantine } from '../../../../tools/ci/quarantine.mjs'

/**
 * Quarantaine des tests flaky (lot ci/6-quarantaine). La règle qui ne bouge pas : un test HORS quarantaine
 * rouge fait rougir le shard, sans retry. La quarantaine n'absout que les tests nommés.
 */

const report = (...fails: Array<[string, string]>) => ({
  testResults: fails.map(([name, test]) => ({
    name,
    status: 'failed',
    assertionResults: [{ fullName: test, status: 'failed' }],
  })),
})
const Q = [{ file: 'apps/web/src/a.test.ts', test: 'a > flaky' }]

describe('décision bloque / ne bloque pas', () => {
  it('rc 0 : vert', () => {
    expect(decide({ report: null, rc: 0, quarantine: Q }).block).toBe(false)
  })
  it('tous les rouges en quarantaine : vert, listés', () => {
    const r = decide({ report: report(['/w/apps/web/src/a.test.ts', 'a > flaky']), rc: 1, quarantine: Q })
    expect(r.block).toBe(false)
    expect(r.quarantined).toHaveLength(1)
  })
  it('un test hors quarantaine rouge : ROUGE, même mêlé à un test en quarantaine', () => {
    const r = decide({
      report: report(['/w/apps/web/src/a.test.ts', 'a > flaky'], ['/w/apps/web/src/b.test.ts', 'b > vrai']),
      rc: 1,
      quarantine: Q,
    })
    expect(r.block).toBe(true)
    expect(r.blocking).toEqual([{ file: '/w/apps/web/src/b.test.ts', test: 'b > vrai' }])
  })
  it('même fichier, autre test : rouge', () => {
    expect(decide({ report: report(['/w/apps/web/src/a.test.ts', 'a > autre']), rc: 1, quarantine: Q }).block).toBe(
      true,
    )
  })
  it('quarantaine vide : un rouge reste rouge', () => {
    expect(decide({ report: report(['/w/x.test.ts', 't']), rc: 1, quarantine: [] }).block).toBe(true)
  })
  it('rapport absent, ou rc≠0 sans test rouge, ou suite sans test nommé : rouge', () => {
    expect(decide({ report: null, rc: 1, quarantine: Q }).block).toBe(true)
    expect(decide({ report: { testResults: [] }, rc: 1, quarantine: Q }).block).toBe(true)
    const crash = { testResults: [{ name: '/w/apps/web/src/a.test.ts', status: 'failed', assertionResults: [] }] }
    expect(failedTests(crash).suites).toHaveLength(1)
    expect(decide({ report: crash, rc: 1, quarantine: Q }).block).toBe(true)
  })
  it('un fichier homonyme (suffixe partiel) ne bénéficie pas de la quarantaine', () => {
    const r = decide({ report: report(['/w/apps/web/src/xa.test.ts', 'a > flaky']), rc: 1, quarantine: Q })
    expect(r.block).toBe(true)
  })
  it('la quarantaine livrée est lisible', () => {
    expect(Array.isArray(readQuarantine(QUARANTINE_FILE))).toBe(true)
  })
})

describe('détection des flaky', () => {
  const night = (date: string, entries: Array<[string, 'pass' | 'fail']>) => ({
    date,
    results: new Map(entries.map(([k, v]) => [`apps/web/a.test.ts|${k}`, v] as const)),
  })
  it('chemin de rapport -> chemin du dépôt', () => {
    expect(repoRelative('/runner/_work/x/apps/web/src/a.test.ts')).toBe('apps/web/src/a.test.ts')
    const m = resultsFromReport(report(['/r/apps/api/src/s.spec.ts', 't']))
    expect([...m]).toEqual([['apps/api/src/s.spec.ts|t', 'fail']])
  })
  it('un échec isolé entre deux nuits vertes entre en quarantaine', () => {
    const nights = [
      night('2026-10-01', [['t', 'pass']]),
      night('2026-10-02', [['t', 'fail']]),
      night('2026-10-03', [['t', 'pass']]),
    ]
    const r = updateQuarantine([], nights, '2026-10-03')
    expect(r.entered).toMatchObject([
      { file: 'apps/web/a.test.ts', test: 't', since: '2026-10-02', last_fail: '2026-10-02', green_nights: 1 },
    ])
  })
  it('une régression (rouge plusieurs nuits de suite) n entre PAS en quarantaine', () => {
    const nights = [
      night('2026-10-01', [['t', 'fail']]),
      night('2026-10-02', [['t', 'fail']]),
      night('2026-10-03', [['t', 'fail']]),
    ]
    expect(updateQuarantine([], nights, '2026-10-03').entries).toEqual([])
  })
  it('sort après 14 nuits vertes, reste avant', () => {
    const prev = [
      { file: 'apps/web/a.test.ts', test: 't', since: '2026-09-01', last_fail: '2026-09-02', green_nights: 0 },
    ]
    const greens = (n: number) =>
      Array.from({ length: n }, (_, i) => night(`2026-10-${String(i + 1).padStart(2, '0')}`, [['t', 'pass']]))
    expect(updateQuarantine(prev, greens(13), '2026-10-13').entries).toHaveLength(1)
    const out = updateQuarantine(prev, greens(14), '2026-10-14')
    expect(out.entries).toEqual([])
    expect(out.exited).toHaveLength(1)
  })
  it('un nouvel échec remet le compteur à zéro', () => {
    const prev = [
      { file: 'apps/web/a.test.ts', test: 't', since: '2026-09-01', last_fail: '2026-09-02', green_nights: 9 },
    ]
    const nights = [
      night('2026-10-01', [['t', 'pass']]),
      night('2026-10-02', [['t', 'fail']]),
      night('2026-10-03', [['t', 'pass']]),
    ]
    expect(updateQuarantine(prev, nights, '2026-10-03').entries[0]).toMatchObject({
      last_fail: '2026-10-02',
      green_nights: 1,
    })
  })
})

describe('alerte SLO deux semaines de suite', () => {
  const bad = { pr_duration_green_p50: 14, main_green_pct: 99 }
  it('un raté une seule semaine : pas d alerte', () => {
    expect(repeatedMisses(bad, { pr_duration_green_p50: 8, main_green_pct: 99 })).toEqual([])
  })
  it('raté deux semaines : alerte nommée', () => {
    const m = repeatedMisses(bad, { pr_duration_green_p50: 12, main_green_pct: 99 })
    expect(m.map(s => s.key)).toEqual(['pr_duration_green_p50'])
    expect(alertBody(m, bad, { pr_duration_green_p50: 12 })).toContain('12 puis 14')
  })
  it('une valeur non mesurée n est jamais un raté', () => {
    expect(sloMisses({ main_green_pct: null })).toEqual([])
    expect(sloMisses({ main_green_pct: 90 })).toHaveLength(1)
  })
  it('le marqueur fait l aller-retour', () => {
    expect(previousFromBody(`texte ${marker(bad)} fin`)).toEqual(bad)
    expect(previousFromBody('rien')).toBeNull()
  })
})

describe('câblage ci.yml', () => {
  const ci = readFileSync(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  it('les shards Web et API décident via quarantine.mjs, sous interrupteur', () => {
    expect(ci).toContain('tools/ci/quarantine.mjs decide --report "$RUNNER_TEMP/web-quarantine.json"')
    expect(ci).toContain('tools/ci/quarantine.mjs decide --report "$RUNNER_TEMP/api-quarantine.json"')
    expect(ci).toContain('CI_QUARANTINE: ${{ vars.CI_QUARANTINE }}')
  })
  it('aucun retry de test dans le workflow', () => {
    expect(ci).not.toMatch(/--retry|retry:\s*[1-9]/)
  })
})

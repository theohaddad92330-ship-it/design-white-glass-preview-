import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Sur une PR, `Test (Web)` et `Test (API)` ne lancent que les tests liés au diff ; la suite
 * complète tourne après fusion (push sur main, nuit, manuel). Cette garde lit `ci.yml` et prouve
 * trois choses : le sélecteur est appelé sur `pull_request`, le mode complet existe hors PR, et
 * les autres jobs sont sautés sur `push` et `schedule`.
 */
const WORKFLOW = readFileSync(join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8')

/** Le texte d'un job : de `  <id>:` au job suivant. */
function jobBlock(id: string): string {
  const start = WORKFLOW.indexOf(`\n  ${id}:\n`)
  expect(start, `job ${id} introuvable`).toBeGreaterThan(-1)
  const next = /\n {2}[a-z0-9-]+:\n/.exec(WORKFLOW.slice(start + 5))
  return WORKFLOW.slice(start, next ? start + 5 + next.index : undefined)
}

const NOT_SELECTED_OUTSIDE_PR = ['build', 'quick', 'test-demo-db', 'arch', 'doc-suit-le-code']

describe('ci.yml — tests concernés sur PR, suite complète après fusion', () => {
  it.each([
    ['test', 'Test (API)', 'api'],
    ['test-web', 'Test (Web)', 'web'],
  ])('%s (%s) appelle le sélecteur sur pull_request', (id, name, suite) => {
    const block = jobBlock(id)
    expect(block).toContain(`name: ${name}`)
    expect(block).toMatch(new RegExp(`test-changed\\.mjs ci --suite ${suite} `))
    expect(block).toMatch(/\[ "\$EVENT" = "pull_request" \]/)
    // `cond && 0 || 1` vaut TOUJOURS 1 (0 est faux dans une expression) : clone superficiel,
    // merge-base vide, repli complet sur chaque PR (run 38587265226, 14/10).
    expect(block).toContain("fetch-depth: ${{ github.event_name != 'pull_request' && 1 || 0 }}")
    expect(block).not.toMatch(/&& 0 \|\|/)
  })

  // ⚠️ Cette garde demandait `-- --shard=i/6` dans `Test (API)`, et c'est EXACTEMENT
  // ce qui ne marchait pas : mesuré le 25/10/2026 sur trois runs, l'argument n'arrive
  // pas jusqu'à jest à travers turbo et les trois shards refaisaient la suite entière
  // (851, 847 et 854 suites sur 855). Les deux suites passent désormais par une LISTE
  // DE FICHIERS explicite — web par durée, API par `jest --listTests --shard=i/6` —
  // et `garde-shard.sh` prouve en CI COMBIEN de fichiers ont réellement tourné.
  it('le mode complet existe hors PR : shards entiers par LISTE DE FICHIERS, jamais par --shard à travers turbo', () => {
    expect(jobBlock('test-web')).toContain('node tools/ci/shard-by-duration.mjs --shard ${{ matrix.shard }}/8')
    const api = jobBlock('test')
    expect(api).toContain('npx jest --listTests --shard=${{ matrix.shard }}/6')
    expect(api).toContain('garde-shard.sh')
    expect(api).not.toContain('-- --shard=${{ matrix.shard }}/6')
    expect(jobBlock('test-web')).toMatch(/hors pull_request/)
  })

  it('les déclencheurs push sur main, schedule et workflow_dispatch existent', () => {
    const head = WORKFLOW.slice(0, WORKFLOW.indexOf('\nconcurrency:'))
    expect(head).toContain('push: { branches: [main] }')
    expect(head).toContain("cron: '30 1 * * *'")
    expect(head).toContain('workflow_dispatch:')
  })

  it('`changes` accepte les événements hors PR et met tout à vrai', () => {
    const block = jobBlock('changes')
    expect(block).toContain("if: github.event_name != 'pull_request' || github.event.pull_request.draft == false")
    expect(block).toMatch(/\[ "\$EVENT" != "pull_request" \]/)
  })

  it.each(NOT_SELECTED_OUTSIDE_PR)('le job %s est sauté hors pull_request', id => {
    expect(jobBlock(id)).toMatch(/\n {4}if: github\.event_name == 'pull_request'/)
  })

  // #4869.5 — test-ia tourne la NUIT sur main (décision de Louis), jamais sur chaque push ni à la main.
  it('test-ia : pull_request (portée ia) et nuit seulement, en 3 shards', () => {
    const block = jobBlock('test-ia')
    expect(block).toMatch(
      /\n {4}if: github\.event_name == 'pull_request' && needs\.changes\.outputs\.ia == 'true' \|\| github\.event_name == 'schedule'\n/,
    )
    expect(block).not.toContain("github.event_name == 'push'")
    expect(block).toContain('shard: [1, 2, 3]')
    expect(block).toContain('node ../../tools/ci/shard-ia.mjs "${{ matrix.shard }}/3"')
    expect(jobBlock('suite-complete-rouge')).toMatch(/needs: \[[^\]]*\btest-ia\b/)
  })

  it('la garde sait dire NON : les deux jobs de test ne sont PAS limités aux PR', () => {
    for (const id of ['test', 'test-web']) {
      expect(jobBlock(id)).not.toMatch(/\n {4}if: github\.event_name == 'pull_request'/)
    }
  })

  it.each([
    ['test', 'api'],
    ['test-web', 'web'],
  ])('%s tourne hors PR même si la porte doc↔code (PR seule) est sautée', (id, out) => {
    // Un `needs` SAUTÉ saute le job qui en dépend, sauf condition explicite : sans elle, plus
    // aucune suite complète sur main (#4207, 14/10). `!cancelled()`, pas `always()` : un run
    // annulé ne relance pas ses tests.
    const block = jobBlock(id)
    if (!/needs: \[[^\]]*doc-suit-le-code/.test(block)) return
    expect(block).toContain(
      `if: \${{ !cancelled() && needs.changes.result == 'success' && contains(fromJSON('["success","skipped"]'), needs.doc-suit-le-code.result) && needs.changes.outputs.${out} == 'true' }}`,
    )
  })

  it('CI Status ne tourne que sur une PR, et garde ses jobs', () => {
    const block = jobBlock('ci-status')
    expect(block).toContain("if: always() && github.event_name == 'pull_request'")
    expect(block).toContain('needs.test-web.result')
    expect(block).toContain('needs.test.result')
  })

  it('une suite rouge sur main ouvre ou commente l’issue ci-main-rouge', () => {
    const block = jobBlock('suite-complete-rouge')
    // `dette-formatage` ajouté le 30/10/2026 (#4830) : il rougissait main sans faire tirer l'alarme.
    // Tout job sur main dans la chaîne de l'alarme : `alarme-main-couvre-tous-les-jobs.spec.ts` (api).
    expect(block).toContain('needs: [test, test-web, test-ia, dette-formatage, warm-cache]')
    expect(block).toMatch(/if: failure\(\) && github\.event_name != 'pull_request'/)
    expect(block).toContain('issues: write')
    expect(block).toContain('ci-main-rouge')
    expect(block).toContain('Suite complète rouge sur main')
    expect(block).toContain('compareCommits')
  })
})

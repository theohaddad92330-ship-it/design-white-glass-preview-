import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CI-3 — l'aller-retour des migrations sur vraie base vit dans `test-demo-db` (même grappe Postgres, base à part),
 * lui-même dans `CI Status` (needs ET results). Cette garde lit `ci.yml` : le job doit déclencher sur les migrations,
 * lancer LE spec, ne pas se faire sauter (`MIGRATIONS_DB_REQUIRED`), et le spec doit exister.
 */
const ROOT = join(__dirname, '..', '..', '..', '..')
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')

function jobBlock(id: string): string {
  const start = WORKFLOW.indexOf(`\n  ${id}:\n`)
  expect(start, `job ${id} introuvable`).toBeGreaterThan(-1)
  const next = /\n {2}[a-z0-9-]+:\n/.exec(WORKFLOW.slice(start + 5))
  return WORKFLOW.slice(start, next ? start + 5 + next.index : undefined)
}

describe('ci.yml — aller-retour des migrations sur vraie base (CI-3)', () => {
  const block = jobBlock('test-demo-db')
  const status = jobBlock('ci-status')

  it('le spec existe', () => {
    expect(existsSync(join(ROOT, 'apps/api/src/database/migrations-roundtrip.db.spec.ts'))).toBe(true)
  })

  it('test-demo-db le lance, sans pouvoir le sauter', () => {
    expect(block).toContain('npx jest -w 1 src/database/migrations-roundtrip.db.spec.ts')
    expect(block).toContain("MIGRATIONS_DB_REQUIRED: '1'")
  })

  it('le job se déclenche sur les migrations (portée « demo »)', () => {
    expect(WORKFLOW).toMatch(/touched '\^apps\/api\/src\/\([^']*migrations\/[^']*'\s*&&\s*demo=true/)
  })

  it('reste dans CI Status : needs ET results', () => {
    expect(status).toMatch(/needs: \[[^\]]*test-demo-db/)
    expect(status).toContain('needs.test-demo-db.result')
  })

  it('porte un timeout', () => {
    expect(block).toMatch(/timeout-minutes: \d+/)
  })

  it('le up reste bloquant : aucun continue-on-error sur l’étape', () => {
    const step = block.slice(block.indexOf('Migrations — aller-retour'))
    expect(step).not.toContain('continue-on-error')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8')

/**
 * #4532.2 / #4533.3 — les deux pages sont retirées, leurs adresses redirigent (`beforeLoad` + `replace: true`,
 * jamais `<Navigate>` — GA-27). Revient sur #3950.
 */
describe('anciennes adresses → Mes données', () => {
  it('/settings/vivier-export → /settings/mes-donnees', () => {
    const src = read('vivier-export.tsx')
    expect(src).toContain("createFileRoute('/settings/vivier-export')")
    expect(src).toMatch(/throw redirect\(\{\s*to: '\/settings\/mes-donnees'/)
    expect(src).toContain('replace: true')
    expect(src).not.toMatch(/import[^\n]*\bNavigate\b/)
  })

  it('/settings/import → /settings/mes-donnees?tab=imports', () => {
    const src = read('import.tsx')
    expect(src).toContain("createFileRoute('/settings/import')")
    expect(src).toMatch(/throw redirect\(\{\s*to: '\/settings\/mes-donnees'/)
    expect(src).toContain("tab: 'imports'")
    expect(src).toContain('replace: true')
    expect(src).not.toMatch(/import[^\n]*\bNavigate\b/)
  })
})

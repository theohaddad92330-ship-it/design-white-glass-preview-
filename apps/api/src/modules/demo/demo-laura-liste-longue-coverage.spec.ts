import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_LAURA_LONG_LIST_COVERAGE } from './demo-coverage'

/**
 * #4748 (29/10) — une liste de plus de 20 lignes est démontrable (craft rule n°9).
 * Laura reste scriptée en salle : la garde LIT le script réel (`demo-chat-script.ts`, côté web).
 */
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')

function block(): string {
  const after = readFileSync(SCRIPT, 'utf8').split("id: 'p-liste-longue'")[1] ?? ''
  return after.split(/\n {2}\{\n/)[0] ?? ''
}

describe('#4748 — la liste longue de Laura en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_LAURA_LONG_LIST_COVERAGE.state).toBe('seede')
    expect(DEMO_LAURA_LONG_LIST_COVERAGE.reason).toContain('#4748')
  })

  it('LIT une vraie amorce — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(block().length).toBeGreaterThan(300)
  })

  it('porte plus de 20 lignes, et annonce le même nombre que celui qu’elle porte', () => {
    const text = block()
    expect(text).toContain("type: 'file_export'")
    const length = Number(/Array\.from\(\{ length: (\d+) \}/.exec(text)?.[1])
    expect(length).toBeGreaterThan(20)
    expect(text).toContain(`${length} entreprises`)
  })

  it('sait dire NON : entreprises fictives, aucun fournisseur, aucun « 0 » pour un effectif absent', () => {
    const text = block()
    expect(text).toContain('(démo)')
    expect(text).not.toMatch(/pappers|apollo|firecrawl|brave|societe\.com/i)
    expect(text).toContain('null')
    expect(text).not.toMatch(/: ['`]0['`]/)
  })
})

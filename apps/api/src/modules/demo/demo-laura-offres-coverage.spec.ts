import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_LAURA_JOB_OFFERS_COVERAGE } from './demo-coverage'

/**
 * LAURA-OFFRES-4563 (25/10) — « trouve-moi des offres <compétence> sur <ville> » est démontrable (craft rule n°9).
 * Laura reste scriptée en salle (décision Louis 12/10) : la garde LIT le script réel (`demo-chat-script.ts`, côté web).
 */
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')

function block(): string {
  const after = readFileSync(SCRIPT, 'utf8').split("id: 'p-offres-competence'")[1] ?? ''
  return after.split(/\n {2}\{\n/)[0] ?? ''
}

describe('LAURA-OFFRES-4563 — les offres de Laura en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_LAURA_JOB_OFFERS_COVERAGE.state).toBe('seede')
    expect(DEMO_LAURA_JOB_OFFERS_COVERAGE.reason).toContain('#4563')
  })

  it('LIT une vraie amorce — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(block().length).toBeGreaterThan(300)
  })

  it('rend une carte d’OFFRES : intitulé, employeur, date, lieu, lien — et dit le palier atteint', () => {
    const text = block()
    expect(text).toContain("type: 'file_export'")
    expect(text).toContain("columns: ['Intitulé', 'Employeur', 'Date', 'Lieu', 'Lien'")
    expect([...text.matchAll(/cells: \[/g)].length).toBeGreaterThanOrEqual(5)
    expect(text).toMatch(/plancher de 5 est atteint au palier « termes voisins »/)
  })

  it('sait dire NON : employeurs fictifs, liens example.org, aucun fournisseur, aucun « 0 » pour une valeur absente', () => {
    const text = block()
    expect([...text.matchAll(/'[^']+ \(démo\)'/g)].length).toBeGreaterThanOrEqual(5)
    expect([...text.matchAll(/'https:\/\/([^/']+)\//g)].every(m => m[1] === 'offres.example.org')).toBe(true)
    expect(text).toContain('non précisé')
    expect(text).not.toMatch(/france travail|adzuna|theirstack|mantiks|fantastic|jooble/i)
    expect(text).not.toMatch(/'(0|0 €)'/)
  })
})

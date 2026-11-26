import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAutoMergeable } from '@bellum/contracts'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_AUTO_MERGED_DUPLICATE, DEMO_UNQUALIFIED_CONTACTS } from './demo-dataset'

/**
 * #4016 L6 (Louis 11/10/2026) — craft rule n°9 : la fusion automatique d'un
 * doublon certain se VOIT dans la salle, avec son « Annuler la fusion ».
 */
describe('#4016 L6 — la fusion automatique est semée en démonstration', () => {
  const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('`duplicate_pairs` est classée SEEDÉE, et n’est plus « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('duplicate_pairs')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('duplicate_pairs')
  })

  it('la paire semée est CERTAINE — jamais une proposition déguisée en fusion', () => {
    expect(isAutoMergeable(DEMO_AUTO_MERGED_DUPLICATE.confidence)).toBe(true)
  })

  it('elle porte sur un contact « à qualifier » FICTIF, adresse en `.example` — jamais une personne réelle', () => {
    const source = DEMO_UNQUALIFIED_CONTACTS.find(c => c.full_name === DEMO_AUTO_MERGED_DUPLICATE.keptFullName)
    expect(source).toBeDefined()
    expect(source?.email).toMatch(/\.example$/)
  })

  it('le semis écrit EXACTEMENT ce que le balayeur écrit : mise de côté, pointeur, paire `auto_merged`', () => {
    expect(seedSource).toContain('this.seedAutoMergedDuplicate(workspaceId, ownerUserId)')
    expect(seedSource).toMatch(/row\.deleted_at = new Date\(\)/)
    expect(seedSource).toMatch(/row\.merged_into_id = kept\.id/)
    expect(seedSource).toContain("'auto_merged'")
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_RAG_DOCUMENTS } from './demo-dataset'

/**
 * #2779 — craft rule n°9 : les trois portées neuves d'un document RAG sont
 * AUSSI semées dans la salle de démonstration. Le dépôt y est refusé, donc
 * sans semis aucune d'elles ne se verrait jamais à l'écran.
 */
describe('Démo — portées des documents RAG (#2779)', () => {
  it.each(['personal', 'account', 'knowledge_base'] as const)('sème au moins un document `%s`', scope => {
    expect(DEMO_RAG_DOCUMENTS.some(doc => doc.scope === scope)).toBe(true)
  })

  it('le document `account` vise un compte que la salle sème vraiment (fictif)', () => {
    const accountDocs = DEMO_RAG_DOCUMENTS.filter(doc => doc.scope === 'account')
    // #3889 — Sanofi (un dossier semé de la salle) porte aussi ses notes d'avant-vente.
    const seeded = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    for (const doc of accountDocs) expect(seeded.has(doc.company ?? '')).toBe(true)
    expect(accountDocs.some(doc => doc.company === DEMO_DELIVERY_CLIENT.account.company_name)).toBe(true)
  })

  it('le semis écrit la portée ET le compte résolu (pas seulement le jeu de données)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const block = seed.slice(seed.indexOf('DEMO_RAG_DOCUMENTS.map'), seed.indexOf('DEMO_RAG_DOCUMENTS.map') + 900)
    expect(block).toContain('scope: document.scope')
    expect(block).toContain('accountIds.get(document.company)')
    expect(block).toContain('account_id: accountId')
  })
})

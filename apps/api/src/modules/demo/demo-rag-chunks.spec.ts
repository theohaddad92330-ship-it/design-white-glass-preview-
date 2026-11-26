import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_BRAND_MESSAGING_TITLE, DEMO_RAG_DOCUMENTS } from './demo-dataset'

/**
 * #3750.8 — parité démo du découpage RAG : la salle porte un classeur à
 * onglets dont chaque onglet est un MORCEAU citable (« 07 · Objections »).
 */
describe('le classeur à onglets de la salle (#3750.8)', () => {
  const brand = DEMO_RAG_DOCUMENTS.find(document => document.title === DEMO_BRAND_MESSAGING_TITLE)

  it('existe, avec l’onglet des objections', () => {
    expect(brand?.units?.map(unit => unit.label)).toContain('07 · Objections')
  })

  it('chaque onglet tient en UN morceau et garde sa ligne d’en-tête', () => {
    for (const unit of brand?.units ?? []) {
      // Même plafond que `rag_chunking.RAG_CHUNK_TARGET_CHARS` côté IA.
      expect(unit.content.length).toBeLessThanOrEqual(1500)
      expect(unit.content.split('\n')[0]).toContain('\t')
    }
  })

  it('le document entier est la suite de ses onglets — rien d’inventé en plus', () => {
    expect(brand?.content).toBe((brand?.units ?? []).map(unit => unit.content).join('\n'))
    // Assez long pour que le découpage ait un sens (> 1 500 car.).
    expect((brand?.content ?? '').length).toBeGreaterThan(1500)
  })

  it('le semis écrit ses morceaux, appelé depuis le semis des documents', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('await this.seedRagDocumentChunks(savedRagDocuments, ownerUserId, workspaceId)')
    expect(source).toContain('INSERT INTO rag_document_chunks')
  })
})

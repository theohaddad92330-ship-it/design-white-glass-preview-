import { describe, expect, it } from 'vitest'
import { ragDocumentPreviewSchema, ragPreviewKind } from './rag-document-source.js'

// #3803 (3803.2/3803.3) — la visionneuse se choisit sur l'EXTENSION de
// l'original, jamais sur le type déclaré par le navigateur.
describe('#3803 — ragPreviewKind', () => {
  it('range chaque format du dépôt sous SA visionneuse', () => {
    expect(ragPreviewKind('campagnes ABM.xlsx')).toBe('spreadsheet')
    expect(ragPreviewKind('export.CSV')).toBe('spreadsheet')
    expect(ragPreviewKind('offre.pdf')).toBe('pdf')
    expect(ragPreviewKind('note.docx')).toBe('document')
    expect(ragPreviewKind('soutenance.pptx')).toBe('slides')
    expect(ragPreviewKind('lisez-moi.md')).toBe('text')
    expect(ragPreviewKind('notes.txt')).toBe('text')
    expect(ragPreviewKind('config.json')).toBe('text')
  })

  it('ne devine rien pour un format inconnu', () => {
    expect(ragPreviewKind('archive.zip')).toBeNull()
    expect(ragPreviewKind('sans-extension')).toBeNull()
  })
})

describe('#3803 — ragDocumentPreviewSchema', () => {
  it('accepte un document SANS original (déposé avant #3803) : `source` vaut null, jamais absent', () => {
    const parsed = ragDocumentPreviewSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Ancien document',
      content: 'texte',
      category: 'Méthode',
      source: null,
    })
    expect(parsed.source).toBeNull()
    expect(() => ragDocumentPreviewSchema.parse({ id: parsed.id, title: 't', content: 'c', category: null })).toThrow()
  })
})

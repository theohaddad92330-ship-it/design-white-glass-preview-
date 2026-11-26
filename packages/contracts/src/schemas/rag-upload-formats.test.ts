import { describe, expect, it } from 'vitest'
import {
  validateRagUpload,
  RAG_UPLOAD_ANALYSIS_EXTENSIONS,
  RAG_UPLOAD_ANALYSIS_TEXT_EXTENSIONS,
  RAG_UPLOAD_CHAT_EXTENSIONS,
  RAG_UPLOAD_DOCUMENT_EXTENSIONS,
  RAG_UPLOAD_MAX_BYTES,
} from './rag-upload-formats.js'

describe('rag-upload-formats (#3751)', () => {
  it('Connaissances accepte docx/xlsx/pptx comme le chat', () => {
    for (const ext of ['docx', 'xlsx', 'pptx', 'pdf', 'txt', 'md', 'csv', 'json']) {
      expect(RAG_UPLOAD_DOCUMENT_EXTENSIONS).toContain(ext)
      expect(RAG_UPLOAD_CHAT_EXTENSIONS).toContain(ext)
    }
  })
  it('le chat est un sur-ensemble des documents', () => {
    for (const ext of RAG_UPLOAD_DOCUMENT_EXTENSIONS) expect(RAG_UPLOAD_CHAT_EXTENSIONS).toContain(ext)
  })
  it('refuse un format inconnu, un fichier vide et un fichier trop gros avec la raison', () => {
    expect(validateRagUpload({ name: 'a.exe', size: 10 })).toEqual({ ok: false, reason: 'unsupported' })
    expect(validateRagUpload({ name: 'a.docx', size: 0 })).toEqual({ ok: false, reason: 'empty' })
    expect(validateRagUpload({ name: 'a.xlsx', size: RAG_UPLOAD_MAX_BYTES + 1 })).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })
  it('accepte sans tenir compte de la casse, et signale le texte', () => {
    expect(validateRagUpload({ name: 'A.XLSX', size: 5 })).toEqual({ ok: true, isText: false })
    expect(validateRagUpload({ name: 'a.md', size: 5 })).toEqual({ ok: true, isText: true })
  })
  it('#3623 — l’analyse joint les documents ET les archives, pas les images', () => {
    for (const ext of [...RAG_UPLOAD_DOCUMENT_EXTENSIONS, 'zip']) expect(RAG_UPLOAD_ANALYSIS_EXTENSIONS).toContain(ext)
    for (const ext of ['png', 'jpg', 'exe']) expect(RAG_UPLOAD_ANALYSIS_EXTENSIONS).not.toContain(ext)
  })
  // #3623.8 — « tout type de fichier » : les formats TEXTE usuels d'un dossier de recherche, lus en UTF-8.
  it('#3623.8 — l’analyse lit aussi les textes usuels (tsv, log, xml, yaml), comme du texte', () => {
    for (const ext of ['tsv', 'log', 'xml', 'yaml', 'yml']) {
      expect(RAG_UPLOAD_ANALYSIS_TEXT_EXTENSIONS).toContain(ext)
      expect(RAG_UPLOAD_ANALYSIS_EXTENSIONS).toContain(ext)
      expect(validateRagUpload({ name: `x.${ext}`, size: 5 }, RAG_UPLOAD_ANALYSIS_EXTENSIONS)).toEqual({
        ok: true,
        isText: true,
      })
    }
  })
  it('#3623.8 — Connaissances et le chat ne changent pas (ces textes n’y sont pas ouverts)', () => {
    for (const ext of RAG_UPLOAD_ANALYSIS_TEXT_EXTENSIONS) {
      expect(RAG_UPLOAD_DOCUMENT_EXTENSIONS).not.toContain(ext)
      expect(RAG_UPLOAD_CHAT_EXTENSIONS).not.toContain(ext)
      expect(validateRagUpload({ name: `x.${ext}`, size: 5 })).toEqual({ ok: false, reason: 'unsupported' })
    }
  })
})

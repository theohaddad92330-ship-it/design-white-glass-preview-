import { describe, expect, it } from 'vitest'
import {
  CONTEXT_PACK_ORIGINAL_MAX_BYTES,
  CONTEXT_PACK_ORIGINAL_STATUSES,
  CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS,
  contextPackOriginalMimeType,
  contextPackOriginalOf,
  contextPackOriginalStoragePath,
  contextPackHistoryItemSchema,
  contextPackRecordRequestSchema,
} from './context-pack-import.js'
import { TALENT_DOCUMENT_FILE_URL_TTL_SECONDS } from './talent-document-file.js'

const WS = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'

// #4573 — l'original d'un document de contexte se conserve et se relit, sur le chemin des CV (#4034).
describe('context-pack-original (#4573)', () => {
  it('range l’original sous l’espace puis l’import, avec un nom qui ne sort pas de son dossier', () => {
    expect(contextPackOriginalStoragePath(WS, ID, 'Playbook commercial.pdf')).toBe(
      `${WS}/context-pack/${ID}/Playbook_commercial.pdf`,
    )
    expect(contextPackOriginalStoragePath(WS, ID, '../../autre-espace/x.pdf')).toBe(`${WS}/context-pack/${ID}/x.pdf`)
    expect(contextPackOriginalStoragePath(WS, ID, '...')).toBe(`${WS}/context-pack/${ID}/document`)
  })

  it('l’URL signée a la durée de celle des CV (≤ 5 min) — un seul endroit, GA-26', () => {
    expect(CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS).toBe(TALENT_DOCUMENT_FILE_URL_TTL_SECONDS)
  })

  it('le type vient de l’extension des neuf formats, jamais deviné au-delà', () => {
    expect(contextPackOriginalMimeType('offre.PDF')).toBe('application/pdf')
    expect(contextPackOriginalMimeType('notes.md')).toBe('text/markdown')
    expect(contextPackOriginalMimeType('sans-extension')).toBe('application/octet-stream')
  })

  it('une ligne sans statut est un import ANTÉRIEUR : elle le dit, elle ne fait pas semblant', () => {
    expect(contextPackOriginalOf(null)).toBe('earlier')
    expect(contextPackOriginalOf(undefined)).toBe('earlier')
    expect(contextPackOriginalOf('kept')).toBe('kept')
    expect(CONTEXT_PACK_ORIGINAL_STATUSES).toContain('erased')
  })

  it('le dépôt transmet l’original en base64 sous le plafond, jamais au-delà', () => {
    const base = {
      fileName: 'a.pdf',
      destination: 'knowledge',
      status: 'done',
      imported: 1,
      skipped: 0,
      scripts: null,
      message: null,
    }
    expect(contextPackRecordRequestSchema.safeParse({ ...base, fileB64: 'QUJD' }).success).toBe(true)
    expect(contextPackRecordRequestSchema.safeParse({ ...base, originalTooBig: true }).success).toBe(true)
    const tooLong = 'A'.repeat(Math.ceil((CONTEXT_PACK_ORIGINAL_MAX_BYTES * 4) / 3) + 16)
    expect(contextPackRecordRequestSchema.safeParse({ ...base, fileB64: tooLong }).success).toBe(false)
  })

  it('une ligne d’historique ne porte jamais les octets, seulement l’état de son original', () => {
    const item = contextPackHistoryItemSchema.parse({
      id: ID,
      fileName: 'a.pdf',
      destination: 'knowledge',
      status: 'done',
      imported: 1,
      skipped: 0,
      scripts: null,
      message: null,
      createdAt: '2026-10-26T00:00:00.000Z',
      original: 'earlier',
      fileB64: 'QUJD',
    })
    expect(item).not.toHaveProperty('fileB64')
    expect(item.original).toBe('earlier')
  })
})

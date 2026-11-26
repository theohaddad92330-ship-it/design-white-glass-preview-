import { describe, expect, it } from 'vitest'
import { IMPORT_FILE_MAX_BYTES, IMPORT_FILE_MAX_LABEL, exceedsImportLimit } from './import-limits.js'
import { UNIVERSAL_IMPORT_PART_BYTES, universalImportCreateSchema } from './universal-import.js'

// #3666.9 (Louis 15/10/2026) — la limite d'import annoncée est 1 Go (ZIP de CV, fichiers CRM).
describe('#3666.9 — la limite d’import annoncée', () => {
  it('1 Go, annoncé « 1 Go »', () => {
    expect(IMPORT_FILE_MAX_BYTES).toBe(1024 ** 3)
    expect(IMPORT_FILE_MAX_LABEL).toBe('1 Go')
  })

  it('sait dire NON — au-delà de 1 Go, ou une taille illisible', () => {
    expect(exceedsImportLimit(IMPORT_FILE_MAX_BYTES)).toBe(false)
    expect(exceedsImportLimit(IMPORT_FILE_MAX_BYTES + 1)).toBe(true)
    expect(exceedsImportLimit(Number.NaN)).toBe(true)
  })

  it('l’API relit la même borne : un fichier CRM annoncé au-delà de 1 Go est refusé à la création', () => {
    const maxParts = Math.ceil(IMPORT_FILE_MAX_BYTES / UNIVERSAL_IMPORT_PART_BYTES)
    const base = { type: 'contact', filename: 'export.csv', accountId: null }
    expect(universalImportCreateSchema.safeParse({ ...base, parts: maxParts }).success).toBe(true)
    expect(universalImportCreateSchema.safeParse({ ...base, parts: maxParts + 1 }).success).toBe(false)
  })
})

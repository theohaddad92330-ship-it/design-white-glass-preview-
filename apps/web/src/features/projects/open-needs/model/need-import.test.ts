import { describe, expect, it } from 'vitest'
import {
  MAX_NEED_IMPORT_FILES,
  markNeedImportDuplicates,
  needImportRowsToCreate,
  needTitleFromFileName,
  type NeedImportRow,
} from './need-import'

describe('needTitleFromFileName — le titre vient du FICHIER, jamais deviné dans le document', () => {
  it('retire l’extension', () => {
    expect(needTitleFromFileName('Architecte cloud senior.pdf')).toBe('Architecte cloud senior')
  })

  it('garde le nom entier si aucune extension', () => {
    expect(needTitleFromFileName('Fiche de poste')).toBe('Fiche de poste')
  })

  it('retombe sur le nom brut si retirer l’extension ne laisse rien', () => {
    expect(needTitleFromFileName('.pdf')).toBe('.pdf')
  })
})

describe('markNeedImportDuplicates — signalé, jamais fusionné', () => {
  const base: NeedImportRow = {
    status: 'extracted',
    file: 'architecte-cloud.pdf',
    title: 'Architecte cloud',
    skills: [],
    rfpId: 'rfp-1',
    duplicateOf: null,
  }

  it('signale une fiche déjà importée chez ce compte (même titre, insensible à la casse)', () => {
    const [row] = markNeedImportDuplicates([base], ['architecte cloud'])
    expect(row).toEqual({ ...base, duplicateOf: 'Architecte cloud' })
  })

  it('ne touche pas un titre qui ne collisionne avec rien', () => {
    const [row] = markNeedImportDuplicates([base], ['Développeur PHP'])
    expect(row).toEqual(base)
  })

  it('signale aussi UNE COLLISION DANS LE MÊME LOT — la première occurrence reste propre', () => {
    const second: NeedImportRow = { ...base, file: 'architecte-cloud-2.pdf' }
    const [first, marked] = markNeedImportDuplicates([base, second], [])
    expect(first.status === 'extracted' && first.duplicateOf).toBe(null)
    expect(marked.status === 'extracted' && marked.duplicateOf).toBe('Architecte cloud')
  })

  it('laisse un échec intact — un échec n’a pas de titre à comparer', () => {
    const failed: NeedImportRow = { status: 'failed', file: 'scan.pdf', reason: 'Je n’ai pas pu lire ce document.' }
    expect(markNeedImportDuplicates([failed], ['Architecte cloud'])).toEqual([failed])
  })
})

describe('needImportRowsToCreate — rien n’est créé sans être COCHÉ', () => {
  const extracted: NeedImportRow = {
    status: 'extracted',
    file: 'a.pdf',
    title: 'Architecte cloud',
    skills: [],
    rfpId: 'rfp-1',
    duplicateOf: null,
  }
  const failed: NeedImportRow = { status: 'failed', file: 'b.pdf', reason: 'Je n’ai pas pu lire ce document.' }

  it('ne retient que les lignes extraites et cochées', () => {
    const rows = [extracted, failed]
    expect(needImportRowsToCreate(rows, new Set([0]))).toEqual([extracted])
    expect(needImportRowsToCreate(rows, new Set([1]))).toEqual([])
    expect(needImportRowsToCreate(rows, new Set())).toEqual([])
  })
})

describe('MAX_NEED_IMPORT_FILES — une borne écrite, pas devinée à l’usage', () => {
  it('est un entier positif raisonnable pour un lot relu à l’écran', () => {
    expect(Number.isInteger(MAX_NEED_IMPORT_FILES)).toBe(true)
    expect(MAX_NEED_IMPORT_FILES).toBeGreaterThan(1)
    expect(MAX_NEED_IMPORT_FILES).toBeLessThanOrEqual(20)
  })
})

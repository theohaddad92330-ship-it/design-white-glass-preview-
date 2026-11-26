import { describe, expect, it } from 'vitest'
import {
  isToRevalidate,
  readReferenceArchive,
  readWorkingCopyOf,
  REFERENCE_ARCHIVE_KEY,
  TO_REVALIDATE_TAG,
  WORKING_COPY_OF_KEY,
} from './reference-archive.js'

const ARCHIVE = {
  label: 'Archive du dépôt fourni',
  period_from: '2026-09-30',
  period_to: '2026-10-01',
  scope_note: 'périmètre France',
  verified_online: false,
}

describe('dossier de référence — archive figée', () => {
  it('lit la portée posée sur raw_analysis', () => {
    expect(readReferenceArchive({ [REFERENCE_ARCHIVE_KEY]: ARCHIVE })).toEqual(ARCHIVE)
  })

  it('un compte ordinaire n’est pas une archive', () => {
    expect(readReferenceArchive({})).toBeNull()
    expect(readReferenceArchive(null)).toBeNull()
    expect(readReferenceArchive(undefined)).toBeNull()
  })

  it('une portée mal formée n’est pas devinée : pas d’archive', () => {
    expect(readReferenceArchive({ [REFERENCE_ARCHIVE_KEY]: { ...ARCHIVE, period_from: 'hier' } })).toBeNull()
    expect(readReferenceArchive({ [REFERENCE_ARCHIVE_KEY]: { label: 'x' } })).toBeNull()
  })

  it('la copie de travail nomme son archive d’origine', () => {
    expect(readWorkingCopyOf({ [WORKING_COPY_OF_KEY]: '11111111-1111-4111-8111-111111111111' })).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(readWorkingCopyOf({ [WORKING_COPY_OF_KEY]: 42 })).toBeNull()
    expect(readWorkingCopyOf(null)).toBeNull()
  })

  it('« À revalider » se lit sur les étiquettes du contact, jamais ailleurs', () => {
    expect(isToRevalidate(['Gouvernance', TO_REVALIDATE_TAG])).toBe(true)
    expect(isToRevalidate(['Gouvernance'])).toBe(false)
    expect(isToRevalidate(null)).toBe(false)
    expect(isToRevalidate(undefined)).toBe(false)
  })
})

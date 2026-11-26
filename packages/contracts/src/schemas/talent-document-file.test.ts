import { describe, expect, it } from 'vitest'
import {
  TALENT_DOCUMENT_FILE_URL_TTL_SECONDS,
  cvOriginalMimeType,
  cvOriginalStoragePath,
  talentDocumentFileUrlSchema,
  talentDocumentPreviewMode,
} from './talent-document-file.js'

const WS = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'

describe('#4034 — le CV original conservé', () => {
  it('le chemin est rangé sous l’espace, puis cv/<document>/<nom>', () => {
    expect(cvOriginalStoragePath(WS, DOC, 'CV Jean.pdf')).toBe(`${WS}/cv/${DOC}/CV_Jean.pdf`)
  })

  it('le nom ne peut pas sortir de son dossier (aucun « / » ni « .. »)', () => {
    const path = cvOriginalStoragePath(WS, DOC, '../../autre/espace.pdf')
    expect(path.startsWith(`${WS}/cv/${DOC}/`)).toBe(true)
    expect(path.slice(`${WS}/cv/${DOC}/`.length)).not.toContain('/')
    expect(path).not.toContain('..')
  })

  it('un nom vide ou illisible garde un nom de repli, jamais un chemin vide', () => {
    expect(cvOriginalStoragePath(WS, DOC, '   ')).toBe(`${WS}/cv/${DOC}/cv`)
  })

  it('le type se lit d’abord dans les OCTETS, puis l’extension', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(cvOriginalMimeType('sans-extension', pdf)).toBe('application/pdf')
    expect(cvOriginalMimeType('cv.docx', new Uint8Array([1]))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(cvOriginalMimeType('cv.doc', new Uint8Array([1]))).toBe('application/msword')
    expect(cvOriginalMimeType('cv.rtf', new Uint8Array([1]))).toBe('application/rtf')
    expect(cvOriginalMimeType('photo.PNG', new Uint8Array([1]))).toBe('image/png')
    expect(cvOriginalMimeType('inconnu.xyz', new Uint8Array([1]))).toBe('application/octet-stream')
  })

  it('PDF et image s’affichent, le reste se télécharge', () => {
    expect(talentDocumentPreviewMode('application/pdf')).toBe('frame')
    expect(talentDocumentPreviewMode('image/jpeg')).toBe('image')
    expect(talentDocumentPreviewMode('application/msword')).toBe('download')
    expect(talentDocumentPreviewMode(null)).toBe('download')
  })

  it('l’URL signée vit cinq minutes au plus', () => {
    expect(TALENT_DOCUMENT_FILE_URL_TTL_SECONDS).toBeLessThanOrEqual(300)
    expect(
      talentDocumentFileUrlSchema.parse({
        url: 'https://x.supabase.co/storage/v1/object/sign/b/p?token=t',
        expiresAt: '2026-10-12T10:05:00.000Z',
        mimeType: 'application/pdf',
        filename: 'cv.pdf',
      }).mimeType,
    ).toBe('application/pdf')
  })
})

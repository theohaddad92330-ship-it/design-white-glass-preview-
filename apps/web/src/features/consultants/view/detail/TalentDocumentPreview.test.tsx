import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TalentDocument } from '@bellum/contracts'
import { TalentDocumentPreview } from './TalentDocumentPreview'
import { useTalentDocumentFileUrl, useTalentDocumentText } from '../../talent-api'

/**
 * #4034.4/.5 — « je veux voir le fichier, l'aperçu du CV ajouté » (Louis
 * 12/10). Un PANNEAU : PDF en cadre, image en image, DOCX/RTF/DOC en
 * « Télécharger l'original » ; le texte extrait toujours mis en page ; un CV
 * importé avant #4034 DIT que son original n'a pas été conservé.
 */
vi.mock('../../talent-api', () => ({
  useTalentDocumentFileUrl: vi.fn(),
  useTalentDocumentText: vi.fn(),
}))
vi.mock('../CvDropZone', () => ({
  CvDropZone: ({ attachToTalentId }: { attachToTalentId: string }) => (
    <div data-testid="cv-drop-zone">{attachToTalentId}</div>
  ),
}))

const TALENT = '11111111-1111-4111-8111-111111111111'
const URL_PDF = 'https://store.example/sign/ws/cv/d1/cv.pdf?token=t'

function doc(over: Partial<TalentDocument> = {}): TalentDocument {
  return {
    id: 'd1',
    kind: 'cv',
    filename: 'CV Yanis.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    extractedChars: 40,
    uploadedAt: '2026-10-12T10:00:00.000Z',
    uploadedByName: null,
    hasOriginal: true,
    ...over,
  }
}

function mockFile(data: { url: string; mimeType: string | null; filename: string } | undefined, isError = false) {
  vi.mocked(useTalentDocumentFileUrl).mockReturnValue({
    data: data ? { ...data, expiresAt: '2026-10-12T10:05:00.000Z' } : undefined,
    isLoading: false,
    isError,
  } as unknown as ReturnType<typeof useTalentDocumentFileUrl>)
}

function mockText(text: string, partial = false) {
  vi.mocked(useTalentDocumentText).mockReturnValue({
    data: { text, partial },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useTalentDocumentText>)
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockText('YANIS BERTHIER\nIngénieur plateforme')
})

describe('TalentDocumentPreview (#4034)', () => {
  it('un PDF s’affiche dans un cadre TITRÉ, avec l’original téléchargeable', () => {
    mockFile({ url: URL_PDF, mimeType: 'application/pdf', filename: 'CV Yanis.pdf' })
    render(<TalentDocumentPreview talentId={TALENT} document={doc()} open onOpenChange={() => undefined} />)

    expect(screen.getByRole('dialog', { name: 'Aperçu du CV' })).toBeTruthy()
    const frame = screen.getByTitle('Fichier original : CV Yanis.pdf')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('src')).toBe(URL_PDF)
    const download = screen.getByRole('link', { name: /Télécharger l’original/ })
    expect(download.getAttribute('href')).toContain('download=')
    expect(vi.mocked(useTalentDocumentFileUrl)).toHaveBeenCalledWith(TALENT, 'd1', true)
  })

  it('une image s’affiche en image, nommée', () => {
    mockFile({ url: 'https://store.example/sign/photo.png', mimeType: 'image/png', filename: 'cv.png' })
    render(
      <TalentDocumentPreview
        talentId={TALENT}
        document={doc({ filename: 'cv.png', mimeType: 'image/png' })}
        open
        onOpenChange={() => undefined}
      />,
    )
    expect(screen.getByRole('img', { name: 'Fichier original : cv.png' })).toBeTruthy()
  })

  it('un DOCX ne s’affiche pas : « Télécharger l’original » + le texte extrait mis en page', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    mockFile({ url: 'https://store.example/sign/cv.docx', mimeType: mime, filename: 'cv.docx' })
    render(
      <TalentDocumentPreview
        talentId={TALENT}
        document={doc({ filename: 'cv.docx', mimeType: mime })}
        open
        onOpenChange={() => undefined}
      />,
    )
    expect(screen.queryByTitle('Fichier original : cv.docx')).toBeNull()
    expect(screen.getByRole('link', { name: /Télécharger l’original/ })).toBeTruthy()
    expect(screen.getByText(/Ce format ne s’affiche pas/)).toBeTruthy()
    expect(screen.getByText(/YANIS BERTHIER/)).toBeTruthy()
  })

  it('#4034.5 — un CV sans original le DIT, propose la zone de dépôt, et ne demande AUCUNE URL', () => {
    mockFile(undefined)
    render(
      <TalentDocumentPreview
        talentId={TALENT}
        document={doc({ hasOriginal: false })}
        open
        onOpenChange={() => undefined}
      />,
    )
    expect(screen.getByText(/Original non conservé pour ce CV/)).toBeTruthy()
    expect(screen.getByTestId('cv-drop-zone').textContent).toBe(TALENT)
    expect(vi.mocked(useTalentDocumentFileUrl)).toHaveBeenCalledWith(TALENT, 'd1', false)
    expect(screen.queryByRole('link', { name: /Télécharger/ })).toBeNull()
    expect(screen.getByText(/YANIS BERTHIER/)).toBeTruthy()
  })

  it('un texte lu en partie se DIT', () => {
    mockFile(undefined)
    mockText('début seulement', true)
    render(
      <TalentDocumentPreview
        talentId={TALENT}
        document={doc({ hasOriginal: false })}
        open
        onOpenChange={() => undefined}
      />,
    )
    expect(screen.getByText(/n’a pas pu être lue/)).toBeTruthy()
  })

  it('un original qui ne s’ouvre pas se DIT, le texte reste lisible', () => {
    mockFile(undefined, true)
    render(<TalentDocumentPreview talentId={TALENT} document={doc()} open onOpenChange={() => undefined} />)
    expect(screen.getByText(/n’a pas pu être ouvert/)).toBeTruthy()
    expect(screen.getByText(/YANIS BERTHIER/)).toBeTruthy()
  })

  it('Échap ferme le panneau', () => {
    mockFile({ url: URL_PDF, mimeType: 'application/pdf', filename: 'CV Yanis.pdf' })
    const onOpenChange = vi.fn()
    render(<TalentDocumentPreview talentId={TALENT} document={doc()} open onOpenChange={onOpenChange} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * #2176.62 — le CV ORIGINAL, téléchargeable depuis la carte de matching.
 * Le droit se tranche côté API (`talent-document-file.spec.ts` : un talent
 * hors de l'espace → 404) ; l'écran, lui, n'ouvre RIEN sur un refus et le dit.
 */
const documents = vi.fn()
const documentFileUrl = vi.fn()
vi.mock('@/features/consultants/talent-api', () => ({
  talentApi: {
    documents: (id: string) => documents(id),
    documentFileUrl: (id: string, doc: string) => documentFileUrl(id, doc),
  },
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (message: string) => toastError(message), success: vi.fn() } }))

const { OriginalCvButton } = await import('./OriginalCvButton')

const doc = (over: Record<string, unknown>) => ({
  id: 'd-1',
  kind: 'cv',
  filename: 'cv.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  extractedChars: 10,
  uploadedAt: '2026-10-01T00:00:00Z',
  uploadedByName: null,
  hasOriginal: true,
  ...over,
})

describe('OriginalCvButton (#2176.62)', () => {
  beforeEach(() => {
    documents.mockReset()
    documentFileUrl.mockReset()
    toastError.mockReset()
  })

  it('ouvre l’URL signée du CV original le PLUS RÉCENT qui a gardé son fichier', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    documents.mockResolvedValue({
      items: [
        doc({ id: 'old', uploadedAt: '2026-01-01T00:00:00Z' }),
        doc({ id: 'recent', uploadedAt: '2026-10-01T00:00:00Z' }),
        doc({ id: 'newest-no-file', uploadedAt: '2026-10-20T00:00:00Z', hasOriginal: false }),
        doc({ id: 'cert', kind: 'certificate', uploadedAt: '2026-10-30T00:00:00Z' }),
      ],
    })
    documentFileUrl.mockResolvedValue({
      url: 'https://signed.example/cv.pdf',
      expiresAt: '',
      mimeType: null,
      filename: 'cv.pdf',
    })
    render(<OriginalCvButton consultantId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le CV original' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/cv.pdf', '_blank', 'noopener'))
    expect(documentFileUrl).toHaveBeenCalledWith('c-1', 'recent')
    open.mockRestore()
  })

  it('REFUS de l’API (pas le droit de lire ce consultant) : rien ne s’ouvre, l’écran le dit', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    documents.mockRejectedValue(Object.assign(new Error('Talent introuvable'), { status: 404 }))
    render(<OriginalCvButton consultantId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le CV original' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('CV original inaccessible : Talent introuvable'))
    expect(open).not.toHaveBeenCalled()
    expect(documentFileUrl).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('aucun original conservé : le dit, sans rien inventer', async () => {
    documents.mockResolvedValue({ items: [doc({ hasOriginal: false })] })
    render(<OriginalCvButton consultantId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le CV original' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Aucun CV original conservé pour ce profil'))
    expect(documentFileUrl).not.toHaveBeenCalled()
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RfpSourceDocuments } from './RfpSourceDocuments'

/**
 * #2957 (#2180.54) — les documents SOURCES d'un dossier RFP, en lecture seule.
 *
 *  · aucun fichier conservé → aucune carte (« on n'affiche pas ce qu'on n'a pas ») ;
 *  · un fichier conservé → nommé, ouvrable au clic (URL signée à la demande) ;
 *  · plusieurs fichiers → tous listés, dans l'ordre rendu par le serveur.
 */

const { rfpSourceDocuments, rfpDownloadSourceDocument } = vi.hoisted(() => ({
  rfpSourceDocuments: vi.fn(),
  rfpDownloadSourceDocument: vi.fn(),
}))
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    rfpKeys: actual.rfpKeys,
    rfpApi: { sourceDocuments: rfpSourceDocuments, downloadSourceDocument: rfpDownloadSourceDocument },
  }
})

const RFP_ID = '11111111-1111-4111-8111-111111111111'
const FILE = {
  id: '22222222-2222-4222-8222-222222222222',
  fileName: 'Consultation_infrastructure_cloud.pdf',
  contentType: 'application/pdf',
  byteSize: 4200,
  retentionUntil: '2031-09-30',
  uploadedAt: '2026-09-30T00:00:00.000Z',
  downloadPath: `/rfp/${RFP_ID}/documents/22222222-2222-4222-8222-222222222222/download`,
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <RfpSourceDocuments rfpId={RFP_ID} />
    </QueryClientProvider>,
  )
}

describe('RfpSourceDocuments', () => {
  it('aucun fichier conservé — aucune carte, jamais une ligne vide', async () => {
    rfpSourceDocuments.mockResolvedValue({ files: [], usedBytes: 0, quotaBytes: 1_000 })
    renderCard()

    await waitFor(() => expect(rfpSourceDocuments).toHaveBeenCalledWith(RFP_ID))
    expect(screen.queryByText('Documents sources')).not.toBeInTheDocument()
  })

  it('un fichier conservé — nommé, sous la carte « Documents sources »', async () => {
    rfpSourceDocuments.mockResolvedValue({ files: [FILE], usedBytes: 4200, quotaBytes: 1_000_000 })
    renderCard()

    expect(await screen.findByText('Documents sources')).toBeInTheDocument()
    expect(screen.getByText('Consultation_infrastructure_cloud.pdf')).toBeInTheDocument()
  })

  it('« Ouvrir » demande une URL signée AU CLIC, jamais avant', async () => {
    rfpSourceDocuments.mockResolvedValue({ files: [FILE], usedBytes: 4200, quotaBytes: 1_000_000 })
    rfpDownloadSourceDocument.mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: '2026-09-30T00:05:00.000Z',
      fileName: FILE.fileName,
    })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    renderCard()
    await screen.findByText(FILE.fileName)

    expect(rfpDownloadSourceDocument).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: `Ouvrir ${FILE.fileName}` }))

    await waitFor(() => expect(rfpDownloadSourceDocument).toHaveBeenCalledWith(RFP_ID, FILE.id))
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('https://storage.example/signed', '_blank', 'noopener,noreferrer'),
    )
    openSpy.mockRestore()
  })
})

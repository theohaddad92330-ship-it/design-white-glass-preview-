import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CvMailImportDialog } from './CvMailImportDialog'
import { useCvMailImport, useMailAttachments } from '../hooks'
import { useMailSearch, useMailboxStatus } from '@/features/mailbox/api'

vi.mock('../hooks', () => ({ useCvMailImport: vi.fn(), useMailAttachments: vi.fn() }))
vi.mock('@/features/mailbox/api', () => ({ useMailboxStatus: vi.fn(), useMailSearch: vi.fn() }))

/**
 * #2568.1 — le GESTE « depuis une pièce jointe » dans le vivier. Back-end
 * livré et testé (`cv-batch-import.service.spec.ts`, `mailbox.service.spec.ts`),
 * sans appelant web avant ce lot.
 *
 * Ce que ces tests protègent :
 *  - le bouton N'EXISTE PAS tant qu'aucune messagerie n'est branchée — jamais
 *    un bouton mort ;
 *  - un fil sans détail de messages le DIT, jamais un vide silencieux
 *    (`noMessages`, même discipline que `ThreadDrawer.historyUnavailable`).
 */
function statusMock(connected: boolean, isLoading = false) {
  vi.mocked(useMailboxStatus).mockReturnValue({
    data: isLoading ? undefined : { connected, provider: connected ? 'google' : null, address: null, capabilities: {} },
    isLoading,
  } as unknown as ReturnType<typeof useMailboxStatus>)
}

function searchMock(threads: unknown[], isLoading = false) {
  vi.mocked(useMailSearch).mockReturnValue({
    data: isLoading ? undefined : { provider: 'google', intent: 'cv', threads, resolvedQuery: '', truncated: false },
    isLoading,
  } as unknown as ReturnType<typeof useMailSearch>)
}

function attachmentsMock(items: unknown[] | undefined, isLoading = false) {
  vi.mocked(useMailAttachments).mockReturnValue({ data: items, isLoading } as unknown as ReturnType<
    typeof useMailAttachments
  >)
}

function mailImportMock(result: unknown) {
  const mutateAsync = vi.fn().mockResolvedValue(result)
  vi.mocked(useCvMailImport).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
    typeof useCvMailImport
  >)
  return mutateAsync
}

describe('CvMailImportDialog', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    attachmentsMock(undefined)
    mailImportMock({ status: 'created', file: 'cv.pdf', consultantId: 'c9' })
  })

  it('n’existe pas tant qu’aucune boîte n’est branchée — jamais un bouton mort', () => {
    statusMock(false)
    searchMock([])
    render(<CvMailImportDialog />)
    expect(screen.queryByRole('button', { name: 'Importer depuis un e-mail' })).not.toBeInTheDocument()
  })

  it('n’existe pas tant que l’état de la messagerie n’est pas connu', () => {
    statusMock(false, true)
    searchMock([])
    render(<CvMailImportDialog />)
    expect(screen.queryByRole('button', { name: 'Importer depuis un e-mail' })).not.toBeInTheDocument()
  })

  it('une boîte branchée : le bouton existe et ouvre la recherche des fils avec CV', () => {
    statusMock(true)
    searchMock([])
    render(<CvMailImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Importer depuis un e-mail' }))
    expect(screen.getByText('Aucun fil avec pièce jointe trouvé sur les 90 derniers jours.')).toBeInTheDocument()
  })

  it('un fil sans détail de messages le DIT, jamais un vide silencieux', () => {
    statusMock(true)
    searchMock([
      { threadId: 't1', subject: 'CV envoyé', counterpart: 'a@x.example', hasAttachments: true, messages: [] },
    ])
    render(<CvMailImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Importer depuis un e-mail' }))
    expect(
      screen.getByText('Ce fil ne détaille pas encore ses messages — reviens-y une fois la messagerie resynchronisée.'),
    ).toBeInTheDocument()
  })

  it('liste les pièces jointes d’un message autorisé, puis importe celle choisie', async () => {
    statusMock(true)
    searchMock([
      {
        threadId: 't1',
        subject: 'CV envoyé',
        counterpart: 'a@x.example',
        hasAttachments: true,
        messages: [
          {
            id: 'm1',
            threadId: 't1',
            subject: 'CV envoyé',
            from: 'a@x.example',
            to: [],
            cc: [],
            date: null,
            snippet: null,
            unread: false,
            hasAttachments: true,
            direction: 'inbound',
          },
        ],
      },
    ])
    const mutateAsync = mailImportMock({ status: 'created', file: 'cv.pdf', consultantId: 'c9' })
    attachmentsMock([
      { messageId: 'm1', attachmentId: 'att1', filename: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
    ])
    render(<CvMailImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Importer depuis un e-mail' }))

    fireEvent.click(screen.getByRole('button', { name: 'Voir les pièces jointes' }))
    // `useMailAttachments` est appelé pour CE message précis — jamais deviné.
    expect(useMailAttachments).toHaveBeenLastCalledWith('m1')

    const importButton = await screen.findByRole('button', { name: 'Importer cv.pdf' })
    fireEvent.click(importButton)

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ messageId: 'm1', attachmentId: 'att1' }))
    expect(await screen.findByText('cv.pdf — fiche créée')).toBeInTheDocument()
  })

  it('#2326.13 — une mise à jour automatique NOMME sa provenance', async () => {
    statusMock(true)
    searchMock([
      {
        threadId: 't1',
        subject: 'CV envoyé',
        counterpart: 'a@x.example',
        hasAttachments: true,
        messages: [
          {
            id: 'm1',
            threadId: 't1',
            subject: 'CV envoyé',
            from: 'a@x.example',
            to: [],
            cc: [],
            date: null,
            snippet: null,
            unread: false,
            hasAttachments: true,
            direction: 'inbound',
          },
        ],
      },
    ])
    const mutateAsync = mailImportMock({
      status: 'auto_updated',
      file: 'cv.pdf',
      consultantId: 'c9',
      contentReplaced: true,
      matchedOn: 'same_phone',
    })
    attachmentsMock([
      { messageId: 'm1', attachmentId: 'att1', filename: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
    ])
    render(<CvMailImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Importer depuis un e-mail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voir les pièces jointes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Importer cv.pdf' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(await screen.findByText(/même téléphone/)).toBeInTheDocument()
  })
})

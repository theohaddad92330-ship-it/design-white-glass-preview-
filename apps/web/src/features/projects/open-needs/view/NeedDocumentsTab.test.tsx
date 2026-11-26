import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { NeedDocument, NeedDocumentFile, OpenNeedRow } from '@bellum/contracts'

/** L'onglet DOCUMENTS — devis, NDA, contrat cadre, leur statut, et depuis le
 *  31/08/2026 leur FICHIER. */

const documents = vi.fn()
const files = vi.fn()
const open = vi.fn()
const changeStatus = vi.fn()

vi.mock('../hooks/useNeedDocuments', () => ({ useNeedDocuments: () => documents() }))
vi.mock('./NeedDocumentsUpload', () => ({
  useNeedDocumentFiles: () => files(),
  useOpenNeedDocument: () => ({ mutate: open, isPending: false }),
  useUpdateNeedDocumentStatus: () => ({ mutate: changeStatus, isPending: false }),
  // Le dépôt est testé pour lui-même ; ici on vérifie seulement qu'il EST offert.
  NeedDocumentDeposit: () => <div data-testid="deposit" />,
}))

const { NeedDocumentsTab } = await import('./NeedDocumentsTab')

/**
 * jsdom n'implémente PAS l'API de capture de pointeur, dont le menu déroulant
 * a besoin pour s'ouvrir. Sans ces trois lignes, le test « le clic écrit » ne
 * peut pas exister — et c'est exactement le test qui compte : le défaut n°1 de
 * ce dépôt est un chemin d'écriture que personne n'appelle.
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
})

function need(): OpenNeedRow {
  return { id: 'n-1', title: 'Ingénieur données' } as unknown as OpenNeedRow
}

function doc(over: Partial<NeedDocument> = {}): NeedDocument {
  return {
    id: 'd-1',
    needId: 'n-1',
    kind: 'quote',
    name: 'Devis_ClientDior_20052026.pdf',
    status: 'sent',
    createdAt: '2026-05-20T09:00:00.000Z',
    updatedAt: '2026-05-20T09:00:00.000Z',
    ...over,
  }
}

function file(over: Partial<NeedDocumentFile> = {}): NeedDocumentFile {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    documentId: 'd-1',
    fileName: 'Devis_ClientDior_20052026.pdf',
    contentType: 'application/pdf',
    byteSize: 128_000,
    retentionUntil: '2031-05-20',
    uploadedAt: '2026-05-20T09:00:00.000Z',
    downloadPath: '/projects/needs/n-1/documents/d-1/download',
    ...over,
  }
}

/** Aucun fichier lu, et aucune erreur : le cas d'une fiche d'avant le stockage. */
function noFiles(over: Partial<ReturnType<typeof filesState>> = {}) {
  return filesState(over)
}

function filesState(over: Partial<{ byDocument: Map<string, NeedDocumentFile>; isError: boolean }> = {}) {
  return {
    byDocument: over.byDocument ?? new Map<string, NeedDocumentFile>(),
    usedBytes: 0,
    quotaBytes: 2_000_000_000,
    isError: over.isError ?? false,
  }
}

describe('NeedDocumentsTab', () => {
  it('rend chaque document avec sa nature et son nom', () => {
    documents.mockReturnValue({
      items: [
        doc({ id: 'd-1', kind: 'quote', status: 'sent' }),
        doc({ id: 'd-2', kind: 'nda', name: 'NDA_BellumAI_Dior.pdf', status: 'signed' }),
        doc({ id: 'd-3', kind: 'master_agreement', name: 'Contrat_cadre.pdf', status: 'pending' }),
      ],
      isLoading: false,
      isError: false,
    })
    files.mockReturnValue(noFiles())
    render(<NeedDocumentsTab need={need()} />)
    expect(screen.getByText('Devis_ClientDior_20052026.pdf')).toBeInTheDocument()
    expect(screen.getByText('NDA')).toBeInTheDocument()
    expect(screen.getByText('Contrat cadre')).toBeInTheDocument()
  })

  it('dit qu’aucun document n’existe, sans inventer une liste vide déguisée', () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: false })
    files.mockReturnValue(noFiles())
    render(<NeedDocumentsTab need={need()} />)
    expect(screen.getByText(/Aucun document sur ce besoin/)).toBeInTheDocument()
    // Le dépôt reste offert : c'est PAR LÀ qu'on sort de l'écran vide.
    expect(screen.getByTestId('deposit')).toBeInTheDocument()
  })

  it('distingue un échec de lecture d’une absence réelle de document', () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: true })
    files.mockReturnValue(noFiles())
    render(<NeedDocumentsTab need={need()} />)
    expect(screen.getByText(/pas pu être chargés/)).toBeInTheDocument()
  })

  it('n’offre AUCUNE ouverture sur un document sans fichier — et le DIT', () => {
    // Un bouton qui n'ouvre rien est une donnée fictive sous forme
    // d'affordance : on le découvre en réunion, pas en CI.
    documents.mockReturnValue({ items: [doc()], isLoading: false, isError: false })
    files.mockReturnValue(noFiles())
    render(<NeedDocumentsTab need={need()} />)
    expect(screen.queryByRole('button', { name: /Ouvrir/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Aucun fichier déposé/)).toBeInTheDocument()
  })

  it('OUVRE la pièce rangée, et demande l’URL signée au clic', async () => {
    documents.mockReturnValue({ items: [doc()], isLoading: false, isError: false })
    files.mockReturnValue(filesState({ byDocument: new Map([['d-1', file()]]) }))
    render(<NeedDocumentsTab need={need()} />)

    // La taille et l'échéance de conservation sont AFFICHÉES.
    expect(screen.getByText(/125 KB · à conserver jusqu’au 2031-05-20/)).toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Ouvrir Devis_ClientDior_20052026.pdf/ }))
    expect(open).toHaveBeenCalledWith('/projects/needs/n-1/documents/d-1/download')
  })

  it('un échec de lecture des FICHIERS ne se rend pas comme « aucun fichier »', () => {
    // Dire « aucun fichier » sur une lecture ratée ferait redéposer une pièce
    // qui est déjà là.
    documents.mockReturnValue({ items: [doc()], isLoading: false, isError: false })
    files.mockReturnValue(filesState({ isError: true }))
    render(<NeedDocumentsTab need={need()} />)
    expect(screen.getByText(/pas pu être lus/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun fichier déposé/)).not.toBeInTheDocument()
  })

  it('offre le changement de STATUT — le geste que la fiche n’avait pas', async () => {
    documents.mockReturnValue({ items: [doc({ status: 'sent' })], isLoading: false, isError: false })
    files.mockReturnValue(noFiles())
    render(<NeedDocumentsTab need={need()} />)

    // Le contrôle porte un nom accessible qui DÉSIGNE le document : sur trois
    // pièces, « Statut » tout court ne dirait pas laquelle on change.
    const control = screen.getByRole('combobox', { name: /Statut de Devis_ClientDior_20052026.pdf/ })
    expect(control).toBeInTheDocument()
    await userEvent.click(control)
    await userEvent.click(await screen.findByRole('option', { name: 'Signé' }))
    expect(changeStatus).toHaveBeenCalledWith({ documentId: 'd-1', status: 'signed' })
  })
})

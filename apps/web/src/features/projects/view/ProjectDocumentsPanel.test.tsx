import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectDocument } from '@bellum/contracts'

/**
 * #2171.24 — Section « Documents » de la fiche opportunité.
 *
 * `useProjectDocuments` / `useCreateProjectDocument` /
 * `useUpdateProjectDocumentStatus` sont MOQUÉS : ce fichier garde le RENDU et
 * le GESTE, pas la lecture réseau (déjà couverte côté service, API).
 */

const documents = vi.fn()
const create = vi.fn()
const updateStatus = vi.fn()
vi.mock('../hooks/useProjectDocuments', () => ({
  useProjectDocuments: () => documents(),
  useCreateProjectDocument: () => ({ mutate: create, isPending: false }),
  useUpdateProjectDocumentStatus: () => ({ mutate: updateStatus }),
}))

const { ProjectDocumentsPanel } = await import('./ProjectDocumentsPanel')

function doc(over: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: 'd-1',
    projectId: 'p-1',
    kind: 'quote',
    name: 'Devis_ClientDior.pdf',
    status: 'sent',
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  documents.mockReset()
  create.mockReset()
  updateStatus.mockReset()
})

describe('ProjectDocumentsPanel', () => {
  it('liste un document avec sa nature et son statut', () => {
    documents.mockReturnValue({ items: [doc()], isLoading: false, isError: false })
    render(<ProjectDocumentsPanel projectId="p-1" />)
    const name = screen.getByText('Devis_ClientDior.pdf')
    expect(name).toBeInTheDocument()
    // « Devis » apparaît aussi dans le sélecteur de nature du formulaire
    // d'ajout : on vérifie la nature DANS la ligne du document, pas ailleurs.
    expect(name.closest('[data-testid="project-document-row"]')?.textContent).toContain('Devis')
  })

  it("n'affiche AUCUNE ligne sans document suivi — une liste vide n'invente rien", () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<ProjectDocumentsPanel projectId="p-1" />)
    expect(screen.queryByText('Devis_ClientDior.pdf')).not.toBeInTheDocument()
  })

  it('un échec de lecture ne se lit jamais « aucun document »', () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: true })
    render(<ProjectDocumentsPanel projectId="p-1" />)
    expect(screen.getByText('Les documents n’ont pas pu être chargés.')).toBeInTheDocument()
  })

  it('suit un document neuf — nature et nom, sans fichier', async () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<ProjectDocumentsPanel projectId="p-1" />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Nom du document' }), 'NDA_BellumAI.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Suivre ce document' }))

    expect(create).toHaveBeenCalledWith({ kind: 'quote', name: 'NDA_BellumAI.pdf' }, expect.anything())
  })

  it('change le statut d’un document depuis la liste', async () => {
    documents.mockReturnValue({ items: [doc({ id: 'd-1', status: 'sent' })], isLoading: false, isError: false })
    render(<ProjectDocumentsPanel projectId="p-1" />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Statut de Devis_ClientDior.pdf' }))
    await userEvent.click(screen.getByRole('option', { name: 'Signé' }))

    expect(updateStatus).toHaveBeenCalledWith({ documentId: 'd-1', status: 'signed' })
  })
})

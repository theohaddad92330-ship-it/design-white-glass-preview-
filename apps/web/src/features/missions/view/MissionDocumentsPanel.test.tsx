import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionDocument } from '@bellum/contracts'

/**
 * #2193.51 (épopée #2953) — Section « Documents » du dossier mission.
 *
 * `useMissionDocuments` / `useCreateMissionDocument` /
 * `useUpdateMissionDocumentStatus` sont MOQUÉS : ce fichier garde le RENDU et
 * le GESTE, pas la lecture réseau (déjà couverte côté service, API) — même
 * discipline que `ProjectDocumentsPanel.test.tsx` (#2171.24).
 */

const documents = vi.fn()
const create = vi.fn()
const updateStatus = vi.fn()
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    useMissionDocuments: () => documents(),
    useCreateMissionDocument: () => ({ mutate: create, isPending: false }),
    useUpdateMissionDocumentStatus: () => ({ mutate: updateStatus }),
  }
})

const { MissionDocumentsPanel } = await import('./MissionDocumentsPanel')

function doc(over: Partial<MissionDocument> = {}): MissionDocument {
  return {
    id: 'd-1',
    missionId: 'm-1',
    kind: 'contract',
    name: 'Contrat_Fiabilisation.pdf',
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

describe('MissionDocumentsPanel', () => {
  it('liste un document avec sa nature et son statut', () => {
    documents.mockReturnValue({ items: [doc()], isLoading: false, isError: false })
    render(<MissionDocumentsPanel missionId="m-1" />)
    const name = screen.getByText('Contrat_Fiabilisation.pdf')
    expect(name).toBeInTheDocument()
    // « Contrat » apparaît aussi dans le sélecteur de nature du formulaire
    // d'ajout : on vérifie la nature DANS la ligne du document, pas ailleurs.
    expect(name.closest('[data-testid="mission-document-row"]')?.textContent).toContain('Contrat')
  })

  it("n'affiche AUCUNE ligne sans document suivi — une liste vide n'invente rien", () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<MissionDocumentsPanel missionId="m-1" />)
    expect(screen.queryByText('Contrat_Fiabilisation.pdf')).not.toBeInTheDocument()
  })

  it('un échec de lecture ne se lit jamais « aucun document »', () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: true })
    render(<MissionDocumentsPanel missionId="m-1" />)
    expect(screen.getByText('Les documents n’ont pas pu être chargés.')).toBeInTheDocument()
  })

  it('suit un document neuf — nature et nom, sans fichier', async () => {
    documents.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<MissionDocumentsPanel missionId="m-1" />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Nom du document' }), 'NDA_BellumAI.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Suivre ce document' }))

    expect(create).toHaveBeenCalledWith({ kind: 'contract', name: 'NDA_BellumAI.pdf' }, expect.anything())
  })

  it('change le statut d’un document depuis la liste', async () => {
    documents.mockReturnValue({ items: [doc({ id: 'd-1', status: 'sent' })], isLoading: false, isError: false })
    render(<MissionDocumentsPanel missionId="m-1" />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Statut de Contrat_Fiabilisation.pdf' }))
    await userEvent.click(screen.getByRole('option', { name: 'Signé' }))

    expect(updateStatus).toHaveBeenCalledWith({ documentId: 'd-1', status: 'signed' })
  })
})

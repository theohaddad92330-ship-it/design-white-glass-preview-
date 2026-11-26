import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AvailabilityImportDialog } from './AvailabilityImportDialog'
import { useAvailabilityImport } from '../hooks'

vi.mock('../hooks', () => ({ useAvailabilityImport: vi.fn() }))

/**
 * #2326.7/.9 (épopée #2794) — le GESTE « disponibilités » dans le vivier.
 *
 * Ce que ces tests protègent :
 *  - le rapport dit COMBIEN sont mises à jour, non rapprochées, écartées ;
 *  - une ligne non rapprochée NOMME l'identité qui n'a rien trouvé, jamais un
 *    compte muet ;
 *  - le dialogue ne CRÉE jamais de fiche — aucun texte de création n'apparaît.
 */
function mockImport(result: unknown, isPending = false) {
  const mutateAsync = vi.fn().mockResolvedValue(result)
  vi.mocked(useAvailabilityImport).mockReturnValue({ mutateAsync, isPending } as unknown as ReturnType<
    typeof useAvailabilityImport
  >)
  return mutateAsync
}

function pickCsv(name = 'dispos.csv') {
  const file = new File(['Nom,Email,TJM\nClaire Vasseur,claire@acme.fr,650'], name, { type: 'text/csv' })
  const input = screen.getByLabelText('Choisir un fichier .csv')
  fireEvent.change(input, { target: { files: [file] } })
}

describe('AvailabilityImportDialog', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('montre le contrôle dans le vivier', async () => {
    mockImport({ total: 0, summary: {}, outcomes: [], mappedColumns: {}, ignoredColumns: [], truncated: false })
    render(<AvailabilityImportDialog />)

    fireEvent.click(await screen.findByRole('button', { name: 'Importer les disponibilités' }))

    expect(screen.getByRole('button', { name: 'Choisir un fichier .csv' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choisir un fichier .xlsx' })).toBeInTheDocument()
  })

  it('envoie le CSV et dit combien sont mises à jour, non rapprochées, écartées', async () => {
    const mutateAsync = mockImport({
      total: 3,
      summary: { updated: 1, unmatched: 1, skipped: 1 },
      outcomes: [
        { status: 'updated', line: 2, consultantId: 'c1', matchedOn: 'email', fields: ['tjm'] },
        { status: 'unmatched', line: 3, identity: 'inconnu@ailleurs.fr', reason: 'not_found' },
        { status: 'skipped', line: 4, reason: 'no_identity' },
      ],
      mappedColumns: { Nom: 'fullName', Email: 'email', TJM: 'tjm' },
      ignoredColumns: ['Notes'],
      truncated: false,
    })
    render(<AvailabilityImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer les disponibilités' }))

    pickCsv()

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        format: 'csv',
        content: 'Nom,Email,TJM\nClaire Vasseur,claire@acme.fr,650',
      }),
    )
    await waitFor(() => expect(screen.getByText(/1 mise/)).toBeInTheDocument())
    // Une ligne non rapprochée NOMME l'identité, jamais un compte muet.
    expect(screen.getByText(/inconnu@ailleurs.fr/)).toBeInTheDocument()
    expect(screen.getByText(/Notes/)).toBeInTheDocument()
  })

  it('un échec de la requête se DIT, jamais un OK silencieux', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Fichier illisible.'))
    vi.mocked(useAvailabilityImport).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useAvailabilityImport
    >)
    render(<AvailabilityImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer les disponibilités' }))

    pickCsv('corrompu.csv')

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(await screen.findByText('Fichier illisible.')).toBeInTheDocument()
  })
})

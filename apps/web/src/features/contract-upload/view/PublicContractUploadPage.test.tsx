import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicContractUploadNotFound, PublicContractUploadPage } from './PublicContractUploadPage'

const deposit = vi.hoisted(() => vi.fn())
vi.mock('@/features/contract-upload/api', () => ({
  depositContractUploadFile: deposit,
  readFileAsBase64: vi.fn().mockResolvedValue('AAAA'),
}))

const status = {
  status: 'valid' as const,
  contractLabel: 'Contrat cadre 2026',
  missionLabel: 'Mission data',
  accountName: 'Société Générale',
  acceptedExtensions: '.pdf',
  maxBytes: 1_000_000,
}

/**
 * Grammaire `onboarding-accueil` : l'en-tête de page (surtitre, h1 = le compte,
 * contrat et mission) précède la carte du dépôt ; une pièce déposée se nomme
 * par une pastille teintée.
 */
describe('PublicContractUploadPage — dépôt public dans la grammaire Théo', () => {
  it('pose le titre hors de la carte, le geste dans la carte', () => {
    render(<PublicContractUploadPage token="tok" status={status} />)
    const heading = screen.getByTestId('upload-heading')
    expect(within(heading).getByRole('heading', { level: 1 }).textContent).toMatch(/Société Générale/)
    expect(heading.textContent).toMatch(/Mission data/)
    const card = screen.getByTestId('upload-card')
    expect(card.querySelector('h1')).toBeNull()
    expect(heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(card).getByRole('button', { name: /Déposer|Upload|Envoyer|Send/i })).toBeTruthy()
  })

  it('après dépôt : pastille succès et nom du fichier', async () => {
    deposit.mockResolvedValue({ fileName: 'contrat.pdf' })
    render(<PublicContractUploadPage token="tok" status={status} />)
    const input = screen.getByLabelText(/Choisir|Choose/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'contrat.pdf', { type: 'application/pdf' })] } })
    const card = screen.getByTestId('upload-card')
    const buttons = within(card).getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1]!)
    await waitFor(() => expect(screen.getByText(/^(Déposée|Uploaded)$/)).toBeTruthy())
    expect(screen.getByText(/^(Déposée|Uploaded)$/).className).toMatch(/success-soft/)
    expect(card.textContent).toMatch(/contrat\.pdf/)
  })

  it('lien introuvable : en-tête de page nommé', () => {
    render(<PublicContractUploadNotFound />)
    expect(within(screen.getByTestId('upload-heading')).getByRole('heading', { level: 1 })).toBeTruthy()
  })
})

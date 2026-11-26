import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceAttachments } from './InvoiceAttachments'

/**
 * #2814 — les pièces jointes sur la prévisualisation de la facture préparée.
 *
 *  · la liste se lit par mission ET par mois, jamais un chemin de magasin ;
 *  · ouvrir = demander une URL signée à la porte de l'API, au clic ;
 *  · sans `finance:write` ou en démonstration : on CONSULTE, on ne dépose rien ;
 *  · un fichier refusé localement (type, taille) ne part pas au serveur.
 */

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

const MISSION = '11111111-1111-4111-8111-111111111111'
const MONTH = '2026-09-01'
const FILE = {
  id: '33333333-3333-4333-8333-333333333333',
  fileName: 'Bon-de-commande-signe.pdf',
  contentType: 'application/pdf',
  byteSize: 1200,
  retentionUntil: '2036-09-25',
  uploadedAt: '2026-09-25T10:00:00.000Z',
  downloadPath: `/delivery/invoice-attachments/${MISSION}/${MONTH}/33333333-3333-4333-8333-333333333333/download`,
}

function show(props: { canWrite: boolean; demo?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InvoiceAttachments
        missionId={MISSION}
        periodMonth={MONTH}
        canWrite={props.canWrite}
        demo={props.demo ?? false}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation((request: { path: string; method?: string }) => {
    if (request.path === `/delivery/invoice-attachments/${MISSION}/${MONTH}` && !request.method) {
      return Promise.resolve({ files: [FILE] })
    }
    if (request.path === FILE.downloadPath) {
      return Promise.resolve({ url: 'https://signed.example/x', expiresAt: 'x', fileName: FILE.fileName })
    }
    return Promise.resolve(undefined)
  })
})
afterEach(cleanup)

describe('InvoiceAttachments (#2814)', () => {
  it('liste les pièces de CE mois de CETTE mission', async () => {
    show({ canWrite: true })
    expect(await screen.findByText('Bon-de-commande-signe.pdf')).toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith({ path: `/delivery/invoice-attachments/${MISSION}/${MONTH}` })
  })

  it('dit qu’aucune pièce n’est jointe — jamais une liste vide muette', async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve({ files: [] }))
    show({ canWrite: true })
    expect(await screen.findByText('Aucune pièce jointe à cette facture.')).toBeInTheDocument()
  })

  it('ouvre une pièce par une URL SIGNÉE demandée au clic', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    show({ canWrite: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir Bon-de-commande-signe.pdf' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/x', '_blank', 'noopener,noreferrer'))
    open.mockRestore()
  })

  it('SAIT DIRE NON — sans droit d’écriture finance, aucun bouton de dépôt ni de retrait', async () => {
    show({ canWrite: false })
    await screen.findByText('Bon-de-commande-signe.pdf')
    expect(screen.queryByRole('button', { name: 'Joindre une pièce' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retirer/ })).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — en démonstration, on consulte, on ne dépose rien', async () => {
    show({ canWrite: true, demo: true })
    await screen.findByText('Bon-de-commande-signe.pdf')
    expect(screen.queryByRole('button', { name: 'Joindre une pièce' })).not.toBeInTheDocument()
    expect(screen.getByText(/Démonstration : les pièces se consultent/)).toBeInTheDocument()
  })

  it('un type refusé ne part PAS au serveur, et le refus est nommé', async () => {
    show({ canWrite: true })
    await screen.findByText('Bon-de-commande-signe.pdf')
    const input = screen.getByLabelText('Joindre une pièce', { selector: 'input' })
    await userEvent.upload(input, new File(['MZ'], 'outil.exe', { type: 'application/octet-stream' }), {
      applyAccept: false,
    })
    expect(await screen.findByText(/Ce type de fichier n’est pas accepté/)).toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
  })

  it('dépose une pièce acceptée sur la route de CE mois', async () => {
    show({ canWrite: true })
    await screen.findByText('Bon-de-commande-signe.pdf')
    const input = screen.getByLabelText('Joindre une pièce', { selector: 'input' })
    await userEvent.upload(input, new File(['%PDF-1.4'], 'PV.pdf', { type: 'application/pdf' }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/delivery/invoice-attachments/${MISSION}/${MONTH}`,
          method: 'POST',
          body: expect.objectContaining({ fileName: 'PV.pdf' }),
        }),
      ),
    )
  })

  it('retire une pièce par la route bornée de CE mois', async () => {
    show({ canWrite: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Bon-de-commande-signe.pdf' }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: `/delivery/invoice-attachments/${MISSION}/${MONTH}/${FILE.id}`,
        method: 'DELETE',
      }),
    )
  })
})

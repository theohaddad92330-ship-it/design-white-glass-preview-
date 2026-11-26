import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { SignatureHandoff } from './SignatureHandoff'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

// #4016 L12 (Louis 15/10) — prépare + ouvre l'outil du client par lien ; « signé » lu seulement si connecté.
describe('SignatureHandoff', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('outil connecté : un LIEN vers l’outil, ouvert dans un nouvel onglet — aucune création de demande', async () => {
    apiFetch.mockResolvedValue({ connected: ['yousign', 'qonto'] })
    render(<SignatureHandoff />, { wrapper })
    const link = await screen.findByRole('link', { name: /Ouvrir mon outil de signature/ })
    expect(link).toHaveAttribute('href', 'https://app.yousign.com/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getAllByRole('link')).toHaveLength(1) // un outil de facturation n'est pas de signature
    expect(apiFetch).toHaveBeenCalledTimes(1) // une seule lecture : le statut de connexion
    expect(apiFetch.mock.calls[0]?.[0]).toMatchObject({ path: '/admin-docs/status' })
  })

  it('aucun outil connecté : pas de lien, et le statut « signé » est dit NON LU', async () => {
    apiFetch.mockResolvedValue({ connected: [] })
    render(<SignatureHandoff />, { wrapper })
    expect(await screen.findByTestId('signature-not-read')).toHaveTextContent(/non lu/i)
    expect(screen.queryByRole('link')).toBeNull()
  })

  // #4016.121 — « Relire le statut » interroge l'outil branché À LA DEMANDE ; rien n'est lu avant le clic.
  describe('#4016.121 — relire le statut à la demande', () => {
    it('aucun outil connecté : pas de bouton', async () => {
      apiFetch.mockResolvedValue({ connected: [] })
      render(<SignatureHandoff />, { wrapper })
      await screen.findByTestId('signature-not-read')
      expect(screen.queryByRole('button', { name: /Relire le statut/ })).toBeNull()
    })

    it('le clic lit les signatures de l’outil et NOMME ce qui attend, sans rien présumer signé', async () => {
      apiFetch.mockImplementation(async ({ path }: { path: string }) =>
        path === '/admin-docs/signatures'
          ? {
              items: [
                {
                  id: 's1',
                  provider: 'yousign',
                  title: 'Contrat cadre',
                  signer: 'A. Martin',
                  sentAt: null,
                  daysWaiting: 4,
                },
              ],
              unavailable: [],
            }
          : { connected: ['yousign'] },
      )
      render(<SignatureHandoff />, { wrapper })
      const button = await screen.findByRole('button', { name: /Relire le statut/ })
      expect(apiFetch.mock.calls.some(call => call[0]?.path === '/admin-docs/signatures')).toBe(false)
      fireEvent.click(button)
      expect(await screen.findByTestId('signature-reading')).toHaveTextContent(/Contrat cadre/)
      expect(screen.getByTestId('signature-reading')).not.toHaveTextContent(/signé\b/i)
    })

    it('l’outil n’a pas répondu : « non lu », jamais « rien en attente »', async () => {
      apiFetch.mockImplementation(async ({ path }: { path: string }) =>
        path === '/admin-docs/signatures' ? { items: [], unavailable: ['yousign'] } : { connected: ['yousign'] },
      )
      render(<SignatureHandoff />, { wrapper })
      fireEvent.click(await screen.findByRole('button', { name: /Relire le statut/ }))
      expect(await screen.findByTestId('signature-reading')).toHaveTextContent(/non lu/i)
    })
  })

  // #4295.27 — avec une proposition, « Relire le statut » lit SA demande (identifiant retenu à l'envoi).
  describe('#4295.27 — le statut de LA demande de cette proposition', () => {
    const PROJECT = '11111111-1111-4111-8111-111111111111'
    const reading = (state: string, daysWaiting: number | null = null) =>
      apiFetch.mockImplementation(async ({ path }: { path: string }) =>
        path === `/admin-docs/signatures/proposal/${PROJECT}`
          ? { state, signatureRequestId: 'sr-1', sentAt: null, readAt: null, daysWaiting }
          : { connected: ['yousign'] },
      )

    it('lit la route de LA proposition, jamais la liste de tout le compte outil', async () => {
      reading('signed')
      render(<SignatureHandoff projectId={PROJECT} />, { wrapper })
      fireEvent.click(await screen.findByRole('button', { name: /Relire le statut/ }))
      expect(await screen.findByTestId('signature-reading')).toHaveTextContent(/Signée/)
      expect(apiFetch.mock.calls.some(call => call[0]?.path === '/admin-docs/signatures')).toBe(false)
    })

    it('en attente : les jours d’attente de CETTE demande', async () => {
      reading('pending', 4)
      render(<SignatureHandoff projectId={PROJECT} />, { wrapper })
      fireEvent.click(await screen.findByRole('button', { name: /Relire le statut/ }))
      expect(await screen.findByTestId('signature-reading')).toHaveTextContent(/depuis 4 jours/)
    })

    it('aucune demande rattachée : le dit, sans présumer signé', async () => {
      reading('not_sent')
      render(<SignatureHandoff projectId={PROJECT} />, { wrapper })
      fireEvent.click(await screen.findByRole('button', { name: /Relire le statut/ }))
      const node = await screen.findByTestId('signature-reading')
      expect(node).toHaveTextContent(/Aucune demande de signature n’est rattachée/)
      expect(node).not.toHaveTextContent(/Signée/)
    })
  })
})

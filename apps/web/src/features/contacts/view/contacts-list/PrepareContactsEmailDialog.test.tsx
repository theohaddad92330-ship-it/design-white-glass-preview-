import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PrepareContactsEmailDialog } from './PrepareContactsEmailDialog'

function wrapper(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const contact = (id: string, email: string | null = `${id}@corp.fr`) => ({
  id,
  full_name: `Contact ${id}`,
  title: 'DSI',
  email,
})

beforeEach(() => {
  apiFetch.mockReset()
})

/**
 * #3942.2 — spec de Louis (#3942, 08/10) : « un mail personnalisé par
 * personne qu'il valide ». Un contact à la fois, relu/modifié/validé — la
 * validation DÉPOSE (PATCH /contacts/:id/email-draft), elle n'envoie rien.
 */
describe('PrepareContactsEmailDialog', () => {
  it('génère un brouillon par contact, et « Valider » le dépose SANS envoyer', async () => {
    apiFetch.mockImplementation(({ path }: { path: string }) => {
      if (path === '/ia/message') return Promise.resolve({ success: true, data: { subject: 'Objet', body: 'Corps' } })
      if (path === '/contacts/c-1/email-draft') return Promise.resolve({ id: 'c-1' })
      return Promise.reject(new Error(`unexpected path ${path}`))
    })

    render(
      wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1'), contact('c-2')]} />),
    )

    await screen.findByDisplayValue('Objet')
    expect(screen.getByText('1 sur 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Valider/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/contacts/c-1/email-draft',
        method: 'PATCH',
        body: { subject: 'Objet', body: 'Corps' },
      }),
    )
    // Jamais un appel d'envoi.
    expect(apiFetch.mock.calls.some(([args]) => (args as { path: string }).path.includes('send-email'))).toBe(false)
    await screen.findByText('2 sur 2')
  })

  // #4050.3 (recette M 12/10 : brouillon 1 en 10 s, les 3 vers 40 s) — les brouillons de TOUTES les personnes
  // partent à l'ouverture, en parallèle borné : on ne génère pas « le suivant » quand on avance.
  it('#4050.3 — à l’ouverture, les 3 générations sont en vol en même temps (pas une par une)', async () => {
    const pending: string[] = []
    apiFetch.mockImplementation(({ path, body }: { path: string; body?: { contactId: string } }) => {
      if (path === '/ia/message') {
        pending.push(body?.contactId ?? '')
        return new Promise(() => {})
      }
      return Promise.reject(new Error(`unexpected path ${path}`))
    })
    render(
      wrapper(
        <PrepareContactsEmailDialog
          open
          onOpenChange={() => {}}
          contacts={[contact('c-1'), contact('c-2'), contact('c-3')]}
        />,
      ),
    )
    await waitFor(() => expect(pending.sort()).toEqual(['c-1', 'c-2', 'c-3']))
  })

  it('#4050.3 — le brouillon du 2e est déjà prêt quand on arrive dessus', async () => {
    apiFetch.mockImplementation(({ path, body }: { path: string; body?: { contactId: string } }) => {
      if (path === '/ia/message')
        return Promise.resolve({ success: true, data: { subject: `Objet ${body?.contactId}`, body: 'Corps' } })
      return Promise.resolve({})
    })
    render(
      wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1'), contact('c-2')]} />),
    )
    await screen.findByDisplayValue('Objet c-1')
    await userEvent.click(screen.getByRole('button', { name: /Passer/ }))
    expect(await screen.findByDisplayValue('Objet c-2')).toBeInTheDocument()
    expect(apiFetch.mock.calls.filter(([args]) => (args as { path: string }).path === '/ia/message')).toHaveLength(2)
  })

  it('« Passer » avance sans déposer de brouillon', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps' } })
    render(
      wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1'), contact('c-2')]} />),
    )

    await screen.findByText('1 sur 2')
    await userEvent.click(screen.getByRole('button', { name: /Passer/ }))

    await screen.findByText('2 sur 2')
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/contacts/c-1/email-draft' }))
  })

  it('exclut les contacts sans e-mail, et le dit', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps' } })
    render(
      wrapper(
        <PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1'), contact('c-2', null)]} />,
      ),
    )

    expect(await screen.findByText('1 sans e-mail')).toBeInTheDocument()
    expect(screen.getByText('1 sur 1')).toBeInTheDocument()
  })

  it('affiche le résumé une fois la liste épuisée, et rappelle que rien n’est parti', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps' } })
    render(wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1')]} />))

    await screen.findByText('1 sur 1')
    await userEvent.click(screen.getByRole('button', { name: /Passer/ }))

    expect(await screen.findByText('0 e-mail(s) préparé(s) sur 1.')).toBeInTheDocument()
    expect(screen.getByText(/Rien n.a été envoyé/)).toBeInTheDocument()
  })

  // #4042.8 — recette prod 12/10 : « Rédaction du brouillon… » > 25 s, sans issue.
  it('un appel de génération qui échoue se NOMME à l’écran et propose « Réessayer » (jamais un spinner infini)', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValue({
      success: true,
      data: { subject: 'Objet', body: 'Corps' },
    })
    render(wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1')]} />))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de générer un brouillon/)
    expect(screen.queryByText('Rédaction du brouillon…')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Réessayer/ }))
    expect(await screen.findByDisplayValue('Objet')).toBeInTheDocument()
  })

  it('une génération qui dépasse le délai finit en erreur « trop de temps », pas en attente infinie', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    apiFetch.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    render(wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1')]} />))
    await screen.findByText('Rédaction du brouillon…')

    await vi.advanceTimersByTimeAsync(20_500)
    expect(await screen.findByText(/plus longtemps que d.habitude/)).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(40_000)

    expect(await screen.findByRole('alert')).toHaveTextContent(/trop de temps/)
    vi.useRealTimers()
  })

  it('rend les pièces jointes atteignables : un bouton ouvre la revue d’envoi (modifier + joindre)', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps' } })
    const onOpenChange = vi.fn()
    const onReview = vi.fn()
    render(
      wrapper(
        <PrepareContactsEmailDialog
          open
          onOpenChange={onOpenChange}
          contacts={[contact('c-1')]}
          onReviewWithAttachments={onReview}
        />,
      ),
    )
    await screen.findByDisplayValue('Objet')
    expect(screen.getByText(/pièces jointes se choisissent à l.envoi/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Modifier et joindre des pièces/ }))
    expect(onReview).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // #4412 — ce que l'enregistrement a fait chez le fournisseur se DIT, jamais un faux succès.
  describe('brouillon dans la boîte (#4412)', () => {
    const validateOne = async (mailboxDraft: unknown) => {
      apiFetch.mockImplementation(({ path }: { path: string }) => {
        if (path === '/ia/message') return Promise.resolve({ success: true, data: { subject: 'Objet', body: 'Corps' } })
        if (path === '/contacts/c-1/email-draft') return Promise.resolve({ id: 'c-1', mailbox_draft: mailboxDraft })
        return Promise.reject(new Error(`unexpected path ${path}`))
      })
      render(wrapper(<PrepareContactsEmailDialog open onOpenChange={() => {}} contacts={[contact('c-1')]} />))
      await screen.findByDisplayValue('Objet')
      await userEvent.click(screen.getByRole('button', { name: /Valider/ }))
    }

    it('créé chez le fournisseur : dit « Brouillon créé dans Gmail » (le vrai fournisseur)', async () => {
      await validateOne({ status: 'created', provider: 'google' })
      expect(await screen.findByText(/Brouillon créé dans Gmail/)).toBeInTheDocument()
    })

    it('Outlook quand la boîte est Microsoft', async () => {
      await validateOne({ status: 'created', provider: 'microsoft' })
      expect(await screen.findByText(/Brouillon créé dans Outlook/)).toBeInTheDocument()
    })

    it('faute de boîte : Bellum seul, et le lien pour connecter la boîte', async () => {
      await validateOne({ status: 'not_connected' })
      expect(await screen.findByText(/Message préparé enregistré dans Bellum\. Connecte ta boîte/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Connecter ma boîte/ })).toHaveAttribute('href', '/integrations')
    })

    it('faute de fournisseur : Bellum seul, avec la raison', async () => {
      await validateOne({ status: 'failed', provider: 'google', reason: 'Jeton expiré' })
      expect(
        await screen.findByText(/Message préparé enregistré dans Bellum — pas dans Gmail : Jeton expiré/),
      ).toBeInTheDocument()
    })
  })
})

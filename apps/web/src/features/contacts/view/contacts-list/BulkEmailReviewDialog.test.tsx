import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))

import { BulkEmailReviewDialog } from './BulkEmailReviewDialog'

const people = [
  { id: 'c-1', full_name: 'Alice Martin', title: 'DSI', entity: 'Acme', email: 'alice@acme.fr' },
  { id: 'c-2', full_name: 'Bruno Petit', title: 'DAF', entity: 'Beta', email: 'bruno@beta.fr' },
  { id: 'c-3', full_name: 'Chloé Roy', title: 'CTO', entity: 'Gamma', email: 'chloe@gamma.fr' },
]

const draftOf = (id: string) => ({ subject: `Objet ${id}`, body: `Bonjour ${id}, sur Acme…` })
const pdf = (id: string, rights = 'always') => ({
  id,
  title: `Plaquette ${id}`,
  description: null,
  category: 'brochure',
  usageRights: rights,
  file: { fileName: `${id}.pdf`, contentType: 'application/pdf', byteSize: 120_000, sha256: null },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
})

type World = {
  stored: Record<string, { subject: string; body: string } | null>
  mailbox: { connected: boolean; can_send: boolean; address: string | null; provider: string | null }
  demo?: boolean
  /** Remplace la réponse de /sendability (ex. contact déjà écrit : l'API ne renvoie alors AUCUNE `mailbox`). */
  sendability?: Record<string, unknown>
}

function installApi(world: World) {
  apiFetch.mockImplementation((args: { path: string; method?: string; body?: unknown }) => {
    const { path, method, body } = args
    const detail = /^\/contacts\/(c-\d)$/.exec(path)
    if (detail && !method) return Promise.resolve({ id: detail[1], email_message: world.stored[detail[1]!] ?? null })
    if (path === '/mailbox/status')
      return Promise.resolve({
        connected: world.mailbox.connected,
        provider: world.mailbox.provider,
        address: world.mailbox.address,
        capabilities: { read: true, draft: true, send: world.mailbox.can_send, labels: false, outOfOffice: false },
        connectedCount: world.mailbox.connected ? 1 : 0,
      })
    if (path.endsWith('/sendability'))
      return Promise.resolve(
        world.sendability ?? { can_send: true, mailbox: world.mailbox, demo: world.demo, attachable_documents: [] },
      )
    if (path === '/outreach-assets') return Promise.resolve([pdf('plaq-1'), pdf('plaq-2', 'after_interest_confirmed')])
    if (path === '/ia/message') {
      const id = (body as { contactId: string }).contactId
      return Promise.resolve({ success: true, data: draftOf(`gen-${id}`) })
    }
    if (path.endsWith('/send-email'))
      return Promise.resolve({
        contact_id: 'x',
        sent_to: 'x',
        email_sent_at: '2026-10-12T08:00:00Z',
        channel: 'mailbox',
        sent_from: 'me@x.fr',
        state: 'handed_off',
        attachments: [],
      })
    return Promise.reject(new Error(`unexpected ${method ?? 'GET'} ${path}`))
  })
}

const sends = () =>
  apiFetch.mock.calls
    .map(([args]) => args as { path: string; method?: string; body?: Record<string, unknown> })
    .filter(args => args.path.endsWith('/send-email'))

function renderDialog(
  contacts: Array<(typeof people)[number] & { email_estimated_at?: string | null }> = people,
  onSent = vi.fn(),
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <BulkEmailReviewDialog open onOpenChange={() => {}} contacts={contacts} onSent={onSent} />
    </QueryClientProvider>,
  )
  return onSent
}

const connected = { connected: true, can_send: true, address: 'me@x.fr', provider: 'google' }
const allStored = { 'c-1': draftOf('c-1'), 'c-2': draftOf('c-2'), 'c-3': draftOf('c-3') }

beforeEach(() => {
  apiFetch.mockReset()
})

/** #4042 — revue une personne à la fois, avant tout envoi. */
describe('BulkEmailReviewDialog', () => {
  it('montre le mail de CHAQUE personne, « k / N », e-mail du destinataire en clair', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog()

    expect(await screen.findByDisplayValue('Objet c-1')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('alice@acme.fr', { exact: false })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    expect(await screen.findByDisplayValue('Objet c-2')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('bruno@beta.fr', { exact: false })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Précédent/ }))
    expect(await screen.findByDisplayValue('Objet c-1')).toBeInTheDocument()
  })

  it('#4986.1 — une adresse DEVINÉE est badgée « estimé » sur l\u2019écran d\u2019envoi, une adresse connue ne l\u2019est pas', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog([{ ...people[0]!, email_estimated_at: '2026-10-11T08:00:00Z' }, people[1]!, people[2]!])

    await screen.findByDisplayValue('Objet c-1')
    expect(screen.getAllByText(/estimé/i).length).toBeGreaterThan(0)
  })

  it('éditer UN mail ne change que celui-là (et part avec le texte édité, pour lui seul)', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog()
    const body = await screen.findByLabelText('Message')
    await userEvent.clear(body)
    await userEvent.type(body, 'Texte perso pour Alice')
    expect(screen.getByText('Modifié')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    expect(await screen.findByDisplayValue('Bonjour c-2, sur Acme…')).toBeInTheDocument()
    expect(screen.getByText('Prêt')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Envoyer 3 mails/ }))
    await waitFor(() => expect(sends()).toHaveLength(3))
    const byPath = Object.fromEntries(sends().map(call => [call.path, call.body]))
    expect(byPath['/contacts/c-1/send-email']).toMatchObject({ draft: { body: 'Texte perso pour Alice' } })
    expect(byPath['/contacts/c-2/send-email']).toMatchObject({ draft: { body: 'Bonjour c-2, sur Acme…' } })
    // Un envoi par personne, depuis la messagerie connectée.
    expect(sends().every(call => call.body?.channel === 'mailbox')).toBe(true)
  })

  it('une pièce jointe à UN mail, puis une autre à TOUS, et se retire', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog()
    await screen.findByDisplayValue('Objet c-1')

    await userEvent.click(screen.getByRole('button', { name: /Ajouter une pièce jointe/ }))
    const row = (await screen.findByText('Plaquette plaq-1')).closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'À ce mail' }))
    expect(screen.getByLabelText('Retirer plaq-1.pdf')).toBeInTheDocument()

    // Sur la personne suivante : rien n'a suivi.
    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    await screen.findByDisplayValue('Objet c-2')
    expect(screen.queryByLabelText('Retirer plaq-1.pdf')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter une pièce jointe/ }))
    const row2 = (await screen.findByText('Plaquette plaq-1')).closest('li') as HTMLElement
    await userEvent.click(within(row2).getByRole('button', { name: 'À tous les mails' }))
    expect(screen.getByLabelText('Retirer plaq-1.pdf')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Envoyer 3 mails/ }))
    await waitFor(() => expect(sends()).toHaveLength(3))
    const ids = Object.fromEntries(sends().map(call => [call.path, call.body?.attachment_asset_ids]))
    expect(ids['/contacts/c-1/send-email']).toEqual(['plaq-1'])
    expect(ids['/contacts/c-2/send-email']).toEqual(['plaq-1'])
    expect(ids['/contacts/c-3/send-email']).toEqual(['plaq-1'])
  })

  it('retirer une pièce ne la retire que de ce mail', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog()
    await screen.findByDisplayValue('Objet c-1')
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une pièce jointe/ }))
    const row = (await screen.findByText('Plaquette plaq-1')).closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'À tous les mails' }))
    await userEvent.click(screen.getByLabelText('Retirer plaq-1.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    await screen.findByDisplayValue('Objet c-2')
    expect(screen.getByLabelText('Retirer plaq-1.pdf')).toBeInTheDocument()
  })

  it('un document « après intérêt confirmé » ne se joint pas d’ici', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog()
    await screen.findByDisplayValue('Objet c-1')
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une pièce jointe/ }))
    const row = (await screen.findByText('Plaquette plaq-2')).closest('li') as HTMLElement
    expect(within(row).getByRole('button', { name: 'À ce mail' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'À tous les mails' })).toBeDisabled()
  })

  it('si aucun mail n’est préparé : « Générer » les écrit un par personne, « à revoir », puis on relit 1 par 1', async () => {
    installApi({ stored: { 'c-1': null, 'c-2': null, 'c-3': null }, mailbox: connected })
    renderDialog()
    const generate = await screen.findByRole('button', { name: /Générer les 3 mails/ })
    // Rien n’est envoyable tant qu’aucun mail n’existe.
    expect(screen.getByRole('button', { name: /Envoyer 0 mail/ })).toBeDisabled()

    await userEvent.click(generate)
    await screen.findByDisplayValue('Objet gen-c-1')
    expect(apiFetch.mock.calls.filter(([a]) => (a as { path: string }).path === '/ia/message')).toHaveLength(3)
    expect(screen.getByText('À revoir')).toBeInTheDocument()
    // Encore fermé : tant que les mails générés n’ont pas été relus.
    expect(screen.getByRole('button', { name: /Envoyer 0 mail/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    await screen.findByDisplayValue('Objet gen-c-3')
    // Le dernier n'a pas de « Suivant » : un geste explicite le marque relu.
    expect(screen.getByRole('button', { name: /Envoyer 0 mail/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme relu' }))
    expect(await screen.findByRole('button', { name: /Envoyer 3 mails/ })).toBeEnabled()
    expect(sends()).toHaveLength(0)
  })

  // #4050.1 — génération en parallèle BORNÉE (4), un échec (ex. 429) n'arrête pas les autres.
  it('#4050.1 — 5 mails à rédiger : au plus 4 appels simultanés, tous les brouillons arrivent, un échec ne bloque personne', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `c-${i + 1}`,
      full_name: `Personne ${i + 1}`,
      title: `Poste ${i + 1}`,
      entity: `Société ${i + 1}`,
      email: `p${i + 1}@x.fr`,
    }))
    installApi({ stored: {}, mailbox: connected })
    const base = apiFetch.getMockImplementation()!
    let inFlight = 0
    let maxInFlight = 0
    apiFetch.mockImplementation((args: { path: string; body?: { contactId: string } }) => {
      if (args.path !== '/ia/message') return base(args)
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          inFlight -= 1
          if (args.body?.contactId === 'c-2') reject(Object.assign(new Error('rate'), { status: 429 }))
          else resolve({ success: true, data: draftOf(`gen-${args.body?.contactId}`) })
        }, 20)
      })
    })
    renderDialog(five)
    await userEvent.click(await screen.findByRole('button', { name: /Générer les 5 mails/ }))
    await waitFor(() => expect(apiFetch.mock.calls.filter(([a]) => a.path === '/ia/message')).toHaveLength(5))
    await screen.findByRole('button', { name: /Générer le mail/ })
    expect(maxInFlight).toBe(4)
    // 4 sur 5 sont rédigés (c-2 a échoué) : il reste UN mail manquant.
    expect(screen.getByText("1 personne n'a pas de mail préparé.", { exact: false })).toBeInTheDocument()
  })

  it('n’envoie RIEN sans le clic : relire et éditer ne déclenchent aucun envoi', async () => {
    installApi({ stored: allStored, mailbox: connected })
    renderDialog()
    const body = await screen.findByLabelText('Message')
    await userEvent.type(body, ' merci')
    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }))
    expect(sends()).toHaveLength(0)
  })

  it('sans messagerie connectée : le dit, propose de la connecter, et ne peut pas envoyer', async () => {
    installApi({ stored: allStored, mailbox: { connected: false, can_send: false, address: null, provider: null } })
    renderDialog()
    expect(await screen.findByText(/messagerie n'est pas connectée/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter ma messagerie' })).toHaveAttribute('href', '/integrations')
    const send = screen.getByRole('button', { name: /Envoyer 0 mail/ })
    expect(send).toBeDisabled()
    await userEvent.click(send)
    expect(sends()).toHaveLength(0)
  })

  it('#3702 (recette 14/10) — messagerie connectée : jamais « Connecte ta messagerie », même si la fiche lue n’a pas de `mailbox` (contact déjà écrit)', async () => {
    installApi({
      stored: allStored,
      mailbox: connected,
      sendability: { contact_id: 'c-1', can_send: false, reason: 'already_sent' },
    })
    renderDialog()
    expect(await screen.findByText(/Alice Martin/)).toBeInTheDocument()
    await waitFor(() => expect(apiFetch.mock.calls.some(([a]) => a.path === '/mailbox/status')).toBe(true))
    expect(screen.queryByText(/messagerie n'est pas connectée/)).toBeNull()
    expect(screen.queryByText('Connecte ta messagerie pour envoyer.')).toBeNull()
  })

  it('en démonstration : tout se relit, rien ne part', async () => {
    installApi({ stored: allStored, mailbox: connected, demo: true })
    renderDialog()
    expect(await screen.findByText(/Espace de démonstration/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Envoyer 0 mail/ })).toBeDisabled()
  })

  it('un mail exclu ne part pas ; l’échec d’un envoi ne touche pas les autres et reste nommé', async () => {
    installApi({ stored: allStored, mailbox: connected })
    const base = apiFetch.getMockImplementation()!
    apiFetch.mockImplementation((args: { path: string }) =>
      args.path === '/contacts/c-2/send-email'
        ? Promise.reject(Object.assign(new Error('boom'), { code: 'suppressed' }))
        : base(args),
    )
    const onSent = renderDialog()
    await screen.findByDisplayValue('Objet c-1')
    await userEvent.click(screen.getByRole('button', { name: 'Exclure ce mail' }))
    expect(screen.getByText('Exclu')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Envoyer 2 mails/ }))
    await screen.findByTestId('bulk-review-result')
    expect(sends().map(call => call.path)).toEqual(['/contacts/c-2/send-email', '/contacts/c-3/send-email'])
    expect(screen.getByText('1 mail(s) envoyé(s) sur 2.')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]!)
    expect(onSent).toHaveBeenCalledWith(
      expect.objectContaining({ sent: [{ contact_id: 'c-3', sent_to: 'chloe@gamma.fr' }] }),
    )
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MouseEvent, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1944.4 — le tiroir des conversations, sur téléphone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision de Louis du 12/09/2026 : « Tiroir depuis l'en-tête de Laura — même
 * liste qu'ordinateur, cibles 44 px. » Sous 768 px, la colonne des conversations
 * (`ConversationsPanel`) est masquée en CSS (`max-md:hidden`) et l'historique
 * était, avant ce lot, une décision parquée plutôt qu'un oubli.
 *
 * Ce composant rend LE MÊME `ConversationList` que la colonne ordinateur — pas
 * une seconde implémentation (loi 4 du tome 7 / GA-26) — dans un `Sheet` de
 * `packages/ui` (Radix Dialog : Échap ferme, le focus revient au déclencheur).
 */

const history = vi.hoisted(() => ({ list: vi.fn() }))
// `data` volontairement large : cf. `ConversationsPanel.test.tsx`, même mock.
const accounts = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => accounts.data(),
}))

// #1910.8 — « moi », pour le filtre « Partagées ». `ConversationList` est le
// MÊME composant qu'en colonne (loi 4 / GA-26) : quand un lot y a branché
// `useSelfChatAuthor`, le tiroir en a hérité — et le hook réel lit le profil,
// donc la session, que ce fichier ne monte pas. Même mock que
// `ConversationsPanel.test.tsx`, pour la même raison : garder ce fichier sur
// son sujet, qui est la FERMETURE du tiroir.
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({
  useSelfChatAuthor: (): { firstName: string; avatarUrl: string | null } => ({
    firstName: 'Moi',
    avatarUrl: null,
  }),
}))

vi.mock('@/features/chat/api/agentChatApi', () => ({
  listAgentChatHistory: history.list,
  deleteAgentChatThread: vi.fn(),
  setAgentChatThreadArchived: vi.fn(),
  // #1955.2 / #1955.7 / #1955.8 — les trois capacités câblées le 16/09/2026.
  // Mockées même si ce fichier ne les exerce pas : laissées `undefined`, elles
  // lèveraient depuis un minuteur, hors de portée de toute assertion.
  searchAgentChatThreads: vi.fn().mockResolvedValue([]),
  duplicateAgentChatThread: vi.fn(),
  exportAgentChatThread: vi.fn(),
}))

type LinkProps = {
  to: string
  search?: Record<string, unknown>
  children?: ReactNode
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
} & Record<string, unknown>

/**
 * `Link` simule aussi `preventDefault()` — la vraie navigation `<a href>` de
 * jsdom ("Not implemented: navigation") est un bruit qui n'apprend rien ici :
 * ce fichier teste la FERMETURE du tiroir au clic, pas le routeur.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, onClick, ...props }: LinkProps) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString()
    return (
      <a
        href={query ? `${to}?${query}` : to}
        onClick={event => {
          event.preventDefault()
          onClick?.(event)
        }}
        {...props}
      >
        {children}
      </a>
    )
  },
}))

const { ConversationsDrawer } = await import('./ConversationsDrawer')

const thread = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 't1',
  account_id: null,
  conversation_id: 'general',
  title: 'Quels comptes prioriser ?',
  created_at: '2026-08-20T10:00:00Z',
  last_message_at: '2026-08-25T10:00:00Z',
  ...over,
})

beforeEach(() => {
  history.list.mockReset()
  accounts.data.mockReturnValue({ data: undefined })
})

describe('ConversationsDrawer — le bouton (GA-28/GA-30/GA-32)', () => {
  it('porte un nom accessible — c’est une icône seule', () => {
    history.list.mockResolvedValue([])
    render(<ConversationsDrawer refreshKey={0} />)
    expect(screen.getByRole('button', { name: 'Voir tes conversations' })).toBeInTheDocument()
  })

  it('est masqué en CSS à partir de 768 px, dans le MÊME rendu (GA-28)', () => {
    render(<ConversationsDrawer refreshKey={0} />)
    const trigger = screen.getByRole('button', { name: 'Voir tes conversations' })
    expect(trigger.className).toMatch(/(?:^|\s)md:hidden(?:\s|$)/)
  })

  it('atteint 44 px en pointeur grossier (GA-30)', () => {
    render(<ConversationsDrawer refreshKey={0} />)
    const trigger = screen.getByRole('button', { name: 'Voir tes conversations' })
    expect(trigger.className).toMatch(/pointer-coarse:min-h-11/)
    expect(trigger.className).toMatch(/pointer-coarse:min-w-11/)
  })

  it('sait dire NON — un bouton sans la classe ne passerait pas ces deux gardes', () => {
    const bare = document.createElement('button')
    bare.className = 'flex size-8 items-center justify-center'
    expect(bare.className).not.toMatch(/(?:^|\s)md:hidden(?:\s|$)/)
    expect(bare.className).not.toMatch(/pointer-coarse:min-h-11/)
  })
})

describe('ConversationsDrawer — ouvre LA MÊME liste (loi 4 / GA-26)', () => {
  it('le clic ouvre un tiroir qui rend `ConversationList`', async () => {
    const user = userEvent.setup()
    history.list.mockResolvedValue([thread({ title: 'Angle RSE' })])
    render(<ConversationsDrawer refreshKey={0} />)
    await user.click(screen.getByRole('button', { name: 'Voir tes conversations' }))
    expect(await screen.findByText('Angle RSE')).toBeInTheDocument()
    // « Nouvelle conversation » vient de `ConversationList` lui-même — la preuve
    // que ce n'est pas une liste réécrite pour le tiroir.
    expect(screen.getByText('Nouvelle conversation')).toBeInTheDocument()
  })

  it('relit la liste quand `refreshKey` avance (#1947)', async () => {
    const user = userEvent.setup()
    history.list.mockResolvedValue([])
    const { rerender } = render(<ConversationsDrawer refreshKey={0} />)
    await user.click(screen.getByRole('button', { name: 'Voir tes conversations' }))
    await screen.findByText('Aucune conversation')

    history.list.mockResolvedValue([thread({ title: 'Fil neuf' })])
    rerender(<ConversationsDrawer refreshKey={1} />)
    expect(await screen.findByText('Fil neuf')).toBeInTheDocument()
  })
})

describe('ConversationsDrawer — se ferme (#1944.4)', () => {
  it('choisir un fil ferme le tiroir', async () => {
    const user = userEvent.setup()
    history.list.mockResolvedValue([thread({ title: 'Angle RSE' })])
    render(<ConversationsDrawer refreshKey={0} />)
    await user.click(screen.getByRole('button', { name: 'Voir tes conversations' }))
    const threadLink = await screen.findByText('Angle RSE')
    await user.click(threadLink)
    await waitFor(() => expect(screen.queryByText('Angle RSE')).not.toBeInTheDocument())
  })

  it('« Nouvelle conversation » ferme aussi le tiroir', async () => {
    const user = userEvent.setup()
    history.list.mockResolvedValue([])
    render(<ConversationsDrawer refreshKey={0} />)
    await user.click(screen.getByRole('button', { name: 'Voir tes conversations' }))
    const newThread = await screen.findByText('Nouvelle conversation')
    await user.click(newThread)
    await waitFor(() => expect(screen.queryByText('Nouvelle conversation')).not.toBeInTheDocument())
  })

  it('sait dire NON — le menu « … » d’un fil ne navigue pas et NE ferme pas le tiroir', async () => {
    // Le menu (archiver/supprimer) est un VOISIN du lien, pas un enfant : lui
    // seul ne doit jamais fermer le tiroir, sinon archiver referme la vue sur
    // laquelle on vient d'agir.
    const user = userEvent.setup()
    history.list.mockResolvedValue([thread({ title: 'Angle RSE' })])
    render(<ConversationsDrawer refreshKey={0} />)
    await user.click(screen.getByRole('button', { name: 'Voir tes conversations' }))
    await screen.findByText('Angle RSE')
    await user.click(screen.getByRole('button', { name: 'Options de la conversation' }))
    expect(screen.getByText('Angle RSE')).toBeInTheDocument()
  })

  it('Échap ferme le tiroir et rend le focus au bouton', async () => {
    const user = userEvent.setup()
    history.list.mockResolvedValue([])
    render(<ConversationsDrawer refreshKey={0} />)
    const trigger = screen.getByRole('button', { name: 'Voir tes conversations' })
    await user.click(trigger)
    await screen.findByText('Aucune conversation')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Aucune conversation')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})

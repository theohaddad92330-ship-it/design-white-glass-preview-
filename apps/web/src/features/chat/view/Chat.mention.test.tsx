import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

/**
 * #2428.12 — UNE MENTION TRANSMET UN IDENTIFIANT CANONIQUE, PAS JUSTE DU
 * TEXTE « @Nom ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, `onMention` (menu « Mentionner un membre ») ne posait que du
 * texte libre dans le champ (`appendMention`) — le serveur devait ensuite
 * DEVINER le collègue par un rapprochement de prénom dans le message
 * (`ChatContextService.resolveMentionedColleague`, heuristique homonymes
 * comprise). L'id du membre choisi, lui, ne quittait jamais l'écran.
 *
 * `mentionedMember` (état de `Chat`) porte désormais l'id à côté du nom, et
 * `handleSend` ne le transmet à `askLauraStreaming` que si le texte
 * « @Nom » qui l'a posé est ENCORE dans ce qui part — éditer ou effacer la
 * mention après le clic ne doit jamais envoyer un id qui ne correspond plus
 * à ce que dit le texte.
 *
 * Même gabarit que `Chat.send-failure.test.tsx` (capture d'`askLauraStreaming`)
 * et `Chat.test.tsx` (ouverture du sous-menu « Mentionner un membre »).
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) =>
      offerableMemoryScopes({ conversationId, businessUnits: [] }),
  }
})
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({ CommandDrawerButton: () => null }))
// #2451.9 — le composeur lit le mode par défaut de l'espace par `useQuery`
// (`GET /workspaces/laura-mode`), or ce fichier rend `Chat` sans
// `QueryClientProvider` (même raison que useMemoryScopeOptions/useDeleteRagDocument,
// #1918.5/#1982). `undefined` = comportement byte-identique à avant #2451.9.
vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: MotionMockProps) => {
            const Component = prop as ElementType
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ search: {} }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false }),
}))
const teamMock = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => teamMock() }))
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return {
    ...actual,
    useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }),
  }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-id') }),
}))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
}))
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useDeleteRagDocument', () => ({
  useDeleteRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useUpdateRagDocumentScope', () => ({
  useUpdateRagDocumentScope: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useRagDocumentContent', () => ({
  useRagDocumentContent: () => ({ data: undefined, isLoading: false, isError: false }),
}))
// #2876 (#2433.4) — même raison que `useRagDocumentContent` juste au-dessus :
// `AttachmentPreviewDialog` appelle ce hook inconditionnellement, qui exige un
// `QueryClientProvider` absent de ce harnais de test.
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))

const askLauraStreamingMock = vi.fn()
vi.mock('../api/laura-turn', () => ({ askLauraStreaming: (...args: unknown[]) => askLauraStreamingMock(...args) }))

const listMessagesMock = vi.fn()
const createMessageMock = vi.fn()
const listHistoryMock = vi.fn()
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: (...args: unknown[]) => listMessagesMock(...args),
  createAgentChatMessage: (...args: unknown[]) => createMessageMock(...args),
  listAgentChatHistory: (...args: unknown[]) => listHistoryMock(...args),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

import { Chat } from './Chat'

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
  askLauraStreamingMock.mockResolvedValue({ reply: 'ok' })
  teamMock.mockReturnValue({
    team: { members: [{ userId: 'u-2', fullName: 'Théo', email: 'theo@ex.fr' }] },
    isLoading: false,
    isError: false,
  })
})

async function pickMention(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
  const mentionEntry = await screen.findByRole('menuitem', { name: 'Mentionner un membre' })
  fireEvent.click(mentionEntry)
  await user.click(await screen.findByRole('menuitem', { name: 'Théo' }))
}

describe('#2428.12 — la mention transmet un id canonique', () => {
  it('choisir « Théo » au menu, puis envoyer, transmet son id — pas juste le texte', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await pickMention(user)
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    expect(textarea).toHaveValue('@Théo ')

    fireEvent.change(textarea, { target: { value: '@Théo peux-tu résumer ?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalled())
    const [body] = askLauraStreamingMock.mock.calls[0] as [{ mentionedUserId?: string | null }]
    expect(body.mentionedUserId).toBe('u-2')
  })

  it('effacer le « @Théo » après le clic n’envoie PLUS son id — le texte fait foi', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await pickMention(user)
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    // Le clic a posé « @Théo », mais la personne revient dessus et demande
    // autre chose sans mentionner personne.
    fireEvent.change(textarea, { target: { value: 'en fait, cherche les décideurs chez Thales' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalled())
    const [body] = askLauraStreamingMock.mock.calls[0] as [{ mentionedUserId?: string | null }]
    expect(body.mentionedUserId).toBeNull()
  })

  it('sans mention choisie, `mentionedUserId` reste `null`', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Bonjour' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalled())
    const [body] = askLauraStreamingMock.mock.calls[0] as [{ mentionedUserId?: string | null }]
    expect(body.mentionedUserId).toBeNull()
  })
})

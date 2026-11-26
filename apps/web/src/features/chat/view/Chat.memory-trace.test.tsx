import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #1916.24 — l'écran `/chat` et la trace des éléments de mémoire.
 *
 *  · le TOUR rendu par la fin du flux part avec la RÉPONSE enregistrée, jamais
 *    avec la question de la personne ;
 *  · une réponse relue qui porte une trace offre « Voir la source » ; une
 *    réponse relue sans trace n'offre rien.
 *
 * Mêmes doubles que `Chat.persistence.test.tsx` : cette suite ne mesure ni
 * l'accueil, ni les connecteurs, ni la démonstration.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` ; ce test rend `Chat` sans `QueryClientProvider`. La lecture
// est VIDE : aucun drapeau posé, donc aucun refus décoré — le cas normal, et
// le comportement byte-identique à celui d'avant le point.
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))

// #1918.2 / #1918.5 — les portées proposables se lisent par `useQuery`
// (`GET /business-units`), or ces tests rendent `Chat` sans
// `QueryClientProvider`. La lecture est rendue VIDE, et la RÈGLE reste celle du
// contrat : `offerableMemoryScopes` est appelé pour de vrai. C'est exactement
// l'état « je n'ai pas pu lire les périmètres » — il n'ouvre jamais une portée,
// il la retire, et « cette conversation » reste offerte dans un fil.
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
  // `tools` est lu par `MessagesArea` (#1912.11) : un mock sans lui fait tomber
  // le rendu ENTIER, pas le bloc qu'il vise (même forme que les suites voisines).
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
        const cached = motionComponents.get(prop)
        if (cached) return cached
        const Rendered = ({ children, ...props }: MotionMockProps) => {
          const Component = prop as ElementType
          return <Component {...props}>{children}</Component>
        }
        motionComponents.set(prop, Rendered)
        return Rendered
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
  useLocation: () => ({ search: locationSearch.current }),
  useNavigate: () => navigateMock,
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [] }, isLoading: false, isError: false }),
}))
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return { ...actual, useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }) }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useReplyMemoryUses', () => ({
  useReplyMemoryUses: () => ({ isLoading: true, isError: false, data: undefined }),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn() }) }))
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
// #1954.20 (#1982) — « retirer » une pièce jointe la supprime : `Chat` monte ce
// hook react-query. Intégration du 13/09 : cette suite, écrite en parallèle de
// #1982, ne le doublait pas — « No QueryClient set » sur ses trois tests.
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

const TURN = '11111111-1111-4111-8111-111111111111'

function persistedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    account_id: null,
    conversation_id: 'general',
    role: 'user',
    content: 'Message persisté',
    created_at: '2026-07-19T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => persistedMessage(args))
})

async function send(text: string): Promise<void> {
  await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('Chat — la trace des éléments de mémoire', () => {
  it('le tour de mémoire part avec la RÉPONSE enregistrée, jamais avec la question', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: 'Réponse du copilote', memoryTurnId: TURN })
    render(<Chat />)
    await send('Quels signaux ?')

    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', content: 'Réponse du copilote', memoryTurnId: TURN }),
      ),
    )
    const userTurn = createMessageMock.mock.calls
      .map(call => call[0] as Record<string, unknown>)
      .find(body => body.role === 'user')
    expect(userTurn).toBeDefined()
    expect(userTurn).not.toHaveProperty('memoryTurnId')
  })

  it('sans tour servi, la réponse enregistrée ne porte pas la clé', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: 'Réponse du copilote' })
    render(<Chat />)
    await send('Quels signaux ?')

    await waitFor(() => expect(createMessageMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant' })))
    const assistantTurn = createMessageMock.mock.calls
      .map(call => call[0] as Record<string, unknown>)
      .find(body => body.role === 'assistant')
    expect(assistantTurn).not.toHaveProperty('memoryTurnId')
  })

  it('une réponse relue qui porte une trace offre « Voir la source » ; une réponse relue sans trace, rien', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-q', role: 'user', content: 'Ma question' }),
      persistedMessage({ id: 'm-a1', role: 'assistant', content: 'Réponse avec mémoire', memory_uses: 2 }),
      persistedMessage({ id: 'm-a2', role: 'assistant', content: 'Réponse sans mémoire', memory_uses: 0 }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    await screen.findByText('Réponse avec mémoire')
    expect(screen.getAllByRole('button', { name: /^(Sources|Contexte)$/ })).toHaveLength(1)
  })
})

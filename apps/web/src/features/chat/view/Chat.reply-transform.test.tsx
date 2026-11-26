import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #3768 (BEL-LAU-1014) — L'APPELANT du menu « Ajuster cette réponse » : le tour rejoué.
 *
 * Entrée : un clic sur « Voir seulement les priorités » sous une réponse de Laura qui liste
 * deux comptes et pose une réserve. Sortie : `askLauraStreaming` reçoit la question cliquée
 * ET la réponse source, sa forme, ses comptes et sa réserve — jamais une requête aveugle.
 *
 * Question exacte à poser en recette : dans /chat, après une réponse qui liste des comptes,
 * ouvrir « Retravailler » sous la réponse et choisir « Voir seulement les priorités ».
 */
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` ; cette suite rend `Chat` sans `QueryClientProvider`, comme
// `Chat.cards.test.tsx`. La lecture est VIDE : aucun drapeau posé, donc aucun
// refus décoré — le cas normal, et le rendu d'avant le point.
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

function persistedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    account_id: null,
    conversation_id: 'general',
    role: 'assistant',
    content: 'Message persisté',
    created_at: '2026-09-16T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = { conversationId: 'general' }
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
})

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222'
const RESERVE = 'La cartographie est partielle : seuls les comptes déjà analysés sont couverts.'
const SOURCE = [
  'Voici les comptes à traiter :',
  `1. [Alpha](/accounts/${ACCOUNT_A}) — contrat en fin de cycle`,
  `2. [Beta](/accounts/${ACCOUNT_B}) — nouveau DSI`,
  RESERVE,
].join('\n')

describe('#3768 — retravailler une réponse sans repartir de zéro', () => {
  it('le clic envoie la question ET la réponse source, sa forme, ses comptes et sa réserve', async () => {
    listMessagesMock.mockResolvedValue([persistedMessage({ id: 'm-a', content: SOURCE })])
    askLauraStreamingMock.mockResolvedValue({ reply: `1. [Alpha](/accounts/${ACCOUNT_A}) — priorité\n${RESERVE}` })
    render(<Chat />)

    await userEvent.click(await screen.findByRole('button', { name: 'Ajuster cette réponse' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Voir seulement les priorités' }))

    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    const request = askLauraStreamingMock.mock.calls[0]![0] as Record<string, unknown>
    expect(request.message).toBe('Voir seulement les priorités')
    expect(request.replyTransform).toMatchObject({
      id: 'priorities_only',
      sourceText: SOURCE,
      layout: 'list',
      accountIds: [ACCOUNT_A, ACCOUNT_B],
      reserves: [RESERVE],
    })
    // Le contexte initial n'est pas perdu : la réponse source est dans l'historique du tour.
    expect(JSON.stringify(request.history)).toContain('contrat en fin de cycle')
  })

  it('« Voir plus de comptes » n’est jamais proposé sous une réponse sans compte cité', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-a', content: 'Une réponse générale, sans aucun compte cité.' }),
    ])
    render(<Chat />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ajuster cette réponse' }))
    expect(await screen.findByRole('menuitem', { name: 'Approfondir' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Voir plus de comptes' })).not.toBeInTheDocument()
  })
})

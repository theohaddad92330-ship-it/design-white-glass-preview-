import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #1944.20 — L'HISTORIQUE SE CHARGE PAR PAGES, VERS LE HAUT D'UN FIL VIVANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI IL EXISTE À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré sur `origin/main` le 24/09/2026 (registre #1944.20) : le backend
 * portait déjà `limit`/`before` (`GET /ia/chat/messages`, curseur de
 * pagination distinct de `version`) mais AUCUN appelant ne le passait — le
 * client ne demandait jamais que les 50 derniers messages d'un fil, et les
 * premiers échanges d'un fil plus long restaient définitivement inatteignables
 * depuis l'écran.
 *
 * Ce fichier prouve le CÂBLAGE : remonter près du haut du fil demande la page
 * suivante avec `before` = la date du plus ancien message déjà à l'écran, la
 * prépose devant, et n'en redemande plus une fois le fil épuisé.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) =>
      offerableMemoryScopes({ conversationId, businessUnits: [] }),
  }
})
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({ CommandDrawerButton: () => null }))
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
    role: 'user',
    content: 'Message',
    created_at: '2026-09-20T10:00:00Z',
    ...overrides,
  }
}

/** Une page de 50 messages, la taille par défaut du serveur (`listChatMessagesSchema.limit`). */
function fullPage(prefix: string, startHour: number) {
  return Array.from({ length: 50 }, (_, i) => {
    const hour = String(startHour + i).padStart(2, '0')
    return persistedMessage({
      id: `${prefix}-${i}`,
      content: `${prefix} ${i}`,
      created_at: `2026-09-20T${hour}:00:00Z`,
    })
  })
}

function scrollToTop(box: Element) {
  // `writable: true` — le code de restauration du scroll (#1944.20) RÉAFFECTE
  // `scrollTop` après une page préposée ; une propriété non modifiable ferait
  // planter ce recalage, pas le geste qu'on veut mesurer ici.
  Object.defineProperty(box, 'scrollTop', { value: 0, configurable: true, writable: true })
  Object.defineProperty(box, 'scrollHeight', { value: 2000, configurable: true, writable: true })
  Object.defineProperty(box, 'clientHeight', { value: 400, configurable: true, writable: true })
  fireEvent.scroll(box)
}

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => persistedMessage(args))
})

describe('Chat — historique chargé par pages en remontant le fil (#1944.20)', () => {
  it('remonter en haut d’un fil PLEIN (50 messages) demande la page suivante, `before` = le plus ancien affiché', async () => {
    const initial = fullPage('page1', 0)
    listMessagesMock.mockResolvedValueOnce(initial)
    const { container } = render(<Chat />)
    await waitFor(() => expect(screen.getByText('page1 0')).toBeInTheDocument())

    const older = [
      persistedMessage({ id: 'older-1', content: 'Message plus ancien', created_at: '2026-09-19T23:00:00Z' }),
    ]
    listMessagesMock.mockResolvedValueOnce(older)

    const box = container.querySelector('div.overflow-y-auto.px-4.py-4')
    expect(box).not.toBeNull()
    scrollToTop(box!)

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(2))
    const secondCall = listMessagesMock.mock.calls[1]?.[0] as { before?: Date }
    expect(secondCall.before).toBeInstanceOf(Date)
    expect(secondCall.before?.toISOString()).toBe(new Date(initial[0]!.created_at).toISOString())

    await waitFor(() => expect(screen.getByText('Message plus ancien')).toBeInTheDocument())
  })

  it('un fil COURT (moins de 50 messages) ne redemande jamais — l’historique est déjà complet', async () => {
    listMessagesMock.mockResolvedValueOnce([persistedMessage({ id: 'only-1', content: 'Seul message' })])
    const { container } = render(<Chat />)
    await waitFor(() => expect(screen.getByText('Seul message')).toBeInTheDocument())

    const box = container.querySelector('div.overflow-y-auto.px-4.py-4')
    scrollToTop(box!)
    scrollToTop(box!)

    // Laisse le temps à un éventuel (mauvais) appel de partir.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(listMessagesMock).toHaveBeenCalledTimes(1)
  })

  it('un fil ÉPUISÉ (page vide reçue) ne redemande plus au scroll suivant', async () => {
    const initial = fullPage('page1', 0)
    listMessagesMock.mockResolvedValueOnce(initial)
    const { container } = render(<Chat />)
    await waitFor(() => expect(screen.getByText('page1 0')).toBeInTheDocument())

    listMessagesMock.mockResolvedValueOnce([])
    const box = container.querySelector('div.overflow-y-auto.px-4.py-4')
    scrollToTop(box!)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(2))

    scrollToTop(box!)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(listMessagesMock).toHaveBeenCalledTimes(2)
  })
})

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

/**
 * #4967 — la recherche de Laura CONTINUE quand on change d'écran.
 * Démonter `Chat` pendant le flux n'abolit pas le signal ; « Arrêter » (y compris
 * depuis l'écran qui revient) l'abolit ; la réponse finie est relue du fil persisté.
 */

const routeSearch = vi.hoisted(() => ({ value: {} as Record<string, string> }))

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

vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({
  CommandDrawerButton: () => null,
}))
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
  useLocation: () => ({ search: routeSearch.value }),
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
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [] }, isLoading: false, isError: false }),
}))
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
const runningMock = vi.fn()
const stopMock = vi.fn()
vi.mock('../api/chatTurnsApi', () => ({
  chatTurnsApi: {
    running: (...args: unknown[]) => runningMock(...args),
    stop: (...args: unknown[]) => stopMock(...args),
  },
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

import { Chat } from './Chat'
import { stopTurn, useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'

const THREAD = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  useBackgroundTurnsStore.getState().reset()
  routeSearch.value = { conversationId: THREAD }
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
  runningMock.mockResolvedValue({ turns: [] })
  stopMock.mockResolvedValue({ stopped: true })
})

// Un tour laissé en vol par un test (écran démonté sans « Arrêter ») ne fuit pas dans le suivant.
afterEach(async () => {
  stopTurn(THREAD)
  await waitFor(() => undefined)
})

type Handlers = { onAccepted?: () => void; onDelta?: (text: string) => void }

function openStream() {
  const stream: { signal?: AbortSignal; resolve: (turn: { reply: string; context: null }) => void } = {
    resolve: () => {},
  }
  askLauraStreamingMock.mockImplementationOnce((_request: unknown, handlers: Handlers, signal: AbortSignal) => {
    stream.signal = signal
    handlers.onAccepted?.()
    return new Promise((resolve, reject) => {
      stream.resolve = resolve
      // Comme `fetch` : un signal aboli rejette le tour (et libère son contrôleur, `finally`).
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  })
  return stream
}

async function sendMessage(text: string) {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('#4967 — changer d’écran n’annule pas la réponse en cours', () => {
  it('démonter l’écran pendant le flux n’abolit PAS le signal ; le tour reste « en cours »', async () => {
    const stream = openStream()
    const view = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('Analyse Thales')
    await waitFor(() => expect(stream.signal).toBeDefined())

    view.unmount()

    expect(stream.signal?.aborted).toBe(false)
    expect(useBackgroundTurnsStore.getState().turns[THREAD]).toBe('running')
  })

  it('fini pendant l’absence : la réponse est persistée et signalée « prête »', async () => {
    const stream = openStream()
    const view = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('Analyse Thales')
    await waitFor(() => expect(stream.signal).toBeDefined())
    view.unmount()

    stream.resolve({ reply: 'Voici le dossier', context: null })

    await waitFor(() => expect(useBackgroundTurnsStore.getState().turns[THREAD]).toBe('ready'))
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', content: 'Voici le dossier' }),
    )
  })

  it('au retour, tant que ça tourne : l’indicateur reprend, « Arrêter » abolit le tour d’avant', async () => {
    const stream = openStream()
    const first = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('Analyse Thales')
    await waitFor(() => expect(stream.signal).toBeDefined())
    first.unmount()

    render(<Chat />)
    const stop = await screen.findByRole('button', { name: 'Arrêter' })
    expect(stream.signal?.aborted).toBe(false)
    fireEvent.click(stop)
    expect(stream.signal?.aborted).toBe(true)
  })

  it('au retour après la fin : la réponse est relue du fil et plus rien n’est « prêt »', async () => {
    const stream = openStream()
    const first = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('Analyse Thales')
    await waitFor(() => expect(stream.signal).toBeDefined())
    first.unmount()
    stream.resolve({ reply: 'Voici le dossier', context: null })
    await waitFor(() => expect(useBackgroundTurnsStore.getState().turns[THREAD]).toBe('ready'))

    listMessagesMock.mockResolvedValue([
      {
        id: 'm1',
        conversation_id: THREAD,
        role: 'user',
        content: 'Analyse Thales',
        created_at: '2026-10-31T10:00:00Z',
      },
      {
        id: 'm2',
        conversation_id: THREAD,
        role: 'assistant',
        content: 'Voici le dossier',
        created_at: '2026-10-31T10:01:00Z',
      },
    ])
    render(<Chat />)

    expect(await screen.findByText(/Voici le dossier/)).toBeInTheDocument()
    await waitFor(() => expect(useBackgroundTurnsStore.getState().turns[THREAD]).toBeUndefined())
  })
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SERVER_TURN = '44444444-4444-4444-8444-444444444444'

describe('#4967 (lot L6) — la recherche vit côté serveur', () => {
  it('le tour part EN ARRIÈRE-PLAN avec son identifiant ; « Arrêter » le désigne au serveur', async () => {
    const stream = openStream()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('Analyse Thales')
    await waitFor(() => expect(stream.signal).toBeDefined())
    const request = askLauraStreamingMock.mock.calls[0]?.[0] as { turnId?: string; background?: boolean }
    expect(request.background).toBe(true)
    expect(request.turnId).toMatch(UUID)

    fireEvent.click(await screen.findByRole('button', { name: 'Arrêter' }))
    await waitFor(() => expect(stopMock).toHaveBeenCalledWith(request.turnId))
    expect(stream.signal?.aborted).toBe(true)
  })

  it('rechargement : le serveur dit qu’un tour de CE fil tourne encore — l’écran le montre et sait l’arrêter', async () => {
    runningMock.mockResolvedValue({
      turns: [{ turnId: SERVER_TURN, conversationId: THREAD, startedAt: '2026-11-01T09:58:00.000Z' }],
    })
    render(<Chat />)
    const stop = await screen.findByRole('button', { name: 'Arrêter' })
    expect(runningMock).toHaveBeenCalledWith(THREAD)
    fireEvent.click(stop)
    await waitFor(() => expect(stopMock).toHaveBeenCalledWith(SERVER_TURN))
  })

  it('le tour serveur finit pendant qu’on regarde : le fil est relu et la réponse est là', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      runningMock.mockResolvedValueOnce({
        turns: [{ turnId: SERVER_TURN, conversationId: THREAD, startedAt: '2026-11-01T09:58:00.000Z' }],
      })
      render(<Chat />)
      await screen.findByRole('button', { name: 'Arrêter' })
      listMessagesMock.mockResolvedValue([
        {
          id: 'm1',
          conversation_id: THREAD,
          role: 'user',
          content: 'Analyse Thales',
          created_at: '2026-11-01T09:58:00Z',
        },
        {
          id: 'm2',
          conversation_id: THREAD,
          role: 'assistant',
          content: 'Dossier prêt',
          created_at: '2026-11-01T10:01:00Z',
        },
      ])
      await vi.advanceTimersByTimeAsync(5_000)
      expect(await screen.findByText(/Dossier prêt/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Arrêter' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('NON — sans tour serveur sur ce fil, rien ne se dit « en cours »', async () => {
    render(<Chat />)
    await waitFor(() => expect(runningMock).toHaveBeenCalledWith(THREAD))
    expect(screen.queryByRole('button', { name: 'Arrêter' })).toBeNull()
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

/**
 * #3809 (ajout, call bêta du 08/10/2026, L17) — « il peut pas faire une
 * nouvelle conversation, c'est ça ? » pendant qu'un tour tourne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RELECTURE A TROUVÉ (aucune condition de blocage ÉCRITE, deux bugs
 * RÉELS malgré tout)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `sending` est un drapeau UNIQUE, pas scopé au fil : tant que le tour
 *    abandonné n'avait pas fini (succès, erreur ou minuterie), le composeur du
 *    fil NEUF restait désactivé — c'est très exactement ce qu'un testeur lit
 *    comme « je ne peux pas faire une nouvelle conversation ».
 * 2. Sans garde, les callbacks du tour abandonné (`onDelta`, la bulle finale,
 *    la bulle d'échec) continuaient d'écrire dans `messages` — qui désigne
 *    maintenant le fil NEUF, vide. Le texte de l'ANCIEN fil serait apparu dans
 *    celui qu'on vient d'ouvrir.
 *
 * Changer de fil ABOLIT donc maintenant le tour laissé derrière (même signal
 * que « Arrêter », voir l'effet de relecture du fil dans `Chat.tsx`), et toute
 * écriture restante du tour abandonné est gardée par le fil ACTIF.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

const stableNavigate = vi.hoisted(() => () => Promise.resolve())
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

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
  useLocation: () => ({ search: locationSearch.current }),
  useNavigate: () => stableNavigate,
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
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({ useChatModeEstimate: () => ({ data: undefined }) }))

const askLauraStreamingMock = vi.fn()
vi.mock('../api/laura-turn', () => ({ askLauraStreaming: (...args: unknown[]) => askLauraStreamingMock(...args) }))

const listMessagesMock = vi.fn()
const createMessageMock = vi.fn()
const listHistoryMock = vi.fn()
const runningMock = vi.fn()
vi.mock('../api/chatTurnsApi', () => ({
  chatTurnsApi: { running: (...args: unknown[]) => runningMock(...args), stop: vi.fn(async () => ({ stopped: true })) },
}))
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: (...args: unknown[]) => listMessagesMock(...args),
  createAgentChatMessage: (...args: unknown[]) => createMessageMock(...args),
  listAgentChatHistory: (...args: unknown[]) => listHistoryMock(...args),
}))

import { Chat } from './Chat'

type AskLauraCallbacks = { onAccepted?: () => void; onDelta?: (text: string) => void; onStep?: (label: string) => void }

const QUESTION = 'Quels comptes prioriser cette semaine ?'

beforeEach(() => {
  vi.resetAllMocks()
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  runningMock.mockResolvedValue({ turns: [] })
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({ id: 'm-1', ...args }))
})

/** Ouvre le composeur, écrit la question, et appuie sur Entrée. */
async function sendQuestion() {
  const textarea = await screen.findByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: QUESTION } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

/** `?new=1` → modale de portée → confirmation : ouvre un fil VIERGE (même instance, re-rendue). */
async function openNewConversation(rerender: (node: ReactNode) => void) {
  locationSearch.current = { new: '1' }
  rerender(<Chat />)
  // #4539 — le fil vierge s'ouvre SANS modale ; le dossier est un geste explicite, optionnel.
  await screen.findByPlaceholderText('Écris ton message...')
  expect(screen.queryByRole('dialog')).toBeNull()
}

describe('#3809 (ajout) — Nouvelle conversation pendant qu’un tour tourne', () => {
  it('le composeur du fil neuf n’est plus bloqué par le tour abandonné', async () => {
    let captured: AskLauraCallbacks = {}
    let resolveTurn!: (value: { reply: string }) => void
    askLauraStreamingMock.mockImplementation((_payload: unknown, callbacks: AskLauraCallbacks, signal: AbortSignal) => {
      captured = callbacks
      return new Promise<{ reply: string }>((resolve, reject) => {
        resolveTurn = resolve
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })

    const { rerender } = render(<Chat />)
    await sendQuestion()
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    // Le serveur a accepté le tour, puis commence à répondre — exactement le
    // moment mesuré en recette (« une modale vide » / tour en vol).
    await act(async () => captured.onAccepted?.())
    await act(async () => captured.onDelta?.('Dé'))

    const composerBefore = screen.getByPlaceholderText('Écris ton message...')
    // #4066 — pendant une réponse le champ reste actif (« Envoyer » met en attente).
    expect(composerBefore).not.toBeDisabled()

    // « Nouvelle conversation », cliquée pendant que Laura répond encore.
    await openNewConversation(rerender)

    // Le fil neuf n'est plus celui qui attendait une réponse : son composeur
    // doit être utilisable tout de suite, pas bloqué jusqu'à ce que l'ancien
    // tour finisse.
    const composerAfter = screen.getByPlaceholderText('Écris ton message...')
    await waitFor(() => expect(composerAfter).not.toBeDisabled())

    // Le tour abandonné, lui, continue d'arriver — en vain pour l'écran :
    // aucune bulle du fil quitté ne doit apparaître ici.
    await act(async () => captured.onDelta?.('livré trop tard'))
    expect(screen.queryByText(/livré trop tard/)).toBeNull()
    await act(async () => resolveTurn({ reply: 'Réponse du fil abandonné' }))
    await act(async () => {})
    expect(screen.queryByText('Réponse du fil abandonné')).toBeNull()
    expect(screen.queryByText(QUESTION)).toBeNull()
  })

  it('un tour pas encore accepté par le serveur, abandonné par un changement de fil, ne laisse aucune trace', async () => {
    let rejectTurn!: (error: unknown) => void
    askLauraStreamingMock.mockImplementation(
      (_payload: unknown, _callbacks: AskLauraCallbacks, signal: AbortSignal) => {
        return new Promise<{ reply: string }>((_resolve, reject) => {
          rejectTurn = reject
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      },
    )

    const { rerender } = render(<Chat />)
    await sendQuestion()
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(QUESTION)).toBeInTheDocument()

    await openNewConversation(rerender)

    const composerAfter = screen.getByPlaceholderText('Écris ton message...')
    await waitFor(() => expect(composerAfter).not.toBeDisabled())
    // La question posée sur le fil abandonné ne doit pas réapparaître sur le
    // fil neuf, vide.
    expect(screen.queryByText(QUESTION)).toBeNull()
    void rejectTurn
  })
})

describe('#3809.1 (vu en passant, lot F03 09/10) — retour sur le fil abandonné', () => {
  it('nomme l’interruption au lieu de laisser « En attente » sans explication', async () => {
    let captured: AskLauraCallbacks = {}
    askLauraStreamingMock.mockImplementation((_payload: unknown, callbacks: AskLauraCallbacks, signal: AbortSignal) => {
      captured = callbacks
      return new Promise<{ reply: string }>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    // Le fil quitté (« c-1 ») a déjà sa question enregistrée côté serveur —
    // vraie tant qu'on n'y revient pas ; le fil « c-2 » n'a encore rien.
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'c-1'
        ? [{ id: 's-1', role: 'user' as const, content: QUESTION, created_at: new Date().toISOString() }]
        : [],
    )

    locationSearch.current = { conversationId: 'c-1' }
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendQuestion()
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    await act(async () => captured.onAccepted?.())

    // On ouvre un AUTRE fil pendant que celui-ci répond encore.
    locationSearch.current = { conversationId: 'c-2' }
    rerender(<Chat />)
    await waitFor(() => expect(screen.getByPlaceholderText('Écris ton message...')).not.toBeDisabled())

    // Retour sur le fil quitté : la réponse n'est jamais arrivée (rien n'a été
    // enregistré pour ce tour), mais l'écran le DIT — plutôt qu'un silence qui
    // se lit comme « Laura n'a pas encore répondu ».
    locationSearch.current = { conversationId: 'c-1' }
    rerender(<Chat />)
    expect(await screen.findByText(/interrompu/)).toBeInTheDocument()
  })
})

describe('#4967 (lot L6) — retour sur un fil quitté dont le SERVEUR poursuit la recherche', () => {
  it('la recherche n’est pas « interrompue » : l’écran la dit en cours et sait l’arrêter', async () => {
    let captured: AskLauraCallbacks = {}
    askLauraStreamingMock.mockImplementation((_payload: unknown, callbacks: AskLauraCallbacks, signal: AbortSignal) => {
      captured = callbacks
      return new Promise<{ reply: string }>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'c-1'
        ? [{ id: 's-1', role: 'user' as const, content: QUESTION, created_at: new Date().toISOString() }]
        : [],
    )
    locationSearch.current = { conversationId: 'c-1' }
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendQuestion()
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    await act(async () => captured.onAccepted?.())

    locationSearch.current = { conversationId: 'c-2' }
    rerender(<Chat />)
    await waitFor(() => expect(screen.getByPlaceholderText('Écris ton message...')).not.toBeDisabled())

    // Le serveur a gardé le tour (`background`) : il le dit encore en cours sur c-1.
    runningMock.mockImplementation(async (conversationId: string) => ({
      turns:
        conversationId === 'c-1'
          ? [
              {
                turnId: '55555555-5555-4555-8555-555555555555',
                conversationId: 'c-1',
                startedAt: '2026-11-01T10:00:00Z',
              },
            ]
          : [],
    }))
    locationSearch.current = { conversationId: 'c-1' }
    rerender(<Chat />)
    expect(await screen.findByRole('button', { name: 'Arrêter' })).toBeInTheDocument()
    expect((await screen.findAllByText(QUESTION)).length).toBeGreaterThan(0)
    await act(async () => {})
    expect(screen.queryByText(/interrompu/)).toBeNull()
  })
})

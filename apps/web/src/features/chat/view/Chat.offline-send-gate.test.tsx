import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2435.7 / #2435.8 — HORS-LIGNE, AUCUN ENVOI NE PART ; LA RECONNEXION NE
 * REJOUE RIEN TOUTE SEULE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX POINTS, UN SEUL MÉCANISME
 * ─────────────────────────────────────────────────────────────────────────────
 * `handleSend` relit `navigator.onLine` à L'INSTANT de l'envoi (jamais une
 * valeur mise en cache) et refuse AVANT toute écriture optimiste, tout appel
 * réseau et donc tout crédit débité (#2435.7). Comme rien n'est mis en file
 * pendant la coupure, le retour du réseau (`online`) ne déclenche par
 * construction AUCUN renvoi automatique — la revalidation attendue par
 * #2435.8 est le fait qu'un envoi ultérieur repasse par le MÊME contrôle,
 * jamais un état mémorisé pendant la panne.
 *
 * Même gabarit de mocks que `Chat.draft.test.tsx` (le plus proche : lui aussi
 * suit `createMessageMock` par appel).
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
const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: (...args: unknown[]) => toastErrorMock(...args),
    loading: vi.fn(() => 'toast-id'),
  }),
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
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

import { Chat } from './Chat'

let originalOnLine: boolean

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
  originalOnLine = window.navigator.onLine
})

afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { value: originalOnLine, configurable: true })
})

async function typeAndEnter(text: string) {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('#2435.7 — hors-ligne, aucun envoi ne part', () => {
  it('la tentative est refusée AVANT tout appel réseau : aucun message créé, aucun tour demandé', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await typeAndEnter('Un message tapé hors-ligne')

    expect(createMessageMock).not.toHaveBeenCalled()
    expect(askLauraStreamingMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  it('le texte tapé reste dans la saisie — rien ne se vide sur un envoi refusé', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await typeAndEnter('Ne pars pas')

    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Ne pars pas')
  })
})

describe('#2435.8 — la reconnexion ne rejoue rien toute seule', () => {
  it("l'événement `online` seul ne déclenche aucun envoi automatique", async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await typeAndEnter('Message resté en attente')
    expect(createMessageMock).not.toHaveBeenCalled()

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    fireEvent(window, new Event('online'))

    // Aucun envoi ne part tout seul : il faut un geste explicite.
    expect(createMessageMock).not.toHaveBeenCalled()
  })

  it('un envoi explicite APRÈS la reconnexion repasse par le contrôle et aboutit', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await typeAndEnter('Message envoyé une fois reconnecté')

    await waitFor(() => expect(createMessageMock).toHaveBeenCalled())
  })
})

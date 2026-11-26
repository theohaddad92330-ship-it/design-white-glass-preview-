import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

/**
 * #1953.1 / #1953.2 / #1953.3 — arrêter une réponse EN COURS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un bouton « Arrêter » apparaît pendant la génération (#1953.1), son clic
 * ABORT le flux en cours plutôt que d'attendre sa fin (#1953.2), et le texte
 * déjà reçu via `onDelta` RESTE affiché — ni retiré, ni remplacé par un
 * message d'erreur générique (#1953.3). Même mock que `Chat.send-failure.
 * test.tsx` : `askLauraStreaming` rejette avec une vraie `DOMException`
 * nommée `AbortError`, la forme exacte que produit `laura-turn.ts` quand le
 * signal qu'il transmet à `fetch` est aboli.
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
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

import { Chat } from './Chat'

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
})

async function sendMessage(text: string) {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

function chatMain() {
  return screen.getByRole('main', { name: 'Conversation avec Laura' })
}

describe('#1953.1 / #1953.2 / #1953.3 — arrêter une réponse en cours', () => {
  it('un clic sur « Arrêter » interrompt le flux et garde le texte déjà reçu', async () => {
    let capturedSignal: AbortSignal | undefined
    let capturedHandlers: { onAccepted?: () => void; onDelta?: (text: string) => void } = {}
    let rejectSend: (error: unknown) => void = () => {}
    askLauraStreamingMock.mockImplementationOnce(
      (_request: unknown, handlers: typeof capturedHandlers, signal: AbortSignal) => {
        capturedHandlers = handlers
        capturedSignal = signal
        return new Promise((_resolve, reject) => {
          rejectSend = reject
        })
      },
    )
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Thales')

    // Le tour est ACCEPTÉ (flux ouvert), puis le texte arrive fragment par fragment.
    await waitFor(() => expect(capturedHandlers.onDelta).toBeTruthy())
    capturedHandlers.onAccepted?.()
    capturedHandlers.onDelta?.('Voici les décideurs identifiés')

    await waitFor(() => expect(within(chatMain()).getByText(/Voici les décideurs identifiés/)).toBeInTheDocument())

    // #1953.1 — le bouton est visible PENDANT la réponse.
    const stopButton = screen.getByRole('button', { name: 'Arrêter' })
    fireEvent.click(stopButton)

    // #1953.2 — le clic a bien aboli le signal transmis à `askLauraStreaming`.
    expect(capturedSignal?.aborted).toBe(true)
    rejectSend(new DOMException('The operation was aborted.', 'AbortError'))

    // La saisie redevient utilisable : l'arrêt n'a pas laissé le tour bloqué.
    await waitFor(() => expect(screen.getByPlaceholderText('Écris ton message...')).not.toBeDisabled())

    // #1953.3 — le texte déjà reçu reste affiché, sans message d'erreur générique.
    expect(within(chatMain()).getByText(/Voici les décideurs identifiés/)).toBeInTheDocument()
    expect(within(chatMain()).queryByText(/Erreur de connexion/)).not.toBeInTheDocument()
    expect(within(chatMain()).queryByText(/Connexion perdue/)).not.toBeInTheDocument()
  })

  it('sans réponse en cours, aucun bouton « Arrêter » ne s’affiche', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: 'Arrêter' })).not.toBeInTheDocument()
  })

  // #2428.21 — annuler un envoi ENCORE LOCAL, avant que le serveur ait
  // accepté le tour (`onAccepted` — #1957.8 : rien n'est écrit avant lui).
  // Différent du test au-dessus : là, `onAccepted` était déjà appelé, la
  // question RESTE et seule la génération s'arrête. Ici, `onAccepted` n'a
  // JAMAIS lieu — le même bouton doit donc se comporter autrement : retirer
  // la question optimiste, jamais persistée, et restituer le texte tapé.
  it('annuler AVANT l’acceptation serveur retire la question optimiste et restitue le texte', async () => {
    let capturedSignal: AbortSignal | undefined
    let rejectSend: (error: unknown) => void = () => {}
    askLauraStreamingMock.mockImplementationOnce((_request: unknown, _handlers: unknown, signal: AbortSignal) => {
      capturedSignal = signal
      // Le serveur ne répond jamais dans ce test — `onAccepted` n'est donc
      // jamais appelé : le tour reste ENTIÈREMENT local jusqu'à l'abandon.
      return new Promise((_resolve, reject) => {
        rejectSend = reject
      })
    })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Thales')

    // La bulle optimiste apparaît tout de suite, avant toute réponse serveur.
    await waitFor(() => expect(within(chatMain()).getByText('Analyse Thales')).toBeInTheDocument())

    const stopButton = screen.getByRole('button', { name: 'Arrêter' })
    fireEvent.click(stopButton)
    expect(capturedSignal?.aborted).toBe(true)
    rejectSend(new DOMException('The operation was aborted.', 'AbortError'))

    // Rien n'a été accepté : la question locale disparaît, comme si l'envoi
    // n'avait jamais eu lieu — SEULE la saisie (restituée plus bas) porte
    // encore ce texte, jamais une bulle du fil.
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    await waitFor(() => expect(within(chatMain()).queryAllByText('Analyse Thales')).toEqual([textarea]))
    // Le texte tapé revient dans le champ plutôt que d'être perdu.
    expect(textarea).toHaveValue('Analyse Thales')
  })
})

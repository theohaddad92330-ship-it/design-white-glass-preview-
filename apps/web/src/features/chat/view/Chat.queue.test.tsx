import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'

/**
 * #4066 — LA FILE D'ATTENTE DE /chat : un message tapé pendant que Laura répond attend son tour.
 * Même harnais que `Chat.stop.test.tsx` (flux scripté par `askLauraStreaming`).
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
  sessionStorage.clear()
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

interface PendingTurn {
  question: string
  resolve: () => void
  reject: (error: unknown) => void
  handlers: { onAccepted?: () => void; onDelta?: (text: string) => void }
}

/** Chaque appel au flux reste ouvert jusqu'à ce que le test le résolve ou le rejette. */
function scriptTurns() {
  const turns: PendingTurn[] = []
  askLauraStreamingMock.mockImplementation(
    (request: { message?: string }, handlers: PendingTurn['handlers']) =>
      new Promise((resolve, reject) => {
        turns.push({
          question: request.message ?? '',
          handlers,
          resolve: () => resolve({ reply: `réponse à ${request.message}`, context: {} }),
          reject,
        })
      }),
  )
  return turns
}

const queueBlock = () => screen.queryByTestId('send-queue')

describe('#4066 — file d’attente pendant une réponse', () => {
  it('#4066.1 pendant la réponse le champ reste actif et « Envoyer » met en attente, sans rien envoyer', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))

    expect(screen.getByPlaceholderText('Écris ton message...')).not.toBeDisabled()
    await sendMessage('seconde')

    await waitFor(() => expect(queueBlock()).toBeInTheDocument())
    expect(within(queueBlock()!).getByText('En attente · 1')).toBeInTheDocument()
    expect(within(queueBlock()!).getByText('seconde')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('')
    // Pas de file côté serveur : rien n'est parti avant son tour.
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
  })

  it('#4066.2 à la fin de la réponse, le message suivant part tout seul', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    await sendMessage('seconde')
    await waitFor(() => expect(queueBlock()).toBeInTheDocument())

    turns[0]!.handlers.onAccepted?.()
    turns[0]!.resolve()

    await waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]!.question).toBe('seconde')
    await waitFor(() => expect(queueBlock()).not.toBeInTheDocument())
  })

  it('#4066.3 un message en attente se retire avant son tour', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    await sendMessage('à retirer')
    await waitFor(() => expect(queueBlock()).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le message en attente 1' }))
    expect(queueBlock()).not.toBeInTheDocument()
    turns[0]!.handlers.onAccepted?.()
    turns[0]!.resolve()
    await waitFor(() => expect(screen.getByPlaceholderText('Écris ton message...')).not.toBeDisabled())
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
  })

  it('#4066.3 un message en attente se modifie ; la version corrigée est celle qui part', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    await sendMessage('brouillon')
    await waitFor(() => expect(queueBlock()).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Modifier le message en attente 1' }))
    fireEvent.change(screen.getByLabelText('Texte du message en attente 1'), { target: { value: 'version corrigée' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    turns[0]!.handlers.onAccepted?.()
    turns[0]!.resolve()

    await waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]!.question).toBe('version corrigée')
  })

  it('#4066.4 un arrêt de la réponse en cours ne vide pas la file', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    turns[0]!.handlers.onAccepted?.()
    await sendMessage('seconde')
    await waitFor(() => expect(queueBlock()).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }))
    turns[0]!.reject(new DOMException('The operation was aborted.', 'AbortError'))

    await waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]!.question).toBe('seconde')
  })

  it('#4066.4 un échec de la réponse en cours suspend la file : échec nommé, rien ne part, « Reprendre » relance', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    await sendMessage('seconde')
    await waitFor(() => expect(queueBlock()).toBeInTheDocument())

    turns[0]!.reject(new Error('boom'))

    await waitFor(() => expect(screen.getByTestId('send-queue-suspension')).toBeInTheDocument())
    expect(screen.getByTestId('send-queue-suspension')).toHaveTextContent(/La réponse en cours a échoué/)
    expect(screen.getByTestId('send-queue-suspension')).toHaveTextContent(/rien n’est parti/)
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]!.question).toBe('seconde')
  })

  it('#4066.1 la file est plafonnée à 5 : le sixième reste dans la saisie, refus nommé', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    for (let index = 1; index <= 5; index += 1) await sendMessage(`attente ${index}`)
    await waitFor(() => expect(within(queueBlock()!).getByText('En attente · 5')).toBeInTheDocument())

    await sendMessage('de trop')
    expect(within(queueBlock()!).getByText('En attente · 5')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('de trop')
  })

  it('#4066.5 la file survit à un rechargement et attend un geste avant de repartir', async () => {
    const turns = scriptTurns()
    const first = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('première')
    await waitFor(() => expect(turns).toHaveLength(1))
    await sendMessage('survivante')
    await waitFor(() => expect(queueBlock()).toBeInTheDocument())
    first.unmount()

    render(<Chat />)
    await waitFor(() => expect(within(queueBlock()!).getByText('survivante')).toBeInTheDocument())
    expect(screen.getByTestId('send-queue-suspension')).toHaveTextContent(/File retrouvée/)
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
  })

  it('#4066.1 sans réponse en cours, un envoi part tout de suite (aucune file)', async () => {
    const turns = scriptTurns()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await sendMessage('directe')
    await waitFor(() => expect(turns).toHaveLength(1))
    expect(queueBlock()).not.toBeInTheDocument()
  })
})

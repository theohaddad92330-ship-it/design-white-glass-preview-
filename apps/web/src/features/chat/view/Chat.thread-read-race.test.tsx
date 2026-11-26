import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

/** Pilote le mock de `useLocation` : `?ask=`, `?prompt=`, `?conversationId=`. */
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
/** La carte d'amorce n'ENVOIE qu'en démonstration : le drapeau se pilote par test. */
const demoFlag = vi.hoisted(() => ({ current: false }))
import { Chat } from './Chat'
import type * as HomeSuggestions from './laura-home-suggestions'
import { demoSuggestions, demoTurn } from '../api/demo-turn'

/**
 * Recette du 13/09/2026, en production (SHA servi `84c828383`) — `/chat?ask=…`
 * sur un fil vierge : la relecture du fil (lancée au montage, vide) répondait
 * APRÈS que l'envoi automatique avait posé la question à l'écran, et la
 * remplaçait par `[]`. La réponse de Laura remplaçait ensuite « le dernier
 * message » d'une liste vide : ni la question ni la réponse ne s'affichaient,
 * alors que les deux étaient enregistrées et que l'annonce disait « Laura a
 * répondu. ».
 *
 * La suite rejoue l'ordre du réseau avec des promesses DIFFÉRÉES : c'est la
 * seule façon de faire répondre la lecture après l'envoi, ce que des doubles
 * résolus d'office ne font pas dans le même ordre à chaque fois.
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
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// #1940.4 — l'auteur des bulles lit le profil (react-query) : même double que le prénom.
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => <span /> }))

/** Composants mémorisés : un type neuf à chaque rendu remonterait tout le sous-arbre. */
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
  const actual = await importOriginal<typeof HomeSuggestions>()
  return {
    ...actual,
    useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }),
  }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demoFlag.current, useDemoSpaceStatus: () => 'real' }))
// #3769 chat envoi à froid : la session se pilote par test (null = chargement à froid).
const sessionUser = vi.hoisted(() => ({ current: { id: 'u1' } as { id: string } | null }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: sessionUser.current }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'id') }),
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
// #1954.20 — « retirer » une pièce jointe la supprime : `Chat` monte ce hook
// react-query, que cette suite (sans QueryClientProvider) doit doubler.
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

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function savedMessage(overrides: Record<string, unknown>) {
  return {
    id: 'm-1',
    account_id: null,
    conversation_id: 'c-ecrit',
    role: 'assistant',
    content: 'Déjà écrit',
    created_at: '2026-09-12T10:00:00Z',
    ...overrides,
  }
}

/** `a` est rendu AVANT `b` dans le fil. */
function expectBefore(a: HTMLElement, b: HTMLElement) {
  expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

const QUESTION = 'Quels comptes prioriser cette semaine ?'
const REPLY = 'Réponse du copilote'

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  demoFlag.current = false
  sessionUser.current = { id: 'u1' }
  localStorage.clear()
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => savedMessage(args))
  askLauraStreamingMock.mockResolvedValue({ reply: REPLY })
})

describe('Recette du 13/09 — `?ask` sur un fil vierge : la lecture du fil écrasait la question', () => {
  it('la question PUIS la réponse s’affichent quand la lecture du fil répond après l’envoi (l’ordre mesuré en production)', async () => {
    const read = deferred<unknown[]>()
    const turn = deferred<{ reply: string }>()
    listMessagesMock.mockReturnValue(read.promise)
    askLauraStreamingMock.mockReturnValue(turn.promise)
    locationSearch.current = { ask: QUESTION }

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    await act(async () => {})

    // 1271 ms GET du fil vierge… qui répond pendant que la question attend sa réponse.
    await act(async () => read.resolve([]))
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    // 8011 ms — la réponse arrive.
    await act(async () => turn.resolve({ reply: REPLY }))

    expect(await screen.findByText(REPLY)).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expectBefore(screen.getByText(QUESTION), screen.getByText(REPLY))
  })

  it('`?ask` ne part qu’une fois le fil LU — puis une seule fois, même après un nouveau rendu', async () => {
    const read = deferred<unknown[]>()
    listMessagesMock.mockReturnValue(read.promise)
    locationSearch.current = { ask: QUESTION }

    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(askLauraStreamingMock).not.toHaveBeenCalled()

    await act(async () => read.resolve([]))
    expect(await screen.findByText(REPLY)).toBeInTheDocument()
    rerender(<Chat />)
    await act(async () => {})
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
    expect(createMessageMock.mock.calls.map(call => (call[0] as { role: string }).role)).toEqual(['user', 'assistant'])
  })

  it('`?ask` part QUAND MÊME si la lecture du fil échoue — fil vierge supposé, la question n’est pas perdue', async () => {
    listMessagesMock.mockRejectedValue(new Error('offline'))
    locationSearch.current = { ask: QUESTION }

    render(<Chat />)

    expect(await screen.findByText(REPLY)).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
  })

  it('`?ask` sur un fil DÉJÀ écrit : Laura reçoit le fil relu, et la question s’affiche sous lui', async () => {
    const read = deferred<unknown[]>()
    listMessagesMock.mockReturnValue(read.promise)
    locationSearch.current = { conversationId: 'c-ecrit', ask: QUESTION }

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    await act(async () => read.resolve([savedMessage({ content: 'Déjà écrit' })]))

    expect(await screen.findByText(REPLY)).toBeInTheDocument()
    expect(askLauraStreamingMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: QUESTION, history: [{ role: 'assistant', content: 'Déjà écrit' }] }),
      expect.anything(),
      expect.anything(),
    )
    expectBefore(screen.getByText('Déjà écrit'), screen.getByText(QUESTION))
    expectBefore(screen.getByText(QUESTION), screen.getByText(REPLY))
  })
})

describe('La famille — une lecture du fil qui répond après un message ajouté localement ne remplace jamais l’écran', () => {
  it('arrivée sur `/chat` (⌘K, « Demander à Laura ») puis envoi tapé AVANT la fin du chargement : question et réponse restent', async () => {
    const read = deferred<unknown[]>()
    listMessagesMock.mockReturnValue(read.promise)

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: QUESTION } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(await screen.findByText(REPLY)).toBeInTheDocument()

    await act(async () => read.resolve([]))

    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText(REPLY)).toBeInTheDocument()
  })

  it('fil déjà écrit, envoi tapé avant la fin du chargement : le fil relu s’affiche AU-DESSUS de la question, rien n’est perdu', async () => {
    const read = deferred<unknown[]>()
    listMessagesMock.mockReturnValue(read.promise)
    locationSearch.current = { conversationId: 'c-ecrit' }

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: QUESTION } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(await screen.findByText(REPLY)).toBeInTheDocument()

    await act(async () => read.resolve([savedMessage({ content: 'Déjà écrit' })]))

    expectBefore(screen.getByText('Déjà écrit'), screen.getByText(QUESTION))
    expectBefore(screen.getByText(QUESTION), screen.getByText(REPLY))
  })

  it('`?prompt=` puis Entrée avant la fin du chargement : la question pré-remplie et sa réponse restent', async () => {
    const read = deferred<unknown[]>()
    listMessagesMock.mockReturnValue(read.promise)
    locationSearch.current = { prompt: QUESTION }

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(screen.getByPlaceholderText('Écris ton message...'), { key: 'Enter' })
    expect(await screen.findByText(REPLY)).toBeInTheDocument()

    await act(async () => read.resolve([]))

    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText(REPLY)).toBeInTheDocument()
  })

  it('une carte qui ENVOIE (démonstration) avant la fin du chargement : la question et la réponse scriptée restent', async () => {
    demoFlag.current = true
    const read = deferred<unknown[]>()
    listMessagesMock.mockReturnValue(read.promise)
    const [card] = demoSuggestions()
    const excerpt = demoTurn(card!.prompt, '').reply.split('\n')[0]!.slice(0, 40)
    const excerptPattern = new RegExp(excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: card!.label }))
    await waitFor(() => expect(screen.getByText(excerptPattern)).toBeInTheDocument())

    await act(async () => read.resolve([]))

    expect(screen.getByText(excerptPattern)).toBeInTheDocument()
    // La bulle de la question — pas la pastille d'amorce, qui porte le même texte.
    expect(screen.getAllByText(card!.prompt).some(element => !element.closest('button'))).toBe(true)
    expect(askLauraStreamingMock).not.toHaveBeenCalled()
  })
})

describe('#3769 chat envoi à froid — le premier envoi après un chargement de page ne disparaît jamais', () => {
  it('session qui arrive APRÈS le montage + brouillon précédent stocké : saisie, Entrée → la bulle reste et la question part', async () => {
    const { writeChatDraft } = await import('@/features/chat/lib/composer-draft')
    writeChatDraft('u1', 'new', 'brouillon précédent')
    sessionUser.current = null
    const read = deferred<unknown[]>()
    const turn = deferred<{ reply: string }>()
    listMessagesMock.mockReturnValue(read.promise)
    askLauraStreamingMock.mockReturnValue(turn.promise)

    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    sessionUser.current = { id: 'u1' }
    rerender(<Chat />)
    await act(async () => {})

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: QUESTION } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await act(async () => {})

    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    await act(async () => read.resolve([]))
    await act(async () => turn.resolve({ reply: REPLY }))
    expect(await screen.findByText(REPLY)).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect((screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('#3769 chat envoi à froid — un envoi abandonné par un changement de fil ne disparaît pas en silence', () => {
  it('le fil change avant que le serveur accepte le tour : le texte reste en brouillon ET un message le dit', async () => {
    const { readChatDraft } = await import('@/features/chat/lib/composer-draft')
    const { toast } = await import('sonner')
    listMessagesMock.mockReturnValue(deferred<unknown[]>().promise)
    askLauraStreamingMock.mockImplementation(
      (_body: unknown, _handlers: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )

    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: QUESTION } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))

    // Le fil change (l'adresse désigne un compte) avant toute acceptation.
    locationSearch.current = { accountId: 'acc-9' }
    rerender(<Chat />)
    await act(async () => {})

    expect(readChatDraft('u1', 'new')).toBe(QUESTION)
    expect(toast.info).toHaveBeenCalled()
  })
})

describe('#3769 / lot Q02 — le PREMIER envoi après une navigation n’est jamais perdu', () => {
  it('l’adresse qui REFLÈTE le fil écrit (conversationId) pendant que la relecture lente est encore en vol n’efface ni n’abolit rien', async () => {
    const read = deferred<unknown[]>()
    const turn = deferred<{ reply: string }>()
    listMessagesMock.mockReturnValue(read.promise)
    askLauraStreamingMock.mockReturnValue(turn.promise)

    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: QUESTION } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(1))
    const signal = (askLauraStreamingMock.mock.calls[0] as unknown[])[2] as { aborted?: boolean } | undefined

    // L'écran écrit l'identifiant du fil dans l'adresse (#3367) : la relecture n'a toujours pas répondu.
    const sent = listMessagesMock.mock.calls[0]![0] as { conversationId: string }
    locationSearch.current = { conversationId: sent.conversationId }
    rerender(<Chat />)
    await act(async () => {})

    // Le tour en vol n'est PAS aboli et la question reste affichée.
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(signal?.aborted ?? false).toBe(false)
    expect(listMessagesMock).toHaveBeenCalledTimes(1)

    await act(async () => turn.resolve({ reply: REPLY }))
    await act(async () => read.resolve([]))
    expect(screen.getByText(REPLY)).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
  })

  it('navigation vers un autre fil (compte), envoi immédiat avant la relecture : la question part, la réponse arrive', async () => {
    const firstRead = deferred<unknown[]>()
    const secondRead = deferred<unknown[]>()
    listMessagesMock.mockReturnValueOnce(firstRead.promise).mockReturnValue(secondRead.promise)

    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1))
    await act(async () => firstRead.resolve([]))

    // La navigation : l'URL désigne maintenant un compte, donc un autre fil.
    locationSearch.current = { accountId: 'acc-1' }
    rerender(<Chat />)
    await act(async () => {})

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: QUESTION } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await act(async () => secondRead.resolve([]))

    expect(await screen.findByText(REPLY)).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
  })
})

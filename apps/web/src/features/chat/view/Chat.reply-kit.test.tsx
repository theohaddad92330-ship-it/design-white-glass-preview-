import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #2679 — une précision posée en texte se clique aussi.
 *
 * Le retour de Louis : « là ça serait bien de juste pouvoir sélectionner la
 * réponse, sans avoir besoin de la réécrire dans le chat ». Deux mécanismes de
 * « répondre sans retaper » existaient, et aucun ne couvrait ce cas : la carte
 * `ask_clarification` (bornée à UNE par conversation) et les amorces d'accueil
 * (seulement sur un fil vierge). La question posée DANS le texte de la réponse
 * — celle du bloc `_BLOCK_ASK_FIRST`, la plus fréquente, et la seule qui ne
 * coûte pas un tour de modèle — arrivait en markdown, sans un bouton.
 *
 * Ce que cette suite tient, côté appelant :
 *  1. une réponse portant `context.reply_options` rend des boutons, et cliquer
 *     ENVOIE l'option comme message (le geste existant, pas un nouveau) ;
 *  2. LE TÉMOIN : une réponse SANS ce champ ne rend AUCUN bouton — c'est ce
 *     test qui empêche le bouton mort (« on n'affiche pas ce qu'on n'a pas ») ;
 *  3. LA BORNE : une précision en texte ne dépense PAS la clarification du fil.
 *     `clarificationAsked` reste faux au tour suivant — sinon la forme neuve
 *     fermerait `ask_clarification` par effet de bord, ce qui serait un défaut
 *     et pas une fonctionnalité. Le témoin positif est juste à côté : une VRAIE
 *     carte, elle, la dépense toujours.
 *
 * Même harnais que `Chat.clarification-options.test.tsx` (mêmes doubles).
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
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
// `EntityAvatar` (Radix `Avatar`) ne monte son `<img>` qu'une fois l'image
// CHARGÉE, ce qui n'arrive jamais sous jsdom (même piège que
// `company-lists-show-logos.test.tsx`) : on double le rendu par un `<img>`
// simple pour pouvoir lire la source qu'on lui a réellement passée.
vi.mock('@bellum/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@bellum/ui')>()
  return {
    ...actual,
    EntityAvatar: ({ name, src }: { name?: string | null; src?: string | null }) => (
      <img alt={name ?? ''} src={src ?? undefined} />
    ),
  }
})

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

/**
 * #3761.16 (Louis, 11/10) — `Chat.tsx` COMPOSE les pièces de reply-kit : un tour interrompu (`context.partial`)
 * s'annonce par un `ReplyHeader` EN TÊTE de la réponse, une seule fois (GA-26 : le pied de réponse ne le répète pas).
 */
describe('#3761.16 — la réponse partielle est annoncée par ReplyHeader, en tête', () => {
  beforeEach(() => askLauraStreamingMock.mockReset())

  it('un tour arrêté par le délai : en-tête de réponse + badge « Partielle », une seule fois', async () => {
    askLauraStreamingMock.mockResolvedValueOnce({
      reply: 'Voici ce qui a déjà été récupéré.',
      context: { partial: { reason: 'turn_timeout', as_of: '2026-09-25T10:00:00.000Z' } },
    })
    render(<Chat />)
    await send('Analyse Airbus')

    const header = await waitFor(() => {
      const found = document.querySelector('[data-reply-header]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    expect(header).toHaveTextContent('Réponse partielle — délai dépassé')
    expect(header.querySelector('[data-reply-status="partial"]')).toHaveTextContent('Partielle')
    // En tête : l'en-tête précède le texte de la réponse dans la bulle.
    const bubble = header.closest('[data-chat-kind="reply"]') as HTMLElement
    expect(bubble.firstElementChild?.contains(header)).toBe(true)
    // Une seule fois : le pied de réponse ne répète pas le repère.
    expect(screen.getAllByText('Réponse partielle — délai dépassé')).toHaveLength(1)
  })

  it('sait dire NON : un tour terminé normalement n’a pas d’en-tête', async () => {
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Une réponse complète.', context: {} })
    render(<Chat />)
    await send('Analyse Airbus')
    await screen.findByText('Une réponse complète.')
    expect(document.querySelector('[data-reply-header]')).toBeNull()
  })
})

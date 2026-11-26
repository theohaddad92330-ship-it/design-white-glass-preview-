import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #1914.14 — LES COMPOSANTS D'UNE RÉPONSE SURVIVENT AU RECHARGEMENT.
 *
 * Le fil relu rendait du texte nu : `Chat.tsx` le disait deux fois, « le
 * `context` n'est PAS persisté ». Cette suite tient les trois faits du lot :
 * le contexte PART à l'écriture, il REVIENT à la relecture, et un message
 * ANCIEN — qui n'en a aucun — s'affiche exactement comme avant.
 *
 * Mêmes doubles que `Chat.cards.test.tsx` : cette suite ne mesure ni l'accueil,
 * ni les connecteurs, ni la démonstration.
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

const CONTEXT = {
  active: {
    profile: { present: true, name: 'Sarah' },
    account: { present: true, name: 'Latécoère', as_of: null },
    contacts_count: 4,
    plan: { present: true },
    portfolio: { present: true, count: 12 },
    memory: { pinned_facts: 0, has_summary: false },
  },
  sources: [{ kind: 'crm', label: 'Fiche CRM de Latécoère', as_of: null }],
  not_consulted: [],
}

function persistedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    account_id: null,
    conversation_id: 'general',
    role: 'user',
    content: 'Message persisté',
    created_at: '2026-09-16T10:00:00Z',
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

describe('Chat — le contexte d’une réponse est persisté', () => {
  it('écrit le contexte du tour AVEC la réponse', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: 'Voilà où ils en sont.', context: CONTEXT })
    render(<Chat />)
    await send('Où en est Latécoère ?')

    await waitFor(() => {
      const reply = createMessageMock.mock.calls
        .map(call => call[0] as Record<string, unknown>)
        .find(call => call.role === 'assistant')
      expect(reply?.context).toBeTruthy()
    })
  })

  // #4016.L3.a (recette prod 14/10) — « résume le fil avec <interlocuteur> » : 2
  // réponses, 0 « Laura a lu ce fil ». Ce témoin visait le tour EN VOL (pas un
  // fil relu, déjà couvert par `ReplyFooter.mailbox-read.test.tsx` au niveau du
  // composant seul) : la trace `reasoning_trace.tools_called` arrivée avec le
  // tour LIVE doit atteindre la bulle sans attendre un rechargement.
  it('#4016.L3.a — un tour EN VOL qui a lu la boîte montre « Laura a lu ce fil », sans rechargement', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Il te répond vendredi.',
      context: { ...CONTEXT, reasoning_trace: { tools_called: ['search_mailbox', 'read_mail_thread'] } },
    })
    render(<Chat />)
    await send('Résume le fil avec Camille')

    expect(await screen.findByText('Il te répond vendredi.')).toBeInTheDocument()
    // #5032.9 — la mention vit dans le panneau Sources, plus dans la ligne.
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))
    expect(await screen.findByText(/Laura a lu un fil de ta messagerie pour répondre/)).toBeInTheDocument()
  })

  it('un fil RELU rend son panneau de transparence — il ne disparaît plus au rechargement', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-q', role: 'user', content: 'Où en est Latécoère ?' }),
      persistedMessage({ id: 'm-a', role: 'assistant', content: 'Voilà où ils en sont.', context: CONTEXT }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    await screen.findByText('Voilà où ils en sont.')
    // « Sources » (#5032.6, ex-« Voir la source ») n'apparaît QUE sous une réponse
    // qui porte un contexte (`ReplyFooter`) : c'est donc le témoin que le panneau
    // est revenu ; le compte de sources vit dans le panneau ouvert (#5032.7).
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))
    expect(screen.getByText('1 source')).toBeInTheDocument()
  })

  /**
   * LE TÉMOIN QUI COMPTE, et la régression la plus probable de ce lot : tout ce
   * qui est déjà en base n'a AUCUN contexte. Ces messages doivent continuer de
   * s'afficher, avec leur texte, et sans panneau — jamais un rendu cassé.
   */
  it('un message ANCIEN, sans contexte, s’affiche exactement comme avant', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-q', role: 'user', content: 'Question de mars' }),
      persistedMessage({ id: 'm-a', role: 'assistant', content: 'Réponse de mars' }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    expect(await screen.findByText('Réponse de mars')).toBeInTheDocument()
    expect(screen.getByText('Question de mars')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Sources|Contexte)$/ })).not.toBeInTheDocument()
  })

  /** `null` est ce que l'API sert pour un message sans contexte gardé : il doit
   *  se lire comme une absence, jamais faire tomber le rendu. */
  it('un `context: null` servi par l’API ne casse rien', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-a', role: 'assistant', content: 'Réponse sans contexte', context: null }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    expect(await screen.findByText('Réponse sans contexte')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Sources|Contexte)$/ })).not.toBeInTheDocument()
  })
})

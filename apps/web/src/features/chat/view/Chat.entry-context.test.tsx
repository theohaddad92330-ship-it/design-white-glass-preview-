import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import type * as HomeSuggestions from './laura-home-suggestions'

/** Pilote le mock de `useLocation`. */
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #2123.56 — LAURA OUVERTE DEPUIS UN DOSSIER GARDE CE QUE LE DOSSIER SAVAIT.
 *
 * `entry-page-context.test.ts` prouve la RÈGLE ; ce fichier prouve l'APPELANT,
 * dans l'écran réel : le contexte que le panneau du compte passe à `/chat`
 * (section, périmètre, sources) part avec le tour tant que la portée est ce
 * compte, et reste derrière sinon.
 *
 * Même échafaudage que `Chat.scope-object.test.tsx`.
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
  // #1989 (main) — le hook rend aussi les outils branchés, que la saisie nomme.
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
// #1954.20 (main, #1982) — `Chat` retire désormais une pièce jointe par ce hook
// réseau, qui exige un QueryClient. Une feuille que ce fichier ne mesure pas :
// doublée comme dans les trois suites que #1982 a mises à jour.
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
  const actual = await importOriginal<typeof HomeSuggestions>()
  return { ...actual, useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }) }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
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
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({
    data: [
      {
        id: '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11',
        full_name: 'Sophie Martin',
        title: 'Consultante Java',
        available_from: null,
        archived_at: null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: [] }, isLoading: false, isError: false }),
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

const ACCOUNT_ID = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
const OTHER_ACCOUNT_ID = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d'

const CONTEXT = {
  kind: 'account',
  label: 'AIRBUS',
  entityId: ACCOUNT_ID,
  facets: [
    { label: 'Section d’origine', value: 'Vue d’ensemble' },
    { label: 'Périmètre visé', value: 'Cellule méthodes du site de Toulouse' },
  ],
  state: 'ready',
}

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({ id: 'm-1', ...args }))
  askLauraStreamingMock.mockResolvedValue({ reply: 'Réponse de Laura' })
})

async function send(text: string) {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('#2123.56 — le contexte du dossier part avec la question', () => {
  it('ouverte depuis le compte, la question emporte la section et le périmètre du dossier', async () => {
    locationSearch.current = { accountId: ACCOUNT_ID, context: CONTEXT }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await send('Résume-moi la stratégie')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT_ID, pageContext: CONTEXT }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  it('témoin : un contexte qui parle d’un AUTRE compte ne part pas', async () => {
    locationSearch.current = { accountId: ACCOUNT_ID, context: { ...CONTEXT, entityId: OTHER_ACCOUNT_ID } }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await send('Bonjour')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Bonjour', pageContext: null }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  /**
   * #3002 (26/09/2026, second passage) — /pilotage n'a AUCUN compte
   * (`accountId` jamais dans son URL) : `AskLaura` y navigue vers `/chat` avec
   * `context` seul (repli mobile, ou surcouche ouverte — `AskLaura.tsx`), et
   * c'est le composeur de `/chat`, pas la bulle, qui envoie le tour.
   */
  it('#3002 — ouverte depuis /pilotage (aucun compte), la question emporte quand même le contexte de l’écran', async () => {
    const PILOTAGE_CONTEXT = {
      kind: 'pilotage',
      label: 'Pilotage',
      entityId: null,
      facets: [{ label: 'Couverture', value: '4/12' }],
      state: 'ready',
    }
    locationSearch.current = { context: PILOTAGE_CONTEXT }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await send('Explique-moi cet écran')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: null, pageContext: PILOTAGE_CONTEXT }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })
})

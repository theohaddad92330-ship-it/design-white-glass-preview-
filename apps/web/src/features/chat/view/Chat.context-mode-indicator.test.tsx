import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import type { LauraContextMode } from '@bellum/contracts'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
const workspaceDefaultMode = vi.hoisted(() => ({ current: undefined as LauraContextMode | undefined }))
import { Chat } from './Chat'

/**
 * #3846.1 — LE MODE DE CONTEXTE (« Mon activité » / « Neutre » / « Mission
 * ponctuelle »), VISIBLE DEPUIS L'EN-TÊTE, PAS SEULEMENT DANS LE PANNEAU.
 *
 * #3772.1 (07/10) a déplacé `ContextModeSelector` du composeur vers la
 * section « Personnalisation » du panneau `ScopeDialog` (ouvert depuis
 * `ScopeButton`, en-tête) — décision tenue (GA-26, un réglage vit à un seul
 * endroit) et non remise en cause ici. Mais le geste a aussi rendu le mode
 * ACTIF totalement MUET hors du panneau : avant, le sélecteur était monté en
 * permanence sous la saisie et son libellé (`ContextModePicker`) disait déjà
 * le mode courant. Rapporté en bêta le 08/10 (#3846) : « la sélection de mon
 * profil a disparu ».
 *
 * `ScopeButton` pose sa propre doctrine juste à côté (« il AFFICHE toujours
 * quelque chose ») — cette garde l'étend au mode de contexte, SANS dupliquer
 * le contrôle interactif : un indicateur LECTURE SEULE, qui ouvre le MÊME
 * panneau que `ScopeButton` (`onOpenScope`), silencieux au mode par défaut
 * (« Mon activité », rien à signaler) et visible sinon.
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
  useWorkspaceDefaultContextMode: () => workspaceDefaultMode.current,
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
// #2876 (#2433.4) — même raison partout ailleurs : `AttachmentPreviewDialog`
// appelle ce hook inconditionnellement, qui exige un `QueryClientProvider`
// absent de ce harnais de test.
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('../api/laura-turn', () => ({ askLauraStreaming: vi.fn().mockResolvedValue({ reply: 'Réponse de Laura' }) }))

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

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  workspaceDefaultMode.current = undefined
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({ id: 'm-1', ...args }))
})

describe('#5048 — « Mon profil » vit dans le composeur, plus dans l’en-tête (revient sur #3846.1)', () => {
  it('le composeur porte « Mon profil » avec le mode courant', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(await screen.findByRole('switch', { name: /^Mon profil : Mon activité/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('mode non par défaut (« Neutre », réglage d’espace) : dit dans le composeur, aucun rappel dans l’en-tête', async () => {
    workspaceDefaultMode.current = 'neutral'
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    expect(await screen.findByRole('switch', { name: /^Mon profil : Neutre/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('button', { name: /Contexte de travail/ })).not.toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2435.9 — « UPLOAD REPRENABLE », VERSION MINIMALE TRANCHÉE PAR LOUIS
 * (22/09 soir, decisions-louis-22-09-soir.md §1).
 *
 * Pas de protocole par blocs : un ÉCHEC TECHNIQUE (réseau, 5xx) garde le
 * fichier déjà lu en mémoire et le rejoue au clic sur « Réessayer », sans
 * repasser par le sélecteur (photo reprise sur mobile en particulier — la
 * capture ne se refait pas). Un REFUS de contenu (422) n'a pas ce bouton :
 * réessayer le même fichier ne corrigerait rien.
 *
 * Même gabarit que `Chat.attach-formats.test.tsx`.
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
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-id') }),
}))
const ingestMutateAsyncMock = vi.fn()
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({
    mutateAsync: (...args: unknown[]) => ingestMutateAsyncMock(...args),
    isPending: false,
  }),
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
vi.mock('../api/laura-turn', () => ({ askLauraStreaming: vi.fn() }))
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: vi.fn().mockResolvedValue([]),
  createAgentChatMessage: vi.fn().mockResolvedValue({}),
  listAgentChatHistory: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

import { Chat } from './Chat'

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  localStorage.clear()
  ingestMutateAsyncMock.mockReset()
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

describe('#2435.9 — réessayer un dépôt en échec technique, sans re-sélection', () => {
  it('un ÉCHEC réseau garde le fichier ; « Réessayer » le renvoie et la carte disparaît au succès', async () => {
    ingestMutateAsyncMock.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({
      id: 'doc-1',
      partial: false,
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    // #2148.16 — un dépôt REJOUABLE se mesure sur `rag_documents` : la portée
    // par défaut (« pour cette conversation ») est ÉPHÉMÈRE depuis ce lot et
    // n'ingère plus rien. « Mon espace personnel » garde le chemin d'avant.
    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))

    const file = new File(['contenu du fichier'], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'contenu du fichier' })
    fireEvent.change(threadFileInput(container), { target: { files: [file] } })

    await screen.findByText('Erreur')
    expect(ingestMutateAsyncMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /réessayer/i }))

    await waitFor(() => expect(ingestMutateAsyncMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Erreur')).not.toBeInTheDocument())
  })

  it('un REFUS de contenu (422) n’offre PAS de « Réessayer » — le même fichier serait refusé pareil', async () => {
    const { ApiError } = await import('@/lib/api-error')
    ingestMutateAsyncMock.mockRejectedValueOnce(new ApiError('contenu illisible', 422))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    // #2148.16 — même raison que le test précédent : le refus se mesure sur le
    // chemin d'ingestion, exercé par « Mon espace personnel ».
    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))

    const file = new File(['contenu du fichier'], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'contenu du fichier' })
    fireEvent.change(threadFileInput(container), { target: { files: [file] } })

    await screen.findByText('Refusé')
    expect(screen.queryByRole('button', { name: /réessayer/i })).not.toBeInTheDocument()
  })
})

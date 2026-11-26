import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1954.19 — PRÉVISUALISER UN DOCUMENT DÉJÀ ATTACHÉ.
 *
 * Avant ce lot : la pastille d'une pièce jointe affichait son nom en TEXTE
 * SEUL — aucun moyen de relire son contenu sans le retélécharger depuis son
 * poste (registre 12/09 : « seul le nom du fichier est affiché »). Le nom
 * (avec l'icône) devient un bouton qui ouvre un aperçu (`AttachmentPreviewDialog`),
 * chargé via `GET /rag-documents/:id` (`useRagDocumentContent`).
 *
 * Même gabarit que `Chat.attach-scope.test.tsx`.
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
type RagDocumentContentQueryState = {
  data: { id: string; title: string | null; content: string | null; category: string | null } | undefined
  isLoading: boolean
  isError: boolean
}
const ragContentMock = vi.fn(
  (_id: string | null): RagDocumentContentQueryState => ({ data: undefined, isLoading: false, isError: false }),
)
vi.mock('@/features/rag/hooks/useRagDocumentContent', () => ({
  useRagDocumentContent: (id: string | null) => ragContentMock(id),
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
  ragContentMock.mockReset()
  ragContentMock.mockImplementation(() => ({ data: undefined, isLoading: false, isError: false }))
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

// #2148.16 — « Pour cette conversation » est désormais ÉPHÉMÈRE (aucune ligne
// `rag_documents` à relire) : l'aperçu serveur se prouve sur une pièce DURABLE.
async function attachOneDocument(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-1', partial: false })
  await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))
  const file = new File(['contenu du fichier'], 'note.txt', { type: 'text/plain' })
  Object.defineProperty(file, 'text', { value: async () => 'contenu du fichier' })
  const { fireEvent: fire } = await import('@testing-library/react')
  fire.change(threadFileInput(container), { target: { files: [file] } })
  await screen.findByText('mon espace')
}

describe('#1954.19 — prévisualiser un document déjà attaché', () => {
  it('un clic sur le nom ouvre un aperçu qui montre le contenu chargé', async () => {
    ragContentMock.mockImplementation((id: string | null) =>
      id === 'doc-1'
        ? {
            data: { id: 'doc-1', title: 'note.txt', content: 'Le contenu complet du document.', category: null },
            isLoading: false,
            isError: false,
          }
        : { data: undefined, isLoading: false, isError: false },
    )
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)

    await user.click(screen.getByRole('button', { name: 'Aperçu de « note.txt »' }))

    expect(await screen.findByText('Le contenu complet du document.')).toBeInTheDocument()
  })

  it('un échec de chargement affiche un message, pas le contenu', async () => {
    ragContentMock.mockImplementation((id: string | null) =>
      id === 'doc-1'
        ? { data: undefined, isLoading: false, isError: true }
        : { data: undefined, isLoading: false, isError: false },
    )
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)
    await user.click(screen.getByRole('button', { name: 'Aperçu de « note.txt »' }))

    await waitFor(() => expect(screen.getByText('L’aperçu de ce document n’a pas pu être chargé.')).toBeInTheDocument())
  })

  it('fermer l’aperçu ne retire pas la pièce jointe du composeur', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)
    await user.click(screen.getByRole('button', { name: 'Aperçu de « note.txt »' }))
    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByText('L’aperçu de ce document n’a pas pu être chargé.')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('note.txt')).toBeInTheDocument()
  })
})

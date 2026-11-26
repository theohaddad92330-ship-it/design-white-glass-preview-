import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2850 (#2431.11/.3, décision Louis 28/09) — AUCUNE écriture automatique : la
 * confiance HAUTE de la classification serveur (`chat-import-classifier.ts`)
 * ouvre désormais une PROPOSITION (session d'import créée + simulée côté
 * serveur, jamais écrite) via la porte d'approbation déjà existante de
 * l'assistant d'import — `RagController.ingest` la rend sous
 * `pendingImportSessionId`. Ce fichier couvre le SEUL geste visible côté écran
 * qui en découle : le toast dit « proposition prête à revoir », jamais
 * « intégré » (#2431.3 NO-GO) — distinct du toast « dépose-le via Import » de
 * la confiance basse (`Chat.tsx::IMPORT_SUGGESTION_LABEL_KEY`, inchangé).
 *
 * Même gabarit de mocks que `Chat.attach-preview.test.tsx`.
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
  useWorkspaceDefaultContextMode: () => undefined,
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
const ingestZipMutateAsyncMock = vi.fn()
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({
    mutateAsync: (...args: unknown[]) => ingestZipMutateAsyncMock(...args),
    isPending: false,
  }),
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
  ingestZipMutateAsyncMock.mockReset()
  vi.mocked(toast.info).mockClear()
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

async function dropCsv(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  // Le chemin `conversation` (portée PAR DÉFAUT) est ÉPHÉMÈRE (#2148.16) et
  // passe par `extractFile`, jamais `ingest` — la classification par contenu
  // ne s'applique qu'aux TROIS portées EXPLICITES d'ajout à la base. « Mon
  // espace personnel » est la même portée qu'utilise déjà
  // `Chat.attach-preview.test.tsx` pour exercer ce chemin.
  await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))
  const file = new File(['raison sociale,siren\nAcme SAS,123456789'], 'export.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => 'raison sociale,siren\nAcme SAS,123456789' })
  fireEvent.change(threadFileInput(container), { target: { files: [file] } })
  await screen.findByText('Prêt')
}

describe('#2850 (#2431.11/.3) — toast de proposition d’import depuis le chat', () => {
  it('confiance HAUTE (`pendingImportSessionId` présent) — dit la proposition PRÊTE À REVOIR, jamais « intégré »', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({
      id: 'doc-1',
      partial: false,
      suggestedObject: 'account',
      pendingImportSessionId: 'session-1',
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await dropCsv(container, user)

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringMatching(/proposition/i),
      expect.objectContaining({ duration: expect.any(Number) }),
    )
    const [message] = vi.mocked(toast.info).mock.calls.at(-1) ?? []
    expect(message).not.toMatch(/intégré/i)
  })

  it('confiance BASSE (`pendingImportSessionId` absent) — garde l’invite « dépose-le via Import » inchangée', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({
      id: 'doc-1',
      partial: false,
      suggestedObject: 'account',
      pendingImportSessionId: null,
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await dropCsv(container, user)

    const [message] = vi.mocked(toast.info).mock.calls.at(-1) ?? []
    expect(message).toMatch(/dépose-le/i)
  })
})

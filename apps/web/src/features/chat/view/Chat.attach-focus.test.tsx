import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3356.2 — la recette prod du 02/10 n'a pas pu prouver le focus clavier des
 * boutons de la barre de saisie : il faut une PIÈCE JOINTE pour qu'ils
 * existent. Ce test rejoue le cas : un fichier est déposé, on tabule au
 * clavier jusqu'au bouton « retirer » et on vérifie que l'élément focalisé
 * porte l'anneau de focus partagé (`CHAT_SURFACE.focusRing`), exactement
 * comme les pastilles voisines.
 *
 * Même gabarit que `Chat.attach-multiple.test.tsx`.
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
const ingestZipMock = vi.fn()
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
  useIngestRagZip: () => ({ mutateAsync: (...args: unknown[]) => ingestZipMock(...args), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useDeleteRagDocument', () => ({
  useDeleteRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
const updateScopeMutateAsyncMock = vi.fn()
vi.mock('@/features/rag/hooks/useUpdateRagDocumentScope', () => ({
  useUpdateRagDocumentScope: () => ({
    mutateAsync: (...args: unknown[]) => updateScopeMutateAsyncMock(...args),
    isPending: false,
  }),
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
  updateScopeMutateAsyncMock.mockReset()
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

function textFile(name: string): File {
  const file = new File([`contenu ${name}`], name, { type: 'text/plain' })
  Object.defineProperty(file, 'text', { value: async () => `contenu ${name}` })
  return file
}

/**
 * #2148.16 — ce fichier mesure le chemin d'INGESTION (compte des appels,
 * identifiants, badge de type) : la portée par défaut (« pour cette
 * conversation ») est ÉPHÉMÈRE depuis ce lot et n'ingère plus rien. « Mon
 * espace personnel » garde le même chemin `useIngestRagDocument` qu'avant.
 */
async function openThreadPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))
}

describe('#3356.2 — focus clavier des boutons de la pièce jointe', () => {
  it('le bouton « retirer » reçoit le focus par Tab et porte l’anneau partagé', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-1', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    fireEvent.change(threadFileInput(container), { target: { files: [textFile('a.txt')] } })
    const remove = await screen.findByRole('button', { name: /retirer/i }, { timeout: 5000 })
    expect(remove.tabIndex).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 40 && document.activeElement !== remove; i++) await user.tab()

    expect(document.activeElement).toBe(remove)
    expect(remove.className).toContain('focus-visible:ring-2')
    expect(remove.className).toContain('focus-visible:ring-[var(--bellum-text-accent)]')
  })

  it('chaque bouton de la rangée de pièces jointes est tabulable et porte l’anneau', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-1', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    fireEvent.change(threadFileInput(container), { target: { files: [textFile('a.txt')] } })
    await screen.findByText('a.txt', {}, { timeout: 5000 })
    // Chaque bouton à état hover de la rangée doit porter le focus partagé.
    const hoverOnly = screen
      .getAllByRole('button')
      .filter(b => b.className.includes('hover:text-[var(--bellum-text-primary)]'))
      .filter(b => !b.className.includes('focus-visible:ring-2'))
    expect(hoverOnly.map(b => b.getAttribute('aria-label'))).toEqual([])
  })
})

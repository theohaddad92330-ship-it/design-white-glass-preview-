import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2428.9 — APERÇU COMPLET D'UNE PIÈCE JOINTE AVANT ENVOI : NOM, TYPE, TAILLE,
 * STATUT.
 *
 * Avant ce lot, la pastille d'une pièce jointe montrait nom + portée + statut
 * (`ATTACH_STATUS_LABEL_KEY`) — jamais le type ni la taille du fichier
 * (registre 21/09 : « partiel, type/taille jamais affichés »). `AttachedDoc`
 * porte désormais `type`/`size`, posés au SEUL point d'écriture qui a un
 * `File` réel (`uploadSingleDocument`) — jamais pour une entrée d'archive
 * .zip dépliée côté serveur, qui n'en a pas (doctrine : jamais de donnée
 * fictive).
 *
 * Même gabarit que `Chat.attach-retry.test.tsx`.
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
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

describe('#2428.9 — la pastille de pièce jointe montre type et taille', () => {
  it('un dépôt réussi affiche l’extension ET le poids, à côté du nom', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-1', partial: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pour cette conversation' }))

    // 18 octets, ASCII pur → `formatBytes` rend « 18 B ».
    const file = new File(['contenu du fichier'], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'contenu du fichier' })
    fireEvent.change(threadFileInput(container), { target: { files: [file] } })

    // La carte « en cours » (nom+« Analyse… ») porte aussi le nom du fichier —
    // attendre le badge « Prêt » garantit qu'on lit la pastille FINALE
    // (`attachedDocs`), pas la pastille transitoire (`pendingUploads`).
    const ready = await screen.findByText('Prêt')
    const card = ready.closest('span[title]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('TXT')
    expect(card?.textContent).toContain('18 B')
  })

  it('une entrée d’archive .zip dépliée côté serveur — sans `File` local — n’affiche AUCUN segment type/taille inventé', async () => {
    // #2428.9 — doctrine : jamais de donnée fictive. Le chemin .zip
    // (#2667.1) ne porte que `outcome.file` (un nom), jamais un `File` : le
    // segment doit disparaître plutôt qu'afficher un type deviné ou un « 0 ».
    // #2148.16 (reste, 26/09) — ce chemin durable (`ingestZip`) n'est plus
    // emprunté qu'en portée EXPLICITE : « pour cette conversation » (par
    // défaut) est désormais éphémère pour une archive comme pour tout fichier
    // (`Chat.attach-scope.test.tsx`). On exerce donc ici « Mon espace
    // personnel » pour continuer à couvrir le rendu SANS type/taille inventés
    // d'une entrée d'archive dépliée côté serveur.
    ingestZipMutateAsyncMock.mockResolvedValueOnce({
      total: 1,
      outcomes: [{ status: 'ingested', file: 'notes.pdf', id: 'doc-2', partial: false }],
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))

    const zip = new File(['PK'], 'lot.zip', { type: 'application/zip' })
    fireEvent.change(threadFileInput(container), { target: { files: [zip] } })

    const pill = await screen.findByText('notes.pdf')
    const card = pill.parentElement
    expect(card?.textContent).not.toMatch(/\bPDF\b/)
    expect(card?.textContent).not.toMatch(/\bB\b|\bKB\b|\bMB\b/)
  })
})

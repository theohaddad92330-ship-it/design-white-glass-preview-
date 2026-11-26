import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2876 (#2433.4) — PREUVE VISUELLE CLIQUABLE.
 *
 * Avant ce lot : une image jointe au chat était déjà LUE par le modèle
 * (`extract_images_text`, apps/ia) et sa pastille apparaissait sous le message
 * envoyé (#2494) — mais en texte seul, « aucune surface de ce genre n'existe
 * pour ces documents aujourd'hui » (Chat.tsx, commentaire d'origine). Cliquer
 * la pastille d'une IMAGE rouvre désormais la source elle-même (URL locale,
 * jamais envoyée au serveur), depuis le message qui l'a jointe.
 *
 * Même gabarit que `Chat.attach-preview-open.test.tsx` (aperçu serveur d'une
 * pièce durable) et `Chat.cards.test.tsx` (envoi complet d'un tour).
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
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({ CommandDrawerButton: () => null }))
vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/features/actions/hooks/useActionLevel', () => ({ useActionLevel: () => ({ data: undefined }) }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/missions/api', () => ({ useMissionTerms: () => ({ data: undefined, isPending: false }) }))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop !== 'string') return undefined
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
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-id') }),
}))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
const extractFileMock = vi.fn().mockResolvedValue({ text: 'Jean Dupont — Directeur technique', partial: false })
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({ mutateAsync: (...args: unknown[]) => extractFileMock(...args), isPending: false }),
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
// `QueryClientProvider` absent de ce harnais de test. Ces cas ouvrent tous par
// `imageUrl` (blob local, session en cours) — jamais par `imageObjectId`.
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))

// #2876 (#2433.12) — le prétraitement réel utilise `Image`/`<canvas>`, absents
// de jsdom (aucun `onload` ne se déclenche jamais) : passthrough ici, la
// logique de prétraitement est déjà couverte par `image-preprocess.test.ts`.
vi.mock('@/features/chat/lib/image-preprocess', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/chat/lib/image-preprocess')>()
  return { ...actual, preprocessChatImage: vi.fn(async (file: File) => file) }
})

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

import { Chat } from './Chat'

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  // jsdom n'implémente ni l'un ni l'autre — voir le mock `image-preprocess`
  // ci-dessus pour `Image`/`<canvas>`, dans le même esprit.
  URL.createObjectURL = vi.fn(() => 'blob:mock-image-url')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({
    id: 'm-1',
    account_id: null,
    conversation_id: 'general',
    role: 'user',
    content: 'Message persisté',
    created_at: '2026-09-27T10:00:00Z',
    ...args,
  }))
  extractFileMock.mockResolvedValue({ text: 'Jean Dupont — Directeur technique', partial: false })
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

async function attachImage(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Pour cette conversation' }))
  const file = new File(['donnees-image'], 'organigramme.png', { type: 'image/png' })
  fireEvent.change(threadFileInput(container), { target: { files: [file] } })
  await screen.findByText('organigramme.png')
}

async function send(text: string, user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  await user.type(textarea, text)
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('#2876 (#2433.4) — la pièce jointe image reste cliquable après envoi', () => {
  it("cliquer la pastille de l'image jointe à un message ENVOYÉ rouvre sa source visuelle", async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: 'Je vois un organigramme.', context: {} })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachImage(container, user)
    await send('Que vois-tu sur cette image ?', user)

    // La bulle ENVOYÉE garde sa pastille — #2494, inchangé.
    const chip = await screen.findByRole('button', { name: 'Aperçu de « organigramme.png »' })

    await user.click(chip)

    const image = await screen.findByRole('img', { name: 'Image source — « organigramme.png »' })
    expect(image).toHaveAttribute('src', 'blob:mock-image-url')
  })

  it('#2433.4 (lot M10) — la zone où chaque ligne a été lue est surlignée sur la source rouverte', async () => {
    extractFileMock.mockResolvedValue({
      text: 'Directeur technique',
      partial: false,
      imageObjectId: 'img-42',
      regions: [{ quote: 'Directeur technique', bounding_box: { x: 0.2, y: 0.3, w: 0.4, h: 0.1 } }],
    })
    askLauraStreamingMock.mockResolvedValue({ reply: 'Je vois un organigramme.', context: {} })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachImage(container, user)
    await send('Que vois-tu sur cette image ?', user)
    await user.click(await screen.findByRole('button', { name: 'Aperçu de « organigramme.png »' }))

    const zone = await screen.findByTestId('chat-image-citation-0')
    expect(zone.style.left).toBe('20%')
    expect(screen.getByText('« Directeur technique »')).toBeInTheDocument()
  })

  it('une pièce NON-image (texte) reste une pastille simple, sans bouton — inchangé depuis #2494', async () => {
    extractFileMock.mockResolvedValue({ text: 'contenu du fichier', partial: false })
    askLauraStreamingMock.mockResolvedValue({ reply: 'Reçu.', context: {} })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pour cette conversation' }))
    const file = new File(['contenu'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(threadFileInput(container), { target: { files: [file] } })
    await screen.findByText('notes.txt')

    await send('Résume ce document.', user)

    await screen.findByText('notes.txt')
    expect(screen.queryByRole('button', { name: 'Aperçu de « notes.txt »' })).not.toBeInTheDocument()
  })
})

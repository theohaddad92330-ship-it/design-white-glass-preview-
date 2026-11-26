import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2667.2 — LE SÉLECTEUR OUVRE PPTX ET LES IMAGES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * `ATTACH_EXTENSIONS` (`Chat.tsx`) n'ouvre un type QUE s'il est réellement
 * exploité côté serveur — c'est toute la raison du lot #2667.2
 * (`document_text.py` sait désormais lire `.pptx` et les images png/jpeg/webp
 * par le modèle). Avant ce lot, `.pptx` et les images étaient volontairement
 * ÉCARTÉS du sélecteur (commentaire #2667.1/#2667.2 sur `ATTACH_EXTENSIONS`) :
 * ce test aurait donc dû ROUGIR sans le changement de tableau — il vérifie le
 * SÉLECTEUR RÉEL (attribut `accept` de l'`<input>`, et la phrase affichée dans
 * le menu « + »), pas une relecture de la constante.
 *
 * Mêmes doubles que `Chat.draft.test.tsx` (le plus petit gabarit de test de
 * `<Chat />` existant) : `<Chat />` se monte sans `QueryClientProvider`, donc
 * chaque hook react-group qu'il lit est doublé ici.
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
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
}))
// #2667.1 — même mock que `useIngestRagDocument` ci-dessus, pour l'archive .zip
// (ComposerToolsMenu l'appelle inconditionnellement, sans QueryClientProvider).
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

// Radix (le menu du « + ») a besoin de ces API pointeur, absentes de jsdom.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  localStorage.clear()
})

describe('#2667.2 — pptx et images ouverts au sélecteur, FR et EN', () => {
  it("l'attribut `accept` de l'input de fichier porte .pptx et les trois formats d'image", () => {
    const { container } = render(<Chat />)
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    const accept = input?.getAttribute('accept') ?? ''
    const extensions = accept.split(',')
    for (const ext of ['.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp', '.txt']) {
      expect(extensions).toContain(ext)
    }
  })

  it('la phrase affichée dans le menu « + » nomme PPTX et les formats image (FR)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByLabelText('Ajouter à ce message'))

    const limits = await screen.findByText(/Mo max/)
    const text = limits.textContent ?? ''
    expect(text).toMatch(/PPTX/i)
    expect(text).toMatch(/PNG/i)
    expect(text).toMatch(/JPEG|JPG/i)
    expect(text).toMatch(/WEBP/i)
  })

  it('même phrase, en anglais — la liste est dérivée du même tableau, aucune clé de traduction séparée', async () => {
    await i18n.changeLanguage('en')
    try {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(<Chat />)

      await user.click(screen.getByLabelText('Add to this message'))

      const limits = await screen.findByText(/MB max/)
      const text = limits.textContent ?? ''
      expect(text).toMatch(/PPTX/i)
      expect(text).toMatch(/PNG/i)
      expect(text).toMatch(/JPEG|JPG/i)
      expect(text).toMatch(/WEBP/i)
    } finally {
      await i18n.changeLanguage('fr')
    }
  })
})

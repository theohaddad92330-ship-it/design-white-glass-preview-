import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3849.1 — GLISSER UN FICHIER DANS LE COMPOSEUR, « COMME DANS CHATGPT OU CLAUDE ».
 *
 * Rapporté en bêta le 08/10 : « je ne dois pas être obligé d'aller l'ajouter
 * quelque part dans Bellum, je dois pouvoir le donner ici […] donner aussi la
 * possibilité de le faire glisser ». Aucun `onDrop` n'existait sur le
 * composeur — seul le sélecteur natif (`<input type="file">`) posait un
 * fichier.
 *
 * Le contrôle AVANT envoi (`validateRagUpload`, #3751) existait déjà, mais
 * seulement côté Connaissances et de l'import d'analyse (`search/lib/
 * analysis-attachments.ts`) — jamais appelé ici : un fichier au format
 * manifestement refusé (ni document, ni image, ni archive) partait quand
 * même en réseau, pour un refus serveur générique.
 *
 * Même gabarit que `Chat.attach-formats.test.tsx` (le plus petit qui rend
 * `<Chat />` sans `QueryClientProvider`).
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
  return { ...actual, useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }) }
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
const extractFileMock = vi.fn()
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: (...args: unknown[]) => extractFileMock(...args),
    isPending: false,
  }),
}))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  extractFileMock.mockReset()
  extractFileMock.mockResolvedValue({ text: 'contenu du fichier', partial: false })
})

function composerForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('[data-testid="chat-composer"]')
  if (!(form instanceof HTMLFormElement)) throw new Error('composeur absent')
  return form
}

function makeFile(name: string, type = 'text/plain'): File {
  return new File([`contenu ${name}`], name, { type })
}

function dropFiles(form: HTMLFormElement, files: File[]) {
  fireEvent.drop(form, { dataTransfer: { files, types: ['Files'] } })
}

describe('#3849.1 — déposer un fichier dans le composeur (glisser-déposer)', () => {
  it('un fichier glissé-déposé est attaché, comme un fichier choisi au sélecteur', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => expect(screen.queryByPlaceholderText('Écris ton message...')).toBeInTheDocument())

    dropFiles(composerForm(container), [makeFile('rapport.txt')])

    await waitFor(() => expect(extractFileMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('rapport.txt')).toBeInTheDocument()
  })

  it('un format non accepté est refusé AVANT tout appel réseau, et nommé', async () => {
    const { toast } = await import('sonner')
    const { container } = render(<Chat />)
    await waitFor(() => expect(screen.queryByPlaceholderText('Écris ton message...')).toBeInTheDocument())

    dropFiles(composerForm(container), [makeFile('virus.exe', 'application/octet-stream')])

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('virus.exe'), expect.anything()),
    )
    expect(extractFileMock).not.toHaveBeenCalled()
  })

  it('survoler le composeur avec un fichier montre un repère, qui disparaît au dépôt', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => expect(screen.queryByPlaceholderText('Écris ton message...')).toBeInTheDocument())
    const form = composerForm(container)

    fireEvent.dragEnter(form, { dataTransfer: { types: ['Files'] } })
    const overlay = await screen.findByTestId('composer-drop-overlay')
    expect(overlay).toBeInTheDocument()
    // Recette prod 08/10 (#3849) : `bg-[var(--…)]/95` ne compile pas en couleur
    // (modificateur d'opacité sur une variable) — le repère restait TRANSPARENT,
    // posé sur les boutons du composeur. Le fond doit être plein.
    expect(overlay.className).toMatch(/\bbg-\[var\(--bellum-surface-1\)\](\s|$)/)

    dropFiles(form, [makeFile('rapport.txt')])
    await waitFor(() => expect(screen.queryByTestId('composer-drop-overlay')).not.toBeInTheDocument())
  })
})

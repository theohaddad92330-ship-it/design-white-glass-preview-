import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1954.22 puis #2779 — CHANGER LA PORTÉE D'UN DOCUMENT DÉJÀ ATTACHÉ, VERS
 * N'IMPORTE LAQUELLE DES CINQ PORTÉES DU CONTRAT.
 *
 * Avant #1954.22 : la pastille d'une pièce jointe affichait sa portée
 * (`ATTACH_SCOPE_LABEL_KEY`) en TEXTE SEUL — aucun moyen de la changer une
 * fois le document attaché. #1954.22 avait ouvert un aller-retour entre les
 * deux seules valeurs d'alors (`workspace`/`conversation`) ; #2779 avait
 * ajouté trois portées au menu « + » de l'AJOUT sans les porter jusqu'ici — le
 * libellé de portée reste un menu, mais qui propose désormais les CINQ
 * (`attachScopesFor`, la même liste qu'à l'ajout) et appelle
 * `PATCH /rag-documents/:id/scope`.
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
// #2148.16 (reste, archive .zip) — trackable pour prouver qu'une archive jointe
// « pour cette conversation » (par défaut) n'appelle JAMAIS ce chemin durable.
const ingestZipMutateAsyncMock = vi.fn()
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: (...args: unknown[]) => ingestZipMutateAsyncMock(...args), isPending: false }),
}))
// #2148.16 — le chemin de la pièce ÉPHÉMÈRE (cas a, `scope: 'conversation'`) :
// distinct d'`useIngestRagDocument`, jamais un objet durable.
const extractMutateAsyncMock = vi.fn()
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: (...args: unknown[]) => extractMutateAsyncMock(...args),
    isPending: false,
  }),
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
  ingestZipMutateAsyncMock.mockReset()
  extractMutateAsyncMock.mockReset()
  updateScopeMutateAsyncMock.mockReset()
})

function threadFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]:not([capture])')
  if (!(input instanceof HTMLInputElement)) throw new Error('input de fichier absent')
  return input
}

/**
 * #2148.16 — depuis ce lot, « Pour cette conversation » (portée par défaut,
 * cas a) est ÉPHÉMÈRE et n'a donc plus de ligne à reclasser (bouton désactivé,
 * `Chat.attach-ephemeral.test.tsx`). Ce test de portée a donc besoin d'un
 * document DURABLE dès le départ : « Mon espace personnel » (cas b, un geste
 * explicite) exerce le MÊME `changeAttachmentScope`/`PATCH …/scope` que
 * l'ancien scénario « ce fil », inchangé par ce lot.
 */
async function attachOneDocument(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-1', partial: false })
  await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))
  const file = new File(['contenu du fichier'], 'note.txt', { type: 'text/plain' })
  Object.defineProperty(file, 'text', { value: async () => 'contenu du fichier' })
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(threadFileInput(container), { target: { files: [file] } })
  await screen.findByText('mon espace')
}

async function openScopeMenu(user: ReturnType<typeof userEvent.setup>, name = 'note.txt') {
  await user.click(screen.getByRole('button', { name: `Changer la portée de « ${name} »` }))
}

describe('#1954.22 puis #2779 — changer la portée d’un document déjà attaché', () => {
  it('« mon espace » → « Ajouter à la base de mon ESN » élargit, PATCH scope=workspace', async () => {
    updateScopeMutateAsyncMock.mockResolvedValueOnce(undefined)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)
    expect(screen.getByText('mon espace')).toBeInTheDocument()

    await openScopeMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Ajouter à la base de mon ESN' }))

    expect(updateScopeMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1', scope: 'workspace' }),
    )
    await waitFor(() => expect(screen.getByText('base de l’ESN')).toBeInTheDocument())
  })

  it('un échec réseau garde l’ancienne portée affichée et prévient', async () => {
    updateScopeMutateAsyncMock.mockRejectedValueOnce(new Error('network down'))
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)
    await openScopeMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Ajouter à la base de mon ESN' }))

    await waitFor(() => expect(updateScopeMutateAsyncMock).toHaveBeenCalledTimes(1))
    expect(screen.getByText('mon espace')).toBeInTheDocument()
  })
})

describe('#2148.16 — « Pour cette conversation » (par défaut) est ÉPHÉMÈRE', () => {
  it('extrait le texte SANS ingestion, et sa carte ne se reclasse pas', async () => {
    extractMutateAsyncMock.mockResolvedValueOnce({ text: 'Jean Dupont, développeur.', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pour cette conversation' }))
    const file = new File(['contenu du fichier'], 'cv.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'contenu du fichier' })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(threadFileInput(container), { target: { files: [file] } })

    await screen.findByText('ce fil')
    // #2148.16 — le texte est déjà là (extraction), jamais un dépôt en base.
    expect(extractMutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(ingestMutateAsyncMock).not.toHaveBeenCalled()
    // Rien à reclasser : aucune ligne `rag_documents` n'existe derrière.
    expect(screen.getByRole('button', { name: 'Changer la portée de « cv.txt »' })).toBeDisabled()
  })

  it('#2779 — propose aussi « Base de connaissance durable », pas seulement le fil/l’ESN', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)
    await openScopeMenu(user)

    expect(await screen.findByRole('menuitem', { name: 'Ajouter à la base de mon ESN' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Base de connaissance durable' })).toBeInTheDocument()
    // NON : la portée déjà active (« mon espace », #2148.16) ne se propose pas elle-même.
    expect(screen.queryByRole('menuitem', { name: 'Mon espace personnel' })).toBeNull()
  })

  it('une archive .zip jointe « pour cette conversation » (par défaut) est aussi ÉPHÉMÈRE — reste, #2148.16', async () => {
    // Avant ce lot : `attachOneFile` détectait le `.zip` AVANT de regarder la
    // portée, et appelait TOUJOURS `ingestZip.mutateAsync` (objet durable) —
    // même en portée « conversation », par défaut. Une archive doit suivre la
    // MÊME règle qu'un fichier seul : ÉPHÉMÈRE tant que la portée reste le
    // fil, `extract_document_text` (`apps/ia`) sait déjà lire un `.zip`
    // (`_extract_archive`, réutilisé, rien de nouveau côté service IA).
    extractMutateAsyncMock.mockResolvedValueOnce({
      text: 'entrée-1.txt : bonjour\nentrée-2.txt : au revoir',
      partial: false,
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pour cette conversation' }))
    const file = new File(['PK...'], 'lot.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'text', { value: async () => 'PK...' })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(threadFileInput(container), { target: { files: [file] } })

    await screen.findByText('ce fil')
    expect(extractMutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(ingestZipMutateAsyncMock).not.toHaveBeenCalled()
    expect(ingestMutateAsyncMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Changer la portée de « lot.zip »' })).toBeDisabled()
  })

  it('#2779 — bascule vers « Base de connaissance durable », PATCH scope=knowledge_base sans cible', async () => {
    updateScopeMutateAsyncMock.mockResolvedValueOnce(undefined)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)

    await attachOneDocument(container, user)
    await openScopeMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Base de connaissance durable' }))

    const call = updateScopeMutateAsyncMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call).toEqual(expect.objectContaining({ id: 'doc-1', scope: 'knowledge_base' }))
    expect(call).not.toHaveProperty('conversationId')
    expect(call).not.toHaveProperty('accountId')
  })
})

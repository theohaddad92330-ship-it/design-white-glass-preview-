import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2431.1 — DÉPOSER PLUSIEURS FICHIERS EN UN SEUL GESTE.
 *
 * L'`<input>` du composeur n'avait pas `multiple` : un lot hétérogène
 * (PDF + DOCX + capture) exigeait autant d'allers-retours au sélecteur.
 * Tranché sans Louis : la sélection multiple reste bornée à
 * `ATTACH_MAX_COUNT` pièces par message (#1954.3) ; au-delà, les fichiers
 * non pris sont NOMMÉS, jamais écartés en silence. L'import massif garde son
 * chemin séparé (#2431.4, `CvZipImportDialog`).
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

describe('#2431.1 — plusieurs fichiers en un seul dépôt', () => {
  it('le sélecteur du composeur accepte une sélection multiple', () => {
    const { container } = render(<Chat />)
    expect(threadFileInput(container).multiple).toBe(true)
  })

  it('deux fichiers choisis ensemble sont déposés tous les deux', async () => {
    ingestMutateAsyncMock
      .mockResolvedValueOnce({ id: 'doc-1', partial: false })
      .mockResolvedValueOnce({ id: 'doc-2', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    fireEvent.change(threadFileInput(container), { target: { files: [textFile('a.txt'), textFile('b.txt')] } })

    await waitFor(() => expect(ingestMutateAsyncMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('a.txt')).toBeInTheDocument()
    expect(await screen.findByText('b.txt')).toBeInTheDocument()
  })

  it('au-delà de la borne par message, les fichiers non pris sont NOMMÉS', async () => {
    const { toast } = await import('sonner')
    let n = 0
    ingestMutateAsyncMock.mockImplementation(async () => ({ id: `doc-${++n}`, partial: false }))
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    fireEvent.change(threadFileInput(container), {
      target: { files: ['a.txt', 'b.txt', 'c.txt', 'd.txt'].map(textFile) },
    })

    await waitFor(() => expect(ingestMutateAsyncMock).toHaveBeenCalledTimes(3))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('d.txt'), expect.anything())
  })
})

/**
 * #2431.7 / #2431.13 — une archive qui porte deux fois le même contenu : le
 * serveur n'ingère que la première copie et rend la seconde en `duplicate`.
 * L'écran NOMME le doublon et ce qu'il double — jamais un fichier disparu
 * en silence du rapport.
 */
describe('#2431.13 — les doublons d’une archive sont nommés', () => {
  it('une entrée `duplicate` du rapport s’affiche avec son original', async () => {
    const { toast } = await import('sonner')
    ingestZipMock.mockResolvedValueOnce({
      total: 2,
      outcomes: [
        { status: 'ingested', file: 'cv.pdf', id: 'doc-1', partial: false },
        { status: 'duplicate', file: 'cv (1).pdf', duplicateOf: 'cv.pdf' },
      ],
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    const zip = new File(['PK'], 'lot.zip', { type: 'application/zip' })
    Object.defineProperty(zip, 'arrayBuffer', { value: async () => new ArrayBuffer(2) })
    fireEvent.change(threadFileInput(container), { target: { files: [zip] } })

    await waitFor(() => expect(ingestZipMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/cv \(1\)\.pdf.*cv\.pdf/), expect.anything()),
    )
  })
})

/**
 * #2431.5 — le troisième mode, « Importer dans {{brand}} » (créer ou mettre à
 * jour des FICHES, pas seulement indexer), visible dans le même menu AVANT
 * tout dépôt. Tranché sans Louis : il n'ouvre pas un quatrième pipeline dans
 * le composeur — il mène aux chemins d'import DÉDIÉS qui existent (#2431.4) :
 * le dossier de CV vers le vivier, le fichier de comptes/contacts vers
 * l'assistant de reprise.
 */
describe('#2431.5 — le mode « Importer dans {{brand}} » est visible', () => {
  it('le menu du « + » nomme le mode et mène aux deux imports dédiés', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)
    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))

    expect(await screen.findByText('Importer dans Bellum')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /dossier de CV/i })).toHaveAttribute('href', '/consultants')
    expect(screen.getByRole('menuitem', { name: /comptes ou contacts/i })).toHaveAttribute(
      'href',
      '/settings/mes-donnees',
    )
  })
})

/**
 * #2431.10 — chaque fichier reçoit un type métier PROBABLE, avant même toute
 * classification par contenu : une tranche par NOM de fichier seul, jamais
 * inventée sur un nom qui ne porte aucun indice (`classifyDocumentByName`,
 * `@bellum/contracts`).
 */
describe('#2431.10 — le fichier attaché affiche son type probable', () => {
  it('un nom de CV explicite affiche « CV probable · à vérifier »', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-cv', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    fireEvent.change(threadFileInput(container), { target: { files: [textFile('Jean_Dupont_CV.pdf')] } })

    await waitFor(() => expect(ingestMutateAsyncMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Jean_Dupont_CV.pdf')).toBeInTheDocument()
    expect(screen.getByText('CV probable')).toBeInTheDocument()
    expect(screen.getByText('à vérifier')).toBeInTheDocument()
  })

  it('un nom sans indice n’affiche AUCUN type — jamais une catégorie devinée', async () => {
    ingestMutateAsyncMock.mockResolvedValueOnce({ id: 'doc-notes', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(<Chat />)
    await openThreadPicker(user)
    fireEvent.change(threadFileInput(container), { target: { files: [textFile('notes-reunion.pdf')] } })

    await waitFor(() => expect(ingestMutateAsyncMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('notes-reunion.pdf')).toBeInTheDocument()
    expect(screen.queryByText('à vérifier')).not.toBeInTheDocument()
  })
})

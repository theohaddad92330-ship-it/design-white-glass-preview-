import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

/**
 * Recette RQ1 09/10 (lot H04) — /chat « Nouvelle conversation » : un texte
 * tapé avant de confirmer le sélecteur de dossier est PERDU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CAUSE (trouvée par lecture de `composer-draft.ts` et `Chat.tsx`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le brouillon de la saisie vit sous une clé de FIL (`draftThreadId`), qui
 * change dès que `applyScope` choisit un compte précis (le fil neuf dédié à
 * ce compte n'est pas le panier commun `'new'`). `useChatComposerDraft` relit
 * alors le brouillon du NOUVEAU fil — vide, puisqu'il n'a jamais existé — et
 * l'écrit PAR-DESSUS ce qui vient d'être tapé. Le garde-fou existant
 * (`carryFromThread`) ne protège que la fenêtre des 5 premières secondes
 * après le montage (#3648, une course de CHARGEMENT) : confirmer la modale
 * après ce délai — le cas réel, le temps d'ouvrir le sélecteur et de choisir
 * un dossier — n'est plus couvert.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

const stableNavigate = vi.hoisted(() => () => Promise.resolve())
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

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
  useLocation: () => ({ search: locationSearch.current }),
  useNavigate: () => stableNavigate,
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [{ id: 'acc-1', company_name: 'SNCF', priority_score: null, logo_url: null }] }] },
    isError: false,
    isLoading: false,
  }),
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
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({ useChatModeEstimate: () => ({ data: undefined }) }))

vi.mock('@/features/chat/lib/conversation', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/chat/lib/conversation')>()
  return { ...actual, newConversationId: vi.fn(actual.newConversationId) }
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

import * as conversationLib from '@/features/chat/lib/conversation'
import { Chat } from './Chat'

beforeEach(() => {
  vi.resetAllMocks()
  locationSearch.current = {}
  localStorage.clear()
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({ id: 'm-1', ...args }))
})

const DRAFT = "présenter notre modèle d'intervention"

describe('Nouvelle conversation (recette RQ1 09/10) — la saisie en cours ne se perd pas au choix du dossier', () => {
  it('le texte tapé avant d’ouvrir le sélecteur traverse le choix d’un compte précis', async () => {
    // Le garde-fou existant (`carryFromThread`) ne couvre que les 5 premières
    // secondes après le montage (#3648, une course de CHARGEMENT) — le cas
    // réel (ouvrir le sélecteur, choisir un dossier) prend plus longtemps :
    // l'horloge avance pour que le test rejoue CE cas, pas celui déjà couvert.
    const now = vi.spyOn(Date, 'now')
    const baseTime = 1_760_000_000_000
    now.mockReturnValue(baseTime)

    const { rerender } = render(<Chat />)

    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: DRAFT } })
    await waitFor(() => expect(textarea).toHaveValue(DRAFT))

    now.mockReturnValue(baseTime + 6_000)

    // « Nouvelle conversation » — #4539 : AUCUNE modale ne s'ouvre d'elle-même, la frappe va au composeur.
    locationSearch.current = { new: '1' }
    const createdBefore = vi.mocked(conversationLib.newConversationId).mock.calls.length
    rerender(<Chat />)
    await waitFor(() =>
      expect(vi.mocked(conversationLib.newConversationId).mock.calls.length).toBeGreaterThan(createdBefore),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue(DRAFT)
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Écris ton message...'))

    // Le dossier se choisit ENSUITE, par un geste explicite.
    fireEvent.click(screen.getAllByRole('button', { name: /ce que laura lit/i })[0])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const dialog = screen.getByRole('dialog')

    // Choisir un dossier PRÉCIS (un compte) — c’est cette transition de fil
    // (panier commun « new » → fil dédié au compte) qui perdait la saisie.
    fireEvent.click(within(dialog).getByTestId('scope-tab-account'))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /SNCF/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir la conversation' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const textareaAfter = screen.getByPlaceholderText('Écris ton message...')
    await waitFor(() => expect(textareaAfter).toHaveValue(DRAFT))
  })

  // R10C-FIX 14/10 — la modale se referme APRÈS `onConfirm` : un second clic dans cette fenêtre (ou un
  // second « Entrée ») rejouait `applyScope` — un second fil neuf, donc un doublon dans la liste.
  it('un double clic sur « Ouvrir la conversation » ne crée qu’UN fil et garde le brouillon', async () => {
    const { rerender } = render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: DRAFT } })
    await waitFor(() => expect(textarea).toHaveValue(DRAFT))

    locationSearch.current = { new: '1' }
    rerender(<Chat />)
    fireEvent.click((await screen.findAllByRole('button', { name: /ce que laura lit/i }))[0])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByTestId('scope-tab-account'))
    fireEvent.click(await within(dialog).findByRole('radio', { name: /SNCF/ }))

    const createdBefore = vi.mocked(conversationLib.newConversationId).mock.calls.length
    const confirm = within(dialog).getByRole('button', { name: 'Ouvrir la conversation' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(vi.mocked(conversationLib.newConversationId).mock.calls.length - createdBefore).toBe(1)
    await waitFor(() => expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue(DRAFT))
  })

  // #4539 — le texte tapé survit à l'ouverture ET à la fermeture (Échap) de la modale, et le focus revient au composeur.
  it('sait dire NON : ouvrir puis fermer la modale (Échap) laisse le texte et rend le focus au composeur', async () => {
    render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: DRAFT } })
    await waitFor(() => expect(textarea).toHaveValue(DRAFT))

    fireEvent.click(screen.getAllByRole('button', { name: /ce que laura lit/i })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue(DRAFT)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('Écris ton message...')))
  })
})

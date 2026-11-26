import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import type * as HomeSuggestions from './laura-home-suggestions'

/** Pilote le mock de `useLocation`. */
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #1951.2 / #1951.3 — LA PORTÉE OBJET TRAVERSE L'ÉCRAN JUSQU'AU TOUR DE LAURA.
 *
 * Les tests de la modale prouvent le CHOIX ; ceux de `laura-turn` prouvent le
 * CORPS. Ce fichier prouve le fil entre les deux, dans l'écran réel : choisir
 * un consultant ouvre un fil qui le NOMME, et la question suivante part avec sa
 * désignation — sans compte, pour que le serveur relise la fiche et laisse le
 * portefeuille lisible.
 *
 * Même échafaudage que `Chat.persistence.test.tsx` : chaque double est une
 * feuille que ce fichier ne mesure pas.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` ; ce test rend `Chat` sans `QueryClientProvider`. La lecture
// est VIDE : aucun drapeau posé, donc aucun refus décoré — le cas normal, et
// le comportement byte-identique à celui d'avant le point.
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))

// #1918.2 / #1918.5 — les portées proposables se lisent par `useQuery`
// (`GET /business-units`), or ces tests rendent `Chat` sans
// `QueryClientProvider`. La lecture est rendue VIDE, et la RÈGLE reste celle du
// contrat : `offerableMemoryScopes` est appelé pour de vrai. C'est exactement
// l'état « je n'ai pas pu lire les périmètres » — il n'ouvre jamais une portée,
// il la retire, et « cette conversation » reste offerte dans un fil.
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
  // #1989 (main) — le hook rend aussi les outils branchés, que la saisie nomme.
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
// #1954.20 (main, #1982) — `Chat` retire désormais une pièce jointe par ce hook
// réseau, qui exige un QueryClient. Une feuille que ce fichier ne mesure pas :
// doublée comme dans les trois suites que #1982 a mises à jour.
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
  useNavigate: () => navigateMock,
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
  const actual = await importOriginal<typeof HomeSuggestions>()
  return { ...actual, useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }) }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn() }) }))
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
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({
    data: [
      {
        id: '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11',
        full_name: 'Sophie Martin',
        title: 'Consultante Java',
        available_from: null,
        archived_at: null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: [] }, isLoading: false, isError: false }),
}))

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

const SOPHIE = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({ id: 'm-1', ...args }))
  askLauraStreamingMock.mockResolvedValue({ reply: 'Réponse de Laura' })
})

async function send(text: string) {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('#1951 — un fil cadré sur un consultant', () => {
  it('le bouton NOMME la personne, et la question part avec SA désignation, sans compte', async () => {
    locationSearch.current = { new: '1' }
    render(<Chat />)

    // #4539 — la modale ne s'ouvre plus d'elle-même : geste explicite.
    fireEvent.click((await screen.findAllByRole('button', { name: /ce que laura lit/i }))[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Un consultant' }))
    fireEvent.click(screen.getByRole('radio', { name: /Sophie Martin/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /ce que laura lit/i })[0]).toHaveTextContent('Sophie Martin'),
    )

    await send('Où la positionner ?')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Où la positionner ?',
          accountId: null,
          scopeObject: { kind: 'consultant', id: SOPHIE },
        }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  it('témoin : sans portée objet, aucune désignation ne part', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await send('Bonjour')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Bonjour', scopeObject: null }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })
})

// #2453 / #2451.2 / #5048 — LE MODE DE PERSONNALISATION PART AVEC LE TOUR,
// CHANGÉ DEPUIS « MON PROFIL » DANS LE COMPOSEUR (revient sur #3772.1 : le panneau de portée
// ne le porte plus).
describe('#2453 — le mode de contexte part avec le tour', () => {
  it('par défaut « Mon activité », puis « Neutre » une fois « Mon profil » éteint', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await send('Bonjour')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Bonjour', contextMode: 'my_activity' }),
        expect.anything(),
        expect.anything(),
      ),
    )

    // #5048 (Louis 01/11/2026) — « Mon profil » est un interrupteur : l'éteindre = Neutre.
    const profileSwitch = screen.getByRole('switch', { name: /Mon profil/ })
    expect(profileSwitch).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(profileSwitch)
    await send('Et sans mon profil ?')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Et sans mon profil ?', contextMode: 'neutral' }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })
})

// Théo L1 — sélecteur avancé — L'URL REFLÈTE LE CHOIX : `?scope=<nature>:<id>`, lien partageable.
describe('Théo L1 — le dossier choisi voyage dans l’URL', () => {
  const OFFER = '0b8a1d52-7a52-4f6b-8a7e-3c9d2e1f4a10'

  it('un lien `?scope=job_offer:<id>` cadre le fil sur l’offre, et la question part avec SA désignation', async () => {
    locationSearch.current = { scope: `job_offer:${OFFER}` }
    render(<Chat />)

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /ce que laura lit/i })[0]).toHaveTextContent('Une offre d’emploi'),
    )
    await send('Comment approcher ce compte ?')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: null, scopeObject: { kind: 'job_offer', id: OFFER } }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  it('un lien invalide ne cadre RIEN — jamais une portée devinée', async () => {
    locationSearch.current = { scope: 'job_offer:pas-un-identifiant' }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await send('Bonjour')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: null }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  it('choisir un dossier précis dans la modale l’ÉCRIT dans l’URL', async () => {
    locationSearch.current = { new: '1' }
    render(<Chat />)

    fireEvent.click((await screen.findAllByRole('button', { name: /ce que laura lit/i }))[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Un consultant' }))
    fireEvent.click(screen.getByRole('radio', { name: /Sophie Martin/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/chat', search: { scope: `consultant:${SOPHIE}` }, replace: true }),
      ),
    )
  })
})

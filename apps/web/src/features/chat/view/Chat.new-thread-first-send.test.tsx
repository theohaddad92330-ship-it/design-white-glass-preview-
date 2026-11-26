import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ElementType, type ReactNode } from 'react'
import { vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/** Pilote le mock de `useLocation` : `?conversationId=` doit ouvrir CE fil. */
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
/** #1947 — `?fresh=` se RETIRE de l'URL une fois consommé : on observe ce retrait. */
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'
import { LAURA_OPENER_DELAY_MS } from '../lib/laura-opener'
import { setLauraSilenced } from '@/features/laura/laura-silence-signal'

/**
 * Persistance du Copilote IA.
 *
 * Le widget flottant « Demandez à Bellum » était le SEUL consommateur de
 * `/ia/chat/messages` + `/ia/chat/history` : lui seul savait relire un fil.
 * Le Copilote, lui, repartait d'un `useState([])` à chaque montage — tout était
 * perdu au rechargement. On porte la capacité ici avant de retirer le widget :
 * c'est la condition pour que la consolidation ne régresse rien.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// L'écran porte maintenant un accueil personnalisé, qui lit le profil. Ce
// test ne mesure pas l'accueil : il double la feuille plutôt que de monter un
// fournisseur de session dont il n'a rien à faire. `''` = prénom inconnu,
// c'est la branche qui garde la formule d'origine.
// #1321 — le composer porte maintenant le tiroir des commandes, qui lit le
// catalogue (donc un QueryClient). Ces tests ne mesurent pas le tiroir : ils
// doublent la feuille plutôt que de monter un fournisseur dont ils n'ont rien
// à faire.
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

vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({
  CommandDrawerButton: () => null,
}))
// #2451.9 — le composeur lit le mode par défaut de l'espace par `useQuery`
// (`GET /workspaces/laura-mode`), or ce fichier rend `Chat` sans
// `QueryClientProvider` (même raison que useMemoryScopeOptions/useDeleteRagDocument,
// #1918.5/#1982). `undefined` = comportement byte-identique à avant #2451.9.
vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))
/*
 * #1791.1 — le composer porte désormais un menu « + » qui LIT le registre des
 * outils connectés (donc un QueryClient), exactement comme le tiroir des
 * commandes juste au-dessus. Ces tests ne mesurent pas ce menu : ils doublent
 * la lecture plutôt que de monter un fournisseur dont ils n'ont rien à faire.
 *
 * ⚠️ La leçon derrière ce double : un hook RÉSEAU posé dans un composant monté
 * sur presque tout le produit fait tomber des tests qui ne parlent pas de son
 * sujet. Mesuré ici — trois fichiers, dix-neuf tests, aucun ne mentionne les
 * connecteurs.
 *
 * #2668.1 — réglable par test (même patron que `Chat.test.tsx`) : VIDE par
 * défaut (`beforeEach`, aucun des dix-neuf tests n'y touche), sauf le test
 * dédié aux connecteurs juste plus bas, qui a besoin d'un outil branché pour
 * cliquer son bouton.
 */
const connectedCapabilitiesMock = vi.fn()
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => connectedCapabilitiesMock(),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
/** #1940.4 — l'identité de la personne connectée, réglée par test (le vrai hook lit le profil via react-query). */
const selfAuthor = vi.hoisted(() => ({ current: null as { firstName: string; avatarUrl: string | null } | null }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => selfAuthor.current }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
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
// #1600 — `useLauraHomeContext` compose `useConsultants` et une lecture du
// pipeline partenaire, toutes deux via react-query : cette suite ne mesure
// pas l'accueil de Laura, elle double le hook comme elle double déjà
// `useAccounts`/`useTeam` ci-dessus.
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return {
    ...actual,
    useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }),
  }
})
// #1320 — `Chat` lit maintenant `useIsDemo` pour choisir son MOTEUR de réponse.
// Le hook passe par la charge crédits (donc react-query) ; cette suite ne monte
// pas de `QueryClientProvider` et ne mesure pas la démonstration. Elle double la
// feuille, comme elle double déjà la session, l'équipe et la mémoire.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
/** Le dépôt d'un document rend son identifiant — c'est lui qui part avec la question. */
const ingestMock = vi.hoisted(() => vi.fn())
/** #1954.3 — on observe l'avertissement d'éviction ; sans `<Toaster />`, un toast n'est pas dans le DOM. */
const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(() => 'toast-id'),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), toastMock) }))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: (...args: unknown[]) => ingestMock(...args), isPending: false }),
}))
/**
 * #2148.16 — le chemin de la pièce ÉPHÉMÈRE (cas a, portée par défaut
 * `conversation`) : hoisté comme `ingestMock`/`deleteMock`, pour que les
 * tests puissent observer qu'il est bien appelé — et que `ingestMock` NE
 * l'est PAS — sur le défaut.
 */
const extractMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: (...args: unknown[]) => extractMock(...args),
    isPending: false,
  }),
}))
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
/** #1954.20 — « retirer » une pièce jointe SUPPRIME le document ingéré : on observe l'appel. */
const deleteMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/rag/hooks/useDeleteRagDocument', () => ({
  useDeleteRagDocument: () => ({ mutateAsync: (...args: unknown[]) => deleteMock(...args), isPending: false }),
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

// LOT STREAM (12/09/2026) — `askLaura`/`askLauraStreaming` ne passent plus par
// `apiFetch` (le corps EN FLUX de `/ia/chat` ne s'y prête plus). L'écran
// appelle `askLauraStreaming` : c'est elle qu'on double, comme le fait déjà
// `demo-runs-the-real-shell.test.tsx`.
const askLauraStreamingMock = vi.fn()
vi.mock('../api/laura-turn', () => ({ askLauraStreaming: (...args: unknown[]) => askLauraStreamingMock(...args) }))

/**
 * #1936 — le marqueur « premier du jour » et le brief passent par `apiFetch`.
 * On double la PORTE réseau, pas le client du brief : le client (fuseau, repli
 * sur panne, champ absent d'une API ancienne) fait partie de ce qu'on mesure.
 * Par défaut : PAS la première ouverture du jour — l'amorce courte du lot 1.
 */
const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

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

function persistedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    account_id: null,
    conversation_id: 'general',
    role: 'user',
    content: 'Message persisté',
    created_at: '2026-07-19T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // `clearAllMocks` garde les implémentations : celle du routeur asynchrone (#3506) réécrivait
  // `locationSearch` 15 ms après chaque `navigate` des tests suivants (#3939.3 rouge en suite entière).
  navigateMock.mockReset()
  connectedCapabilitiesMock.mockReturnValue({ families: [], tools: [], isLoading: false })
  locationSearch.current = {}
  selfAuthor.current = null
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => persistedMessage(args))
  askLauraStreamingMock.mockResolvedValue({ reply: 'Réponse du copilote' })
  extractMock.mockResolvedValue({ text: 'contenu du fichier', partial: false })
  apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
    if (path === '/briefing/first-open-today') return { isFirstOpenToday: false }
    throw new Error(`apiFetch non doublé : ${path}`)
  })
})

// Théo B l1-laura.N6 — l'accueil porte son propre titre (`laura-home-greeting`, « Sur quoi avance-t-on ? » sans prénom) :
// la phrase d'amorce de la BULLE se cherche donc hors de ce titre, sans quoi « pas avant 3 s » ne prouverait plus rien.
const openerBubble = (): HTMLElement | null =>
  screen
    .queryAllByText(/Sur quoi avance-t-on/)
    .find(node => node.getAttribute('data-testid') !== 'laura-home-greeting') ?? null
const findOpenerBubble = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(openerBubble()).not.toBeNull())
  return openerBubble() as HTMLElement
}
/**
 * #4477 — « Nouvelle conversation », premier message : l'écran ne revient PAS à l'accueil et la
 * réponse de Laura reste affichée.
 *
 * Parcours : `?new=1` → modale de portée → fil vierge → un message → le fil s'écrit → l'adresse
 * prend sa clé. Le routeur de production applique chaque navigation avec un délai (comme dans
 * #3506) : c'est ce délai qui expose une navigation qui défait le fil au lieu de le garder.
 */
describe('#4477 — premier message d’une nouvelle conversation', () => {
  it('la réponse reste affichée, l’écran ne retombe pas sur l’accueil, et l’adresse porte le fil créé', async () => {
    let notify: () => void = () => undefined
    navigateMock.mockImplementation((args: { search?: Record<string, unknown> }) => {
      setTimeout(() => {
        locationSearch.current = args.search ?? {}
        notify()
      }, 15)
    })
    function Harness() {
      const [, setTick] = useState(0)
      notify = () => setTick(tick => tick + 1)
      return <Chat />
    }
    locationSearch.current = { conversationId: 'c-ancien' }
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'c-ancien'
        ? [persistedMessage({ conversation_id: 'c-ancien', content: 'Ancien échange' })]
        : [],
    )
    render(<Harness />)
    await screen.findByText('Ancien échange')
    // « Nouvelle conversation » depuis un fil ouvert : la barre latérale écrit `/chat?new=1` (sans fil).
    locationSearch.current = { new: '1' }
    notify()
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull() // #4539 — pas de modale d'office
    await waitFor(() => expect(screen.queryByText('Ancien échange')).toBeNull())

    // Un tour LONG (recherche de comptes) : accepté tout de suite, réponse bien plus tard.
    askLauraStreamingMock.mockImplementation(
      async (_payload: unknown, callbacks: { onAccepted?: () => void; onDelta?: (t: string) => void }) => {
        callbacks.onAccepted?.()
        await new Promise(resolve => setTimeout(resolve, 300))
        return { reply: 'Réponse du copilote' }
      },
    )
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Prépare un message pour ce contact' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Réponse du copilote')).toBeInTheDocument())
    // Le routeur applique l'adresse posée par l'écran, puis on laisse les effets se rejouer.
    await new Promise(resolve => setTimeout(resolve, 120))

    const [userTurn] = createMessageMock.mock.calls.map(call => call[0] as { conversationId: string })
    expect(screen.getByText('Réponse du copilote')).toBeInTheDocument()
    expect(screen.queryByTestId('laura-home-greeting')).toBeNull()
    expect(locationSearch.current).toMatchObject({ conversationId: userTurn?.conversationId })
    // Un seul fil pour tout le parcours : aucune conversation neuve tirée en cours de route.
    const ids = createMessageMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId)
    expect(new Set(ids).size).toBe(1)
  })
})

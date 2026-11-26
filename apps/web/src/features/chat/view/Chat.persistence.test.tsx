import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

describe('Copilote IA — persistance du fil', () => {
  it('recharge les messages du fil au montage (plus de useState([]) vide)', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-1', role: 'user', content: 'Ma question d’hier' }),
      persistedMessage({ id: 'm-2', role: 'assistant', content: 'Ma réponse d’hier' }),
    ])

    // #1947 — `/chat` nu ouvre désormais un fil NEUF. Le fil « general » reste
    // atteignable par SA clé, qui est ce que pose la liste des conversations.
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    await waitFor(() =>
      expect(listMessagesMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'general' })),
    )
    expect(await screen.findByText('Ma question d’hier')).toBeInTheDocument()
    expect(await screen.findByText('Ma réponse d’hier')).toBeInTheDocument()
  })

  // §13 : « sauvegarder cette réponse » n'a de sens que sur une réponse DU
  // copilote — épingler sa propre question dans la mémoire n'apprendrait rien.
  it('offre « Sauvegarder cette réponse » sur les messages du copilote, pas sur les miens', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-1', role: 'user', content: 'Ma question d’hier' }),
      persistedMessage({ id: 'm-2', role: 'assistant', content: 'Ma réponse d’hier' }),
    ])

    render(<Chat />)

    await screen.findByText('Ma réponse d’hier')
    expect(screen.getAllByRole('button', { name: /Sauvegarder cette réponse/ })).toHaveLength(1)
  })

  it('persiste le tour utilisateur ET le tour assistant après un envoi', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Quels signaux sur ce compte ?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user', content: 'Quels signaux sur ce compte ?' }),
      ),
    )
    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', content: 'Réponse du copilote' }),
      ),
    )
    // #1944.18 — la fin du tour s'annonce au lecteur d'écran, sans répéter la réponse à l'écran.
    expect(await screen.findByText('Laura a répondu.')).toHaveAttribute('aria-live', 'polite')
    // Les deux tours dans le MÊME fil — et ce fil n'est plus « general » (#1947).
    const [userTurn, assistantTurn] = createMessageMock.mock.calls.map(call => call[0] as { conversationId: string })
    expect(userTurn?.conversationId).toBe(assistantTurn?.conversationId)
    expect(userTurn?.conversationId).not.toBe('general')
  })

  // La persistance est du confort : si elle tombe, la conversation en cours doit
  // continuer à s'afficher. On n'échange pas une capacité gagnée contre une
  // fragilité nouvelle.
  /**
   * Trouvé en livrant #1947 (avertissement ESLint `react-hooks/exhaustive-deps`) :
   * `handleSend` ne dépendait pas des pièces jointes. Taper la question, joindre
   * le document, puis appuyer sur Entrée SANS retaper envoyait la liste d'avant
   * le dépôt — la question partait sans son document, et Laura répondait
   * « je n'ai reçu aucun fichier ».
   */
  it('un document joint APRÈS la frappe part avec la question, sans avoir à retaper', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Résume ce CV' } })
    // #2148.16 — la portée PAR DÉFAUT (« pour cette conversation ») est
    // ÉPHÉMÈRE : le texte est extrait, jamais ingéré.
    attachTextFile('cv.txt')
    await waitFor(() => expect(extractMock).toHaveBeenCalled())
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Le texte EXTRAIT part avec la question — jamais un identifiant à relire
    // côté serveur, puisqu'aucune ligne `rag_documents` n'a été créée.
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Résume ce CV',
          documentIds: [],
          attachedFiles: [{ name: 'cv.txt', text: 'contenu du fichier' }],
        }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  it('#1954.3 — le 4ᵉ document évince le 1ᵉʳ en le DISANT, jamais en silence', async () => {
    // #2148.16 — l'éviction se mesure sur `rag_documents` : la portée par
    // défaut (« ce fil ») est ÉPHÉMÈRE et n'a pas de ligne à évincer. « Mon
    // espace personnel » exerce le même chemin d'ingestion qu'avant ce lot.
    ingestMock.mockImplementation(async (input: { title: string }) => ({ id: `doc-${input.title}`, partial: false }))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    for (const name of ['cv1.txt', 'cv2.txt', 'cv3.txt', 'cv4.txt']) {
      // `pendingScope` retombe sur `conversation` après CHAQUE fichier : il faut
      // rechoisir « Mon espace personnel » à chaque tour de boucle.
      await userEvent.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))
      const file = new File(['x'], name, { type: 'text/plain' })
      Object.defineProperty(file, 'text', { value: async () => 'x' })
      fireEvent.change(fileInput, { target: { files: [file] } })
      // #1954.13/.14 — attendre que CE dépôt ait abouti avant de lire son nom :
      // la pièce traverse « Téléversement » puis « Analyse » avant d'apparaître
      // comme attachée, et une boucle qui enchaîne les fichiers va plus vite
      // que le rendu si on ne le dit pas explicitement.
      await waitFor(() => expect(ingestMock).toHaveBeenCalledWith(expect.objectContaining({ title: name })))
      expect(await screen.findByText(name)).toBeInTheDocument()
    }
    expect(screen.queryByText('cv1.txt')).not.toBeInTheDocument()
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('cv1.txt'), expect.anything())
  })

  /** Dépose un fichier texte dans le composeur. jsdom 20 n'a pas `File.text()` : on le double. */
  function attachTextFile(name: string) {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], name, { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'x' })
    fireEvent.change(fileInput, { target: { files: [file] } })
  }

  /**
   * #2148.16 — les tests DURABLES (supprimer #1954.20, évincer #1954.3, cette
   * fonction) exercent désormais « Mon espace personnel », un geste explicite :
   * la portée par défaut (« pour ce fil ») n'ingère plus rien depuis ce lot.
   */
  async function attachPersonalFile(name: string) {
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mon espace personnel' }))
    attachTextFile(name)
  }

  /**
   * #1954.7 / #1954.12 — décision de Louis (12/09/2026) : un document joint à
   * Laura sert au FIL par défaut. Il partait jusqu'ici, en silence, dans la base
   * de connaissance de toute l'ESN.
   *
   * #2148.16 — depuis ce lot, ce défaut est ÉPHÉMÈRE : le texte est extrait
   * pour CE tour, jamais ingéré (aucune ligne `rag_documents`).
   */
  it('#1954.7 — par défaut, un document joint sert à CE fil, jamais à la base de l’ESN en silence', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    attachTextFile('cv.txt')

    await waitFor(() => expect(extractMock).toHaveBeenCalled())
    expect(ingestMock).not.toHaveBeenCalled()
    // La pièce dit où elle sert.
    expect(await screen.findByText('ce fil')).toBeInTheDocument()
  })

  it('#1954.20 — « retirer » SUPPRIME le document ingéré, puis retire la pièce', async () => {
    ingestMock.mockResolvedValue({ id: 'doc-1', partial: false })
    deleteMock.mockResolvedValue(undefined)
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    // #2148.16 — « retirer » ne supprime que du DURABLE (la portée par défaut,
    // éphémère, n'a rien à supprimer) : « Mon espace personnel ».
    await attachPersonalFile('cv.txt')
    // #1954.13/.14/.15 — la pièce passe par « Téléversement » puis « Analyse »
    // avant « Prêt » : on attend que le dépôt ait vraiment abouti, comme
    // #1954.7 juste au-dessus, avant de lire l'état final de la carte.
    await waitFor(() => expect(ingestMock).toHaveBeenCalled())
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer et supprimer cv.txt' }))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('doc-1'))
    await waitFor(() => expect(screen.queryByText('cv.txt')).not.toBeInTheDocument())
  })

  it('#1954.20 — NON : une suppression qui échoue garde la pièce et le DIT', async () => {
    ingestMock.mockResolvedValue({ id: 'doc-1', partial: false })
    deleteMock.mockRejectedValue(new Error('offline'))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await attachPersonalFile('cv.txt')
    await waitFor(() => expect(ingestMock).toHaveBeenCalled())
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer et supprimer cv.txt' }))

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('cv.txt'), expect.anything()),
    )
    expect(screen.getByText('cv.txt')).toBeInTheDocument()
  })

  it('#1954.20 — un document déjà supprimé (404) quitte la saisie sans fausse alarme', async () => {
    ingestMock.mockResolvedValue({ id: 'doc-1', partial: false })
    deleteMock.mockRejectedValue(new ApiError('Document introuvable', 404))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await attachPersonalFile('cv.txt')
    await waitFor(() => expect(ingestMock).toHaveBeenCalled())
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer et supprimer cv.txt' }))

    await waitFor(() => expect(screen.queryByText('cv.txt')).not.toBeInTheDocument())
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  /**
   * Un document « fil seul » n'est lu que par SON fil : laissé dans la saisie
   * d'un autre fil, il partirait avec la question et Laura répondrait « je n'ai
   * reçu aucun fichier » sous une pièce affichée.
   *
   * #2148.16 — « fil seul » (`scope: 'conversation'`) est désormais la portée
   * ÉPHÉMÈRE par défaut : le filtrage au changement de fil (`activeConversationId`)
   * ne dépend pas de l'ingestion, il tient toujours.
   */
  it('#1954 — changer de fil retire de la saisie les pièces « fil seul » de l’autre fil, sans les supprimer', async () => {
    locationSearch.current = { conversationId: 'c-premier' }
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    attachTextFile('cv.txt')
    await waitFor(() => expect(extractMock).toHaveBeenCalled())
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()

    locationSearch.current = { conversationId: 'c-second' }
    rerender(<Chat />)

    await waitFor(() => expect(screen.queryByText('cv.txt')).not.toBeInTheDocument())
    // Une pièce ÉPHÉMÈRE n'a jamais rien à supprimer.
    expect(deleteMock).not.toHaveBeenCalled()
  })

  /**
   * #2494 — « j'ai ajouté à Laura un CV en contexte pour la conversation puis
   * j'ai envoyé le message, mais avec le message je ne vois pas le fichier
   * attaché ». Le composeur vidait `attachedDocs` à l'envoi (`handleSend`) : le
   * nom du fichier disparaissait de l'écran, comme si le dépôt n'avait servi à
   * rien.
   */
  it('#2494 — la pièce jointe reste visible ACCOLÉE au message envoyé, pas seulement dans le composeur', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Résume ce CV' } })
    // #2148.16 — le scénario originel de #2494 (« un CV en contexte pour la
    // conversation ») est la portée par défaut, ÉPHÉMÈRE depuis ce lot.
    attachTextFile('cv.txt')
    await waitFor(() => expect(extractMock).toHaveBeenCalled())
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Enter' })

    await screen.findByText('Résume ce CV')
    // Le composeur a vidé SA pièce, mais le nom reste lisible — à CÔTÉ du
    // message parti, pas dans une seconde carte qui aurait remplacé la première.
    expect(screen.getAllByText('cv.txt')).toHaveLength(1)
    // Et le texte EXTRAIT part AVEC la question posée à Laura — une pièce
    // ÉPHÉMÈRE n'a pas d'identifiant serveur à faire survivre à un rechargement
    // (#2148.16 : rien n'est ingéré, rien à reclasser).
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Résume ce CV',
          attachedFiles: [{ name: 'cv.txt', text: 'contenu du fichier' }],
        }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })

  /** Sait dire NON : un message tapé SANS pièce jointe ne montre aucune puce. */
  it('#2494 — un message sans pièce jointe ne montre aucune puce', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Une question sans fichier' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await screen.findByText('Une question sans fichier')
    expect(screen.queryByTestId('message-attachments')).not.toBeInTheDocument()
  })

  /** La bulle relue après un rechargement du fil montre la même puce. */
  it('#2494 — un fil rechargé montre encore la pièce jointe du message', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({
        id: 'm-1',
        role: 'user',
        content: 'Résume ce CV',
        attachments: [{ id: 'doc-1', name: 'cv.txt' }],
      }),
    ])
    render(<Chat />)

    await screen.findByText('Résume ce CV')
    expect(await screen.findByText('cv.txt')).toBeInTheDocument()
  })

  /** Sait dire NON : un message ordinaire, sans connecteur posé, ne montre aucune puce. */
  it('#2254 — un message sans connecteur ne montre aucune puce, le texte reste un bloc unique', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Une question ordinaire, sans bloc' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(await screen.findByText('Une question ordinaire, sans bloc')).toBeInTheDocument()
  })

  /**
   * Trouvé en recette du lot 1 (#1947), en production : chaque « Demander à
   * Laura » ouvre désormais un fil NEUF, et la colonne « Conversations » ne le
   * montrait pas — elle lisait l'historique une seule fois, au montage. Le fil
   * qu'on venait d'avoir disparaissait donc de la liste jusqu'au rechargement,
   * alors que l'écran promet « tes conversations précédentes restent dans ta
   * liste ».
   */
  it('la colonne des conversations montre le fil qui vient de s’écrire, sans rechargement', async () => {
    let written = false
    createMessageMock.mockImplementation(async (args: Record<string, unknown>) => {
      if (args.role === 'user') written = true
      return persistedMessage(args)
    })
    listHistoryMock.mockImplementation(async () =>
      written
        ? [
            {
              id: 't-neuf',
              account_id: null,
              conversation_id: 'c-neuf',
              title: 'Question qui ouvre le fil',
              created_at: '2026-09-12T20:00:00Z',
              last_message_at: '2026-09-12T20:00:01Z',
            },
          ]
        : [],
    )
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const panel = screen.getByRole('complementary', { name: /conversations/i })
    expect(within(panel).queryByText('Question qui ouvre le fil')).not.toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Question qui ouvre le fil' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(await within(panel).findByText('Question qui ouvre le fil')).toBeInTheDocument()
  })

  /**
   * #3367 — recette du 29/09 : un fil en cours ne se rouvrait plus après un
   * rechargement de `/chat`, et la liste montrait des doublons créés par la
   * même demande. Racine : un fil frais n'était jamais reflété dans l'URL,
   * donc introuvable au rechargement (état React seul, perdu à F5). Ce test
   * couvre le POINT D'ANCRAGE de la correction — l'URL se met à jour une fois
   * le fil réellement écrit — l'autre moitié (`?conversationId=` rouvre le
   * fil désigné) est déjà couverte plus haut.
   */
  it('#3367 — un fil qui vient de s’écrire pose sa clé dans l’URL, pour rester atteignable au rechargement', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Prépare un message pour ce contact' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', content: 'Réponse du copilote' }),
      ),
    )
    const [userTurn] = createMessageMock.mock.calls.map(call => call[0] as { conversationId: string })
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/chat',
          search: { conversationId: userTurn.conversationId },
          replace: true,
        }),
      ),
    )
  })

  it('#3367 — la clé posée par l’écran dans l’URL ne relit pas le fil : la réponse reste affichée', async () => {
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Prépare un message pour ce contact' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Réponse du copilote')).toBeInTheDocument())
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())

    // Le routeur applique la navigation : l'URL porte maintenant la clé.
    const { search } = navigateMock.mock.calls[navigateMock.mock.calls.length - 1][0] as {
      search: Record<string, unknown>
    }
    const readsBefore = listMessagesMock.mock.calls.length
    locationSearch.current = search
    rerender(<Chat />)

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(listMessagesMock.mock.calls.length).toBe(readsBefore)
    expect(screen.getByText('Réponse du copilote')).toBeInTheDocument()
  })

  /**
   * #3506 — recette du 01/10 : un message de SUIVI, envoyé dans un fil existant,
   * partait dans une conversation ORPHELINE (« En attente », puis « plus
   * accessible ») au lieu du fil courant. Un suivi reste TOUJOURS dans la
   * conversation courante : même `conversationId` que le premier échange, avant
   * comme après que le routeur a appliqué l'URL posée par l'écran.
   */
  it.each([
    ['ouvert par ?conversationId=', { conversationId: 'c-existant' }],
    ['fil neuf (?fresh=) puis URL nettoyée', { fresh: '1' }],
    ['fil de compte (?accountId=)', { accountId: 'acc-1' }],
    ['/chat nu', {}],
    ['/chat nu, réponse de clarification', { clarify: true }],
  ])('#3506 — un suivi reste dans le fil courant, routeur asynchrone (%s)', async (_label, start) => {
    // Un routeur qui applique l'URL APRÈS un délai, comme en production.
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
    const { clarify, ...urlStart } = start as Record<string, unknown>
    if (clarify) {
      askLauraStreamingMock.mockResolvedValueOnce({
        reply: 'Sur quel territoire ?',
        context: { clarification: { question: 'Sur quel territoire ?', options: ['Lyon', 'Toute la France'] } },
      })
    }
    locationSearch.current = urlStart
    render(<Harness />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const send = async (text: string) => {
      const textarea = screen.getByPlaceholderText('Écris ton message...')
      fireEvent.change(textarea, { target: { value: text } })
      fireEvent.keyDown(textarea, { key: 'Enter' })
      await waitFor(() =>
        expect(createMessageMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', content: text })),
      )
      await waitFor(() => expect(screen.getAllByText('Laura a répondu.').length).toBeGreaterThan(0))
      await new Promise(resolve => setTimeout(resolve, 60))
    }
    await send('Premier message')
    await send('Qui est le DSI de Société Générale ?')
    await send('Et le DAF ?')

    const ids = createMessageMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId)
    expect(ids.length).toBe(6)
    expect(new Set(ids).size).toBe(1)
    const asked = askLauraStreamingMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId)
    expect(new Set(asked)).toEqual(new Set(ids))
  })

  it('#3506 — six envois successifs dans le même fil : un seul conversationId, côté persistance ET côté modèle', async () => {
    locationSearch.current = { conversationId: 'c-six' }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const N = 6
    for (let i = 1; i <= N; i += 1) {
      const text = `Message numéro ${i}`
      const textarea = screen.getByPlaceholderText('Écris ton message...')
      fireEvent.change(textarea, { target: { value: text } })
      fireEvent.keyDown(textarea, { key: 'Enter' })
      await waitFor(() =>
        expect(createMessageMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', content: text })),
      )
      await waitFor(() => expect(askLauraStreamingMock.mock.calls.length).toBe(i))
      await waitFor(() => expect(createMessageMock.mock.calls.length).toBe(2 * i))
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    const persisted = createMessageMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId)
    const asked = askLauraStreamingMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId)
    expect(persisted).toHaveLength(2 * N)
    expect(asked).toHaveLength(N)
    expect(new Set([...persisted, ...asked])).toEqual(new Set(['c-six']))
  })

  it('#3506 — coupure réseau PENDANT le 2e envoi : aucune conversation neuve, le 1er échange reste, la relance repart dans le même fil', async () => {
    locationSearch.current = { conversationId: 'c-cut' }
    askLauraStreamingMock
      .mockResolvedValueOnce({ reply: 'Première réponse.' })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ reply: 'Réponse après la coupure.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const send = (text: string) => {
      const textarea = screen.getByPlaceholderText('Écris ton message...')
      fireEvent.change(textarea, { target: { value: text } })
      fireEvent.keyDown(textarea, { key: 'Enter' })
    }

    send('Premier message')
    expect(await screen.findByText('Première réponse.')).toBeInTheDocument()
    send('Qui est le DSI de Société Générale ?')
    const relaunch = await screen.findByRole('button', { name: 'Relancer' })

    // Le 1er échange est intact, aucune conversation « orpheline » n'a été créée.
    expect(screen.getByText('Première réponse.')).toBeInTheDocument()
    expect(screen.getAllByText('Premier message').length).toBeGreaterThan(0)
    const ids = [...createMessageMock.mock.calls, ...askLauraStreamingMock.mock.calls].map(
      call => (call[0] as { conversationId: string }).conversationId,
    )
    expect(new Set(ids)).toEqual(new Set(['c-cut']))

    fireEvent.click(relaunch)
    expect(await screen.findByText('Réponse après la coupure.')).toBeInTheDocument()
    const afterRelaunch = askLauraStreamingMock.mock.calls.map(
      call => (call[0] as { conversationId: string }).conversationId,
    )
    expect(afterRelaunch).toEqual(['c-cut', 'c-cut', 'c-cut'])
  })

  it('#3506 — un suivi envoyé APRÈS un clic sur un fil de la colonne part dans CE fil, jamais dans celui du montage', async () => {
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'c-clique'
        ? [persistedMessage({ id: 'm-1', conversation_id: 'c-clique', role: 'assistant', content: 'Réponse déjà là' })]
        : [],
    )
    locationSearch.current = { conversationId: 'c-clique' }
    rerender(<Chat />)
    await screen.findByText('Réponse déjà là')

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Qui est le DSI de Société Générale ?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(createMessageMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    const ids = createMessageMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId)
    expect(new Set(ids)).toEqual(new Set(['c-clique']))
    expect(
      askLauraStreamingMock.mock.calls.map(call => (call[0] as { conversationId: string }).conversationId),
    ).toEqual(['c-clique'])
  })

  /**
   * #3477 — recette du 30/09 : « dès qu'on clique sur un item dans le menu à
   * gauche, rien n'apparaît » — cinq clics en une seconde, l'écran ne bougeait
   * pas. Racine : une fois un fil ÉCRIT (`threadsVersion` > 0), l'effet qui
   * REFLÈTE le fil dans l'URL (#3367) tourne dans le MÊME commit que celui qui
   * SUIT l'URL, avec `activeConversationId` encore périmé : il voyait « l'URL
   * ≠ le fil » et renavigait vers l'ANCIEN fil, défaisant le clic.
   */
  it('#3477 — cliquer un autre fil après en avoir écrit un ne renavigue PAS vers l’ancien', async () => {
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'c-second'
        ? [persistedMessage({ id: 'm-2', role: 'assistant', content: 'Contenu de c-second' })]
        : [],
    )
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Prépare un message pour ce contact' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Réponse du copilote')).toBeInTheDocument())
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    const { search } = navigateMock.mock.calls[navigateMock.mock.calls.length - 1][0] as {
      search: Record<string, unknown>
    }
    locationSearch.current = search
    rerender(<Chat />)
    await new Promise(resolve => setTimeout(resolve, 20))

    navigateMock.mockClear()
    locationSearch.current = { conversationId: 'c-second' }
    rerender(<Chat />)

    expect(await screen.findByText('Contenu de c-second')).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 20))
    const backToOld = navigateMock.mock.calls.filter(
      call => (call[0] as { search?: { conversationId?: string } }).search?.conversationId !== 'c-second',
    )
    expect(backToOld).toEqual([])
    locationSearch.current = {}
  })

  /**
   * #3493 — recette prod du 01/10 : « Nouvelle conversation » puis envoi →
   * « Cette conversation n'est plus accessible » et le message perdu. Racine :
   * l'effet de reflet d'URL (#3367) ne regardait que « un fil a été écrit
   * dans cette session » (`threadsVersion` > 0), pas QUEL fil. Un fil neuf,
   * encore vide, était donc posé dans l'URL, et la relecture d'un
   * `?conversationId=` vide se lit « lien partagé perdu » (#2435.12).
   */
  it('#3493 — un fil NEUF ouvert après un fil écrit n’est jamais posé dans l’URL tant qu’il est vide', async () => {
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Première question' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Réponse du copilote')).toBeInTheDocument())
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    const [firstTurn] = createMessageMock.mock.calls.map(call => call[0] as { conversationId: string })

    navigateMock.mockClear()
    locationSearch.current = { fresh: '1' }
    rerender(<Chat />)
    await new Promise(resolve => setTimeout(resolve, 50))

    const toEmptyThread = navigateMock.mock.calls.filter(call => {
      const id = (call[0] as { search?: { conversationId?: string } }).search?.conversationId
      return id !== undefined && id !== firstTurn.conversationId
    })
    expect(toEmptyThread).toEqual([])
    locationSearch.current = {}
  })

  it('affiche quand même la réponse si la persistance échoue', async () => {
    createMessageMock.mockRejectedValue(new Error('offline'))

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Une question' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Réponse du copilote')).toBeInTheDocument())
    expect(screen.getByText('Une question')).toBeInTheDocument()
  })

  it('n’écrase pas un fil vide au montage quand la relecture échoue', async () => {
    listMessagesMock.mockRejectedValue(new Error('offline'))
    render(<Chat />)
    // L'écran reste utilisable (état vide), pas de crash : le composeur répond.
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Écris ton message...')).toBeInTheDocument()
  })
})

/**
 * #1940.4 — « Comprendre qui a posé la question ».
 *
 * Décision de Louis du 12/09 : « prénom + avatar sur chaque message ». Le fil
 * est une ressource d'ÉQUIPE (lu par espace) : sans auteur, la question d'un
 * collègue et la mienne étaient deux bulles violettes identiques.
 */
describe('#1940.4 — chaque bulle utilisateur porte le prénom de son auteur', () => {
  it('une question relue porte le prénom servi par l’API ; une réponse de Laura, aucun', async () => {
    locationSearch.current = { conversationId: 'general' }
    listMessagesMock.mockResolvedValue([
      persistedMessage({
        id: 'm-1',
        role: 'user',
        content: 'Question de Théo',
        author: { firstName: 'Théo', avatarUrl: null },
      }),
      persistedMessage({ id: 'm-2', role: 'assistant', content: 'Réponse à Théo', author: null }),
    ])

    render(<Chat />)

    expect(await screen.findByText('Question de Théo')).toBeInTheDocument()
    expect(screen.getByText('Message de Théo')).toBeInTheDocument()
    // Pas de photo : les initiales, jamais une image inventée.
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getAllByText(/^Message de /)).toHaveLength(1)
  })

  it('une question relue SANS auteur (compte effacé) garde son texte et n’affiche personne — pas même moi', async () => {
    selfAuthor.current = { firstName: 'Maëlle', avatarUrl: null }
    locationSearch.current = { conversationId: 'general' }
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-1', role: 'user', content: 'Texte d’un compte effacé', author: null }),
    ])

    render(<Chat />)

    expect(await screen.findByText('Texte d’un compte effacé')).toBeInTheDocument()
    expect(screen.queryByText(/^Message de /)).not.toBeInTheDocument()
  })

  it('un fil relu depuis une API antérieure (pas de champ `author`) n’attribue RIEN à celui qui lit', async () => {
    selfAuthor.current = { firstName: 'Maëlle', avatarUrl: null }
    locationSearch.current = { conversationId: 'general' }
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-1', role: 'user', content: 'Question d’un collègue' }),
    ])

    render(<Chat />)

    expect(await screen.findByText('Question d’un collègue')).toBeInTheDocument()
    expect(screen.queryByText('Message de Maëlle')).not.toBeInTheDocument()
  })

  it('ma question tapée dans cet onglet porte MON prénom tout de suite, sans attendre une relecture', async () => {
    selfAuthor.current = { firstName: 'Maëlle', avatarUrl: null }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Quels comptes cette semaine ?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(await screen.findByText('Quels comptes cette semaine ?')).toBeInTheDocument()
    expect(screen.getByText('Message de Maëlle')).toBeInTheDocument()
  })
})

describe('Copilote IA — reprise d’un fil passé (historique)', () => {
  /**
   * ⚠️ La LISTE des fils n'est plus rendue par `Chat` : elle vit dans la barre
   * latérale (`SidebarConversations`, testée chez elle). Ce qui se teste ici est
   * l'autre moitié, et la plus critique — qu'un fil DÉSIGNÉ s'ouvre bel et bien.
   *
   * Le widget d'origine écrivait ses `conversation_id` en `crypto.randomUUID()`.
   * Ces fils doivent rester atteignables : sinon retirer le widget aurait perdu
   * l'historique de l'équipe. Ils le sont désormais par `?conversationId=`, qui
   * est aussi ce que colle le bouton « Partager ».
   */
  it('ouvre le fil désigné par `?conversationId=` — UUID de l’ancien widget compris', async () => {
    const widgetThreadId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    locationSearch.current = { conversationId: widgetThreadId }
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === widgetThreadId
        ? [persistedMessage({ id: 'w-1', role: 'assistant', content: 'Réponse archivée du widget' })]
        : [],
    )

    render(<Chat />)

    await waitFor(() =>
      expect(listMessagesMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: widgetThreadId })),
    )
    expect(await screen.findByText('Réponse archivée du widget')).toBeInTheDocument()
    locationSearch.current = {}
  })

  /**
   * ⚠️ Trouvé en recette, pas par un test : cliquer un fil dans la barre
   * latérale posait bien `?conversationId=` dans la barre d'adresse, et l'écran
   * ne bougeait pas. `useState(initial…)` ne lit l'URL qu'au MONTAGE, or
   * naviguer vers la même route ne remonte pas le composant — le fil restait
   * celui d'avant. Un lien qui mène quelque part sans que l'écran suive est
   * pire qu'un lien absent : on croit avoir changé de conversation.
   */
  it('SUIT l’URL quand elle change, pas seulement au montage', async () => {
    locationSearch.current = { conversationId: 'c-premier' }
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) => [
      persistedMessage({ id: 'm-1', role: 'assistant', content: `Contenu de ${conversationId}` }),
    ])

    const { rerender } = render(<Chat />)
    expect(await screen.findByText('Contenu de c-premier')).toBeInTheDocument()

    // Même route, autres paramètres — exactement ce que fait un clic dans la
    // barre latérale : pas de démontage, donc pas de nouvel état initial.
    locationSearch.current = { conversationId: 'c-second' }
    rerender(<Chat />)

    expect(await screen.findByText('Contenu de c-second')).toBeInTheDocument()
    locationSearch.current = {}
  })

  it('recharge le fil du compte quand on change de conversation', async () => {
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'general' ? [persistedMessage({ id: 'g-1', content: 'Fil général' })] : [],
    )

    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)
    expect(await screen.findByText('Fil général')).toBeInTheDocument()
    expect(listMessagesMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'general' }))
  })
})

/**
 * #1947 — « chaque fois que je clique sur "demander à laura" […] faudrait […] que
 * ça ouvre une nouvelle discussion et pas systématiquement la même en mémoire, et
 * que directement au bout de 3 secondes Laura m'envoie le premier message ».
 * #1908 — « après un délai bref, Laura prend la parole avec un message adapté ».
 */
describe('#1947 — « Demander à Laura » ouvre un fil NEUF, et Laura prend la parole', () => {
  afterEach(() => {
    vi.useRealTimers()
    setLauraSilenced(false)
  })

  const lastThreadRead = () =>
    (listMessagesMock.mock.calls.at(-1)?.[0] as { conversationId: string } | undefined)?.conversationId

  /** Le fil vierge est lu, la lecture est résolue : l'amorce peut s'armer. */
  async function blankThreadLoaded() {
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await act(async () => {})
  }

  it('`/chat` nu ouvre un fil NEUF — plus jamais le fil « general »', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(lastThreadRead()).toBeTruthy()
    expect(lastThreadRead()).not.toBe('general')
  })

  it('deux arrivées sur `/chat` nu ouvrent deux fils DIFFÉRENTS', async () => {
    const first = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const firstThread = lastThreadRead()
    const callsAfterFirst = listMessagesMock.mock.calls.length
    first.unmount()

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock.mock.calls.length).toBeGreaterThan(callsAfterFirst))
    expect(lastThreadRead()).not.toBe(firstThread)
  })

  // #3215.4 — « Demander à Laura » depuis /accounts/<id> pose `?fresh=1&accountId=<id>`.
  // Le retrait de `fresh` effaçait AUSSI `accountId` : la portée retombait sur
  // « Tout mon espace ». Le retrait ne doit retirer QUE `fresh`.
  it('#3215.4 — `?fresh=1&accountId=` garde le compte : seul `fresh` est retiré de l’URL', async () => {
    locationSearch.current = { fresh: '1', accountId: 'acc-sg' }
    render(<Chat />)
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    for (const call of navigateMock.mock.calls) {
      expect((call[0] as { search?: Record<string, unknown> }).search).toEqual({
        accountId: 'acc-sg',
        conversationId: expect.not.stringMatching(/^account-/),
      })
    }
    locationSearch.current = {}
  })

  // #3939.3 (recette prod 14/10, Sanofi) — arrivée DIRECTE sur `/chat?accountId=<id>&fresh=1`
  // (montage, pas une navigation au sein du même montage) : `initialConversationId` résout
  // sur `conversationIdForAccount(accountId)`, le fil DÉTERMINISTE du compte — jamais neuf.
  // `freshAtMount` croyait pourtant le montage « déjà neuf » dès que `fresh` était présent à
  // l'arrivée, donc ignorait la demande et laissait le fil existant du compte se recharger.
  it('#3939.3 — `?fresh=1&accountId=` dès le MONTAGE ouvre aussi un fil neuf, jamais le fil existant du compte', async () => {
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'account-acc-sg'
        ? [persistedMessage({ id: 'a-1', role: 'assistant', content: 'Vieux contenu Sanofi' })]
        : [],
    )
    locationSearch.current = { fresh: '1', accountId: 'acc-sg' }
    render(<Chat />)

    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Vieux contenu Sanofi')).not.toBeInTheDocument())
    expect(lastThreadRead()).not.toBe('account-acc-sg')
    locationSearch.current = {}
  })

  // #3939.3 (recette prod 14/10 R5, Sanofi) — arrivé DIRECTEMENT (pas une navigation
  // interne) sur `/chat?accountId=<id>&fresh=1`, `freshAtMount` croyait le fil du
  // MONTAGE déjà neuf dès que `fresh` était dans l'URL — or avec `accountId`,
  // `initialConversationId` résout sur `conversationIdForAccount`, le fil DÉTERMINISTE
  // (donc existant) du compte, jamais un fil neuf. Le lien « Demander à Laura » rouvrait
  // donc l'ancien fil du compte au lieu d'en ouvrir un.
  it('#3939.3 — `?accountId=<id>&fresh=1` arrivé DIRECTEMENT ouvre un fil NEUF, jamais le fil existant du compte', async () => {
    locationSearch.current = { fresh: '1', accountId: 'acc-sg' }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(lastThreadRead()).not.toBe('account-acc-sg')
    locationSearch.current = {}
  })

  // #3939.3 (R13, prod 15/10) — #4224 n'a corrigé que le chemin SANS remontage. En prod, l'écran est
  // remonté après le retrait de `fresh` (garde de plan, route) : le fil neuf n'était que dans l'état
  // du composant, `initialConversationId` résolvait de nouveau `account-<id>` → l'ancien fil revenait.
  // Le fil neuf doit donc voyager dans l'ADRESSE (`conversationId=<nouvel id>`).
  it('#3939.3 — `?accountId=&fresh=1` puis REMONTAGE sur l’adresse réécrite : toujours le fil neuf, jamais `account-<id>`', async () => {
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'account-acc-sg'
        ? [persistedMessage({ id: 'a-1', role: 'assistant', content: 'Donnée du 28 sept' })]
        : [],
    )
    locationSearch.current = { fresh: '1', accountId: 'acc-sg' }
    const first = render(<Chat />)
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    const rewritten = (navigateMock.mock.calls.at(-1)?.[0] as { search: Record<string, unknown> }).search
    expect(rewritten.fresh).toBeUndefined()
    first.unmount()

    listMessagesMock.mockClear()
    locationSearch.current = { ...rewritten }
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByText('Donnée du 28 sept')).not.toBeInTheDocument()
    expect(lastThreadRead()).not.toBe('account-acc-sg')
    expect(lastThreadRead()).toMatch(/\S/)
    locationSearch.current = {}
  })

  // #3939.3 (recette prod 14/10) — `?account=<id>` est l'alias d'`accountId` : les DEUX clés + `fresh=1`
  // ouvrent un fil NEUF au périmètre DU COMPTE (avant : `account` était ignoré → « Tout mon espace »).
  it.each(['account', 'accountId'])(
    '#3939.3 — `?fresh=1&%s=` ouvre un fil neuf cadré sur le compte, et garde le compte dans l’URL',
    async key => {
      listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
        conversationId === 'account-acc-sg'
          ? [persistedMessage({ id: 'a-1', role: 'assistant', content: 'Vieux contenu Sanofi' })]
          : [],
      )
      locationSearch.current = { fresh: '1', [key]: 'acc-sg' }
      render(<Chat />)
      await waitFor(() => expect(navigateMock).toHaveBeenCalled())
      await waitFor(() => expect(screen.queryByText('Vieux contenu Sanofi')).not.toBeInTheDocument())
      expect(lastThreadRead()).not.toBe('account-acc-sg')
      for (const call of navigateMock.mock.calls) {
        expect((call[0] as { search?: Record<string, unknown> }).search).toEqual({
          accountId: 'acc-sg',
          conversationId: expect.not.stringMatching(/^account-/),
        })
      }
      locationSearch.current = {}
    },
  )

  it('`?fresh=` depuis un fil OUVERT repart sur un fil vierge, puis se retire de l’URL', async () => {
    locationSearch.current = { conversationId: 'c-ancien' }
    listMessagesMock.mockImplementation(async ({ conversationId }: { conversationId: string }) =>
      conversationId === 'c-ancien'
        ? [persistedMessage({ id: 'a-1', role: 'assistant', content: 'Contenu ancien' })]
        : [],
    )
    const { rerender } = render(<Chat />)
    expect(await screen.findByText('Contenu ancien')).toBeInTheDocument()

    // Le clic sur « Demander à Laura » : même route, `?fresh=1`, pas de démontage.
    locationSearch.current = { fresh: '1' }
    rerender(<Chat />)

    await waitFor(() => expect(screen.queryByText('Contenu ancien')).not.toBeInTheDocument())
    expect(lastThreadRead()).not.toBe('c-ancien')
    expect(lastThreadRead()).not.toBe('general')
    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: '/chat', search: {}, replace: true }))
  })

  it('`?fresh=` depuis un fil nu DÉJÀ ENTAMÉ repart aussi de zéro — le clic n’est jamais sans effet', async () => {
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Première question' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(await screen.findByText('Réponse du copilote')).toBeInTheDocument()
    const startedThread = lastThreadRead()

    locationSearch.current = { fresh: '1' }
    rerender(<Chat />)

    await waitFor(() => expect(screen.queryByText('Réponse du copilote')).not.toBeInTheDocument())
    expect(lastThreadRead()).not.toBe(startedThread)
  })

  // #3939.3 (R12, prod 15/10) — le reflet « le fil vient de s'écrire → l'adresse le porte » (#3367)
  // tournait dans la MÊME passe que l'effet `fresh` : `activeConversationId` y était encore le fil du
  // compte (écrit), donc il re-posait `conversationId=account-<id>` et l'ancien fil se rouvrait.
  it('#3939.3 — `?fresh=1&accountId=` après un fil du compte ÉCRIT : l’URL ne repart pas sur `account-<id>`', async () => {
    locationSearch.current = { accountId: 'acc-sg' }
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Première question' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(await screen.findByText('Réponse du copilote')).toBeInTheDocument()
    expect(lastThreadRead()).toBe('account-acc-sg')

    // Le routeur suit le reflet #3367 : l'adresse porte maintenant le fil écrit.
    locationSearch.current = { accountId: 'acc-sg', conversationId: 'account-acc-sg' }
    rerender(<Chat />)
    await act(async () => {})

    // Puis « Demander à Laura » : `conversationId` disparaît, `fresh` arrive.
    navigateMock.mockClear()
    locationSearch.current = { fresh: '1', accountId: 'acc-sg' }
    rerender(<Chat />)

    await waitFor(() => expect(screen.queryByText('Réponse du copilote')).not.toBeInTheDocument())
    expect(lastThreadRead()).not.toBe('account-acc-sg')
    for (const call of navigateMock.mock.calls) {
      expect((call[0] as { search?: Record<string, unknown> }).search).toEqual({
        accountId: 'acc-sg',
        conversationId: expect.not.stringMatching(/^account-/),
      })
    }
    locationSearch.current = {}
  })

  it('Laura prend la parole au bout de 3 s sur un fil vierge — pas avant', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Chat />)
    await blankThreadLoaded()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS - 1_000)
    })
    expect(openerBubble()).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()
  })

  // #3884.1/.3 — recette 08/10/2026 : le fallback pré-amorce posait encore sa
  // propre question (« Qu'est-ce qu'on fait ? »), doublant celle de la bulle
  // de Laura trois secondes plus tard. Une seule voix d'accueil : la bulle.
  it('#3884 — jamais deux salutations : le fallback ne pose plus sa propre question', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Chat />)
    await blankThreadLoaded()

    // Avant que Laura parle : pas de salutation concurrente à l'écran.
    expect(screen.queryByText("Qu'est-ce qu'on fait ?")).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })

    // Une fois la bulle affichée (#3773), l'ancienne salutation reste absente.
    expect(await findOpenerBubble()).toBeInTheDocument()
    expect(screen.queryByText("Qu'est-ce qu'on fait ?")).not.toBeInTheDocument()
  })

  it('#2427.10 — ne prend PAS la parole quand le budget de proactivité dit « stop » (coupée ou en retrait)', async () => {
    setLauraSilenced(true)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Chat />)
    await blankThreadLoaded()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS * 2)
    })
    // Le brief du matin se lit via une promesse : la laisser se résoudre avant
    // de constater l'absence, sinon l'assertion passerait pour la mauvaise
    // raison (avant que `speak()` ait eu l'occasion de s'exécuter).
    await act(async () => {})
    expect(openerBubble()).toBeNull()
  })

  it('ne prend PAS la parole sur un fil qui a déjà des messages', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    locationSearch.current = { conversationId: 'c-ecrit' }
    listMessagesMock.mockResolvedValue([persistedMessage({ id: 'e-1', role: 'assistant', content: 'Déjà écrit' })])
    render(<Chat />)
    expect(await screen.findByText('Déjà écrit')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS * 2)
    })
    expect(openerBubble()).toBeNull()
  })

  it('ne prend PAS la parole quand un autre écran a déjà pré-rempli la question', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    locationSearch.current = { prompt: 'Analyse Airbus' }
    render(<Chat />)
    await blankThreadLoaded()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS * 2)
    })
    expect(openerBubble()).toBeNull()
  })

  it('une amorce ABANDONNÉE ne laisse aucune trace en base', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Chat />)
    await blankThreadLoaded()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()
    expect(createMessageMock).not.toHaveBeenCalled()
  })

  it('#3773.1 — la salutation d’interface n’entre PAS dans le fil : ni écrite en base, ni envoyée à Laura comme historique', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Chat />)
    await blankThreadLoaded()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Quels comptes travailler ?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Question puis réponse : DEUX écritures, pas trois — la salutation n'est pas un message.
    await waitFor(() => expect(createMessageMock).toHaveBeenCalledTimes(2))
    const roles = createMessageMock.mock.calls.map(call => (call[0] as { role: string }).role)
    expect(roles).toEqual(['user', 'assistant'])
    expect(askLauraStreamingMock).toHaveBeenCalledWith(
      expect.objectContaining({ history: [] }),
      expect.anything(),
      expect.anything(),
    )
    // Et elle ne se relit pas dans le fil une fois la conversation commencée.
    expect(openerBubble()).toBeNull()
  })

  /**
   * #1957.8 — UNE QUESTION REFUSÉE AU PLAFOND N'ENTRE PAS DANS LE FIL.
   *
   * La question s'écrivait AU CLIC, en parallèle de l'appel au modèle. Refusée
   * au plafond (429), elle restait donc en base : elle réapparaissait au
   * rechargement à côté de sa version renvoyée, et — le plafond comptant les
   * lignes `role: 'user'` — chaque nouvel essai repoussait la réouverture que le
   * refus venait d'annoncer.
   */
  it('#1957.8 — une question refusée au plafond n’est pas écrite dans le fil', async () => {
    askLauraStreamingMock.mockRejectedValue(
      new ApiError('Plafond du copilote atteint (50 messages sur 24 h glissantes).', 429, 'chat_quota_reached', {
        statusCode: 429,
        code: 'chat_quota_reached',
        limit: 50,
        reopensAt: null,
      }),
    )
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Une question de trop' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await screen.findAllByText(/plafond/i)
    expect(createMessageMock).not.toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }))
    // Le refus dit ce que la personne peut faire, dans sa langue — pas la phrase brute du serveur.
    // (Deux fois : dans la bulle, et dans la région lue par le lecteur d'écran.)
    expect((await screen.findAllByText(/Tu as atteint le plafond de 50 demandes/)).length).toBeGreaterThan(0)
  })

  it('#1957.8 — la question s’écrit dès que le serveur ACCEPTE le tour, sans attendre la réponse', async () => {
    askLauraStreamingMock.mockImplementation((_request: unknown, handlers: { onAccepted?: () => void }) => {
      handlers.onAccepted?.()
      return new Promise(() => {})
    })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Une longue analyse' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user', content: 'Une longue analyse' }),
      ),
    )
  })
})

/**
 * #1936 — « à la première connexion de la journée, Laura présente trois blocs ».
 * Décision de Louis du 12/09 : la 1re ouverture du jour EST le brief ; ensuite,
 * l'amorce courte. Le marqueur se CONSOMME : le consommer là où rien ne
 * s'affiche mangerait le brief sans qu'il ait été vu — d'où les tests NON.
 */
describe('#1936 — la 1re ouverture du jour, Laura parle avec le brief', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const MORNING_BRIEF = {
    date: '2026-09-12',
    timeZone: 'Europe/Paris',
    firstName: null,
    agenda: { state: 'ready', reason: null, events: [], conflicts: [], needsPreparation: [] },
    mail: { state: 'not_connected', reason: 'x', awaitingReply: [], unread: [], positiveReplies: [] },
    tasks: { state: 'ready', reason: null, tasks: [], overdueCount: 0, todayCount: 0 },
    accountsToWatch: [
      {
        accountId: 'a-sg',
        companyName: 'Société Générale',
        reasonKey: 'briefing.account.freshSignal',
        href: '/accounts/a-sg',
        detectedAt: null,
        detectionExact: true,
      },
    ],
    chainBlockers: [],
    actions: [
      {
        id: 'account:a-sg',
        labelKey: 'briefing.actions.freshSignal',
        labelVars: { company: 'Société Générale' },
        href: '/accounts/a-sg',
        kind: 'account',
        priority: 5,
        fact: null,
        context: null,
        preparedArtifacts: [],
        expiresAt: null,
      },
    ],
    generatedAt: '2026-09-12T06:00:00.000Z',
  }

  /** Le serveur dit « première du jour », puis sert le brief — ou échoue à le servir. */
  function firstOpenOfTheDay(brief: unknown = MORNING_BRIEF) {
    apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/briefing/first-open-today') return { isFirstOpenToday: true }
      if (path.startsWith('/briefing/today')) {
        if (brief instanceof Error) throw brief
        return brief
      }
      throw new Error(`apiFetch non doublé : ${path}`)
    })
  }

  const calls = (prefix: string) =>
    apiFetchMock.mock.calls
      .map(call => call[0] as { path: string; body?: { timeZone?: string } })
      .filter(call => call.path.startsWith(prefix))

  async function blankThreadLoaded() {
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await act(async () => {})
  }

  it('à 3 s sur un fil vierge : le brief en trois blocs, à la place de l’amorce courte — et pas avant', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    render(<Chat />)
    await blankThreadLoaded()

    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS - 1_000)
    })
    // Rien d'affiché, donc rien de consommé.
    expect(calls('/briefing/first-open-today')).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(await screen.findByText('Ce qui a changé')).toBeInTheDocument()
    expect(screen.getByText('Ce que j’ai préparé')).toBeInTheDocument()
    expect(screen.getByText('Ce que je te conseille')).toBeInTheDocument()
    // Le fait NOMMÉ porte son lien réel ; la source absente est nommée.
    expect(screen.getByRole('link', { name: 'Société Générale' })).toHaveAttribute('href', '/accounts/a-sg')
    expect(screen.getByText(/Ta messagerie n’est pas connectée/)).toBeInTheDocument()
    expect(openerBubble()).toBeNull()
  })

  it('le MÊME fuseau du navigateur part au marqueur et au brief', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await screen.findByText('Ce qui a changé')).toBeInTheDocument()

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(calls('/briefing/first-open-today')).toEqual([expect.objectContaining({ body: { timeZone: zone } })])
    expect(calls('/briefing/today')).toEqual([{ path: `/briefing/today?timeZone=${encodeURIComponent(zone)}` }])
  })

  it('pas la première du jour : l’amorce courte, et le brief n’est même pas lu', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()
    expect(calls('/briefing/first-open-today')).toHaveLength(1)
    expect(calls('/briefing/today')).toHaveLength(0)
  })

  it('marqueur en panne : l’amorce courte, jamais un brief deviné', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    apiFetchMock.mockRejectedValue(new Error('offline'))
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()
    expect(screen.queryByText('Ce qui a changé')).not.toBeInTheDocument()
  })

  it('brief illisible à la 1re ouverture : consommé quand même, et chaque bloc nomme le silence', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay(new Error('503'))
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await screen.findByText(/Je n’ai pas pu lire tes sources/)).toBeInTheDocument()
    expect(screen.getByText('Ce que je te conseille')).toBeInTheDocument()
  })

  it('NON — un fil déjà écrit ne consomme JAMAIS le marqueur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    locationSearch.current = { conversationId: 'c-ecrit' }
    listMessagesMock.mockResolvedValue([persistedMessage({ id: 'e-1', role: 'assistant', content: 'Déjà écrit' })])
    render(<Chat />)
    expect(await screen.findByText('Déjà écrit')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS * 2)
    })
    await act(async () => {})
    expect(calls('/briefing/first-open-today')).toHaveLength(0)
  })

  it('NON — une question pré-remplie (`?prompt=`) ne consomme JAMAIS le marqueur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    locationSearch.current = { prompt: 'Analyse Airbus' }
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS * 2)
    })
    await act(async () => {})
    expect(calls('/briefing/first-open-today')).toHaveLength(0)
  })

  it('NON — une question envoyée (`?ask=`) ne consomme JAMAIS le marqueur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    locationSearch.current = { ask: 'Quels comptes cette semaine ?' }
    render(<Chat />)
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Quels comptes cette semaine ?' }),
        expect.anything(),
        expect.anything(),
      ),
    )
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS * 2)
    })
    await act(async () => {})
    expect(calls('/briefing/first-open-today')).toHaveLength(0)
  })

  it('NON — un fil cadré sur un COMPTE garde l’amorce du compte et ne consomme pas le marqueur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    locationSearch.current = { accountId: 'a-sncf' }
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()
    expect(calls('/briefing/first-open-today')).toHaveLength(0)
  })

  it('UN appel par montage : le fil vierge suivant reçoit l’amorce courte', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    const { rerender } = render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await screen.findByText('Ce qui a changé')).toBeInTheDocument()

    locationSearch.current = { fresh: '1' }
    rerender(<Chat />)
    await waitFor(() => expect(screen.queryByText('Ce qui a changé')).not.toBeInTheDocument())
    await act(async () => {})
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await findOpenerBubble()).toBeInTheDocument()
    expect(calls('/briefing/first-open-today')).toHaveLength(1)
    expect(calls('/briefing/today')).toHaveLength(1)
  })

  it('le brief part AVEC la première réponse : écrit avant elle, et relu par Laura', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    render(<Chat />)
    await blankThreadLoaded()
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await screen.findByText('Ce qui a changé')).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Pourquoi Société Générale ?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(createMessageMock).toHaveBeenCalledTimes(3))
    const written = createMessageMock.mock.calls.map(call => call[0] as { role: string; content: string })
    expect(written.map(turn => turn.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(written[0]?.content).toContain('**Ce qui a changé**')
    expect(askLauraStreamingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [{ role: 'assistant', content: expect.stringContaining('Ce que je te conseille') }],
      }),
      expect.anything(),
      expect.anything(),
    )
  })

  it('#1921.9 — arrivée depuis l’accueil : Laura prend le relais, le marqueur reste intact, le paramètre se retire', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    firstOpenOfTheDay()
    locationSearch.current = { from: 'welcome' }
    render(<Chat />)
    await blankThreadLoaded()
    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: '/chat', search: {}, replace: true }))
    act(() => {
      vi.advanceTimersByTime(LAURA_OPENER_DELAY_MS)
    })
    expect(await screen.findByText(/bien compris ton métier/)).toBeInTheDocument()
    expect(calls('/briefing/first-open-today')).toHaveLength(0)
  })
})

/**
 * #1953.11 / #1953.22 — LA PROVENANCE D'UNE BRANCHE SURVIT AU RECHARGEMENT.
 *
 * Défaut mesuré en production le 16/09/2026 (SHA servi 4897da487, fil
 * b04ed923-26ee-4b03-802d-a9c209d4b2c5) : « Modifier ma demande » étiquetait
 * bien la réponse abandonnée « Réponse remplacée à 15:05 — conservée pour
 * mémoire » et rejouait la demande à la suite ; après un RECHARGEMENT COMPLET
 * de la page, zéro élément du DOM ne portait « remplac ». Les deux échanges se
 * retrouvaient côte à côte, sans rien qui dise que le second est une réédition
 * du premier.
 *
 * Ces tests montent l'écran comme un rechargement le fait : sur le seul fil
 * SERVI par l'API, sans aucune interaction préalable.
 */
describe('#1953.11 / #1953.22 — la provenance d’une branche après un rechargement', () => {
  /** Le fil tel que l'API le sert APRÈS une « demande modifiée » : deux échanges, un lien. */
  function threadWithABranch(overrides: Record<string, unknown> = {}) {
    return [
      persistedMessage({ id: 'q-1', role: 'user', content: 'Ma première demande' }),
      persistedMessage({
        id: 'a-1',
        role: 'assistant',
        content: 'Ma première réponse',
        created_at: '2026-09-16T13:02:00.000Z',
        superseded_at: '2026-09-16T13:07:00.000Z',
      }),
      persistedMessage({ id: 'q-2', role: 'user', content: 'Ma demande corrigée' }),
      persistedMessage({
        id: 'a-2',
        role: 'assistant',
        content: 'Ma réponse rejouée',
        created_at: '2026-09-16T13:07:00.000Z',
        branch_of_message_id: 'a-1',
        branch_kind: 'edit',
        ...overrides,
      }),
    ]
  }

  it('la réponse remplacée garde sa marque — « on archive, on ne supprime pas »', async () => {
    listMessagesMock.mockResolvedValue(threadWithABranch())
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)

    await screen.findByText('Ma première réponse')
    // L'heure est formatée dans le fuseau de la machine : on mesure la MARQUE,
    // pas le fuseau du runner.
    expect(await screen.findByText(/Réponse remplacée à \d{2}:\d{2}/)).toBeInTheDocument()
    // Et l'ancien échange reste LISIBLE, entier.
    expect(screen.getByText('Ma première demande')).toBeInTheDocument()
  })

  it('la seconde réponse DIT qu’elle reprend la première, et que la demande a été modifiée', async () => {
    listMessagesMock.mockResolvedValue(threadWithABranch())
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)

    expect(
      await screen.findByText(/Reprise de la réponse de \d{2}:\d{2} — la demande a été modifiée/),
    ).toBeInTheDocument()
  })

  it('TÉMOIN — un fil SANS branche n’affiche ni marque ni reprise', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'q-1', role: 'user', content: 'Ma question d’hier' }),
      persistedMessage({ id: 'a-1', role: 'assistant', content: 'Ma réponse d’hier' }),
    ])
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)

    await screen.findByText('Ma réponse d’hier')
    expect(screen.queryByText(/remplac/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reprise de la réponse/)).not.toBeInTheDocument()
  })

  it('une nature de branche INCONNUE n’invente aucune reprise', async () => {
    listMessagesMock.mockResolvedValue(threadWithABranch({ branch_kind: 'fusion' }))
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)

    await screen.findByText('Ma réponse rejouée')
    expect(screen.queryByText(/Reprise de la réponse/)).not.toBeInTheDocument()
  })

  it('#1953.11 — « Réessayer » fait PARTIR le lien : la réponse enregistrée porte sa branche', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'q-1', role: 'user', content: 'Ma première demande' }),
      persistedMessage({ id: 'a-1', role: 'assistant', content: 'Ma première réponse' }),
    ])
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)
    await screen.findByText('Ma première réponse')

    // #5047 — l'en-tête porte aussi un ⋯ (« … sur la conversation ») : on vise celui de la RÉPONSE.
    await userEvent.click(screen.getByRole('button', { name: /plus d.actions sur cette réponse/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /réessayer/i }))

    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', branchOfMessageId: 'a-1', branchKind: 'retry' }),
      ),
    )
    // TÉMOIN — la QUESTION rejouée ne porte aucune branche : c'est la réponse
    // qui repart d'une autre réponse, jamais la demande.
    const question = createMessageMock.mock.calls
      .map(call => call[0] as Record<string, unknown>)
      .find(body => body['role'] === 'user')
    expect(question?.['branchOfMessageId']).toBeUndefined()
  })
})

/**
 * #2441.11 — LE MENU D'UNE BULLE AGIT SUR SON INDEX, PAS SUR UN AUTRE.
 *
 * Garde-fou pour le câblage de `useIndexedCallback` sur `messages.map` (voir
 * `use-indexed-callback.ts`) : ce hook ne sert qu'à donner à chaque bulle une
 * référence de fonction STABLE d'un render à l'autre, jamais à changer QUELLE
 * bulle elle vise. Un cache mal invalidé (ex. par identité de fonction plutôt
 * que par index) ferait dériver le menu de la PREMIÈRE bulle vers l'index
 * d'une AUTRE — c'est exactement ce que ce test ferme, en vérifiant l'effet le
 * plus simple à observer sans mocker le streaming : « Modifier ma demande »
 * pose la question PRÉCÉDENTE dans la saisie (`editLastMessage`, `Chat.tsx`).
 */
describe('#2441.11 — le menu de chaque bulle reste attaché à SON index', () => {
  it('« Modifier ma demande » sur la PREMIÈRE bulle pose la PREMIÈRE question, pas la seconde', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'q-1', role: 'user', content: 'Ma première demande' }),
      persistedMessage({ id: 'a-1', role: 'assistant', content: 'Ma première réponse' }),
      persistedMessage({ id: 'q-2', role: 'user', content: 'Ma deuxième demande' }),
      persistedMessage({ id: 'a-2', role: 'assistant', content: 'Ma deuxième réponse' }),
    ])
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)
    await screen.findByText('Ma deuxième réponse')

    const firstReplyContent = screen.getByText('Ma première réponse').closest('[data-chat-kind="reply"]')
    const firstBubble = firstReplyContent?.parentElement as HTMLElement
    await userEvent.click(within(firstBubble).getByRole('button', { name: /plus d.actions/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /modifier ma demande/i }))

    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Ma première demande')
  })

  it('« Modifier ma demande » sur la SECONDE bulle pose la SECONDE question, pas la première', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'q-1', role: 'user', content: 'Ma première demande' }),
      persistedMessage({ id: 'a-1', role: 'assistant', content: 'Ma première réponse' }),
      persistedMessage({ id: 'q-2', role: 'user', content: 'Ma deuxième demande' }),
      persistedMessage({ id: 'a-2', role: 'assistant', content: 'Ma deuxième réponse' }),
    ])
    locationSearch.current = { conversationId: 'general' }

    render(<Chat />)
    await screen.findByText('Ma deuxième réponse')

    const secondReplyContent = screen.getByText('Ma deuxième réponse').closest('[data-chat-kind="reply"]')
    const secondBubble = secondReplyContent?.parentElement as HTMLElement
    await userEvent.click(within(secondBubble).getByRole('button', { name: /plus d.actions/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /modifier ma demande/i }))

    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Ma deuxième demande')
  })
})

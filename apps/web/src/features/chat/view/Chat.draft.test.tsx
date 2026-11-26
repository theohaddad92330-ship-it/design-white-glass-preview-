import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { clearAllChatDrafts, readChatDraft, writeChatDraft } from '../lib/composer-draft'

/**
 * #1953.15 / #1953.16 / #1953.17 / #1953.18 — LE BROUILLON SURVIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT CES QUATRE POINTS SE LISENT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre partagent la MÊME cause (`input` en `useState` seul, constat du
 * registre) et donc le MÊME correctif : une copie débouncée dans
 * `localStorage`, relue au montage. « Survit à un rafraîchissement » et
 * « survit à une navigation accidentelle » se prouvent tous deux en DÉMONTANT
 * puis en REMONTANT `<Chat />` — c'est exactement ce que fait un F5 ou un
 * retour arrière du navigateur pour ce composant. « Survit à une perte de
 * réseau » est couvert au même titre (perdre le réseau ne vide pas un
 * `useState`, mais forcer un rechargement pour la retrouver le ferait sans ce
 * correctif) et par `Chat.send-failure.test.tsx`, qui couvre le cas où le
 * réseau tombe PENDANT l'envoi. « Fermeture du drawer » n'a pas d'équivalent
 * sur `/chat` (pas de tiroir autour de sa saisie) ; voir le rapport de
 * livraison pour ce que ce point vise réellement (la bulle de Laura) et
 * pourquoi elle n'obtient PAS cette même persistance.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

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
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// #1940.4 — l'auteur des bulles lit le profil (react-query) : même double que le prénom.
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
  useLocation: () => ({ search: locationSearch.current }),
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
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #1954.20 — « retirer » une pièce jointe la supprime : `Chat` monte ce hook
// react-query, que cette suite (sans QueryClientProvider) doit doubler.
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

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
})

describe('#1953.15 / #1953.17 — le brouillon survit à un rafraîchissement / une navigation accidentelle', () => {
  it('un texte tapé est retrouvé après démontage + remontage du même fil', async () => {
    locationSearch.current = { conversationId: 'c-stable' }
    const { unmount } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Analyse Airbus, angle Cyber' } })

    // Laisse le débounce (~300 ms) écrire le brouillon avant de simuler le F5.
    await new Promise(resolve => setTimeout(resolve, 350))
    unmount()

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Analyse Airbus, angle Cyber')
  })

  it('`/chat` NU (aucun `?conversationId=` ni `?accountId=`) — le cas le plus fréquent — survit aussi', async () => {
    const { unmount } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Quels comptes prioriser ?' } })
    await new Promise(resolve => setTimeout(resolve, 350))
    unmount()

    // Un fil NU tire un identifiant ALÉATOIRE à chaque montage
    // (`newConversationId`) : c'est exactement pourquoi la clé du brouillon
    // n'est PAS `activeConversationId` — voir `composer-draft.ts`.
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Quels comptes prioriser ?')
  })

  it('un brouillon de plus de 7 jours ne revient PAS', async () => {
    locationSearch.current = { conversationId: 'c-perime' }
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    localStorage.setItem(
      'bellum:chat-draft:u1:c-perime',
      JSON.stringify({ text: 'Vieux brouillon', savedAt: eightDaysAgo }),
    )

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('')
  })
})

describe('#1953.15 — `?prompt=` (pré-remplissage explicite) gagne sur le brouillon', () => {
  it('un brouillon existant ne remplace PAS un `?prompt=` déposé par un autre écran', async () => {
    locationSearch.current = { conversationId: 'c-avec-prompt', prompt: 'Prépare une reprise avec ACME.' }
    writeChatDraft('u1', 'c-avec-prompt', 'Vieux brouillon oublié')

    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Prépare une reprise avec ACME.')
  })
})

describe('#1953.15 — isolation par fil', () => {
  it('changer de fil charge le brouillon du NOUVEAU fil, pas celui du précédent', async () => {
    writeChatDraft('u1', 'c-un', 'Brouillon du premier fil')
    writeChatDraft('u1', 'c-deux', 'Brouillon du second fil')

    locationSearch.current = { conversationId: 'c-un' }
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Brouillon du premier fil')

    // Même route, autres paramètres — ce que fait un clic dans la barre latérale.
    locationSearch.current = { conversationId: 'c-deux' }
    rerender(<Chat />)

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Brouillon du second fil'),
    )
  })

  it("changer de fil ÉCRIT d'abord le brouillon EN COURS du fil qu'on quitte, sans attendre le débounce", async () => {
    locationSearch.current = { conversationId: 'c-un' }
    const { rerender } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Frappe encore non débouncée' } })

    // Changement de fil IMMÉDIAT, avant les 300 ms du débounce.
    locationSearch.current = { conversationId: 'c-deux' }
    rerender(<Chat />)
    await waitFor(() => expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue(''))

    expect(readChatDraft('u1', 'c-un')).toBe('Frappe encore non débouncée')
  })
})

describe('#1957.6 / #1953.15 — le brouillon PERSISTANT ne disparaît qu’à l’acceptation serveur', () => {
  it('un envoi réussi efface le brouillon stocké — un remontage repart vide', async () => {
    locationSearch.current = { conversationId: 'c-accepte' }
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Réponse du copilote' })
    const { unmount } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Question qui va aboutir' } })
    await new Promise(resolve => setTimeout(resolve, 350))
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Réponse du copilote')).toBeInTheDocument())
    unmount()

    expect(readChatDraft('u1', 'c-accepte')).toBe('')
  })
})

/**
 * Revue d'intégration du lot fils (13/09) — un envoi qui ne vient PAS de la
 * saisie ne touche pas à la saisie.
 *
 * `handleSend(text)` sert aussi `?ask=` (bibliothèque de commandes), les options
 * d'une clarification et les amorces de la démonstration. Il vidait la saisie
 * sans condition, puis effaçait le brouillon stocké à l'acceptation : une
 * question arrivée par `?ask=` détruisait le brouillon que le montage venait de
 * rendre au fil — la perte même que ce lot corrige.
 */
describe('#1953.15 — un envoi venu d’ailleurs que la saisie ne vide pas le brouillon', () => {
  it('une question envoyée par `?ask=` laisse la saisie ET le brouillon stocké intacts', async () => {
    writeChatDraft('u1', 'new', 'Mon brouillon en cours')
    locationSearch.current = { ask: 'Quels comptes prioriser ?' }
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Voici trois comptes.' })

    render(<Chat />)

    // L'écriture de la réponse vient APRÈS l'effacement du brouillon sur le
    // chemin de succès : l'attendre prouve que ce chemin a été parcouru en entier.
    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', content: 'Voici trois comptes.' }),
      ),
    )
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Mon brouillon en cours')
    await new Promise(resolve => setTimeout(resolve, 350))
    expect(readChatDraft('u1', 'new')).toBe('Mon brouillon en cours')
  })
})

/**
 * Revue d'intégration du lot fils (13/09) — « ne disparaît qu'à l'acceptation
 * serveur » était FAUX pendant le vol.
 *
 * L'envoi vide la saisie (affichage optimiste) ; l'écriture débouncée de cette
 * saisie VIDE effaçait le brouillon stocké 300 ms après le clic, bien avant la
 * réponse (3 à 90 s). Recharger la page — ou la perdre — pendant ce temps
 * emportait la question : ni dans la saisie, ni dans le stockage, et pas encore
 * dans le fil puisque l'écriture du tour suit la réponse.
 */
describe('#1953.16 — pendant l’envoi, le brouillon stocké reste', () => {
  it('une réponse encore en vol ne vide pas le stockage — un remontage retrouve la question', async () => {
    locationSearch.current = { conversationId: 'c-en-vol' }
    askLauraStreamingMock.mockImplementation(() => new Promise(() => {}))
    const { unmount } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    // Entrée AVANT la fin du débounce : la frappe en attente doit être écrite.
    fireEvent.change(textarea, { target: { value: 'Question encore en vol' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(textarea).toHaveValue(''))
    await new Promise(resolve => setTimeout(resolve, 350))

    expect(readChatDraft('u1', 'c-en-vol')).toBe('Question encore en vol')

    unmount()
    render(<Chat />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Question encore en vol'),
    )
  })
})

/**
 * Revue d'intégration du lot fils (13/09) — la purge de déconnexion GAGNE.
 *
 * `clearVolatileUserState` vide les brouillons de façon synchrone, AVANT que
 * React ne rende l'écran sans session. Une frappe encore dans le débounce était
 * ensuite réécrite par le démontage (ou par le changement d'utilisateur) : le
 * brouillon ressuscitait après la purge. Cas réel : une session qui expire
 * pendant la frappe (`setAuthExpiredHandler` → `clear()`).
 */
describe('#1953.15 — une frappe en attente ne survit pas à la purge de déconnexion', () => {
  it('purger puis démonter ne réécrit pas la frappe encore dans le débounce', async () => {
    locationSearch.current = { conversationId: 'c-purge' }
    const { unmount } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText('Écris ton message...'), {
      target: { value: 'Tapé juste avant la coupure' },
    })
    clearAllChatDrafts()
    unmount()

    expect(readChatDraft('u1', 'c-purge')).toBe('')
  })

  it('n’attrape pas le voisin — une frappe APRÈS la purge s’écrit normalement', async () => {
    locationSearch.current = { conversationId: 'c-apres-purge' }
    clearAllChatDrafts()
    const { unmount } = render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText('Écris ton message...'), {
      target: { value: 'Tapé après la purge' },
    })
    unmount()

    expect(readChatDraft('u1', 'c-apres-purge')).toBe('Tapé après la purge')
  })
})

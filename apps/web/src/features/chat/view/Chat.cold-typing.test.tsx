import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { writeChatDraft } from '../lib/composer-draft'

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
const sessionUser = vi.hoisted(() => ({ current: { id: 'u1' } as { id: string } | null }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: sessionUser.current }) }))
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

// chat saisie à froid (recette 10/10, lot Q08) — « après rechargement de /chat, la
// frappe clavier réelle dans le composeur n'arrive jamais (valeur "" , aucun POST) ».
// Le composeur ne doit JAMAIS avaler ce que la personne tape : ni la session qui
// arrive en retard, ni l'historique qui arrive en retard, ni un brouillon restauré
// après coup, ni un fil qui se précise ne remplacent une saisie en cours.
const FIELD = 'Écris ton message...'

describe('chat saisie à froid (recette 10/10) — la frappe réelle n’est jamais avalée', () => {
  beforeEach(() => {
    sessionUser.current = { id: 'u1' }
  })

  it('historique en retard : la frappe faite AVANT son arrivée reste, et Entrée envoie', async () => {
    let resolveHistory: (value: never[]) => void = () => {}
    listMessagesMock.mockReturnValue(new Promise<never[]>(resolve => (resolveHistory = resolve)))
    askLauraStreamingMock.mockResolvedValue({ reply: 'ok' })
    const user = userEvent.setup()
    render(<Chat />)

    await user.type(screen.getByPlaceholderText(FIELD), 'Bonjour Laura')
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('Bonjour Laura')

    await act(async () => resolveHistory([]))
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('Bonjour Laura')

    await user.keyboard('{Enter}')
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalled())
  })

  it('session en retard (chargement à froid) : une fois prête, la frappe reste', async () => {
    sessionUser.current = null
    const user = userEvent.setup()
    const { rerender } = render(<Chat />)
    sessionUser.current = { id: 'u1' }
    rerender(<Chat />)

    await user.type(screen.getByPlaceholderText(FIELD), 'Première question')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400))
    })
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('Première question')
  })

  it('brouillon stocké : la frappe qui suit s’ajoute au brouillon, ne le remplace pas', async () => {
    writeChatDraft('u1', 'new', 'abc def')
    const user = userEvent.setup()
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await user.type(screen.getByPlaceholderText(FIELD), ' ghi')
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('abc def ghi')
  })

  // #4006 — « le champ se remplit de éééé » : une touche morte (é, è, ê) est une COMPOSITION ;
  // la remplacer au milieu (restauration d'un brouillon quand le fil change) la rejoue en boucle.
  it('#4006 — composition en cours (touche morte) : un brouillon restauré ne remplace pas la saisie', async () => {
    locationSearch.current = { conversationId: 'c-1' }
    writeChatDraft('u1', 'c-9', 'vieux brouillon')
    const { rerender } = render(<Chat />)
    const field = screen.getByPlaceholderText(FIELD)
    await act(async () => {
      field.focus()
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    await userEvent.setup().type(field, 'é')
    locationSearch.current = { conversationId: 'c-9' }
    rerender(<Chat />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('é')
    await act(async () => {
      field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
  })

  // #4006.1 (lot DIVERS 12/10) — le geste exact de la recette : arriver sur /chat APRÈS une navigation
  // (un montage neuf, session encore en route, vieux brouillon en stock), puis taper une phrase à accents.
  // Le champ contient EXACTEMENT la phrase tapée : ni brouillon qui la remplace, ni « éééé », ni lettre perdue.
  it('#4006.1 — navigation vers /chat, session en retard, vieux brouillon : « été à Évry » reste exact', async () => {
    writeChatDraft('u1', 'new', 'Vieux brouillon')
    sessionUser.current = null
    const user = userEvent.setup()
    const { unmount } = render(<Chat />)
    unmount() // la page d'avant : on QUITTE puis on arrive sur /chat (montage neuf)
    const { rerender } = render(<Chat />)

    await user.type(screen.getByPlaceholderText(FIELD), 'été à Évry')
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('été à Évry')

    sessionUser.current = { id: 'u1' } // la session se résout EN PLEIN geste
    rerender(<Chat />)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400))
    })
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('été à Évry')

    await user.type(screen.getByPlaceholderText(FIELD), ', écrit à Noël')
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('été à Évry, écrit à Noël')
  })

  it('#4006.1 — session déjà connue, historique en retard : chaque lettre accentuée est gardée une fois', async () => {
    let resolveHistory: (value: never[]) => void = () => {}
    listMessagesMock.mockReturnValue(new Promise<never[]>(resolve => (resolveHistory = resolve)))
    const user = userEvent.setup()
    render(<Chat />)

    await user.type(screen.getByPlaceholderText(FIELD), 'Société Générale')
    await act(async () => resolveHistory([]))
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue('Société Générale')
  })

  it('le fil se précise APRÈS la fenêtre de chargement (> 5 s) : la saisie en cours reste', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { rerender } = render(<Chat />)
      await user.type(screen.getByPlaceholderText(FIELD), 'Ma question')
      await act(async () => {
        vi.advanceTimersByTime(8_000)
      })
      await user.type(screen.getByPlaceholderText(FIELD), ' suite')
      await act(async () => {
        await Promise.resolve()
      })
      // L'adresse désigne un fil sans que la personne ait rien fait.
      locationSearch.current = { conversationId: 'c-9' }
      rerender(<Chat />)
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.getByPlaceholderText(FIELD)).toHaveValue('Ma question suite')
    } finally {
      vi.useRealTimers()
    }
  })
})

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #1951.10 / #1951.12 à .16 — la carte de désambiguïsation nomme la personne.
 *
 * L'issue #1951 demande que, sur un homonyme, Laura montre les options avec
 * entreprise, rôle, localisation, statut et logo/avatar — pas un bouton texte
 * plat. `ask_clarification` (apps/ia) porte maintenant ces champs quand le
 * modèle les fournit ; cette suite tient l'APPELANT côté écran :
 *
 *  1. une option structurée affiche ses champs (témoin positif) ;
 *  2. une option TEXTE (le format historique) continue de s'afficher comme un
 *     simple bouton — témoin de non-régression ;
 *  3. cliquer une option structurée envoie son `label`, jamais l'objet entier.
 *
 * Même harnais que `Chat.cards.test.tsx` (mêmes doubles, pas plus).
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
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
// `EntityAvatar` (Radix `Avatar`) ne monte son `<img>` qu'une fois l'image
// CHARGÉE, ce qui n'arrive jamais sous jsdom (même piège que
// `company-lists-show-logos.test.tsx`) : on double le rendu par un `<img>`
// simple pour pouvoir lire la source qu'on lui a réellement passée.
vi.mock('@bellum/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@bellum/ui')>()
  return {
    ...actual,
    EntityAvatar: ({ name, src }: { name?: string | null; src?: string | null }) => (
      <img alt={name ?? ''} src={src ?? undefined} />
    ),
  }
})

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        const cached = motionComponents.get(prop)
        if (cached) return cached
        const Rendered = ({ children, ...props }: MotionMockProps) => {
          const Component = prop as ElementType
          return <Component {...props}>{children}</Component>
        }
        motionComponents.set(prop, Rendered)
        return Rendered
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
vi.mock('@/features/memory/hooks/useReplyMemoryUses', () => ({
  useReplyMemoryUses: () => ({ isLoading: true, isError: false, data: undefined }),
}))
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
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => persistedMessage(args))
})

async function send(text: string): Promise<void> {
  await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('Chat — la carte de clarification nomme la personne', () => {
  it('une option structurée affiche entreprise, rôle, localisation, statut et avatar', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Tu veux dire laquelle ?',
      context: {
        clarification: {
          question: 'Tu veux dire laquelle ?',
          options: [
            {
              label: 'Sophie Martin',
              company: 'Sopra Steria',
              role: 'Consultante Java',
              location: 'Lyon',
              status: 'En mission',
              avatar_url: 'https://cdn.example.com/sophie.jpg',
            },
            { label: 'Sophie Dubois', role: 'Consultante Java', location: 'Nantes' },
          ],
        },
      },
    })
    render(<Chat />)
    await send('Et pour Sophie ?')

    const option = await screen.findByRole('button', { name: /Sophie Martin/ })
    expect(option).toHaveTextContent('Sopra Steria')
    expect(option).toHaveTextContent('Consultante Java')
    expect(option).toHaveTextContent('Lyon')
    expect(option).toHaveTextContent('En mission')
    expect(option.querySelector('img[src="https://cdn.example.com/sophie.jpg"]')).toBeInTheDocument()

    // Un champ absent n'est jamais deviné — pas de tiret ni de "En mission" fabriqué.
    const secondOption = screen.getByRole('button', { name: /Sophie Dubois/ })
    expect(secondOption).not.toHaveTextContent('Sopra Steria')
  })

  it('une option TEXTE (le format historique) s’affiche toujours comme un simple bouton', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Sur quel territoire ?',
      context: { clarification: { question: 'Sur quel territoire ?', options: ['Lyon', 'Toute la France'] } },
    })
    render(<Chat />)
    await send('Cherche des comptes')

    expect(await screen.findByRole('button', { name: 'Lyon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toute la France' })).toBeInTheDocument()
  })

  it('cliquer une option structurée envoie son label, jamais l’objet entier', async () => {
    askLauraStreamingMock.mockResolvedValueOnce({
      reply: 'Tu veux dire laquelle ?',
      context: {
        clarification: {
          question: 'Tu veux dire laquelle ?',
          options: [{ label: 'Sophie Martin', role: 'Consultante Java', location: 'Lyon' }, 'Une autre personne'],
        },
      },
    })
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Sophie Martin, donc.', context: {} })
    render(<Chat />)
    await send('Et pour Sophie ?')

    const option = await screen.findByRole('button', { name: /Sophie Martin/ })
    fireEvent.click(option)

    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalledTimes(2))
    const secondCallArgs = askLauraStreamingMock.mock.calls[1]
    expect(JSON.stringify(secondCallArgs)).toContain('"Sophie Martin"')
    expect(JSON.stringify(secondCallArgs)).not.toContain('Consultante Java')
  })
})

/**
 * #1927.3 / #1927.4 — CE QUE LAURA A ÉCARTÉ, ET CE QU'ELLE SUPPOSE.
 *
 * `chat_thread_state.py` refusait de les EXTRAIRE du texte (« un détecteur par
 * mots-clés rate en silence »), et ce refus tient. Le chemin ouvert est le
 * STRUCTURÉ : `ask_clarification` porte `ruled_out` et `assumptions` à côté de
 * `question` et `options`, et l'écran les REND — sans quoi le champ serait, une
 * fois de plus, du code juste que personne n'appelle.
 *
 * Ce que cette suite tient, côté appelant :
 *  1. les pistes écartées s'affichent, avec leur raison quand il y en a une ;
 *  2. les hypothèses s'affichent, présentées comme corrigeables ;
 *  3. le TÉMOIN : une clarification sans ces champs n'affiche AUCUNE section
 *     vide — c'est la forme d'avant, à l'écran près.
 */
describe('#1927.3 / #1927.4 — les pistes écartées et les hypothèses', () => {
  it('affiche ce qui a été écarté, avec sa raison', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Sur quel territoire ?',
      context: {
        clarification: {
          question: 'Sur quel territoire ?',
          options: ['Lyon', 'Toute la France'],
          ruled_out: [
            { option: 'Bordeaux', reason: 'aucun compte ouvert là-bas' },
            { option: 'Lille', reason: null },
          ],
        },
      },
    })
    render(<Chat />)
    await send('Cherche des comptes')

    expect(await screen.findByText(/Déjà écarté/)).toBeInTheDocument()
    expect(screen.getByText(/Bordeaux/)).toHaveTextContent('aucun compte ouvert là-bas')
    // Une piste sans raison se nomme quand même : « écarté » est déjà une
    // information. Ce qui manque n'est pas inventé.
    expect(screen.getByText(/Lille/)).toBeInTheDocument()
  })

  it('affiche les hypothèses comme corrigeables, pas comme des faits', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Sur quel territoire ?',
      context: {
        clarification: {
          question: 'Sur quel territoire ?',
          options: ['Lyon', 'Toute la France'],
          assumptions: ['une disponibilité sous 30 jours'],
        },
      },
    })
    render(<Chat />)
    await send('Cherche des comptes')

    expect(await screen.findByText(/Je pars sur/)).toBeInTheDocument()
    expect(screen.getByText(/une disponibilité sous 30 jours/)).toBeInTheDocument()
    expect(screen.getByText(/Tu peux corriger/)).toBeInTheDocument()
  })

  it('#3224 — une hypothèse déjà rédigée n’est ni préfixée « Je pars sur » ni doublée de points', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Lequel prime ?',
      context: {
        clarification: {
          question: 'Lequel prime ?',
          options: ['Grand groupe', 'Le reste'],
          assumptions: ['Je conserve tes secteurs… ne les modifies pas..'],
        },
      },
    })
    render(<Chat />)
    await send('Cherche des comptes')

    const line = await screen.findByText(/Je conserve tes secteurs/)
    expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Je conserve tes secteurs… ne les modifies pas. Tu peux corriger.',
    )
  })

  it('#2791 — « Qui est au comité d’achat de Roche ? » entre dans le fil ET part à Laura', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: 'Voici les sièges du comité.', context: {} })
    render(<Chat />)
    await send('Qui est au comité d’achat de Roche ?')

    expect(await screen.findByText('Qui est au comité d’achat de Roche ?')).toBeInTheDocument()
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(askLauraStreamingMock.mock.calls[0])).toContain('comité d’achat de Roche')
    expect(await screen.findByText('Voici les sièges du comité.')).toBeInTheDocument()
  })

  it('LE TÉMOIN : une clarification sans ces champs ne rend AUCUNE section vide', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Sur quel territoire ?',
      context: { clarification: { question: 'Sur quel territoire ?', options: ['Lyon', 'Toute la France'] } },
    })
    render(<Chat />)
    await send('Cherche des comptes')

    expect(await screen.findByRole('button', { name: 'Lyon' })).toBeInTheDocument()
    expect(screen.queryByText(/Déjà écarté/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Je pars sur/)).not.toBeInTheDocument()
  })
})

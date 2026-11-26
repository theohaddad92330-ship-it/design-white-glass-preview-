import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { i18n } from '@/i18n'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #1998 — L'APPELANT : le fil LIT `context.cards`.
 *
 * Le défaut que cette suite tient fermé : l'API calculait, gouvernait,
 * persistait et renvoyait `data.context.cards`, et aucun fichier de
 * `apps/web/src` ne le lisait — un champ de réponse que personne ne lit, le
 * défaut n°1 du dépôt. `CopilotCards.test.tsx` prouve que la carte SAIT se
 * rendre ; seule cette suite-ci prouve qu'on l'APPELLE.
 *
 * Elle tient aussi les deux portes par lesquelles une carte arrive — la fin d'un
 * tour, et la relecture du fil — parce que la seconde est ce qui fait qu'un
 * geste SURVIT au rechargement.
 *
 * Mêmes doubles que `Chat.memory-trace.test.tsx` : cette suite ne mesure ni
 * l'accueil, ni les connecteurs, ni la démonstration.
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

// #1940.7 — le sélecteur « assigner à » d'une carte d'action lit les membres de
// l'espace par `useQuery` (`useWorkspaceMembers`), or ces tests rendent `Chat`
// sans `QueryClientProvider`. Même doctrine que `useBanners`/
// `useMemoryScopeOptions` ci-dessus : la lecture est rendue VIDE, jamais un
// crash — aucun collègue proposable, ce que fait déjà `assignableMembers`
// quand la liste est vide.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
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
// #2896 / #2449.35 — la carte lit le niveau d'action réglé par `useQuery`, sans
// `QueryClientProvider` ici : lecture rendue vide (la carte ne dit alors rien).
vi.mock('@/features/actions/hooks/useActionLevel', () => ({ useActionLevel: () => ({ data: undefined }) }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
// #2783 — `PendingActions` (rendue quand une proposition brute n'a pas de
// carte) lit désormais `useMissionTerms` par `useQuery`, or ce fichier rend
// `Chat` sans `QueryClientProvider` (même doctrine que les mocks ci-dessus).
// `undefined`/`isPending: false` = comportement byte-identique à avant #2783
// pour une proposition sans rapport avec un avenant de mission.
vi.mock('@/features/missions/api', () => ({
  useMissionTerms: () => ({ data: undefined, isPending: false }),
}))

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

const CARD = {
  id: '22222222-2222-4222-8222-222222222222',
  action: null,
  state: 'prepared',
  allowedGestures: ['confirm', 'reject', 'snooze'],
  preview: {
    whatWillHappen: 'Lancer l’analyse de Sopra Steria',
    targetObject: 'Sopra Steria',
    destination: null,
    content: null,
    dataUsed: 'Offre publiée le 2 septembre',
    costCredits: 8,
    connectionUsed: null,
    whatWillNotHappen: 'aucun message ne part',
  },
  result: null,
  snoozedUntil: null,
  expiresAt: null,
  turnId: '11111111-1111-4111-8111-111111111111',
  proposalIndex: 0,
  primary: true,
}

/** La proposition BRUTE du même tour — celle que l'API laisse INTACTE dans
 *  `context.pending_actions` pour les onglets ouverts avant le déploiement. */
const PENDING_ACTION = {
  action: 'enrich_contact',
  contact_id: 'c-1',
  contact_name: 'Claire Meunier',
  organization_name: 'Sopra Steria',
}

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

describe('Chat — les cartes d’Action OS arrivent à l’écran', () => {
  it('un tour qui rend `context.cards` affiche la carte, avec ses boutons', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Je te propose de lancer l’analyse.',
      context: { cards: [CARD] },
    })
    render(<Chat />)
    await send('Analyse Sopra Steria')

    expect(await screen.findByText('Lancer l’analyse de Sopra Steria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
    // #4463 — la carte ne chiffre aucun crédit (le serveur en porte, l'écran ne le dit pas).
    expect(screen.getByRole('region', { name: 'Ce que ça va faire' })).not.toHaveTextContent(/crédit/i)
  })

  /**
   * #2892 (27/09) — recette prod : « Pas de réponse. » s'affichait, PARASITE,
   * devant la carte d'action « Lancer une recherche Découvrir » quand Laura
   * n'avait rien d'autre à dire que la carte elle-même (`reply` vide côté serveur).
   */
  it('#2892 — un tour SANS texte mais AVEC une carte n’affiche pas « Pas de réponse. »', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: '', context: { cards: [CARD] } })
    render(<Chat />)
    await send('Trouve-moi des comptes avec un signal de recrutement')

    expect(await screen.findByText('Lancer l’analyse de Sopra Steria')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('messages.noReply', { ns: 'chat' }))).not.toBeInTheDocument()
  })

  it('#2892 — un tour SANS texte mais AVEC une proposition brute n’affiche pas « Pas de réponse. »', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: '', context: { pending_actions: [PENDING_ACTION] } })
    render(<Chat />)
    await send('Enrichis Claire')

    expect(await screen.findByText(/Enrichir les coordonnées de Claire Meunier/)).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('messages.noReply', { ns: 'chat' }))).not.toBeInTheDocument()
  })

  it('#2892 — un tour SANS texte et SANS carte affiche toujours « Pas de réponse. »', async () => {
    askLauraStreamingMock.mockResolvedValue({ reply: '', context: {} })
    render(<Chat />)
    await send('Une question sans rien en retour')

    expect(await screen.findByText(i18n.t('messages.noReply', { ns: 'chat' }))).toBeInTheDocument()
  })

  it('les cartes REMPLACENT les propositions brutes du même tour — jamais les deux', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Je te propose de lancer l’analyse.',
      context: { cards: [CARD], pending_actions: [PENDING_ACTION] },
    })
    render(<Chat />)
    await send('Analyse Sopra Steria')

    expect(await screen.findByText('Lancer l’analyse de Sopra Steria')).toBeInTheDocument()
    // La carte gouvernée gagne : la proposition brute ne s'affiche pas EN PLUS.
    expect(screen.queryByText(/Enrichir les coordonnées de Claire Meunier/)).not.toBeInTheDocument()
  })

  it('sans carte, les propositions brutes s’affichent toujours — aucun onglet ouvert ne perd son rendu', async () => {
    askLauraStreamingMock.mockResolvedValue({
      reply: 'Je te propose d’enrichir.',
      context: { pending_actions: [PENDING_ACTION] },
    })
    render(<Chat />)
    await send('Enrichis Claire')

    expect(await screen.findByText(/Enrichir les coordonnées de Claire Meunier/)).toBeInTheDocument()
  })

  it('un fil RELU rend ses cartes persistées — l’état survit au rechargement', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-q', role: 'user', content: 'Analyse Sopra Steria' }),
      persistedMessage({
        id: 'm-a',
        role: 'assistant',
        content: 'Je te propose de lancer l’analyse.',
        cards: [{ ...CARD, state: 'executed', allowedGestures: [] }],
      }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    expect(await screen.findByText('Lancer l’analyse de Sopra Steria')).toBeInTheDocument()
    expect(screen.getByText('Exécutée')).toBeInTheDocument()
    // Un état SERVI, pas un `useState` remis à zéro au montage : rien à valider.
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  it('un fil relu SANS carte n’en invente aucune', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-a', role: 'assistant', content: 'Réponse sans carte' }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    await screen.findByText('Réponse sans carte')
    expect(screen.queryByRole('region', { name: 'Ce que ça va faire' })).not.toBeInTheDocument()
  })

  /**
   * #3076 (épopée #2858) — LA CARTE D'OPPORTUNITÉ SURVIT AU RECHARGEMENT.
   *
   * `propose_opportunity_update` est désormais gouvernée côté API
   * (`copilot-card-catalog.ts`) : un fil relu la sert dans `message.cards`,
   * exactement comme n'importe quelle autre carte gouvernée — jamais dans
   * `context.pending_actions` (qui, lui, ne survit jamais à un rechargement,
   * `chat-message-context.ts`). Avant ce lot, cette carte n'existait que là,
   * et disparaissait donc du fil au rechargement (#3076).
   */
  const OPPORTUNITY_CARD = {
    id: '55555555-5555-4555-8555-555555555555',
    action: {
      action: 'propose_opportunity_update',
      project_id: 'p-1',
      project_label: 'RECETTE 1889',
      changes: [{ field: 'stage', previous: 'qualified', next: 'confirmed' }],
      proof: 'Compte rendu du 22/09',
    },
    state: 'prepared',
    allowedGestures: ['confirm', 'reject'],
    preview: {
      whatWillHappen: "Mettre à jour l'opportunité RECETTE 1889.",
      targetObject: 'RECETTE 1889',
      destination: null,
      content: 'Stade : qualified → confirmed',
      dataUsed: 'Compte rendu du 22/09',
      costCredits: 0,
      connectionUsed: null,
      whatWillNotHappen: "Aucun autre champ n'est modifié. Gagné/perdu ne passent pas par cette carte.",
    },
    result: null,
    snoozedUntil: null,
    expiresAt: null,
    turnId: '11111111-1111-4111-8111-111111111112',
    proposalIndex: 0,
    primary: true,
  }

  it('#3076 — un fil RELU rend la carte d’opportunité PERSISTÉE, jamais une proposition brute évaporée', async () => {
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-q', role: 'user', content: 'Prépare la mise à jour de l’opportunité THALES' }),
      persistedMessage({
        id: 'm-a',
        role: 'assistant',
        content: 'Je te propose de mettre à jour l’opportunité.',
        cards: [OPPORTUNITY_CARD],
      }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    expect(await screen.findByText("Mettre à jour l'opportunité RECETTE 1889.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })

  it('#2276.62 — un fil RELU rend le job de Laura de son tour, dans l’état où il en est MAINTENANT', async () => {
    const job = {
      id: '44444444-4444-4444-8444-444444444444',
      state: 'done',
      brief: {
        originalRequest: 'Trouve les décideurs Thales',
        intent: 'Cartographier les décideurs Thales',
        expectedOutcome: 'Dix décideurs',
        scope: { description: 'Thales', accountIds: [], contactIds: [] },
        steps: [
          {
            key: 'read',
            label: 'Relire le dossier',
            capability: 'read_workspace',
            status: 'done',
            startedAt: '2026-09-24T09:00:00.000Z',
            finishedAt: '2026-09-24T09:00:05.000Z',
          },
        ],
      },
      tools: ['read_workspace'],
      validationsRequired: [],
      progress: { done: 1, total: 1 },
      resume: { resumable: false, fromStepKey: null },
      ownerId: '9d359267-0000-4000-8000-000000000001',
      conversationId: 'general',
      turnId: '33333333-3333-4333-8333-333333333331',
      estimatedCredits: 0,
      spentCredits: 0,
      startedAt: '2026-09-24T09:00:00.000Z',
      finishedAt: '2026-09-24T09:00:05.000Z',
      createdAt: '2026-09-24T08:59:00.000Z',
    }
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-a', role: 'assistant', content: 'Voici le plan.', laura_job: job }),
    ])
    locationSearch.current = { conversationId: 'general' }
    render(<Chat />)

    expect(await screen.findByText('Cartographier les décideurs Thales')).toBeInTheDocument()
    expect(screen.getByText('Terminé')).toBeInTheDocument()
  })
})

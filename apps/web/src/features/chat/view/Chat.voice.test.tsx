import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { Chat } from './Chat'
import type * as HomeSuggestions from './laura-home-suggestions'

/**
 * #1939.4 / .9 / .10 / .13 / .14 et 9.3 — le message vocal DANS l'écran `/chat`.
 *
 * Ce que ce fichier prouve : le câblage de l'écran. La transcription arrive dans
 * la saisie (modifiable), rien ne part sans le clic, l'enregistrement voyage avec
 * le message par la persistance EXISTANTE (`createAgentChatMessage`), il ne suit
 * ni un autre fil ni un message suivant, et « Réécouter » n'apparaît que sur une
 * bulle relue qui porte un enregistrement.
 *
 * Le micro lui-même (`VoiceInput`) est DOUBLÉ : ses propres tests couvrent
 * l'enregistreur. Rien ici n'appelle le réseau.
 */

const VOICE_ID = '11111111-1111-4111-8111-111111111111'

const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
const voiceProps = vi.hoisted(() => ({ current: null as null | { conversationKey: string; disabled: boolean } }))

// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` ; ce test rend `Chat` sans `QueryClientProvider`. La lecture
// est VIDE : aucun drapeau posé, donc aucun refus décoré — le cas normal, et
// le comportement byte-identique à celui d'avant le point.
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))

vi.mock('@/features/chat/voice/VoiceInput', () => ({
  VoiceInput: (props: {
    conversationKey: string
    disabled: boolean
    onTranscribed: (result: { text: string; voiceObjectId: string }) => void
  }) => {
    voiceProps.current = { conversationKey: props.conversationKey, disabled: props.disabled }
    return (
      <>
        <button
          type="button"
          onClick={() =>
            props.onTranscribed({
              text: 'Quels signaux sur Airbus ?',
              voiceObjectId: '11111111-1111-4111-8111-111111111111',
            })
          }
        >
          dictée simulée
        </button>
      </>
    )
  },
  // #2434.8/.9/.10/.12/.24/.30 — `VoiceConversation` (rendue à côté du micro
  // de dictée dans `Chat.tsx`) partage cette capacité (`useVoiceAvailability`).
  // Fausse ici : ce fichier ne teste que la dictée, `VoiceConversation.test.tsx`
  // et `useVoiceConversation.test.ts` couvrent le mode conversation.
  useVoiceAvailability: () => false,
  voiceErrorText: () => '',
}))
const playbackMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/chat/voice/voice-api', () => ({
  fetchVoicePlayback: (...args: unknown[]) => playbackMock(...args),
  fetchVoiceStatus: vi.fn().mockResolvedValue(false),
  transcribeVoiceMessage: vi.fn(),
}))

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
  // #1989 — le hook rend aussi les outils branchés (rangée sous la saisie).
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))

const motionComponents = new Map<string, unknown>()
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>
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
  const actual = await importOriginal<typeof HomeSuggestions>()
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
// #1982 — l'écran retire une pièce jointe par ce hook (react-query) : cette suite
// ne mesure pas les pièces jointes, elle double la feuille comme les autres suites de `Chat`.
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

type CreatedMessage = { role: string; content: string; conversationId: string; voiceObjectId?: string }
const createdTurns = () => createMessageMock.mock.calls.map(call => call[0] as CreatedMessage)

function persistedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    account_id: null,
    conversation_id: 'general',
    role: 'user',
    content: 'Message persisté',
    created_at: '2026-09-13T08:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  locationSearch.current = {}
  voiceProps.current = null
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => persistedMessage(args))
  askLauraStreamingMock.mockResolvedValue({ reply: 'Trois signaux cette semaine.' })
})

const composer = () => screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement

async function mounted() {
  render(<Chat />)
  await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
}

describe('#1939.4 / .9 / .10 — la transcription arrive DANS la saisie, et rien ne part sans le clic', () => {
  it('texte transcrit dans la saisie, modifiable ; l’envoi part par la persistance existante, avec l’enregistrement', async () => {
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))
    expect(composer().value).toBe('Quels signaux sur Airbus ?')
    // #1939.10 — transcrire n'est pas envoyer.
    expect(askLauraStreamingMock).not.toHaveBeenCalled()
    expect(createMessageMock).not.toHaveBeenCalled()

    // #1939.9 — le texte se corrige avant de partir.
    fireEvent.change(composer(), { target: { value: 'Quels signaux récents sur Airbus ?' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })

    await waitFor(() =>
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          content: 'Quels signaux récents sur Airbus ?',
          voiceObjectId: VOICE_ID,
        }),
      ),
    )
    // #1939.14 — le tour de Laura est le tour ORDINAIRE : le texte, rien d'autre.
    expect(askLauraStreamingMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Quels signaux récents sur Airbus ?' }),
      expect.anything(),
      expect.anything(),
    )
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'assistant')).toBe(true))
    // #1939.11 — la réponse est du texte, et elle ne porte pas d'enregistrement.
    expect(createdTurns().find(turn => turn.role === 'assistant')).not.toHaveProperty('voiceObjectId')
    expect(await screen.findByText('Trois signaux cette semaine.')).toBeInTheDocument()
  })

  it('un brouillon déjà tapé n’est pas écrasé : la transcription s’ajoute à la suite', async () => {
    await mounted()
    fireEvent.change(composer(), { target: { value: 'Pour le compte Airbus :' } })
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))
    expect(composer().value).toBe('Pour le compte Airbus : Quels signaux sur Airbus ?')
  })

  it('le message SUIVANT, tapé, ne réutilise pas l’enregistrement', async () => {
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'assistant')).toBe(true))

    createMessageMock.mockClear()
    fireEvent.change(composer(), { target: { value: 'Et sur Thales ?' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'user')).toBe(true))
    expect(createdTurns().find(turn => turn.role === 'user')).not.toHaveProperty('voiceObjectId')
  })

  it('saisie vidée à la main : l’enregistrement ne s’attache plus à une autre question', async () => {
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))
    fireEvent.change(composer(), { target: { value: '' } })
    fireEvent.change(composer(), { target: { value: 'Une tout autre question' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'user')).toBe(true))
    expect(createdTurns().find(turn => turn.role === 'user')).not.toHaveProperty('voiceObjectId')
  })

  it('pendant un envoi, le micro est inactif', async () => {
    askLauraStreamingMock.mockReturnValue(new Promise(() => {}))
    await mounted()
    expect(voiceProps.current?.disabled).toBe(false)
    fireEvent.change(composer(), { target: { value: 'Une question' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(voiceProps.current?.disabled).toBe(true))
  })
})

describe('#1939.8 — changement de fil', () => {
  it('le micro reçoit la clé du fil ACTIF, et l’enregistrement ne suit pas dans un autre fil', async () => {
    locationSearch.current = { conversationId: 'fil-a' }
    const view = render(<Chat />)
    await waitFor(() => expect(voiceProps.current?.conversationKey).toBe('fil-a'))
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))

    locationSearch.current = { conversationId: 'fil-b' }
    view.rerender(<Chat />)
    await waitFor(() => expect(voiceProps.current?.conversationKey).toBe('fil-b'))
    await waitFor(() =>
      expect(listMessagesMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'fil-b' })),
    )

    await act(async () => {
      fireEvent.change(composer(), { target: { value: 'Question du fil B' } })
    })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'user')).toBe(true))
    const userTurn = createdTurns().find(turn => turn.role === 'user')
    expect(userTurn?.conversationId).toBe('fil-b')
    expect(userTurn).not.toHaveProperty('voiceObjectId')
  })
})

describe('9.3 — « Réécouter » sur la question qui VIENT d’être envoyée, sans relire le fil', () => {
  /** Ce que rend le vrai serveur : l'id du message, et l'enregistrement qu'IL a accepté de rattacher. */
  function serverEcho() {
    createMessageMock.mockImplementation(async (args: Record<string, unknown>) =>
      persistedMessage({
        id: args.role === 'user' ? 'm-envoye' : 'm-reponse',
        role: args.role,
        content: args.content,
        voice_object_id: (args.voiceObjectId as string | undefined) ?? null,
      }),
    )
  }

  it('la bulle dictée reçoit l’id rendu par la persistance et propose la réécoute', async () => {
    serverEcho()
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))
    fireEvent.keyDown(composer(), { key: 'Enter' })

    const replay = await screen.findByRole('button', { name: 'Réécouter ce message vocal' })
    playbackMock.mockResolvedValue({
      url: 'https://stockage.example/objet?jeton=frais',
      expiresAt: '2026-09-13T10:05:00Z',
      fileName: 'message-vocal.webm',
    })
    fireEvent.click(replay)
    await waitFor(() => expect(playbackMock).toHaveBeenCalledWith('m-envoye'))
    await waitFor(() => expect(document.querySelector('audio')).not.toBeNull())
  })

  it('une question TAPÉE, persistée avec un id, ne propose aucune réécoute', async () => {
    serverEcho()
    await mounted()
    fireEvent.change(composer(), { target: { value: 'Question tapée' } })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'assistant')).toBe(true))
    expect(screen.queryByRole('button', { name: 'Réécouter ce message vocal' })).not.toBeInTheDocument()
  })

  it('le serveur n’a PAS rattaché l’enregistrement (`voice_object_id: null`) : aucune réécoute promise', async () => {
    createMessageMock.mockImplementation(async (args: Record<string, unknown>) =>
      persistedMessage({ id: 'm-refuse', role: args.role, content: args.content, voice_object_id: null }),
    )
    await mounted()
    fireEvent.click(screen.getByRole('button', { name: 'dictée simulée' }))
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(createdTurns().some(turn => turn.role === 'assistant')).toBe(true))
    expect(screen.queryByRole('button', { name: 'Réécouter ce message vocal' })).not.toBeInTheDocument()
  })
})

describe('9.3 — « Réécouter » sur une bulle relue qui porte un enregistrement, jamais ailleurs', () => {
  it('seule la question dictée propose la réécoute', async () => {
    locationSearch.current = { conversationId: 'general' }
    listMessagesMock.mockResolvedValue([
      persistedMessage({ id: 'm-voice', role: 'user', content: 'Question dictée', voice_object_id: VOICE_ID }),
      persistedMessage({ id: 'm-typed', role: 'user', content: 'Question tapée', voice_object_id: null }),
      persistedMessage({ id: 'm-reply', role: 'assistant', content: 'Réponse de Laura' }),
    ])
    render(<Chat />)
    await screen.findByText('Question dictée')
    expect(screen.getAllByRole('button', { name: 'Réécouter ce message vocal' })).toHaveLength(1)
  })

  it('une API antérieure au champ (pas de `voice_object_id`) : aucune réécoute, et le fil s’affiche', async () => {
    locationSearch.current = { conversationId: 'general' }
    listMessagesMock.mockResolvedValue([persistedMessage({ id: 'm-old', role: 'user', content: 'Ancienne question' })])
    render(<Chat />)
    await screen.findByText('Ancienne question')
    expect(screen.queryByRole('button', { name: 'Réécouter ce message vocal' })).not.toBeInTheDocument()
  })
})

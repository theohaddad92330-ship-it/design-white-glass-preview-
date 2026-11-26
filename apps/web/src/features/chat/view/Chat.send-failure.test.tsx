import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-error'

/**
 * #1957.6 — AU PLAFOND (OU À TOUTE AUTRE PANNE D'ENVOI), LE MESSAGE TAPÉ RESTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, `handleSend` faisait `setInput('')` AVANT même de savoir si
 * l'envoi allait aboutir (`Chat.tsx`) : un refus de quota, une coupure réseau
 * ou une session morte vidaient la question tapée, qui n'avait alors AUCUNE
 * chance d'être ni relue ni renvoyée sans la retaper entièrement.
 *
 * Le mock reproduit la vraie forme de l'échec : `askLauraStreaming` REJETTE
 * (elle n'a pas répondu, elle n'a pas de forme de repli) — exactement ce que
 * `persistTurn` NE fait jamais (best-effort par contrat, voir son docblock
 * dans `Chat.tsx`), ce qui est précisément pourquoi ce `catch` ne peut être
 * atteint QUE lorsqu'aucune réponse n'est arrivée.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

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

// #1960.13 — les bannières de l'opérateur, seule source d'un « incident
// connu ». Réglable par test : vide = aucun drapeau posé (le cas normal).
const activeBannersMock = vi.fn()
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => activeBannersMock() }))

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
  // `resetAllMocks` (pas `clearAllMocks`) : les `mockRejectedValueOnce` /
  // `mockResolvedValueOnce` d'un test précédent restent en FILE tant qu'ils
  // n'ont pas été consommés — `clearAllMocks` ne les vide pas, et un test qui
  // échoue avant de les consommer les ferait fuir sur le test suivant.
  vi.resetAllMocks()
  localStorage.clear()
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
  // #1960.13 — par défaut AUCUN incident déclaré : chaque refus reste ce qu'il
  // était, à l'octet près.
  activeBannersMock.mockReturnValue({ data: [] })
})

/** Une bannière `incident` telle que l'opérateur la publie (#1960.13). */
function incidentBanner(body: string) {
  return {
    id: 'b1',
    kind: 'incident',
    variant: 'critical',
    title: { fr: 'Incident', en: 'Incident' },
    body: { fr: body, en: body },
  }
}

async function sendMessage(text: string) {
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

/** Le fil, hors de l'annonce `sr-only` — qui répète le même texte pour le lecteur d'écran. */
function chatMain() {
  return screen.getByRole('main', { name: 'Conversation avec Laura' })
}

/**
 * Le texte d'une BULLE du fil, jamais celui du `<textarea>` — jsdom laisse
 * `getByText` matcher un `<textarea>` par son contenu, ce qui ferait passer un
 * texte simplement RESTAURÉ dans la saisie pour une bulle du fil.
 */
function bubbleTexts(text: string) {
  return within(chatMain()).queryAllByText(text, { ignore: 'textarea, script, style' })
}

describe('#1957.6 — au plafond, le message tapé reste', () => {
  it('un refus de quota (429) rend le texte à la saisie', async () => {
    askLauraStreamingMock.mockRejectedValueOnce(new ApiError('Plafond quotidien atteint.', 429))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')

    await waitFor(() => expect(within(chatMain()).getByText(/Plafond quotidien atteint/)).toBeInTheDocument())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Analyse Airbus')
  })

  it('une coupure réseau rend aussi le texte à la saisie', async () => {
    askLauraStreamingMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Trouve les décideurs chez Thales')

    await waitFor(() => expect(within(chatMain()).getByText(/Connexion perdue/)).toBeInTheDocument())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('Trouve les décideurs chez Thales')
  })

  it('ne remplace PAS un texte déjà retapé pendant l’attente de l’échec', async () => {
    let rejectSend: (error: unknown) => void = () => {}
    askLauraStreamingMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSend = reject
        }),
    )
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    const textarea = screen.getByPlaceholderText('Écris ton message...')
    fireEvent.change(textarea, { target: { value: 'Première question' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Le composeur est déjà vide (effacement optimiste) : l'utilisateur tape
    // AUTRE CHOSE pendant que la première question est encore en vol.
    await waitFor(() => expect(textarea).toHaveValue(''))
    fireEvent.change(textarea, { target: { value: 'Deuxième question, tapée entre-temps' } })

    rejectSend(new ApiError('Plafond quotidien atteint.', 429))

    await waitFor(() => expect(within(chatMain()).getByText(/Plafond quotidien atteint/)).toBeInTheDocument())
    // Le texte retapé n'a PAS été écrasé par la restauration de « Première question ».
    expect(textarea).toHaveValue('Deuxième question, tapée entre-temps')
  })

  it('renvoyer après un échec ne montre le message QU’UNE fois — pas de bulle en double', async () => {
    askLauraStreamingMock
      .mockRejectedValueOnce(new ApiError('Plafond quotidien atteint.', 429))
      .mockResolvedValueOnce({ reply: 'Voici trois comptes prioritaires.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Quels comptes prioriser ?')
    await waitFor(() => expect(within(chatMain()).getByText(/Plafond quotidien atteint/)).toBeInTheDocument())

    // Une seule bulle utilisateur pendant l'échec : la bulle optimiste a été
    // retirée. `ignore` exclut le `<textarea>` : jsdom le laisse autrement
    // matcher par son CONTENU (le texte restauré par la ligne suivante).
    expect(bubbleTexts('Quels comptes prioriser ?')).toHaveLength(0)

    // Renvoi, avec le texte rendu par la restauration.
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    expect(textarea).toHaveValue('Quels comptes prioriser ?')
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Voici trois comptes prioritaires.')).toBeInTheDocument())
    // La question n'apparaît qu'UNE fois dans le fil, malgré la tentative échouée.
    expect(bubbleTexts('Quels comptes prioriser ?')).toHaveLength(1)
  })

  it('un envoi RÉUSSI, lui, efface bien le brouillon (pas de sur-restauration)', async () => {
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Réponse normale.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Une question qui aboutit')

    await waitFor(() => expect(screen.getByText('Réponse normale.')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('')
  })
})

/**
 * #1960.13 — L'INCIDENT DÉCLARÉ ARRIVE JUSQU'À L'ÉCRAN.
 *
 * `declared-incident.test.ts` garde la lecture du drapeau et la composition du
 * texte ; ces deux tests-ci gardent l'APPELANT — que `Chat` lise vraiment les
 * bannières de l'opérateur et en décore le refus. C'est le maillon qui manque
 * le plus souvent dans ce dépôt : du code juste que personne n'appelle.
 */
describe('#1960.13 — un incident DÉCLARÉ décore le refus, et lui seul', () => {
  it('avec un drapeau posé, une panne (500) dit qu’on la connaît', async () => {
    activeBannersMock.mockReturnValue({ data: [incidentBanner('la recherche de contacts est ralentie.')] })
    askLauraStreamingMock.mockRejectedValueOnce(new ApiError('Boom', 500))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')

    await waitFor(() =>
      expect(
        within(chatMain()).getByText(/Incident connu, en cours de résolution : la recherche de contacts est ralentie/),
      ).toBeInTheDocument(),
    )
  })

  it('LE TÉMOIN — un plafond atteint n’est PAS une panne, et ne le dit pas', async () => {
    // Un produit qui refuse correctement n'est pas en panne : coller « incident
    // connu » ferait attendre un rétablissement qui ne viendra pas, et ferait
    // taire quelqu'un qui aurait dû nous écrire.
    activeBannersMock.mockReturnValue({ data: [incidentBanner('la recherche de contacts est ralentie.')] })
    askLauraStreamingMock.mockRejectedValueOnce(new ApiError('Plafond quotidien atteint.', 429))
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')

    await waitFor(() => expect(within(chatMain()).getByText(/Plafond quotidien atteint/)).toBeInTheDocument())
    expect(within(chatMain()).queryByText(/Incident connu/)).not.toBeInTheDocument()
  })
})

/**
 * #2519 — « QUAND LAURA AFFICHE UNE ERREUR DE CONNEXION, UN BOUTON POUR LA RELANCER ».
 *
 * Mesuré : la bulle d'échec portait le menu « Réessayer » de toute réponse, qui
 * repose la question qui PRÉCÈDE la bulle — or la question échouée venait d'être
 * retirée du fil. Le clic reposait donc la question D'AVANT (ou rien, sur un fil
 * neuf). La bulle d'échec porte désormais SA question et un bouton « Relancer »
 * qui la rejoue telle quelle, sans message à retaper.
 */
describe('#2519 — « Relancer » sur une réponse en erreur de connexion', () => {
  const relaunchButton = () => within(chatMain()).queryByRole('button', { name: 'Relancer' })
  const turnMessages = () =>
    askLauraStreamingMock.mock.calls.map(call => call[0] as { message: string; history: { content: string }[] })
  const savedUserQuestions = () =>
    createMessageMock.mock.calls
      .map(call => call[0] as { role: string; content: string })
      .filter(m => m.role === 'user')

  it('une coupure réseau offre « Relancer », qui rejoue la MÊME question', async () => {
    askLauraStreamingMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ reply: 'Voici les décideurs de Thales.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Trouve les décideurs chez Thales')
    await waitFor(() => expect(relaunchButton()).toBeInTheDocument())

    fireEvent.click(relaunchButton()!)

    await waitFor(() => expect(screen.getByText('Voici les décideurs de Thales.')).toBeInTheDocument())
    expect(turnMessages().map(turn => turn.message)).toEqual([
      'Trouve les décideurs chez Thales',
      'Trouve les décideurs chez Thales',
    ])
    // La bulle d'échec a laissé sa place ; la question n'apparaît qu'une fois.
    expect(within(chatMain()).queryByText(/Connexion perdue/)).not.toBeInTheDocument()
    expect(bubbleTexts('Trouve les décideurs chez Thales')).toHaveLength(1)
    // Le texte rendu à la saisie par l'échec est parti avec la relance : pas de double envoi possible.
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('')
    // Le texte de l'échec n'est jamais relu par Laura comme une de ses réponses.
    expect(
      turnMessages()[1]
        ?.history.map(entry => entry.content)
        .join(' '),
    ).not.toMatch(/Connexion perdue/)
  })

  it('un flux coupé APRÈS acceptation : la question déjà enregistrée ne l’est pas une 2e fois', async () => {
    createMessageMock.mockImplementation(async (body: { role: string }) => ({ id: `saved-${body.role}` }))
    askLauraStreamingMock
      .mockImplementationOnce(async (_request: unknown, handlers: { onAccepted?: () => void }) => {
        handlers.onAccepted?.()
        throw new ApiError('La réponse s’est interrompue avant la fin.', 0)
      })
      .mockResolvedValueOnce({ reply: 'Réponse complète.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')
    await waitFor(() => expect(relaunchButton()).toBeInTheDocument())
    // L'échec dit ce qui s'est passé : la question EST partie.
    expect(within(chatMain()).getByText(/coupée en route/)).toBeInTheDocument()
    await waitFor(() => expect(savedUserQuestions()).toHaveLength(1))

    fireEvent.click(relaunchButton()!)

    await waitFor(() => expect(screen.getByText('Réponse complète.')).toBeInTheDocument())
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(2)
    // Le plafond compte les questions ENREGISTRÉES : relancer ne la compte pas deux fois.
    expect(savedUserQuestions()).toHaveLength(1)
  })

  // #3506 (recette prod 02/10) — « après 2 envois, le 1er message disparaît du
  // fil, remplacé par “La réponse a été coupée en route” ».
  it('un flux coupé APRÈS acceptation : la question envoyée RESTE dans le fil et la saisie est vide', async () => {
    createMessageMock.mockImplementation(async (body: { role: string }) => ({ id: `saved-${body.role}` }))
    askLauraStreamingMock
      .mockImplementationOnce(async (_request: unknown, handlers: { onAccepted?: () => void }) => {
        handlers.onAccepted?.()
        throw new ApiError('La réponse s’est interrompue avant la fin.', 0)
      })
      .mockResolvedValueOnce({ reply: 'Réponse complète.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')
    await waitFor(() => expect(within(chatMain()).getByText(/coupée en route/)).toBeInTheDocument())
    // Le message ENVOYÉ reste dans le fil, au-dessus de la bulle d'échec.
    expect(bubbleTexts('Analyse Airbus')).toHaveLength(1)
    // Il est parti : la saisie ne garde pas l'ancien texte.
    expect(screen.getByPlaceholderText('Écris ton message...')).toHaveValue('')

    fireEvent.click(relaunchButton()!)
    await waitFor(() => expect(screen.getByText('Réponse complète.')).toBeInTheDocument())
    // Relancer ne duplique pas la question.
    expect(bubbleTexts('Analyse Airbus')).toHaveLength(1)
  })

  it.each([
    ['un refus au plafond (429)', new ApiError('Plafond quotidien atteint.', 429), /Plafond quotidien atteint/],
    ['une session morte (401)', new ApiError('Unauthorized', 401), /session a expiré/],
  ])('NON — %s n’offre pas « Relancer »', async (_label, error, visible) => {
    askLauraStreamingMock.mockRejectedValueOnce(error)
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')

    await waitFor(() => expect(within(chatMain()).getByText(visible)).toBeInTheDocument())
    expect(relaunchButton()).not.toBeInTheDocument()
  })
})

/**
 * R5-FIX (recette prod 14/10) — un fil reste « En attente » dans la barre
 * latérale alors que ses réponses sont bien rendues à l'écran.
 *
 * CAUSE : `persistTurn` (Chat.tsx) est VOLONTAIREMENT best-effort — « ne
 * rejette jamais » (voir le docblock en tête de ce fichier) — donc un échec
 * d'écriture de la réponse de l'assistant rend `savedReply: null` EN
 * SILENCE : la bulle s'affiche quand même (déjà en état local avant l'appel),
 * mais `chat_messages` ne reçoit jamais cette ligne. Le statut du fil
 * (`threadStatusOf`, lu sur `last_message_role` côté serveur) reste alors
 * bloqué sur « en attente » — pas un bug d'affichage, un vrai échec
 * d'enregistrement jamais nommé à l'utilisateur.
 */
describe('R5-FIX — un échec D’ENREGISTREMENT de la réponse (jamais du modèle) est nommé', () => {
  it('la réponse s’affiche quand même, mais le témoin dit qu’elle n’est pas enregistrée', async () => {
    createMessageMock.mockImplementation(async (body: { role: string }) => {
      if (body.role === 'assistant') throw new ApiError('Boom', 500)
      return { id: `saved-${body.role}` }
    })
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Réponse complète.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')

    expect(await screen.findByText('Réponse complète.')).toBeInTheDocument()
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(vi.mocked(toast.error).mock.calls.at(-1)?.[0]).toMatch(/pas.*enregistr/i)
  })

  it('aucun témoin quand l’enregistrement réussit (chemin normal, inchangé)', async () => {
    createMessageMock.mockImplementation(async (body: { role: string }) => ({ id: `saved-${body.role}` }))
    askLauraStreamingMock.mockResolvedValueOnce({ reply: 'Réponse complète.' })
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    await sendMessage('Analyse Airbus')

    expect(await screen.findByText('Réponse complète.')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

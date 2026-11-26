import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { splitReplyBlocks, type ReplyBlock } from '@bellum/contracts'
import { DEMO_CHAT_PROMPTS } from '@/features/demo/demo-chat-script'

/** Les blocs `bellum-block` d'une réponse scriptée — même lecture que `demo-turn.test.ts`. */
function blocksOf(answer: string): ReplyBlock[] {
  return splitReplyBlocks(answer).flatMap(segment => (segment.kind === 'block' ? [segment.block] : []))
}

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
 */
// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` ; ce test rend `Chat` sans `QueryClientProvider`. La lecture
// est VIDE : aucun drapeau posé, donc aucun refus décoré — le cas normal, et
// le comportement byte-identique à celui d'avant le point.
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))

vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
}))

/**
 * EN DÉMONSTRATION, C'EST LE MOTEUR QUI CHANGE — PAS L'ÉCRAN. #1320.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER REMPLACE
 * ─────────────────────────────────────────────────────────────────────────────
 * `DemoChat.test.tsx`, qui gardait une coque parallèle de 206 lignes. Louis l'a
 * tranché le 03/09/2026 : « coque RÉELLE, conversation VIDE ; `isDemo` doit
 * choisir le MOTEUR, plus l'écran ».
 *
 * Les deux invariants de l'ancien fichier survivent, parce qu'ils n'étaient pas
 * liés à la coque :
 *
 *  1. **Aucun appel réseau.** Le lien de démonstration part à des inconnus, et
 *     chaque message libre serait un appel Claude facturé sur un espace que
 *     personne ne surveille.
 *  2. **Une question du script reçoit SA réponse** — jamais celle d'une autre.
 *
 * Et deux invariants NEUFS, qui sont le sujet de l'issue :
 *
 *  3. **La coque est celle du produit** : la colonne de conversations, la
 *     portée, la saisie ouverte — plus une bulle et un champ grisé.
 *  4. **Le fil démarre VIDE.** L'ancienne démonstration ouvrait sur un échange
 *     déjà tenu ; c'est ce que Louis a retiré.
 *
 * ⚠️ Ce fichier SAIT DIRE NON : remettre `askLaura` sur le chemin de la
 * démonstration fait tomber trois de ses tests — l'espion de la porte unique
 * verrait l'appel partir.
 */
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// ⚠️ Le Proxy MÉMORISE ses composants : sans cache, chaque accès rend une
// closure neuve, React démonte le sous-arbre entier et l'état local part avec.
// Piège déjà payé sur vingt-deux fichiers de ce dépôt.
const motionComponents = new Map<string, ElementType>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: unknown, prop: string) => {
        if (typeof prop !== 'string') return undefined
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

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ search: {} }),
  useNavigate: () => navigateMock,
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
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
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// #1940.4 — l'auteur des bulles lit le profil (react-query) : même double que le prénom.
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false }),
}))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => <span /> }))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [] }, isLoading: false, isError: false }),
}))
// #1600 — `useLauraHomeContext` compose `useConsultants` et une lecture du
// pipeline partenaire, toutes deux via react-query. La démonstration ne les
// LIT jamais (elle rend `DemoSuggestionRow`, jamais l'accueil de Laura), mais
// `MessagesArea` appelle le hook sans condition : ce fichier le double comme
// il double déjà `useAccounts`/`useTeam` ci-dessus.
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return {
    ...actual,
    useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }),
  }
})
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
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
// #4269.1 — `AccountRankingCard` lit le devis du lot par `useQueries` (GA-86), qui exige un
// `QueryClientProvider` absent de ce harnais : en démo le devis n'est de toute façon pas lu.
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<object>()),
  useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => ({ data: undefined })),
}))
// La persistance du fil a sa propre suite. Elle est neutralisée ici pour que ce
// test ne parte pas chercher le réseau au montage — ce qui rendrait l'espion de
// `fetch` inutilisable pour ce qu'il doit VRAIMENT prouver.
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: vi.fn().mockResolvedValue([]),
  createAgentChatMessage: vi.fn().mockResolvedValue({}),
  listAgentChatHistory: vi.fn().mockResolvedValue([]),
}))

// ⚠️ C'EST LE DRAPEAU QUI FAIT TOUT LE TEST : l'écran est le même, seule cette
// valeur change.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => true }))

/**
 * LA PORTE UNIQUE, SOUS SURVEILLANCE.
 *
 * On n'espionne pas `fetch` : le harnais global le remplace déjà par un double,
 * et l'empiler produit un troisième `fetch` qui ne dit plus rien de fiable.
 *
 * On surveille `askLauraStreaming`, ce qui est PLUS précis : GA-237 garantit
 * qu'aucun autre fichier de `apps/web/src` n'écrit le chemin `/ia/chat`.
 * « `askLauraStreaming` n'a pas été appelée » veut donc dire, mécaniquement,
 * « aucun appel Claude n'est parti » — et c'est exactement la promesse du
 * lien de démonstration. LOT STREAM (12/09/2026) : c'est elle, et non
 * `askLaura`, que l'écran `/chat` appelle désormais pour un tour réel — la
 * garder sous surveillance sans la renommer aurait laissé cette suite verte
 * pour une mauvaise raison (elle n'aurait plus rien regardé).
 */
const askLaura = vi.fn()
const askLauraStreaming = vi.fn()
vi.mock('../api/laura-turn', () => ({
  askLaura: (...args: unknown[]) => askLaura(...args),
  askLauraStreaming: (...args: unknown[]) => askLauraStreaming(...args),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

const { Chat, DemoSuggestionRow } = await import('./Chat')
const { createAgentChatMessage } = await import('../api/agentChatApi')

beforeEach(() => {
  askLaura.mockClear()
  askLauraStreaming.mockClear()
  vi.mocked(createAgentChatMessage).mockClear()
  navigateMock.mockClear()
})

describe('/chat en espace de démonstration', () => {
  it('rend la COQUE RÉELLE — plus la bulle et sa saisie grisée', () => {
    render(<Chat />)
    // L'entête du vrai copilote, et une saisie OUVERTE : c'est tout le grief de
    // l'issue (« une image beaucoup trop pauvre de Laura »).
    // #1600 — l'accueil de Laura a remplacé l'ancien titre fixe.
    // #3884.1 — ce fallback ne pose plus sa propre question (recette 08/10/2026).
    expect(screen.getByText(/Je peux travailler sur ton portefeuille/)).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Écris ton message...')
    expect(input).toBeInTheDocument()
    expect(input).not.toBeDisabled()
  })

  it('ouvre sur une conversation VIDE — plus un échange déjà tenu', () => {
    render(<Chat />)
    // L'ancienne démonstration affichait `DEMO_CHAT_HISTORY` avant tout clic.
    // Louis l'a retiré : on entre sur un fil neuf, avec ses amorces.
    expect(screen.queryByText(/Sur SNCF, par où je commence/)).not.toBeInTheDocument()
  })

  it('propose les questions du script comme amorces', () => {
    render(<Chat />)
    // Au moins la première : le composeur borne l'affichage à six (#1321.2), et
    // c'est l'ACCÈS qui compte ici, pas le compte exact.
    expect(screen.getByRole('button', { name: DEMO_CHAT_PROMPTS[0]!.question })).toBeInTheDocument()
  })

  // GA-30 — cibles tactiles ≥ 44 px en pointeur grossier. jsdom ne met RIEN en
  // page : impossible de mesurer un pixel réel ici, donc on vérifie la classe
  // qui PRODUIT les 44 px (l'idiome du dépôt, `pointer-coarse:min-h-11`,
  // partagé par `LauncherExamples`). La mesure réelle reste due en recette.
  //
  // Rendu directement (pas `<Chat />`) : le script de démonstration réel ne
  // compte que 6 amorces, jamais assez pour faire apparaître « voir plus » —
  // ce test-ci a besoin des DEUX pastilles, donc il fournit son propre jeu.
  it('les pastilles de démo — amorce ET « voir plus » — portent pointer-coarse:min-h-11', () => {
    const suggestions = Array.from({ length: 8 }, (_, i) => ({
      label: `Amorce ${i}`,
      prompt: `Amorce ${i}`,
    }))
    render(<DemoSuggestionRow suggestions={suggestions} onPrompt={vi.fn()} />)

    const suggestion = screen.getByRole('button', { name: 'Amorce 0' })
    expect(suggestion.className).toMatch(/pointer-coarse:min-h-11/)

    // 8 fournies, 6 visibles (#1321.2) : le bouton « + 2 autres amorces » est
    // donc bien à l'écran.
    const showMore = screen.getByRole('button', { name: /amorces/ })
    expect(showMore.className).toMatch(/pointer-coarse:min-h-11/)
  })

  it('répond avec la réponse SCRIPTÉE, et ne fait AUCUN appel', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: DEMO_CHAT_PROMPTS[0]!.question }))

    // Un extrait de la réponse, lu dans le script plutôt qu'écrit en dur : le
    // texte parle de sociétés réelles et sera réécrit, la garantie ne bouge pas.
    const excerpt = DEMO_CHAT_PROMPTS[0]!.answer.split('\n')[0]!.slice(0, 40)
    await waitFor(() =>
      expect(screen.getByText(new RegExp(excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument(),
    )
    // LE point du fichier : zéro appel Claude sur le lien qui part à des inconnus.
    expect(askLaura).not.toHaveBeenCalled()
    expect(askLauraStreaming).not.toHaveBeenCalled()
  })

  // #1942.4 — le bandeau (`DemoModeBanner`) dit « aucune analyse réelle »,
  // mais RIEN n'empêchait `persistTurn` d'écrire la question et la réponse
  // scriptées dans le fil réel : un espace de démo est PARTAGÉ et LEASÉ
  // (`DEMO_POOL_SIZE`, `DEMO_LEASE_TTL_MINUTES`), donc une conversation
  // laissée derrière soi pouvait survivre à la personne suivante qui loue
  // le même espace.
  it("#1942.4 — n'écrit RIEN dans le fil (aucun appel à createAgentChatMessage)", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: DEMO_CHAT_PROMPTS[0]!.question }))

    const excerpt = DEMO_CHAT_PROMPTS[0]!.answer.split('\n')[0]!.slice(0, 40)
    await waitFor(() =>
      expect(screen.getByText(new RegExp(excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument(),
    )
    expect(createAgentChatMessage).not.toHaveBeenCalled()
  })

  it('dessine le graphe de la question qui en porte un, lisible sans la couleur', async () => {
    const withChart = DEMO_CHAT_PROMPTS.find(p => p.chart)!
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: withChart.question }))

    await waitFor(() => expect(screen.getByText(withChart.chart!.title)).toBeInTheDocument())
    for (const bar of withChart.chart!.bars) {
      expect(screen.getByText(bar.label)).toBeInTheDocument()
      // Libellé ET valeur en toutes lettres : un graphe qui ne se lit qu'à la
      // couleur ne se lit pas.
      expect(screen.getByRole('img', { name: new RegExp(`${bar.label}.*${bar.value}`) })).toBeInTheDocument()
    }
    expect(askLaura).not.toHaveBeenCalled()
    expect(askLauraStreaming).not.toHaveBeenCalled()
  })

  it('une question HORS script dit ce qui se passe, elle n’invente rien', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.type(screen.getByPlaceholderText('Écris ton message...'), 'Quel est le chiffre d’affaires de SNCF ?')
    await user.keyboard('{Enter}')

    // Un paragraphe plausible fabriqué pour un prospect serait de la donnée
    // fictive au pire endroit possible. La réponse dit qu'elle est préparée.
    await waitFor(() => expect(screen.getByText(/réponses sont préparées/i)).toBeInTheDocument())
    expect(askLaura).not.toHaveBeenCalled()
    expect(askLauraStreaming).not.toHaveBeenCalled()
  })

  // #3434 (recette prod 01/10) — « Analyse Decathlon. » en démo : le fil
  // restait sur l'écran vide alors que l'annonce a11y disait « Laura a
  // répondu ». En démo RIEN n'est écrit au serveur : poser le fil dans l'URL
  // (#3367) le faisait relire VIDE, donc « perdu ». Le fil de démo reste en
  // état React, l'adresse ne porte pas une conversation qui n'existe pas.
  it('#3434 — « Analyse Decathlon. » reste affiché, et le fil de démo n’est pas posé dans l’URL', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.type(screen.getByPlaceholderText('Écris ton message...'), 'Analyse Decathlon.')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByText(/réponses sont préparées/i)).toBeInTheDocument())
    expect(screen.getByText('Analyse Decathlon.')).toBeInTheDocument()
    expect(createAgentChatMessage).not.toHaveBeenCalled()
    const urlWrites = navigateMock.mock.calls.filter(
      ([target]) => (target as { search?: { conversationId?: string } }).search?.conversationId,
    )
    expect(urlWrites).toEqual([])
  })

  it('#1914 — copier une réponse à cartes copie du TEXTE, jamais la clôture ni son JSON', async () => {
    // #2429.13 (compagnon démo) — `p-message` porte désormais aussi une carte
    // (`approach`), donc elle n'est plus la seule ni la première à contenir un
    // bloc `bellum-block` : on cible le classement (`account_ranking`), celui
    // que cette assertion vérifie réellement.
    const withCards = DEMO_CHAT_PROMPTS.find(p => blocksOf(p.answer).some(b => b.type === 'account_ranking'))!
    // `userEvent.setup()` installe son propre presse-papier : on relit ce qui y a été écrit.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: withCards.question }))
    await user.click(await screen.findByRole('button', { name: 'Copier la réponse' }))

    const copied = await navigator.clipboard.readText()
    expect(copied).toContain('1. SNCF')
    // #3707.5 — l'absence se dit UNE fois, dans la note, et la copie la garde ; plus de ligne « non mesuré » par colonne.
    expect(copied).toContain('Non évalué, faute de source : les ESN en place sur le périmètre')
    expect(copied).not.toContain('— non mesuré')
    expect(copied).not.toContain('```')
    expect(copied).not.toContain('"type"')
  })
})

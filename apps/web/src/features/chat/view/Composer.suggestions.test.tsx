import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Chat } from './Chat'
import { ChatTopSlotProvider } from './chat-top-slot'

/**
 * Les amorces remontent DANS la ligne d'outils du composer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI (Louis, 02/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Mets les boutons de commandes sur la même ligne que insérer, identifier
 * quelqu'un, cible du message, qu'on perde moins de place. »
 *
 * Sur un écran de 1 440 px, les treize amorces s'enroulaient sur DEUX rangées
 * au-dessus de la saisie — ~90 px pris en permanence, juste au-dessus d'une
 * ligne d'outils à moitié vide. Deux bandes horizontales pour deux gestes qui
 * se font au même moment.
 *
 * Elles rejoignent donc la ligne qui porte déjà la portée, le trombone et le
 * « @ » : une seule ligne, qui DÉFILE (le nombre d'amorces dépend du compte
 * ouvert, donc aucune largeur ne se devine), et un « Voir tout » fixe au bord
 * qui mène à la bibliothèque de commandes — laquelle existe déjà, se cherche,
 * et n'est pas recopiée ici (loi 4 du tome 7).
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// L'écran lit maintenant le prénom du profil pour son accueil. Ce test ne
// mesure pas l'accueil : il double la feuille, ce qui évite d'entraîner tout
// le client d'API dans un test de composer.
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

// #2522 — le double n'était `null` sous AUCUNE forme : « Voir tout » contrôle
// désormais ce tiroir depuis l'extérieur (`open`/`onOpenChange`), et le test
// qui le prouve a besoin de voir le catalogue apparaître quand `open` est vrai
// — un double qui reste toujours `null` ne pourrait jamais dire NON.
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({
  CommandDrawerButton: ({ open }: { open?: boolean }) =>
    open ? (
      <div role="dialog" aria-label="Catalogue des commandes">
        {[
          'Fixture — analyser une entreprise',
          'Fixture — préparer un rendez-vous',
          'Fixture — rédiger une relance',
          'Fixture — matcher le vivier',
          'Fixture — voir un territoire',
          'Fixture — mettre le CRM à jour',
          'Fixture — réécrire un CV',
          'Fixture — enrichir un contact',
        ].map(label => (
          <p key={label}>{label}</p>
        ))}
      </div>
    ) : null,
}))
// #2451.9 — le composeur lit le mode par défaut de l'espace par `useQuery`
// (`GET /workspaces/laura-mode`), or ce fichier rend `Chat` sans
// `QueryClientProvider`. Même leçon que le menu « + » juste en dessous :
// `undefined` = comportement byte-identique à avant #2451.9.
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
 */
/** #1909 — les familles branchées se règlent par test : elles décident des amorces proposées. */
const capabilities = vi.hoisted(() => ({ families: [] as string[] }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: capabilities.families, tools: [], isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// #1940.4 — l'auteur des bulles lit le profil (react-query) : même double que le prénom.
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
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
// #1600 — `useLauraHomeContext` compose `useConsultants` et une lecture du
// pipeline partenaire, toutes deux via react-query : ce fichier mesure la
// rangée de la démonstration/du composer, pas l'accueil de Laura — même
// geste que pour `useAccounts`/`useTeam` ci-dessus.
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return {
    ...actual,
    useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }),
  }
})
// #1320 — `Chat` lit `useIsDemo` pour choisir son MOTEUR de réponse. Le hook
// passe par la charge crédits (donc react-query) ; ce fichier ne monte pas de
// `QueryClientProvider` et ne mesure pas la démonstration.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
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
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const listMessagesMock = vi.fn()
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: (...args: unknown[]) => listMessagesMock(...args),
  createAgentChatMessage: vi.fn().mockResolvedValue({}),
  listAgentChatHistory: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

/** Un fil DÉJÀ entamé : c'est le seul moment où la rangée compacte existe. */
function renderEngagedThread() {
  listMessagesMock.mockResolvedValue([
    {
      id: 'm-1',
      account_id: null,
      conversation_id: 'general',
      role: 'user',
      content: 'Message persisté',
      created_at: '2026-07-19T10:00:00Z',
    },
  ])
  render(<Chat />)
  return screen.findByText('Message persisté')
}

describe('#3192.2 — la zone de messages garde la hauteur', () => {
  it('le bandeau d’en-tête vit DANS le fil (il défile), pas au-dessus (fixe)', async () => {
    await renderEngagedThread()
    cleanup()
    // Lot V10 (08/10) : l'en-tête d'ACTIVATION ne s'affiche plus que sur un fil
    // VIDE — on teste donc sa place (dans le fil qui défile) sur un fil vide.
    listMessagesMock.mockResolvedValue([])
    render(
      <ChatTopSlotProvider value={<p>Bien démarrer test</p>}>
        <Chat />
      </ChatTopSlotProvider>,
    )
    const banner = await screen.findByText('Bien démarrer test')
    expect(banner.closest('[data-testid="chat-messages-list"]')).not.toBeNull()
  })

  // #3356.3b prime : une cible fait 44 px au pointeur fin aussi (garde Chat.composerTargets) ;
  // la hauteur du fil se gagne sur le bandeau déplacé dans le fil, pas sur les amorces.
  it('les amorces gardent 44 px partout, sans condition de pointeur (#3356.3b)', async () => {
    await renderEngagedThread()
    const chip = screen.getByRole('button', { name: 'Où investir mon temps' })
    expect(chip.className).toMatch(/(^|\s)min-h-11(\s|$)/)
    expect(chip.className).not.toContain('pointer-coarse:min-h-11')
  })
})

describe('Les amorces dans la ligne d’outils du composer', () => {
  it('rend les amorces DANS le formulaire de saisie, et non dans une bande au-dessus', async () => {
    await renderEngagedThread()
    const chip = screen.getByRole('button', { name: 'Où investir mon temps' })
    // Le composer EST un <form> : c'est ce qui distingue « dans la ligne
    // d'outils » de « dans une rangée posée juste au-dessus ».
    expect(chip.closest('form')).not.toBeNull()
  })

  it('les amorces tiennent sur UNE ligne à toutes les largeurs, sans être tranchées — plus d’enroulement sur grand écran', async () => {
    await renderEngagedThread()
    const scroller = screen.getByRole('button', { name: 'Où investir mon temps' }).parentElement
    // #4594 — plus de défilement qui tranche une amorce : celles qui ne tiennent pas
    // entières sont masquées (voir `fit-suggestion-chips`), jamais coupées en plein mot.
    expect(scroller?.className).toContain('overflow-hidden')
    expect(scroller?.className).not.toContain('overflow-x-auto')
    expect(scroller?.className).toContain('flex-nowrap')
    // L'enroulement au-dessus de 768 px est précisément ce qui prenait la
    // deuxième ligne : il ne doit revenir sous aucune variante.
    expect(scroller?.className).not.toContain('flex-wrap')
  })

  /**
   * Mesuré en prod le 02/09/2026 : dans la ligne d'outils — un conteneur flex
   * étroit — une pastille sans `shrink-0` se comprime jusqu'à la largeur de son
   * plus long mot, et sans `whitespace-nowrap` elle se casse en colonne.
   * « Réécrire un CV pour une mission » s'affichait sur six lignes d'un mot et
   * le composer doublait de hauteur.
   *
   * ⚠️ Ce test ne voit QUE les amorces : `LauncherExamples` rend `null` sans
   * `LauncherProvider`, et ce fournisseur lit le palier (donc react-query),
   * qu'on ne monte pas ici. Les cinq exemples du lanceur — ceux qui portaient
   * le défaut — sont gardés dans `ComposerLauncher.test.tsx`, là où le
   * fournisseur existe. Une garde qui affirmerait les couvrir ici serait
   * borgne : elle passait déjà avec le défaut en place.
   */
  it('aucune amorce de la rangée ne se comprime ni ne se casse en colonne', async () => {
    await renderEngagedThread()
    const scroller = screen.getByRole('button', { name: 'Où investir mon temps' }).parentElement
    const chips = [...(scroller?.querySelectorAll('button') ?? [])]
    expect(chips.length).toBeGreaterThan(5)
    for (const chip of chips) {
      expect(chip.className).toContain('shrink-0')
      expect(chip.className).toContain('whitespace-nowrap')
    }
  })

  /**
   * #2522 — Louis : « le bouton voir tout ne semble pas fonctionner ». Cause :
   * `<Link to="/chat/commandes">` naviguait vers une route qui REDIRIGE
   * aussitôt vers `/chat` (#1321) — le clic ramenait donc l'utilisateur là où
   * il était déjà, sans qu'il ne voie jamais le catalogue complet. Il ouvre
   * maintenant le MÊME tiroir que `CommandDrawerButton`, pas une navigation.
   */
  it('« Voir tout » ouvre le catalogue des commandes et NE défile pas avec les amorces', async () => {
    await renderEngagedThread()
    const scroller = screen.getByRole('button', { name: 'Où investir mon temps' }).parentElement
    // La rangée COURTE, celle qui défile : le nombre d'amorces visibles avant le clic.
    const rowChips = [...(scroller?.querySelectorAll('button') ?? [])]
    expect(rowChips.length).toBeGreaterThan(0)

    const seeAll = screen.getByRole('button', { name: 'Voir tout' })
    // Hors du conteneur défilant : sinon il faudrait faire défiler jusqu'au
    // bout pour l'atteindre, ce qui est exactement ce qu'il sert à éviter.
    expect(scroller?.contains(seeAll)).toBe(false)
    expect(seeAll.className).toContain('shrink-0')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(seeAll)

    const dialog = await screen.findByRole('dialog')
    // Le catalogue COMPLET, visible : plus d'éléments que la rangée courte.
    expect(within(dialog).getAllByText(/^Fixture —/).length).toBeGreaterThan(rowChips.length)
  })

  it('sur une conversation VIERGE, aucune rangée dans le composer — l’état vide porte déjà les amorces', async () => {
    listMessagesMock.mockResolvedValue([])
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    // #1600 — l'écran vide propose désormais l'accueil de Laura (repli
    // « nouvel utilisateur » avec le contexte double par défaut dans ce
    // fichier) plutôt que l'ancien jeu de huit amorces de portefeuille. Le nom
    // accessible d'une carte est LABEL + BÉNÉFICE (#3773.2 a retiré le sur-titre de
    // famille) : on cherche le libellé n'importe où dans le nom, c'est sa PRÉSENCE
    // UNIQUE qui est le point.
    // #5042 — l'accueil V8 ne montre que TROIS cartes (les trois premières du repli `NEW_USER`) :
    // « Quels comptes travailler cette semaine », quatrième, n'y est plus.
    for (const label of ['Trouver des comptes compatibles', 'Analyser une entreprise']) {
      expect(screen.getAllByRole('button', { name: new RegExp(label) })).toHaveLength(1)
    }
    // #2522 — « Voir tout » est un bouton (il ouvre le tiroir), plus un lien.
    expect(screen.queryByRole('button', { name: 'Voir tout' })).not.toBeInTheDocument()
  })
})

/**
 * #1944.17 (#3012) — `order-first`/`md:order-none` plaçaient les amorces
 * AVANT les outils sous 768 px sans bouger leur place dans le DOM : la
 * tabulation et le lecteur d'écran suivaient donc un ordre différent de
 * l'ordre affiché à l'écran. Un seul ordre DOM, qui suit le visuel MOBILE
 * (amorces puis outils) — le mobile fait foi (GA-28/29/30).
 */
describe('#1944.17 — un seul ordre DOM, qui suit le visuel mobile', () => {
  it('les amorces précèdent les outils dans le DOM, sans classe `order-*`', async () => {
    await renderEngagedThread()
    const chip = screen.getByRole('button', { name: 'Où investir mon temps' })
    const moreTools = screen.getByRole('button', { name: 'Ajouter à ce message' })

    // DOM_POSITION_FOLLOWING : `moreTools` vient APRÈS `chip` dans le document.
    expect(chip.compareDocumentPosition(moreTools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Le conteneur des amorces (parent du scroller) portait `order-first
    // md:order-none` : la divergence ne doit revenir sous aucune forme.
    const suggestionsRow = chip.parentElement?.parentElement
    expect(suggestionsRow?.className).not.toMatch(/\border-first\b/)
    expect(suggestionsRow?.className).not.toMatch(/\border-none\b/)
    expect(moreTools.closest('form')?.innerHTML).not.toMatch(/order-first|order-none/)
  })
})

/**
 * #1909 — « six propositions adaptées […] aux capacités disponibles » ; « ne jamais
 * proposer […] préparation de rendez-vous si aucun agenda […] écriture CRM si aucun
 * CRM ne peut être utilisé ». #1902 — « aucune suggestion connue comme impossible
 * ne doit être visible ».
 */
describe('#1909 — les amorces du composer : six au plus, jamais une capacité absente', () => {
  beforeEach(() => {
    capabilities.families = []
  })

  const suggestionChips = () => [
    ...(screen
      .getByRole('button', { name: 'Où investir mon temps' })
      .parentElement?.querySelectorAll('button[title]') ?? []),
  ]

  it('sans CRM ni agenda branchés, aucune amorce ne propose de s’en servir', async () => {
    await renderEngagedThread()
    expect(screen.queryByRole('button', { name: 'Mettre le CRM à jour' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Préparer mon prochain rendez-vous' })).not.toBeInTheDocument()
  })

  it('avec un CRM et un agenda branchés, ces deux amorces reviennent', async () => {
    capabilities.families = ['crm', 'calendar']
    await renderEngagedThread()
    expect(screen.getByRole('button', { name: 'Mettre le CRM à jour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Préparer mon prochain rendez-vous' })).toBeInTheDocument()
  })

  it('jamais plus de six amorces dans la ligne, même quand tout est branché', async () => {
    capabilities.families = ['crm', 'calendar']
    await renderEngagedThread()
    expect(suggestionChips().length).toBeGreaterThan(0)
    expect(suggestionChips().length).toBeLessThanOrEqual(6)
  })
})

describe('#3351 (LAU-UI-301) — plus d’air dans la barre de conversation', () => {
  it('la boîte de saisie porte un padding généreux, sans changer sa logique interne', async () => {
    await renderEngagedThread()
    const composer = screen.getByTestId('chat-composer')
    // Le cadre autour du champ (relief doux, `CHAT_SURFACE.composer`) est le
    // PREMIER enfant du formulaire : c'est lui que #3351 demande d'aérer.
    expect(composer.firstElementChild?.className).toMatch(/\bp-2\.5\b/)
  })
})

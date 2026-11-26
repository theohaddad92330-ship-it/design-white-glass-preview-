import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { LAUNCHER_TYPES } from '@bellum/contracts'
import { Chat } from './Chat'

/**
 * `<Chat />` n'a plus de mode flottant : il rend TOUJOURS la surface plein écran
 * de `/chat`. Ces tests montaient jadis la variante flottante (le défaut de
 * l'ancien prop `fullScreen`) ; ils exercent désormais la seule surface qui
 * existe. La persistance du fil a sa propre suite (`Chat.persistence.test.tsx`).
 */

type MotionMockProps = {
  children?: ReactNode
} & Record<string, unknown>

// L'écran porte maintenant un accueil personnalisé, qui lit le profil. Ce
// test ne mesure pas l'accueil : il double la feuille plutôt que de monter un
// fournisseur de session dont il n'a rien à faire. `''` = prénom inconnu,
// c'est la branche qui garde la formule d'origine.
// #1321 — le composer porte maintenant le tiroir des commandes, qui lit le
// catalogue (donc un QueryClient). Ces tests ne mesurent pas le tiroir : ils
// doublent la feuille plutôt que de monter un fournisseur dont ils n'ont rien
// à faire.
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
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// #1940.4 — l'auteur des bulles lit le profil (react-query) : même double que le prénom.
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React
 * voit un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec. Mesuré ici le 03/09 en ajoutant
 * un repli « + 2 autres amorces » : le clic passait, `setShowAll(true)` était
 * bien appelé, et l'écran entier disparaissait du DOM. Le composant était juste,
 * c'est le mock qui mentait.
 *
 * C'est un piège déjà payé dans ce dépôt. Un `Map` par nom de balise suffit.
 */
const motionComponents = new Map<string, ElementType>()

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
  // Le mock du routeur expose Link : plusieurs enfants de <Chat /> en rendent un,
  // et sans lui le rendu casse sur un type invalide.
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))

const accountsMock = vi.fn()
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => accountsMock(),
}))

/**
 * #1600 — `useLauraHomeContext` compose `useConsultants` (le vivier) et une
 * lecture du pipeline partenaire, toutes deux via react-query : ces tests ne
 * mesurent PAS ces signaux, ils doublent le hook plutôt que de monter un
 * `QueryClientProvider` dont ils n'ont rien à faire — même geste que pour
 * `useAccounts`/`useTeam` ci-dessus. `resolveLauraHomeSuggestions`, elle,
 * reste RÉELLE : c'est la logique que ces tests veulent exercer.
 */
const laraHomeContextMock = vi.fn()
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return { ...actual, useLauraHomeContext: () => laraHomeContextMock() }
})

// `CompanyAvatar` est doublé pour OBSERVER ce qu'on lui passe : en jsdom, Radix
// ne monte jamais le `<img>` (l'image ne charge pas), donc l'assertion utile
// n'est pas le DOM rendu mais le fait que le vrai `logo_url` / `website` du
// compte traverse bien jusqu'à l'avatar. Le rendu réel (logo → favicon →
// initiale) est couvert par `lib/company-logo.test.ts`.
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: ({ name, logoUrl, website }: { name: string; logoUrl?: string | null; website?: string | null }) => (
    <span data-testid="company-avatar" data-name={name} data-logo-url={logoUrl ?? ''} data-website={website ?? ''} />
  ),
}))

const teamMock = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => teamMock(),
}))

// #1320 — `Chat` lit `useIsDemo` pour choisir son MOTEUR de réponse. Le hook
// passe par la charge crédits (donc react-query) ; ce fichier ne monte pas de
// `QueryClientProvider` et ne mesure pas la démonstration.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

// #2810 — `Composer.submit()` appelle `resolveEntity` (donc `apiFetch`) avant
// d'ouvrir un run armé sur une PHRASE. Un `vi.fn()` réglable par test, même
// patron que `launcherArmMock` juste en dessous : la plupart des tests de ce
// fichier n'en ont rien à faire (repli synchrone sur un mot seul), seuls ceux
// du run « Analyser une entreprise » sur une phrase le règlent.
const apiFetchMock = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

// #1946.2 — le traceur produit est doublé pour OBSERVER ce qui sort au clic sur
// une amorce. Doublé et non laissé réel : la vraie implémentation est inerte
// tant que `VITE_PRODUCT_TRACKER_ENABLED` n'est pas posée, donc un test qui
// l'appellerait pour de vrai serait vert sans rien mesurer.
const trackSuggestionClickedMock = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackAssistantQuestionSent: vi.fn(),
  trackSuggestionClicked: (...args: unknown[]) => trackSuggestionClickedMock(...args),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u1' } }),
}))

// Long-memory hooks used by the copilot's Mémoire card — mocked (like useTeam)
// so Chat renders without a QueryClientProvider in this unit test.
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({
  usePinFact: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({
  useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }),
}))

// The composer's attach button calls a react-query mutation; mock it (like the
// hooks above) so Chat renders without a QueryClientProvider in this unit test.
// #1954.9 — observable : le CHOIX de portée doit atteindre le dépôt.
const chatIngestMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: (...args: unknown[]) => chatIngestMock(...args), isPending: false }),
}))
// #2667.1 — même mock que `useIngestRagDocument` ci-dessus, pour l'archive .zip.
const chatIngestZipMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: (...args: unknown[]) => chatIngestZipMock(...args), isPending: false }),
}))
// #2148.16 — le chemin de la pièce ÉPHÉMÈRE (cas a, `scope: 'conversation'`) :
// distinct d'`useIngestRagDocument`, jamais un objet durable.
const chatExtractMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({ mutateAsync: (...args: unknown[]) => chatExtractMock(...args), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useDeleteRagDocument', () => ({
  useDeleteRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #2448.8 / #2882.11 (épopée #2882) — `ResearchModeSelector` lit l'estimation
// coût/durée via react-query ; mocké pour la même raison que les hooks RAG
// ci-dessus (pas de `QueryClientProvider` dans ce harnais de test). `data:
// undefined` = le cas normal (aucune mesure encore chargée).
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
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

// #1791.1 — le menu « + » lit le registre d'outils via react-query ; mocké
// comme `useTeam` ci-dessus (un `vi.fn()` réglable par test) pour la même
// raison (pas de QueryClientProvider dans ce test de rendu).
const connectedCapabilitiesMock = vi.fn()
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => connectedCapabilitiesMock(),
}))

// #2254 — le lanceur, mocké comme `useConnectedCapabilities` ci-dessus (un
// `vi.fn()` réglable par test) : `LauncherProvider` lit `usePlanFeature`
// (react-query) et `useNavigate` (le routeur), et cette surface de test n'a
// ni l'un ni l'autre. `null` par défaut (`beforeEach`) = pas de lanceur, le
// composer se rend exactement comme dans le reste de ce fichier.
const launcherArmMock = vi.fn()
vi.mock('@/features/launcher/LauncherProvider', () => ({
  useLauncherArm: () => launcherArmMock(),
}))

// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` : ce test de rendu n'a pas de `QueryClientProvider` (voir
// `useConnectedCapabilities` ci-dessus, même raison). Le mock rend la lecture
// VIDE, c'est-à-dire le cas normal — aucun drapeau posé, aucun refus décoré.
// Ce que l'incident FAIT d'un refus est gardé ailleurs, sur la composition
// elle-même : `src/features/banners/declared-incident.test.ts`.
const activeBannersMock = vi.fn()
vi.mock('@/features/banners/useBanners', () => ({
  useActiveBanners: () => activeBannersMock(),
}))

// Persistance du fil : neutralisée ici (sa suite dédiée la couvre), pour que ce
// test de rendu ne parte pas chercher le réseau au montage.
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: vi.fn().mockResolvedValue([]),
  createAgentChatMessage: vi.fn().mockResolvedValue({}),
  listAgentChatHistory: vi.fn().mockResolvedValue([]),
}))

// Radix (le menu du « + », #1791.1) a besoin de ces API pointeur, absentes de
// jsdom — même stub que `ContactOutcomeSubmenu.test.tsx`.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  teamMock.mockReturnValue({ team: { members: [] }, isLoading: false, isError: false })
  accountsMock.mockReturnValue({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false })
  // Nouvel utilisateur par défaut : aucun des trois signaux n'est vrai.
  laraHomeContextMock.mockReturnValue({ hasPortfolio: false, hasVivier: false, hasPartners: false })
  connectedCapabilitiesMock.mockReturnValue({ families: [], tools: [], isLoading: false })
  launcherArmMock.mockReturnValue(null)
  apiFetchMock.mockReset()
  // #1960.13 — aucun drapeau posé : le cas normal, et le seul tant qu'un
  // opérateur n'a rien déclaré.
  activeBannersMock.mockReturnValue({ data: [] })
  trackSuggestionClickedMock.mockClear()
  // Le brouillon du composeur SURVIT à un démontage (il est persisté) : cliquer
  // une amorce dans un test remplissait la saisie du suivant. Le nettoyer ici
  // plutôt que dans le test qui salit — n'importe quel test qui tape du texte
  // aurait le même effet, et se souvenir de nettoyer n'est pas une garantie.
  localStorage.clear()
})

describe('Chat', () => {
  it('renders without crash', () => {
    render(<Chat />)
    // #1600 — l'accueil de Laura remplace l'ancien titre fixe.
    // #3884.1 — ce fallback ne pose plus sa propre question (la bulle de
    // Laura, trois secondes plus tard, est la SEULE salutation) : l'écran
    // d'accueil se vérifie désormais par son sous-titre neutre.
    expect(screen.getByText(/Je peux travailler sur ton portefeuille/)).toBeInTheDocument()
  })

  // Théo B l1-laura.N6 — le salut d'accueil ; sans prénom au profil, la formule sans prénom.
  it('salue sans inventer de prénom quand le profil n’en a pas', () => {
    render(<Chat />)
    expect(screen.getByTestId('laura-home-greeting')).toHaveTextContent('Sur quoi avance-t-on ?')
    expect(screen.getByTestId('laura-home-greeting')).not.toHaveTextContent('Bonjour')
  })

  it('renders message input', () => {
    render(<Chat />)
    expect(screen.getByPlaceholderText('Écris ton message...')).toBeInTheDocument()
  })

  /**
   * #1131 — « la page s'ouvre et c'est pas tout à fait centré ».
   *
   * La colonne du copilote est une SUITE de flex imbriqués, et la chaîne de
   * hauteur cassait au milieu : `<section>` prend `h-full`, le conteneur de
   * surface prend `flex-1`… et le `<main>` qui porte l'en-tête, le fil, la
   * saisie et la mémoire n'avait AUCUN grandissement. Un enfant de flex-colonne
   * sans `flex-grow` vaut `flex-basis: auto`, donc la hauteur de son CONTENU —
   * `align-items: stretch` n'étire que la LARGEUR sur un axe vertical. Toute la
   * colonne se tassait donc en haut de l'écran, la saisie flottait au milieu,
   * et le `min-h-full` de l'état vide (un pourcentage contre une hauteur
   * indéfinie, donc `auto`) ne centrait plus rien.
   *
   * Ce test lit l'élément RENDU, pas le fichier source : c'est la classe qui a
   * réellement traversé jusqu'au DOM qui est vérifiée.
   */
  it("remplit la hauteur qu'on lui donne — sinon la colonne se tasse en haut", () => {
    render(<Chat />)
    const main = screen.getByRole('main', { name: 'Conversation avec Laura' })
    expect(main.className.split(/\s+/)).toContain('flex-1')
    // La chaîne complète : sans `min-h-0`, ce même conteneur déborderait au
    // lieu de laisser le fil défiler dans SA boîte.
    expect(main.className.split(/\s+/)).toContain('min-h-0')
  })

  /**
   * #3351.3 (LAU-UI-301, recette prod 30/09) — « blocs mieux délimités » : la
   * rangée d'amorces/outils, sous le champ, porte désormais son propre filet
   * plutôt que de flotter dans le même cadre sans aucune séparation.
   */
  it('#3351.3 — la rangée d’outils sous la saisie porte un filet qui la délimite', () => {
    render(<Chat />)
    const row = screen.getByTestId('composer-toolbar-row')
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(['border-t', 'border-[var(--bellum-border)]']))
  })

  /**
   * #3861 (recette prod 09/10) — en mode Approfondi, le libellé du mode de
   * recherche (plus long qu'« Auto »/« Rapide »/« Vérifié ») élargissait la
   * rangée des réglages (`chat-composer-settings-row`, elle-même `flex-nowrap`
   * depuis #3709 pour ne JAMAIS pousser un bouton à la ligne EN SON SEIN) au
   * point de dépasser la largeur disponible de SON PARENT — cette rangée-ci
   * (`composer-toolbar-row`), qui reste `flex-wrap` pour le mobile (téléphone,
   * sous 768 px, où les réglages ET « Envoyer » ont légitimement besoin de
   * deux lignes). Le bouton « Envoyer » se retrouvait donc rejeté sous les
   * réglages, en PLEIN DESKTOP. #3709 avait réglé l'intérieur de la rangée de
   * réglages ; il restait à régler l'ENSEMBLE { réglages, Envoyer } au-dessus
   * de la borne mobile (GA-28, 768 px, breakpoint `md:` de Tailwind).
   */
  it('#3861 — la rangée d’outils ne passe plus « Envoyer » à la ligne sur desktop, quel que soit le mode de recherche', () => {
    render(<Chat />)
    const row = screen.getByTestId('composer-toolbar-row')
    expect(row.className.split(/\s+/)).toContain('md:flex-nowrap')
  })

  // #5179 — recette R3 (02/11) : à 1512 px la carte du composeur ne fait que ~954 px ; sur une carte
  // étroite la rangée se REPLIE (conteneur de requête) au lieu de couper « Français ».
  it('#5179 — la rangée d’outils se replie selon la largeur de la carte, pas celle de l’écran', () => {
    render(<Chat />)
    const row = screen.getByTestId('composer-toolbar-row')
    expect(row.className.split(/\s+/)).toContain('[@container(max-width:70rem)]:!flex-wrap')
    expect(row.parentElement?.className.split(/\s+/)).toContain('[container-type:inline-size]')
  })

  // recette MZ 10/10 — après `md:flex-nowrap` (ci-dessus), le mode « Approfondi » faisait déborder
  // la zone de composition de son cadre (« Envoyer » collé au bord) : en nowrap, ce qui ne rétrécit
  // pas dépasse. Les groupes d'actions ne rétrécissent jamais, la rangée ne dépasse jamais son cadre,
  // et c'est la rangée d'amorces (qui défile) qui cède la place.
  it('#3861 — « Envoyer » et les réglages gardent leur largeur, la rangée ne déborde pas de son cadre', () => {
    render(<Chat />)
    const row = screen.getByTestId('composer-toolbar-row')
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']))
    expect(screen.getByTestId('chat-composer-settings-row').className.split(/\s+/)).toContain('shrink-0')
    expect(screen.getByTestId('chat-composer-send-group').className.split(/\s+/)).toContain('shrink-0')
  })

  /**
   * #1600 / #4762 — le sous-titre de l'accueil nomme la mémoire marché maintenant qu'elle est
   * RÉELLEMENT branchée : l'outil `search_market_memory` est dans la liste d'outils de Laura
   * (`apps/ia/app/services/chat_tools.py`). Le drapeau était un faux en dur : Laura n'en
   * parlait jamais, quoi qu'on branche derrière.
   */
  it('nomme la mémoire marché, branchée côté Laura', () => {
    render(<Chat />)
    const subtitle = screen.getByText(/référentiels marché/i)
    expect(subtitle.textContent).toMatch(/portefeuille, ton vivier/i)
    expect(subtitle.textContent).not.toMatch(/\{\{/)
  })

  /*
    ⚠️ RETIRÉ avec le panneau de contexte : « les membres viennent de l'API,
    pas d'une liste en dur » (le faux « Matteo » des débuts). La liste des
    membres n'a plus sa place dans une conversation — elle se lit dans
    Réglages › Équipe, où on la cherche vraiment, et où elle reste testée.
  */

  /**
   * #1600 — repli « nouvel utilisateur » : aucun signal réel n'est vrai
   * (le `beforeEach` de ce fichier), donc les quatre suggestions de ce
   * contexte s'affichent, chacune UNE seule fois.
   */
  it('offre chaque suggestion de l’accueil UNE seule fois — repli nouvel utilisateur', () => {
    render(<Chat />)
    // Le nom accessible d'une carte est LABEL + BÉNÉFICE (#3773.2 a retiré le sur-titre de famille).
    // On cherche le libellé N'IMPORTE OÙ dans le nom : c'est l'UNICITÉ qui est le point de ce test.
    for (const label of [
      'Trouver des comptes compatibles',
      'Analyser une entreprise',
      'Opportunités autour de ma zone',
    ]) {
      expect(screen.getAllByRole('button', { name: new RegExp(label) })).toHaveLength(1)
    }
    // #5042 — trois cartes au plus : la 4e du repli n'est plus rendue.
    expect(screen.queryByRole('button', { name: /Quels comptes travailler cette semaine/ })).toBeNull()
  })

  /**
   * #3773.3 — « retirer les doubles icônes et éclairs purement décoratifs ». Renverse #3354.reste
   * (qui avait posé ⚡ sur la carte `run`) : une carte = UNE icône utile, un titre, sa phrase ; le
   * coût d'une opération payante ne se dit plus du tout (#4463).
   */
  it('#3773.3 — aucune carte d’accueil ne porte d’éclair ⚡, et chacune une seule icône', () => {
    render(<Chat />)
    const grid = screen.getByTestId('laura-home-suggestions')
    expect(grid.querySelector('svg.lucide-zap')).toBeNull()
    for (const card of within(grid).getAllByRole('button')) expect(card.querySelectorAll('svg')).toHaveLength(1)
    // « Toutes les idées de demandes » vit en pied de l'accueil ; ce n'est pas une carte.
    const runCard = within(grid).getByRole('button', { name: /Analyser une entreprise/ })
    // #4463 — plus de promesse de coût : la carte décrit le résultat, jamais « le coût est annoncé ».
    expect(runCard.textContent).toContain('Un dossier de conquête complet en quelques minutes')
    expect(runCard.textContent).not.toMatch(/coût|crédit/i)
  })

  /**
   * #3773.3 (renverse #1600 « six » et #2141) — QUATRE au plus, même quand les trois signaux
   * (portefeuille, vivier, partenaires) sont vrais : une carte par signal, puis la suivante du
   * portefeuille. Les autres capacités restent dans le catalogue (« Tous les exemples »).
   */
  it('ne dépasse jamais trois cartes (#5042), même quand tous les signaux sont vrais', () => {
    laraHomeContextMock.mockReturnValue({ hasPortfolio: true, hasVivier: true, hasPartners: true })
    render(<Chat />)

    const grid = screen.getByTestId('laura-home-suggestions')
    // Les cartes seules : « Tous les exemples », dans l'en-tête de la rubrique, n'en est pas une.
    const cards = within(grid)
      .getAllByRole('button')
      .filter(button => button.textContent !== 'Toutes les idées de demandes')
    expect(cards).toHaveLength(3)
    expect(within(grid).queryByRole('button', { name: /Environnements compatibles/ })).not.toBeInTheDocument()
    // Le catalogue complet reste à un clic.
    expect(screen.getByRole('button', { name: 'Toutes les idées de demandes' })).toBeInTheDocument()
  })

  it('#3773.3 — jamais complétée : un seul signal vrai, une seule carte', () => {
    laraHomeContextMock.mockReturnValue({ hasPortfolio: false, hasVivier: false, hasPartners: true })
    render(<Chat />)
    const grid = screen.getByTestId('laura-home-suggestions')
    expect(within(grid).getAllByRole('button')).toHaveLength(1)
  })

  /**
   * #1600 — contrairement à l'ancien jeu de huit amorces, la coupe à six ne se
   * DÉVOILE plus sur place : les candidats hors contexte n'ont pas de bouton
   * « + N autres » qui les révélerait, ils ne sont simplement pas retenus par
   * `resolveLauraHomeSuggestions`. (Le mécanisme « + N autres » survit, lui,
   * dans la démonstration — `demo-runs-the-real-shell.test.tsx`.)
   */
  it('ne propose aucun « voir plus » sur l’accueil réel — la coupe à six ne se dévoile pas', () => {
    laraHomeContextMock.mockReturnValue({ hasPortfolio: true, hasVivier: true, hasPartners: true })
    render(<Chat />)
    expect(screen.queryByRole('button', { name: /autres? (amorces|suggestions)/i })).not.toBeInTheDocument()
  })

  /**
   * Les suggestions ne sont plus des questions génériques mais des commandes
   * exécutables (addendum final p9) : la carte montre l'intention, le clic
   * envoie la requête complète. Sans ce test, raccourcir un libellé pourrait
   * silencieusement raccourcir aussi ce qui part au modèle.
   */
  it('porte la requête complète derrière un libellé court', () => {
    render(<Chat />)
    const chip = screen.getByRole('button', { name: /Trouver des comptes compatibles/ })
    // La commande réellement envoyée est lisible au survol ; la carte, elle, montre le titre et
    // SA phrase entière (#3773.2 — « lisibles sans survol »), pas la commande.
    expect(chip.getAttribute('title')).toContain('compatibles avec mon offre')
    expect(chip.textContent).not.toContain('Trouve-moi des comptes')
  })

  /**
   * #3773.5 — « un exemple inséré dans la saisie ne doit pas écraser un brouillon existant ».
   * Sur une saisie vide, l'exemple la remplit ; sur un brouillon, il se pose APRÈS, sur une ligne à part.
   */
  it('#3773.5 — un clic sur une carte remplit une saisie vide, mais n’écrase JAMAIS un brouillon', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    const textarea = screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement
    const card = () => screen.getByRole('button', { name: /Trouver des comptes compatibles/ })

    await user.click(card())
    const example = textarea.value
    expect(example).toContain('compatibles avec mon offre')

    fireEvent.change(textarea, { target: { value: 'Mon brouillon en cours' } })
    await user.click(card())
    expect(textarea.value.startsWith('Mon brouillon en cours')).toBe(true)
    expect(textarea.value).toContain(example)
  })

  /**
   * #1946.2 — « Instrumenter : clic suggestion ». L'émetteur existait, testé,
   * SANS appelant de production : un traceur sans appelant rend un tableau de
   * bord vide qui ressemble exactement à « personne ne clique les amorces ».
   *
   * Ce qui compte comme suggestion, et comment son RANG se lit : les amorces
   * que Laura propose dans la conversation — les cartes de l'accueil et les
   * pastilles du composeur —, et le rang est la position RENDUE, 1-based,
   * celle que l'œil parcourt. Pas la position au catalogue : c'est l'ordre
   * affiché qui dit si on clique la première ou si on descend la liste.
   */
  it('#1946.2 — cliquer la deuxième carte de l’accueil émet son RANG rendu, jamais son libellé', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    const grid = screen.getByTestId('laura-home-suggestions')
    const cards = within(grid).getAllByRole('button')
    await user.click(cards[1])

    expect(trackSuggestionClickedMock).toHaveBeenCalledTimes(1)
    // Deux arguments, et seulement deux : l'écran et le rang. Aucun endroit où
    // un libellé — bâti sur le portefeuille du client — pourrait se glisser.
    expect(trackSuggestionClickedMock).toHaveBeenCalledWith('/chat', 2)
  })

  it('#1946.2 — la première carte porte le rang 1, jamais 0 (un rang 0 se lirait comme une position)', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    const grid = screen.getByTestId('laura-home-suggestions')
    await user.click(within(grid).getAllByRole('button')[0])
    expect(trackSuggestionClickedMock).toHaveBeenCalledWith('/chat', 1)
  })

  /**
   * LE TÉMOIN — l'instrumentation n'attrape pas ce qu'elle ne vise pas. Le
   * simple AFFICHAGE des amorces n'est pas un clic : un émetteur posé au rendu
   * compterait autant de « clics » qu'il y a de cartes, à chaque visite, et le
   * tableau de bord serait faux sans qu'une ligne ne rougisse.
   */
  it('#1946.2 — afficher les amorces n’émet rien : seul le clic compte', () => {
    render(<Chat />)
    expect(screen.getByTestId('laura-home-suggestions')).toBeInTheDocument()
    expect(trackSuggestionClickedMock).not.toHaveBeenCalled()
  })

  /*
    ⚠️ DÉPLACÉS avec le panneau de contexte, pas supprimés : « le vrai logo
    passe à l'avatar » et « rien n'est fabriqué sans logo » vivent désormais
    dans `scope/ScopeDialog.test.tsx`, où les comptes s'affichent. La garantie
    est la même — `logo_url` et `website` sont servis par l'API, et une
    projection intermédiaire les jetait.
  */
})

/**
 * #1791.1 — le « + » qui rassemble le trombone et le « @ », plus « désigner un
 * connecteur ». jsdom ne met rien en page (aucune mesure de position) : ces
 * tests portent sur la STRUCTURE (rôles ARIA, nom accessible) et le
 * COMPORTEMENT au clavier — un menu, ça se tabule (GA-32, GA-35).
 *
 * ⚠️ Le clic sur un item de sous-menu passe par `fireEvent`, pas `userEvent` :
 * la séquence de pointeur de ce dernier fait re-rendre le sous-menu Radix, et
 * le nœud trouvé juste avant se détache avant que le clic arrive (même piège
 * que `ContactOutcomeSubmenu.test.tsx`).
 */
describe('Chat — le « + » de la barre de saisie (#1791.1)', () => {
  it('porte un nom accessible bien qu’il ne montre qu’une icône (GA-32)', () => {
    render(<Chat />)
    expect(screen.getByRole('button', { name: 'Ajouter à ce message' })).toBeInTheDocument()
    // Les deux anciens boutons séparés n'existent plus SUR LA BARRE : ils sont
    // devenus des items DANS le menu, invisibles avant ouverture.
    expect(screen.queryByRole('button', { name: 'Ajouter un fichier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mentionner un membre' })).not.toBeInTheDocument()
  })

  it('ouvre un menu tabulable qui regroupe joindre-un-fichier et mentionner-un-membre', async () => {
    teamMock.mockReturnValue({
      team: { members: [{ fullName: 'Camille Roux', email: 'camille@ex.fr' }] },
      isLoading: false,
      isError: false,
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))

    expect(await screen.findByRole('menuitem', { name: 'Pour cette conversation' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Ajouter à la base de mon ESN' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mentionner un membre' })).toBeInTheDocument()
  })

  /**
   * Échap referme le menu — comportement hérité du primitif Radix
   * (`packages/ui/src/components/dropdown-menu.tsx`), vérifié ici parce que
   * c'est la garantie clavier que #1791 demande explicitement.
   */
  it('Échap referme le menu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    expect(await screen.findByRole('menuitem', { name: 'Pour cette conversation' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menuitem', { name: 'Pour cette conversation' })).not.toBeInTheDocument()
  })

  /**
   * #1954.1 / #1954.2 / #1954.3 — « afficher formats acceptés, taille maximale,
   * nombre maximal » AVANT l'envoi. Ils n'apparaissaient qu'après un refus (un
   * toast « trop volumineux ») ou jamais (le 4ᵉ document évinçait le 1ᵉʳ en silence).
   */
  it('le menu dit les formats, la taille et le nombre de documents AVANT le choix du fichier', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    // #2667.1 — « zip » a rejoint `ATTACH_EXTENSIONS` (dépliée côté serveur, ou
    // lue telle quelle par `_extract_archive` hors de ce chemin).
    // #2667.2 — « xlsx » aussi : `document_text.py` sait déjà l'extraire, et
    // pptx et les trois formats d'image (png/jpg/jpeg/webp) le rejoignent :
    // `document_text.py` les exploite désormais (voir `ATTACH_EXTENSIONS`).
    expect(
      await screen.findByText(
        'PDF, DOCX, XLSX, PPTX, PNG, JPG, JPEG, WEBP, TXT, MD, CSV, JSON ou ZIP · 8 Mo max · 3 par message',
      ),
    ).toBeInTheDocument()
    // Le nom de l'entrée reste court : les limites se lisent à côté, pas dedans.
    expect(screen.getByRole('menuitem', { name: 'Pour cette conversation' })).toBeInTheDocument()
  })

  /**
   * #2667.1 — Louis (registre du 20/09) : « le sélecteur de fichiers accepte
   * une archive, et l'écran l'annonce ». Les deux moitiés sont lues depuis LA
   * MÊME constante (`ATTACH_EXTENSIONS`, #1954.1) : le test ci-dessus couvre
   * l'annonce, celui-ci couvre le sélecteur lui-même.
   */
  it('le sélecteur de fichiers accepte une archive .zip', () => {
    render(<Chat />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.accept.split(',')).toContain('.zip')
  })

  /**
   * #1954.4 / #1954.5 / #1954.6 / #1954.9 — décision de Louis (12/09/2026) : un
   * document joint sert au FIL par défaut, la base de l'ESN est un CHOIX, et la
   * conservation est DITE avant l'envoi.
   */
  it('#1954.5 — chaque choix dit où le document sert, qui s’en sert et combien de temps il est gardé', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))

    const thread = await screen.findByRole('menuitem', { name: 'Pour cette conversation' })
    expect(thread).toHaveAccessibleDescription(
      'Lu par Laura pour cette question, jamais listé dans Connaissances, jamais conservé.',
    )
    expect(screen.getByRole('menuitem', { name: 'Ajouter à la base de mon ESN' })).toHaveAccessibleDescription(
      'Rejoint Connaissances : toute ton ESN peut s’en servir. Conservé jusqu’à ce que tu le supprimes.',
    )
  })

  it('#1954.9 — « Ajouter à la base de mon ESN » dépose le document dans la base, sans clé de fil', async () => {
    chatIngestMock.mockResolvedValue({ id: 'doc-base', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ajouter à la base de mon ESN' }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['Grille'], 'grille.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'Grille' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(chatIngestMock).toHaveBeenCalledWith(expect.objectContaining({ scope: 'workspace' })))
    expect(chatIngestMock.mock.calls[0]?.[0]).not.toHaveProperty('conversationId')
    expect(await screen.findByText('base de l’ESN')).toBeInTheDocument()
  })

  /**
   * #2667.1 — décision Louis (QCM 21/09) : le .zip est déplié CÔTÉ SERVEUR,
   * ses entrées lisibles deviennent AUTANT de pièces jointes. Le chemin passe
   * par `ragApi.ingestZip` (`useIngestRagZip`), JAMAIS par `fileToIngestInput`
   * (qui lirait le .zip comme du texte ou l'enverrait tel quel — les deux
   * seraient faux).
   */
  it('#2667.1 — un .zip déplié rend AUTANT de pièces jointes que d’entrées ingérées', async () => {
    // #2148.16 (reste, 26/09) — un .zip « pour cette conversation » (portée
    // par défaut) est désormais ÉPHÉMÈRE comme tout autre fichier (même patron
    // que #2667.2 sur le .xlsx) : ce test passe par une portée EXPLICITE
    // (« Ajouter à la base de mon ESN ») pour continuer à exercer le dépliage
    // côté serveur (`ragApi.ingestZip`), qui ne s'applique plus qu'à ces
    // portées-là.
    // Mock partagé par ce fichier : un test précédent peut déjà l'avoir appelé
    // (#1954.9) — vidé ici pour que l'assertion « jamais appelé » ci-dessous
    // porte sur CE test, pas sur l'historique du fichier.
    chatIngestMock.mockClear()
    chatIngestZipMock.mockResolvedValue({
      total: 2,
      outcomes: [
        { status: 'ingested', file: 'brief.md', id: 'doc-brief', partial: false },
        { status: 'ingested', file: 'notes.txt', id: 'doc-notes', partial: false },
      ],
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ajouter à la base de mon ESN' }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['PK'], 'lot.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('PK').buffer })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(chatIngestZipMock).toHaveBeenCalled())
    expect(chatIngestZipMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ filename: 'lot.zip', scope: 'workspace' }),
    )
    // JAMAIS le dépôt unitaire — un .zip ne traverse pas `fileToIngestInput`.
    expect(chatIngestMock).not.toHaveBeenCalled()

    expect(
      await screen.findByRole('button', { name: 'Retirer brief.md et le supprimer de la base de ton ESN' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Retirer notes.txt et le supprimer de la base de ton ESN' }),
    ).toBeInTheDocument()
  })

  it('#2667.1 — une entrée refusée DEDANS l’archive n’empêche pas les autres d’être jointes', async () => {
    // #2148.16 (reste, 26/09) — même changement de portée que le test
    // précédent : une portée EXPLICITE pour continuer à exercer le dépliage.
    chatIngestZipMock.mockResolvedValue({
      total: 2,
      outcomes: [
        { status: 'ingested', file: 'notes.txt', id: 'doc-notes', partial: false },
        { status: 'failed', file: 'corrompu.pdf', reason: 'PDF illisible (corrompu).' },
      ],
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ajouter à la base de mon ESN' }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['PK'], 'lot.zip', { type: 'application/zip' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(
      await screen.findByRole('button', { name: 'Retirer notes.txt et le supprimer de la base de ton ESN' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retirer corrompu.pdf et le supprimer de la base de ton ESN' }),
    ).not.toBeInTheDocument()
  })

  /**
   * #2667.2 — retour Louis (20/09/2026) : « accepter aussi xlsx ». Mesuré :
   * `document_text.py` l'extrait déjà (`_extract_xlsx`) — ce point n'ouvre que
   * le sélecteur, et un `.xlsx` part par le MÊME chemin binaire qu'un `.pdf`
   * (`fileB64`, jamais `content` — `fileToIngestInput` ne le traite pas comme
   * du texte).
   */
  it('#2667.2 — un .xlsx part par `fileB64`, comme un .pdf — jamais comme du texte', async () => {
    // #2148.16 — « Pour cette conversation » (portée par défaut) est
    // ÉPHÉMÈRE depuis ce lot : le fichier part vers `/rag-documents/extract`
    // (jamais `ingest`), mais porte le MÊME `fileB64` binaire — la distinction
    // que ce test vérifie tient toujours, sur le nouveau chemin.
    chatExtractMock.mockClear()
    chatIngestMock.mockClear()
    chatIngestZipMock.mockClear()
    chatExtractMock.mockResolvedValue({ text: 'Tarif jour/homme : 650€', partial: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pour cette conversation' }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['PK'], 'grille-tarifaire.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(chatExtractMock).toHaveBeenCalled())
    const input = chatExtractMock.mock.calls[0]?.[0]
    expect(input).toEqual(expect.objectContaining({ filename: 'grille-tarifaire.xlsx' }))
    expect(input).toHaveProperty('fileB64')
    expect(input).not.toHaveProperty('content')
    expect(chatIngestMock).not.toHaveBeenCalled()
    expect(chatIngestZipMock).not.toHaveBeenCalled()
  })

  it('« mentionner un membre » se désactive plutôt que de se masquer quand personne à mentionner', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    const mentionEntry = await screen.findByRole('menuitem', { name: 'Mentionner un membre' })
    expect(mentionEntry).toHaveAttribute('aria-disabled', 'true')
  })

  // #3793 — « Utiliser une source » doublonnait « Outils et sources » : l'entrée du « + » est
  // retirée (pas masquée) ; le choix des sources reste atteignable par « Outils et sources ».
  it('#3793 — le « + » ne propose plus « Utiliser une source » ; « Outils et sources » reste là', async () => {
    connectedCapabilitiesMock.mockReturnValue({
      families: ['crm'],
      tools: [{ provider: 'hubspot', family: 'crm', name: 'HubSpot' }],
      isLoading: false,
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    expect(screen.getByRole('button', { name: /outils et sources/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await screen.findByRole('menuitem', { name: 'Mentionner un membre' })
    expect(screen.queryByRole('menuitem', { name: 'Utiliser une source' })).not.toBeInTheDocument()
  })

  /**
   * #2254 point 1 — « je devrais pouvoir cliquer directement sur les
   * connecteurs […] plutôt que de passer par le "+" ». Un outil BRANCHÉ
   * s'affiche sous la saisie, cliquable, avec son icône.
   * #2668.1 — cliquer l'ajoute en pastille, jamais dans le texte du champ.
   */
  it('#3708 — les bulles d’outils n’existent plus : une seule entrée « Outils et sources », qui ne pose aucune pastille', async () => {
    connectedCapabilitiesMock.mockReturnValue({
      families: ['crm'],
      tools: [{ provider: 'hubspot', family: 'crm', name: 'HubSpot' }],
      isLoading: false,
    })
    render(<Chat />)

    expect(screen.queryByRole('button', { name: 'Ajouter HubSpot à ta question' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /outils et sources/i })).toBeInTheDocument()
    const textarea = screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
    expect(screen.queryByRole('button', { name: /Retirer HubSpot/ })).not.toBeInTheDocument()
  })

  // Témoin du test ci-dessus : un texte ordinaire, sans bloc, part intact par
  // le même chemin — la correction ne doit rien couper d'autre que le marqueur.
  it('témoin : un texte ordinaire part intact par le chemin du run armé', async () => {
    const launcherGoMock = vi.fn()
    const armedRun = LAUNCHER_TYPES.find(type => type.key === 'account')!.runs[0]!
    launcherArmMock.mockReturnValue({
      types: [],
      typeKey: 'account',
      runs: [armedRun],
      armedRun,
      pickType: vi.fn(),
      pickRun: vi.fn(),
      disarm: vi.fn(),
      go: launcherGoMock,
      openType: vi.fn(),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    const textarea = screen.getByPlaceholderText('Nom de l’entreprise…')
    await user.type(textarea, 'Acme')
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }))

    expect(launcherGoMock).toHaveBeenCalledWith('Acme')
  })

  // #2810 — une PHRASE (plus d'un mot), sur le run qui lit `company`, passe
  // par l'extraction d'entité AVANT d'ouvrir `/search` : `launcherIntent`
  // recevait jusqu'ici la phrase telle quelle (#2149.12, #2149.25).
  it('#2810 — une phrase tapée sur « Analyser une entreprise » ouvre sur le nom ISOLÉ par le serveur', async () => {
    apiFetchMock.mockResolvedValue({ company: 'BPCE' })
    const launcherGoMock = vi.fn()
    const armedRun = LAUNCHER_TYPES.find(type => type.key === 'account')!.runs[0]!
    launcherArmMock.mockReturnValue({
      types: [],
      typeKey: 'account',
      runs: [armedRun],
      armedRun,
      pickType: vi.fn(),
      pickRun: vi.fn(),
      disarm: vi.fn(),
      go: launcherGoMock,
      openType: vi.fn(),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    const textarea = screen.getByPlaceholderText('Nom de l’entreprise…')
    await user.type(textarea, 'analyse-moi BPCE')
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }))

    await waitFor(() => expect(launcherGoMock).toHaveBeenCalledWith('BPCE'))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/ia/search/extract-entity',
      method: 'POST',
      body: { text: 'analyse-moi BPCE', locale: 'fr' },
    })
  })

  // Témoin du test ci-dessus : le serveur n'a rien à proposer (pas de clé, ou
  // nom non ancré) — le repli reste la phrase tapée, inchangée, jamais un nom
  // deviné côté client.
  it('#2810 — retombe sur la phrase tapée quand le serveur ne propose rien', async () => {
    apiFetchMock.mockResolvedValue({ company: null })
    const launcherGoMock = vi.fn()
    const armedRun = LAUNCHER_TYPES.find(type => type.key === 'account')!.runs[0]!
    launcherArmMock.mockReturnValue({
      types: [],
      typeKey: 'account',
      runs: [armedRun],
      armedRun,
      pickType: vi.fn(),
      pickRun: vi.fn(),
      disarm: vi.fn(),
      go: launcherGoMock,
      openType: vi.fn(),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Chat />)

    const textarea = screen.getByPlaceholderText('Nom de l’entreprise…')
    await user.type(textarea, 'analyse-moi BPCE')
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }))

    await waitFor(() => expect(launcherGoMock).toHaveBeenCalledWith('analyse-moi BPCE'))
  })

  it('témoin — Retour arrière dans du texte ordinaire efface un caractère, hors de tout bloc', async () => {
    const user = userEvent.setup()
    render(<Chat />)

    const textarea = screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement
    await user.type(textarea, 'bonjour')
    await user.type(textarea, '{Backspace}')
    expect(textarea.value).toBe('bonjou')
  })
})

/**
 * Décision de Louis du 13/09/2026 (batch 13) — la portée d'un fil ne s'affiche
 * que dans l'EN-TÊTE.
 *
 * Elle était rendue deux fois, par le même `ScopeButton` avec le même libellé :
 * sous le titre du fil et au bord de la saisie. « Rien n'apparaît deux fois sous
 * la même forme avec le même contenu » (loi 4 du tome 7). Celle de l'en-tête
 * reste, et c'est elle qui permet d'en CHANGER — donc elle garde une cible de
 * 44 px au doigt (GA-30), qu'elle perdait sous `min-h-0` quand la saisie en
 * portait une seconde.
 */
describe('Chat — la portée du fil ne s’affiche que dans l’en-tête (décision Louis 13/09, batch 13)', () => {
  it('un seul bouton de portée, dans l’en-tête, jamais dans la zone de saisie', () => {
    render(<Chat />)
    const scopeButtons = screen.getAllByRole('button', { name: /^Changer ce que .+ lit$/ })
    expect(scopeButtons).toHaveLength(1)
    const [scopeButton] = scopeButtons
    expect(scopeButton?.closest('header')).not.toBeNull()
    expect(scopeButton?.closest('form')).toBeNull()
  })

  it('le bouton de l’en-tête garde une cible de 44 px au doigt', () => {
    render(<Chat />)
    const scopeButton = screen.getByRole('button', { name: /^Changer ce que .+ lit$/ })
    expect(scopeButton.className).toContain('pointer-coarse:min-h-11')
  })
})

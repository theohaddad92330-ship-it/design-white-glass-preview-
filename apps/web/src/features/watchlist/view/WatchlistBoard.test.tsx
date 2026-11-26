import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountSignalItem } from '@bellum/contracts'
import type { ElementType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2151.60 — ce fichier gardait `WatchlistPage`. La page a disparu (`/watchlist`
 * redirige vers `/mes-cibles`) et son contenu vit dans `WatchlistBoard`, monté
 * par « Mes cibles » : les gardes suivent le CODE, pas l'adresse. La promesse de
 * #1421 et le lien vers le copilote sont gardés, eux, là où ils sont rendus —
 * `target-lists/view/TargetSignalsSection.test.tsx`.
 *
 * Les deux culs-de-sac du plateau de la Veille.
 *
 * 1. **Filtré à vide** — « Aucun compte ne correspond aux filtres », et rien
 *    pour les retirer : le seul chemin restant était de se souvenir de quelle
 *    puce on avait cliquée. `SearchEmptyState` expose `action` depuis qu'on lui
 *    a ouvert la porte ; il n'était pas utilisé ici.
 * 2. **Vide pour de bon** — aucun signal, aucun filtre. L'écran affichait alors
 *    l'état vide du TABLEAU, « Modifie la recherche ou le filtre » : un message
 *    de filtre là où aucun filtre n'est posé, donc une consigne impossible à
 *    suivre. Les signaux naissent des comptes analysés — la porte est Découvrir.
 *
 * Et le geste qui manque partout ailleurs : une tuile d'indicateur mène à ce
 * qu'elle compte, et le nombre qu'on lit est celui de la liste où l'on tombe.
 */
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

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
  useReducedMotion: () => true,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  // ⚠️ Le faux RECOPIE le `search` dans le `href`. Un faux qui le jette laisse
  // passer le défaut du 28/08 — un lien juste, une recherche perdue — et le
  // lien contextuel vers le copilote ne voyage QUE par là. Il ne le répand pas
  // non plus sur l'ancre : un objet en attribut DOM est un avertissement React.
  Link: ({ to, children, search, ...rest }: { to: string; children?: ReactNode; search?: Record<string, unknown> }) => (
    <a
      href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
      {...rest}
    >
      {children}
    </a>
  ),
}))

// #5191 — la modale partagée propose les personnes du compte : ses lectures sont isolées ici.
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({ useContactsByAccount: () => ({ data: [] }) }))
vi.mock('@/features/accounts/hooks/useAccountPerimeter', () => ({ useAccountPerimeter: () => undefined }))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn() }),
}))
vi.mock('../rules/useWatchlistRules', () => ({ useWatchlistRules: () => ({ rules: [] }) }))

/** Le détail monte `useCreateSignalAction` (react-query) — hors sujet ici. On
 *  garde une trace de CE QU'IL REÇOIT : c'est ce que les flèches font varier. */
vi.mock('./WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: ({ item }: { item: { companyName: string; id: string } }) => (
    <p>
      Détail du signal de {item.companyName} <span data-testid="detail-signal-id">{item.id}</span>
    </p>
  ),
}))

/**
 * Le tableau est testé chez lui. Ici, seul comptent CE QU'IL REÇOIT et le CLIC
 * qu'il émet — sans ce clic, la modale de #1797 ne pourrait pas s'ouvrir et le
 * fichier ne vérifierait que l'arrivée.
 */
vi.mock('./WatchlistTable', () => ({
  WatchlistTable: ({
    groups,
    onSelect,
  }: {
    groups: Array<{ accountId: string; companyName: string; latest: { id: string }; others: Array<{ id: string }> }>
    onSelect: (item: { id: string }) => void
  }) => (
    <ul>
      {groups.map(group => (
        <li key={group.accountId}>
          <button type="button" onClick={() => onSelect(group.latest)}>
            {group.companyName}
          </button>
          {/* #4182.5 — les sous-signaux (« +N autres ») émettent le même clic que le tableau réel. */}
          {group.others.map(other => (
            <button key={other.id} type="button" onClick={() => onSelect(other)}>
              {`sous-signal ${other.id}`}
            </button>
          ))}
        </li>
      ))}
    </ul>
  ),
}))

/**
 * #1423 — on espionne la construction de l'URL de logo plutôt que d'attendre
 * une balise `img` : l'avatar ne la monte qu'une fois l'image chargée, ce qui
 * n'arrive jamais sous jsdom. Le logo est rendu par l'ENTÊTE de la modale
 * depuis #1797 ; la garde a suivi le code.
 */
const logoRequests: Array<[unknown, unknown]> = []
vi.mock('@/lib/company-logo', () => ({
  companyLogoSrc: (logoUrl: unknown, website: unknown) => {
    logoRequests.push([logoUrl, website])
    return 'https://api.example/logo?src=nordia'
  },
}))

const signalsQuery = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountSignals', () => ({ useAccountSignals: () => signalsQuery() }))

// #1687 — un espion, pas le module réel : ce fichier vérifie ce que
// `toggleFacet`/`focusFacet` ÉMETTENT.
const trackFilterApplied = vi.fn()
// #3901.w — le profil déclaré (jumeau de Découvrir) : ici « pas encore chargé » = rien ne change.
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('@/lib/product-tracker', () => ({
  trackFilterApplied: (...args: unknown[]) => trackFilterApplied(...args),
}))

const { WatchlistBoard } = await import('./WatchlistBoard')

/** #1687 — l'écran qui MONTE le plateau depuis #2151.60 : un geste de filtre s'y compte. */
const SCREEN = '/mes-cibles'

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)

function signal(over: Partial<AccountSignalItem> = {}): AccountSignalItem {
  return {
    id: 's-1',
    account_id: 'a-1',
    account_created_at: daysAgo(20),
    account_score: null,
    company_name: 'Nordia',
    date: daysAgo(3),
    label: 'Programme data',
    sector: 'Services',
    source: 'Communiqué',
    type: 'Projet',
    freshness: 'current',
    ...over,
  }
}

function renderPage(state: { data?: AccountSignalItem[]; isError?: boolean; isLoading?: boolean }) {
  signalsQuery.mockReturnValue({
    data: state.data ?? [],
    isError: state.isError ?? false,
    isLoading: state.isLoading ?? false,
  })
  render(<WatchlistBoard screen={SCREEN} />)
}

/** La barre de facettes — #3658 : le bandeau de compteurs est retiré, les puces portent le même geste. */
const facets = () => within(screen.getByRole('group', { name: 'Facettes de la veille' }))

beforeEach(() => {
  signalsQuery.mockReset()
  trackFilterApplied.mockClear()
  logoRequests.length = 0
})

describe('WatchlistBoard — les états vides ont une porte', () => {
  it('aucun signal et aucun filtre : la porte mène aux comptes à analyser', () => {
    renderPage({ data: [] })

    const door = screen.getByRole('link', { name: /Découvrir des comptes/ })
    expect(door).toHaveAttribute('href', '/discover')
    // Le message de filtre ne s'affiche pas quand aucun filtre n'est posé.
    expect(screen.queryByText(/Aucun compte ne correspond aux filtres/)).toBeNull()
  })

  it('filtré à vide : un geste efface les filtres et la liste revient', async () => {
    const user = userEvent.setup()
    renderPage({ data: [signal({ date: daysAgo(3), account_score: 9 })] })

    expect(screen.getByText('Nordia')).toBeInTheDocument()

    // #4088.5 — la recherche ne retient rien : le vide est « filtré », avec sa porte.
    await user.type(screen.getByPlaceholderText('Rechercher un compte…'), 'introuvable')
    expect(screen.getByText(/Aucun compte ne correspond aux filtres/)).toBeInTheDocument()
    expect(screen.queryByText('Nordia')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Effacer les filtres/ }))
    expect(screen.getByText('Nordia')).toBeInTheDocument()
  })

  /**
   * LES DEUX VIDES SONT DÉCLARÉS, PAS SEULEMENT DIFFÉRENTS (PDF 1 §2).
   *
   * Les deux tests ci-dessus tiennent les MOTS. Celui-ci tient l'ÉTAT : c'est
   * lui qui casse le jour où quelqu'un rend le même composant pour les deux
   * cas en changeant seulement la phrase — le motif exact de GA-106.
   */
  it('le vide initial et le vide filtré déclarent DEUX états distincts', async () => {
    const user = userEvent.setup()
    renderPage({ data: [signal({ date: daysAgo(3), account_score: 9 })] })

    await user.type(screen.getByPlaceholderText('Rechercher un compte…'), 'introuvable')
    expect(screen.getByRole('status').getAttribute('data-screen-state')).toBe('empty_true')

    await user.click(screen.getByRole('button', { name: /Effacer les filtres/ }))
    cleanup()

    renderPage({ data: [] })
    expect(screen.getByRole('status').getAttribute('data-screen-state')).toBe('empty_never')
  })

  it('une erreur de chargement n’a pas de porte — « réessaie » n’est pas une destination', () => {
    renderPage({ isError: true })

    expect(screen.getByText(/Impossible de charger la veille/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Découvrir des comptes/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Effacer les filtres/ })).toBeNull()
  })
})

describe('WatchlistBoard — une puce mène exactement à ce qu’elle compte', () => {
  it('activer « Mes comptes prioritaires » ne laisse que les comptes qu’elle retient', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia', account_score: 9 }),
        signal({ id: 's-2', account_id: 'a-2', company_name: 'Verlaine', account_score: 3 }),
      ],
    })

    // Refonte Théo — les filtres de rang vivent sous « Plus de filtres » : les déplier d'abord.
    await user.click(screen.getByRole('button', { name: 'Plus de filtres' }))
    await user.click(facets().getByRole('button', { name: /Mes comptes prioritaires/ }))

    expect(screen.getByText('Nordia')).toBeInTheDocument()
    expect(screen.queryByText('Verlaine')).toBeNull()
    expect(facets().getByRole('button', { name: /Mes comptes prioritaires/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('#3658 — le bandeau « Indicateurs de la veille » n’existe plus', () => {
    renderPage({ data: [signal({ account_score: 9 })] })
    expect(screen.queryByRole('group', { name: 'Indicateurs de la veille' })).toBeNull()
  })
})

describe('#4182.5 — un sous-signal ouvre SON détail', () => {
  it('le clic sur un sous-signal (« +N autres ») ouvre le détail de CE signal, pas rien', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', label: 'Programme data', date: daysAgo(3) }),
        signal({
          id: 's-2',
          account_id: 'a-1',
          label: 'Appel d’offres infogérance',
          date: daysAgo(30),
          type: 'Appel d’offres',
        }),
      ],
    })
    const sub = screen.getAllByRole('button', { name: /^sous-signal / })
    expect(sub).toHaveLength(1)
    const otherId = sub[0]?.textContent?.replace('sous-signal ', '') ?? ''

    await user.click(sub[0] as HTMLElement)

    expect(await screen.findByTestId('detail-signal-id')).toHaveTextContent(otherId)
  })
})

describe('#1687 — trackFilterApplied nomme l’écran qui MONTE le plateau', () => {
  it('une puce de facette (toggleFacet) émet trackFilterApplied(<écran>, <facette>)', async () => {
    const user = userEvent.setup()
    renderPage({ data: [signal({ date: daysAgo(3), account_score: 9 })] })
    // Refonte Théo — les filtres de rang vivent sous « Plus de filtres » : les déplier d'abord.
    await user.click(screen.getByRole('button', { name: 'Plus de filtres' }))
    await user.click(facets().getByRole('button', { name: /Mes comptes prioritaires/ }))
    expect(trackFilterApplied).toHaveBeenCalledWith(SCREEN, 'priority')
  })
})

/**
 * #4088.1 — plus de bandeau « Veille automatique… » ni « Sources publiques… » dans le
 * plateau ; la porte vers les règles d'alerte (#1421) est le bouton-icône de l'en-tête
 * de l'écran (gardé dans `TargetSignalsSection.test.tsx`).
 */
describe('Veille — le plateau ne porte plus de bandeau de méthode (#4088.1)', () => {
  it('NON : ni périmètre, ni fraîcheur, ni lien « Paramétrer mes alertes » dans le plateau', () => {
    renderPage({ data: [signal({ id: 's1' })] })
    expect(document.body.textContent).not.toMatch(/Sources publiques et analyses/)
    expect(document.body.textContent).not.toMatch(/Veille automatique chaque matin/)
    expect(screen.queryByRole('link', { name: /Paramétrer mes alertes/ })).toBeNull()
  })
})

/**
 * #4088.5 / .6 / .7 — trois filtres (« À traiter » par défaut), 20 comptes puis « Voir tout
 * (N) », et un repli « Écartés (N) » : rien n'est supprimé.
 */
describe('WatchlistBoard — À traiter par défaut, 20 comptes, Écartés (#4088.5-.7)', () => {
  const ACTION = '33333333-3333-4333-8333-333333333333'
  const treated = (over: Partial<AccountSignalItem>) =>
    signal({ action_id: ACTION, action_label: 'Appeler', history_status: 'active', ...over })

  it('le défaut est « À traiter » : le traité n’y est que par l’élargissement, dit, et se retire au strict', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia' }),
        treated({ id: 's-2', account_id: 'a-2', company_name: 'Verlaine' }),
      ],
    })

    expect(facets().getByRole('button', { name: /À traiter/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Nordia')).toBeInTheDocument()
    // #4433.9 — sous le seuil, la liste s'ouvre seule aux comptes traités ; le geste de retour les retire.
    expect(screen.getByText('Verlaine')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Revenir au strict/ }))
    expect(screen.queryByText('Verlaine')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Élargir de nouveau/ }))
    expect(screen.getByText('Verlaine')).toBeInTheDocument()

    // Poser « À traiter » à plat montre tout…
    await user.click(facets().getByRole('button', { name: /À traiter/ }))
    expect(screen.getByText('Verlaine')).toBeInTheDocument()

    // #4088.10 — …et « Tout afficher » REVIENT au défaut : la puce « À traiter » redevient active.
    await user.click(screen.getByRole('button', { name: /Tout afficher/ }))
    expect(facets().getByRole('button', { name: /À traiter/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('NON : à l’état par défaut, « Tout afficher » n’a rien à faire et ne s’affiche pas (#4088.10)', () => {
    renderPage({ data: [signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia' })] })
    expect(screen.queryByRole('button', { name: /Tout afficher/ })).toBeNull()
  })

  it('NON : un filtre à 0 ne s’affiche pas ET ne vide pas la vue (tout est déjà traité)', () => {
    renderPage({ data: [treated({ id: 's-2', account_id: 'a-2', company_name: 'Verlaine' })] })

    expect(screen.getByText('Verlaine')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /À traiter/ })).toBeNull()
    // Sans règle de veille, « Selon mes règles » vaut 0 : il ne s'affiche pas non plus.
    expect(screen.queryByRole('button', { name: /Selon mes règles/ })).toBeNull()
  })

  it('les anciennes facettes Nouveaux / À analyser / À requalifier ont quitté la vue', () => {
    renderPage({ data: [signal({ account_score: 9 })] })
    for (const gone of [/Nouveaux/, /À analyser/, /À requalifier/]) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull()
    }
  })

  it('plus de « N signaux affichés sur N » (#4088.6)', () => {
    renderPage({ data: [signal({ account_score: 9 })] })
    expect(screen.queryByText(/signaux affichés sur/)).toBeNull()
  })

  it('20 comptes au chargement, puis « Voir tout (25) » rend les 25 (#4088.6)', async () => {
    const user = userEvent.setup()
    renderPage({
      data: Array.from({ length: 25 }, (_, i) =>
        signal({ id: `s-${i}`, account_id: `a-${i}`, company_name: `Compte ${String(i).padStart(2, '0')}` }),
      ),
    })

    expect(screen.getAllByRole('button', { name: /^Compte \d\d$/ })).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Voir tout (25)' }))
    expect(screen.getAllByRole('button', { name: /^Compte \d\d$/ })).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /Voir tout/ })).toBeNull()
  })

  it('NON : jusqu’à 20 comptes, aucun bouton « Voir tout »', () => {
    renderPage({
      data: Array.from({ length: 20 }, (_, i) => signal({ id: `s-${i}`, account_id: `a-${i}`, company_name: `C${i}` })),
    })
    expect(screen.queryByRole('button', { name: /Voir tout/ })).toBeNull()
  })

  it('une offre de stage est ÉCARTÉE, listée sous « Écartés (1) » en bas, jamais supprimée', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia', type: 'appel_offres', label: 'AO SI' }),
        signal({
          id: 's-2',
          account_id: 'a-2',
          company_name: 'Stagia',
          type: 'Recrutement',
          label: 'Stage développeur',
        }),
      ],
    })

    expect(screen.getByRole('button', { name: 'Nordia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stagia' })).toBeNull()
    const fold = screen.getByRole('button', { name: 'Écartés (1)' })
    expect(fold).toHaveAttribute('aria-expanded', 'false')

    await user.click(fold)
    expect(screen.getByRole('button', { name: 'Stagia' })).toBeInTheDocument()
  })

  it('NON : rien d’écarté, pas de repli « Écartés »', () => {
    renderPage({ data: [signal({ account_score: 9 })] })
    expect(screen.queryByRole('button', { name: /Écartés/ })).toBeNull()
  })
})

/**
 * #1797 — « à l'arrivée sur la page, il n'y a plus d'onglets ouverts à droite ;
 * on clique dans la liste, ça ouvre une modale, et on navigue avec des flèches ».
 *
 * Le geste empêché : l'écran s'ouvrait sur le détail du PREMIER compte, choisi
 * par personne, sur un quart de la largeur — la liste, ce pour quoi on vient,
 * était écrasée.
 *
 * ⚠️ Le piège du dépôt : Radix pose `aria-hidden` sur le reste de la page une
 * fois la modale ouverte. Un test qui compte APRÈS ouverture peut se croire
 * vert en ne comptant rien. Ici on compte AVANT, et après on vise le CONTENU
 * de la modale.
 */
describe('#1797 — la veille s’ouvre sur la liste, le détail est une modale', () => {
  it('à l’arrivée : aucune modale, aucun détail, aucun logo demandé', () => {
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia', logo_url: 'https://logo.example/n.png' }),
        signal({ id: 's-2', account_id: 'a-2', company_name: 'Verlaine' }),
      ],
    })

    expect(screen.getByRole('button', { name: 'Nordia' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/Détail du signal/)).toBeNull()
    // La moitié « donnée » de la même vérité : rien n’est monté, donc aucun
    // logo n’est même demandé.
    expect(logoRequests).toEqual([])
  })

  it('un clic dans la liste ouvre la modale sur CE compte — logo compris', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({
          id: 's-1',
          account_id: 'a-1',
          company_name: 'Nordia',
          logo_url: 'https://logo.example/n.png',
          website: 'https://nordia.example',
        }),
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Nordia' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Détail du signal de Nordia')).toBeInTheDocument()
    expect(logoRequests).toEqual([['https://logo.example/n.png', 'https://nordia.example']])
  })

  it('les flèches passent d’un compte à l’autre sans refermer', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia', account_score: 9 }),
        signal({ id: 's-2', account_id: 'a-2', company_name: 'Verlaine', account_score: 3 }),
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Nordia' }))
    expect(within(screen.getByRole('dialog')).getByText('Détail du signal de Nordia')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Compte suivant' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Détail du signal de Verlaine')).toBeInTheDocument()
    expect(dialog.getByText('2 sur 2')).toBeInTheDocument()
  })

  /**
   * LA LISTE COURANTE, ET PAS LA LISTE BRUTE.
   *
   * C'est le seul endroit où le contrat peut casser en silence : une flèche
   * qui parcourrait `items` ramènerait un compte que le filtre vient
   * d'écarter, et le compteur annoncerait un total qui n'est pas celui de
   * l'écran. Ici Verlaine (score 3) est hors de « Prioritaires ».
   */
  it('les flèches ne sortent JAMAIS de la liste filtrée', async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia', account_score: 9 }),
        signal({ id: 's-2', account_id: 'a-2', company_name: 'Verlaine', account_score: 3 }),
      ],
    })

    // Refonte Théo — les filtres de rang vivent sous « Plus de filtres » : les déplier d'abord.
    await user.click(screen.getByRole('button', { name: 'Plus de filtres' }))
    await user.click(facets().getByRole('button', { name: /Mes comptes prioritaires/ }))
    expect(screen.queryByRole('button', { name: 'Verlaine' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Nordia' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('1 sur 1')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Compte suivant' })).toBeDisabled()
    expect(dialog.queryByText(/Verlaine/)).toBeNull()
  })

  it('refermer la modale rend la liste, sans rien sélectionner', async () => {
    const user = userEvent.setup()
    renderPage({ data: [signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia' })] })

    await user.click(screen.getByRole('button', { name: 'Nordia' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nordia' })).toBeInTheDocument()
  })
})

describe('WatchlistBoard — #4283.9 (#4088.5) les puces par type de signal', () => {
  it("deux types de signal → deux puces avec leur nombre de comptes ; un type à 0 n'apparaît pas ; un clic filtre", async () => {
    const user = userEvent.setup()
    renderPage({
      data: [
        signal({ id: 's-1', account_id: 'a-1', company_name: 'Nordia', type: 'Recrutement', label: 'Data engineer' }),
        signal({ id: 's-2', account_id: 'a-2', company_name: 'Axiom', type: 'Levée de fonds', label: 'Série B' }),
      ],
    })

    // Refonte Théo (maquette validée) — le TYPE de fait passe DEVANT, visible à l'arrivée ; les filtres
    // de rang (« Mes comptes prioritaires », « Selon mes règles ») passent sous « Plus de filtres ».
    expect(screen.queryByRole('button', { name: /Mes comptes prioritaires/ })).toBeNull()
    const types = within(screen.getByRole('group', { name: 'Type de signal' }))
    expect(types.getAllByRole('button')).toHaveLength(2)
    expect(types.getByRole('button', { name: /Recrutement/ })).toHaveTextContent('1')
    expect(types.queryByRole('button', { name: /Rachat/ })).toBeNull()

    await user.click(types.getByRole('button', { name: /Recrutement/ }))
    expect(screen.getByText('Nordia')).toBeInTheDocument()
    expect(screen.queryByText('Axiom')).toBeNull()
  })
})

// #4433.9 — Mes cibles / la veille : sous le seuil, le plateau s'élargit SEUL, dit le palier et laisse revenir au strict.
describe('WatchlistBoard — #4433.9 les paliers d’élargissement', () => {
  const manyAccounts = (total: number, treated: number) =>
    Array.from({ length: total }, (_, i) =>
      signal({
        id: `s-${i}`,
        account_id: `a-${i}`,
        company_name: `Compte ${i}`,
        type: 'Recrutement',
        label: 'Data engineer',
        ...(i < treated ? { action_id: `act-${i}`, action_label: 'Séquence lancée' } : {}),
      }),
    )

  it('« À traiter » maigre : la liste s’ouvre aux comptes traités, le palier se DIT, sans question', async () => {
    const user = userEvent.setup()
    renderPage({ data: manyAccounts(14, 11) })

    expect(screen.getAllByRole('button', { name: /^Compte \d+$/ })).toHaveLength(14)
    const notice = screen.getByTestId('surface-widening-notice')
    expect(notice).toHaveTextContent('Élargi aux comptes déjà traités : 11 résultats')
    expect(notice).not.toHaveTextContent('?')

    await user.click(within(notice).getByRole('button', { name: /Revenir au strict/ }))
    expect(screen.getAllByRole('button', { name: /^Compte \d+$/ })).toHaveLength(3)
    expect(screen.getByTestId('surface-widening-notice')).toHaveTextContent('Vue stricte')

    await user.click(screen.getByRole('button', { name: /Élargir de nouveau/ }))
    expect(screen.getAllByRole('button', { name: /^Compte \d+$/ })).toHaveLength(14)
  })

  it('au seuil : aucun bandeau, aucun élargissement', () => {
    renderPage({ data: manyAccounts(26, 1) })
    expect(screen.queryByTestId('surface-widening-notice')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Compte \d+$/ })).toHaveLength(20) // 25 à traiter = la cible, une page de 20
  })
})

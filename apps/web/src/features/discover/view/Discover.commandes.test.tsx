import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #2481 / #2485 / #2486 — LA ZONE DE COMMANDE DE DÉCOUVRIR, RANGÉE.
 *
 * Mesuré en production le 16/09/2026 : QUATRE rangées de puces avant le moindre
 * résultat (préréglages, bascules, « Quelques exemples », « Par exemple »),
 * toutes du même poids visuel — 34 boutons dans un DOM replié. Trois retours le
 * même soir : « c'est le bordel, organise ça mieux » (#2481), « supprimer cette
 * section » (#2485, les puces « Par exemple »), « à supprimer, inutile avec
 * tous les filtres, et supprime les autres doublons » (#2486).
 *
 * Ce que ce fichier tient, et que la garde d'architecture ne peut pas voir :
 * ce qui est À L'ÉCRAN, à l'arrivée puis après une recherche.
 *
 * Patron de mocks copié sur `Discover.freetextSearch.test.tsx`.
 */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

const useDiscoverSearchSpy = vi.fn((_request: DiscoverRequest | null) => ({
  data: undefined,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}))
vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: (request: DiscoverRequest | null) => useDiscoverSearchSpy(request),
}))
vi.mock('@/features/discover/hooks/useDiscoverShortlist', () => ({
  useDiscoverShortlist: () => ({
    followed: new Set<string>(),
    dismissed: new Set<string>(),
    toggleFollow: vi.fn(),
    dismiss: vi.fn(),
    restoreAllDismissed: vi.fn(),
  }),
}))
vi.mock('@/features/discover/hooks/useSavedSearches', () => ({
  useSavedSearches: () => ({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() }),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))

// Retrait décidé par Louis 31/10 (revient sur #4632) : Découvrir n'interroge plus la mémoire marché à part.
const useMarketContextSearchSpy = vi.fn((_query: unknown) => ({ data: undefined, isFetching: false }))
vi.mock('@/features/search/hooks/useMarketContextSearch', () => ({
  useMarketContextSearch: (query: unknown) => useMarketContextSearchSpy(query),
}))

const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
            const Component = prop as 'div'
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
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

const { Discover } = await import('./Discover')

/** Pose une recherche : c'est le geste qui fait quitter l'état d'arrivée. */
function lancerUneRecherche() {
  // #4494 — un secteur (puce « Tous les secteurs » → « Cadrer la recherche »), puis « Appliquer et explorer ».
  fireEvent.click(screen.getByTestId('discover-chip-sectors'))
  fireEvent.click(screen.getByRole('button', { name: /^tout choisir dans technologies et médias$/i }))
  fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
}

/** Le repère d'un écran Découvrir monté (le rail ouvre déplié, sans saisie libre). */
const ecranPret = () => screen.findByRole('button', { name: discoverFr.commands.presetsLabel })

// #2503 (17/09/2026) — « supprimer les quelques exemples » : la description
// `#2485 — une seule rangée de phrases d'exemple` testait la rangée
// `freetext.examples`, retirée de l'écran ET de l'i18n. Garde qui tient
// désormais l'absence : `architecture/decouvrir-ne-dit-ses-exemples-quune-fois.test.ts`.

describe('#2486 — la méthode ne s’offre pas deux fois', () => {
  it('à l’arrivée, la carte « méthode » est là et la bascule ne la double pas', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()

    // La carte est déjà dépliée (état d'arrivée) : la bascule ne ferait rien.
    expect(screen.getByText(/notre méthode en 3 étapes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /expliquer la méthode/i })).toBeNull()
  })

  it('après une recherche, la bascule revient — c’est alors le seul chemin', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()
    lancerUneRecherche()

    expect(screen.queryByText(/notre méthode en 3 étapes/i)).toBeNull()
    // Lot U — « Expliquer la méthode » vit dans le menu ⋯.
    await userEvent.click(screen.getByRole('button', { name: discoverFr.market.moreActions }))
    expect(await screen.findByRole('menuitemcheckbox', { name: /expliquer la méthode/i })).toBeInTheDocument()
  })
})

/** #2467 — le rail ouvre replié ; son contenu n'est pas dans le DOM avant le clic. */
async function ouvrirTousLesFiltres() {
  await screen.findByRole('button', { name: discoverFr.explore.submit })
  fireEvent.click(await screen.findByRole('button', { name: /tous les filtres/i }))
}

describe('#2486 — la lecture du territoire quitte Découvrir (décision de Louis, 16/09/2026)', () => {
  it('aucune bascule « Territoire » dans la zone de commande', async () => {
    // Louis a tranché le 16/09 : la bascule ET le panneau qu'elle ouvrait
    // (couverture du référentiel, ESN présentes, veille locale) partent. Ce
    // test rougit si l'un des deux revient par ce bouton.
    renderWithRouter(<Discover />)
    await ecranPret()
    // #4493 — la PISTE « Un territoire » (recherche par zone de l'offre) n'est pas cette bascule de lecture :
    // la bascule s'appelait « Territoire », tout court.
    expect(screen.queryByRole('button', { name: /^territoire$/i })).toBeNull()
    // Et son texte a quitté les deux langues — pas de libellé orphelin.
    expect(Object.keys(discoverFr.topbar)).not.toContain('territory')
  })

  it('les autres lectures restent — le témoin de ce retrait', async () => {
    // « Voir aussi » ne se vide pas : seul le territoire en sort.
    renderWithRouter(<Discover />)
    await ecranPret()
    await userEvent.click(screen.getByRole('button', { name: discoverFr.market.moreActions }))
    expect(await screen.findByRole('menuitemcheckbox', { name: discoverFr.rail.similarToggle })).toBeInTheDocument()
  })

  it('le rail ne propose plus la « ville précise » qui ne pilotait QUE ce panneau', async () => {
    // Le champ ne filtrait pas la liste d'entreprises (voir l'ancien
    // `discover-zone.ts`) : sans le panneau, il aurait accepté une ville et un
    // rayon pour ne rien en faire. Les critères géographiques qui FILTRENT
    // restent : département, région, ville du registre.
    renderWithRouter(<Discover />)
    await ouvrirTousLesFiltres()
    // #4494 — la zone vit dans la rubrique « Territoire ».
    fireEvent.click(screen.getByTestId('framing-section-territory'))
    expect(screen.getAllByText(discoverFr.rail.regionLabel).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(discoverFr.registry.departmentsLabel).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText(/ville précise/i)).toHaveLength(0)
  })
})

describe('#2481 — une hiérarchie, pas quatre rangées équivalentes', () => {
  it('chaque groupe de commandes a SA place : critères dans la carte, pistes sous les pistes, lectures dans « Ton marché »', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()

    // Refonte Théo (23/10) — trois niveaux nommés, plus une rangée de puces sans titre : les critères
    // (« Cadrer la recherche »), les pistes rapides (sous les quatre pistes), les lectures dans l'en-tête de
    // la liste « Ton marché ».
    expect(screen.getByRole('group', { name: discoverFr.chips.aria })).toBeInTheDocument()
    expect(screen.getByText(discoverFr.commands.presetsLabel)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: discoverFr.market.moreActions }))
    expect(await screen.findByRole('menuitemcheckbox', { name: discoverFr.rail.similarToggle })).toBeInTheDocument()
  })
})

describe('#4632 — une seule surface de recherche : « Contexte marché observé » rejoint « Tous les filtres »', () => {
  it('ni bascule « Contexte marché », ni second formulaire, ni second bouton « Rechercher »', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()
    expect(screen.queryByRole('button', { name: /contexte marché/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /rechercher dans le marché observé/i })).toBeNull()
    // Son texte a quitté les deux langues — pas de libellé orphelin.
    expect(Object.keys(discoverFr.topbar)).not.toContain('marketContext')
  })

  it('« Famille de rôles observée » et « Écosystèmes liés à » vivent dans la rubrique Compétences du rail', async () => {
    renderWithRouter(<Discover />)
    await ouvrirTousLesFiltres()
    fireEvent.click(screen.getByTestId('framing-section-expertise'))
    expect(screen.getByText(discoverFr.rail.roleFamilyObservedLabel)).toBeInTheDocument()
    expect(screen.getByText(discoverFr.rail.ecosystemObservedLabel)).toBeInTheDocument()
  })
})

describe('Lot K (31/10) — plus de section « Marché observé » sous la liste', () => {
  it('après une recherche, Découvrir ne rend pas « Marché observé » et n’interroge pas la mémoire marché à part', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()
    lancerUneRecherche()
    await waitFor(() => expect(useDiscoverSearchSpy.mock.calls.at(-1)?.[0]).not.toBeNull())
    expect(screen.queryByText(/marché observé/i)).toBeNull()
    expect(useMarketContextSearchSpy).not.toHaveBeenCalled()
  })
})

describe('#2504 — les pistes rapides ouvrent une modale, depuis la ligne de la saisie', () => {
  it('le bouton est présent sans saisie libre, et ferme la modale au clic', async () => {
    renderWithRouter(<Discover />)
    const input = await ecranPret()

    // Même parent flex que le champ (et le bouton autopilote déjà présent) :
    // c'est ce qui fait « la même ligne » plutôt qu'une rangée séparée.
    const trigger = screen.getByRole('button', { name: discoverFr.commands.presetsLabel })
    expect(trigger.parentElement).toBe(input.parentElement)

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)

    // #2504 — le `title` HTML est remplacé par du texte VISIBLE : le hint de
    // chaque piste apparaît dans la modale, pas seulement au survol.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(discoverFr.presets.accessible.label)).toBeInTheDocument()
    expect(within(dialog).getByText(discoverFr.presets.accessible.hint)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByText(discoverFr.presets.accessible.label))

    // Un clic applique la piste ET ferme — même comportement qu'avant le rangement.
    // Le preset `accessible` pose `headcount: '50-249'`, traduit en bornes
    // (`HEADCOUNT_BOUNDS`, `discover-query.ts:131`) dans la requête envoyée.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // #4490 (26/10) — la piste POSE les critères et s'arrête là : c'est « Explorer » qui
    // dépense. La traduction du `headcount` en bornes se lit donc sur la requête lancée APRÈS.
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer' }))
    const lastCall = useDiscoverSearchSpy.mock.calls.at(-1)?.[0] as DiscoverRequest
    expect((lastCall?.query as { filters: { headcountMin?: number; headcountMax?: number } }).filters).toMatchObject({
      headcountMin: 50,
      headcountMax: 249,
    })
  })

  it('n’affiche plus la rangée de cinq pastilles', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()

    // Les pistes ne sont visibles qu'APRÈS ouverture de la modale.
    expect(screen.queryByText(discoverFr.presets.hiring.label)).toBeNull()
  })
})

describe('#3119 (beta) — « Analyser une liste » est la PREMIÈRE piste rapide', () => {
  it('la modale rend le lien en position 0, avant les pistes de filtre', async () => {
    renderWithRouter(<Discover />)
    await ecranPret()
    fireEvent.click(screen.getByRole('button', { name: discoverFr.commands.presetsLabel }))

    const dialog = await screen.findByRole('dialog')
    // Accessible name = libellé + indice concatenés (comme chaque piste de
    // filtre) : on remonte au lien depuis son libellé plutôt que par nom.
    const entry = within(dialog).getByText(discoverFr.batches.entry).closest('a')
    if (!entry) throw new Error('lien « Analyser une liste » introuvable')
    expect(entry).toHaveAttribute('href', '/discover/lots')

    const firstPreset = within(dialog).getByText(discoverFr.presets.accessible.label)

    expect(entry.compareDocumentPosition(firstPreset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Le lien navigue et ferme la modale, il n'applique aucun filtre.
    fireEvent.click(entry)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

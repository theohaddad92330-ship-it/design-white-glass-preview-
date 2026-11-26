import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import discoverFr from '@/i18n/locales/fr/discover.json'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4493 / #4494 (Louis 24/10) — la barre de la carte « Quel marché veux-tu explorer ? » (maquette V22) : un
 * champ libre + « Explorer », puis les puces Territoire · Secteurs · Expertises · Besoins & signaux · Tous les
 * filtres, chacune ouvrant « Cadrer la recherche » sur sa rubrique. Ce qu'il garde des décisions d'avant :
 * - #4490 — rien ne part seul ; (#3646 — la saisie libre, retirée le 05/10, revient : décision du 24/10) ;
 * - #3879.2 — un secteur coché reste LISIBLE sans rien ouvrir (la puce le nomme) ;
 * - recette MU 10/10 — « Tous les filtres » est toujours à l'écran, une seule fois (GA-26).
 *
 * Patron de mocks copié sur `Discover.accessClassSearch.test.tsx`.
 */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: () => ({ data: undefined, isFetching: false, isError: false, refetch: vi.fn() }),
  useTransform: () => 0,
}))

const { Discover } = await import('./Discover')

const rangee = () => screen.getByRole('group', { name: discoverFr.chips.aria })

describe('Découvrir — la barre et ses puces (#4493, maquette V22)', () => {
  it('à l’arrivée : le champ libre, « Explorer », puis les six puces dans l’ordre de la maquette appliquée — « Toutes les tailles » : aucune taille posée d’office (#4516)', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    expect(screen.getByRole('searchbox', { name: discoverFr.explore.label })).toBeInTheDocument()
    const labels = within(rangee())
      .getAllByRole('button')
      .map(button => button.textContent?.trim())
    expect(labels).toEqual([
      discoverFr.chips.territoryAll,
      discoverFr.chips.sectorsAll,
      discoverFr.chips.sizesAll,
      discoverFr.chips.skills,
      discoverFr.chips.signals,
      discoverFr.rail.moreFilters,
    ])
    // Plus d'en-tête repliable « Recherche » : la rangée ne se cache jamais.
    expect(screen.queryByRole('button', { name: /^recherche$/i })).toBeNull()
  })

  it('« Tous les secteurs » ouvre la modale sur Entreprises ; le secteur appliqué se LIT ensuite sur la puce (#3879.2)', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.click(screen.getByTestId('discover-chip-sectors'))
    fireEvent.click(await screen.findByRole('button', { name: /^tout choisir dans technologies et médias$/i }))
    // Un brouillon : rien ne bouge sur la page avant l'application.
    expect(screen.getByTestId('discover-chip-sectors')).toHaveTextContent(discoverFr.chips.sectorsAll)
    fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
    expect(screen.getByTestId('discover-chip-sectors')).not.toHaveTextContent(discoverFr.chips.sectorsAll)
  })

  it('lancer une recherche ne cache rien : la barre et « Explorer » restent pour affiner', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.click(screen.getByTestId('discover-chip-sectors'))
    fireEvent.click(await screen.findByRole('button', { name: /^tout choisir dans technologies et médias$/i }))
    fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
    expect(rangee()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: discoverFr.explore.submit })).toBeInTheDocument()
  })

  it('« Tous les filtres » : une seule fois à l’écran, et il ouvre la modale d’un clic', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    expect(screen.getAllByRole('button', { name: discoverFr.rail.moreFilters })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: discoverFr.rail.moreFilters }))
    expect(screen.getByRole('dialog', { name: discoverFr.framing.title })).toBeInTheDocument()
  })

  it('« Toute la France » ouvre la modale sur Territoire', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.click(screen.getByTestId('discover-chip-territory'))
    expect(screen.getByRole('heading', { name: discoverFr.framing.territoryTitle })).toBeInTheDocument()
  })
})

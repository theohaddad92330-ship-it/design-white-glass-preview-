import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownMenuItem } from '@bellum/ui'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import {
  DiscoverBreakdown,
  DiscoverHeader,
  DiscoverKpis,
  DiscoverMarketToolbar,
  DiscoverPager,
  DiscoverQualityNotes,
  DiscoverSearchCard,
  DiscoverTracks,
} from './DiscoverOverview'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}${Object.values(options).join(',')}` : key,
    i18n: { language: 'fr' },
  }),
}))

describe('Découvrir — les blocs d’accueil (Théo decouvrir)', () => {
  it('l’en-tête ouvre Mes recherches et lance une nouvelle recherche', async () => {
    const onOpenHistory = vi.fn()
    const onNewSearch = vi.fn()
    render(<DiscoverHeader onOpenHistory={onOpenHistory} onNewSearch={onNewSearch} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'mySearches.entry' }))
    await userEvent.click(screen.getByRole('button', { name: 'overview.newSearch' }))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
    expect(onNewSearch).toHaveBeenCalledTimes(1)
  })

  it('la carte « Quel marché veux-tu explorer ? » : titre, contexte, puis la barre que l’appelant lui donne', () => {
    render(
      <DiscoverSearchCard context={<span>contexte</span>}>
        <p>critères</p>
      </DiscoverSearchCard>,
    )
    expect(screen.getByRole('heading', { name: 'overview.exploreTitle' })).toBeInTheDocument()
    expect(screen.getByText('contexte')).toBeInTheDocument()
    expect(screen.getByText('critères')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('chaque piste est un bouton illustré qui applique son état', async () => {
    const onSelect = vi.fn()
    render(
      <DiscoverTracks tracks={[{ id: 'a', eyebrow: 'Piste', title: 'Titre', hint: 'Indice', art: 'IDF', onSelect }]} />,
    )
    expect(screen.getByText('IDF')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Titre/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('#4493 — une piste sans donnée déclarée dit ce qu’il faut renseigner, et ne part pas', async () => {
    const onSelect = vi.fn()
    render(
      <DiscoverTracks
        tracks={[
          {
            id: 'a',
            eyebrow: 'Piste',
            title: 'Titre',
            hint: 'Indice',
            art: '',
            disabledReason: 'Déclare ta zone',
            onSelect,
          },
        ]}
      />,
    )
    expect(screen.getByText('Déclare ta zone')).toBeInTheDocument()
    expect(screen.queryByText('Indice')).toBeNull()
    expect(screen.getByRole('button', { name: /Titre/ })).toBeDisabled()
  })

  it('un indicateur ouvre son type de résultat ; sans indicateur mesuré, rien n’est rendu', async () => {
    const onOpen = vi.fn()
    const { container, rerender } = render(<DiscoverKpis items={[{ key: 'k', label: 'Comptes', value: 97, onOpen }]} />)
    await userEvent.click(screen.getByRole('button', { name: /Comptes/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    rerender(<DiscoverKpis items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('SAIT DIRE NON : sans secteur ni taille connus, la répartition ne s’affiche pas', () => {
    const { container } = render(<DiscoverBreakdown breakdown={{ sectored: 0, sectors: [], sizes: [] }} total={3} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('la répartition nomme ses segments avec leurs comptes, sans score', () => {
    render(
      <DiscoverBreakdown
        breakdown={{
          sectored: 5,
          sectors: [
            { sector: 'Banque', count: 3 },
            { sector: null, count: 2 },
          ],
          sizes: [{ code: 'GC', count: 4 }],
        }}
        total={5}
      />,
    )
    // Lot U — REPLIÉE par défaut sur une ligne ; on la déplie.
    expect(screen.queryByText('Banque')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /overview.breakdownCollapsed/ }))
    expect(screen.getByText('Banque')).toBeInTheDocument()
    expect(screen.getByText('overview.otherSectors')).toBeInTheDocument()
    expect(screen.getByText('GC')).toBeInTheDocument()
    expect(screen.getByText('overview.breakdownNote')).toBeInTheDocument()
  })

  it('lot U — la barre d’actions : plus de titre « Ton marché », vues liste/colonnes, le reste dans le menu ⋯ nommé', async () => {
    renderWithRouter(
      <DiscoverMarketToolbar
        actions={<button type="button">Enregistrer</button>}
        menu={<DropdownMenuItem>Comptes comparables</DropdownMenuItem>}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('link', { name: 'market.viewRadar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'market.viewList' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'market.viewColumns' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'market.moreActions' }))
    expect(await screen.findByRole('menuitem', { name: 'Comptes comparables' })).toBeInTheDocument()
  })

  it('l’avis de qualité : UN repli qui compte ses points, ouvert d’office sur une panne', () => {
    render(
      <DiscoverQualityNotes open>
        <p>Zone élargie</p>
        <p>2 intermédiaires masqués</p>
      </DiscoverQualityNotes>,
    )
    const fold = screen.getByTestId('discover-quality')
    expect(fold.tagName).toBe('DETAILS')
    expect(fold).toHaveAttribute('open')
    expect(fold).not.toHaveAttribute('hidden')
    // Lot U — une icône ⓘ NOMMÉE (GA-32), tabulable : son nom porte le nombre de points.
    expect(screen.getByLabelText('quality.summary2')).toBeInTheDocument()
  })

  it('SAIT DIRE NON : aucun avis ne parle → aucun repli', () => {
    const Silent = () => null
    render(
      <DiscoverQualityNotes>
        <Silent />
      </DiscoverQualityNotes>,
    )
    expect(screen.getByTestId('discover-quality')).toHaveAttribute('hidden')
  })

  it('les pages : « 13–24 sur 30 », la page courante marquée, une page de plus au clic', async () => {
    const onPage = vi.fn()
    render(
      <DiscoverPager
        page={2}
        pageCount={3}
        total={30}
        pageSize={12}
        onPage={onPage}
        canLoadMore={false}
        onLoadMore={() => {}}
        loadingMore={false}
      />,
    )
    expect(screen.getByText('pager.range13,24,30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pager.page2' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('button', { name: 'pager.next' }))
    expect(onPage).toHaveBeenCalledWith(3)
    expect(screen.queryByTestId('discover-show-more')).toBeNull()
  })

  it('SAIT DIRE NON : une seule page → ni numéros ni flèches ; au bout du chargé, « Charger d’autres comptes »', async () => {
    const onLoadMore = vi.fn()
    render(
      <DiscoverPager
        page={1}
        pageCount={1}
        total={7}
        pageSize={12}
        onPage={() => {}}
        canLoadMore
        onLoadMore={onLoadMore}
        loadingMore={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'pager.next' })).toBeNull()
    await userEvent.click(screen.getByTestId('discover-show-more'))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})

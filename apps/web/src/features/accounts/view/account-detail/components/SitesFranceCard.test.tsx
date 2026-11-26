import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SiteRow } from './sites/siteTypes'

/**
 * #3451 — Louis, en recette : « mets le en dessous de la carte sur toute la
 * largeur, je ne le veux plus sur cette ligne, je le veux sur la ligne du
 * dessous ». `SiteSidebar` (« Pourquoi ces sites sont prioritaires ») vivait
 * dans une 3e colonne de 320 px de la grille carte/tableau — il en sort et
 * suit en pleine largeur, sur une ligne à lui.
 */

vi.mock('./sites/FranceMapPanel', () => ({
  FranceMapPanel: () => <div data-testid="map-panel" />,
}))
vi.mock('./sites/SitesTable', () => ({
  SitesTable: () => <div data-testid="sites-table" />,
}))
vi.mock('./sites/SiteSidebar', () => ({
  SiteSidebar: () => <div data-testid="site-sidebar" />,
}))

const { SitesFranceCard } = await import('./SitesFranceCard')

const rows: SiteRow[] = [{ city: 'Lyon', latitude: 45.75, longitude: 4.85 }]

describe('SitesFranceCard — #3451 la carte « Pourquoi ces sites sont prioritaires » quitte la grille', () => {
  it('ne partage plus la grille carte/tableau : seuls la carte et le tableau y vivent', () => {
    render(
      <SitesFranceCard
        rows={rows}
        allRows={rows}
        page={1}
        onPageChange={() => {}}
        totalPages={1}
        isLoading={false}
        isFetching={false}
        hasAnySite
      />,
    )

    const grid = screen.getByTestId('sites-france-grid')
    expect(screen.getByTestId('map-panel').parentElement).toBe(grid)
    expect(screen.getByTestId('sites-table').parentElement).toBe(grid)
    expect(screen.getByTestId('site-sidebar').parentElement).not.toBe(grid)
  })

  it('suit la grille sur une ligne à elle, en pleine largeur', () => {
    render(
      <SitesFranceCard
        rows={rows}
        allRows={rows}
        page={1}
        onPageChange={() => {}}
        totalPages={1}
        isLoading={false}
        isFetching={false}
        hasAnySite
      />,
    )

    const grid = screen.getByTestId('sites-france-grid')
    const sidebar = screen.getByTestId('site-sidebar')

    expect(grid.parentElement).toBe(sidebar.parentElement)
    expect((grid.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
  })
})

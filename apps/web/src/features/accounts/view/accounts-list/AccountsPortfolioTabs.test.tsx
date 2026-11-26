import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountsPortfolioTabs, portfolioTabOf, searchForPortfolioTab } from './AccountsPortfolioTabs'

describe('Onglets du portefeuille', () => {
  it('rend les quatre onglets et signale l’actif', () => {
    render(<AccountsPortfolioTabs active="favorites" onChange={vi.fn()} />)
    for (const name of ['Tout le portefeuille', 'Favoris', 'Suivis', 'Archives']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Favoris' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('chaque onglet appelle son état', () => {
    const onChange = vi.fn()
    render(<AccountsPortfolioTabs active="all" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Suivis' }))
    expect(onChange).toHaveBeenCalledWith('followed')
    fireEvent.click(screen.getByRole('button', { name: 'Archives' }))
    expect(onChange).toHaveBeenCalledWith('archives')
  })

  it('l’URL désigne l’onglet, et le clic réécrit les seuls axes de l’onglet', () => {
    expect(portfolioTabOf({})).toBe('all')
    expect(portfolioTabOf({ favorite: 'mine' })).toBe('favorites')
    expect(portfolioTabOf({ status: 'archived' })).toBe('archives')
    expect(portfolioTabOf({ lens: 'followed', favorite: 'mine' })).toBe('followed')
    const fromFav = searchForPortfolioTab({ q: 'sg', favorite: 'mine' }, 'archives')
    expect(fromFav).toMatchObject({ q: 'sg', status: 'archived', favorite: undefined })
    // Retourner à « Tout » relâche l'archive et le suivi, mais ni la recherche ni la lentille facturation.
    const back = searchForPortfolioTab({ q: 'sg', status: 'archived', lens: 'delivery' }, 'all')
    expect(back).toMatchObject({ q: 'sg', status: undefined, lens: 'delivery', favorite: undefined })
    expect(searchForPortfolioTab({ lens: 'followed' }, 'all').lens).toBeUndefined()
  })
})

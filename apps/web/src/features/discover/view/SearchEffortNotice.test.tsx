import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { SearchEffortNotice } from './SearchEffortNotice'

describe('SearchEffortNotice — #4305.2 l’effort de la recherche est DIT, sans crédit ni fournisseur', () => {
  it('dit le nombre de sources interrogées et pourquoi la recherche s’est arrêtée', () => {
    render(<SearchEffortNotice effort={{ sourcesQueried: 4, stoppedBy: 'limit' }} />)
    const line = screen.getByTestId('search-effort')
    expect(line).toHaveTextContent('4 sources interrogées')
    expect(line).toHaveTextContent('volume demandé atteint')
  })
  it('dit quand le temps a coupé la recherche', () => {
    render(<SearchEffortNotice effort={{ sourcesQueried: 3, stoppedBy: 'time' }} />)
    expect(screen.getByTestId('search-effort')).toHaveTextContent('temps imparti')
  })
  it('dit quand les sources n’avaient plus rien à rendre', () => {
    render(<SearchEffortNotice effort={{ sourcesQueried: 1, stoppedBy: 'exhausted' }} />)
    expect(screen.getByTestId('search-effort')).toHaveTextContent('1 source interrogée')
    expect(screen.getByTestId('search-effort')).toHaveTextContent('plus rien à rendre')
  })
  it('ne parle jamais de crédit, de quota, de coût ni d’un fournisseur', () => {
    render(<SearchEffortNotice effort={{ sourcesQueried: 4, stoppedBy: 'limit' }} />)
    expect(screen.getByTestId('search-effort').textContent).not.toMatch(
      /cr[ée]dit|quota|co[uû]t|pappers|apollo|brave|firecrawl/i,
    )
  })
  it('sans effort lu : rien', () => {
    const { container } = render(<SearchEffortNotice effort={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

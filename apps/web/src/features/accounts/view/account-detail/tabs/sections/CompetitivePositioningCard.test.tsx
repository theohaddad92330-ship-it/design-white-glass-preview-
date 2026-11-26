import type { CompetitiveStrategy } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CompetitivePositioningCard } from './CompetitivePositioningCard'

/**
 * #4323.2 (recette prod 25/10, Veolia) — « 4 concurrents identifiés » au-dessus de 3 lignes rendues :
 * le compte et la liste doivent venir de la MÊME source, la liste rendue.
 */
const competitor = (name: string) => ({
  competitor: name,
  talking_point: `angle ${name}`,
  differentiator: `diff ${name}`,
})

function strategy(names: string[]): CompetitiveStrategy {
  return { positioning_statement: null, vs_competitors: names.map(competitor) } as CompetitiveStrategy
}

describe('CompetitivePositioningCard — compte = lignes rendues (#4323.2)', () => {
  it('rend une ligne par concurrent annoncé, sans en couper', async () => {
    renderWithRouter(<CompetitivePositioningCard strategy={strategy(['Capgemini', 'Sopra Steria', 'Alten', 'CGI'])} />)
    expect(await screen.findByTestId('positioning-count')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(screen.getByText('CGI')).toBeInTheDocument()
  })

  // #4323.1 (recette prod 28/10, Veolia) — « ESN présentes 11 » et « 4 concurrents » sur le même écran : deux
  // populations, deux libellés. Le compteur du positionnement DIT ce qu'il compte (les concurrents analysés pour notre
  // angle) et que ce n'est pas la liste des ESN présentes ; un chiffre nu qui contredit l'autre fait échouer ce test.
  it('le compteur nomme sa population et dit qu’il n’est pas le total des ESN présentes', async () => {
    renderWithRouter(<CompetitivePositioningCard strategy={strategy(['Capgemini', 'Sopra Steria', 'Alten', 'CGI'])} />)
    const count = await screen.findByTestId('positioning-count')
    expect(count).toHaveTextContent('4')
    expect(count).toHaveTextContent(/analysés|notre angle/i)
    expect(count).toHaveTextContent(/pas la liste des ESN présentes/i)
  })

  it('un concurrent cité deux fois compte une fois, et fait une ligne', async () => {
    renderWithRouter(<CompetitivePositioningCard strategy={strategy(['Capgemini', 'capgemini ', 'Alten'])} />)
    expect(await screen.findByTestId('positioning-count')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

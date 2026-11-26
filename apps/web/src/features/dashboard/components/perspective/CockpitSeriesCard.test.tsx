import { render, screen } from '@testing-library/react'
import type { CockpitSeries } from '@bellum/contracts'
import { CockpitSeriesCard } from './CockpitSeriesCard'

/**
 * Les deux courbes du cockpit (#1410) — ce que la CI ne pouvait pas voir.
 *
 * Ce fichier garde trois choses trouvées ou confirmées en recette live le
 * 04/09 : l'accord en nombre de l'unité, l'interruption du tracé sur une
 * semaine non mesurée, et l'absence totale de graphique quand rien n'est
 * mesuré.
 */

const PROVENANCE = {
  sources: ['bellum' as const],
  window_days: 91,
  population: 13,
  computed_at: '2026-09-04T09:00:00.000Z',
}

function series(over: Partial<CockpitSeries> = {}): CockpitSeries {
  return {
    coverage: [
      { at: '2026-06-01', value: null },
      { at: '2026-06-08', value: 0 },
      { at: '2026-06-15', value: 1 },
      { at: '2026-06-22', value: 7 },
    ],
    outreach: null,
    provenance: PROVENANCE,
    ...over,
  }
}

describe('CockpitSeriesCard', () => {
  it('accorde l’unité en nombre — « 1 compte », jamais « 1 comptes »', () => {
    render(<CockpitSeriesCard series={series()} />)
    // Mesuré en production le 04/09 : le tableau écrivait « 1 comptes ».
    // L'unité était traduite une fois, hors du point de vue du compte.
    expect(screen.getByText('1 compte')).toBeInTheDocument()
    expect(screen.getByText('7 comptes')).toBeInTheDocument()
    expect(screen.queryByText('1 comptes')).toBeNull()
  })

  it('dit « non mesurée » là où rien ne l’a été, et garde le zéro VRAI', () => {
    render(<CockpitSeriesCard series={series()} />)
    // On ne mesurait pas : ce n'est pas zéro.
    expect(screen.getByText('non mesurée')).toBeInTheDocument()
    // On mesurait, il ne s'est rien passé : ce zéro-là est vrai et il se garde.
    expect(screen.getByText('0 compte')).toBeInTheDocument()
  })

  it('INTERROMPT le tracé sur un trou plutôt que de plonger à zéro', () => {
    const { container } = render(
      <CockpitSeriesCard
        series={series({
          coverage: [
            { at: '2026-06-01', value: 5 },
            { at: '2026-06-08', value: null },
            { at: '2026-06-15', value: 6 },
            { at: '2026-06-22', value: 7 },
          ],
        })}
      />,
    )
    // Deux segments, pas un : relier les deux bords du trou inventerait la
    // pente entre eux, et un point manquant deviendrait un creux qui se lit
    // comme une chute.
    expect(container.querySelectorAll('svg path')).toHaveLength(2)
    // Et le trou se VOIT : un trait qui s'arrête sans rien se confond avec une marge.
    expect(container.querySelectorAll('svg rect[fill="var(--bellum-surface-2)"]')).toHaveLength(1)
  })

  it('n’affiche AUCUN graphique quand aucune série n’existe', () => {
    // « Si aucune série temporelle fiable n'existe, afficher une synthèse
    // statique plutôt qu'un graphique artificiel » — c'est le retour qui l'écrit.
    const { container } = render(<CockpitSeriesCard series={series({ coverage: null, outreach: null })} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('section')).toBeNull()
  })

  it('dessine une semaine mesurée ISOLÉE entre deux trous — sinon la mesure disparaît', () => {
    // Trouvé en écrivant le test d'à côté : la première version jetait tout
    // segment de moins de deux points, si bien qu'une semaine mesurée entourée
    // de deux trous n'était pas tracée du tout. C'est pire qu'un trou — la
    // mesure existait, et l'écran n'en gardait aucune trace.
    const { container } = render(
      <CockpitSeriesCard
        series={series({
          coverage: [
            { at: '2026-06-01', value: null },
            { at: '2026-06-08', value: 4 },
            { at: '2026-06-15', value: null },
          ],
        })}
      />,
    )
    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(1)
    // Un `M x,y L x,y` : deux fois la même coordonnée, ce qu'un bout de trait
    // arrondi rend comme un point.
    const d = paths[0].getAttribute('d')!
    const [debut, fin] = d.split(' ')
    expect(debut.slice(1)).toBe(fin.slice(1))
    // Et la valeur reste lisible dans le tableau, qui est la version lue.
    expect(screen.getByText('4 comptes')).toBeInTheDocument()
  })
})

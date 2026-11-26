import { SearchEmptyState } from '@bellum/ui'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

/**
 * « Une réponse juste, calculée, sans chemin depuis l'endroit où la question se
 * pose. »
 *
 * `SearchEmptyState` était un cul-de-sac PAR CONSTRUCTION : `EmptyState`, sur
 * lequel il est composé, expose `action` depuis toujours — le passe-plat, lui,
 * n'existait pas. Aucun des écrans qui l'utilisent ne pouvait donc offrir de
 * porte, quoi qu'il veuille : ce n'était pas un oubli d'écran, c'était une prop
 * absente du composant.
 *
 * Les deux cas comptent autant l'un que l'autre : l'action doit RENDRE, et
 * l'appel sans action (la majorité du dépôt) doit rester exactement ce qu'il
 * était — un état vide muet, sans contrôle fantôme à tabuler.
 */
describe('SearchEmptyState — un état vide peut porter une porte', () => {
  it("rend l'action qu'on lui confie", () => {
    render(
      <SearchEmptyState
        title="Aucun besoin identifié"
        description="Les besoins remontent des analyses."
        action={
          <a href="/discover" data-testid="door">
            Découvrir des comptes
          </a>
        }
      />,
    )

    expect(screen.getByRole('link', { name: 'Découvrir des comptes' })).toHaveAttribute('href', '/discover')
  })

  it("rend aussi bien un bouton qu'un lien — « effacer le filtre » n'est pas une route", () => {
    render(
      <SearchEmptyState
        title="Aucun besoin ne correspond aux filtres"
        description="Essaie une autre recherche."
        action={<button type="button">Effacer les filtres</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Effacer les filtres' })).toBeInTheDocument()
  })

  it("reste un état vide muet quand aucune action n'est fournie", () => {
    render(<SearchEmptyState title="Aucun résultat" description="Affine ta recherche." />)

    expect(screen.getByText('Aucun résultat')).toBeInTheDocument()
    expect(screen.getByText('Affine ta recherche.')).toBeInTheDocument()
    // Le non-régression qui compte : ~19 appels du dépôt ne passent pas
    // d'action. Aucun d'eux ne doit gagner un contrôle vide au passage.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

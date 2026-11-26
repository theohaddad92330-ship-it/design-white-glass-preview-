/**
 * #1883 — « rendre cet élément replié par défaut car il prend trop de place sur
 * le tableau principal » (onglet Sites, carte « Pourquoi ces sites sont
 * prioritaires », mesurée à 320 × 637 px sur un écran de 861 px de haut : un
 * rail entier occupé par de la MÉTHODE, à côté de la carte et du tableau qui
 * portent, eux, les faits du dossier).
 *
 * Deux choses sont tenues ici :
 *  1. replié à l'arrivée, avec le patron partagé (`CollapsedSection`, GA-26) —
 *     donc un vrai bouton, `aria-expanded`, et le contenu ABSENT du DOM plutôt
 *     que masqué par une classe qu'une feuille de style rouvrirait ;
 *  2. UNE seule commande de repli. La carte en portait deux, emboîtées : le
 *     lien « Plus / Moins » cachait un quatrième paragraphe DANS un bloc qui
 *     devient lui-même repliable. Deux mécanismes pour le même geste divergent
 *     en trois semaines — celui-ci a disparu, et son texte est remonté dans le
 *     contenu déplié. Zéro mot perdu.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SiteSidebar } from './SiteSidebar'

const TITRE = 'Pourquoi ces sites sont prioritaires'

describe('SiteSidebar — la méthode se replie, les faits gardent la place (#1883)', () => {
  it('est repliée à l’arrivée : aucune des trois raisons n’occupe le rail', () => {
    render(<SiteSidebar />)

    expect(screen.queryByText('Impact stratégique')).not.toBeInTheDocument()
    expect(screen.queryByText('Potentiel de croissance')).not.toBeInTheDocument()
    expect(screen.queryByText('Accessibilité & influence')).not.toBeInTheDocument()
  })

  it('porte un déclencheur qui se tabule, se nomme et dit son état', () => {
    render(<SiteSidebar />)

    const toggle = screen.getByRole('button', { name: TITRE })
    expect(toggle).toHaveAttribute('type', 'button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('l’ouvrir rend les trois raisons ET le détail — rien n’a été supprimé', async () => {
    const user = userEvent.setup()
    render(<SiteSidebar />)

    await user.click(screen.getByRole('button', { name: TITRE }))

    expect(screen.getByText('Impact stratégique')).toBeInTheDocument()
    expect(screen.getByText('Potentiel de croissance')).toBeInTheDocument()
    expect(screen.getByText('Accessibilité & influence')).toBeInTheDocument()
    // Le paragraphe qui vivait derrière le « Plus » : visible d'un seul geste.
    expect(screen.getByText(/Combine la densité géographique/)).toBeInTheDocument()
  })

  it('une seule commande de repli : le « Plus / Moins » emboîté a disparu', async () => {
    const user = userEvent.setup()
    render(<SiteSidebar />)

    await user.click(screen.getByRole('button', { name: TITRE }))

    expect(screen.queryByRole('button', { name: /^(Plus|Moins)$/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

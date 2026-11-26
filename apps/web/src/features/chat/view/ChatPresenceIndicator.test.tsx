import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

/**
 * #3086 — « afficher si une personne est sur une conversation » (Apricot
 * Labs, deux sièges). Le calcul (battement + lecture) est gardé par
 * `useChatPresence` côté API ; ce fichier garde l'AUTRE moitié — que le nom
 * soit RENDU, et qu'il ne le soit pas quand personne d'autre n'est mesuré.
 */
import { ChatPresenceIndicator } from './ChatPresenceIndicator'

describe('ChatPresenceIndicator', () => {
  it('personne d’autre mesuré : n’affiche RIEN — pas une pastille vide', () => {
    const { container } = render(<ChatPresenceIndicator members={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un collègue actif est NOMMÉ', () => {
    render(<ChatPresenceIndicator members={[{ firstName: 'Bedros', avatarUrl: null }]} />)
    expect(screen.getByText('Bedros est aussi ici')).toBeInTheDocument()
  })

  it('au-delà d’un collègue, la mention COMPTE — et l’infobulle les nomme tous', () => {
    render(
      <ChatPresenceIndicator
        members={[
          { firstName: 'Bedros', avatarUrl: null },
          { firstName: 'Adel', avatarUrl: null },
        ]}
      />,
    )
    expect(screen.getByText('2 collègues sont aussi ici')).toBeInTheDocument()
    expect(screen.getByTitle(/Bedros, Adel/)).toBeInTheDocument()
  })

  it('G.12 — à 606 px la pastille CÈDE de la place (min-w-0, libellé tronqué) au lieu de chevaucher « Partager »', () => {
    render(<ChatPresenceIndicator members={[{ firstName: 'Camille', avatarUrl: null }]} />)
    const label = screen.getByText('Camille est aussi ici')
    const chip = label.parentElement as HTMLElement
    // …et sait dire non : une pastille `shrink-0` ne cède jamais et déborde sur la rangée d'actions.
    expect(chip).not.toHaveClass('shrink-0')
    expect(chip).toHaveClass('min-w-0')
    expect(label).toHaveClass('truncate')
  })
})

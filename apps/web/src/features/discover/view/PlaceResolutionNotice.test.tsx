import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlaceResolutionNotice } from './PlaceResolutionNotice'

// #4429.6 — la correction de commune s'ÉCRIT au-dessus de la liste ; sans note, rien n'est dit.
describe('PlaceResolutionNotice', () => {
  it('sans note, ne rend RIEN', () => {
    const { container } = render(<PlaceResolutionNotice resolution={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme la correction', () => {
    render(
      <PlaceResolutionNotice
        resolution={{ kind: 'corrected', typed: 'Tolouse', chosen: 'Toulouse', department: 'Haute-Garonne' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Toulouse (corrigé depuis « Tolouse »)')
  })

  it('dit l’homonyme et nomme les autres candidates', () => {
    render(
      <PlaceResolutionNotice
        resolution={{
          kind: 'homonym',
          typed: 'Saint-Denis',
          chosen: 'Saint-Denis',
          department: 'La Réunion',
          alternatives: [{ name: 'Saint-Denis', department: 'Seine-Saint-Denis' }],
        }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Plusieurs communes nommées « Saint-Denis » : la plus peuplée retenue (La Réunion). Autres : Seine-Saint-Denis',
    )
  })

  it('dit qu’aucune commune ne correspond', () => {
    render(<PlaceResolutionNotice resolution={{ kind: 'none', typed: 'Xyzzy' }} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Aucune commune « Xyzzy » trouvée : recherche en texte libre sur l’adresse',
    )
  })
})

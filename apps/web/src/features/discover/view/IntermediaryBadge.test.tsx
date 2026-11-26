import { render, screen } from '@testing-library/react'
import { IntermediaryBadge } from './IntermediaryBadge'

/**
 * #2265.14 — « jamais un intermédiaire présenté comme client final sans
 * badge ». Ce qui se teste : l'état ordinaire n'affiche rien (même règle que
 * `QualificationBadge`/`AccessLevelBadge` — pas de pastille sur la majorité
 * des lignes), et seul `isIntermediary: true` déclenche l'avertissement.
 */
describe('badge intermédiaire', () => {
  it('n’affiche rien pour un candidat qui n’est pas un intermédiaire', () => {
    const { container } = render(<IntermediaryBadge candidate={{ isIntermediary: false }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affiche rien quand le classement n’est pas encore connu', () => {
    // Réponse d'avant ce déploiement, ou candidat non classé — jamais deviné.
    const { container } = render(<IntermediaryBadge candidate={{ isIntermediary: undefined }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avertit quand le candidat est un cabinet ou une plateforme', () => {
    render(<IntermediaryBadge candidate={{ isIntermediary: true }} />)
    expect(screen.getByText(/pas client final/i)).toBeInTheDocument()
  })

  // #3757.2 — une ESN (Accenture, Sopra…) n'est pas un client final : même badge,
  // même emplacement que l'intermédiaire (jamais un bloc de plus).
  it('nomme une ESN comme concurrente ou partenaire rang 2, pas client final', () => {
    render(<IntermediaryBadge candidate={{ isEsnPeer: true }} />)
    expect(screen.getByText(/ESN : concurrente ou partenaire rang 2, pas client final/)).toBeInTheDocument()
  })

  it('n’affiche rien pour un client final ni sans classement', () => {
    const a = render(<IntermediaryBadge candidate={{ isEsnPeer: false }} />)
    expect(a.container).toBeEmptyDOMElement()
    const b = render(<IntermediaryBadge candidate={{}} />)
    expect(b.container).toBeEmptyDOMElement()
  })

  it('un intermédiaire garde son propre libellé même si le drapeau ESN est posé', () => {
    render(<IntermediaryBadge candidate={{ isIntermediary: true, isEsnPeer: true }} />)
    expect(screen.getByText(/Intermédiaire/)).toBeInTheDocument()
    expect(screen.queryByText(/rang 2/i)).toBeNull()
  })

  // #3757 (reste) — un SIREN déclaré partenaire par CET espace est un fait,
  // pas une hypothèse NAF : son propre libellé, distinct de l'ESN générique.
  it('nomme un partenaire DÉCLARÉ, distinct de l’ESN concurrente supposée', () => {
    render(<IntermediaryBadge candidate={{ isDeclaredPartner: true }} />)
    expect(screen.getByText(/Partenaire déclaré, pas client final/)).toBeInTheDocument()
  })

  it('un intermédiaire garde son propre libellé même si le drapeau partenaire déclaré est posé', () => {
    render(<IntermediaryBadge candidate={{ isIntermediary: true, isDeclaredPartner: true }} />)
    expect(screen.getByText(/Intermédiaire/)).toBeInTheDocument()
    expect(screen.queryByText(/Partenaire déclaré/)).toBeNull()
  })
})

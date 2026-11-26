import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SignalSourceLink } from './SignalSourceLink'

// #3922.3 — recette AE 09/10 : « aucun signal ne porte de lien cliquable vers sa source ».
describe('SignalSourceLink — un lien par signal, ou « Sans lien vérifiable »', () => {
  it('rend un VRAI lien externe, nommé par le genre de la source (annonce légale)', () => {
    render(<SignalSourceLink url="https://www.bodacc.fr/a?id=1" sourceKind="bodacc" />)
    const link = screen.getByRole('link', { name: /Voir l.annonce/i })
    expect(link).toHaveAttribute('href', 'https://www.bodacc.fr/a?id=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('nomme chaque genre sans le confondre', () => {
    const { rerender } = render(<SignalSourceLink url="https://x.example/a" sourceKind="press" />)
    expect(screen.getByRole('link', { name: /Voir l.article/i })).toBeInTheDocument()
    rerender(<SignalSourceLink url="https://x.example/a" sourceKind="job" />)
    expect(screen.getByRole('link', { name: /Voir l.offre/i })).toBeInTheDocument()
    rerender(<SignalSourceLink url="https://x.example/a" sourceKind={null} />)
    expect(screen.getByRole('link', { name: /Voir la source/i })).toBeInTheDocument()
  })

  it('#4045.3 — sans URL : aucune ligne, aucun lien, jamais une recherche', () => {
    const { container } = render(<SignalSourceLink url={null} sourceKind="bodacc" />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('une URL non http(s) est refusée comme une absence', () => {
    render(<SignalSourceLink url="javascript:alert(1)" sourceKind="press" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/Sans lien vérifiable/)).not.toBeInTheDocument()
  })

  it('collecte antérieure au lien : l’écran le DIT au lieu de se taire', () => {
    render(<SignalSourceLink url={null} sourceKind={null} collectedBeforeLink />)
    expect(screen.queryByText(/Sans lien vérifiable/)).not.toBeInTheDocument()
    expect(screen.getByText(/collecte antérieure au lien source/i)).toBeInTheDocument()
  })
})

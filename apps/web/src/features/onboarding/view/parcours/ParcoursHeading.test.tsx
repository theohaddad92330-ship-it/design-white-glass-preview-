import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ParcoursFooter, ParcoursHeading } from './ParcoursHeading'

describe('ParcoursHeading', () => {
  it('pose le repère, le titre et le chapô, et le titre est le seul h1', () => {
    render(
      <ParcoursHeading
        kicker="Ton entreprise"
        title="Quelle est ton entreprise ?"
        lead="Un champ, rien d'engageant."
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Quelle est ton entreprise ?' })).toBeTruthy()
    expect(screen.getByText('Ton entreprise')).toBeTruthy()
    expect(screen.getByText("Un champ, rien d'engageant.")).toBeTruthy()
  })

  it('sans repère ni chapô, n’écrit rien de vide', () => {
    const { container } = render(<ParcoursHeading title="Titre" />)
    expect(container.querySelectorAll('span').length).toBe(0)
    expect(container.querySelectorAll('p').length).toBe(0)
  })
})

describe('ParcoursFooter', () => {
  it('porte le geste de retour à gauche et le geste principal à droite', () => {
    render(<ParcoursFooter start={<button>Retour</button>} end={<button>Continuer</button>} />)
    const [back, next] = screen.getAllByRole('button')
    expect(back?.textContent).toBe('Retour')
    expect(next?.textContent).toBe('Continuer')
  })
})

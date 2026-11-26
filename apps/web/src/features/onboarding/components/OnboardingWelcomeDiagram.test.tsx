import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OnboardingWelcomeDiagram } from './OnboardingWelcomeDiagram'

/**
 * #2086.17 — « Design : respiration, composition éditoriale, diagramme léger. »
 *
 * Une mise en page ne se prouve pas au code (jugement visuel, laissé à la
 * recette ÉCRAN) — mais ce que CE composant doit structurellement être se
 * prouve : purement décoratif (aucune information neuve, `BENEFITS` la dit
 * déjà en texte juste à côté) et fidèle aux TROIS étapes de la promesse
 * (#2013.9), ni plus ni moins.
 */
describe('OnboardingWelcomeDiagram — #2086.17, diagramme léger et décoratif', () => {
  it('est purement décoratif : aria-hidden, aucun rôle ni nom accessible', () => {
    const { container } = render(<OnboardingWelcomeDiagram />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    // Un lecteur d'écran qui a déjà lu les trois titres de BENEFITS n'a rien à
    // regagner à une seconde lecture du même ordre — aucun rôle ici.
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('relie les TROIS étapes de la promesse — un nœud par étape (#2013.9), jamais plus, jamais moins', () => {
    const { container } = render(<OnboardingWelcomeDiagram />)
    expect(container.querySelectorAll('circle')).toHaveLength(3)
  })

  it('ne peint aucune couleur en dur — GA-33 : uniquement `currentColor`, hérité du token posé par l’appelant', () => {
    const { container } = render(<OnboardingWelcomeDiagram />)
    const html = container.innerHTML
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComputedAt } from './ComputedAt'

/**
 * « Recalculé à 06:12 » — l'élément n°10 de la loi 2 du tome 7.
 *
 * Un chiffre affiché sans dire quand il a été calculé laisse croire qu'il est
 * d'aujourd'hui. Sur un agrégat rafraîchi une fois par nuit, c'est faux la
 * moitié de la journée.
 */
const NOW = new Date(2026, 7, 30, 14, 0, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ComputedAt — un agrégat dit QUAND il a été calculé', () => {
  it('un calcul du jour même porte son HEURE', () => {
    render(<ComputedAt at={new Date(2026, 7, 30, 6, 12, 0)} />)
    expect(screen.getByText(/06:12/)).toBeInTheDocument()
  })

  it('un calcul d’un autre jour porte sa DATE, jamais son heure seule', () => {
    // « Recalculé à 06:12 » sur un chiffre de la semaine dernière ment par
    // omission : c'est le jour qui manque.
    render(<ComputedAt at={new Date(2026, 7, 12, 6, 12, 0)} />)
    expect(screen.getByText(/12\/08\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/06:12/)).toBeNull()
  })

  it('une date de calcul INCONNUE se dit — elle ne s’affiche pas « à l’instant »', () => {
    // « Non mesuré n'est jamais 0 », transposé au temps.
    render(<ComputedAt at={null} />)
    expect(screen.getByText(/inconnue/i)).toBeInTheDocument()
  })

  it('une date ILLISIBLE se dit inconnue, elle ne se devine pas', () => {
    render(<ComputedAt at="pas une date" />)
    expect(screen.getByText(/inconnue/i)).toBeInTheDocument()
  })

  it('ne rend RIEN quand l’horodatage est indiscernable de la requête', () => {
    // Le piège central : un agrégat calculé à la volée porte l'heure du
    // chargement. « Il y a une seconde », à chaque rafraîchissement, est du
    // bruit — et c'est ainsi qu'une heure de requête se déguise en date de
    // calcul.
    const { container } = render(<ComputedAt at={NOW} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien non plus sur une horloge en avance de quelques secondes', () => {
    const { container } = render(<ComputedAt at={new Date(NOW.getTime() + 5_000)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une date FUTURE au-delà de la fenêtre se dit inconnue, pas « très fraîche »', () => {
    render(<ComputedAt at={new Date(NOW.getTime() + 3 * 86_400_000)} />)
    expect(screen.getByText(/inconnue/i)).toBeInTheDocument()
  })

  it('la date se formate dans la langue de l’APP, jamais dans celle du navigateur', () => {
    // `toLocaleDateString()` sans locale suit le runtime : un commercial
    // français dont Chrome est en anglais lisait « 8/12/2026 ». Le format
    // attendu ici est celui de `fr-FR`, la langue de l'app dans les tests.
    render(<ComputedAt at={new Date(2026, 7, 12, 6, 12, 0)} />)
    expect(screen.queryByText(/8\/12\/2026/)).toBeNull()
  })

  // #4289.8 — la date d'un plan est un instant d'ÉCRITURE persisté, pas l'heure de la requête : un plan re-planifié
  // il y a dix secondes DIT son heure, au lieu de ne rien afficher (la recette prod ne voyait « aucune date de calcul »).
  it('#4289.8 — un instant PERSISTÉ de moins d’une minute se dit quand même', () => {
    const justNow = new Date(NOW.getTime() - 10_000)
    const { container, rerender } = render(<ComputedAt at={justNow} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ComputedAt at={justNow} persisted />)
    expect(screen.getByText(/13:59|14:00/)).toBeInTheDocument()
  })

  it('#4289.8 — NON : persisté ne rend pas une date absente « maintenant »', () => {
    render(<ComputedAt at={null} persisted />)
    expect(screen.getByText(/inconnue/i)).toBeInTheDocument()
  })
})

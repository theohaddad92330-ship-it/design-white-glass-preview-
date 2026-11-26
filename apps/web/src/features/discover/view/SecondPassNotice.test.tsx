import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SecondPassNotice } from './SecondPassNotice'

// #4305 — la contrainte est lisible : le déjà-cherché et le reste à chercher, sans compteur de crédits.
describe('SecondPassNotice', () => {
  it('sans portée : rien', () => {
    const { container } = render(<SecondPassNotice scope={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avec sa portée : ce qui est déjà cherché ET ce qui reste', () => {
    render(<SecondPassNotice scope={{ shown: 12, listRemains: true, employersRemain: 7, completing: false }} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('12 comptes déjà cherchés')
    expect(status).toHaveTextContent('la suite de la liste d’entreprises')
    expect(status).toHaveTextContent('7 employeurs')
    expect(status.textContent).not.toMatch(/crédit/i)
  })

  it('une absence ne fait aucune ligne : jamais « 0 compte », jamais de reste inventé', () => {
    const { container } = render(
      <SecondPassNotice scope={{ shown: null, listRemains: false, employersRemain: null, completing: false }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('un reste sans compte déjà affiché : le reste seul, sans « 0 »', () => {
    render(<SecondPassNotice scope={{ shown: null, listRemains: false, employersRemain: 1, completing: false }} />)
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/1 employeur dont les offres ne sont pas lues/)
    expect(text).not.toMatch(/\b0\b/)
  })

  it('lot Q — un second passage en arrière-plan dit « en cours de vérification », sans chiffre inventé', () => {
    render(<SecondPassNotice scope={{ shown: 12, listRemains: false, employersRemain: 7, completing: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent('7 employeurs en cours de vérification')
  })
})

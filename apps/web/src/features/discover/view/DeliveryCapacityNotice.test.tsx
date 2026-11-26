import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeliveryCapacityNotice } from './DeliveryCapacityNotice'

/**
 * #2804 (#2291.2) — LOT j3 26/09 : « avertir », jamais exclure/réordonner.
 * Ce bandeau se contente de rappeler la capacité DÉCLARÉE, verbatim.
 */
describe('DeliveryCapacityNotice', () => {
  it('ne se rend PAS sans notice — on n’affiche pas ce qu’on n’a pas', () => {
    const { container } = render(<DeliveryCapacityNotice notice={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme les deux axes déclarés, verbatim', () => {
    render(
      <DeliveryCapacityNotice
        notice={{
          rampUpCapacity: '1-2 semaines',
          availableConsultantsBand: 'Quelques consultants disponibles en intercontrat',
        }}
      />,
    )
    expect(screen.getByText(/1-2 semaines/)).toBeInTheDocument()
    expect(screen.getByText(/Quelques consultants disponibles en intercontrat/)).toBeInTheDocument()
  })

  it('un seul axe déclaré : rien n’invente l’autre', () => {
    render(<DeliveryCapacityNotice notice={{ rampUpCapacity: '3-4 semaines' }} />)
    expect(screen.getByText(/3-4 semaines/)).toBeInTheDocument()
    expect(screen.getByRole('status').textContent).not.toMatch(/consultant/i)
  })
})

import { render, screen } from '@testing-library/react'
import { OutOfTradeMark } from './OutOfTradeMark'

// #4284.26 — le repère ne s'affiche que sur un compte que l'IA a marqué hors métier.
describe('repère « hors de ton métier »', () => {
  it('nomme le compte hors métier', () => {
    render(<OutOfTradeMark candidate={{ outOfTrade: true }} />)
    expect(screen.getByTestId('candidate-out-of-trade')).toHaveTextContent('hors de ton métier')
  })

  it('n’affiche rien sur un compte ordinaire ni sans information', () => {
    const a = render(<OutOfTradeMark candidate={{ outOfTrade: false }} />)
    expect(a.container).toBeEmptyDOMElement()
    const b = render(<OutOfTradeMark candidate={{}} />)
    expect(b.container).toBeEmptyDOMElement()
  })
})

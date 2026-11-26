import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHideOnScroll } from './useHideOnScroll'

function Probe() {
  const hidden = useHideOnScroll()
  return <span data-testid="state">{hidden ? 'caché' : 'visible'}</span>
}

/**
 * ⚠️ L'écoute est en phase de CAPTURE sur le document. Un évènement `scroll` ne
 * remonte pas, et sur cette application la page ne défile pas — c'est un
 * conteneur intérieur qui défile. Un écouteur posé sur `window` ne recevrait
 * jamais rien, et le bouton ne s'effacerait jamais.
 */
describe('useHideOnScroll', () => {
  const scroll = (top: number) => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollTop', { value: top, configurable: true })
    document.body.appendChild(el)
    act(() => {
      el.dispatchEvent(new Event('scroll', { bubbles: false }))
    })
    el.remove()
  }

  it('est visible au repos', () => {
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('state').textContent).toBe('visible')
  })

  it('s’efface quand on DESCEND', () => {
    const { getByTestId } = render(<Probe />)
    scroll(0)
    scroll(300)
    expect(getByTestId('state').textContent).toBe('caché')
  })

  it('revient quand on REMONTE', () => {
    const { getByTestId } = render(<Probe />)
    scroll(0)
    scroll(300)
    scroll(100)
    expect(getByTestId('state').textContent).toBe('visible')
  })

  it('revient toujours tout en haut', () => {
    // Un bouton absent à l'ouverture d'un écran passe pour disparu.
    const { getByTestId } = render(<Probe />)
    scroll(0)
    scroll(300)
    scroll(10)
    expect(getByTestId('state').textContent).toBe('visible')
  })

  it('ne clignote pas sur un rebond d’inertie', () => {
    const { getByTestId } = render(<Probe />)
    scroll(0)
    scroll(300)
    scroll(297)
    expect(getByTestId('state').textContent).toBe('caché')
  })
})

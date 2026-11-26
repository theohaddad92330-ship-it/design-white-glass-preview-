import { useLayoutEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMessageWindow } from './use-message-window'

/**
 * #2840 (#2441.11) — LE CÂBLAGE RÉEL DE LA VIRTUALISATION.
 *
 * `computeVirtualWindow` (`message-list-window.test.ts`) est pur et déjà
 * couvert : ce fichier teste la PARTIE QUI RESTAIT — la mesure du VRAI
 * conteneur, jamais simulée. jsdom ne calcule aucune mise en page :
 * `clientHeight` vaut 0 par défaut, donc on le force sur le NŒUD réel du
 * test (jamais sur `HTMLElement.prototype`, qui contaminerait tous les
 * tests du même process).
 */

function Harness({
  itemCount,
  mountedHeight,
  boxRef,
}: {
  itemCount: number
  mountedHeight?: number
  boxRef?: MutableRefObject<HTMLDivElement | null>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { window: virtualWindow, registerHeight } = useMessageWindow(containerRef, itemCount)
  useLayoutEffect(() => {
    for (let index = 0; index < itemCount; index += 1) registerHeight(index, 80)
    // Une seule passe : `itemCount` est fixe dans ce banc de test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount])
  return (
    <div
      ref={node => {
        containerRef.current = node
        if (boxRef) boxRef.current = node
        if (node && mountedHeight !== undefined) {
          Object.defineProperty(node, 'clientHeight', { value: mountedHeight, configurable: true })
          Object.defineProperty(node, 'scrollTop', { value: 0, configurable: true, writable: true })
        }
      }}
      data-testid="box"
    >
      <div data-testid="start">{virtualWindow.startIndex}</div>
      <div data-testid="end">{virtualWindow.endIndex}</div>
    </div>
  )
}

describe('useMessageWindow', () => {
  it('rend tout tant que le conteneur n’a pas encore de vraie hauteur mesurée (0, comme en jsdom)', () => {
    const { getByTestId } = render(<Harness itemCount={1000} />)
    expect(getByTestId('start').textContent).toBe('0')
    expect(getByTestId('end').textContent).toBe('999')
  })

  it('ne rend qu’une fenêtre autour du scroll une fois le conteneur mesuré', () => {
    const { getByTestId } = render(<Harness itemCount={1000} mountedHeight={600} />)
    // 600 px de viewport / 80 px par bulle (l'estimation par défaut) : bien
    // moins que les 1000 messages du fil.
    expect(Number(getByTestId('end').textContent)).toBeLessThan(999)
    expect(getByTestId('start').textContent).toBe('0')
  })

  it('déplace la fenêtre quand le conteneur défile', () => {
    const boxRef: MutableRefObject<HTMLDivElement | null> = { current: null }
    const { getByTestId, rerender } = render(<Harness itemCount={1000} mountedHeight={600} boxRef={boxRef} />)
    const box = boxRef.current!
    Object.defineProperty(box, 'scrollTop', { value: 40_000, configurable: true, writable: true })
    act(() => {
      box.dispatchEvent(new Event('scroll'))
    })
    rerender(<Harness itemCount={1000} mountedHeight={600} boxRef={boxRef} />)
    expect(Number(getByTestId('start').textContent)).toBeGreaterThan(0)
  })
})

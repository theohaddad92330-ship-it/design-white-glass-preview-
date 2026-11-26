import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { countWholeChips, useFittedChipCount } from './fit-suggestion-chips'

/**
 * #4594 — les amorces du /chat ne se coupent jamais en plein mot : on en
 * montre MOINS, entières. Le nombre se déduit de la largeur MESURÉE des
 * pastilles, jamais d'un nombre fixe.
 */
describe('countWholeChips', () => {
  const widths = [120, 100, 140, 90]

  it('garde toutes les pastilles quand la place suffit', () => {
    expect(countWholeChips(widths, 8, 1000)).toBe(4)
  })

  it('retire la pastille qui ne tient pas ENTIÈRE, même de quelques pixels', () => {
    // 120 + 8 + 100 + 8 + 140 = 376 ; la 4e demande 474.
    expect(countWholeChips(widths, 8, 375)).toBe(2)
    expect(countWholeChips(widths, 8, 376)).toBe(3)
  })

  it('montre zéro pastille plutôt qu’une pastille tronquée', () => {
    expect(countWholeChips(widths, 8, 119)).toBe(0)
  })

  it('une place inconnue ou négative ne montre rien', () => {
    expect(countWholeChips(widths, 8, -5)).toBe(0)
  })
})

function Harness({ available, chipWidth, count }: { available: number; chipWidth: number; count: number }) {
  const { containerRef, visibleCount } = useFittedChipCount(count)
  return (
    <div
      ref={el => {
        containerRef.current = el
        if (el) Object.defineProperty(el, 'clientWidth', { configurable: true, value: available })
      }}
      data-testid="row"
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          data-chip=""
          hidden={i >= visibleCount}
          ref={el => {
            if (el) Object.defineProperty(el, 'offsetWidth', { configurable: true, value: chipWidth })
          }}
        >
          {i}
        </button>
      ))}
    </div>
  )
}

describe('useFittedChipCount', () => {
  afterEach(cleanup)

  const shown = (root: HTMLElement) => root.querySelectorAll('button:not([hidden])').length

  it.each([
    [1485, 6],
    [390, 2],
  ])('à %i px de rangée, aucune pastille n’est tranchée', async (available, expected) => {
    // 6 pastilles de 150 px + écart 6 : 6 tiennent dans 1485, 2 dans 390 (150+6+150 = 306 ; 3e = 462).
    const { container } = render(<Harness available={available} chipWidth={150} count={6} />)
    await act(async () => {})
    expect(shown(container)).toBe(expected)
    expect(shown(container) * 150 + (shown(container) - 1) * 6).toBeLessThanOrEqual(available)
  })
})

/**
 * #4594.1 — mêmes NOMBRE de pastilles, autres LIBELLÉS (changement de fil / de compte) : les largeurs mesurées pour
 * les anciens libellés ne valent plus. La 3ᵉ « Match… » restait à moitié visible contre « Voir tout ».
 */
function LabelHarness({
  labels,
  widthOf,
  available,
}: {
  labels: string[]
  widthOf: (l: string) => number
  available: number
}) {
  const { containerRef, visibleCount } = useFittedChipCount(labels.length)
  return (
    <div
      ref={el => {
        containerRef.current = el
        if (el) Object.defineProperty(el, 'clientWidth', { configurable: true, value: available })
      }}
    >
      {labels.map((label, i) => (
        <button
          key={i}
          type="button"
          data-chip=""
          hidden={i >= visibleCount}
          ref={el => {
            if (el)
              Object.defineProperty(el, 'offsetWidth', {
                configurable: true,
                get: () => (el.hidden ? 0 : widthOf(el.textContent ?? '')),
              })
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

describe('useFittedChipCount — libellés changés à nombre égal (#4594.1)', () => {
  afterEach(cleanup)
  const widthOf = (label: string) => label.length * 10
  const shown = (root: HTMLElement) => root.querySelectorAll('button:not([hidden])').length

  it('re-mesure quand les libellés changent alors que leur nombre reste le même', async () => {
    const short = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd'] // 100 px chacune
    const long = ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30), 'd'.repeat(30)] // 300 px chacune
    const { container, rerender } = render(<LabelHarness labels={short} widthOf={widthOf} available={650} />)
    await act(async () => {})
    expect(shown(container)).toBe(4)
    rerender(<LabelHarness labels={long} widthOf={widthOf} available={650} />)
    await act(async () => {})
    // 300 + 6 + 300 = 606 ≤ 650 ; la 3ᵉ ne tient pas ENTIÈRE.
    expect(shown(container)).toBe(2)
  })
})

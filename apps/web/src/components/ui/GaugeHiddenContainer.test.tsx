import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Gauge } from '@bellum/ui'

// Recharts n'est pas ce qu'on teste : seulement QUAND la jauge le monte.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="gauge-chart">{children}</div>,
  RadialBarChart: () => null,
  RadialBar: () => null,
  PolarAngleAxis: () => null,
}))

type Callback = (entries: { contentRect: { width: number; height: number } }[]) => void
let observers: Callback[] = []
const original = global.ResizeObserver

/**
 * #4622.4 — 24 avertissements Recharts « width(-1) and height(-1) » : la jauge se montait dans un conteneur masqué,
 * mesuré à zéro. Elle ne se monte plus tant que son enveloppe n'a pas de taille non nulle (jsdom ne mesure rien :
 * on pilote le `ResizeObserver`).
 */
describe('#4622.4 — la jauge ne se monte pas dans un conteneur mesuré à zéro', () => {
  beforeEach(() => {
    observers = []
    global.ResizeObserver = class {
      constructor(callback: Callback) {
        observers.push(callback)
      }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    } as unknown as typeof ResizeObserver
  })
  afterEach(() => {
    global.ResizeObserver = original
  })

  const measure = (width: number, height: number) =>
    act(() => {
      for (const callback of observers) callback([{ contentRect: { width, height } }])
    })

  it('masquée (taille zéro) : aucun graphique, mais la barre de progression reste lisible', () => {
    render(<Gauge value={0.5} showValue />)
    measure(0, 0)
    expect(screen.queryByTestId('gauge-chart')).toBeNull()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('visible (taille non nulle) : le graphique se monte', () => {
    render(<Gauge value={0.5} />)
    measure(72, 72)
    expect(screen.getByTestId('gauge-chart')).toBeInTheDocument()
  })

  it('re-masquée : le graphique se démonte, il ne reste pas mesuré à zéro', () => {
    render(<Gauge value={0.5} />)
    measure(72, 72)
    expect(screen.getByTestId('gauge-chart')).toBeInTheDocument()
    measure(0, 0)
    expect(screen.queryByTestId('gauge-chart')).toBeNull()
  })
})

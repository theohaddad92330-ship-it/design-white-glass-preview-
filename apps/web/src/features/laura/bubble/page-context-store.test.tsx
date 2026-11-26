import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { LauraPageContext } from '@bellum/contracts'
import { resetLauraPageContext, useCurrentLauraContext, useLauraContext } from './page-context-store'

/**
 * UN ÉCRAN DÉCLARE, LA BULLE LIT — et personne ne devine.
 *
 * Le test qui compte est celui du NETTOYAGE en transition de route : l'effet de
 * nettoyage de l'écran sortant court APRÈS l'effet de l'écran entrant. Sans le
 * verrou d'empreinte, quitter un écran effacerait la déclaration du suivant, qui
 * vient d'être posée — et la bulle dirait « je ne sais pas où tu es » sur un
 * écran qui vient précisément de le dire.
 */

function Screen({ context }: { context: LauraPageContext }) {
  useLauraContext(context)
  return null
}

function Reader() {
  const context = useCurrentLauraContext()
  return <span data-testid="seen">{context ? `${context.kind}:${context.label}` : 'rien'}</span>
}

function context(overrides: Partial<LauraPageContext> = {}): LauraPageContext {
  return { kind: 'briefing', label: 'Ma journée', entityId: null, facets: [], state: 'ready', ...overrides }
}

afterEach(() => {
  cleanup()
  resetLauraPageContext()
})

describe('ce que l’écran déclare', () => {
  it('arrive jusqu’à la bulle', () => {
    render(
      <>
        <Screen context={context()} />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('seen')).toHaveTextContent('briefing:Ma journée')
  })

  it('disparaît quand l’écran se démonte', () => {
    const view = render(
      <>
        <Screen context={context()} />
        <Reader />
      </>,
    )
    view.rerender(<Reader />)
    expect(screen.getByTestId('seen')).toHaveTextContent('rien')
  })

  it('l’écran ENTRANT gagne — le sortant n’efface pas ce qui vient d’être posé', () => {
    // La transition de route réelle : le nouvel écran monte, l'ancien démonte
    // ensuite. Sans le verrou d'empreinte, la bulle retomberait sur « rien ».
    const view = render(
      <>
        <Screen context={context()} />
        <Reader />
      </>,
    )
    view.rerender(
      <>
        <Screen context={context({ kind: 'pilotage', label: 'Pilotage' })} />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('seen')).toHaveTextContent('pilotage:Pilotage')
  })

  it('un contexte INVALIDE n’est pas transmis « au cas où »', () => {
    // Le serveur le refuserait, et le tour entier échouerait au lieu de partir
    // sans contexte. Laura sans contexte plutôt que Laura muette.
    render(
      <>
        <Screen context={context({ label: 'x'.repeat(200) })} />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('seen')).toHaveTextContent('rien')
  })

  it('ne republie pas quand l’écran se rend à nouveau à l’identique', () => {
    // Un magasin qui notifie sans changer de valeur est un rendu par battement
    // de cœur — c'est ce que la sérialisation en dépendance d'effet évite.
    let reads = 0
    function CountingReader() {
      reads += 1
      const context = useCurrentLauraContext()
      return <span data-testid="seen">{context?.label ?? 'rien'}</span>
    }
    const view = render(
      <>
        <Screen context={context()} />
        <CountingReader />
      </>,
    )
    const afterFirst = reads
    view.rerender(
      <>
        <Screen context={context()} />
        <CountingReader />
      </>,
    )
    // Un seul rendu de plus : celui que React fait de toute façon. Pas de
    // cascade déclenchée par le magasin.
    expect(reads - afterFirst).toBe(1)
    expect(screen.getByTestId('seen')).toHaveTextContent('Ma journée')
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './theme-provider'

/**
 * La bascule de thème, et la transition de vue qu'elle lance.
 *
 * Ce qui se teste ici tient à un défaut trouvé en RECETTE LIVE le 26/08/2026 :
 * basculer le thème puis changer d'écran aussitôt faisait remonter
 * « InvalidStateError: Transition was aborted because of invalid state » dans
 * la console — donc dans Sentry. Le navigateur interrompt l'animation et rejette
 * `ready` ; c'est le cas NORMAL, pas une panne.
 *
 * Le thème, lui, a déjà changé quand cela arrive : `startViewTransition` a
 * exécuté son rappel. Il n'y a rien à réparer, seulement une animation qui
 * n'aura pas lieu — et un rejet à absorber.
 */
function Toggle() {
  const { resolvedTheme, toggleTheme } = useTheme()
  return (
    <button type="button" onClick={event => toggleTheme(event)}>
      {resolvedTheme}
    </button>
  )
}

/** Ce que le PROVIDER lit du document — rien de plus. La lib DOM en déclare une
 *  version bien plus large, qu'on ne peut ni construire ni remplacer sans bruit. */
type FakeTransitionDoc = { startViewTransition?: unknown }

/**
 * ⚠️ `ready` est produit PARESSEUSEMENT, et c'est ce qui rend le test tenable.
 *
 * La première version recevait la valeur toute faite, si bien qu'un
 * `Promise.reject(…)` naissait à la PRÉPARATION du test — plusieurs ticks avant
 * que le provider n'y accroche son `.catch`. Pendant cette fenêtre le rejet
 * n'est géré par personne, et Vitest le compte en « unhandled rejection » : la
 * suite web sortait en échec avec 3 121 tests au vert, ce qui est la pire
 * forme de rouge — celle qu'on finit par ignorer.
 *
 * Construit ici, le rejet naît dans le MÊME tick que le chaînage. Rien du
 * comportement observé ne change ; seule la fenêtre disparaît.
 */
function stubTransition(ready: () => unknown): void {
  ;(document as unknown as FakeTransitionDoc).startViewTransition = (cb: () => void) => {
    cb()
    return { ready: ready() }
  }
}

afterEach(() => {
  ;(document as unknown as FakeTransitionDoc).startViewTransition = undefined
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('bascule de thème — transition de vue', () => {
  it('ATTACHE un gestionnaire de rejet sur la transition — sinon l’abandon remonte en exception', async () => {
    // ⚠️ La première version de ce test écoutait `unhandledrejection` : il
    // passait AUSSI sans le `.catch`, parce que l'exécuteur de test absorbe le
    // rejet avant le navigateur. Une garde qui ne peut pas dire NON ne garde
    // rien — on observe donc directement le gestionnaire attaché à la chaîne.
    let rejectionHandled = false
    const chained = {
      then: () => chained,
      catch: () => {
        rejectionHandled = true
        return chained
      },
    }
    stubTransition(() => ({ then: () => chained }))

    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    await user.click(screen.getByRole('button'))
    expect(rejectionHandled).toBe(true)
  })

  it('bascule quand même le thème — l’animation abandonnée ne l’annule pas', async () => {
    stubTransition(() => Promise.reject(new Error('aborted')))
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    const before = screen.getByRole('button').textContent
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).not.toBe(before)
  })

  it('bascule aussi quand le navigateur ne sait pas faire de transition de vue', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    const before = screen.getByRole('button').textContent
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).not.toBe(before)
  })
})

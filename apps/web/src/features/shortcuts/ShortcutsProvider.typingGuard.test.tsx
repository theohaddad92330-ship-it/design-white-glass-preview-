import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouterState } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ShortcutsProvider } from './ShortcutsProvider'

/**
 * #3648 — « une frappe dans le composeur de /chat, pendant le chargement, part
 * ailleurs (/contacts?q=…) ». Aucun raccourci à une lettre ne se déclenche quand
 * la cible OU l'élément actif est éditable, ni quand l'URL du navigateur dit
 * /chat alors que le routeur n'a pas encore rattrapé (montage, redirection).
 */
function Probe() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  return <output data-testid="router-path">{pathname}</output>
}

describe('ShortcutsProvider — la frappe n’est jamais un raccourci (#3648)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    window.history.pushState({}, '', '/')
  })

  it('NON — « gc » tapé dans un textarea ne navigue pas', async () => {
    renderWithRouter(
      <>
        <textarea aria-label="Message" />
        <Probe />
        <ShortcutsProvider />
      </>,
    )
    const field = await screen.findByLabelText('Message')
    field.focus()
    await userEvent.keyboard('gc')
    expect(field).toHaveValue('gc')
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(screen.getByTestId('router-path').textContent).toBe('/')
  })

  it('NON — « gc » avec le routeur encore sur « / » mais l’URL du navigateur sur /chat ne navigue pas', async () => {
    window.history.pushState({}, '', '/chat')
    renderWithRouter(
      <>
        <Probe />
        <ShortcutsProvider />
      </>,
    )
    await screen.findByTestId('router-path')
    await userEvent.keyboard('gc')
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(screen.getByTestId('router-path').textContent).toBe('/')
  })

  it('OUI — « gc » hors champ, hors /chat, navigue toujours (le raccourci vit)', async () => {
    renderWithRouter(
      <>
        <Probe />
        <ShortcutsProvider />
      </>,
    )
    await screen.findByTestId('router-path')
    await userEvent.keyboard('gc')
    expect(await screen.findByText('/accounts')).toBeInTheDocument()
  })

  /**
   * #3648.1 — le corps de l'issue nomme explicitement le `contenteditable`
   * à côté de l'input et du textarea ; `isTypingTarget` le couvre déjà
   * (`target.isContentEditable === true`), mais aucun test ne le prouvait
   * avec un VRAI `keydown` (plutôt qu'un appel direct à la fonction pure).
   */
  it('NON — « gc » tapé dans un contenteditable ne navigue pas', async () => {
    renderWithRouter(
      <>
        <div aria-label="Note" contentEditable suppressContentEditableWarning />
        <Probe />
        <ShortcutsProvider />
      </>,
    )
    const field = await screen.findByLabelText('Note')
    field.focus()
    await userEvent.keyboard('gc')
    expect(screen.getByTestId('router-path').textContent).toBe('/')
  })
})

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ShortcutsProvider } from './ShortcutsProvider'

/**
 * Recette prod 02/10 : « /chat, taper sans focus dans la zone de saisie
 * déclenche des raccourcis clavier (une frappe a navigué vers /contacts?q=… ) ».
 * Écrire est le geste principal de /chat : une lettre tapée hors champ va au
 * composeur, elle n'arme pas la séquence « G puis lettre ».
 */
function Composer() {
  return (
    <form data-testid="chat-composer">
      <textarea aria-label="Message" />
    </form>
  )
}

describe('ShortcutsProvider — taper sur /chat sans focus (recette 02/10)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('une lettre tapée hors champ donne le focus au composeur', async () => {
    renderWithRouter(
      <>
        <Composer />
        <ShortcutsProvider />
      </>,
    )
    const field = await screen.findByLabelText('Message')
    expect(field).not.toHaveFocus()
    await userEvent.keyboard('g')
    expect(field).toHaveFocus()
  })

  it('« G » puis « C » hors champ n’arme PLUS la navigation quand un composeur est affiché', async () => {
    renderWithRouter(
      <>
        <Composer />
        <ShortcutsProvider />
      </>,
    )
    const field = await screen.findByLabelText('Message')
    await userEvent.keyboard('gc')
    expect(field).toHaveFocus()
    expect(window.location.pathname).not.toBe('/contacts')
  })

  it('NON — sans composeur, la séquence « G » reste armée (le raccourci vit ailleurs)', async () => {
    renderWithRouter(<ShortcutsProvider />)
    await userEvent.keyboard('g')
    expect(document.activeElement).toBe(document.body)
  })
})

describe('ShortcutsProvider — la première saisie sur /chat n’est jamais perdue (#3469)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('sur /chat, une lettre tapée alors que le focus est sur le body donne le focus au composeur', async () => {
    renderWithRouter(
      <>
        <Composer />
        <ShortcutsProvider />
      </>,
      '/chat',
    )
    const field = await screen.findByLabelText('Message')
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(field).not.toHaveFocus()
    await userEvent.keyboard('b')
    expect(field).toHaveFocus()
  })

  it('NON — une lettre tapée DANS un autre champ n’est pas volée par le composeur', async () => {
    renderWithRouter(
      <>
        <Composer />
        <input aria-label="Recherche" />
        <ShortcutsProvider />
      </>,
      '/chat',
    )
    const other = await screen.findByLabelText('Recherche')
    other.focus()
    await userEvent.keyboard('b')
    expect(other).toHaveFocus()
    expect(other).toHaveValue('b')
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { PullToRefresh } from './PullToRefresh'

function setup(enabled = true) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
  render(
    <QueryClientProvider client={client}>
      <PullToRefresh enabled={enabled}>
        <div data-testid="scroller">
          <p>contenu</p>
        </div>
      </PullToRefresh>
    </QueryClientProvider>,
  )
  return { invalidate, scroller: screen.getByTestId('scroller') }
}

function pull(target: Element, from: number, to: number) {
  fireEvent.touchStart(target, { touches: [{ clientY: from }] })
  fireEvent.touchMove(target, { touches: [{ clientY: to }] })
  fireEvent.touchEnd(target)
}

describe('PullToRefresh — #4136, tirer pour rafraîchir (mobile)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un tirage assez long, en haut de liste, invalide les requêtes', async () => {
    const { invalidate, scroller } = setup()
    await act(async () => pull(scroller, 100, 300))
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('un tirage trop court ne fait rien', async () => {
    const { invalidate, scroller } = setup()
    await act(async () => pull(scroller, 100, 120))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('n’agit PAS quand la liste n’est pas tout en haut', async () => {
    const { invalidate, scroller } = setup()
    scroller.scrollTop = 120
    await act(async () => pull(scroller, 100, 300))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('glisser vers le haut ne déclenche rien', async () => {
    const { invalidate, scroller } = setup()
    await act(async () => pull(scroller, 300, 100))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('désactivé (écran hors des quatre onglets) : aucun effet', async () => {
    const { invalidate, scroller } = setup(false)
    await act(async () => pull(scroller, 100, 300))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('annonce l’actualisation dans une zone de statut accessible, puis la retire', async () => {
    const client = new QueryClient()
    let done: () => void = () => undefined
    vi.spyOn(client, 'invalidateQueries').mockImplementation(
      () =>
        new Promise<void>(resolve => {
          done = resolve
        }),
    )
    render(
      <QueryClientProvider client={client}>
        <PullToRefresh enabled>
          <div data-testid="scroller" />
        </PullToRefresh>
      </QueryClientProvider>,
    )
    await act(async () => pull(screen.getByTestId('scroller'), 100, 300))
    expect(screen.getByRole('status')).toHaveTextContent('Actualisation…')
    await act(async () => done())
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

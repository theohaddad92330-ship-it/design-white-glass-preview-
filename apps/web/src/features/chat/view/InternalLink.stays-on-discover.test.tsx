import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { InternalLink } from './markdown'

/**
 * #3452 — « quand je clique sur découvrir ça m'ouvre une nouvelle conversation
 * laura ». Le lien « Découvrir » d'une réponse de Laura mène à /discover et
 * Y RESTE : aucun rebond /discover → /chat, ni à l'arrivée ni après coup.
 * Rejoue le geste du rapport (clic sur le lien depuis /chat), avec les DEUX
 * écrans réels en miroir : si une redirection vers /chat s'ajoutait sur le
 * chemin, la position finale le dirait.
 */
function setup() {
  const root = createRootRoute()
  const chat = createRoute({
    getParentRoute: () => root,
    path: '/chat',
    component: () => <InternalLink to="/discover" label="Découvrir" />,
  })
  const discover = createRoute({
    getParentRoute: () => root,
    path: '/discover',
    component: () => <p>ÉCRAN DÉCOUVRIR</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([chat, discover]),
    history: createMemoryHistory({ initialEntries: ['/chat'] }),
  })
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('InternalLink — « Découvrir » (#3452)', () => {
  it('ouvre /discover, y reste, et n’empile aucune entrée /chat dans l’historique', async () => {
    const router = setup()
    await userEvent.click(await screen.findByRole('link', { name: 'Découvrir' }))
    expect(await screen.findByText('ÉCRAN DÉCOUVRIR')).toBeInTheDocument()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300))
    })
    expect(router.state.location.pathname).toBe('/discover')
    expect(router.history.length).toBe(2) // /chat puis /discover : un seul saut
  })
})

import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { useDocumentTitle } from './use-document-title'

/**
 * #4625 — `/accounts/duplicates` rend « Page introuvable » (#4602) mais l'onglet restait « Bellum AI - Compte » : le
 * titre suivait la route CORRESPONDANTE, pas l'état RENDU. Défaut de famille — toute route qui lance `notFound()`
 * porte le même écart. Le titre se pose depuis UN seul endroit (`useDocumentTitle`, GA-26), donc ce test part du
 * rendu réel d'un routeur, pas d'un mock des correspondances.
 */
function renderAt(path: string) {
  const root = createRootRoute({
    component: function Root() {
      useDocumentTitle()
      return <Outlet />
    },
    notFoundComponent: () => <p>Page introuvable</p>,
  })
  const accountDetail = createRoute({
    getParentRoute: () => root,
    path: '/accounts/$id',
    beforeLoad: ({ params }) => {
      if (!/\d/.test(params.id)) throw notFound()
    },
    component: () => <p>Détail du compte</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([accountDetail]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('#4625 — le titre d’onglet suit l’état réellement rendu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    document.title = 'stale'
  })

  it('une route qui lance notFound() titre « Page introuvable · Bellum AI », pas « Compte »', async () => {
    renderAt('/accounts/duplicates')
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Page introuvable · Bellum AI'))
  })

  it('une adresse que AUCUNE route ne reconnaît titre « Page introuvable » aussi', async () => {
    renderAt('/rien-de-tel')
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Page introuvable · Bellum AI'))
  })

  it('la même route avec un vrai identifiant garde le titre du Compte', async () => {
    renderAt('/accounts/7c9e6679-7425-40de-944b-e07fc1f90ae7')
    expect(await screen.findByText('Détail du compte')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:accountDetail.title')))
    expect(document.title).not.toContain('introuvable')
  })

  it('suit la langue', async () => {
    await i18n.changeLanguage('en')
    renderAt('/accounts/duplicates')
    await screen.findByText('Page introuvable')
    await waitFor(() => expect(document.title).toBe('Page not found · Bellum AI'))
    await i18n.changeLanguage('fr')
  })
})

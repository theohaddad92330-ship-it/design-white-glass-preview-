import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// #3578 (recette Z1 04/10) — « ~10 s d'écran noir avant le formulaire » : `/demo/acces` ne doit pas attendre la session.
async function mountAt(pathname: string) {
  vi.resetModules()
  window.history.pushState({}, '', pathname)
  vi.doMock('@/lib/api-origin', () => ({ ensureApiReachable: vi.fn(() => new Promise<void>(() => {})) }))
  vi.doMock('@/components/GlobalLoadingState', () => ({ GlobalLoadingState: () => <p>chargement global</p> }))
  vi.doMock('@/stores/currentUserStore', () => ({
    useCurrentUserStore: (select: (s: { setCurrentUser: () => void }) => unknown) =>
      select({ setCurrentUser: () => {} }),
  }))
  const state = { user: null, loading: true }
  vi.doMock('./session-manager', () => ({
    sessionManager: {
      loadSession: vi.fn(() => new Promise<void>(() => {})), // la session ne répond JAMAIS (API occupée)
      subscribe: vi.fn(() => () => {}),
      getState: vi.fn(() => state),
    },
  }))
  const { SessionProvider } = await import('./session-provider')
  render(
    <SessionProvider>
      <p>formulaire</p>
    </SessionProvider>,
  )
}

describe('SessionProvider — la porte démo n’attend pas la session (#3578)', () => {
  afterEach(() => window.history.pushState({}, '', '/'))

  it('/demo/acces rend le formulaire tout de suite, session toujours en cours', async () => {
    await mountAt('/demo/acces')
    expect(screen.getByText('formulaire')).toBeInTheDocument()
    expect(screen.queryByText('chargement global')).not.toBeInTheDocument()
  })

  it('sait dire NON : une autre page attend toujours la session', async () => {
    await mountAt('/accounts')
    expect(screen.getByText('chargement global')).toBeInTheDocument()
    expect(screen.queryByText('formulaire')).not.toBeInTheDocument()
  })
})

import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route } from './$id'

type BeforeLoad = (ctx: { params: { id: string } }) => unknown

function run(id: string): unknown {
  const beforeLoad = Route.options.beforeLoad as BeforeLoad | undefined
  try {
    return beforeLoad?.({ params: { id } })
  } catch (thrown) {
    return thrown
  }
}

describe('/actions/ecritures (#5028)', () => {
  it('redirige vers le centre d’actions au lieu de lire « ecritures » comme un identifiant', () => {
    const outcome = run('ecritures')
    expect(isRedirect(outcome)).toBe(true)
    expect((outcome as { options: { to: string } }).options.to).toBe('/actions')
  })

  it('laisse passer un vrai identifiant d’action', () => {
    expect(isRedirect(run('a1b2'))).toBe(false)
  })
})

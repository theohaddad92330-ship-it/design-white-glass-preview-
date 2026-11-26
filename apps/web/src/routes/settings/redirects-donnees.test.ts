import { describe, expect, it } from 'vitest'

/**
 * #4532 / #4533 — les anciennes adresses survivent par redirection (`beforeLoad`, jamais `<Navigate>`, GA-27).
 */
async function redirectOf(load: () => Promise<{ Route: { options: { beforeLoad?: () => void } } }>) {
  const { Route } = await load()
  try {
    Route.options.beforeLoad?.()
  } catch (thrown) {
    return thrown as { options: { to: string; search?: Record<string, unknown> } }
  }
  throw new Error('aucune redirection levée')
}

describe('redirections de Mes données', () => {
  it('/settings/import → /settings/mes-donnees?tab=imports', async () => {
    const r = await redirectOf(() => import('./import') as never)
    expect(r.options.to).toBe('/settings/mes-donnees')
    expect(r.options.search).toEqual({ tab: 'imports' })
  })

  it('/settings/vivier-export → /settings/mes-donnees', async () => {
    const r = await redirectOf(() => import('./vivier-export') as never)
    expect(r.options.to).toBe('/settings/mes-donnees')
  })
})

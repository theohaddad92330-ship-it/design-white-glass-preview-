import { describe, expect, it } from 'vitest'
import { router } from './router'

/**
 * #2128.55 — un clic « précédent » du navigateur doit restaurer une position
 * de scroll proche de celle quittée. Sans `scrollRestoration`, TanStack
 * Router laisse le navigateur restaurer le scroll par défaut (souvent en
 * haut de page, avant que le contenu attendu ait fini de charger) : la
 * position réelle quittée ne revient jamais.
 */
describe('router — #2128.55 restauration du scroll', () => {
  it('active `scrollRestoration`', () => {
    expect(router.options.scrollRestoration).toBeTruthy()
  })
})

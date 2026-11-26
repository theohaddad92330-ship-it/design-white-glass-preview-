/**
 * #2155.24/.25 — LE BADGE DE NAVIGATION « CONTACTS » EST RENDU, PAS SEULEMENT
 * FORMATÉ.
 *
 * `nav-badge.test.ts` prouve que `formatNavBadgeCount` sait dire non à un
 * `0` et à un nombre à trois chiffres. Celui-ci prouve que `AppSidebar`
 * relaie vraiment le résultat jusqu'au DOM : un test qui ne testerait que le
 * formatage passerait au vert même si `CollapsibleNavItem` oubliait
 * complètement de lire la prop `badges`.
 */
import { screen } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AppSidebar } from './AppSidebar'
import { PLATFORM_SECTIONS } from './items'

describe('le badge de navigation « Contacts »', () => {
  beforeEach(() => stubMatchMedia())
  afterEach(() => vi.unstubAllGlobals())

  it('affiche le compteur fourni à côté du libellé « Contacts »', async () => {
    const [topSection] = PLATFORM_SECTIONS
    const { container } = renderWithRouter(
      <SidebarProvider>
        <AppSidebar topSection={topSection!} badges={{ '/contacts': 3 }} />
      </SidebarProvider>,
      '/accounts',
    )
    await screen.findAllByRole('link')

    const entry = container.querySelector('a[href="/contacts"]')
    expect(entry?.textContent).toContain('3')
  })

  it('n’affiche rien quand le compteur est 0 — jamais un 0 qui prétendrait avoir compté', async () => {
    const [topSection] = PLATFORM_SECTIONS
    const { container } = renderWithRouter(
      <SidebarProvider>
        <AppSidebar topSection={topSection!} badges={{ '/contacts': 0 }} />
      </SidebarProvider>,
      '/accounts',
    )
    await screen.findAllByRole('link')

    const entry = container.querySelector('a[href="/contacts"]')
    expect(entry?.textContent?.trim()).not.toMatch(/0/)
  })

  it('n’affiche rien quand aucun compteur n’est fourni — la mesure n’a pas eu lieu', async () => {
    const [topSection] = PLATFORM_SECTIONS
    const { container } = renderWithRouter(
      <SidebarProvider>
        <AppSidebar topSection={topSection!} />
      </SidebarProvider>,
      '/accounts',
    )
    await screen.findAllByRole('link')

    const entry = container.querySelector('a[href="/contacts"]')
    expect(entry).not.toBeNull()
    // Le libellé seul : aucune pilule de compteur accolée (`Badge` rend
    // toujours `rounded-full`, cf `packages/ui/src/components/badge.tsx`).
    expect(entry?.querySelectorAll('.rounded-full').length ?? 0).toBe(0)
  })
})

/**
 * jsdom n'implémente pas `matchMedia`, et la barre en dépend des deux côtés
 * (le paquet UI pour son tiroir mobile, l'application pour sa coque).
 */
function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

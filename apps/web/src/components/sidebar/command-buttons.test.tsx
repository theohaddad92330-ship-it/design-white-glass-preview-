/**
 * #2144.1/.3/.11-.16/.18 (épopée #2928) — les trois commandes du rail desktop :
 * Laura (déjà livrée, #2144.10), Analyser et Découvrir.
 *
 * Analyser : lien direct vers `/search` (#2144.14, pas de modale), bordure
 * violette distincte du remplissage plein de Laura (#2144.11/.18). Découvrir :
 * lien direct vers `/discover`, lavande (#2144.15). Les deux annoncent leur
 * état actif comme Laura (même repère `aria-current`, `laura-button-active-
 * state.test.tsx`).
 *
 * ⚠️ Intégration matin 27/09 — « Découvrir » s'est lu DEUX fois dans la
 * barre un instant : ce bouton du rail, ET l'onglet du tiroir « Prospection »
 * (#3090, 24/09, retour bêta Apricot Labs). Le retour bêta suivant le même
 * jour (#3132) a tranché : le tiroir perd son enfant « Découvrir », qui
 * doublait CE rail sur la fiche compte — voir `prospection-group.test.ts`.
 * Les requêtes ci-dessous restent scopées à l'en-tête de barre
 * (`data-slot="sidebar-header"`, où vit `topAction`, `AppSidebar.tsx`), qui
 * contient CE rail et rien du tiroir déplié plus bas — le rail est
 * maintenant la SEULE porte « Découvrir » de la barre latérale.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CustomerNavbarBody } from './CustomerNavbarBody'

/** Le rail de commandes (Laura/Analyser/Découvrir) vit dans l'en-tête de la
 *  barre — jamais dans le tiroir « Prospection » déplié plus bas, qui porte
 *  sa PROPRE entrée « Découvrir » (#3090). Scoper évite l'ambiguïté entre les
 *  deux, sans en faire disparaître un des deux. `waitFor` : la barre se rend
 *  après le premier tour de route, comme les liens qu'on y cherche ensuite. */
async function commandRail(): Promise<HTMLElement> {
  return waitFor(() => {
    const header = document.querySelector('[data-slot="sidebar-header"]')
    if (!header) throw new Error('en-tête de barre latérale introuvable')
    return header as HTMLElement
  })
}

vi.mock('@/components/sidebar/ThemeToggle', () => ({ ThemeToggle: () => null }))

function user(): SessionUser {
  return {
    id: 'u1',
    email: 'commercial@bellum-ai.com',
    email_confirmed_at: null,
    created_at: '2026-08-28T00:00:00.000Z',
    roles: ['customer'],
  }
}

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

beforeEach(() => stubMatchMedia())
afterEach(() => vi.unstubAllGlobals())

describe('Analyser ouvre /search directement', () => {
  it('est un vrai lien vers /search', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/accounts',
    )
    const link = await within(await commandRail()).findByRole('link', { name: 'Analyser' })
    expect(link).toHaveAttribute('href', '/search')
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('porte aria-current="page" sur /search', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/search',
    )
    const link = await within(await commandRail()).findByRole('link', { name: 'Analyser' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})

describe('Découvrir ouvre /discover directement', () => {
  it('est un vrai lien vers /discover', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/accounts',
    )
    const link = await within(await commandRail()).findByRole('link', { name: 'Découvrir' })
    expect(link).toHaveAttribute('href', '/discover')
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('porte aria-current="page" sur /discover', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/discover',
    )
    const link = await within(await commandRail()).findByRole('link', { name: 'Découvrir' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})

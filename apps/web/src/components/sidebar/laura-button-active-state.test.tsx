/**
 * #2144.10 (épopée #2928) — le bouton « Demander à Laura » porte un état actif
 * quand l'utilisateur est déjà sur `/chat`.
 *
 * `onLaura` existait déjà dans `CustomerNavbarBody` (il déplie
 * `SidebarConversations`) mais ne touchait jamais le bouton lui-même :
 * aucune entrée de menu, `SidebarMenuButton` n'y pose donc pas `data-active`.
 * `aria-current="page"` est le même repère que `active-entry.test.tsx` exige
 * du reste de la barre — annoncé au lecteur d'écran, pas seulement en couleur.
 */
import { screen } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'
import { CustomerNavbarBody } from './CustomerNavbarBody'

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

describe('le bouton Laura porte son état actif', () => {
  it('aria-current="page" quand on est déjà sur /chat', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/chat',
    )
    const link = await screen.findByRole('link', { name: 'Demander à Laura' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('aucun aria-current ailleurs dans le produit', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/accounts',
    )
    const link = await screen.findByRole('link', { name: 'Demander à Laura' })
    expect(link).not.toHaveAttribute('aria-current')
  })
})

// #4967.2 (recette prod 01/11) — revenir par « Demander à Laura » avec un tour en cours ouvrait un fil VIERGE.
describe('« Demander à Laura » rouvre le fil dont un tour est en cours (#4967.2)', () => {
  afterEach(() => useBackgroundTurnsStore.getState().reset())

  async function lauraHref(): Promise<string | null> {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user()} />
      </SidebarProvider>,
      '/discover',
    )
    return (await screen.findByRole('link', { name: 'Demander à Laura' })).getAttribute('href')
  }

  it('tour en cours : le lien vise CE fil, pas un fil neuf', async () => {
    useBackgroundTurnsStore.getState().begin('thread-en-cours')
    const href = await lauraHref()
    expect(href).toContain('conversationId=thread-en-cours')
    expect(href).not.toContain('fresh')
  })

  it('aucun tour : le fil neuf d’avant (#1947)', async () => {
    const href = await lauraHref()
    expect(href).toContain('fresh=')
    expect(href).not.toContain('conversationId')
  })
})

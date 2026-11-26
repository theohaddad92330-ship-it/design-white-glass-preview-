/**
 * #2144.29 (épopée #2928) — JAMAIS masquer Laura / Aujourd'hui / Paramètres,
 * ni la destination ACTIVE, depuis Préférences › Apparence.
 *
 * Mesuré le 25/09/2026 (vérif épopée #2928) : seul `/settings` était protégé
 * par `ALWAYS_VISIBLE_NAV`. Laura (`/chat`) n'a jamais cette question — elle
 * n'est pas une entrée de barre, sa porte est le bouton « Demander à Laura »
 * (voir `active-entry.test.tsx`). Mais `/briefing` (Aujourd'hui) restait
 * masquable : un utilisateur pouvait se couper de sa propre page d'accueil
 * depuis ses propres préférences. Et aucune entrée active — même hors des
 * trois protégées — ne résistait à son propre masquage : arriver sur un écran
 * qu'on avait masqué faisait disparaître l'unique repère de « où je suis ».
 */
import { screen } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'
import { AppSidebar } from './AppSidebar'
import { ALWAYS_VISIBLE_NAV, CUSTOMIZABLE_NAV, PLATFORM_SECTIONS } from './items'

describe('ALWAYS_VISIBLE_NAV protège Aujourd’hui et Réglages', () => {
  it('contient /briefing et /settings', () => {
    expect(ALWAYS_VISIBLE_NAV).toEqual(expect.arrayContaining(['/briefing', '/settings']))
  })

  it('exclut ces deux entrées de ce que Préférences › Apparence propose de masquer', () => {
    const customizable = CUSTOMIZABLE_NAV.map(entry => entry.to)
    expect(customizable).not.toContain('/briefing')
    expect(customizable).not.toContain('/settings')
  })
})

describe('une entrée masquée par préférence reste rendue quand elle est protégée ou active', () => {
  beforeEach(() => stubMatchMedia())
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('« Aujourd’hui » reste dans la barre même masqué', async () => {
    setHiddenNavItems(['/briefing', '/missions'])
    const entries = await renderedEntries('/settings')
    expect(entries).toContain('/briefing')
  })

  it('la destination ACTIVE reste dans la barre même masquée par préférence', async () => {
    setHiddenNavItems(['/accounts'])
    const entries = await renderedEntries('/accounts')
    expect(entries).toContain('/accounts')
  })

  it('une entrée masquée et NON active disparaît toujours — le masquage garde un effet', async () => {
    setHiddenNavItems(['/missions'])
    const entries = await renderedEntries('/settings')
    expect(entries).not.toContain('/missions')
  })
})

function setHiddenNavItems(hiddenNavItems: string[]): void {
  localStorage.setItem('bellum-preferences', JSON.stringify({ hiddenNavItems }))
}

async function renderedEntries(pathname: string): Promise<string[]> {
  const [topSection] = PLATFORM_SECTIONS
  const { container } = renderWithRouter(
    <PreferencesProvider>
      <SidebarProvider>
        <AppSidebar topSection={topSection!} />
      </SidebarProvider>
    </PreferencesProvider>,
    pathname,
  )
  await screen.findAllByRole('link')
  return [...container.querySelectorAll('a[href]')].map(node => node.getAttribute('href') ?? '')
}

/** jsdom n'implémente pas `matchMedia`, dont la barre dépend (tiroir mobile). */
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

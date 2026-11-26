/**
 * Coque Théo (23/10/2026) — la barre latérale des maquettes appliquées
 * (`docs/maquettes/theo-v22/_appliquees/a/today-jour.html`, `.sidebar`).
 *
 * Ce que la maquette dessine, de haut en bas : la marque ; trois commandes
 * (Demander à Laura, Découvrir, Analyser) ; la rubrique « ESPACE DE TRAVAIL »
 * et ses entrées ; un pied qui porte Intégrations, Paramètres et le BLOC
 * D'IDENTITÉ (initiales, nom, rôle). Le bloc lit l'utilisateur RÉEL — jamais la
 * personne de démonstration de la maquette (Maëlle Lorquin).
 */
import { screen, waitFor, within } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CustomerNavbarBody } from './CustomerNavbarBody'

vi.mock('@/components/sidebar/ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: { first_name: 'Ada', last_name: 'Lovelace', avatar_url: null } }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'admin', name: 'Atelier Nord', memberCount: 1 } } }),
}))

function user(): SessionUser {
  return {
    id: 'u1',
    email: 'ada@atelier-nord.fr',
    email_confirmed_at: null,
    created_at: '2026-08-28T00:00:00.000Z',
    roles: ['customer'],
  }
}

beforeEach(() =>
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
  ),
)
afterEach(() => vi.unstubAllGlobals())

function slot(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const node = document.querySelector(`[data-slot="${name}"]`)
    if (!node) throw new Error(`${name} introuvable`)
    return node as HTMLElement
  })
}

function renderSidebar(path = '/accounts') {
  return renderWithRouter(
    <SidebarProvider>
      <CustomerNavbarBody user={user()} />
    </SidebarProvider>,
    path,
  )
}

describe('Coque Théo — barre latérale', () => {
  it('les trois commandes du haut, dans l’ordre de la maquette : Laura, Découvrir, Analyser', async () => {
    renderSidebar()
    const header = await slot('sidebar-header')
    await within(header).findByRole('link', { name: 'Analyser' })
    const names = within(header)
      .getAllByRole('link')
      .map(link => link.getAttribute('aria-label'))
      .filter(Boolean)
    expect(names).toEqual(['Demander à Laura', 'Découvrir', 'Analyser'])
  })

  it('nomme sa rubrique « Espace de travail », à l’œil (et pas seulement au lecteur d’écran)', async () => {
    renderSidebar()
    const content = await slot('sidebar-content')
    const label = await within(content).findByText('Espace de travail')
    expect(label.closest('.sr-only')).toBeNull()
  })

  it('Messagerie est une entrée de la rubrique, après Actions (maquette)', async () => {
    renderSidebar()
    const content = await slot('sidebar-content')
    const mailbox = await within(content).findByRole('link', { name: 'Messagerie' })
    expect(mailbox).toHaveAttribute('href', '/mailbox')
    const labels = within(content)
      .getAllByRole('link')
      .map(link => link.textContent?.trim())
    expect(labels.indexOf('Messagerie')).toBeGreaterThan(labels.indexOf('Actions'))
  })

  it('le pied porte Intégrations et Paramètres — Paramètres a quitté la rubrique du haut', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    expect(await within(footer).findByRole('link', { name: 'Intégrations' })).toHaveAttribute('href', '/integrations')
    expect(within(footer).getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/settings')
    const content = await slot('sidebar-content')
    expect(within(content).queryByRole('link', { name: 'Paramètres' })).toBeNull()
  })

  it('le pied ne porte plus la rangée d’identité (#4520) : ni nom, ni rôle, ni espace', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    await within(footer).findByRole('link', { name: 'Intégrations' })
    expect(footer.querySelector('[data-shell="identity"]')).toBeNull()
    expect(within(footer).queryByText('Ada Lovelace')).toBeNull()
    expect(within(footer).queryByText('Admin · Atelier Nord')).toBeNull()
    expect(within(footer).queryByRole('button', { name: 'Mon compte' })).toBeNull()
    // Gardé de la vague VII : la barre lit l'utilisateur RÉEL, jamais les noms de la maquette.
    expect(screen.queryByText(/Maëlle|Lorquin/)).toBeNull()
  })

  it('le bouton de repli RESTE au pied (c’est le seul moyen de re-déplier la barre)', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    await within(footer).findByRole('link', { name: 'Intégrations' })
    expect(footer.querySelector('[data-shell="collapse-toggle"] button')).not.toBeNull()
  })
})

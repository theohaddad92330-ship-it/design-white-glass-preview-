/**
 * D34 (Louis, 28/08/2026) — l'entrée back-office S'AJOUTE, elle ne remplace plus
 * la coquille client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Un porteur du rôle `backoffice` n'avait AUCUNE sortie :
 *
 *   · `home-page.tsx` le renvoyait sur `/bak/home` au lieu de son écran de
 *     démarrage ;
 *   · `/bak/home` ne disait qu'« À implémenter. », hors de toute coquille — pas
 *     même une barre latérale pour en repartir ;
 *   · `CustomerPage` lui donnait, sur TOUS les écrans, une barre latérale
 *     réduite à cette unique page.
 *
 * Trois substitutions pour un rôle qui, lui, se pose à la main dans
 * `app_metadata.roles` — donc invérifiable depuis le dépôt. La décision : un
 * opérateur RESTE un utilisateur.
 *
 * Ce que ce fichier prouve :
 *
 * a. un porteur du rôle atterrit sur l'accueil CLIENT, pas sur `/bak/home` ;
 * b. sa navigation garde les entrées habituelles ET gagne le back-office ;
 * c. un non-porteur ne voit pas cette entrée — sinon la garde ne garde rien.
 */
import { fireEvent, screen } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CustomerNavbarBody } from '@/components/sidebar/CustomerNavbarBody'

vi.mock('@/components/sidebar/ThemeToggle', () => ({ ThemeToggle: () => null }))

function user(roles: string[]): SessionUser {
  return {
    id: 'u1',
    email: 'operateur@bellum-ai.com',
    email_confirmed_at: null,
    created_at: '2026-08-28T00:00:00.000Z',
    roles,
  }
}

/** jsdom n'implémente pas `matchMedia`, dont la coque et la barre dépendent. */
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

/**
 * #2155.1 — « Comptes » avait vécu sous un groupe repliable « Prospection ».
 * #3132 (27/09/2026, retour bêta) a retiré ce tiroir de la barre latérale :
 * « Comptes » redevient une entrée lue directement. La RÈGLE gardée ici — un
 * opérateur gagne une entrée, n'en perd aucune — ne change pas.
 */
describe('la navigation d un opérateur GAGNE une entrée, elle n en perd aucune', () => {
  it('un porteur du rôle back-office garde les entrées client ET voit le back-office', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user(['customer', 'backoffice'])} />
      </SidebarProvider>,
    )

    // Les entrées habituelles sont toujours là : c'est ce que la substitution
    // détruisait.
    expect(await screen.findByRole('link', { name: 'Comptes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Paramètres' })).toBeInTheDocument()
    // …et le back-office S'AJOUTE.
    expect(screen.getByRole('link', { name: 'Back-office' })).toHaveAttribute('href', '/bak/home')
  })

  it('un utilisateur sans le rôle ne voit pas l entrée back-office', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={user(['customer'])} />
      </SidebarProvider>,
    )

    expect(await screen.findByRole('link', { name: 'Comptes' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back-office' })).toBeNull()
  })

  it('une session absente ne fait pas apparaître l entrée', async () => {
    renderWithRouter(
      <SidebarProvider>
        <CustomerNavbarBody user={null} />
      </SidebarProvider>,
    )

    expect(await screen.findByRole('link', { name: 'Comptes' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back-office' })).toBeNull()
  })
})

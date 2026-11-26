/**
 * #4575 — les commandes du pied de la barre latérale tiennent sur UNE rangée : le chevron de repli
 * rejoint thème, langue, notifications et nouveautés au lieu de retomber à droite du bloc d'identité.
 * Prouvé sur le rendu (parenté DOM et ordre de tabulation), pas sur une classe CSS.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { waitFor, within } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CustomerNavbarBody } from './CustomerNavbarBody'

vi.mock('@/components/sidebar/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Thème" />,
}))
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

describe('#4575 — le pied de la barre latérale', () => {
  it('le chevron de repli est dans la MÊME rangée que les autres commandes, en dernier', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    const toggle = await within(footer).findByRole('button', { name: /replier/i })
    const row = toggle.closest('[data-shell="footer-actions"]')
    expect(row).not.toBeNull()
    const buttons = within(row as HTMLElement).getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(4)
    expect(buttons[buttons.length - 1]).toBe(toggle)
    expect(buttons.indexOf(toggle)).toBe(buttons.length - 1)
  })

  // Vague IX — #4520 (arrivé en parallèle) a retiré la rangée d'identité DU PIED : le compte vit sur l'avatar de
  // la barre du haut. Il n'y a donc plus de bloc à côté duquel le chevron pourrait retomber, ce que #4575 voulait
  // empêcher — la promesse qui reste à prouver, et la seule qui puisse encore casser, est « UNE seule fois » (GA-26).
  it('l’identité a quitté le pied (#4520) et le geste de repli existe UNE seule fois', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    await within(footer).findByRole('button', { name: /replier/i })
    expect(footer.querySelector('[data-shell="identity-row"]')).toBeNull()
    expect(within(footer).getAllByRole('button', { name: /replier/i })).toHaveLength(1)
  })
  // #4575.4 — « ce qui se clique se tabule » : l'ordre de tabulation suit l'ordre VISUEL. Le navigateur tabule dans
  // l'ordre du DOM tant qu'aucun `tabindex` positif ne le détourne ; on prouve donc l'ordre du DOM ET l'absence de
  // détournement, depuis le dernier lien de navigation jusqu'au chevron de repli.
  it('#4575.4 — Tab suit l’ordre visuel : navigation, puis thème, langue, cloche, nouveautés, repli', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    await within(footer).findByRole('button', { name: /replier/i })
    const row = footer.querySelector('[data-shell="footer-actions"]') as HTMLElement
    const names = within(row)
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent ?? '')
    const expected = [/thème/i, /langue|language/i, /notification/i, /nouveaut|what.?s new|changelog/i, /replier/i]
    expect(names).toHaveLength(expected.length)
    expected.forEach((pattern, rank) => expect(names[rank]).toMatch(pattern))
    // Aucun tabindex positif nulle part dans la barre : l'ordre du DOM est l'ordre de Tab.
    expect(
      document.querySelectorAll('[data-sidebar] [tabindex]:not([tabindex="0"]):not([tabindex="-1"])'),
    ).toHaveLength(0)
    // La navigation précède le pied dans le DOM.
    const content = await slot('sidebar-content')
    expect(content.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // #4575.3 — cibles ≥ 44 px (GA-30, pointeur grossier) : on serre l'espacement, jamais la zone cliquable.
  // jsdom ne mesure rien : on prouve la CLASSE qui porte la promesse, sur chacune des cinq commandes rendues.
  it('#4575.3 — chacune des cinq commandes passe à 44 px au doigt, la rangée se replie plutôt que de les rogner', async () => {
    renderSidebar()
    const footer = await slot('sidebar-footer')
    await within(footer).findByRole('button', { name: /replier/i })
    const row = footer.querySelector('[data-shell="footer-actions"]') as HTMLElement
    const buttons = within(row).getAllByRole('button')
    expect(buttons).toHaveLength(5)
    // Le thème est remplacé par un bouton nu dans CE fichier (mock plus haut) : sa classe se lit à la source.
    const [, ...real] = buttons
    for (const button of real) expect(button.className).toContain('pointer-coarse:size-11')
    expect(readFileSync(join(__dirname, 'ThemeToggle.tsx'), 'utf8')).toContain('pointer-coarse:size-11')
    // 5 × 44 px = 220 px > 216 px utiles dans un rail de 232 px : au doigt, la sixième place n'existe pas.
    expect(row.className).toContain('pointer-coarse:flex-wrap')
  })
})

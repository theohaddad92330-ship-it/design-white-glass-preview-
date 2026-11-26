/**
 * #4492.1 / #4492.3 (PR 12C, contrat validé par Louis le 24/10/2026, maquette V22 `.a14-navsub`) — LES
 * SOUS-ENTRÉES DE LA BARRE LATÉRALE.
 *
 * Sous l'entrée de la section ACTIVE, et d'elle seule : ses sous-entrées, un trait vertical à gauche, la
 * sous-entrée active surlignée ET annoncée (`aria-current`), masquées barre repliée. Elles sont LUES dans
 * `sections.ts` (`familyEntries`) — la même source que les onglets du haut (#4492.4).
 */
import { screen, within, type RenderResult } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AppSidebar } from './AppSidebar'
import { HIDDEN_WHEN_COLLAPSED } from './collapsed'
import { PLATFORM_SECTIONS } from './items'

async function renderPlatformSidebar(path: string): Promise<RenderResult> {
  const [topSection] = PLATFORM_SECTIONS
  const result = renderWithRouter(
    <SidebarProvider>
      <AppSidebar topSection={topSection!} />
    </SidebarProvider>,
    path,
  )
  await screen.findAllByRole('link')
  return result
}

/** Les sous-navigations rendues, et leurs libellés dans l'ordre. */
function subNavs(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-shell="nav-sub"]')]
}
function labels(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole('link')
    .map(link => link.textContent?.trim() ?? '')
}
function current(nav: HTMLElement): string[] {
  return [...nav.querySelectorAll('a[aria-current="page"]')].map(link => link.textContent?.trim() ?? '')
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

describe('les sous-entrées de la section active (#4492.1)', () => {
  it('Ma journée › Mon activité · Mon agenda · Équipe · Pilotage — la porte de rôle est celle de `gateNavItems`', async () => {
    const { container } = await renderPlatformSidebar('/briefing')
    const [nav, ...others] = subNavs(container)
    expect(others).toEqual([])
    // Non filtrée ici (le filtre de rôle est `gateNavItems`, `gate-nav-items.test.ts`) : les quatre.
    expect(labels(nav!)).toEqual(['Mon activité', 'Mon agenda', 'Équipe', 'Pilotage'])
    expect(current(nav!)).toEqual(['Mon activité'])
  })

  it('la vue dans l’URL allume SA sous-entrée : /briefing?vue=agenda → « Mon agenda »', async () => {
    const { container } = await renderPlatformSidebar('/briefing?vue=agenda')
    expect(current(subNavs(container)[0]!)).toEqual(['Mon agenda'])
  })

  it('/pilotage allume « Ma journée » et sa sous-entrée « Pilotage » (#4492.2)', async () => {
    const { container } = await renderPlatformSidebar('/pilotage')
    const entry = container.querySelector('a[href="/briefing"][aria-current="page"]')
    expect(entry).not.toBeNull()
    expect(current(subNavs(container)[0]!)).toEqual(['Pilotage'])
  })

  it('Contacts › Répertoire · Mes listes · Imports & sources', async () => {
    const { container } = await renderPlatformSidebar('/contacts/lists')
    const [nav] = subNavs(container)
    expect(labels(nav!)).toEqual(['Répertoire', 'Mes listes', 'Imports & sources'])
    expect(current(nav!)).toEqual(['Mes listes'])
  })

  it('Comptes › … · Mes listes de cibles — la lentille `?lens=lists` est SA sous-entrée', async () => {
    const { container } = await renderPlatformSidebar('/accounts?lens=lists')
    const [nav] = subNavs(container)
    expect(labels(nav!)).toContain('Mes listes de cibles')
    expect(current(nav!)).toEqual(['Mes listes de cibles'])
    const link = within(nav!).getByRole('link', { name: 'Mes listes de cibles' })
    expect(link.getAttribute('href')).toBe('/accounts?lens=lists')
  })

  it('une AUTRE lentille de Comptes reste « Portefeuille », jamais deux sous-entrées allumées', async () => {
    const { container } = await renderPlatformSidebar('/accounts?lens=effort')
    expect(current(subNavs(container)[0]!)).toEqual(['Portefeuille'])
  })

  it('Messagerie › À traiter · Brouillons · À venir · Historique', async () => {
    const { container } = await renderPlatformSidebar('/mailbox?vue=drafts')
    const [nav] = subNavs(container)
    expect(labels(nav!)).toEqual(['À traiter', 'Brouillons', 'À venir', 'Historique'])
    expect(current(nav!)).toEqual(['Brouillons'])
  })

  it('Actions › Mes tâches · Séquences · Automatisations', async () => {
    const { container } = await renderPlatformSidebar('/actions/sequences')
    const [nav] = subNavs(container)
    expect(labels(nav!)).toEqual(['Mes tâches', 'Séquences', 'Automatisations'])
    expect(current(nav!)).toEqual(['Séquences'])
  })

  it('Missions › les sept vues du cycle, dans l’ordre V22', async () => {
    const { container } = await renderPlatformSidebar('/missions/encaissements')
    const [nav] = subNavs(container)
    expect(labels(nav!)).toEqual([
      'Planning',
      'Relevés d’activité',
      'Notes de frais',
      'Prêt à facturer',
      'Factures',
      'Encaissements',
      'Vue financière',
    ])
    expect(current(nav!)).toEqual(['Encaissements'])
  })

  it('sait dire NON : une section sans sous-pages (Affaires) n’en déplie aucune, une section INACTIVE non plus', async () => {
    const { container } = await renderPlatformSidebar('/projects')
    expect(subNavs(container)).toEqual([])
    expect(screen.queryByText('Répertoire')).toBeNull()
  })

  it('se masque barre repliée (le rail n’a pas la place d’un mot)', async () => {
    const { container } = await renderPlatformSidebar('/contacts')
    expect(subNavs(container)[0]!.className).toContain(HIDDEN_WHEN_COLLAPSED)
  })
})

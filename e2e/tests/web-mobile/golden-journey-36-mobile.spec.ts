import { expect, test } from '@playwright/test'
import { mockSession } from '../web/x41-socle'

/**
 * #2958.67 (#2208.67, golden journey 36) — UTILISER LE PRODUIT SUR MOBILE ;
 * et #2154.25 (scénario « mobile »).
 *
 * « Le mobile est le produit, pas un repli » : une borne à 768 px, QUATRE
 * onglets, `dvh` jamais `vh` (gardes GA-28/29/30). Ce parcours le rejoue dans
 * un VRAI viewport 375×812 tactile (projet `web-mobile`), sur des écrans qui
 * portent un vrai geste — pas une capture.
 *
 * Ce que le parcours prouve :
 *  1. la navigation basse porte exactement les quatre onglets (Laura,
 *     Aujourd'hui, Comptes, Actions), chacun d'au moins 44 px de haut, et un
 *     onglet MÈNE quelque part (« Comptes » → `/accounts`) ;
 *  2. l'ancienne adresse des renouvellements (écran supprimé, #3656) redirige
 *     vers Missions ;
 *  3. aucun de ces écrans ne défile horizontalement (le corps ne dépasse pas
 *     375 px).
 */

const MIN_TARGET_PX = 44

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.describe('#2208.67 — golden journey 36 : utiliser le produit sur mobile', () => {
  test('quatre onglets, chacun ≥ 44 px, et un onglet mène quelque part', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool', 'missions'], tag: '36' })
    await page.goto('/actions')

    const nav = page.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav).toBeVisible({ timeout: 30_000 })
    const tabs = nav.getByRole('link')
    await expect(tabs).toHaveCount(4)
    await expect(nav).toContainText('Laura')
    await expect(nav).toContainText('Aujourd’hui')
    await expect(nav).toContainText('Comptes')
    await expect(nav).toContainText('Actions')
    for (const box of await tabs.evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(MIN_TARGET_PX)
    }
    expect(await noHorizontalScroll(page)).toBe(true)

    await nav.getByRole('link', { name: 'Comptes' }).click()
    await expect(page).toHaveURL(/\/accounts/, { timeout: 30_000 })
  })

  test('l’ancienne adresse des renouvellements (supprimée, #3656) mène à Missions, sans défilement horizontal', async ({
    page,
  }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool', 'missions'], tag: '36' })
    await page.goto('/missions/renouvellements')

    // #4351.1 — « En cours » n'est plus un onglet : `/missions` s'ouvre sur Planning.
    await expect(page).toHaveURL(/\/missions\/planification$/, { timeout: 30_000 })
    expect(await noHorizontalScroll(page)).toBe(true)
  })
})

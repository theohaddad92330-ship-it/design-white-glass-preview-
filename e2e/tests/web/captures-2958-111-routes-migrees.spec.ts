import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { mockSession } from './x41-socle'

/**
 * #2958.111 (GO #2208, lot ROUTES 12/10 soir) — captures desktop/mobile des
 * routes migrées.
 *
 * Les routes sont LUES dans `route-migration-registry.ts` (jamais recopiées) :
 * une route ajoutée au registre est capturée sans toucher ce fichier. Chaque
 * route est ouverte à 1280 px puis à 375 px (borne mobile = produit), doit
 * rendre quelque chose, ne déborder ni à droite ni sous le pli horizontal, et
 * est capturée ; la capture est JOINTE au rapport Playwright (un jeu par run
 * de CI). Les captures « avant » n'existent pas et ne sont pas inventées.
 *
 * Aucune donnée réelle : tout appel d'API non mocké répond 404 (socle X41).
 */

const registryFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/contracts/src/schemas/route-migration-registry.ts',
)
const routes = [
  ...new Set([...readFileSync(registryFile, 'utf8').matchAll(/currentRoute: '(\/[^']*)'/g)].map(m => m[1])),
]

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 812 },
] as const

test.describe('#2958.111 — captures desktop/mobile des routes du registre', () => {
  test('le registre fournit des routes à capturer', () => {
    expect(routes.length).toBeGreaterThanOrEqual(21)
  })

  for (const viewport of VIEWPORTS) {
    for (const route of routes) {
      test(`${viewport.name} — ${route}`, async ({ page }, testInfo) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await mockSession(page, { features: [], tag: '111', role: 'owner' })
        await page.goto(route)
        await page.waitForLoadState('load')
        await expect(page.locator('body')).not.toBeEmpty()
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 })
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${route} déborde horizontalement à ${viewport.width} px`).toBeLessThanOrEqual(1)
        const shot = await page.screenshot({ fullPage: false })
        await testInfo.attach(`${viewport.name}${route.replaceAll('/', '_')}.png`, {
          body: shot,
          contentType: 'image/png',
        })
      })
    }
  }
})

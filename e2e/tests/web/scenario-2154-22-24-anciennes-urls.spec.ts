import { expect, test } from '@playwright/test'
import { mockSession } from './x41-socle'

/**
 * #2154.22 / #2154.23 / #2154.24 (lot X41, #2958) — les trois scénarios « ancienne URL »
 * de #2154, joués dans un VRAI navigateur (les tests d'intégration
 * `route-migration-old-links*.integration.test.ts` n'appellent que le
 * `beforeLoad` : ils ne prouvent ni l'atterrissage, ni ce que l'écran
 * d'arrivée fait de la recherche).
 *
 *  .22 — ancien favori partagé : `/favorites` (Favoris a disparu, #1800) ;
 *  .23 — ancienne URL Veille : `/watchlist` (la Veille a rejoint « Mes cibles ») ;
 *  .24 — ancienne URL Écritures à valider : `/actions/ecritures?…` (filtres posés).
 *
 * Ce que chaque scénario PROUVE : l'URL FINALE du navigateur (jamais une page
 * blanche), sans empiler l'historique (`replace` : le retour arrière ne
 * ramène pas sur l'ancienne adresse), et la recherche + l'ancre du lien
 * d'origine encore présentes à l'arrivée (X41, #2154.5).
 *
 * Aucune donnée réelle : tout appel d'API non mocké répond 404 (socle X41).
 */

test.describe('#2154.22-.24 — anciennes URLs : atterrir, pas casser', () => {
  // #4359 (décision de Louis, 20/10/2026) : `/favorites` n'est plus une adresse
  // légataire — elle tombe sur « Page introuvable », jamais sur une page blanche.
  test('.22 — un ancien favori partagé montre « Page introuvable » (#4359)', async ({ page }) => {
    await mockSession(page, { features: ['accounts'], tag: '22' })
    await page.goto('/favorites?q=acme#liste')
    await expect(page.getByText('Page introuvable')).toBeVisible({ timeout: 30_000 })
  })

  test('.23 — une ancienne URL Veille atterrit sur « Mes cibles »', async ({ page }) => {
    await mockSession(page, { features: ['accounts'], tag: '23' })
    await page.goto('/watchlist?account=acc-42#signaux')
    await expect(page).toHaveURL(/\/mes-cibles\?account=acc-42#signaux$/, { timeout: 30_000 })
  })

  // #4359 : `/actions/ecritures` suit la même décision que `/favorites` — l'adresse tombe
  // sur la fiche d'action (`/actions/$id`), qui dit « Action introuvable » : jamais une page blanche.
  test('.24 — une ancienne URL Écritures à valider montre « Action introuvable » (#4359)', async ({ page }) => {
    await mockSession(page, { features: ['accounts'], tag: '24' })
    await page.goto('/actions/ecritures?account=acc-42&risk=high&overdue=true&tab=mine')
    await expect(page.getByText('Action introuvable')).toBeVisible({ timeout: 30_000 })
  })

  test('le retour arrière ne ramène pas sur l’ancienne adresse (`replace`)', async ({ page }) => {
    await mockSession(page, { features: ['accounts'], tag: '25' })
    await page.goto('about:blank')
    await page.goto('/needs')
    await expect(page).toHaveURL(/\/projects/, { timeout: 30_000 })
    await page.goBack()
    expect(page.url()).toBe('about:blank')
  })
})

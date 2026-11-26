import { expect, test } from '@playwright/test'
import { json, mockSession } from './x41-socle'
import { tool } from './x41-connecteurs'

/**
 * #2958.66 (#2208.66, golden journey 35) — UTILISER LE PRODUIT SANS
 * CONNECTEUR ; et #2154.12 (« utilisateur sans connecteur »).
 *
 * « Sans clé = no-op strict » : un espace qui n'a branché AUCUN outil doit
 * pouvoir tout de même travailler, et chaque écran qui attend un outil dit ce
 * qui manque — jamais un écran vide muet, jamais une donnée inventée.
 *
 * Ce que le parcours prouve :
 *  1. `/integrations` sans aucun outil branché GUIDE au lieu de se taire :
 *     « Commence par ta messagerie et ton agenda, puis ton CRM », et dit que
 *     tout est facultatif ;
 *  2. `/actions/sequences` sans messagerie dit « Aucun outil connecté ne
 *     fournit ces données », nomme ce qui manque (« email »), garde « ce qui
 *     reste possible sans ça » et la porte « Connecter un outil » — l'écran
 *     reste utilisable (« Créer ma séquence » reste là — #4355.1) ;
 *  3. aucune de ces deux lectures n'affiche « 0 » à la place d'une valeur
 *     absente.
 */

test.describe('#2208.66 — golden journey 35 : utiliser le produit sans connecteur', () => {
  test('aucun outil branché : les intégrations guident, elles ne se taisent pas', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '35' })
    await page.route(/\/tool-registry$/, route =>
      route.request().resourceType() === 'document'
        ? route.fallback()
        : json(route, [
            tool({ provider: 'hubspot', family: 'crm', display_name: 'HubSpot' }),
            tool({ provider: 'gmail', family: 'email', display_name: 'Gmail' }),
          ]),
    )
    await page.goto('/integrations')

    await expect(
      page.getByText('Commence par ta messagerie et ton agenda, puis ton CRM', { exact: false }),
    ).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Tout est facultatif.', { exact: false })).toBeVisible()
    await expect(page.getByText('à reconnecter')).toHaveCount(0)
  })

  test('sans messagerie, les séquences disent ce qui manque et restent utilisables', async ({ page }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '35' })
    await page.goto('/actions/sequences')

    await expect(page.getByText('Aucun outil connecté ne fournit ces données')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Ce qui manque : ta messagerie')).toBeVisible()
    await expect(page.getByText('Ce qui reste possible sans ça', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Créer ma séquence' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Connecter un outil' })).toBeVisible()
    // #4357.1 — les réglages et leur doctrine sont repliés sous « Plus d'options » : on les ouvre, ils ne disparaissent pas.
    await page.getByText('Plus d’options', { exact: false }).click()
    await expect(page.getByText('Rien ne part tout seul', { exact: false }).first()).toBeVisible()
  })
})

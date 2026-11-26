import { expect, test } from '@playwright/test'
import { mockNeedWithMatching, openMatchingDrawer } from './golden-journey-matching-fixtures'

/**
 * #2208.44 (golden journey 13) — COMPARER LES PROFILS.
 *
 * Dans le classement, cocher deux profils ouvre un tableau côte à côte :
 * les mêmes lignes pour chacun (preuves, écarts, risques, conditions), et
 * « non renseigné » quand une donnée manque — jamais une case vide ou un 0.
 * Un seul profil coché ne compare rien : le tableau n'apparaît pas.
 */

const USER_ID = '4b7a4b1e-0013-4a11-9c33-2208440000ab'

test.describe('#2208.44 — golden journey : comparer les profils', () => {
  test('deux profils cochés ouvrent la comparaison, un seul non', async ({ page }) => {
    await mockNeedWithMatching(page, { userId: USER_ID, tag: '220844' })
    await openMatchingDrawer(page)

    await page.getByRole('checkbox', { name: 'Sélectionner Sophie M. pour la comparaison' }).check()
    await expect(page.getByText('Preuves', { exact: true })).not.toBeVisible()

    await page.getByRole('checkbox', { name: 'Sélectionner Pierre L. pour la comparaison' }).check()
    await expect(page.getByText('Preuves', { exact: true })).toBeVisible()
    await expect(page.getByText('Écarts', { exact: true })).toBeVisible()
    await expect(page.getByText('Risques', { exact: true })).toBeVisible()
    await expect(page.getByText('Conditions', { exact: true })).toBeVisible()
    // La donnée absente se NOMME, elle ne se laisse pas en blanc.
    await expect(page.getByText('Non renseignées').first()).toBeVisible()

    // Décocher le second referme la comparaison.
    await page.getByRole('checkbox', { name: 'Sélectionner Pierre L. pour la comparaison' }).uncheck()
    await expect(page.getByText('Preuves', { exact: true })).not.toBeVisible()
  })
})

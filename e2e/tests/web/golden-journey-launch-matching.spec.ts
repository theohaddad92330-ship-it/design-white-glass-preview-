import { expect, test } from '@playwright/test'
import { mockNeedWithMatching, NEED_ID } from './golden-journey-matching-fixtures'

/**
 * #2208.43 (golden journey 12) — LANCER LE MATCHING.
 *
 * Depuis la fiche d'un besoin, un clic lance le matching — et un seul : le
 * geste écrit un journal de conformité, il n'est donc jamais déclenché par un
 * simple rendu. Le résultat est lisible : le profil recommandé porte un score
 * ET ses axes, jamais un chiffre nu.
 */

const USER_ID = '4b7a4b1e-0012-4a11-9c33-2208430000ab'

test.describe('#2208.43 — golden journey : lancer le matching', () => {
  test('un clic sur « Lancer le matching » rend des profils classés, avec leurs axes', async ({ page }) => {
    const matching = await mockNeedWithMatching(page, { userId: USER_ID, tag: '220843' })

    await page.goto(`/projects/needs/${NEED_ID}`)
    await expect(page.getByText('Plateforme data EDF')).toBeVisible({ timeout: 30_000 })

    // Aucun matching tant que personne n'a cliqué : l'ouverture de la fiche n'écrit rien.
    expect(matching.matchesRun()).toBe(0)

    await page.getByRole('button', { name: 'Lancer le matching' }).click()

    await expect(page.getByText('Sophie M.', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Pierre L.', { exact: true })).toBeVisible()
    expect(matching.matchesRun()).toBe(1)

    // Un score n'est jamais nu : la correspondance porte son axe non évaluable, NOMMÉ.
    await expect(page.getByText('Correspondance').first()).toBeVisible()
    await expect(page.getByText('Non évaluable ici : Langue').first()).toBeVisible()
  })
})

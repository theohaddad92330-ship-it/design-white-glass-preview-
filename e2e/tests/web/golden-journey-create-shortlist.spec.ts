import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import {
  mockNeedWithMatching,
  NEED_ID,
  openMatchingDrawer,
  PIERRE_ID,
  RUN_ID,
  SOPHIE_ID,
} from './golden-journey-matching-fixtures'

/**
 * #2208.46 (golden journey 15) — CRÉER UNE SHORTLIST.
 *
 * Deux profils cochés dans le classement → « Créer une shortlist (2) » : le
 * serveur reçoit LE run du classement et EXACTEMENT les deux identifiants
 * cochés — jamais le classement entier. La confirmation dit combien de
 * profils sont figés. Le bouton n'existe pas tant que rien n'est coché.
 */

const USER_ID = '4b7a4b1e-0015-4a11-9c33-2208460000ab'

test.describe('#2208.46 — golden journey : créer une shortlist', () => {
  test('fige les deux profils cochés, et seulement eux', async ({ page }) => {
    await mockNeedWithMatching(page, { userId: USER_ID, tag: '220846' })
    const bodies: unknown[] = []
    await page.route(`**/needs/${NEED_ID}/shortlists`, route => {
      if (route.request().method() !== 'POST') return fulfillJson(route, [])
      bodies.push(route.request().postDataJSON())
      return fulfillJson(route, {
        id: 'sl-1',
        needId: NEED_ID,
        runId: RUN_ID,
        consultantIds: [SOPHIE_ID, PIERRE_ID],
      })
    })
    await openMatchingDrawer(page)

    await expect(page.getByRole('button', { name: /Créer une shortlist/ })).not.toBeVisible()

    await page.getByRole('checkbox', { name: 'Sélectionner Sophie M. pour la comparaison' }).check()
    await page.getByRole('checkbox', { name: 'Sélectionner Pierre L. pour la comparaison' }).check()
    await page.getByRole('button', { name: 'Créer une shortlist (2)' }).click()

    await expect(page.getByText('Shortlist figée avec 2 profil(s)')).toBeVisible()
    expect(bodies).toEqual([{ runId: RUN_ID, consultantIds: [SOPHIE_ID, PIERRE_ID] }])
  })
})

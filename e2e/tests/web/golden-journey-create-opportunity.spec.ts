import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * #2208.41 (golden journey 10) — CRÉER UNE OPPORTUNITÉ.
 *
 * Depuis le pipe, « Ouvrir une affaire » sur un compte de l'espace : deux
 * champs suffisent (le compte, le nom) et le bouton reste éteint tant qu'ils
 * manquent. Un montant laissé vide part à `null`, JAMAIS à 0 € — un montant
 * inconnu n'est pas un montant nul (doctrine : « non mesuré » ≠ 0).
 */

const USER_ID = '4b7a4b1e-0010-4a11-9c33-2208410000ab'
const ACCOUNT_ID = 'a1b2c3d4-0010-4a11-8c33-220841000001'
const NEW_PROJECT_ID = '88888888-8888-4888-8888-888888888888'

test.describe('#2208.41 — golden journey : créer une opportunité', () => {
  test('compte + nom suffisent ; le montant vide reste inconnu, pas 0 €', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220841', features: ['needs', 'pipe'] })
    await page.route(/\/accounts\?/, route =>
      fulfillJson(route, {
        data: [{ id: ACCOUNT_ID, company_name: 'ACME' }],
        pagination: { hasNext: false, currentPage: 1, size: 100, totalItems: 1 },
      }),
    )
    const created: Array<Record<string, unknown>> = []
    await page.route(/\/projects(\?|$)/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() !== 'POST') return route.fallback()
      created.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, {
        project: { id: NEW_PROJECT_ID, label: 'Migration data lake' },
        renewal_linked: false,
      })
    })

    // TanStack Router lit `create=1` comme le NOMBRE 1 : le schéma attend la chaîne "1" (`create=%221%22`).
    await page.goto('/projects?create=%221%22')
    await expect(page.getByText('Ouvrir une affaire')).toBeVisible({ timeout: 30_000 })

    // Rien d'obligatoire n'est rempli : le bouton ne laisse rien partir.
    await expect(page.getByRole('button', { name: /Créer l.affaire/ })).toBeDisabled()

    await page.getByRole('combobox', { name: 'Compte' }).click()
    await page.getByRole('option', { name: 'ACME' }).click()
    await expect(page.getByRole('button', { name: /Créer l.affaire/ })).toBeDisabled()
    await page.getByLabel(/Nom de l.affaire/).fill('Migration data lake')
    await page.getByRole('button', { name: /Créer l.affaire/ }).click()

    await expect(page.getByText('Affaire créée')).toBeVisible()
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      account_id: ACCOUNT_ID,
      label: 'Migration data lake',
      estimated_amount: null,
      expected_close_on: null,
    })
  })
})

import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import { mockProjectDossier, PROJECT_ID, SUBMISSION_ID } from './golden-journey-dossier-fixtures'

/**
 * #2208.50 (golden journey 19) — SÉCURISER CLIENT ET CONSULTANT.
 *
 * En négociation, le bouton d'entête dit « Sécuriser les deux accords » et
 * mène aux conditions commerciales (côté client). Côté consultant, son accord
 * se déclare sur le positionnement : « Non déclaré » par défaut — jamais un
 * « Oui » supposé — et la date ne se demande qu'une fois l'accord déclaré.
 */

const USER_ID = '4b7a4b1e-0019-4a11-9c33-2208500000ab'

test.describe('#2208.50 — golden journey : sécuriser client et consultant', () => {
  test('les conditions client, puis l’accord du consultant déclaré avec sa date', async ({ page }) => {
    await mockProjectDossier(page, { userId: USER_ID, tag: '220850', stage: 'negotiation' })
    const details: Array<Record<string, unknown>> = []
    await page.route(`**/submissions/${SUBMISSION_ID}/details`, route => {
      details.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, { id: SUBMISSION_ID })
    })

    await page.goto(`/projects/${PROJECT_ID}`)
    await page.getByRole('button', { name: 'Sécuriser les deux accords' }).click()
    await expect(page.getByText('Qualification (budget, besoin, décideur, délai, moyens, projet)')).toBeInViewport()

    await page.getByRole('button', { name: 'Détails', exact: true }).click()
    await expect(page.getByText('Détails du positionnement de Sophie M.')).toBeVisible()
    // Rien n'est déclaré par défaut : la date n'est pas demandée.
    await expect(page.getByLabel('Date de l’accord')).not.toBeVisible()

    await page.getByRole('combobox', { name: 'Accord du consultant' }).click()
    await page.getByRole('option', { name: 'Oui' }).click()
    await page.getByLabel('Date de l’accord').fill('2026-10-01')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

    await expect.poll(() => details.length).toBe(1)
    expect(details[0]).toMatchObject({ consultantAgreement: true, consultantAgreementDate: '2026-10-01' })
  })
})

import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import { mockProjectDossier, PROJECT_ID, SUBMISSION_ID } from './golden-journey-dossier-fixtures'

/**
 * #2208.49 (golden journey 18) — PASSER EN ENTRETIEN.
 *
 * Dès qu'un entretien existe, le bouton d'entête du dossier devient
 * « Préparer l'entretien » (le signal est `interview_count`, jamais une étape
 * inventée). Planifier un entretien exige une date : le bouton « Planifier »
 * reste éteint sans elle, puis part avec la date, le format choisi et les
 * personnes du client — la date part chez le commercial ET chez le client.
 */

const USER_ID = '4b7a4b1e-0018-4a11-9c33-2208490000ab'

test.describe('#2208.49 — golden journey : passer en entretien', () => {
  test('planifier un entretien exige une date, puis l’envoie avec son format et ses participants', async ({ page }) => {
    await mockProjectDossier(page, { userId: USER_ID, tag: '220849', stage: 'profiles_submitted', interviewCount: 1 })
    const interviews: Array<Record<string, unknown>> = []
    await page.route(`**/submissions/${SUBMISSION_ID}/interviews`, route => {
      if (route.request().method() !== 'POST') return fulfillJson(route, { items: [] })
      interviews.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, { id: 'iv-1' })
    })

    await page.goto(`/projects/${PROJECT_ID}`)
    // Deux : celui de l'entête du dossier (entretien existant) + celui de la ligne du positionnement.
    await expect(page.getByRole('button', { name: 'Préparer l’entretien' })).toHaveCount(2, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Suivre les retours' })).not.toBeVisible()

    await page.getByRole('button', { name: 'Planifier un entretien' }).click()
    await expect(page.getByText('Planifier un entretien avec Sophie M.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Planifier', exact: true })).toBeDisabled()

    await page.getByLabel('Date et heure').fill('2026-10-12T14:30')
    await page.getByRole('button', { name: 'Sur site' }).click()
    await page.getByLabel('Personnes côté client').fill('Claire Martin, Paul Durand')
    await page.getByRole('button', { name: 'Planifier', exact: true }).click()

    await expect.poll(() => interviews.length).toBe(1)
    expect(interviews[0]).toMatchObject({ mode: 'onsite', clientAttendees: ['Claire Martin', 'Paul Durand'] })
    expect(String(interviews[0]?.['scheduledAt'])).toContain('2026-10-12')
  })
})

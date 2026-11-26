import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import { mockProjectDossier, PROJECT_ID, SUBMISSION_ID } from './golden-journey-dossier-fixtures'

/**
 * #2208.48 (golden journey 17) — SUIVRE LE FEEDBACK.
 *
 * Un profil est présenté, aucun entretien n'est encore posé : le bouton
 * d'entête du dossier dit « Suivre les retours » (jamais « Préparer
 * l'entretien », qui exigerait un entretien) et mène à la section des
 * positionnements. Le retour du client s'y note axe par axe : un axe dont il
 * n'a pas parlé reste « non abordé » — jamais un « en dessous » que personne
 * n'a formulé — et le serveur reçoit les neuf axes, pas seulement ceux touchés.
 */

const USER_ID = '4b7a4b1e-0017-4a11-9c33-2208480000ab'

test.describe('#2208.48 — golden journey : suivre le feedback', () => {
  test('« Suivre les retours » mène aux positionnements, et le retour client s’enregistre', async ({ page }) => {
    await mockProjectDossier(page, { userId: USER_ID, tag: '220848', stage: 'profiles_submitted' })
    const feedbacks: Array<Record<string, unknown>> = []
    await page.route(`**/submissions/${SUBMISSION_ID}/feedback`, route => {
      if (route.request().method() !== 'POST') return fulfillJson(route, { items: [] })
      feedbacks.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, { id: 'fb-1' })
    })

    await page.goto(`/projects/${PROJECT_ID}`)
    await expect(page.getByRole('button', { name: 'Suivre les retours' })).toBeVisible({ timeout: 30_000 })
    // « Préparer l'entretien » n'existe QUE sur la ligne du positionnement (brief toujours
    // proposé) : l'entête, lui, ne le dit pas tant qu'aucun entretien n'existe.
    await expect(page.getByRole('button', { name: 'Préparer l’entretien' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Suivre les retours' }).click()
    await expect(page.getByText('Profils positionnés')).toBeInViewport()
    await expect(page.getByText('Sophie M.', { exact: true })).toBeVisible()
    await expect(page.getByText('1 CV envoyé')).toBeVisible()
    // Le délai de retour n'est pas mesurable : on le dit, on ne l'affiche pas à 0.
    await expect(page.getByText('Délai de retour pas encore mesurable')).toBeVisible()

    await page.getByRole('button', { name: 'Noter le retour client' }).click()
    await expect(page.getByText('Retour du client sur Sophie M.')).toBeVisible()
    await page.getByRole('button', { name: 'Correspond' }).first().click()
    await page.getByPlaceholder(/Bon profil mais on cherchait plus senior/).fill('Très bon profil technique.')
    await page.getByRole('button', { name: 'Enregistrer le retour' }).click()

    await expect.poll(() => feedbacks.length).toBe(1)
    expect(feedbacks[0]).toMatchObject({
      technical: 'meets',
      experience: 'unknown',
      verbatim: 'Très bon profil technique.',
    })
  })
})

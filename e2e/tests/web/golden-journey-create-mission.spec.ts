import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import { mockProjectDossier, PROJECT_ID } from './golden-journey-dossier-fixtures'

/**
 * #2208.51 (golden journey 20) — CRÉER LA MISSION.
 *
 * Signer une affaire crée la mission — et le dit AVANT : aucun chemin ne
 * supprime une mission ensuite (l'historique de facturation s'y accroche).
 * #4195 (épopée #4191, lot L4) : ce n'est plus une case à cocher mais un effet
 * ANNONCÉ — le serveur crée une mission par positionnement retenu à la
 * signature ; le client n'envoie plus `create_mission`.
 */

const USER_ID = '4b7a4b1e-0020-4a11-9c33-2208510000ab'

async function openSignMove(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/projects/${PROJECT_ID}`)
  await page.getByRole('button', { name: 'Changer d’étape' }).click()
  await page.getByRole('menuitem', { name: 'Signé' }).click()
  await expect(page.getByText('Déplacer vers « Signé »')).toBeVisible()
}

test.describe('#2208.51 — golden journey : créer la mission', () => {
  test('signer annonce la mission et avertit qu’elle est définitive — sans case à cocher', async ({ page }) => {
    await mockProjectDossier(page, { userId: USER_ID, tag: '220851', stage: 'negotiation' })
    const moves: Array<Record<string, unknown>> = []
    await page.route(`**/projects/${PROJECT_ID}/stage`, route => {
      moves.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, { project: { id: PROJECT_ID, stage: 'won' }, effects: [] })
    })

    await openSignMove(page)

    await expect(
      page.getByText(/La mission sera créée.*Il n’existe aucun moyen de la supprimer ensuite\./),
    ).toBeVisible()
    await expect(page.getByText('Créer la mission', { exact: true })).toHaveCount(0)
    expect(moves).toHaveLength(0)

    await page.getByRole('button', { name: 'Déplacer', exact: true }).click()

    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0]).toMatchObject({ stage: 'won' })
    // La création est faite par le serveur à la signature, plus demandée par le client.
    expect(moves[0]?.['accepted_actions'] ?? []).not.toContain('create_mission')
  })

  test('« Déplacer seulement » signe sans créer de mission', async ({ page }) => {
    await mockProjectDossier(page, { userId: USER_ID, tag: '220851', stage: 'negotiation' })
    const moves: Array<Record<string, unknown>> = []
    await page.route(`**/projects/${PROJECT_ID}/stage`, route => {
      moves.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, { project: { id: PROJECT_ID, stage: 'won' }, effects: [] })
    })

    await openSignMove(page)
    await page.getByRole('button', { name: 'Déplacer seulement' }).click()

    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0]?.['accepted_actions']).not.toContain('create_mission')
  })
})

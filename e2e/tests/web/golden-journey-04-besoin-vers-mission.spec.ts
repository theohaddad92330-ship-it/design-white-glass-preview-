import { expect, test, type Page } from '@playwright/test'
import { GJ4, mockNeedToMissionWorld } from './golden-journey-need-to-mission-world'

/**
 * #2446.17 (golden journey 4, lot M12 09/10) — DU BESOIN À LA MISSION, D'UN SEUL
 * TENANT.
 *
 * Les tranches existaient séparément (`golden-journey-need-to-consultant`,
 * `-launch-matching`, `-create-shortlist`, `-present-consultant`,
 * `-start-interview`, `-secure-both-agreements`, `-create-mission`), chacune
 * sur son propre jeu de données. Ce spec les ENCHAÎNE sur UN monde
 * (`golden-journey-need-to-mission-world.ts`) : le consultant enregistré depuis
 * la fiche du besoin est celui que le matching classe, que l'on positionne, que
 * l'on fait passer en entretien, dont on déclare l'accord, et dont la signature
 * propose la mission. Aucun `page.goto` après le premier : chaque écran est
 * atteint par un clic de l'écran précédent — c'est la continuité que l'épopée
 * #2773 demande, pas une juxtaposition.
 *
 * Doctrine assertée en chemin, pas seulement rendue : enregistrer n'est pas
 * positionner ; le matching ne débite aucun crédit ; rien n'est écrit avant la
 * confirmation d'un positionnement ; la mission n'est créée que si on l'accepte.
 */

const writesOf = (world: { writes: readonly { key: string }[] }, key: string) =>
  world.writes.filter(write => write.key === key).length

async function moveProjectTo(page: Page, stageLabel: string): Promise<void> {
  await page.getByRole('button', { name: 'Changer d’étape' }).click()
  await page.getByRole('menuitem', { name: stageLabel }).click()
  await expect(page.getByText(`Déplacer vers « ${stageLabel} »`)).toBeVisible()
}

test.describe('#2446.17 — golden journey 4 : du besoin à la mission démarrée, sans rupture', () => {
  test('besoin → consultant → matching → positionnement → entretien → accords → mission', async ({ page }) => {
    // Huit écrans enchaînés sur un build de prod : le plafond par défaut (30 s) tient UN écran.
    test.setTimeout(240_000)
    const world = await mockNeedToMissionWorld(page)

    // 1. La fiche du besoin.
    await page.goto(`/projects/needs/${GJ4.needId}`)
    await expect(page.getByRole('heading', { name: GJ4.needTitle }).first()).toBeVisible({ timeout: 30_000 })

    // 2. Enregistrer un consultant EN PLACE (la troisième porte).
    await page.getByRole('button', { name: 'Enregistrer un consultant' }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Nom complet').fill(GJ4.consultantName)
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(() => writesOf(world, 'POST /consultants')).toBe(1)
    const next = page.getByTestId('need-door-next-gesture')
    await expect(next).toContainText(GJ4.consultantName)
    expect(world.writes.some(write => write.key.includes('/submissions'))).toBe(false)

    // 3. Le rapprochement : gratuit, et il classe CE consultant.
    await next.getByRole('button', { name: 'Lancer le rapprochement' }).click()
    await expect(page).toHaveURL(new RegExp(`match=${GJ4.needId}`))
    await expect(page.getByText('Gratuit.', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(GJ4.consultantName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    expect(writesOf(world, `POST /needs/${GJ4.needId}/match`)).toBe(1)

    // 4. Positionner : aperçu d'abord, rien d'écrit avant la confirmation.
    await page.getByRole('button', { name: 'Positionner' }).first().click()
    await expect(page.getByText("Rien n'est envoyé au client à ce stade.")).toBeVisible()
    expect(writesOf(world, `POST /needs/${GJ4.needId}/submissions`)).toBe(0)
    await page.getByRole('button', { name: 'Positionner', exact: true }).last().click()
    await expect(page.getByText('Positionnement préparé')).toBeVisible()
    expect(writesOf(world, `POST /needs/${GJ4.needId}/submissions`)).toBe(1)
    const positioned = world.writes.find(write => write.key === `POST /needs/${GJ4.needId}/submissions`)?.body
    expect(positioned).toMatchObject({ runId: GJ4.runId, consultantId: GJ4.consultantId })

    // 5. Du besoin à SON affaire, par le lien de la fiche.
    // #4344 — fermer le panneau ramène au pipe (`/projects/needs` nu y redirige) ; le besoin se
    // retrouve par la recherche amorcée (`?q=`), le lien profond que #4344 garde.
    await page.keyboard.press('Escape')
    await page.goto(`/projects/needs?q=${encodeURIComponent(GJ4.needTitle)}`)
    await page.getByRole('link', { name: GJ4.needTitle }).first().click()
    await page.getByRole('link', { name: new RegExp(GJ4.projectLabel) }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${GJ4.projectId}`))

    // 6. L'entretien, sur le positionnement de CE consultant.
    await page.getByRole('button', { name: 'Planifier un entretien' }).click({ timeout: 30_000 })
    await expect(page.getByText(`Planifier un entretien avec ${GJ4.consultantName}`)).toBeVisible()
    await page.getByLabel('Date et heure').fill('2026-10-12T14:30')
    await page.getByRole('button', { name: 'Sur site' }).click()
    await page.getByRole('button', { name: 'Planifier', exact: true }).click()
    await expect.poll(() => writesOf(world, `POST /submissions/${GJ4.submissionId}/interviews`)).toBe(1)

    // 7. Négociation, puis les deux accords.
    await moveProjectTo(page, 'Négociation')
    await page.getByRole('button', { name: 'Déplacer', exact: true }).click()
    await expect.poll(() => world.projectStage).toBe('negotiation')
    await page.getByRole('button', { name: 'Sécuriser les deux accords' }).click()
    await page.getByRole('button', { name: 'Détails', exact: true }).click()
    await expect(page.getByText(`Détails du positionnement de ${GJ4.consultantName}`)).toBeVisible()
    await page.getByRole('combobox', { name: 'Accord du consultant' }).click()
    await page.getByRole('option', { name: 'Oui' }).click()
    await page.getByLabel('Date de l’accord').fill('2026-10-01')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect.poll(() => world.consultantAgreement).toBe(true)

    // 8. Signer : la mission est ANNONCÉE (plus une case, #4195), définitive, créée par le serveur.
    await page.keyboard.press('Escape')
    await moveProjectTo(page, 'Signé')
    await expect(page.getByText('Créer la mission', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/La mission sera créée/)).toBeVisible()
    await expect(page.getByText(/Il n’existe aucun moyen de la supprimer/)).toBeVisible()
    await page.getByRole('button', { name: 'Déplacer', exact: true }).click()
    await expect.poll(() => world.projectStage).toBe('won')
    const signed = world.writes.filter(write => write.key === `PATCH /projects/${GJ4.projectId}/stage`).at(-1)
      ?.body as {
      accepted_actions?: string[]
    }
    // Le client n'envoie plus la clé : le serveur crée les missions à la signature.
    expect(signed.accepted_actions ?? []).not.toContain('create_mission')

    // Le fil entier, dans l'ordre : aucune écriture du parcours hors des gestes cliqués.
    expect(world.writes.map(write => write.key)).toEqual([
      'POST /consultants',
      `POST /needs/${GJ4.needId}/match`,
      `POST /needs/${GJ4.needId}/submissions`,
      `POST /submissions/${GJ4.submissionId}/interviews`,
      `PATCH /projects/${GJ4.projectId}/stage`,
      `PATCH /submissions/${GJ4.submissionId}/details`,
      `PATCH /projects/${GJ4.projectId}/stage`,
    ])
    expect(
      world.strayWrites.filter(write => /\/(projects|needs|submissions|consultants|missions)\//.test(write)),
    ).toEqual([])
  })
})

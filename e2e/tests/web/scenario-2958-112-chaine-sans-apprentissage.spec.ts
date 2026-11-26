import { expect, test } from '@playwright/test'
import { GJ4, mockNeedToMissionWorld } from './golden-journey-need-to-mission-world'

/**
 * #2958.112 (GO #2208, lot M12 09/10) — « la chaîne complète avance sans
 * compréhension préalable de l'utilisateur ».
 *
 * CE QUE « SANS APPRENTISSAGE » MESURE ICI
 * ─────────────────────────────────────────
 * Un utilisateur qui ne connaît ni les URL ni l'ordre des étapes, et qui ne
 * fait QUE ce que l'écran courant lui désigne. Concrètement, le spec :
 *  - n'entre qu'UNE fois par une URL — la liste des besoins, une destination de
 *    la navigation ; tout le reste est atteint par un clic (la garde
 *    `route-migration-2208-conditions.test.ts` compte les `page.goto`) ;
 *  - à chaque station, VÉRIFIE que l'écran nomme lui-même le geste suivant
 *    (porte expliquée, panneau « geste suivant », action principale du dossier
 *    qui CHANGE avec l'étape) avant de le cliquer ;
 *  - vérifie que chaque geste qui écrit ANNONCE ce qu'il fait avant de le faire
 *    (aucun crédit débité, rien d'envoyé au client, mission définitive).
 *
 * Même monde que le parcours doré 4 (`golden-journey-need-to-mission-world.ts`) :
 * #2446.17 prouve que la chaîne TIENT ; ce scénario prouve qu'elle se LIT.
 */

test.describe('#2958.112 — la chaîne besoin → mission avance en suivant ce que chaque écran désigne', () => {
  test('chaque station nomme le geste suivant, et chaque écriture s’annonce avant de partir', async ({ page }) => {
    // Huit stations sur un build de prod : le plafond par défaut (30 s) tient UN écran.
    test.setTimeout(240_000)
    const world = await mockNeedToMissionWorld(page)

    // Station 0 — la seule URL : une destination de la navigation.
    // #4344 — `/projects/needs` nu redirige vers le pipe ; la recherche amorcée du lanceur (`?q=`)
    // est le lien profond qui garde la liste.
    await page.goto(`/projects/needs?q=${encodeURIComponent(GJ4.needTitle)}`)
    await page.getByRole('link', { name: GJ4.needTitle }).first().click({ timeout: 30_000 })

    // Station 1 — la fiche désigne sa porte ET dit pourquoi elle est là.
    const door = page.getByRole('button', { name: 'Enregistrer un consultant' })
    await expect(door).toHaveAttribute('title', /Aucun profil n’est positionné sur ce besoin/, { timeout: 30_000 })
    await door.click()
    await page.getByRole('dialog').getByLabel('Nom complet').fill(GJ4.consultantName)
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()

    // Station 2 — le geste suivant est PROPOSÉ, nommé, et son coût dit.
    const next = page.getByTestId('need-door-next-gesture')
    await expect(next).toContainText(GJ4.consultantName)
    await expect(next).toContainText('Gratuit, quelques secondes')
    await next.getByRole('button', { name: 'Lancer le rapprochement' }).click()

    // Station 3 — le rapprochement se dit gratuit, puis l'aperçu dit que rien ne part.
    await expect(page.getByText('Gratuit.', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Positionner' }).first().click({ timeout: 30_000 })
    await expect(page.getByText("Rien n'est envoyé au client à ce stade.")).toBeVisible()
    await page.getByRole('button', { name: 'Positionner', exact: true }).last().click()
    await expect(page.getByText('Positionnement préparé')).toBeVisible()

    // Station 4 — de la fiche à SON affaire, par le nom de l'affaire.
    await page.keyboard.press('Escape')
    // #2958.112 — une seule URL tapée : on revient à la liste par le retour arrière du navigateur
    // (le positionnement a empilé le panneau de matching puis la fiche), jamais par une seconde adresse.
    const needLink = page.getByRole('link', { name: GJ4.needTitle }).first()
    for (let step = 0; step < 4 && !(await needLink.isVisible()); step++) {
      await page.goBack()
      await needLink.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
    }
    await needLink.click()
    await page.getByRole('link', { name: new RegExp(GJ4.projectLabel) }).click()

    // Station 5 — l'action principale du dossier désigne l'étape EN COURS.
    const primary = page.getByRole('button', { name: 'Suivre les retours' })
    await expect(primary).toBeVisible({ timeout: 30_000 })
    await primary.click()
    await page.getByRole('button', { name: 'Planifier un entretien' }).click()
    await page.getByLabel('Date et heure').fill('2026-10-12T14:30')
    await page.getByRole('button', { name: 'Sur site' }).click()
    await page.getByRole('button', { name: 'Planifier', exact: true }).click()
    await expect.poll(() => world.interviewCount).toBe(1)

    // Station 6 — l'étape change par le bouton qui la nomme, et l'action
    // principale CHANGE AVEC ELLE : l'utilisateur n'a rien à savoir de plus.
    await page.getByRole('button', { name: 'Changer d’étape' }).click()
    await page.getByRole('menuitem', { name: 'Négociation' }).click()
    await page.getByRole('button', { name: 'Déplacer', exact: true }).click()
    const secure = page.getByRole('button', { name: 'Sécuriser les deux accords' })
    await expect(secure).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Suivre les retours' })).toHaveCount(0)
    await secure.click()
    await expect(page.getByText('Qualification (budget, besoin, décideur, délai, moyens, projet)')).toBeInViewport()

    // Station 7 — signer : l'effet irréversible est DIT avant d'être accepté.
    await page.getByRole('button', { name: 'Changer d’étape' }).click()
    await page.getByRole('menuitem', { name: 'Signé' }).click()
    // #4195 — plus une case : la mission est ANNONCÉE, avec son irréversibilité.
    await expect(
      page.getByText(/La mission sera créée.*Il n’existe aucun moyen de la supprimer ensuite\./),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Déplacer', exact: true }).click()
    await expect.poll(() => world.projectStage).toBe('won')

    // Aucune écriture du parcours ne part en dehors d'un geste désigné.
    expect(
      world.strayWrites.filter(write => /\/(projects|needs|submissions|consultants|missions)\//.test(write)),
    ).toEqual([])
  })
})

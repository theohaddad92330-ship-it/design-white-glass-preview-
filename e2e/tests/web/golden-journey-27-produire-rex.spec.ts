import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2958.58 (#2208.58, golden journey 27) — PRODUIRE UN REX.
 *
 * `/pilotage/rex` (`RexScreen`) : une mission terminée dont le retour n'a pas
 * été recueilli attend dans « À recueillir » ; le recueil se fait à chaud,
 * en un formulaire, et `POST /capitalisation/rex` est son seul appelant.
 *
 * Ce que le parcours prouve :
 *  1. le décompte est dit (« 1 mission terminée attend son retour »), la ligne
 *     porte compte et date de fin, et un retour déjà recueilli se relit sous
 *     « Retours recueillis » — champs vides non rendus (une absence ne fait
 *     aucune ligne) ;
 *  2. « Recueillir le retour » ouvre le formulaire de CETTE mission ; le corps
 *     envoyé porte la mission, le compte, le résumé — et `null` (jamais une
 *     chaîne vide, jamais un champ inventé) pour chaque champ laissé vide ;
 *  3. un rôle sans `records:write` (viewer) lit la file mais n'a AUCUN bouton,
 *     et l'écran écrit pourquoi ;
 *  4. une lecture qui échoue est DITE : « Ce n'est pas « aucun retour » ».
 */

const PENDING = {
  mission_id: '55555555-5555-4555-8555-555555555555',
  label: 'Refonte SI',
  account_id: '66666666-6666-4666-8666-666666666666',
  account_label: 'Globex',
  ended_on: '2026-09-10',
}

const COLLECTED = {
  id: '77777777-7777-4777-8777-777777777777',
  mission_id: '88888888-8888-4888-8888-888888888888',
  mission_label: 'Data lake',
  account_id: null,
  account_label: 'Initech',
  summary: 'Le sponsor a changé au bout de deux mois.',
  what_worked: 'Le binôme architecte et développeur.',
  what_failed: null,
  team: null,
  skills: null,
  constraints: null,
  offer: null,
  expertise: null,
  access_path: null,
  first_door: null,
  proof_used: null,
  cycle_duration: null,
  partner: null,
  collected_at: '2026-09-12T09:00:00.000Z',
}

type Calls = { collect: unknown[] }

async function mockRex(page: Page): Promise<Calls> {
  const calls: Calls = { collect: [] }
  await page.route(/\/capitalisation\/rex$/, route => {
    if (route.request().resourceType() === 'document') return route.fallback()
    if (route.request().method() === 'POST') {
      calls.collect.push(route.request().postDataJSON())
      return json(route, { id: 'rex-new' })
    }
    return json(route, { pending: [PENDING], collected: [COLLECTED] })
  })
  await page.route('**/capitalisation/lost-deal-rex', route => json(route, { items: [] }))
  await page.route('**/capitalisation/lost-deal-rule-proposals', route => json(route, { items: [] }))
  await page.route('**/capitalisation/workspace-method-rules', route => json(route, { items: [] }))
  return calls
}

test.describe('#2208.58 — golden journey 27 : produire un REX', () => {
  test('la file dit ce qui attend son retour, et le retour recueilli se relit sans champ vide', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool', 'manager_cockpit'], tag: '27' })
    await mockRex(page)
    await page.goto('/pilotage/rex')

    await expect(page.getByText('1 mission terminée attend son retour')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Refonte SI')).toBeVisible()
    await expect(page.getByText('Globex', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('1 retour recueilli')).toBeVisible()
    await expect(page.getByText('Le sponsor a changé au bout de deux mois.')).toBeVisible()
    await expect(page.getByText('Le binôme architecte et développeur.')).toBeVisible()
    // Un champ vide ne fait aucune ligne : « Ce qui a coincé » n'est pas rendu.
    await expect(page.getByText('Ce qui a coincé', { exact: true })).toHaveCount(0)
  })

  test('« Recueillir le retour » envoie la mission, le résumé, et null pour tout champ laissé vide', async ({
    page,
  }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool', 'manager_cockpit'], tag: '27' })
    const calls = await mockRex(page)
    await page.goto('/pilotage/rex')

    await page.getByRole('button', { name: 'Recueillir le retour' }).click()
    await expect(page.getByText('Retour sur Refonte SI')).toBeVisible()
    await page.getByLabel('Ce que la mission a appris').fill('Le client a rallongé le cycle de validation.')
    await page.getByLabel('Durée du cycle').fill('4 mois entre le premier contact et la signature')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

    await expect.poll(() => calls.collect.length).toBe(1)
    expect(calls.collect[0]).toEqual({
      mission_id: PENDING.mission_id,
      account_id: PENDING.account_id,
      summary: 'Le client a rallongé le cycle de validation.',
      what_worked: null,
      what_failed: null,
      team: null,
      skills: null,
      constraints: null,
      offer: null,
      expertise: null,
      access_path: null,
      first_door: null,
      proof_used: null,
      cycle_duration: '4 mois entre le premier contact et la signature',
      partner: null,
      // #3246 — stratégie et modèle d'achat (vocabulaire fermé), null quand non choisis.
      strategy: null,
      buying_model: null,
      // #3246/#3210.3 — organisation de la décision (vocabulaire fermé), null quand non choisie.
      organisation: null,
    })
  })

  test('un rôle sans droit d’écriture lit la file sans bouton, et l’écran écrit pourquoi', async ({ page }) => {
    await mockSession(page, {
      features: ['missions', 'accounts', 'talent_pool', 'manager_cockpit'],
      tag: '27',
      role: 'viewer',
    })
    const calls = await mockRex(page)
    await page.goto('/pilotage/rex')

    await expect(page.getByText('1 mission terminée attend son retour')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Recueillir le retour' })).toHaveCount(0)
    await expect(page.getByText('Ton rôle n’a pas le droit d’écrire dans les dossiers', { exact: false })).toBeVisible()
    expect(calls.collect).toEqual([])
  })

  test('une lecture qui échoue est dite — jamais « aucun retour »', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool', 'manager_cockpit'], tag: '27' })
    await page.route(/\/capitalisation\/rex$/, route =>
      route.request().resourceType() === 'document' ? route.fallback() : json(route, { message: 'indisponible' }, 500),
    )
    await page.goto('/pilotage/rex')
    await expect(page.getByText('Lecture impossible. Ce n’est pas « aucun retour »', { exact: false })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Aucun retour recueilli pour l’instant.')).toHaveCount(0)
  })
})

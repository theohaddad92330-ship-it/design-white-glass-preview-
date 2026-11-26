import { expect, test } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.16 — SCÉNARIO « CRÉATION D'UN BESOIN MANUEL » (lot X41, #2958).
 *
 * Le besoin saisi à la main passe par l'assistant en cinq étapes
 * (`CreateNeedDialog` / `NeedWizard`), ouvert ici par `/projects?create_need=1`
 * — la même porte que le bouton « Créer un besoin ».
 *
 * Ce que le scénario prouve, dans un vrai navigateur :
 *  1. l'assistant ne laisse pas avancer sans titre ET sans projet de
 *     rattachement (« Étape suivante » inerte) ;
 *  2. une fois les étapes parcourues, « Créer le besoin » envoie
 *     `POST /projects/needs` avec EXACTEMENT
 *     `{ title, headcount: 1, account_id, project_id, provenance: 'model' }` —
 *     `headcount: 1` est le défaut du brouillon (un poste, jamais zéro) ;
 *     `provenance: 'model'` dit que l'ouverture par `?create_need=1` vient de
 *     Laura (#2942) ; rien d'autre n'est deviné ;
 *  3. à la création, l'utilisateur ATTERRIT sur la fiche du besoin
 *     (`/projects/needs/<id>`), pas sur une liste qui ne dit pas ce qui a été
 *     fait ;
 *  4. un refus du serveur est DIT (l'assistant reste ouvert, aucune navigation) ;
 *  5. DÉFAUT RÉEL TROUVÉ ET CORRIGÉ PAR CE SCÉNARIO : `/projects?create_need=1`
 *     (forme nommée partout, y compris par Laura) n'ouvrait RIEN — le routeur
 *     lit `1` comme un nombre, `z.literal('1')` le refusait en silence. Corrigé
 *     dans `routes/projects/index.tsx` (`openFlag`), test d'abord
 *     (`projectsSearchSchema.test.ts`) ; ce scénario est son appelant réel.
 */

const PROJECTS = [
  { id: 'p-1', label: 'Refonte SI paiement', company_name: 'TF1', account_id: 'a-1' },
  { id: 'p-2', label: 'Migration cloud', company_name: 'Decathlon', account_id: 'a-2' },
]

async function mockProjets(page: import('@playwright/test').Page) {
  const created: unknown[] = []
  await page.route(/\/projects$/, route =>
    route.request().resourceType() === 'document' ? route.fallback() : json(route, PROJECTS),
  )
  await page.route('**/workspaces/members', route => json(route, []))
  await page.route(/\/contacts\/account\//, route => json(route, []))
  return created
}

test.describe('#2154.16 — création d’un besoin manuel', () => {
  test('titre et projet exigés, puis POST /projects/needs exact, puis atterrissage sur la fiche', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool'], tag: '16' })
    const created = await mockProjets(page)
    await page.route(/\/projects\/needs$/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      created.push(route.request().postDataJSON())
      return json(route, { id: 'n-42', title: 'Architecte cloud' })
    })
    await page.goto('/projects?create_need=1')

    const next = page.getByRole('button', { name: 'Étape suivante' })
    await expect(next).toBeDisabled({ timeout: 30_000 })
    await page.getByLabel('Titre du besoin').fill('Architecte cloud')
    // Le titre seul ne suffit pas : le projet de rattachement manque.
    await expect(next).toBeDisabled()
    await page.getByText('TF1 — Refonte SI paiement').click()
    await expect(next).toBeEnabled()

    for (let step = 0; step < 4; step += 1) await next.click()
    await page.getByRole('button', { name: 'Créer le besoin' }).click()

    await expect.poll(() => created.length).toBe(1)
    expect(created[0]).toEqual({
      title: 'Architecte cloud',
      headcount: 1,
      account_id: 'a-1',
      project_id: 'p-1',
      provenance: 'model',
    })
    await expect(page).toHaveURL(/\/projects\/needs\/n-42$/, { timeout: 30_000 })
  })

  test('un refus du serveur est dit : l’assistant reste ouvert, aucune navigation', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool'], tag: '16' })
    await mockProjets(page)
    await page.route(/\/projects\/needs$/, route =>
      route.request().resourceType() === 'document'
        ? route.fallback()
        : json(route, { message: 'Permission requise : records:write' }, 403),
    )
    await page.goto('/projects?create_need=1')

    await page.getByLabel('Titre du besoin').fill('Architecte cloud')
    await page.getByText('TF1 — Refonte SI paiement').click()
    const next = page.getByRole('button', { name: 'Étape suivante' })
    for (let step = 0; step < 4; step += 1) await next.click()
    await page.getByRole('button', { name: 'Créer le besoin' }).click()

    await expect(page.getByText('Permission requise : records:write').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Créer le besoin' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/projects')
  })

  test('le lien de Laura `/projects?create=1&account_id=…` ouvre le formulaire d’affaire (même défaut, même correctif)', async ({
    page,
  }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool'], tag: '16' })
    await mockProjets(page)
    await page.goto('/projects?create=1&account_id=33333333-3333-4333-8333-333333333333')
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  })
})

import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.19 — SCÉNARIO « CRÉATION ET VALIDATION D'UNE SÉQUENCE » (lot X41, #2958).
 *
 * Doctrine : « Rien ne part tout seul ». Une séquence est une cadence de
 * touches PLANIFIÉES ; ses étapes e-mail préparent le message et posent un
 * rappel, l'envoi reste le geste du commercial ; et chaque message préparé
 * traverse le centre d'approbation avant d'être exécutable.
 *
 * ⚠️ #4355.1 / #4357.1 (décision Louis 19/10) : l'écran s'ouvre sur UN bouton
 * « Créer ma séquence » — Quand → Pour qui → Modèle → Relecture, un écran par
 * étape — et c'est « Vérifier et créer » (fin « maintenant ») qui ouvre le
 * dialogue, pré-rempli du contact et du modèle choisis. Les invariants
 * ci-dessous sont les mêmes ; seul le chemin pour y arriver a changé.
 *
 * Ce que le scénario prouve, sur `/actions/sequences` :
 *  1. le parcours puis le dialogue qui dit d'emblée qu'« rien
 *     n'est envoyé automatiquement » et propose des cadences NOMMÉES avec leur
 *     nombre de touches et leur durée ;
 *  2. on ne crée rien sans contact retenu ; choisir un contact dit « Une
 *     séquence sera créée, sur ce contact » ;
 *  3. « Créer la séquence » envoie `POST /outreach/sequences` avec le contact
 *     et la cadence choisis — exactement ce corps, rien d'autre ;
 *  4. un refus du serveur est DIT (le dialogue reste ouvert), jamais une
 *     séquence fantôme ;
 *  5. la validation du message préparé se joue au centre d'approbation
 *     (voir `golden-journey-30-valider-messages.spec.ts`).
 */

function contact(n: number, name: string, email: string | null) {
  return {
    id: `0000000${n}-0000-4000-8000-00000000000${n}`,
    workspace_id: 'w',
    account_id: null,
    full_name: name,
    title: 'DSI',
    email,
    phone: null,
    entity: 'ACME',
    linkedin_url: null,
    locale: null,
    decision_role: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

type Calls = { created: unknown[] }

/** Quand « maintenant » → Pour qui (Claire) → Modèle (cadence par défaut) → Relecture → dialogue pré-rempli. */
async function ouvrirLeDialogueDepuisLeParcours(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Créer ma séquence' }).click()
  await page.getByText('Maintenant, pour des contacts que je choisis').click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByText('Claire Dubois').click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByText('Prospection — 3 touches').click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Vérifier et créer' }).click()
}

async function mockSequences(page: Page, options: { reject?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { created: [] }
  await page.route(/\/contacts(\?|$)/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, {
          data: [contact(1, 'Claire Dubois', 'claire@example.com'), contact(2, 'Marc Petit', 'marc@example.com')],
          pagination: { total: 2, offset: 0, limit: 50, hasMore: false },
        }),
  )
  await page.route(/\/outreach\/sequences(\?|$)/, route => {
    if (route.request().resourceType() === 'document') return route.fallback()
    if (route.request().method() === 'POST') {
      calls.created.push(route.request().postDataJSON())
      return options.reject
        ? json(route, { message: 'Permission requise : messages:send' }, 403)
        : json(route, { id: 'seq-1' })
    }
    return json(route, [])
  })
  return calls
}

test.describe('#2154.19 — création et validation d’une séquence', () => {
  test('le dialogue dit que rien ne part tout seul, nomme les cadences, et ne crée rien sans contact', async ({
    page,
  }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '19' })
    const calls = await mockSequences(page)
    await page.goto('/actions/sequences')

    await page.getByRole('button', { name: 'Créer ma séquence' }).click()
    await page.getByText('Maintenant, pour des contacts que je choisis').click()
    await page.getByRole('button', { name: 'Continuer' }).click()
    // Aucun contact retenu : on ne peut pas continuer, donc rien ne se crée.
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled()
    await page.getByText('Claire Dubois').click()
    await page.getByRole('button', { name: 'Continuer' }).click()
    // Les cadences sont NOMMÉES, avec leur nombre de touches.
    await expect(page.getByText('Prospection — 3 touches')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Message unique')).toBeVisible()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByText('Rien ne part sans ta validation', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Vérifier et créer' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('rien n’est envoyé automatiquement', { timeout: 30_000 })
    await expect(dialog).toContainText('Prospection — 3 touches')
    await expect(dialog).toContainText('3 touches · 10 jours')
    await expect(dialog).toContainText('Message unique')
    expect(calls.created).toEqual([])
  })

  test('contact retenu + cadence choisie : POST /outreach/sequences exact', async ({ page }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '19' })
    const calls = await mockSequences(page)
    await page.goto('/actions/sequences')

    await ouvrirLeDialogueDepuisLeParcours(page)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Une séquence sera créée, sur ce contact.', { timeout: 30_000 })
    await dialog.getByRole('button', { name: 'Créer la séquence' }).click()

    await expect.poll(() => calls.created.length).toBe(1)
    expect(calls.created[0]).toEqual({
      contact_id: '00000001-0000-4000-8000-000000000001',
      template: 'prospection_3_touches',
    })
  })

  test('un refus du serveur est dit : le dialogue reste ouvert, aucune séquence fantôme', async ({ page }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '19' })
    const calls = await mockSequences(page, { reject: true })
    await page.goto('/actions/sequences')

    await ouvrirLeDialogueDepuisLeParcours(page)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Une séquence sera créée, sur ce contact.', { timeout: 30_000 })
    await dialog.getByRole('button', { name: 'Créer la séquence' }).click()

    await expect.poll(() => calls.created.length).toBe(1)
    await expect(page.getByText('Permission requise : messages:send').first()).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toBeVisible()
  })
})

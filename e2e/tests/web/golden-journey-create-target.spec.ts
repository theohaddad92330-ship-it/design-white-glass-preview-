import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * #2208.40 (golden journey 9) — CRÉER UNE CIBLE.
 *
 * Dans « Mes cibles », un nom suffit à faire naître une liste (l'objectif est
 * facultatif) ; le formulaire dit qu'elle est gratuite avant le clic. Le
 * serveur reçoit une prochaine action par défaut — jamais une chaîne vide —
 * et la liste neuve, encore sans fiche, n'affiche aucun « 0 prêt à contacter » :
 * son compteur n'est pas encore mesuré, elle dit qu'elle est vide.
 */

const USER_ID = '4b7a4b1e-0009-4a11-9c33-2208400000ab'

test.describe('#2208.40 — golden journey : créer une cible', () => {
  test('un nom suffit, la liste naît vide et gratuite, sans compteur inventé', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220840' })
    const created: Array<Record<string, unknown>> = []
    let current: Record<string, unknown> | null = null
    await page.route('**/target-lists', route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        created.push(body)
        current = {
          id: 'tl-1',
          name: body['name'],
          objective: body['objective'] ?? null,
          type: null,
          owner_user_id: null,
          team: null,
          visibility: 'workspace',
          source: 'manual',
          source_query: null,
          status: 'draft',
          counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
          next_action: body['next_action'] ?? null,
          sequence_id: null,
          prospecting_session_id: null,
          created_by: USER_ID,
          created_at: '2026-10-02T09:00:00.000Z',
          updated_at: '2026-10-02T09:00:00.000Z',
          items: [],
        }
        return fulfillJson(route, current)
      }
      return fulfillJson(route, { lists: current ? [current] : [] })
    })

    // #4088.8 — les listes cibles vivent sur Comptes, lentille « Listes ».
    await page.goto('/accounts?lens=lists')
    await expect(page.getByText('Aucune liste pour l’instant')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Gratuit — créer une liste ne coûte rien.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Créer la liste' })).toBeDisabled()

    await page.getByLabel('Nom de la liste').fill('Banques régionales — T4')
    await page.getByLabel('Objectif').fill('Décrocher 3 rendez-vous avec des DSI')
    await page.getByRole('button', { name: 'Créer la liste' }).click()

    await expect(page.getByText('Banques régionales — T4')).toBeVisible()
    await expect(page.getByText('Objectif : Décrocher 3 rendez-vous avec des DSI')).toBeVisible()
    expect(created).toEqual([
      {
        name: 'Banques régionales — T4',
        objective: 'Décrocher 3 rendez-vous avec des DSI',
        next_action: 'Ajouter les premiers comptes ou contacts',
      },
    ])
    // Aucun compteur « 0 sur 0 prêts » pour une liste qui n'a encore aucune fiche.
    await expect(page.getByText(/0 sur 0 prêts/)).not.toBeVisible()
  })
})

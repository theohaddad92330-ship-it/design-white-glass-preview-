import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'
import { MISSION_ID, mockMissionRecord } from './x41-mission'

/**
 * #2958.59 (#2208.59, golden journey 28) — DÉTECTER UN BESOIN ADJACENT.
 *
 * Pendant une mission, le commercial entend un besoin voisin chez le client.
 * #2953 (#2193.25-30) l'a tranché sans Louis : UN fil de notes sur la fiche
 * mission (« Suivi — points client, points consultant, décisions, problèmes,
 * besoins adjacents, actions »), pas six listes — le fil polymorphe `notes`
 * (`entityType: 'mission'`) existait sans appelant web.
 *
 * Ce que le parcours prouve, sur `/missions/:id` :
 *  1. le fil vide DIT qu'il est vide, et que la première note sera lisible de
 *     toute l'équipe, datée ;
 *  2. « Ajouter la note » envoie `POST /notes` avec EXACTEMENT
 *     `{ entityType: 'mission', entityId, body }` ; la note revient avec son
 *     auteur et sa date ;
 *  3. un fil dont la lecture échoue le DIT (« Elles existent toujours »), il
 *     ne se fait jamais passer pour « aucune note ».
 */

const NOTE_BODY = 'Le client évoque un besoin data engineer, deux profils, démarrage en janvier.'

type Calls = { created: unknown[] }

async function mockFil(page: Page, options: { failRead?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { created: [] }
  const items: unknown[] = []
  await mockMissionRecord(page)
  await page.route(/\/notes(\?|$)/, route => {
    if (route.request().resourceType() === 'document') return route.fallback()
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { body: string }
      calls.created.push(body)
      const note = {
        id: '99999999-9999-4999-8999-999999999999',
        entityType: 'mission',
        entityId: MISSION_ID,
        body: body.body,
        authorId: null,
        authorName: 'Louis Test',
        pinned: false,
        createdAt: '2026-10-02T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
      }
      items.push(note)
      return json(route, note)
    }
    if (options.failRead) return json(route, { message: 'indisponible' }, 500)
    return json(route, { items })
  })
  return calls
}

test.describe('#2208.59 — golden journey 28 : détecter un besoin adjacent', () => {
  test('le fil vide le dit ; la note ajoutée revient avec son auteur, exactement { entityType, entityId, body }', async ({
    page,
  }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '28' })
    const calls = await mockFil(page)
    await page.goto(`/missions/${MISSION_ID}`)

    await expect(page.getByText('besoins adjacents', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Aucune note pour l’instant.', { exact: false })).toBeVisible()

    await page.getByLabel('Nouvelle note').fill(NOTE_BODY)
    await page.getByRole('button', { name: 'Ajouter la note' }).click()

    await expect.poll(() => calls.created.length).toBe(1)
    expect(calls.created[0]).toEqual({ entityType: 'mission', entityId: MISSION_ID, body: NOTE_BODY })
    await expect(page.getByText(NOTE_BODY)).toBeVisible()
    await expect(page.getByText('Louis Test')).toBeVisible()
  })

  test('un fil dont la lecture échoue le dit — jamais « aucune note »', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '28' })
    await mockFil(page, { failRead: true })
    await page.goto(`/missions/${MISSION_ID}`)

    await expect(
      page.getByText('Elles existent toujours — c’est la lecture qui a échoué.', { exact: false }),
    ).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Aucune note pour l’instant.', { exact: false })).toHaveCount(0)
  })
})

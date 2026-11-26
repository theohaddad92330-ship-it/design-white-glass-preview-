import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import { mockNeedWithMatching, openMatchingDrawer, SOPHIE_ID } from './golden-journey-matching-fixtures'

/**
 * #2208.45 (golden journey 14) — PRÉPARER UN CV CIBLÉ.
 *
 * Depuis la carte d'un profil du classement, « Préparer le CV » ouvre le
 * studio sur CE consultant ; « Composer » enregistre une version — qui
 * s'AJOUTE aux précédentes, n'en remplace aucune. Le document dit ce qu'il ne
 * prouve pas : rien n'est inventé pour coller au besoin.
 */

const USER_ID = '4b7a4b1e-0014-4a11-9c33-2208450000ab'

const VERSION = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  consultantId: SOPHIE_ID,
  needId: '11111111-1111-4111-8111-111111111111',
  opportunityId: null,
  rfpId: null,
  comparableMissionId: null,
  versionKind: 'client',
  templateKey: 'default',
  language: 'fr',
  anonymisationRule: 'nom_complet',
  sections: [{ title: 'Compétences', body: 'Spark, Scala' }],
  excludedSkills: [],
  changes: [],
  highlightedSkills: ['Spark'],
  generatedBy: null,
  generatedAt: '2026-10-02T09:00:00.000Z',
  sentToContactId: null,
  status: 'validated',
  validatedBy: null,
  validatedAt: null,
}

test.describe('#2208.45 — golden journey : préparer un CV ciblé', () => {
  test('« Préparer le CV » ouvre le studio du bon consultant et compose une version', async ({ page }) => {
    await mockNeedWithMatching(page, { userId: USER_ID, tag: '220845' })
    const versions: unknown[] = []
    let composed = 0
    await page.route(`**/consultants/${SOPHIE_ID}/cv-versions`, route => {
      if (route.request().method() === 'POST') {
        composed += 1
        versions.push(VERSION)
        return fulfillJson(route, VERSION)
      }
      return fulfillJson(route, { items: versions })
    })
    await openMatchingDrawer(page)

    await page.getByRole('button', { name: 'Préparer le CV' }).first().click()
    await expect(page.getByText('Préparer le CV — Sophie M.')).toBeVisible()
    await expect(page.getByText('Aucune version pour l’instant.')).toBeVisible()
    expect(composed).toBe(0)

    await page.getByRole('button', { name: 'Composer' }).click()
    await expect(page.getByText(/Version composée\./)).toBeVisible()
    expect(composed).toBe(1)
  })
})

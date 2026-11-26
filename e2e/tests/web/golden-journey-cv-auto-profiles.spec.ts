import { expect, test } from '@playwright/test'
import {
  fulfillJson,
  mockInlineCvZipImport,
  mockSignedInShell,
  talentRow,
  type TalentRow,
} from './golden-journey-fixtures'

/**
 * #2208.33 (golden journey 2) — CRÉER LES FICHES AUTOMATIQUEMENT.
 *
 * Après un dépôt de CV, personne ne saisit une fiche à la main : chaque
 * document lisible devient un talent, et le Vivier le MONTRE sans autre geste
 * que « Voir le Vivier ». Le test rend le Vivier stateful — vide avant
 * l'import, peuplé APRÈS le dépôt du job — pour prouver que l'écran relit
 * le serveur au lieu de supposer ce que l'import a produit.
 */

const USER_ID = '4b7a4b1e-0002-4a11-9c33-2208330000ab'

const CREATED: TalentRow[] = [
  talentRow({ id: '21111111-1111-4111-8111-111111111111', fullName: 'Camille Roux', title: 'Développeuse Java' }),
  talentRow({ id: '22222222-2222-4222-8222-222222222222', fullName: 'Hugo Lambert', title: 'Ingénieur DevOps' }),
]

test.describe('#2208.33 — golden journey : créer les fiches automatiquement', () => {
  test('un lot de CV devient des fiches du Vivier, sans saisie manuelle', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220833', features: ['talent_pool'] })
    const zip = await mockInlineCvZipImport(page, {
      total: 2,
      summary: { created: 2, auto_updated: 0, exception: 0, too_big: 0, failed: 0, ignored: 0 },
      outcomes: [
        { status: 'created', file: 'roux-camille.pdf', consultantId: CREATED[0].id },
        { status: 'created', file: 'lambert-hugo.pdf', consultantId: CREATED[1].id },
      ],
    })
    await page.route(/\/talents\?/, route => {
      const rows = zip.jobsStarted() > 0 ? CREATED : []
      return fulfillJson(route, { items: rows, total: rows.length, page: 1, limit: 20 })
    })
    await page.route('**/delivery/propagation', route =>
      fulfillJson(route, { accounts: [], contacts: [], consultants: [] }),
    )

    await page.goto('/consultants')
    await expect(page.getByRole('heading', { name: 'Ton vivier' })).toBeVisible()
    await expect(page.locator('table tbody tr')).toHaveCount(0)

    // L'import : une archive, une confirmation — aucun formulaire de fiche.
    // L'import vit dans le menu « Importer » du Vivier : on choisit la source d'abord.
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await page.getByRole('button', { name: 'Importer une archive ZIP' }).click()
    await page.getByLabel('Choisir une archive .zip').setInputFiles({
      name: 'cv-lot.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK'),
    })
    await page.getByRole('button', { name: 'Confirmer l’import' }).click()

    // Le rapport dit combien de fiches sont nées.
    await expect(page.getByText(/2 créée\(s\)/)).toBeVisible()

    // « Voir le Vivier » : les deux talents sont là, relus depuis le serveur.
    await page.getByRole('link', { name: 'Voir le Vivier' }).click()
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 15_000 })
    await expect(page.getByText('Camille Roux')).toBeVisible()
    await expect(page.getByText('Hugo Lambert')).toBeVisible()
  })
})

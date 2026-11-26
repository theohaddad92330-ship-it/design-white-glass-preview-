import { expect, test } from '@playwright/test'
import {
  fulfillJson,
  mockInlineCvZipImport,
  mockSignedInShell,
  talentRow,
  type TalentRow,
} from './golden-journey-fixtures'

/**
 * #2208.34 (golden journey 3) — TRAITER UNIQUEMENT LES EXCEPTIONS.
 *
 * Sur un lot de CV, 98 fiches se créent seules ; le recruteur ne doit
 * regarder QUE les deux qu'un humain doit relire. Le CTA « Traiter les 2
 * exceptions » du rapport filtre le Vivier sur `reviewStatus=needs_review`
 * (VRAI paramètre de `GET /talents`) : le mock filtre lui-même, un filtrage
 * côté client ne prouverait rien. Les fiches fiables n'apparaissent pas.
 */

const USER_ID = '4b7a4b1e-0003-4a11-9c33-2208340000ab'

const ROWS: TalentRow[] = [
  talentRow({ id: '31111111-1111-4111-8111-111111111111', fullName: 'Nina Fabre', reviewStatus: 'qualified' }),
  talentRow({ id: '32222222-2222-4222-8222-222222222222', fullName: 'Paul Garnier', reviewStatus: 'qualified' }),
  talentRow({ id: '33333333-3333-4333-8333-333333333333', fullName: 'Jean Dupont', reviewStatus: 'needs_review' }),
  talentRow({ id: '34444444-4444-4444-8444-444444444444', fullName: 'Jean Dupond', reviewStatus: 'needs_review' }),
]

test.describe('#2208.34 — golden journey : traiter uniquement les exceptions', () => {
  test('le CTA du rapport ne montre que les fiches à relire', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220834', features: ['talent_pool'] })
    await mockInlineCvZipImport(page, {
      total: 4,
      summary: { created: 2, auto_updated: 0, exception: 2, too_big: 0, failed: 0, ignored: 0 },
      outcomes: [
        {
          status: 'exception',
          file: 'dupont.pdf',
          consultantId: ROWS[2].id,
          state: 'probable_duplicate',
          conflicts: [],
        },
        { status: 'exception', file: 'dupond.pdf', consultantId: ROWS[3].id, state: 'ambiguous', conflicts: [] },
      ],
    })
    const requestedReviewStatuses: Array<string | null> = []
    await page.route(/\/talents\?/, route => {
      const status = new URL(route.request().url()).searchParams.get('reviewStatus')
      requestedReviewStatuses.push(status)
      const rows = status ? ROWS.filter(row => row.reviewStatus === status) : ROWS
      return fulfillJson(route, { items: rows, total: rows.length, page: 1, limit: 20 })
    })
    await page.route('**/delivery/propagation', route =>
      fulfillJson(route, { accounts: [], contacts: [], consultants: [] }),
    )

    await page.goto('/consultants')
    await expect(page.locator('table tbody tr')).toHaveCount(4, { timeout: 30_000 })

    // L'import vit dans le menu « Importer » du Vivier : on choisit la source d'abord.
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await page.getByRole('button', { name: 'Importer une archive ZIP' }).click()
    await page.getByLabel('Choisir une archive .zip').setInputFiles({
      name: 'cv-lot.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK'),
    })
    await page.getByRole('button', { name: 'Confirmer l’import' }).click()

    // Le rapport NOMME les deux exceptions et leur état — pas un compte muet.
    await expect(page.getByText(/2 à revoir/)).toBeVisible()
    await expect(page.getByText(/dupont\.pdf — isolé pour revue/)).toBeVisible()

    // Le CTA porte le compte réel et mène au filtre.
    await page.getByRole('link', { name: 'Traiter les 2 exceptions' }).click()

    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 15_000 })
    await expect(page.getByText('Jean Dupont', { exact: true })).toBeVisible()
    await expect(page.getByText('Jean Dupond', { exact: true })).toBeVisible()
    await expect(page.getByText('Nina Fabre')).not.toBeVisible()
    expect(requestedReviewStatuses).toContain('needs_review')
  })
})

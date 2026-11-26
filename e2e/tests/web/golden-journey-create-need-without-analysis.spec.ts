import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * #2208.42 (golden journey 11) — CRÉER UN BESOIN SANS ANALYSE PRÉALABLE.
 *
 * Un commercial raccroche avec un client jamais analysé, sans projet ni
 * signal public (la majorité des missions d'ESN, retour bêta 17/09). Il nomme
 * le CLIENT et c'est tout : « Créer le besoin sans projet » résout le compte au
 * portefeuille (sans doublon) et le besoin part avec `project_id: null` —
 * jamais un projet inventé pour satisfaire une contrainte technique. La
 * confirmation dit que le besoin naît « à qualifier », jamais déjà confirmé.
 */

const USER_ID = '4b7a4b1e-0011-4a11-9c33-2208420000ab'
const ACCOUNT_ID = 'a1b2c3d4-0011-4a11-8c33-220842000001'

test.describe('#2208.42 — golden journey : créer un besoin sans analyse préalable', () => {
  test('un titre et un client suffisent, sans projet', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220842', features: ['needs'] })
    await page.route(/\/projects\/needs\?/, route =>
      fulfillJson(route, {
        data: [],
        pagination: { totalItems: 0, hasNext: false, currentPage: 1, size: 20 },
        counters: { total: 0, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
      }),
    )
    const portfolio: unknown[] = []
    await page.route('**/accounts/portfolio', route => {
      portfolio.push(route.request().postDataJSON())
      return fulfillJson(route, { id: ACCOUNT_ID, company_name: 'Nova Conseil' })
    })
    const needs: Array<Record<string, unknown>> = []
    await page.route('**/projects/needs', route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() !== 'POST') return fulfillJson(route, { data: [] })
      needs.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, { id: 'need-1', title: 'Tech lead Java', account_id: ACCOUNT_ID, project_id: null })
    })

    // #4344 — « Besoins ouverts » n'est plus un écran : le geste se fait depuis le pipe (/projects).
    await page.route('**/projects/pipeline**', route =>
      fulfillJson(route, {
        columns: [],
        intake: 0,
        signals: 0,
        total_count: 0,
        total_amount_cents: 0,
        total_without_amount: 0,
        signed_count: 0,
        signed_amount_cents: 0,
        signed_without_amount: 0,
        scope: { requested: 'own', applied: 'own', outsideAnyPortfolioCount: 0 },
      }),
    )
    await page.route(/\/projects(\?|$)/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      return fulfillJson(route, [])
    })
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Créer un besoin' }).click()

    await page.getByLabel('Titre du besoin').fill('Tech lead Java')
    await page.getByLabel('Projet de rattachement').first().click()
    await page.getByPlaceholder('Chercher un compte ou un projet…').fill('Nova Conseil')
    await page.getByRole('button', { name: 'Créer le besoin sans projet, pour « Nova Conseil »' }).click()
    await expect(page.getByText('Nova Conseil — sans projet')).toBeVisible()
    expect(portfolio).toEqual([{ company_name: 'Nova Conseil' }])

    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Étape suivante' }).click()
    await expect(page.getByText(/Ce besoin sera créé à qualifier/)).toBeVisible()
    expect(needs).toHaveLength(0)

    await page.getByRole('button', { name: 'Créer le besoin' }).click()
    await expect.poll(() => needs.length).toBe(1)
    expect(needs[0]).toMatchObject({ account_id: ACCOUNT_ID, title: 'Tech lead Java', project_id: null })
  })
})

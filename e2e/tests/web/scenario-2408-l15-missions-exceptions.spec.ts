import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2408 — L15 Missions (contrat Louis 31/10/2026), joué dans un vrai navigateur.
 *
 * Les tests unitaires (`MissionsPage.test.tsx`, `MissionsTable.test.tsx`,
 * `mission-l15-filters.test.ts`) prouvent chaque prédicat ; ici la liste part
 * VRAIMENT de `GET /delivery/missions` (mocké au réseau) jusqu'à l'écran :
 *  - les exceptions L15 se lisent sur la ligne (#2408.3/.16/.17/.20/.21) ;
 *  - une vue prête resserre la liste (#2408.56) ;
 *  - un rôle sans `finance:read` ne voit ni la vue Marge (#2408.59), ni les
 *    tuiles de facturation (#2408.68/.69), ni la colonne Marge.
 */

function mission(id: string, label: string, over: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label,
    status: 'active',
    started_on: '2026-01-05',
    ends_on: '2027-06-30',
    daily_rate: 650,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    accountName: 'ACME',
    renewal: 'far',
    risks: [],
    nextAction: 'none',
    marginPercent: null,
    assignees: [],
    satisfaction: { client: null, consultant: null },
    legalEntityName: 'Bellum Conseil SAS',
    ...over,
  }
}

const ROWS = [
  mission('a1111111-1111-4111-8111-111111111111', 'TMA paiements', {
    risks: ['timesheet_missing', 'low_satisfaction', 'relationship_threatened'],
    satisfaction: { client: 'low', consultant: null },
  }),
  mission('b1111111-1111-4111-8111-111111111111', 'Run data plateforme', {
    risks: ['margin_unknown', 'prolonged_absence'],
  }),
]

async function mockMissions(page: Page, canReadFinance: boolean): Promise<void> {
  await page.route('**/delivery/missions**', route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, {
          canReadFinance,
          missions: ROWS,
          scope: { kind: 'workspace', outsideAnyPortfolio: null },
          intercontractCount: 0,
        }),
  )
}

test.describe('#2408 — L15 : exceptions, vues prêtes et droits sur /missions', () => {
  test('les exceptions L15 se lisent sur la ligne ; « CRA manquants » resserre la liste', async ({ page }) => {
    await mockSession(page, { features: [], tag: '815', role: 'owner' })
    await mockMissions(page, true)
    await page.goto('/missions')

    await expect(page.getByText('TMA paiements').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Run data plateforme').first()).toBeVisible()

    const views = page.getByTestId('mission-preset-views')
    await views.getByRole('button', { name: /CRA manquants/ }).click()
    await expect(page.getByText('Run data plateforme')).toHaveCount(0)
    await expect(page.getByText('TMA paiements').first()).toBeVisible()
  })

  test('sans finance:read : ni vue Marge, ni tuile de facturation, ni colonne Marge', async ({ page }) => {
    await mockSession(page, { features: [], tag: '816', role: 'member' })
    await mockMissions(page, false)
    await page.goto('/missions')

    await expect(page.getByText('TMA paiements').first()).toBeVisible({ timeout: 30_000 })
    const views = page.getByTestId('mission-preset-views')
    await expect(views.getByRole('button', { name: /CRA manquants/ })).toBeVisible()
    await expect(views.getByRole('button', { name: /Marge non mesurée/ })).toHaveCount(0)
    await expect(page.getByText('CA facturable non facturé')).toHaveCount(0)
    await expect(page.getByText('Factures échues')).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Marge' })).toHaveCount(0)
  })
})

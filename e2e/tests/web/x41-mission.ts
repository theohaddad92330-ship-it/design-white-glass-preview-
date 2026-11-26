import type { Page } from '@playwright/test'
import { json } from './x41-socle'

/**
 * Fiche mission fictive partagée par les parcours X41 21 et 28
 * (`/missions/:id`) : même forme que `MissionView`
 * (`apps/web/src/features/missions/api.ts`). Aucune donnée réelle.
 */

export const MISSION_ID = '11111111-1111-4111-8111-111111111111'

export const MISSION = {
  id: MISSION_ID,
  workspace_id: '22222222-2222-4222-8222-222222222222',
  account_id: '33333333-3333-4333-8333-333333333333',
  opportunity_id: null,
  label: 'Renfort plateforme',
  status: 'active',
  started_on: '2026-09-01',
  ends_on: '2026-12-15',
  daily_rate: 70_000,
  daily_cost: 50_000,
  contract_kind: 'regie',
  role_title: 'Développeur',
  billing_contact_id: null,
  owner_id: null,
  stage_entered_at: null,
  renewal_status: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  renewal: 'far',
  risks: [],
  nextAction: 'none',
  marginPercent: 28.5,
  accountName: 'ACME',
}

/** La fiche et la liste ; renvoie rien — les spécifiques sont mockés par le parcours. */
export async function mockMissionRecord(page: Page, over: Record<string, unknown> = {}): Promise<void> {
  const mission = { ...MISSION, ...over }
  await page.route(/\/delivery\/missions\/[^/]+$/, route =>
    route.request().resourceType() === 'document' ? route.fallback() : json(route, mission),
  )
  await page.route(/\/delivery\/missions(\?|$)/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, { missions: [mission], canReadFinance: true }),
  )
}

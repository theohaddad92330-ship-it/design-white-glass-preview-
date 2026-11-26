import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.18 — SCÉNARIO « PASSAGE OPPORTUNITÉ SIGNÉE VERS MISSION » (lot X41,
 * #2958).
 *
 * Sur la fiche d'une opportunité signée (`ProjectDetailSheet`, ouverte depuis
 * `/projects`), la jointure prospection → delivery a UNE porte, et elle dépend
 * d'un fait que l'API doit DIRE : `has_mission` (trivalent).
 *  - `false` → « Créer la mission » (mène à la création) ;
 *  - `true`  → « Ouvrir la mission » (mène à la liste des missions du compte) ;
 *  - absent  → AUCUN bouton : proposer « Créer la mission » sur une réponse
 *    muette ferait créer un doublon (`missions_opportunity_uniq` le refuserait).
 * Une affaire non signée ne propose aucune des deux portes.
 *
 * Ce que le scénario prouve, dans un vrai navigateur, route par route.
 *
 * DÉFAUT RÉEL TROUVÉ ET CORRIGÉ PAR CE SCÉNARIO : « Créer la mission » naviguait
 * vers `/missions/nouvelle` SANS rien porter — l'assistant redemandait le
 * projet et le client que la fiche venait de nommer, contre la promesse « aucune
 * ressaisie » (#1327). Corrigé (`?project_id=`, `fixedProjectId`) ; ce scénario est
 * l'appelant réel. Depuis le lot L5 (#4196), la page monte le formulaire de MISSION
 * (`MissionCreateForm`) : le scénario prouve que compte et affaire sont portés.
 */

const WON_ID = '55555555-5555-4555-8555-555555555555'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

function project(over: Record<string, unknown>) {
  return {
    id: WON_ID,
    label: 'Refonte du SI paiement',
    stage: 'won',
    company_name: 'Cliente SA',
    account_id: ACCOUNT_ID,
    amount_cents: 4_000_000,
    stage_entered_at: '2026-09-20T00:00:00.000Z',
    access_mode: null,
    ...over,
  }
}

const COLUMN = (stage: string, label: string, count: number, cents: number) => ({
  stage,
  label,
  count,
  amount_cents: cents,
  without_amount: 0,
})

async function mockPipe(page: Page, rows: unknown[]): Promise<void> {
  await page.route(/\/projects\/pipeline(\?|$)/, route =>
    json(route, {
      columns: [COLUMN('qualified', 'Qualifié', 1, 1_000_000), COLUMN('won', 'Signé', 1, 4_000_000)],
      intake: 0,
      signals: 0,
      total_count: rows.length,
      total_amount_cents: 5_000_000,
      total_without_amount: 0,
    }),
  )
  await page.route(/\/projects(\?|$)/, route =>
    route.request().resourceType() === 'document' ? route.fallback() : json(route, rows),
  )
}

async function openWon(page: Page): Promise<void> {
  await page.goto('/projects')
  await page.getByText('Refonte du SI paiement').first().click()
}

test.describe('#2154.18 — opportunité signée vers mission', () => {
  test('signée sans mission : « Créer la mission » porte le projet — le formulaire ne redemande ni le compte ni l’affaire', async ({
    page,
  }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool', 'missions'], tag: '18' })
    await mockPipe(page, [project({ has_mission: false })])
    const created: unknown[] = []
    // #4196 (L5) — « Nouvelle mission » écrit une MISSION (POST /delivery/missions), plus un besoin.
    await page.route(/\/delivery\/missions$/, route => {
      if (route.request().resourceType() === 'document' || route.request().method() !== 'POST') return route.fallback()
      created.push(route.request().postDataJSON())
      return json(route, { id: 'a8888888-8888-4888-8888-888888888888', label: 'Architecte cloud' })
    })
    await page.route(/\/consultants$/, route =>
      route.request().resourceType() === 'document' ? route.fallback() : json(route, []),
    )
    await openWon(page)

    await page.getByRole('button', { name: 'Créer la mission' }).click()
    await expect(page).toHaveURL(new RegExp(`/missions/nouvelle\\?project_id=${WON_ID}$`), { timeout: 30_000 })

    // L'opportunité signée est IMPOSÉE : le compte est nommé, aucune recherche de compte à refaire.
    await expect(page.getByText('Cliente SA')).toBeVisible()
    // Le champ de RECHERCHE de compte n'existe pas (le libellé « Compte » seul se retrouve ailleurs sur la page).
    await expect(page.locator('#mission-create-account')).toHaveCount(0)
    await page.getByLabel('Intitulé').fill('Architecte cloud')
    await page.getByLabel('Date de début').fill('2026-11-02')
    await page.getByRole('button', { name: 'Créer la mission' }).click()

    await expect.poll(() => created.length).toBe(1)
    expect(created[0]).toMatchObject({
      label: 'Architecte cloud',
      startedOn: '2026-11-02',
      opportunityId: WON_ID,
      accountId: ACCOUNT_ID,
    })
    await expect(page).toHaveURL(/\/missions\/a8888888-8888-4888-8888-888888888888$/, { timeout: 30_000 })
  })

  test('signée avec mission : « Ouvrir la mission » mène aux missions DU COMPTE, jamais à une création', async ({
    page,
  }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool', 'missions'], tag: '18' })
    await mockPipe(page, [project({ has_mission: true })])
    await openWon(page)

    await expect(page.getByRole('button', { name: 'Créer la mission' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Ouvrir la mission' }).click()
    await expect(page).toHaveURL(/\/missions\?/, { timeout: 30_000 })
    expect(new URL(page.url()).searchParams.get('accountId')).toBe(ACCOUNT_ID)
  })

  test('l’API ne dit pas si une mission existe : aucune des deux portes (jamais un doublon)', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool', 'missions'], tag: '18' })
    await mockPipe(page, [project({})])
    await openWon(page)

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Créer la mission' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ouvrir la mission' })).toHaveCount(0)
  })

  test('une affaire non signée ne propose aucune porte vers la mission', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool', 'missions'], tag: '18' })
    await mockPipe(page, [project({ stage: 'qualified', has_mission: false })])
    await openWon(page)

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Créer la mission' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ouvrir la mission' })).toHaveCount(0)
  })
})

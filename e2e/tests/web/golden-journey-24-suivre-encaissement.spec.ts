import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'
import { readinessItem } from './x41-livraison'

/**
 * #2958.55 (#2208.55, golden journey 24) — SUIVRE L'ENCAISSEMENT.
 *
 * `/missions/encaissements` (`CollectionsPage`) lit les factures DÉJÀ émises
 * ailleurs (BellumAI n'en émet aucune) sur les douze derniers mois, en UN
 * `GET /delivery/invoice-readiness/collections?months=…`. Date figée à
 * 2026-10-02 (`page.clock.setFixedTime`) : la fenêtre et le retard ne
 * dépendent pas du jour où la CI tourne.
 *
 * Ce que le parcours prouve :
 *  1. le total « Facturé » (18 900 €, 3 factures), puis chaque statut
 *     (réglée / échue / en litige) est compté et lisible — quatre statuts,
 *     aucun cinquième « partiellement réglée » (doctrine du 21/09) ;
 *  2. une facture échue porte son retard en jours et sa prochaine action ;
 *  3. « Marquer réglée » ouvre « Enregistrer un règlement » et envoie
 *     `POST …/paid?month=2026-09` avec le montant en CENTIMES — champ vide :
 *     corps `{}`, jamais « réglée à zéro euro » ;
 *  4. un mois qui ne répond pas est DIT (« totaux partiels »), jamais
 *     absorbé silencieusement.
 */

const FIXED_NOW = new Date('2026-10-02T10:00:00.000Z')

const SEPT = readinessItem({
  missionId: 'm-sept',
  missionLabel: 'Data lake',
  accountName: 'Initech',
  periodMonth: '2026-09-01',
  state: 'invoiced',
  blockers: [],
  invoicedAt: '2026-09-05T09:00:00.000Z',
  invoiceReference: 'FA-2026-0114',
  invoicedAmountCents: 840_000,
  dueOn: '2026-09-20',
})
const AUG = readinessItem({
  missionId: 'm-aout',
  missionLabel: 'Run plateforme',
  accountName: 'ACME',
  periodMonth: '2026-08-01',
  state: 'invoiced',
  blockers: [],
  invoicedAt: '2026-08-05T09:00:00.000Z',
  invoiceReference: 'FA-2026-0098',
  invoicedAmountCents: 600_000,
  dueOn: '2026-09-05',
  paidAt: '2026-09-03T09:00:00.000Z',
  paidAmountCents: 600_000,
})
const JUL = readinessItem({
  missionId: 'm-juil',
  missionLabel: 'Refonte SI',
  accountName: 'Globex',
  periodMonth: '2026-07-01',
  state: 'invoiced',
  blockers: [],
  invoicedAt: '2026-07-05T09:00:00.000Z',
  invoiceReference: 'FA-2026-0071',
  invoicedAmountCents: 450_000,
  dueOn: '2026-08-05',
  disputedAt: '2026-08-20T09:00:00.000Z',
  disputeReason: 'Jours contestés par le client',
})

const BY_MONTH: Record<string, unknown[]> = { '2026-09': [SEPT], '2026-08': [AUG], '2026-07': [JUL] }

type Calls = { paid: Array<{ url: string; body: unknown }> }

async function mockEncaissements(page: Page, options: { failMonth?: string } = {}): Promise<Calls> {
  const calls: Calls = { paid: [] }
  await page.clock.setFixedTime(FIXED_NOW)
  await page.route('**/workspaces/rules', route => json(route, { rules: [] }))
  await page.route(/\/delivery\/invoice-readiness\/collections\?/, route => {
    if (route.request().resourceType() === 'document') return route.fallback()
    const months = (new URL(route.request().url()).searchParams.get('months') ?? '').split(',')
    // Lecture groupée : un mois qui échoue fait échouer le bloc entier.
    if (options.failMonth && months.includes(options.failMonth)) return json(route, { message: 'indisponible' }, 500)
    const items = months.flatMap(month => BY_MONTH[month] ?? [])
    return json(route, { canReadFinance: true, items })
  })
  await page.route(/\/delivery\/invoice-readiness\/m-sept\/paid/, route => {
    calls.paid.push({ url: route.request().url(), body: route.request().postDataJSON() })
    return json(route, { ...SEPT, paidAt: '2026-10-02T10:00:00.000Z' })
  })
  return calls
}

test.describe('#2208.55 — golden journey 24 : suivre l’encaissement', () => {
  test('le facturé se décompose en réglée / échue / en litige, et la facture échue dit son retard', async ({
    page,
  }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '24' })
    await mockEncaissements(page)
    await page.goto('/missions/encaissements')

    await expect(page.getByText('Les 12 derniers mois.', { exact: false })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Bellum n’émet aucune facture.', { exact: false })).toBeVisible()
    // Le total facturé et son nombre de factures.
    await expect(page.getByText('18 900 €').first()).toBeVisible()
    await expect(page.getByText('3 factures').first()).toBeVisible()
    // Les trois factures, chacune sous son statut.
    await expect(page.getByText('Initech').first()).toBeVisible()
    await expect(page.getByText('Échue', { exact: true })).toBeVisible()
    await expect(page.getByText('Réglée', { exact: true })).toBeVisible()
    await expect(page.getByText('En litige', { exact: true })).toBeVisible()
    // La facture échue porte son retard (12 jours entre le 20/09 et le 02/10).
    await expect(page.getByText(/12 j/).first()).toBeVisible()
    // Le litige garde sa raison à l'écran de la facture ; aucun statut « partiel ».
    await expect(page.getByText('Partiellement', { exact: false })).toHaveCount(0)
  })

  test('« Marquer réglée » envoie le montant en centimes — vide : corps {}', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '24' })
    const calls = await mockEncaissements(page)
    await page.goto('/missions/encaissements')

    const row = page.getByRole('row', { name: /Initech/ })
    await row.getByRole('button', { name: 'Gestes sur cette facture' }).click()
    await page.getByRole('menuitem', { name: 'Marquer réglée' }).click()
    await expect(page.getByText('Enregistrer un règlement')).toBeVisible()
    await page.getByLabel('Montant encaissé, en euros').fill('8400')
    await page.getByRole('button', { name: 'Enregistrer le règlement' }).click()
    await expect.poll(() => calls.paid.length).toBe(1)
    expect(calls.paid[0]?.url).toContain('month=2026-09')
    expect(calls.paid[0]?.body).toEqual({ amountCents: 840_000 })

    await row.getByRole('button', { name: 'Gestes sur cette facture' }).click()
    await page.getByRole('menuitem', { name: 'Marquer réglée' }).click()
    await page.getByRole('button', { name: 'Enregistrer le règlement' }).click()
    await expect.poll(() => calls.paid.length).toBe(2)
    expect(calls.paid[1]?.body).toEqual({})
  })

  test('une fenêtre qui ne répond pas est DITE — totaux partiels, jamais absorbée', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '24' })
    await mockEncaissements(page, { failMonth: '2026-08' })
    await page.goto('/missions/encaissements')
    await expect(page.getByText('12 mois de la fenêtre n’ont pas répondu : ces totaux sont partiels.')).toBeVisible({
      timeout: 30_000,
    })
  })
})

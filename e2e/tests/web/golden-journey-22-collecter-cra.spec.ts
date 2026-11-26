import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2958.53 (#2208.53, golden journey 22) — COLLECTER LE CRA.
 *
 * Numérotation : `suffixe = numéro de la liste + 31` (convention des bilans,
 * `golden-journey-consult-talent.spec.ts`).
 *
 * L'écran « Relevés d'activité » (`/missions/cra`, `TimesheetsPage`) :
 *  1. le mois se lit AVEC son résumé — « 1 en attente · 1 validés » — et la
 *     ligne dit les jours déclarés sur les jours attendus (« 21 j / 21 j ») ;
 *  2. « Ouvrir les relevés attendus » envoie `POST /delivery/timesheets/open`
 *     avec EXACTEMENT `{ month }` — un geste, pas une écriture cachée ;
 *  3. « Rejeter le relevé » exige un motif : le corps envoyé porte le motif,
 *     les jours contestés et la date limite de correction ;
 *  4. une lecture qui échoue est DITE (« Ce n'est pas « aucun relevé » »),
 *     jamais une liste vide muette.
 *
 * Aucune donnée réelle : relevés fictifs, API mockée, tout appel non mocké
 * répond 404 (socle X41).
 */

const MONTH = '2026-09'

function line(over: Record<string, unknown> = {}) {
  return {
    timesheetId: 'ts-1',
    missionId: 'm-1',
    missionLabel: 'Run plateforme',
    accountName: 'ACME',
    consultantId: 'c-1',
    consultantName: 'A. Dupont',
    periodMonth: `${MONTH}-01`,
    status: 'submitted',
    days: 21,
    expectedDays: 21,
    gap: 0,
    gapKind: 'none',
    gapExplanation: null,
    blocksInvoicing: false,
    validatedByClientAt: null,
    approverName: null,
    anomalies: [],
    remindersSent: 0,
    lastReminderAt: null,
    rejectedAt: null,
    rejectionReason: null,
    contestedDays: null,
    correctionDeadline: null,
    submittedByName: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
    notApplicable: null,
    ...over,
  }
}

const SUMMARY = {
  total: 2,
  awaiting: 1,
  late: 0,
  submitted: 1,
  validated: 1,
  disputed: 0,
  rejected: 0,
  escalated: 0,
  notRequired: 0,
  blocking: 0,
  declaredDays: 21,
}

type Calls = { open: unknown[]; reject: unknown[] }

async function mockCra(page: Page): Promise<Calls> {
  const calls: Calls = { open: [], reject: [] }
  await page.route(/\/delivery\/timesheets(\?|$)/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, {
          month: MONTH,
          items: [
            line(),
            line({
              timesheetId: null,
              missionId: 'm-2',
              missionLabel: 'Refonte SI',
              consultantId: 'c-2',
              consultantName: 'B. Martin',
              status: 'missing',
              days: null,
            }),
          ],
          summary: SUMMARY,
        }),
  )
  await page.route('**/delivery/timesheets/open', route => {
    calls.open.push(route.request().postDataJSON())
    return json(route, { created: 1 })
  })
  await page.route('**/delivery/timesheets/ts-1/reject', route => {
    calls.reject.push(route.request().postDataJSON())
    return json(route, { id: 'ts-1' })
  })
  await page.route('**/delivery/timesheets/reminders*', route => json(route, { channel: { kind: 'none' }, items: [] }))
  await page.route('**/delivery/timesheets/escalations*', route => json(route, []))
  return calls
}

test.describe('#2208.53 — golden journey 22 : collecter le CRA', () => {
  test('le mois se lit avec son résumé, et « ouvrir » envoie exactement { month }', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '22' })
    const calls = await mockCra(page)
    await page.goto('/missions/cra')

    await expect(page.getByText('1 en attente · 1 validés')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Run plateforme').first()).toBeVisible()
    await expect(page.getByText('Refonte SI').first()).toBeVisible()
    await expect(page.getByText('Validé consultant')).toBeVisible()

    await page.getByRole('button', { name: 'Ouvrir les relevés attendus' }).click()
    await expect.poll(() => calls.open.length).toBe(1)
    expect(calls.open[0]).toEqual({ month: MONTH })
  })

  test('« Rejeter le relevé » exige un motif et envoie motif, jours contestés, date limite', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '22' })
    const calls = await mockCra(page)
    await page.goto('/missions/cra')

    await page.getByRole('button', { name: 'Rejeter le relevé' }).first().click()
    await expect(page.getByText('Rejeter ce relevé')).toBeVisible()
    // Sans motif, jours contestés ni deadline, le geste ne part pas : le bouton est inerte.
    const confirm = page.getByRole('button', { name: 'Rejeter', exact: true })
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Motif du rejet').fill('Trois jours de congés non déduits')
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Jours contestés (obligatoire)').fill('3')
    await page.getByLabel('Deadline de correction (obligatoire)').fill('2026-10-15')
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect.poll(() => calls.reject.length).toBe(1)
    expect(calls.reject[0]).toEqual({
      reason: 'Trois jours de congés non déduits',
      contestedDays: 3,
      correctionDeadline: '2026-10-15',
    })
  })

  test('une lecture qui échoue le DIT — jamais « aucun relevé »', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '22' })
    await page.route(/\/delivery\/timesheets(\?|$)/, route =>
      route.request().resourceType() === 'document' ? route.fallback() : json(route, { message: 'indisponible' }, 500),
    )
    await page.goto('/missions/cra')
    await expect(page.getByText('Les relevés n’ont pas pu être chargés')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Ce n’est pas « aucun relevé ».')).toBeVisible()
    await expect(page.getByText('Aucune mission sur ce mois')).toHaveCount(0)
  })
})

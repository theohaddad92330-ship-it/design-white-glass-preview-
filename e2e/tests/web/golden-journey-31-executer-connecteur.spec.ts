import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2958.62 (#2208.62, golden journey 31) — EXÉCUTER VIA UN CONNECTEUR.
 *
 * Doctrine : une écriture CRM/ERP passe par une PORTE — geste de système =
 * demande VISIBLE, prévisualisation FIGÉE, expiration — et BellumAI ne dit
 * jamais « fait » sans que la décision ait été prise par un humain.
 *
 * Sur `/actions` (Centre d'actions, onglet « À valider »), une demande
 * d'écriture vers le CRM (« Affaire à déplacer dans ton CRM ») se lit AVANT
 * de partir. Ce que le parcours prouve :
 *  1. la demande dit sa nature, qui l'a demandée (« une automatisation »),
 *     chaque champ avec son ANCIENNE valeur (« était : Qualification ») et sa
 *     date d'expiration — on approuve exactement ce qu'on a lu ;
 *  2. « Approuver » envoie `POST …/decide` avec EXACTEMENT `{ approve: true }`,
 *     « Refuser » `{ approve: false }` — aucune autre écriture n'est émise ;
 *  3. sans CRM branché, la file DIT « Aucun CRM branché » et nomme la
 *     différence avec « tout est validé » (jamais une file vide muette), avec
 *     la porte vers `/integrations`.
 */

const REQUEST_ID = 'crm-write-1'

const REQUEST = {
  id: REQUEST_ID,
  kind: 'update_deal_stage',
  preview: [
    { field: 'Affaire', value: 'Refonte SI — Globex', key: 'deal' },
    { field: 'Étape', value: 'Proposition', key: 'stage', previous: 'Qualification' },
  ],
  origin: 'system',
  createdAt: '2026-10-01T09:00:00.000Z',
  expiresAt: '2026-10-04T09:00:00.000Z',
  requestedByYou: false,
  state: 'pending',
  target: {
    accountId: null,
    accountName: 'Globex',
    contactId: null,
    contactName: null,
    ownerId: null,
    ownerName: null,
    channel: null,
    risk: 'medium',
    source: null,
  },
  assignedTo: null,
  snoozedUntil: null,
  batchId: null,
}

type Calls = { decisions: unknown[]; otherWrites: string[] }

async function mockActions(page: Page, status: 'ready' | 'not_connected'): Promise<Calls> {
  const calls: Calls = { decisions: [], otherWrites: [] }
  page.on('request', request => {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
    const path = new URL(request.url()).pathname
    if (isWrite && request.url().includes(':4599') && !/write-requests\/.+\/decide|mark-seen|laura\/plan/.test(path)) {
      calls.otherWrites.push(`${request.method()} ${path}`)
    }
  })
  await page.route(/\/crm\/write-requests$/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, { status, requests: status === 'ready' ? [REQUEST] : [] }),
  )
  await page.route(`**/crm/write-requests/${REQUEST_ID}/decide`, route => {
    calls.decisions.push(route.request().postDataJSON())
    return json(route, { ...REQUEST, state: 'approved' })
  })
  return calls
}

test.describe('#2208.62 — golden journey 31 : exécuter via un connecteur', () => {
  test('la demande se lit avant de partir : nature, auteur, ancienne valeur, expiration', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '31' })
    await mockActions(page, 'ready')
    await page.goto('/actions')

    await expect(page.getByText('Affaire à déplacer dans ton CRM')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Demandée par une automatisation')).toBeVisible()
    // Chaque champ se lit avec son ANCIENNE valeur : on approuve ce qu'on a lu.
    const etape = page.getByText('Étape —', { exact: false })
    await expect(etape).toContainText('Qualification')
    await expect(etape).toContainText('Proposition')
    // La conséquence est nommée, jamais nue.
    await expect(page.getByText('Touche plusieurs envois à venir', { exact: false })).toBeVisible()
    await expect(page.getByText('expire le', { exact: false }).first()).toBeVisible()
  })

  test('« Approuver » envoie exactement { approve: true } ; « Refuser » { approve: false } — rien d’autre n’est écrit', async ({
    page,
  }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '31' })
    const calls = await mockActions(page, 'ready')
    await page.goto('/actions')

    await page.getByRole('button', { name: 'Approuver' }).first().click()
    await expect.poll(() => calls.decisions.length).toBe(1)
    expect(calls.decisions[0]).toEqual({ approve: true })

    // « Refuser » vit dans le menu « Autres gestes » (un seul bouton primaire par carte, #4163 LF) : un geste de plus à ouvrir, pas un geste de moins.
    await page
      .getByRole('button', { name: /Autres gestes/ })
      .first()
      .click()
    await page.getByRole('menuitem', { name: 'Refuser' }).click()
    await expect.poll(() => calls.decisions.length).toBe(2)
    expect(calls.decisions[1]).toEqual({ approve: false })
    expect(calls.otherWrites).toEqual([])
  })

  test('sans CRM branché, la file le DIT — ce n’est pas « tout est validé » — et ouvre la porte vers les intégrations', async ({
    page,
  }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '31' })
    await mockActions(page, 'not_connected')
    await page.goto('/actions')

    await expect(page.getByText('Aucun CRM branché')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('ce n’est pas la même chose que « tout est validé »', { exact: false })).toBeVisible()
    await page.getByRole('link', { name: 'Brancher mon CRM' }).click()
    await expect(page).toHaveURL(/\/integrations$/, { timeout: 30_000 })
  })
})

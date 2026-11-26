import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2958.61 (#2208.61, golden journey 30) — VALIDER LES MESSAGES.
 *
 * Le centre d'approbation (`OutreachApprovalCenter`, sur `/actions/sequences`)
 * est la seule porte entre « Laura a préparé » et « le commercial a validé ».
 * Doctrine : le copilote PRÉPARE, il n'envoie jamais ; « fait » ne porte jamais
 * de preuve d'envoi — valider n'est jamais exécuter (aucune route d'envoi).
 *
 * Ce que le parcours prouve :
 *  1. la vue « À valider » liste les messages avec destinataire, canal,
 *     intention, version et coût « Non mesuré » (jamais « 0 ») ;
 *  2. un message qui BLOQUE (« Ce message conviendrait à n'importe quelle
 *     autre entreprise ») nomme son bloqueur et n'a AUCUN bouton « Valider » ;
 *  3. « Valider » envoie `POST /outreach/messages/approve` avec la VERSION
 *     AFFICHÉE — `{ items: [{ id, version }] }` — jamais le dernier état ;
 *  4. « Valider les 1 conformes affichés » ne prend QUE les conformes ; la
 *     réponse dit « Rien n'est parti : l'envoi reste ton geste » ;
 *  5. aucun appel d'envoi n'est émis, quoi qu'on valide.
 */

const CLEAN_ID = '00000000-0000-4000-8000-0000000000a1'
const BLOCKED_ID = '00000000-0000-4000-8000-0000000000a2'

function message(over: Record<string, unknown> = {}) {
  return {
    id: CLEAN_ID,
    contact_id: '00000000-0000-4000-8000-0000000000c1',
    contact_name: 'Marie Dubois',
    contact_role: 'DSI',
    account_name: 'Acme',
    channel: 'email',
    intent: 'open_relationship',
    source: 'laura',
    reason: null,
    status: 'needs_review',
    sequence_id: null,
    sequence_step_id: null,
    asset_id: null,
    owner_id: 'u-1',
    current_version: 2,
    message_style_template_id: null,
    message_style_template_version: null,
    subject: 'Votre DSI recrute',
    body: 'Bonjour Marie,\nVotre équipe plateforme recrute deux profils DevOps.',
    versions: [
      {
        version: 1,
        kind: 'template',
        subject: 'Bonjour',
        body: 'Bonjour {prénom}',
        author: null,
        created_at: '2026-09-22T10:00:00.000Z',
      },
      {
        version: 2,
        kind: 'personalized',
        subject: 'Votre DSI recrute',
        body: 'Bonjour Marie,\nVotre équipe plateforme recrute deux profils DevOps.',
        author: 'u-1',
        created_at: '2026-09-22T10:00:00.000Z',
      },
    ],
    approval: null,
    view: 'to_review',
    blockers: [],
    risks: [],
    can_approve: true,
    required_permission: 'messages:send',
    created_at: '2026-09-22T10:00:00.000Z',
    updated_at: '2026-09-22T10:00:00.000Z',
    ...over,
  }
}

type Calls = { approve: unknown[]; sends: string[] }

async function mockCentre(page: Page): Promise<Calls> {
  const calls: Calls = { approve: [], sends: [] }
  let approved = false
  page.on('request', request => {
    if (/\/send\b|\/execute\b/.test(request.url()) && request.method() !== 'GET') calls.sends.push(request.url())
  })
  await page.route('**/outreach/sequences*', route => json(route, []))
  await page.route('**/outreach/call-tasks', route => json(route, []))
  await page.route('**/outreach/messages/approve', route => {
    const body = route.request().postDataJSON() as { items: Array<{ id: string; version: number }> }
    calls.approve.push(body)
    approved = true
    return json(route, { approved: body.items.map(i => i.id), excluded: [] })
  })
  await page.route(/\/outreach\/messages(\?|$)/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, [
          message(
            approved
              ? {
                  status: 'approved',
                  view: 'ready',
                  approval: { version: 2, date: '2026-10-02T10:00:00.000Z', cost: null },
                }
              : {},
          ),
          message({
            id: BLOCKED_ID,
            contact_name: 'Paul Martin',
            contact_role: 'DAF',
            account_name: 'Globex',
            current_version: 1,
            versions: [],
            blockers: ['generic_message'],
            subject: 'Un message pour vous',
            body: 'Bonjour, nous aidons les entreprises à recruter.',
          }),
        ]),
  )
  return calls
}

test.describe('#2208.61 — golden journey 30 : valider les messages', () => {
  test('un message conforme se valide ; un message qui bloque nomme son bloqueur et n’a aucun bouton', async ({
    page,
  }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '30' })
    await mockCentre(page)
    await page.goto('/actions/sequences')

    await expect(page.getByRole('heading', { name: 'Centre d’approbation' })).toBeVisible({ timeout: 30_000 })
    const clean = page.getByRole('listitem').filter({ hasText: 'Marie Dubois' })
    const blocked = page.getByRole('listitem').filter({ hasText: 'Paul Martin' })
    await expect(clean).toContainText('DSI')
    await expect(clean).toContainText('E-mail')
    await expect(clean).toContainText('Ouvrir une relation')
    // Aucun coût n'est mesuré par message : « Non mesuré », jamais « 0 ».
    await expect(clean).toContainText('Non mesuré')
    await expect(clean.getByRole('button', { name: 'Valider', exact: true })).toBeVisible()

    await expect(blocked).toContainText('Ce message conviendrait à n’importe quelle autre entreprise')
    await expect(blocked.getByRole('button', { name: 'Valider', exact: true })).toHaveCount(0)
  })

  test('« Valider » envoie la VERSION AFFICHÉE, dit que rien n’est parti, et n’émet aucun envoi', async ({ page }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '30' })
    const calls = await mockCentre(page)
    await page.goto('/actions/sequences')

    const clean = page.getByRole('listitem').filter({ hasText: 'Marie Dubois' })
    await clean.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect.poll(() => calls.approve.length).toBe(1)
    expect(calls.approve[0]).toEqual({ items: [{ id: CLEAN_ID, version: 2 }] })
    await expect(page.getByText('Rien n’est parti : l’envoi reste ton geste.', { exact: false })).toBeVisible()
    expect(calls.sends).toEqual([])
  })

  test('« Valider les conformes affichés » ne prend QUE les conformes', async ({ page }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '30' })
    const calls = await mockCentre(page)
    await page.goto('/actions/sequences')

    await page.getByRole('button', { name: 'Valider les 1 conformes affichés' }).click()
    await expect.poll(() => calls.approve.length).toBe(1)
    expect(calls.approve[0]).toEqual({ items: [{ id: CLEAN_ID, version: 2 }] })
  })
})

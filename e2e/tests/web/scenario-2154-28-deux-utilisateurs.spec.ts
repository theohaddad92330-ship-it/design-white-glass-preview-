import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.28 — SCÉNARIO « DEUX UTILISATEURS SIMULTANÉS » (lot X41, #2958).
 *
 * Deux membres d'un même espace ouvrent le Centre d'actions sur la MÊME
 * demande d'écriture CRM. Le premier la décide ; le second, dont l'écran est
 * resté sur l'état d'avant, clique ensuite. La doctrine : « un timeout n'est
 * pas un échec », « une écriture CRM passe par une porte » — et un geste
 * concurrent ne doit jamais se faire passer pour un succès.
 *
 * Deux contextes de navigateur (deux sessions) partagent UN état serveur
 * simulé : `decided` passe à vrai à la première décision.
 *
 * Ce que le scénario prouve :
 *  1. la première décision part avec `{ approve: true }` et réussit
 *     (« Écriture autorisée ») ;
 *  2. la seconde — même demande, écran périmé — reçoit un 409 du serveur et
 *     l'écran le DIT avec la raison du serveur (« Cette demande a déjà été
 *     traitée ») ; il n'affiche JAMAIS « Écriture autorisée » pour une
 *     décision qui n'a pas eu lieu ;
 *  3. après l'échec, la file se relit : la demande n'y est plus (« Rien à
 *     valider »), au lieu de rester cliquable ;
 *  4. une seule écriture a été acceptée côté serveur ;
 *  5. DÉFAUT RÉEL TROUVÉ ET CORRIGÉ PAR CE SCÉNARIO : la décision d'une écriture
 *     CRM ne disait RIEN, ni au succès ni à l'échec (`ActionCenter.tsx`, file
 *     CRM, alors que les files approbations et ERP du même centre le disent) —
 *     le second membre voyait la carte disparaître sans un mot. Corrigé, test
 *     d'abord (`ActionCenter.test.tsx`, « #2958 ») ; ce scénario est l'appelant
 *     réel.
 */

const REQUEST_ID = 'crm-write-shared'

const REQUEST = {
  id: REQUEST_ID,
  kind: 'update_deal_stage',
  preview: [{ field: 'Étape', value: 'Proposition', key: 'stage', previous: 'Qualification' }],
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
    risk: null,
    source: null,
  },
  assignedTo: null,
  snoozedUntil: null,
  batchId: null,
}

type Shared = { decided: boolean; accepted: unknown[]; refused: number }

async function mockShared(page: Page, shared: Shared): Promise<void> {
  await page.route(/\/crm\/write-requests$/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, { status: 'ready', requests: shared.decided ? [] : [REQUEST] }),
  )
  await page.route(`**/crm/write-requests/${REQUEST_ID}/decide`, route => {
    if (shared.decided) {
      shared.refused += 1
      return json(route, { message: 'Cette demande a déjà été traitée' }, 409)
    }
    shared.decided = true
    shared.accepted.push(route.request().postDataJSON())
    return json(route, { ...REQUEST, state: 'approved' })
  })
}

test.describe('#2154.28 — deux utilisateurs simultanés', () => {
  test('la seconde décision, sur un écran périmé, échoue VISIBLEMENT et la file se relit', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000)
    const shared: Shared = { decided: false, accepted: [], refused: 0 }
    const contextA = await browser.newContext({ locale: 'fr-FR', baseURL })
    const contextB = await browser.newContext({ locale: 'fr-FR', baseURL })
    try {
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()
      await mockSession(pageA, { features: ['accounts', 'talent_pool'], tag: '28' })
      await mockSession(pageB, { features: ['accounts', 'talent_pool'], tag: '29' })
      await mockShared(pageA, shared)
      await mockShared(pageB, shared)

      // Les deux voient la demande.
      await pageA.goto('/actions')
      await pageB.goto('/actions')
      await expect(pageA.getByText('Affaire à déplacer dans ton CRM')).toBeVisible({ timeout: 30_000 })
      await expect(pageB.getByText('Affaire à déplacer dans ton CRM')).toBeVisible({ timeout: 30_000 })

      // A décide d'abord.
      await pageA.getByRole('button', { name: 'Approuver' }).first().click()
      await expect(pageA.getByText('Écriture autorisée')).toBeVisible({ timeout: 30_000 })
      expect(shared.accepted).toEqual([{ approve: true }])

      // B, resté sur l'état d'avant, clique ensuite.
      await pageB.getByRole('button', { name: 'Approuver' }).first().click()
      await expect(pageB.getByText('Cette demande a déjà été traitée')).toBeVisible({ timeout: 30_000 })
      await expect(pageB.getByText('Écriture autorisée')).toHaveCount(0)
      expect(shared.refused).toBe(1)

      // La file de B se relit : la demande n'y est plus.
      await expect(pageB.getByText('Affaire à déplacer dans ton CRM')).toHaveCount(0, { timeout: 30_000 })
      expect(shared.accepted).toHaveLength(1)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})

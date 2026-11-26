import { expect, test } from '@playwright/test'
import { fulfillJson } from './golden-journey-fixtures'
import {
  mockNeedWithMatching,
  NEED_ID,
  openMatchingDrawer,
  RUN_ID,
  SOPHIE_ID,
} from './golden-journey-matching-fixtures'

/**
 * #2208.47 (golden journey 16) — PRÉSENTER UN CONSULTANT.
 *
 * « Positionner » ne PRÉSENTE rien au client à ce stade (« Rien n'est envoyé
 * au client », doctrine : Laura prépare, le commercial envoie). Le geste
 * passe par un aperçu — ce que je crée, ce que je peux préparer, ce que je
 * vérifie — puis une confirmation explicite ; seul `POST …/submissions`
 * écrit, avec les préparations COCHÉES et pas d'autres.
 */

const USER_ID = '4b7a4b1e-0016-4a11-9c33-2208470000ab'

test.describe('#2208.47 — golden journey : présenter un consultant', () => {
  test('aperçu d’abord, confirmation ensuite, rien d’écrit avant', async ({ page }) => {
    await mockNeedWithMatching(page, { userId: USER_ID, tag: '220847' })
    let previews = 0
    const positions: unknown[] = []
    await page.route(`**/needs/${NEED_ID}/submissions/preview`, route => {
      previews += 1
      return fulfillJson(route, {
        creates: ['Un positionnement de Sophie M. sur « Data Engineer »'],
        canPrepare: [
          { action: 'cv', label: 'Préparer le CV ciblé', defaultChecked: true },
          { action: 'message', label: 'Préparer le message au client', defaultChecked: false },
        ],
        checks: [{ label: 'Disponibilité confirmée', level: 'ok' }],
        missing: [],
        blocked: false,
      })
    })
    await page.route(`**/needs/${NEED_ID}/submissions`, route => {
      if (route.request().method() !== 'POST') return fulfillJson(route, { items: [] })
      positions.push(route.request().postDataJSON())
      return fulfillJson(route, { id: 'sub-1' })
    })
    await openMatchingDrawer(page)
    expect(previews).toBe(0)

    await page.getByRole('button', { name: 'Positionner' }).first().click()
    await expect(page.getByText('Positionner Sophie M.')).toBeVisible()
    await expect(page.getByText("Rien n'est envoyé au client à ce stade.")).toBeVisible()
    await expect(page.getByText('Disponibilité confirmée')).toBeVisible()
    expect(positions).toHaveLength(0)

    await page.getByRole('button', { name: 'Positionner', exact: true }).last().click()
    await expect(page.getByText('Positionnement préparé')).toBeVisible()
    expect(positions).toEqual([{ runId: RUN_ID, consultantId: SOPHIE_ID, prepare: ['cv'] }])
  })
})

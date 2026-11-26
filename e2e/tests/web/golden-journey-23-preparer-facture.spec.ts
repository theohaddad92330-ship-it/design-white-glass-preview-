import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'
import { readinessItem, readinessSummary } from './x41-livraison'

/**
 * #2958.54 (#2208.54, golden journey 23) — PRÉPARER LA FACTURE.
 *
 * Doctrine (CLAUDE.md § Doctrine) : BellumAI SUIT le financier, il ne
 * comptabilise pas. Une facture est PRÉPARÉE, jamais émise ni comptabilisée ;
 * « facturé » ne s'écrit que sur preuve du connecteur.
 *
 * Ce que le parcours prouve, sur `/missions/facturation` :
 *  1. l'écran DIT qu'il n'émet rien, compte prêts / bloqués / facturés ailleurs
 *     et nomme le montant « préparé » comme PRÉPARATOIRE (ni dû, ni facture) ;
 *  2. un mois bloqué NOMME son bloqueur (« Aucun relevé d'activité ») — jamais
 *     un « non facturable » muet ;
 *  3. « Préparer la facture » ouvre une boîte qui répète « n'émet rien », et
 *     envoie `POST …/invoiced?month=2026-09` avec référence, montant en CENTIMES
 *     (12 600 € → 1 260 000) et échéance — jamais d'autre champ ;
 *  4. un champ laissé vide reste ABSENT du corps (jamais « facturée zéro euro »).
 */

const MONTH = '2026-09'

type Calls = { invoiced: Array<{ url: string; body: unknown }> }

async function mockFacturation(page: Page): Promise<Calls> {
  const calls: Calls = { invoiced: [] }
  await page.route('**/workspaces/rules', route => json(route, { rules: [] }))
  await page.route(/\/delivery\/invoice-readiness(\?|$)/, route =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : json(route, {
          month: MONTH,
          canReadFinance: true,
          items: [
            readinessItem({
              missionId: 'm1',
              missionLabel: 'Renfort plateforme',
              state: 'ready',
              blockers: [],
              days: 21,
              preparedAmountCents: 1_260_000,
            }),
            readinessItem({ missionId: 'm2', missionLabel: 'Refonte SI', accountName: 'Globex' }),
          ],
          summary: readinessSummary({ ready: 1, blocked: 1, preparedAmountCents: 1_260_000 }),
        }),
  )
  await page.route(/\/delivery\/invoice-readiness\/m1\/invoiced/, route => {
    calls.invoiced.push({ url: route.request().url(), body: route.request().postDataJSON() })
    return json(
      route,
      readinessItem({ missionId: 'm1', state: 'invoiced', blockers: [], invoicedAt: '2026-09-30T09:00:00.000Z' }),
    )
  })
  return calls
}

test.describe('#2208.54 — golden journey 23 : préparer la facture', () => {
  test('l’écran dit qu’il n’émet rien, compte le prêt et le bloqué, et nomme le montant « préparatoire »', async ({
    page,
  }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '23' })
    await mockFacturation(page)
    await page.goto('/missions/facturation')

    await expect(page.getByText('1 prêt(s) · 1 bloqué(s) · 0 facturé(s) ailleurs')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Bellum n’émet aucune facture.').first()).toBeVisible()
    await expect(page.getByText('12600 € préparés')).toBeVisible()
    await expect(page.getByText('Ce montant est PRÉPARATOIRE', { exact: false })).toBeVisible()
    // Le mois bloqué nomme son bloqueur.
    await expect(page.getByText(/Aucun relevé d’activité/)).toBeVisible()
  })

  test('« Préparer la facture » envoie référence, montant en centimes et échéance — rien d’autre', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '23' })
    const calls = await mockFacturation(page)
    await page.goto('/missions/facturation')

    await page.getByRole('button', { name: 'Préparer la facture' }).first().click()
    await expect(page.getByText('n’émet rien', { exact: false }).first()).toBeVisible()
    // Le montant préparé pré-remplit le champ, en euros.
    await expect(page.getByLabel('Montant facturé, en euros')).toHaveValue('12600')
    await page.getByLabel('Référence de la facture').fill('FA-2026-0142')
    await page.getByLabel('Échéance de règlement').fill('2026-10-30')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect.poll(() => calls.invoiced.length).toBe(1)
    expect(calls.invoiced[0]?.url).toContain(`month=${MONTH}`)
    expect(calls.invoiced[0]?.body).toEqual({
      reference: 'FA-2026-0142',
      amountCents: 1_260_000,
      dueOn: '2026-10-30',
    })
  })

  test('un champ laissé vide reste absent du corps — jamais « facturée zéro euro »', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '23' })
    const calls = await mockFacturation(page)
    await page.goto('/missions/facturation')

    await page.getByRole('button', { name: 'Préparer la facture' }).first().click()
    await page.getByLabel('Montant facturé, en euros').fill('')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(() => calls.invoiced.length).toBe(1)
    expect(calls.invoiced[0]?.body).toEqual({})
  })
})

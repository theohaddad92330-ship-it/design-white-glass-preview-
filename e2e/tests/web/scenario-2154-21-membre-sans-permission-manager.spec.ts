import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.20 / #2154.21 — « MANAGER OUVRANT PILOTAGE » ET « MEMBRE SANS
 * PERMISSION MANAGER » (lot X41, #2958), joués dans un vrai navigateur.
 *
 * `pilotage-role-gate.integration.test.tsx` monte le vrai routeur mais double
 * les requêtes ; ici les requêtes partent pour de vrai (mockées au réseau) et
 * la permission voyage de `/workspaces/members` jusqu'au composant.
 *
 * Doctrine : « le rôle change l'ORDRE, jamais le CONTENU » et une permission ne
 * se contourne pas. Deux lectures d'une MÊME file d'arbitrage :
 *  - `sales_ops` (porte `team:manage`) voit la ligne d'intervention ET le
 *    sélecteur d'attribution ;
 *  - `member` voit la MÊME ligne (la donnée est lisible) mais jamais le
 *    sélecteur, et aucune écriture d'attribution ne part.
 */

const INTERVENTION = {
  id: 'itv-1',
  kind: 'account_untouched',
  subjectType: 'account',
  subjectId: '00000000-0000-4000-8000-000000000000',
  subjectLabel: null,
  ownerId: null,
  ownerName: null,
  detail: 'aucune prochaine action prévue',
  state: 'open',
  openedAt: '2026-08-20T09:00:00.000Z',
  resolvedAt: null,
}

const CHAIN = {
  generatedAt: '2026-10-02T08:00:00.000Z',
  levels: [
    {
      level: 'acquisition',
      status: 'ok',
      metrics: [{ key: 'contactsTargeted', value: 120, unit: 'count', status: 'ok' }],
    },
  ],
}

async function mockPilotage(page: Page, role: 'sales_ops' | 'member'): Promise<{ writes: string[] }> {
  const writes: string[] = []
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes(':4599')) {
      const path = new URL(request.url()).pathname
      // `/laura/plan` est une LECTURE envoyée en POST (useLaura : écran, compte, état
      // occupé) — la carte Laura du gabarit racine la demande sur chaque écran. Elle
      // n'écrit rien ; toute autre méthode mutante vers l'API reste comptée.
      // (Décision Louis 05/10/2026 : exclusion confirmée, rien d'autre retiré de la surveillance.)
      if (path.endsWith('/laura/plan')) return
      writes.push(`${request.method()} ${path}`)
    }
  })
  await page.route('**/pilotage/chain', route => json(route, CHAIN))
  await page.route('**/playbooks/interventions', route => json(route, { items: [INTERVENTION] }))
  await page.route('**/workspaces/members', route =>
    json(route, [{ userId: 'u-1', email: 'manager@esn.fr', fullName: 'Louis', role, isSelf: true }]),
  )
  return { writes }
}

test.describe('#2154.20 / #2154.21 — Pilotage : manager et membre sans permission manager', () => {
  test('.20 — un manager voit la ligne d’intervention et le sélecteur d’attribution', async ({ page }) => {
    await mockSession(page, { features: ['manager_cockpit'], tag: '20', role: 'owner' })
    await mockPilotage(page, 'sales_ops')
    await page.goto('/pilotage')

    await expect(page.getByText('aucune prochaine action prévue')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('combobox').first()).toBeVisible()
  })

  test('.21 — un membre n’ouvre pas le Cockpit : Parcours, jamais le sélecteur, et n’écrit rien', async ({ page }) => {
    // Louis 15/10/2026 (#4163) : le droit se tient par SOUS-ONGLET. Un membre sans `team:manage`
    // qui ouvre /pilotage est conduit à Parcours (ouvert à tous), pas à une page « réservé » ni
    // au Cockpit — la ligne d'intervention et son sélecteur sont réservés aux gestionnaires.
    await mockSession(page, { features: ['manager_cockpit'], tag: '21', role: 'member' })
    const { writes } = await mockPilotage(page, 'member')
    await page.goto('/pilotage')

    // Parcours est désormais une SECTION de Pilotage › Pipe (#4163.2) : on atterrit sur /pilotage/pipe.
    await expect(page).toHaveURL(/\/pilotage\/pipe/, { timeout: 30_000 })
    await expect(page.locator('section#parcours')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('aucune prochaine action prévue')).toHaveCount(0)
    await expect(page.getByRole('combobox')).toHaveCount(0)
    expect(writes).toEqual([])
  })
})

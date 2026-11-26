import { expect, test } from '@playwright/test'
import { json, mockSession } from './x41-socle'
import { tool } from './x41-connecteurs'

/**
 * #2958.63 (#2208.63, golden journey 32) — TRAITER UNE ERREUR ; et
 * #2154.29 — « source ou connecteur en erreur ».
 *
 * `/integrations` (`IntegrationCenterPage`) lit UN registre
 * (`GET /tool-registry`). Une erreur se TRAITE : elle se dit, elle se
 * réessaie, et elle ne se fait jamais passer pour un état sain ou vide.
 *
 * Ce que le parcours prouve :
 *  1. la lecture du registre échoue → « La liste des intégrations n'a pas pu
 *     être chargée » + « Aucune conclusion à en tirer sur l'état de tes
 *     outils : c'est la lecture qui a échoué, pas les connexions » — jamais
 *     « 0 branché » (qui affirmerait un état qu'on n'a pas lu) ;
 *  2. « Réessayer » relit : le registre répond, l'écran se remplit — aucun
 *     rechargement de page ;
 *  3. un outil dont la connexion est CASSÉE (jeton expiré) est compté à part
 *     (« 1 à reconnecter »), jamais fondu dans « branchés ».
 */

test.describe('#2208.63 — golden journey 32 : traiter une erreur', () => {
  test('la lecture échoue : l’écran le dit, « Réessayer » relit et se remplit', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '32' })
    let healthy = false
    await page.route(/\/tool-registry$/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (!healthy) return json(route, { message: 'indisponible' }, 503)
      return json(route, [
        tool({
          provider: 'hubspot',
          family: 'crm',
          display_name: 'HubSpot',
          status: 'connected',
          capability_state: 'ready',
          last_sync: '2026-10-01T08:00:00.000Z',
        }),
        tool({
          provider: 'gmail',
          family: 'email',
          display_name: 'Gmail',
          status: 'action_required',
          capability_state: 'broken',
        }),
      ])
    })
    await page.goto('/integrations')

    await expect(page.getByText("La liste des intégrations n'a pas pu être chargée")).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(
        "Aucune conclusion à en tirer sur l'état de tes outils : c'est la lecture qui a échoué, pas les connexions.",
      ),
    ).toBeVisible()
    // Une lecture échouée n'affirme PAS « 0 branché ».
    await expect(page.getByText('0 branchés', { exact: false })).toHaveCount(0)

    healthy = true
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByText('1 branchés', { exact: false })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('1 à reconnecter')).toBeVisible()
    await expect(page.getByText("La liste des intégrations n'a pas pu être chargée")).toHaveCount(0)
  })
})

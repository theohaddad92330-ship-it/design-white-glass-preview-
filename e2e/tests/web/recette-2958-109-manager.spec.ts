import { expect, test } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2958.109 (GO #2208, lot P04 09/10) — RECETTE MANAGER, signée par ce
 * scénario (décision Louis 09/10 : vert en CI = signé).
 *
 * CE QUE LE MANAGER VÉRIFIE ICI
 * ─────────────────────────────
 * Le tri du 17/09 l'a fixé (#2108.92 / #2108.116 / #2208.109) : la recette
 * manager vise `/team` (le cockpit d'équipe) atteint par le chemin VISIBLE
 * depuis l'accueil, pas un persona `/briefing`. Le manager y lit qui porte
 * quoi, et attribue un compte que personne ne porte.
 *
 * RÈGLES DU SCÉNARIO
 * ──────────────────
 *  - UNE seule URL tapée : l'accueil ;
 *  - on ne clique que ce que l'écran propose (navigation, onglet, sélecteur
 *    d'attribution de la file) ;
 *  - l'écriture est VÉRIFIÉE : UNE attribution part, avec le compte et le
 *    commercial choisis, et l'écran relit la couverture qui en découle.
 */

const SELF_ID = '41000000-0000-4000-8000-000000000109'
const REP_ID = '29581090-0000-4000-8000-000000000002'
const ACCOUNT_ID = '29581090-0000-4000-8000-000000000003'

function member(userId: string, name: string, role: string, accounts: number, isSelf: boolean) {
  return {
    user_id: userId,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@esn-e2e.fr`,
    role,
    accounts,
    contacts: 0,
    emails_sent: 0,
    analyses: 0,
    last_activity_at: '2026-10-08T09:00:00.000Z',
    assigned_accounts: accounts,
    isSelf,
  }
}

test.describe('#2958.109 — recette manager : du cockpit d’équipe à un compte attribué', () => {
  test('de l’accueil au cockpit d’équipe par la navigation, puis UNE attribution vérifiée', async ({ page }) => {
    test.setTimeout(120_000)
    await mockSession(page, { features: ['manager_cockpit'], tag: '109', role: 'owner', memberCount: 2 })

    let assigned = false
    const assignments: unknown[] = []
    await page.route('**/workspaces/members', route =>
      json(route, [
        { userId: SELF_ID, email: 'manager@esn-e2e.fr', fullName: 'Claire Manager', role: 'owner', isSelf: true },
        {
          userId: REP_ID,
          email: 'hugo.commercial@esn-e2e.fr',
          fullName: 'Hugo Commercial',
          role: 'member',
          isSelf: false,
        },
      ]),
    )
    // #4158.37 — la lecture porte désormais `?periode=` : le motif l'accepte.
    await page.route('**/manager/team-stats**', route =>
      json(route, {
        workspace: { id: 'w-109', name: 'ESN e2e', member_count: 2 },
        totals: { accounts: 3, contacts: 0, emails_sent: 0, analyses: 0 },
        pipeline: [],
        members: [
          member(SELF_ID, 'Claire Manager', 'owner', 2, true),
          member(REP_ID, 'Hugo Commercial', 'member', assigned ? 1 : 0, false),
        ],
        coverage: { total_accounts: 3, assigned: assigned ? 3 : 2, unassigned: assigned ? 0 : 1 },
        unassigned_sample: assigned
          ? []
          : [
              {
                id: ACCOUNT_ID,
                company_name: 'Crédit Mutuel Arkéa',
                sector: 'banque',
                priority_score: null,
                commercial_status: 'to_contact',
                created_at: '2026-10-01T09:00:00.000Z',
              },
            ],
      }),
    )
    await page.route(`**/accounts/${ACCOUNT_ID}/assign`, route => {
      assignments.push({ method: route.request().method(), body: route.request().postDataJSON() })
      assigned = true
      return json(route, { id: ACCOUNT_ID, assigned_to: REP_ID })
    })

    // La seule URL : l'accueil.
    await page.goto('/')
    // #4158.9/.10 (Louis, 14/10) — « Équipe » a quitté Pilotage : entrée de la
    // barre latérale dès deux membres actifs.
    await page.getByRole('link', { name: 'Équipe', exact: true }).first().click({ timeout: 30_000 })
    await expect(page).toHaveURL(/\/team/)

    // #4158.38 (lot L7, 14/10) — « À traiter » est TOUJOURS ouvert, en tête :
    // plus d'accordéon « Aujourd'hui » à déplier avant de voir l'arbitrage.
    await expect(page.getByText('1 compte sans responsable')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Les attribuer' }).click()

    // #2958.109 — le geste MÈNE quelque part : la file des comptes sans
    // responsable (bloc « Staffing », ouvert) est révélée, le compte y est NOMMÉ.
    await expect(page.getByText('Crédit Mutuel Arkéa').first()).toBeInViewport({ timeout: 30_000 })
    expect(assignments).toEqual([])

    // UNE attribution : le compte et le commercial choisis, rien d'autre.
    await page.getByRole('combobox', { name: 'Attribuer Crédit Mutuel Arkéa à un membre' }).click()
    await page.getByRole('option', { name: /Hugo Commercial/ }).click()
    await expect.poll(() => assignments.length).toBe(1)
    expect(assignments[0]).toEqual({ method: 'PATCH', body: { assigned_to: REP_ID } })

    // L'écran relit : le compte quitte la file des comptes à attribuer.
    await expect(page.getByText('Crédit Mutuel Arkéa')).toHaveCount(0, { timeout: 30_000 })
  })
})

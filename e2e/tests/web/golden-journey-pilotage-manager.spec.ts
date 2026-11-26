import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * #2208.64 (golden journey 33) — LIRE LE PILOTAGE MANAGER.
 *
 * Numérotation : `suffixe = numéro de la liste + 31` (convention des bilans
 * précédents, `golden-journey-open-vivier.spec.ts` = journey 5 = `.36`).
 *
 * Le manager ouvre /pilotage et lit la chaîne commerciale en un coup d'œil.
 * Ce que le parcours PROUVE, de bout en bout (vrai `GET /pilotage/chain`
 * mocké, vrai écran) :
 *  - un maillon qui décroche est NOMMÉ et compté (« 1 décroche »), et la
 *    carte porte son taux ET son dénominateur (« sur 50 emails envoyés ») —
 *    un score n'est jamais nu ;
 *  - un maillon sans mesure dit « non mesuré », jamais « 0 » ni « 0 % » :
 *    une valeur absente ne s'affiche JAMAIS 0 (GA-18 / GA-19) ;
 *  - la couverture est dite (« 2 maillons sur 7 ») : les maillons sans
 *    donnée restent gris, jamais rouges, et le décompte les sort du
 *    dénominateur de l'alerte ;
 *  - une lecture transverse porte sa provenance et l'instant du calcul.
 *
 * Les autres appels de l'écran (diagnostic, file d'arbitrage, CRM,
 * automatisations, dictionnaire) ne sont PAS mockés : l'écran dit alors que
 * la lecture a échoué (« Ce n'est pas "rien à traiter" ») — c'est aussi un
 * comportement de doctrine, asserté dans le second test.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '4b7a4b1e-3333-4a11-9c33-2208640000ab'

const json = (route: Route, body: unknown) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })

type Metric = {
  key: string
  value: number | null
  unit: 'count' | 'rate'
  status: 'ok' | 'alerte' | 'non_mesure'
  denominator?: number
  source?: string[]
  window?: 'current_state'
}
const metric = (key: string, value: number | null, unit: 'count' | 'rate', status: Metric['status'], extra = {}) =>
  ({ key, value, unit, status, ...extra }) as Metric

const LEVELS = [
  {
    level: 'acquisition',
    status: 'alerte',
    metrics: [
      metric('contactsTargeted', 120, 'count', 'ok'),
      metric('replyRate', 0.04, 'rate', 'alerte', { denominator: 50, source: ['activities', 'contacts'] }),
    ],
  },
  { level: 'conversation', status: 'ok', metrics: [metric('meetings', 6, 'count', 'ok')] },
  {
    level: 'qualification',
    status: 'non_mesure',
    metrics: [
      metric('needsQualified', null, 'count', 'non_mesure'),
      metric('qualificationRate', null, 'rate', 'non_mesure'),
    ],
  },
  { level: 'sourcing', status: 'non_mesure', metrics: [metric('benchAvailable', null, 'count', 'non_mesure')] },
  { level: 'conversion', status: 'non_mesure', metrics: [metric('conversionRate', null, 'rate', 'non_mesure')] },
  { level: 'economie', status: 'non_mesure', metrics: [metric('margin', null, 'rate', 'non_mesure')] },
  { level: 'expansion', status: 'non_mesure', metrics: [metric('activeClients', null, 'count', 'non_mesure')] },
  {
    level: 'qualite',
    status: 'ok',
    metrics: [metric('correctionRate', 0.02, 'rate', 'ok', { denominator: 120, window: 'current_state' })],
  },
]

async function mockPilotage(page: Page, features: string[]): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    json(route, {
      user: {
        id: USER_ID,
        email: 'e2e-2208-64@bellum-ai.com',
        created_at: '2026-01-01T00:00:00.000Z',
        roles: ['customer'],
      },
    }),
  )
  await page.route('**/onboarding/state', route =>
    json(route, {
      id: USER_ID,
      status: 'completed',
      current_stage_code: null,
      stages: [],
      answers: {},
      skipped_at: null,
      inherited_answer_keys: [],
      active_import_session_id: null,
      joined_workspace: null,
      effectif_observed_at: {},
    }),
  )
  await page.route('**/workspaces/me', route =>
    json(route, {
      workspace: { id: '9b1c2d3e-4f50-4a61-8b72-220864000001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
      members: [],
    }),
  )
  await page.route('**/credits', route => json(route, { features }))
  await page.route('**/pilotage/chain', route =>
    json(route, { levels: LEVELS, generatedAt: '2026-10-02T08:00:00.000Z' }),
  )
}

test.describe('#2208.64 — golden journey : lire le Pilotage manager', () => {
  test('la chaîne se lit : un maillon décroche, cinq restent « non mesuré », jamais 0', async ({ page }) => {
    await mockPilotage(page, ['manager_cockpit'])
    await page.goto('/pilotage')

    // Le décompte nomme ce qui décroche et ce qui manque d'un branchement.
    await expect(page.getByText('1 maillon décroche')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('5 maillons sans mesure')).toBeVisible()
    await expect(page.getByText('Il manque un branchement, pas une correction.')).toBeVisible()

    // Cockpit : la chaîne tient sur une ligne ; la couverture et le détail vivent dans le dépliant.
    await page.getByRole('button', { name: 'Voir le détail de la chaîne' }).click()

    // La couverture est DITE : deux maillons sur sept (Qualité, retirée le 14/10, ne compte plus), les autres restent gris.
    await expect(page.getByText('Calculé sur 2 maillons sur 7 — 29 %.')).toBeVisible()
    await expect(page.getByText('Les autres attendent de la donnée : ils restent gris, jamais rouges.')).toBeVisible()

    // Le maillon qui décroche porte son taux ET son dénominateur.
    const acquisition = page.getByRole('button', { name: /Acquisition/ })
    await expect(acquisition).toContainText('4 %')
    await expect(acquisition).toContainText('sur 50 emails envoyés')

    // Un maillon sans mesure dit « non mesuré » — jamais « 0 » ni « 0 % ».
    const qualification = page.getByRole('button', { name: /Qualification/ })
    await expect(qualification).toContainText('non mesuré')
    await expect(qualification).not.toContainText('0')
    await expect(page.getByText(/^0\s?%$/)).toHaveCount(0)

    // Qualité (taux de correction, « sur 120 contacts ») est retirée du Pilotage depuis le 14/10 : même
    // renvoyée par l'API, elle ne s'affiche plus. L'instant du calcul reste dit.
    await expect(page.getByText('sur 120 contacts')).toHaveCount(0)
    await expect(page.getByText(/Calculé à 08:00/).first()).toBeVisible()
  })

  test('une lecture qui échoue le DIT : « ce n’est pas rien à traiter », jamais une liste vide muette', async ({
    page,
  }) => {
    await mockPilotage(page, ['manager_cockpit'])
    await page.goto('/pilotage')

    await expect(page.getByText('1 maillon décroche')).toBeVisible({ timeout: 30_000 })
    // File d'arbitrage non lisible (route non mockée) : l'écran refuse de la lire comme « vide ».
    await expect(page.getByText("Impossible de lire la file. Ce n'est pas « rien à traiter ».")).toBeVisible()
    await expect(
      page.getByText('Le diagnostic du maillon faible n’a pas pu être calculé pour le moment.'),
    ).toBeVisible()
  })

  test('hors offre, l’écran reste visible et dit pourquoi — il ne s’ouvre pas', async ({ page }) => {
    await mockPilotage(page, ['talent_pool'])
    await page.goto('/pilotage')

    await expect(page.getByText('Cet écran fait partie d’une autre offre')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Non inclus dans ton offre')).toBeVisible()
    // Aucun chiffre de la chaîne ne fuit derrière le verrou.
    await expect(page.getByText('1 maillon décroche')).toHaveCount(0)
  })
})

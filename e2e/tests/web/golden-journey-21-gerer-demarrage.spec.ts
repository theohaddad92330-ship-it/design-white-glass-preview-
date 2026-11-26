import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'
import { MISSION_ID, mockMissionRecord } from './x41-mission'

/**
 * #2958.52 (#2208.52, golden journey 21) — GÉRER LE DÉMARRAGE.
 *
 * Sur la fiche d'une mission AVANT son démarrage (`/missions/:id`, statut
 * `onboarding`), deux panneaux portent le démarrage :
 *
 *  A. « Prête à démarrer ? » (`MissionStartReadinessPanel`, #2338/#2409) : les
 *     deux accords (client, consultant), le contrat signé, le consultant
 *     affecté, la date, le TJM, le lieu du premier jour — un VERDICT, et pour
 *     chaque prérequis DÉCLARÉ un geste humain avec sa preuve ;
 *  B. « Jalons de delivery » (#3269/#3291) : le Démarrage y est un jalon
 *     PROJETÉ depuis A — jamais déclarable une seconde fois.
 *
 * Ce que le parcours prouve :
 *  1. le verdict est dit (« Bloqué ») et chaque prérequis porte son état
 *     (Confirmé / Manquant) — un prérequis non bloquant se nomme « réserve » ;
 *  2. « Confirmer » exige une preuve d'au moins 3 caractères, puis envoie
 *     `POST …/start-checks` avec EXACTEMENT `{ item, proof }` ; la preuve se
 *     relit à l'écran avec sa date (« preuve : … ») ;
 *  3. « Retirer » un prérequis confirmé envoie `POST …/withdraw` — archivé côté
 *     serveur, jamais supprimé ;
 *  4. le jalon Démarrage, projeté, n'a AUCUN bouton « Déclarer ».
 */

type Item = {
  key: string
  kind: 'declared' | 'derived'
  blocking: boolean
  side: 'client' | 'consultant' | 'internal'
  state: 'done' | 'missing' | 'stale'
  confirmedAt: string | null
  confirmedBy: string | null
  proof: string | null
}

const item = (over: Partial<Item> & Pick<Item, 'key'>): Item => ({
  kind: 'declared',
  blocking: true,
  side: 'client',
  state: 'missing',
  confirmedAt: null,
  confirmedBy: null,
  proof: null,
  ...over,
})

const CONFIRMED = {
  state: 'done' as const,
  confirmedAt: '2026-09-20T09:00:00.000Z',
  confirmedBy: 'u-1',
}

function readiness(contractSigned: boolean) {
  return {
    verdict: contractSigned ? 'ready_with_reserves' : 'blocked',
    agreementsPending: false,
    missing: contractSigned ? ['site_access'] : ['contract_signed', 'site_access'],
    reserves: ['site_access'],
    items: [
      item({ key: 'client_agreement', side: 'client', ...CONFIRMED, proof: 'Mail du client du 20/09' }),
      item({ key: 'consultant_agreement', side: 'consultant', ...CONFIRMED, proof: 'Appel du 19/09' }),
      item({
        key: 'contract_signed',
        side: 'client',
        ...(contractSigned
          ? { ...CONFIRMED, confirmedAt: '2026-10-02T09:00:00.000Z', proof: 'Bon de commande BC-2026-114' }
          : {}),
      }),
      item({ key: 'consultant_assigned', kind: 'derived', side: 'consultant', state: 'done' }),
      item({ key: 'start_date', kind: 'derived', side: 'internal', state: 'done' }),
      item({ key: 'daily_rate', kind: 'derived', blocking: false, side: 'internal', state: 'done' }),
      item({ key: 'site_access', blocking: false, side: 'client' }),
    ],
  }
}

const MILESTONES = [
  {
    key: 'demarrage',
    mode: 'projected',
    labelFr: 'Démarrage',
    labelEn: 'Kickoff',
    state: 'in_progress',
    groundedIn: 'mission-start-readiness.ts#computeMissionStartReadiness',
    note: null,
    confirmedAt: null,
    confirmedBy: null,
  },
]

type Calls = { writes: Array<{ path: string; body: unknown }> }

async function mockFiche(page: Page): Promise<Calls> {
  const calls: Calls = { writes: [] }
  let contractSigned = false
  await mockMissionRecord(page, { status: 'onboarding', started_on: null })
  await page.route(`**/delivery/missions/${MISSION_ID}/start-readiness`, route =>
    json(route, readiness(contractSigned)),
  )
  await page.route(`**/delivery/missions/${MISSION_ID}/start-checks`, route => {
    calls.writes.push({ path: 'start-checks', body: route.request().postDataJSON() })
    contractSigned = true
    return json(route, readiness(true))
  })
  await page.route(`**/delivery/missions/${MISSION_ID}/start-checks/*/withdraw`, route => {
    calls.writes.push({ path: new URL(route.request().url()).pathname.split('/').slice(-2).join('/'), body: null })
    contractSigned = false
    return json(route, readiness(false))
  })
  await page.route(`**/delivery/missions/${MISSION_ID}/delivery-milestones`, route => json(route, MILESTONES))
  return calls
}

test.describe('#2208.52 — golden journey 21 : gérer le démarrage', () => {
  test('le verdict est dit, chaque prérequis porte son état, une réserve se nomme', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '21' })
    await mockFiche(page)
    await page.goto(`/missions/${MISSION_ID}`)

    const panel = page.getByLabel('Prête à démarrer ?')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel).toContainText('Bloqué')
    await expect(page.getByTestId('start-item-client_agreement')).toContainText('Confirmé')
    await expect(page.getByTestId('start-item-client_agreement')).toContainText('preuve : Mail du client du 20/09')
    await expect(page.getByTestId('start-item-contract_signed')).toContainText('Manquant')
    // Le lieu du premier jour ne bloque pas : il se nomme « réserve ».
    await expect(page.getByTestId('start-item-site_access')).toContainText('réserve')
    // Un prérequis dérivé n'offre aucun geste : on le répare où il vit.
    await expect(page.getByTestId('start-item-start_date').getByRole('button')).toHaveCount(0)
  })

  test('« Confirmer » exige une preuve, envoie { item, proof }, puis le verdict se lève', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '21' })
    const calls = await mockFiche(page)
    await page.goto(`/missions/${MISSION_ID}`)

    const contract = page.getByTestId('start-item-contract_signed')
    await contract.getByRole('button', { name: 'Confirmer' }).click()
    await contract.getByLabel('Preuve (mail, bon de commande, appel…)').fill('ok')
    await expect(contract.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await contract.getByLabel('Preuve (mail, bon de commande, appel…)').fill('Bon de commande BC-2026-114')
    await contract.getByRole('button', { name: 'Enregistrer' }).click()

    await expect.poll(() => calls.writes.length).toBe(1)
    expect(calls.writes[0]).toEqual({
      path: 'start-checks',
      body: { item: 'contract_signed', proof: 'Bon de commande BC-2026-114' },
    })
    await expect(page.getByLabel('Prête à démarrer ?')).toContainText('Prête avec réserves')
    await expect(page.getByTestId('start-item-contract_signed')).toContainText('preuve : Bon de commande BC-2026-114')
  })

  test('« Retirer » un prérequis confirmé le retire sans le supprimer — le verdict redevient bloqué', async ({
    page,
  }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '21' })
    const calls = await mockFiche(page)
    await page.goto(`/missions/${MISSION_ID}`)

    // Confirmer d'abord, puis retirer.
    const contract = page.getByTestId('start-item-contract_signed')
    await contract.getByRole('button', { name: 'Confirmer' }).click()
    await contract.getByLabel('Preuve (mail, bon de commande, appel…)').fill('Bon de commande BC-2026-114')
    await contract.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByLabel('Prête à démarrer ?')).toContainText('Prête avec réserves')
    await contract.getByRole('button', { name: 'Retirer' }).click()
    await expect.poll(() => calls.writes.length).toBe(2)
    expect(calls.writes[1]?.path).toBe('contract_signed/withdraw')
    await expect(page.getByLabel('Prête à démarrer ?')).toContainText('Bloqué')
  })

  test('le jalon Démarrage est projeté : lisible, jamais déclarable une seconde fois', async ({ page }) => {
    await mockSession(page, { features: ['missions', 'accounts', 'talent_pool'], tag: '21' })
    await mockFiche(page)
    await page.goto(`/missions/${MISSION_ID}`)

    const jalon = page.getByTestId('delivery-milestone-demarrage')
    await expect(jalon).toBeVisible({ timeout: 30_000 })
    await expect(jalon).toContainText('En cours')
    await expect(jalon.getByRole('button', { name: 'Déclarer' })).toHaveCount(0)
  })
})

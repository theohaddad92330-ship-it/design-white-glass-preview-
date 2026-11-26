import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2958.65 (#2208.65, golden journey 34) — CORRIGER UNE DONNÉE.
 *
 * Doctrine : « une correction humaine gagne toujours, quelle que soit sa
 * date ». Sur la fiche contact (`/contacts/:id`, `ContactRecordCard`), chaque
 * champ se corrige en place ; la correction est conservée et le journal dit
 * QUI a changé QUOI, QUAND, de quoi à quoi.
 *
 * Ce que le parcours prouve :
 *  1. « Corriger Fonction » + Entrée envoie `PATCH /contacts/:id` avec
 *     EXACTEMENT `{ title }` — le seul champ touché, rien d'autre ;
 *  2. vider un champ envoie `null` (jamais une chaîne vide, jamais un champ
 *     inventé) — et un champ non modifié n'envoie rien ;
 *  3. le journal « Historique des modifications » relit la correction avec son
 *     avant (« DSI » barré), son après, son auteur et sa date, borne sa
 *     portée (« ne s'applique qu'à ce champ ») et dit qu'elle n'empêche pas
 *     le reste de l'analyse d'évoluer ;
 *  4. une fiche sans correction dit « Aucune modification enregistrée » — le
 *     journal vide n'est pas un journal muet.
 */

const ID = '12121212-1212-4212-8212-121212121212'

const CONTACT = {
  id: ID,
  workspace_id: 'w-1',
  account_id: null,
  full_name: 'Camille Roux',
  title: 'DSI',
  email: 'camille@example.com',
  phone: null,
  entity: 'ACME',
  linkedin_url: null,
  locale: null,
  decision_role: null,
  declared_person_company_relation: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const AUDIT = {
  id: '13131313-1313-4313-8313-131313131313',
  entityType: 'contact',
  entityId: ID,
  field: 'title',
  oldValue: 'DSI',
  newValue: 'Directeur des systèmes d’information',
  source: 'human',
  actorId: null,
  actorName: 'Louis Test',
  createdAt: '2026-10-02T10:00:00.000Z',
  rule: null,
}

/** #3687 / #3716 (Louis 05/10) : la fiche contact est en ZONES (plus d'onglets,
 *  #3644 dépassée) ; la fiche modifiable (corrections + journal) est le détail
 *  « Corriger la fiche », replié, visible en tête de la zone Informations — hors
 *  des plis repliés. On l'ouvre d'abord. */
async function openCorrection(page: Page): Promise<void> {
  await page.getByText('Corriger la fiche', { exact: true }).click()
}

type Calls = { patches: unknown[] }

async function mockFiche(page: Page, options: { withHistory?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { patches: [] }
  await page.route(new RegExp(`/contacts/${ID}$`), route => {
    if (route.request().resourceType() === 'document') return route.fallback()
    if (route.request().method() === 'PATCH') {
      calls.patches.push(route.request().postDataJSON())
      return json(route, { updated: Object.keys(route.request().postDataJSON()), rejected: [] })
    }
    return json(route, CONTACT)
  })
  await page.route(new RegExp(`/contacts/${ID}/history$`), route =>
    json(route, { items: options.withHistory ? [AUDIT] : [] }),
  )
  return calls
}

test.describe('#2208.65 — golden journey 34 : corriger une donnée', () => {
  test('« Corriger Fonction » envoie exactement { title } ; un champ non modifié n’envoie rien', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '34' })
    const calls = await mockFiche(page)
    await page.goto(`/contacts/${ID}`)
    await openCorrection(page)

    await page.getByRole('button', { name: 'Corriger Fonction' }).first().click()
    const input = page.getByLabel('Fonction').first()
    // Valider sans rien changer ne part pas.
    await input.press('Enter')
    expect(calls.patches).toEqual([])

    await page.getByRole('button', { name: 'Corriger Fonction' }).first().click()
    await page.getByLabel('Fonction').first().fill('Directeur des systèmes d’information')
    await page.getByLabel('Fonction').first().press('Enter')
    await expect.poll(() => calls.patches.length).toBe(1)
    expect(calls.patches[0]).toEqual({ title: 'Directeur des systèmes d’information' })
  })

  test('vider un champ envoie null — jamais une chaîne vide', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '34' })
    const calls = await mockFiche(page)
    await page.goto(`/contacts/${ID}`)
    await openCorrection(page)

    await page.getByRole('button', { name: 'Corriger Fonction' }).first().click()
    await page.getByLabel('Fonction').first().fill('')
    await page.getByLabel('Fonction').first().press('Enter')
    await expect.poll(() => calls.patches.length).toBe(1)
    expect(calls.patches[0]).toEqual({ title: null })
  })

  test('le journal relit la correction : avant, après, auteur, date, ce qu’elle protège', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '34' })
    await mockFiche(page, { withHistory: true })
    await page.goto(`/contacts/${ID}`)
    await openCorrection(page)

    await page.getByRole('button', { name: 'Historique des modifications' }).click()
    const entry = page.getByText('Ta correction ne s’applique qu’à ce champ', { exact: false })
    await expect(entry).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Louis Test', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Directeur des systèmes d’information', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('2 oct.', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Elle n’empêche pas le reste de l’analyse', { exact: false })).toBeVisible()
  })

  test('une fiche sans correction dit « Aucune modification enregistrée »', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '34' })
    await mockFiche(page)
    await page.goto(`/contacts/${ID}`)
    await openCorrection(page)

    await page.getByRole('button', { name: 'Historique des modifications' }).click()
    await expect(page.getByText('Aucune modification enregistrée sur cette fiche.')).toBeVisible({ timeout: 30_000 })
  })
})

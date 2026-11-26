import { expect, test, type Page } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.27 — SCÉNARIO « WORKSPACE MULTI-BU » (lot X41, #2958).
 *
 * Un ESN a plusieurs agences, BU ou équipes ; `/settings/business-units`
 * (`BusinessUnitAdminView`) porte la fiche de CHACUNE (capacité disponible,
 * objectif du trimestre, effectif, taille d'équipe, note de portefeuille).
 *
 * Ce que le scénario prouve :
 *  1. deux périmètres cohabitent, chacun avec SA fiche — la capacité de Lyon
 *     n'est jamais celle de Nantes ;
 *  2. un champ jamais saisi reste « non renseigné », jamais « 0 » (doctrine :
 *     une valeur absente ne s'affiche JAMAIS 0) — Nantes n'a aucun chiffre et
 *     n'en reçoit pas ;
 *  3. enregistrer Lyon envoie `PATCH /business-units/bu-lyon` — l'identifiant
 *     de CE périmètre — avec ses cinq champs, et Nantes ne reçoit AUCUNE
 *     écriture ;
 *  4. sans `team:manage` (un commercial), les fiches se LISENT et ne
 *     s'éditent pas : aucun bouton « Enregistrer » ;
 *  5. une lecture illisible est dite (« Je n'ai pas pu lire les périmètres »),
 *     jamais « aucun périmètre ».
 */

function unit(over: Record<string, unknown>) {
  return {
    id: 'bu-lyon',
    name: 'Agence Lyon',
    kind: 'agency',
    territory: 'Auvergne-Rhône-Alpes',
    specialties: ['Data'],
    consultantCount: 42,
    teamSize: 4,
    leadUserId: null,
    portfolioNote: 'Grands comptes industriels',
    capacityAvailableConsultants: 5,
    quarterObjective: 'Signer deux nouveaux comptes industriels',
    status: 'active',
    memberCount: 3,
    viewerIsMember: true,
    viewerAccessRequestStatus: null,
    ...over,
  }
}

const LYON = unit({})
const NANTES = unit({
  id: 'bu-nantes',
  name: 'Agence Nantes',
  territory: 'Pays de la Loire',
  specialties: [],
  consultantCount: null,
  teamSize: null,
  portfolioNote: null,
  capacityAvailableConsultants: null,
  quarterObjective: null,
  memberCount: 1,
})

type Calls = { patches: Array<{ path: string; body: unknown }> }

async function mockBu(page: Page): Promise<Calls> {
  const calls: Calls = { patches: [] }
  await page.route(/\/business-units(\/[^/]+)?$/, route => {
    if (route.request().resourceType() === 'document') return route.fallback()
    if (route.request().method() === 'PATCH') {
      calls.patches.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() })
      return json(route, unit({ capacityAvailableConsultants: 7 }))
    }
    return json(route, { viewerAccess: 'workspace', businessUnits: [LYON, NANTES] })
  })
  return calls
}

test.describe('#2154.27 — workspace multi-BU', () => {
  test('deux périmètres, deux fiches ; un champ jamais saisi reste « non renseigné », jamais 0', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '27' })
    await mockBu(page)
    await page.goto('/settings/business-units')

    await expect(page.getByText('Agence Lyon')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Agence Nantes')).toBeVisible()
    await expect(page.getByLabel('Consultants disponibles — Agence Lyon')).toHaveValue('5')
    await expect(page.getByLabel('Effectif — Agence Lyon')).toHaveValue('42')
    // Nantes n'a rien saisi : champs vides, jamais « 0 ».
    await expect(page.getByLabel('Consultants disponibles — Agence Nantes')).toHaveValue('')
    await expect(page.getByLabel('Effectif — Agence Nantes')).toHaveValue('')
    await expect(page.getByText('non renseigné').first()).toBeVisible()
    await expect(page.getByLabel("Taille d'équipe — Agence Nantes")).toHaveValue('')
  })

  test('enregistrer Lyon envoie PATCH /business-units/bu-lyon avec ses cinq champs — Nantes ne reçoit rien', async ({
    page,
  }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '27' })
    const calls = await mockBu(page)
    await page.goto('/settings/business-units')

    const capacity = page.getByLabel('Consultants disponibles — Agence Lyon')
    await capacity.fill('7')
    await page.getByRole('button', { name: 'Enregistrer — Agence Lyon' }).click()

    await expect.poll(() => calls.patches.length).toBe(1)
    expect(calls.patches[0]).toEqual({
      path: '/business-units/bu-lyon',
      body: {
        capacityAvailableConsultants: 7,
        quarterObjective: 'Signer deux nouveaux comptes industriels',
        consultantCount: 42,
        teamSize: 4,
        portfolioNote: 'Grands comptes industriels',
      },
    })
  })

  test('sans team:manage, les fiches se lisent et ne s’éditent pas', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '27', role: 'viewer' })
    await mockBu(page)
    await page.goto('/settings/business-units')

    await expect(page.getByText('Agence Lyon')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /Enregistrer —/ })).toHaveCount(0)
    await expect(page.getByText('5 consultants disponibles')).toBeVisible()
  })

  test('une lecture illisible est dite — jamais « aucun périmètre »', async ({ page }) => {
    await mockSession(page, { features: ['accounts', 'talent_pool'], tag: '27' })
    await page.route(/\/business-units$/, route =>
      route.request().resourceType() === 'document' ? route.fallback() : json(route, { message: 'indisponible' }, 500),
    )
    await page.goto('/settings/business-units')

    await expect(page.getByText("Je n'ai pas pu lire les périmètres.")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Ton espace n'a encore défini aucun périmètre.")).toHaveCount(0)
  })
})

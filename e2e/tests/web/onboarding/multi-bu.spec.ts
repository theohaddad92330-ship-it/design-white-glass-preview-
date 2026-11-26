import { expect, test, type Page } from '@playwright/test'

/**
 * #2085.36 — parcours E2E « multi-BU » : un espace qui porte PLUSIEURS
 * périmètres (`business_units` — agence, BU, équipe), et un membre qui entre
 * dans l'un d'eux pendant l'onboarding (`OnboardingBusinessUnitStep.tsx`).
 *
 * Ce que le parcours doit prouver, et qu'aucun test unitaire ne prouve seul :
 * la chaîne ENTIÈRE entre l'écran et la borne serveur — rejoindre / demander
 * l'accès écrit dans `business_unit_members` / `business_unit_access_requests`
 * de CET espace, la représentation « Entreprise → Agence → Équipe » (#2087.12)
 * se lit sur les vraies données, et le Profileur reçoit le périmètre porté
 * (#2007.3) — jamais celui d'un collègue, jamais celui d'un autre espace.
 *
 * Les maillons sont couverts un par un (unitaires) :
 * `OnboardingBusinessUnitStep.test.tsx`, `BusinessUnitScopePath.test.tsx`,
 * `business-unit-scope.spec.ts` (borne espace + BU),
 * `esn-profile-workspace.resolver.spec.ts` (#2007.3, borne espace + user),
 * `profile-context.service.spec.ts` (#2009.8, la clé).
 *
 * Lot V14 (28/09, passe 2) — la raison « Tier 3 absent » donnée par les lots
 * précédents ne tenait PAS à l'examen : la moitié FRONTEND du parcours (choix
 * du périmètre, filtrage par nature, porte `team:manage`, demande d'accès) ne
 * touche à AUCUNE isolation réelle — elle se prouve, comme les autres golden
 * journeys de #2773, sur des mocks réseau (`GET/POST /business-units`), sans
 * backend. `OnboardingCompanyPage.tsx` a un chemin d'entrée court vers
 * `OnboardingBusinessUnitStep` qu'aucun bilan précédent n'avait cartographié :
 * le bouton « Remplir manuellement », visible dès l'écran d'accueil, SANS
 * appel réseau ni confirmation d'entreprise au préalable (`onSkip`).
 *
 * ⚠️ CE QUI RESTE HORS DE CE FICHIER, et pourquoi c'est une frontière RÉELLE
 * (Tier 3), pas une paresse : la GARANTIE D'ISOLATION elle-même — qu'un
 * `business_unit_id` écrit par CET espace ne fuite jamais vers un autre
 * (`business_unit_members`/`business_unit_access_requests` en base), que la
 * demande n'est lisible QUE par le responsable de cette agence, et l'écran
 * `owner` qui l'accorde — exige un vrai backend + deux comptes authentifiés
 * réels. Le contrat de cette isolation, lui, EST déjà prouvé côté serveur
 * (`business-unit-scope.spec.ts`, `esn-profile-workspace.resolver.spec.ts`).
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '9a1b2c3d-2085-4e11-8f33-2085360000be'
const AGENCY_ID = 'a1b2c3d4-2085-4e11-8f33-208536000a01'
const BU_ID = 'b1c2d3e4-2085-4e11-8f33-208536000b02'

function agency(over: { viewerAccessRequestStatus?: 'pending' | null } = {}) {
  return {
    id: AGENCY_ID,
    name: 'Agence Lyon',
    kind: 'agency' as const,
    territory: 'Auvergne-Rhône-Alpes',
    specialties: [],
    consultantCount: null,
    teamSize: null,
    leadUserId: null,
    portfolioNote: null,
    capacityAvailableConsultants: null,
    quarterObjective: null,
    status: 'active' as const,
    memberCount: 4,
    viewerIsMember: false,
    viewerAccessRequestStatus: over.viewerAccessRequestStatus ?? null,
  }
}

/** #2087.4 (business_unit) : NE DOIT JAMAIS apparaître sous le filtre « agence ». */
const cloudBu = {
  id: BU_ID,
  name: 'BU Cloud',
  kind: 'business_unit' as const,
  territory: null,
  specialties: [],
  consultantCount: null,
  teamSize: null,
  leadUserId: null,
  portfolioNote: null,
  capacityAvailableConsultants: null,
  quarterObjective: null,
  status: 'active' as const,
  memberCount: 3,
  viewerIsMember: false,
  viewerAccessRequestStatus: null,
}

async function mockOnboardingCompanyShell(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2085-36@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    }),
  )
  // Onboarding EN COURS (pas `completed`) : l'étape entreprise est le premier
  // écran, comme pour un compte qui vient d'arriver.
  await page.route('**/onboarding/state', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: USER_ID,
        status: 'not_started',
        current_stage_code: null,
        stages: [],
        answers: {},
        skipped_at: null,
        inherited_answer_keys: [],
        active_import_session_id: null,
        joined_workspace: null,
        effectif_observed_at: {},
      }),
    }),
  )
  // Le rôle de l'appelant — `sales`, SANS `team:manage` — c'est cette lecture
  // qui pilote `canCreate` dans `OnboardingBusinessUnitStep.tsx`.
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: '9b1c2d3e-2085-4a61-8b72-2085360001', name: 'ESN e2e', role: 'sales', memberCount: 5 },
        members: [],
      }),
    }),
  )

  let requested = false
  await page.route('**/business-units', route => {
    if (route.request().method() !== 'GET') return route.continue()
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        businessUnits: [agency({ viewerAccessRequestStatus: requested ? 'pending' : null }), cloudBu],
        viewerAccess: 'workspace',
      }),
    })
  })
  await page.route(`**/business-units/${AGENCY_ID}/access-request`, route => {
    requested = true
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ requested: true }) })
  })
}

test.describe('onboarding — espace multi-BU (#2085.36)', () => {
  test('un membre `sales` choisit un périmètre, ne voit QUE ceux de sa nature, et demande l’accès', async ({
    page,
  }) => {
    await mockOnboardingCompanyShell(page)

    await page.goto('/onboarding/company')

    // ÉTAPE A — atteindre « Toute l'entreprise ou un périmètre ? » SANS passer
    // par la résolution d'entreprise (`onSkip`, bouton visible dès l'accueil).
    await page.getByRole('button', { name: 'Remplir manuellement' }).click()
    await expect(page.getByText('Toute l’entreprise ou un périmètre ?')).toBeVisible()

    // ÉTAPE B — choisir « Une agence ».
    await page.getByText('Une agence', { exact: true }).click()

    // ÉCRAN — SEULE « Agence Lyon » (kind: agency) est listée ; « BU Cloud »
    // (kind: business_unit) n'apparaît pas : le filtre `kind` tient.
    await expect(page.getByText('Agence Lyon')).toBeVisible()
    await expect(page.getByText('BU Cloud')).not.toBeVisible()

    // ÉCRAN — sans `team:manage`, aucun bouton « En créer un autre » ; la
    // phrase `createNoPermission` à sa place.
    await expect(page.getByRole('button', { name: 'En créer un autre' })).toHaveCount(0)
    await expect(
      page.getByText('Tu n’as pas le rôle nécessaire pour créer un périmètre.', { exact: false }),
    ).toBeVisible()

    // LE GESTE — « Demander l'accès à Agence Lyon ».
    const accessRequest = page.waitForRequest(
      request => request.url().includes(`/business-units/${AGENCY_ID}/access-request`) && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Demander l’accès à Agence Lyon' }).click()
    await accessRequest

    // ÉCRAN — le badge « Demande envoyée » remplace le bouton, sur la relecture
    // qui suit l'invalidation de la requête (aucun état optimiste inventé).
    await expect(page.getByText('Demande envoyée')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Demander l’accès à Agence Lyon' })).toHaveCount(0)

    // « Continuer » n'est JAMAIS bloqué par ce choix (L3).
    await expect(page.getByTestId('business-unit-scope-continue')).toBeEnabled()
  })
})

import { expect, test, type Route } from '@playwright/test'
import { fulfillJson, mockSignedInShell, mockVivierList, talentRow } from './golden-journey-fixtures'

/**
 * #2958.108 (GO #2208, lot P04 09/10) — RECETTE RECRUTEUR, signée par ce
 * scénario (décision Louis 09/10 : vert en CI = signé).
 *
 * CE QUE LE RECRUTEUR VÉRIFIE ICI
 * ───────────────────────────────
 * Les deux réserves que ce registre lui renvoie déjà
 * (`route-migration-2208-conditions.ts`, `profil_importe_inutilisable` et
 * `matching_opaque`) : un profil IMPORTÉ est utilisable sans ressaisie, et le
 * classement qui le place sur des besoins se JUSTIFIE (ses axes nommés, celui
 * qui ne s'évalue pas dit tel quel, jamais un score nu).
 *
 * RÈGLES DU SCÉNARIO
 * ──────────────────
 *  - UNE seule URL tapée : le Vivier ;
 *  - on ne clique que ce que l'écran propose (ligne du vivier, onglets et
 *    boutons de la fiche, « Où placer … », « Lancer le classement ») ;
 *  - chaque écriture est VÉRIFIÉE : la validation de disponibilité part UNE
 *    fois avec un corps vide, le classement UNE fois avec la portée choisie.
 */

const USER_ID = '4b7a4b1e-0108-4a11-9c33-295810800001'
const TALENT_ID = '29581080-0000-4000-8000-000000000001'
const NEED_ID = '29581080-0000-4000-8000-000000000002'
const ACCOUNT_ID = '29581080-0000-4000-8000-000000000003'
const RUN_ID = '29581080-0000-4000-8000-000000000004'
const NAME = 'Inès Marchand'

const TALENT = {
  id: TALENT_ID,
  workspace_id: 'w-1',
  kind: 'consultant',
  // Le profil vient d'un IMPORT de CV — c'est lui que le recruteur éprouve.
  source: 'cv_import',
  last_contact_at: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified',
  consent: { givenAt: null, expiresAt: null, basis: null },
  full_name: NAME,
  title: 'Data Engineer',
  seniority: 'senior',
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie',
  partner_account_id: null,
  email: null,
  phone: null,
  public_profile_url: null,
  contact_visible: true,
  tjm: null,
  finance_visible: false,
  stack: ['Spark'],
  sectors: [],
  zones: ['Paris'],
  mobility: null,
  preferences: null,
  references: [],
  languages: [],
  clearances: [],
  wants: null,
  notes: null,
  cv_text: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}

const ROW = talentRow({
  id: TALENT_ID,
  fullName: NAME,
  title: 'Data Engineer',
  seniority: 'senior',
  declaredAvailability: 'immediate',
  source: 'cv_import',
  topSkills: [{ skill: 'spark', label: 'Spark', level: 'confirme', source: 'cv' }],
  skillCount: 1,
})

const SPARK = {
  id: '29581080-0000-4000-8000-000000000010',
  skill: 'spark',
  rawLabel: 'Spark',
  level: 'confirme',
  years: null,
  lastUsedYear: null,
  source: 'cv',
  createdAt: '2026-10-01T00:00:00.000Z',
  family: null,
  validatedLevel: null,
  certification: false,
  clientFeedback: null,
  inferred: false,
  validatedByConsultantAt: null,
  validatedByRecruiterAt: null,
}

/** Le classement inversé : UN besoin, des axes nommés dont un NON évaluable. */
const INVERSE = {
  runId: RUN_ID,
  consultantId: TALENT_ID,
  weights: {
    must_have: 25,
    nice_to_have: 8,
    seniority: 10,
    sector: 8,
    environment: 7,
    language: 5,
    location: 8,
    availability: 12,
    contract_status: 4,
    rate: 7,
    evidence_quality: 4,
    client_constraints: 2,
    risks: 5,
  },
  threshold: 60,
  evaluatedCount: 1,
  needs: [
    {
      need: {
        needId: NEED_ID,
        role: 'Data Engineer Spark',
        accountName: 'EDF DSI',
        accountId: ACCOUNT_ID,
        accountSector: 'énergie',
        projectSectors: [],
        skills: [{ term: 'spark', label: 'Spark', required: true, level: null }],
        minYears: null,
        seniorityBand: null,
        environment: [],
        languages: [],
        clearances: [],
        location: 'Paris',
        remote: null,
        startOn: '2026-11-15',
        targetRateCents: null,
        contractKind: 'regie',
      },
      result: {
        consultantId: TALENT_ID,
        axes: [
          { axis: 'must_have', score: 90, weight: 25, detail: 'Spark lu dans le CV', evidence: [] },
          { axis: 'availability', score: 100, weight: 12, detail: 'disponible', evidence: [] },
          { axis: 'seniority', score: 70, weight: 10, detail: 'senior', evidence: [] },
          { axis: 'language', score: null, weight: 5, detail: 'aucune langue demandée', evidence: [] },
        ],
        correspondenceScore: 84,
        pushableScore: 71,
        bucket: 'recommended',
        exclusions: [],
        skills: [],
        gaps: [],
        adjacency: [],
        questionsToValidate: [],
        flags: [],
      },
    },
  ],
}

const isPage = (route: Route) => route.request().resourceType() === 'document'

test.describe('#2958.108 — recette recruteur : un profil importé se place, et le classement se justifie', () => {
  test('du Vivier au classement de ses besoins, sans ressaisie ni score nu', async ({ page }) => {
    test.setTimeout(120_000)
    await mockSignedInShell(page, { userId: USER_ID, tag: '2958108', features: ['talent_pool', 'needs'] })
    await mockVivierList(page, [ROW])
    await page.route(`**/talents/${TALENT_ID}/summary`, route => fulfillJson(route, ROW))
    await page.route(`**/talents/${TALENT_ID}/skills`, route => fulfillJson(route, { items: [SPARK] }))
    await page.route(`**/talents/${TALENT_ID}/documents`, route => fulfillJson(route, { items: [] }))
    await page.route(`**/consultants/${TALENT_ID}/missions`, route => fulfillJson(route, { items: [] }))
    await page.route(/\/submissions\?/, route => fulfillJson(route, { items: [], total: 0 }))
    await page.route('**/consultants', route => (isPage(route) ? route.fallback() : fulfillJson(route, [TALENT])))
    const writes: string[] = []
    await page.route(`**/consultants/${TALENT_ID}`, route => {
      if (isPage(route)) return route.fallback()
      if (route.request().method() !== 'GET') writes.push(`${route.request().method()} /consultants/:id`)
      return fulfillJson(route, TALENT)
    })
    const confirms: unknown[] = []
    await page.route(`**/consultants/${TALENT_ID}/availability/confirm`, route => {
      confirms.push(route.request().postDataJSON())
      return fulfillJson(route, TALENT)
    })
    const rankings: string[] = []
    await page.route(new RegExp(`/consultants/${TALENT_ID}/match-inverse\\?`), route => {
      rankings.push(new URL(route.request().url()).searchParams.get('scope') ?? '')
      return fulfillJson(route, INVERSE)
    })
    await page.route(new RegExp(`/contacts/account/${ACCOUNT_ID}$`), route => fulfillJson(route, []))

    // La seule URL : le Vivier.
    await page.goto('/consultants')
    await page
      .getByRole('link', { name: new RegExp(NAME) })
      .first()
      .click({ timeout: 30_000 })

    // Le profil importé est lisible sans ressaisie : identité, poste, compétence lue dans le CV.
    await expect(page.getByRole('heading', { name: NAME }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Data Engineer').first()).toBeVisible()
    await page.getByRole('button', { name: 'Compétences', exact: true }).click()
    await expect(page.getByText('Spark').first()).toBeVisible()

    // ÉCRITURE 1 — valider la disponibilité : UN appel, corps vide, et l'écran le confirme.
    await page.getByRole('button', { name: 'Profil', exact: true }).click()
    await page.getByRole('button', { name: 'Valider la disponibilité' }).click()
    await expect(page.getByText('Disponibilité validée à l’instant.')).toBeVisible({ timeout: 10_000 })
    expect(confirms).toEqual([{}])
    expect(writes).toEqual([])

    // Où la placer : le geste que la fiche propose, pas une URL.
    // #4346 (Louis 19/10/2026) — l'en-tête de la fiche ne porte que trois boutons : « Où placer »
    // vit dans le menu « Autres gestes », même libellé que la ligne du Vivier.
    await page.getByRole('button', { name: 'Autres gestes de la fiche' }).click()
    await page.getByRole('menuitem', { name: `Où placer ${NAME}` }).click()
    await expect(page.getByRole('heading', { name: 'Besoins internes' })).toBeVisible({ timeout: 30_000 })
    // Rien n'est classé tant que le recruteur ne l'a pas demandé.
    expect(rankings).toEqual([])

    // ÉCRITURE 2 — le classement part UNE fois, sur la portée affichée.
    await page.getByRole('button', { name: 'Lancer le classement' }).click()
    await expect(page.getByText('1 besoin(s) trouvé(s)')).toBeVisible({ timeout: 30_000 })
    expect(rankings).toEqual(['all'])

    // Le classement se JUSTIFIE : le besoin nommé avec son compte, ses axes, et
    // l'axe non évaluable DIT tel quel, jamais compté comme un zéro.
    // #2958.108 — même avec UN seul besoin (le radar se tait sous deux profils).
    const ranked = page.getByTestId(`inverse-need-score-${NEED_ID}`)
    await expect(ranked).toContainText('Data Engineer Spark · EDF DSI')
    await expect(ranked).toContainText(/Correspondance\s*84\/100/)
    await expect(ranked).toContainText(/Compétences obligatoires\s*90/)
    await expect(ranked).toContainText('Non évaluable : Langue')
  })
})

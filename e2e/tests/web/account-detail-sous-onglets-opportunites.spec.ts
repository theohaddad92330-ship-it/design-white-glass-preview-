import { expect, test, type Page } from '@playwright/test'

/**
 * #3624/#3676 retirent les sous-onglets Signaux/Opportunités/Besoins, délibérément
 * (Louis 05/10) : les clés d'URL `?tab=veille|projects` (et l'alias `needs`)
 * rendent UN SEUL écran « Signaux et besoins », sans pastille. Ce test garde ce qui reste de #3053 : l'écran se rend sous la
 * barre, son premier bloc est dans le viewport, pour chaque clé d'URL.
 *
 * #3053 — CLIQUER UN SOUS-ONGLET D'OPPORTUNITÉS CHANGE CE QU'ON VOIT.
 *
 * Retour Louis, 26/09 (capture, bureau, SOPRA STERIA GROUP, `?tab=veille`) :
 * « quand je passe d'un onglet à un autre ici ça n'a toujours pas d'effet sur
 * ce que je vois si ce n'est l'url ». Cause lue dans le code : les têtes de
 * section (l'ancien bandeau « À regarder en premier » — retiré par #3714 —, `QualificationLeadsQueue`) étaient
 * rendues ENTRE la barre des sous-onglets et la `<section>` de la sous-partie
 * active, sur les TROIS sous-onglets de la section — un écran entier au-dessus
 * du contenu que le clic est censé changer.
 *
 * Correctif : le contenu de la sous-partie vient désormais IMMÉDIATEMENT sous
 * la barre. Ce test le mesure là où le retour l'a mesuré — dans le navigateur,
 * pas dans jsdom (qui rend tout à `top: 0` et rendrait cette preuve muette) —
 * sur un dossier qui a des PISTES à qualifier : cliquer chaque sous-onglet
 * change le premier bloc sous la barre, et ce bloc est dans le viewport.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '7e2c9b1a-3333-4a11-9c33-3053008421be'
const ACCOUNT_ID = '3053af84-4444-4b22-8d44-3053af84e001'
const ACCOUNT_NAME = 'Compagnie de Recette des Sous-Onglets 3053'

const ACCOUNT = {
  id: ACCOUNT_ID,
  user_id: USER_ID,
  company_name: ACCOUNT_NAME,
  siren: '552100554',
  sector: 'Édition de logiciels',
  employees: '250-499',
  revenue: '50-100M€',
  headquarters: 'Lyon, France',
  website: 'https://recette-3053.example.com',
  subsidiaries: [],
  it_challenges: [],
  // #4022 — une offre d'emploi publiée : la section ① « Recrutements » s'ouvre dessus.
  recent_signals: [
    {
      signal: 'Ingénieur DevOps — plateforme de recette (H/F)',
      source: 'Offre d’emploi publiée',
      type: 'recrutement',
      date: '2026-09-20',
      url: 'https://recette-3053.example.com/jobs/devops',
      source_kind: 'job',
      freshness: 'current',
    },
  ],
  priority_score: 7,
  priority_justification: 'Compte prioritaire pour la recette #3053.',
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-26T10:30:00Z',
}

/** Une piste, au sens de `qualificationLeads.ts` : une ligne d'INTAKE
 *  (`detected`) avec un fait daté et une source identifiée — le même montage
 *  que `QualificationLeadsQueue.test.tsx` (fixture `row`), pour que la file
 *  affiche réellement « Pistes à qualifier » plutôt qu'un panneau muet. */
const PROJECT_ROWS = [
  {
    account_id: ACCOUNT_ID,
    company_name: ACCOUNT_NAME,
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: 'Ouverture d’un second entrepôt automatisé',
    detail: null,
    offer: null,
    source: 'Communiqué de presse',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-09-03T00:00:00.000Z',
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    id: 'lead-3053-1',
  },
]

async function mockAccountDetail(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-3053@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    }),
  )
  await page.route('**/onboarding/state', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
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
    }),
  )
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-3053af840001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(ACCOUNT) }),
  )
  await page.route(`**/contacts/account/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  )
  // Même clé React Query pour la file « Pistes à qualifier », `TabProjects`
  // et `TabNeeds` (`['projects', 'by-account', accountId]`) : un seul mock sert
  // les trois blocs de l'écran.
  await page.route('**/projects?account_id=*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(PROJECT_ROWS) }),
  )
  // SYNC-A — la fiche lit aussi le miroir CRM du compte ; sans mock la requête part vers une API absente.
  // Un miroir vide ne rend aucune section : l'écran « Signaux et besoins » reste celui que ce test mesure.
  await page.route(`**/crm/mirror/accounts/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ deals: [], activities: [] }) }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}/qualification-leads/decisions`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  )
}

test.describe('#3053 — dossier compte, section Opportunités, 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('chaque clé d’URL rend l’écran « Signaux et besoins » unique, premier bloc dans le viewport', async ({
    page,
  }) => {
    // Trois chargements complets (veille, projects, ancien lien ?tab=needs) :
    // jusqu'à 30 s chacun sur un runner chargé.
    test.setTimeout(30_000 * 3)
    await mockAccountDetail(page)

    // `needs` n'est plus une clé : c'est un alias de `veille` (#3676), l'ancien
    // lien aboutit au même écran, sous l'ancre de `veille`.
    const cases = [
      { tab: 'veille', anchor: 'dossier-veille' },
      { tab: 'projects', anchor: 'dossier-projects' },
      { tab: 'needs', anchor: 'dossier-veille' },
    ]
    for (const { tab, anchor } of cases) {
      await page.goto(`/accounts/${ACCOUNT_ID}?tab=${tab}`)
      await expect(page.getByText(ACCOUNT_NAME).first()).toBeVisible({ timeout: 30_000 })

      // #4022 (#4027) puis #4328.1 / #4329.1 (19/10) — la file des pistes se lit « Projets possibles,
      // à confirmer » (ex-« Hypothèses à vérifier ») et vit sur l'écran unique (#3053), quelle que soit
      // la clé ; elle n'est plus « Pistes à qualifier ».
      await expect(page.getByRole('heading', { name: 'Projets possibles, à confirmer' })).toBeVisible()
      await expect(page.getByText('Hypothèses à vérifier')).toHaveCount(0)
      await expect(page.getByText('Pistes à qualifier')).toHaveCount(0)
      // #3624 / #3676 — plus aucune pastille de sous-onglet dans la section.
      await expect(page.getByRole('link', { name: 'Besoins confirmés' })).toHaveCount(0)
      // #3714 — le bandeau « À regarder en premier » n'existe plus.
      await expect(page.getByText('À regarder en premier')).toHaveCount(0)

      // #4022 — UNE carte par fait, recrutements d'abord : la section ① précède les projets possibles ④.
      const recruitmentY = (await page.getByRole('heading', { name: 'Recrutements' }).boundingBox())?.y
      const hypothesesY = (await page.getByRole('heading', { name: 'Projets possibles, à confirmer' }).boundingBox())?.y
      if (recruitmentY === undefined || hypothesesY === undefined)
        throw new Error('« Recrutements » ou « Projets possibles, à confirmer » n’a pas de boîte englobante')
      expect(recruitmentY, 'les recrutements passent avant les projets possibles').toBeLessThan(hypothesesY)

      const block = page.locator('[id^="dossier-"]').first()
      await expect(block).toBeVisible()
      expect(await block.getAttribute('id')).toBe(anchor)
      const box = await block.boundingBox()
      if (!box) throw new Error(`« ${anchor} » n'a pas de boîte englobante — pas dans le viewport`)
      expect(box.y, `« ${anchor} » est poussé hors du premier écran (top=${box.y})`).toBeLessThan(800)
    }
  })
})

import { expect, test, type Page } from '@playwright/test'

/**
 * #2085.38 — parcours E2E des quatre premiers jalons de valeur après le
 * questionnaire : Market Memory (#1627/#2074.17), connecteur (#2085.11),
 * import (#2085.12), Laura (checklist d'activation, #2077.2).
 *
 * ⚠️ PARTIEL — deux des quatre restent NON JOUABLES dans ce socle e2e (Tier
 * 2, voir `e2e/README.md` §Roadmap), pour la même raison que #2085.32-.35 :
 * Connecteur et Import exigent une ÉCRITURE SERVEUR réelle (retour OAuth
 * confirmé, fichier réellement importé) qu'aucun mock de réponse ne peut
 * prouver sans reproduire le serveur lui-même — un mock qui répondrait
 * "connecté"/"importé" à la place du serveur ne prouverait RIEN de plus qu'un
 * texte de prompt vérifié en boîte blanche (voir #1948.53, le même chantier).
 *
 * Market Memory (`MarketAwarenessCard`) EST une lecture pure (`GET
 * /companies/market-context-search`, `useMarketContextSearch`), mockable au
 * même titre que Laura/#2077.2 ci-dessous : ce lot cartographie sa chaîne de
 * dépendances (`/welcome` : profil, profil ESN, contexte de profil, portefeuille,
 * capacités connectées) et la lève.
 * ⚠️ PARTIEL — deux des quatre restent NON JOUABLES dans ce socle e2e (Tier 2,
 * voir `e2e/README.md` §Roadmap) :
 * - Market Memory (`MarketAwarenessCard`) est une LECTURE pure et donc
 *   mockable en principe, mais sa requête (`useMarketContextSearch`, `GET
 *   /companies/market-context-search`) n'a pas été cartographiée mock par mock
 *   dans ce lot — reste, honnête plutôt que deviné.
 * - Import exige une ÉCRITURE SERVEUR réelle (fichier réellement importé)
 *   qu'aucun mock de réponse ne peut prouver sans reproduire le serveur
 *   lui-même — un mock qui répondrait « importé » à sa place ne prouverait
 *   RIEN de plus qu'un texte de prompt vérifié en boîte blanche (#1948.53).
 *
 * Laura (#2077.2) EST une lecture pure (`GET /onboarding/activation`, dérivée
 * serveur, jamais une écriture) : levé et prouvé par un vrai build Playwright.
 *
 * Connecteur (#2085.11) est LEVÉ dans ce lot (lot src6, 28/09) : la raison
 * « Tier 3 absent » donnée par les bilans précédents ne tenait pas à l'examen
 * — le retour OAuth (`parseOAuthCallback`) est lui aussi une LECTURE pure de
 * l'URL, jamais une écriture. Le vrai obstacle était la SURFACE de mocks que
 * `IntegrationCenterPage` exige pour rendre sans accrochage (18 cartes sans
 * condition, sept d'entre elles avec leur propre requête de statut) —
 * cartographiée dans `mockIntegrationsShell`, voir son commentaire.
 */
test.describe('onboarding — les quatre premiers jalons de valeur (#2085.38)', () => {
  const MARKET_USER_ID = '9a1b2c3d-2085-4e11-8f33-2085380000af'
  const MARKET_WEB_ORIGIN = 'http://127.0.0.1:4311'

  async function mockWelcomeShellWithMarketMemory(page: Page): Promise<void> {
    await page.context().addCookies([{ name: `loggedIn:${MARKET_USER_ID}`, value: '1', url: MARKET_WEB_ORIGIN }])
    await page.route('**/auth/session', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: MARKET_USER_ID,
            email: 'e2e-2085-38-market@bellum-ai.com',
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
          id: MARKET_USER_ID,
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
    await page.route('**/credits', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: ['chat_ai'] }) }),
    )
    await page.route('**/profiles/me', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'p-2085-38-market',
          user_id: MARKET_USER_ID,
          email: 'e2e-2085-38-market@bellum-ai.com',
          first_name: 'Golden',
          last_name: 'Journey',
          avatar_url: null,
          timezone: 'Europe/Paris',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          auth_created_at: '2026-01-01T00:00:00.000Z',
          auth_last_sign_in_at: '2026-09-27T08:00:00.000Z',
        }),
      }),
    )
    // #1627 — la zone déclarée est le libellé COMPOSÉ exact du questionnaire
    // (`Q.geo_zones`), jamais un mot court écrit à la main : c'est l'écart
    // entre les deux qui rendait cette carte morte en production
    // (`market-awareness.ts`, docblock). `firstUsableZone` coupe sur « & ».
    await page.route('**/esn-profile', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          esn_name: 'ESN e2e',
          consultant_size: '20',
          expertise_areas: [],
          target_sectors: [],
          geo_zones: ['Lyon & Auvergne-Rhône-Alpes'],
          recruits_for_clients: 'yes',
        }),
      }),
    )
    await page.route('**/profile-context/me', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          profile_context: {
            welcomeSummary: {
              profileRecap: '',
              searchesPersonalization: '',
              contactsPersonalization: '',
              messagesPersonalization: '',
              scoringPersonalization: '',
              firstAnalysisSuggestions: [],
            },
          },
        }),
      }),
    )
    await page.route('**/accounts/to-act/summary', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ hasAccountsToAct: false }) }),
    )
    await page.route('**/tool-registry', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    )
    // Le résultat de `GET /companies/market-context-search` — même forme que
    // `MarketContextMatch` (`MarketAwarenessCard.test.tsx`), un environnement
    // dont la pile observée retrouve l'expertise déclarée.
    await page.route('**/companies/market-context-search*', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          matches: [
            {
              companyName: 'Lyon Systèmes SA',
              coverage: {
                covered: true,
                marketPaths: 12,
                esnObserved: [],
                observedStack: [{ techno: 'Java', persons: 4 }],
                roleFamilies: [],
                exEsnPresent: null,
                observedZone: null,
              },
            },
          ],
        }),
      }),
    )
  }

  test('Market Memory : la carte affiche des environnements compatibles sans créer de compte', async ({ page }) => {
    await mockWelcomeShellWithMarketMemory(page)

    await page.goto('/welcome')

    // ÉCRAN — la carte rend l'environnement trouvé, SANS création de compte
    // (aucune requête de mutation posée par ce mock) ni analyse déclenchée.
    await expect(page.getByText('Bellum connaît déjà 1 environnement de marché')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Autour de Lyon, ta zone déclarée/)).toBeVisible()
    await expect(page.getByText('cette consultation est incluse')).toBeVisible()
    await expect(page.getByText('aucun compte n’est créé automatiquement')).toBeVisible()

    // LE CLIC — le CTA navigue vers Découvrir, un vrai clic client-side,
    // sans déclencher d'analyse côté serveur (`goToDiscover`, docblock du
    // composant : « le CTA navigue vers Découvrir, il ne déclenche rien »).
    await page.getByRole('button', { name: 'Voir mes premières pistes' }).click()
    await expect(page).toHaveURL(/\/discover\?/)
  })

  /**
   * #2085.38 (Connecteur) — LEVÉ ce lot, contrairement à ce que les bilans
   * précédents affirmaient. La raison « Tier 3 absent » ne tenait pas à
   * l'examen : le retour OAuth (`parseOAuthCallback`, toast, invalidation)
   * est une lecture pure de l'URL, exactement comme les trois autres jalons
   * de ce fichier — aucune écriture serveur à REPRODUIRE, seulement une
   * réponse à mocker. Le vrai obstacle était la SURFACE : `IntegrationCenterPage`
   * monte SANS condition ses 18 cartes, et six d'entre elles (HubSpot,
   * Salesforce, Pipedrive, Attio, Microsoft 365, Notion) + Google Workspace
   * lisent chacune leur propre statut au montage (`useCrmStatus` et
   * consorts, `enabled: !!user` — jamais gaté par `state`). Cartographié
   * ci-dessous plutôt que réputé trop large.
   */
  async function mockIntegrationsShell(page: Page): Promise<void> {
    await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
    await page.route('**/auth/session', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: USER_ID,
            email: 'e2e-2085-38-connecteur@bellum-ai.com',
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
          workspace: { id: 'w-2085-38-connecteur', name: 'ESN e2e', role: 'owner', memberCount: 1 },
          members: [],
        }),
      }),
    )
    await page.route('**/credits', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) }),
    )
    await page.route('**/profiles/me', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'p-2085-38-connecteur',
          user_id: USER_ID,
          email: 'e2e-2085-38-connecteur@bellum-ai.com',
          first_name: 'Golden',
          last_name: 'Journey',
          avatar_url: null,
          timezone: 'Europe/Paris',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          auth_created_at: '2026-01-01T00:00:00.000Z',
          auth_last_sign_in_at: '2026-09-27T08:00:00.000Z',
        }),
      }),
    )
    await page.route('**/banners?*', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ banners: [] }) }),
    )
    // Le registre serveur : AUCUNE ligne pour aucun connecteur — chaque carte
    // dégrade donc en `available` (`connectorState([])`, `connectors.ts`),
    // jamais masquée (catalogue statique, pas un `Partial`).
    await page.route('**/tool-registry', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    )
    // Les webhooks (Slack/Discord/Teams/Google Chat/Mattermost/Webhook générique).
    // ⚠️ `**/integrations` matche AUSSI la navigation vers `/integrations`
    // elle-même (même chemin, l'écran ET l'appel réseau) : sans ce garde-fou
    // sur `resourceType`, la page entière se remplaçait par le corps JSON
    // `[]` — mesuré en écrivant ce test, un vrai crash trouvé en cours de
    // route (même doctrine que #2446.15/#2085.38 « Laura », deux crashs
    // trouvés et corrigés par un vrai build Playwright).
    await page.route('**/integrations', route => {
      if (route.request().resourceType() === 'document') return route.continue()
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/api-keys', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    )
    // Les six cartes OAuth qui lisent LEUR PROPRE statut au montage
    // (`useCrmStatus`/`useSalesforceStatus`/`usePipedriveStatus`/
    // `useAttioStatus`/`useMicrosoftStatus`/`useNotionStatus`, toutes
    // `enabled: !!user` — jamais gatées par `state`), plus Google Workspace.
    for (const path of ['crm', 'salesforce', 'pipedrive', 'attio', 'microsoft', 'notion', 'google']) {
      await page.route(`**/${path}/status`, route =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ configured: false, connected: false }),
        }),
      )
    }
  }

  test('Connecteur : le retour OAuth confirmé active le jalon, jamais un clic optimiste', async ({ page }) => {
    await mockIntegrationsShell(page)

    // ÉCRAN — la page rend ses 18 cartes SANS accrochage réseau : la preuve
    // que la surface est bien cartographiée, pas seulement le callback.
    // `.first()` : HubSpot apparaît deux fois (sa carte, et « Par quoi
    // commencer » qui la recommande) — les deux sont un succès, pas une
    // ambiguïté à lever.
    await page.goto('/integrations')
    await expect(page.getByText('HubSpot').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Assistant IA').first()).toBeVisible()

    // LE CALLBACK — le mot « connected » n'est écrit dans l'URL que par le
    // SERVEUR, après l'échange réel du jeton (`parseOAuthCallback.ts`,
    // #2078.25) : ce lot le vérifie en le POSANT dans l'URL, jamais en
    // cliquant un bouton « Connecter » qui n'ouvrirait qu'une fenêtre tierce
    // sans jamais la faire aboutir dans ce socle Tier 2.
    await page.goto('/integrations?hubspot=connected')
    await expect(page.getByText('HubSpot est branché.')).toBeVisible({ timeout: 30_000 })
    // L'URL est nettoyée après lecture — jamais rejouée à un rechargement.
    await expect(page).toHaveURL(/\/integrations$/)
  })

  test('Connecteur : un retour OAuth en échec ne s’affiche jamais comme un succès', async ({ page }) => {
    await mockIntegrationsShell(page)
    await page.goto('/integrations?hubspot=error&reason=access_denied')
    await expect(page.getByText("HubSpot n'a pas pu être branché : access_denied")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('HubSpot est branché.')).not.toBeVisible()
  })

  test('Import : une écriture réelle (pas une simulation) déclenche le jalon', async ({ page }) => {
    test.skip(
      true,
      'Tier 3 absent — voir e2e/README.md §Roadmap. Nécessite un fichier de test et un utilisateur seedé.',
    )

    // Le scénario à jouer une fois le Tier 3 posé :
    // 1. `ImportWizard` (apps/web/src/features/import/view) — importer un
    //    petit fichier de test.
    // 2. `data_imported` (product-tracker.ts, #2085.12) ne se pose que sur
    //    `outcome.written` (une écriture réelle), jamais sur une
    //    prévisualisation.
    await page.goto('/login')
  })

  const WEB_ORIGIN = 'http://127.0.0.1:4311'
  const USER_ID = '9a1b2c3d-2085-4e11-8f33-2085380000be'

  async function mockChatShellWithActivation(page: Page): Promise<void> {
    await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
    await page.route('**/auth/session', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: USER_ID,
            email: 'e2e-2085-38@bellum-ai.com',
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
          workspace: { id: 'w-2085-38', name: 'ESN e2e', role: 'owner', memberCount: 1 },
          members: [],
        }),
      }),
    )
    await page.route('**/credits', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: ['chat_ai'] }) }),
    )
    await page.route('**/profiles/me', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'p-2085-38',
          user_id: USER_ID,
          email: 'e2e-2085-38@bellum-ai.com',
          first_name: 'Golden',
          last_name: 'Journey',
          avatar_url: null,
          timezone: 'Europe/Paris',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          auth_created_at: '2026-01-01T00:00:00.000Z',
          auth_last_sign_in_at: '2026-09-27T08:00:00.000Z',
        }),
      }),
    )
    await page.route('**/accounts?*', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { currentPage: 1, size: 25, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false },
        }),
      }),
    )
    await page.route('**/banners?*', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ banners: [] }) }),
    )
    await page.route('**/tool-registry', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/ia/chat/history*', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
    )
    await page.route('**/ia/chat/messages*', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ messages: [] }) }),
    )
    // ── LE JALON : quatre étapes déjà franchies (profil validé, analyse
    // lancée, dossier ouvert, contact enrichi), `message_prepared` restant —
    // exactement l'exemple cité par ce point (« Copie ou envoie un premier
    // message »). `colleague_invited: 'not_applicable'` (pas de siège/rôle
    // pour inviter) sort du dénominateur (doctrine #2077.9) : 4/7, pas 4/8.
    await page.route('**/onboarding/activation', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          profile_completed: true,
          analysis_launched: true,
          dossier_viewed: true,
          contact_enriched: true,
          message_prepared: false,
          tool_connected: false,
          correction_made: false,
          colleague_invited: 'not_applicable',
          completed_count: 4,
          is_complete: false,
        }),
      }),
    )
  }

  test('Laura : la checklist d’activation apparaît au-dessus du fil, repliée, avec la prochaine étape nommée', async ({
    page,
  }) => {
    await mockChatShellWithActivation(page)

    await page.goto('/chat')
    // The first assertion after a page load waits for hydration (≈4-7 s on the CI runner, 30 s like the
    // rest of the suite); the ones that follow keep the default 5 s.

    // ÉCRAN — la checklist, REPLIÉE par défaut (`readCollapsed`,
    // `bellum_activation_collapsed` absent de ce navigateur neuf), nomme la
    // prochaine étape et le compteur SANS qu'on la déplie.
    await expect(page.getByText('Prochaine étape : Copie ou envoie un premier message')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('4/7')).toBeVisible()

    // LE CLIC — « Continuer » navigue vers l'écran où CE jalon se franchit
    // (`STEP_TARGETS.message_prepared`, `/accounts`) : un vrai clic
    // client-side, jamais un lien qui recharge la page.
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page).toHaveURL(/\/accounts$/)
  })
})

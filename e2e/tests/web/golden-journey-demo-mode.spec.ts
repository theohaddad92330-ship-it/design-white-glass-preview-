import { expect, test, type Page } from '@playwright/test'

/**
 * #2154.26 — scénario E2E du mode démo (registre : `agent_docs/migration-routes-golden-journeys.md`, GJ 37).
 *
 * GOLDEN JOURNEY — golden journey 37 de #2208 (« Utiliser le mode démo »),
 * repris par l'épopée #2958 (registre de migration, redirections, rollback,
 * coexistence, E2E, conditions NO-GO/GO). Aucun e2e ne prouvait ce parcours :
 * `demo-turn.ts`/`DemoModeBanner.test.tsx` vérifient des fragments en boîte
 * blanche, jamais le clic réel depuis le lien PARTAGÉ (`/demo`) jusqu'à la
 * sortie.
 *
 * LE PARCOURS RÉEL D'UN PROSPECT (`DemoEntryPage`, `DemoAccessPage`,
 * `useDemoAccessForm`) :
 *   1. Le lien nu `/demo` — explication AVANT toute action (jamais de
 *      rédemption au chargement, un scanner de lien grillerait la salle).
 *   2. « Lancer la démo » → `POST /demo/lead/touch`. Premier visiteur
 *      (`found: false`) → navigation DURE vers `/demo/acces` (le formulaire
 *      obligatoire, #2705) — jamais la démo sans savoir qui regarde.
 *   3. Formulaire rempli → `POST /demo/lead` (le lead) puis `POST
 *      /demo/session` (redeem) — même geste que `DemoEntryPage.enterDemo()` :
 *      marquage d'onglet démo, purge du cache IndexedDB, puis rechargement
 *      COMPLET vers `/` (jamais une navigation SPA — l'app reboote comme pour
 *      un utilisateur qui revient).
 *   4. Atterrissage réel sur `/chat` (même atterrissage établi que
 *      `golden-journey-login-to-chat.spec.ts`, #2446.14) : le bandeau
 *      PERMANENT « Mode démo » (`DemoModeBanner`, `credits.is_demo`) est
 *      visible — la preuve qu'un prospect ne peut PAS confondre les dossiers
 *      fictifs avec un vrai portefeuille.
 *   5. « Quitter la démonstration » (`useExitDemo`) → `POST /auth/logout` →
 *      navigation DURE vers `/login` — la démo n'a pas de « vraie » session à
 *      restaurer en dessous, donc la sortie ramène au point de connexion réel.
 *
 * Mocks : même socle ÉPROUVÉ que `golden-journey-login-to-chat.spec.ts`
 * (compte « établi », desktop, sans préférence de démarrage enregistrée →
 * `/chat`) — jamais une seconde cartographie de `Chat.tsx` — plus les trois
 * endpoints propres à la démo (`lead/touch`, `lead`, `session`) et
 * `credits.is_demo: true`. Le cookie `loggedIn:` que `hasLoggedInCookie()`
 * lit au boot est posé DANS le handler de `/demo/session`, exactement au
 * moment où le serveur réel le poserait (`Set-Cookie`) — jamais avant, sinon
 * le test prouverait un raccourci que le vrai parcours n'a pas.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = 'd2208037-e2e0-4de3-8f33-000000000037'
const FIRST_NAME = 'Marie'

async function mockDemoMode(page: Page): Promise<void> {
  // ── Étape 2 : premier visiteur, aucun lead connu.
  await page.route('**/demo/lead/touch', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ found: false }) }),
  )
  // ── Étape 3 : le formulaire obligatoire, puis la rédemption.
  await page.route('**/demo/lead', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ firstName: FIRST_NAME }) }),
  )
  await page.route('**/demo/session', async route => {
    // Le geste que le serveur réel fait via `Set-Cookie` sur cette même
    // réponse : posé ICI, jamais avant, pour ne prouver que le vrai parcours.
    await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-demo-mode-token',
        expires_at: Date.now() + 3_600_000,
        user: {
          id: USER_ID,
          email: 'demo-visitor@bellum-ai.com',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    })
  })
  // ── Étape 4 : `sessionManager.loadSession()` relit la session au reboot
  // complet, via le cookie `loggedIn:` posé ci-dessus.
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'demo-visitor@bellum-ai.com',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    }),
  )
  // ── Le même socle ÉPROUVÉ que golden-journey-login-to-chat.spec.ts
  // (#2446.14) pour l'atterrissage réel sur `/chat` — compte établi, desktop,
  // sans préférence de démarrage enregistrée.
  await page.route('**/profiles/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'd2208037-e2e0-4de3-8f33-000000000038',
        user_id: USER_ID,
        email: 'demo-visitor@bellum-ai.com',
        first_name: FIRST_NAME,
        last_name: 'E2E',
        avatar_url: null,
        timezone: 'Europe/Paris',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        auth_created_at: '2026-01-01T00:00:00.000Z',
        auth_last_sign_in_at: '2026-09-30T08:00:00.000Z',
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
  // `is_demo: true` — le champ qui pilote `DemoModeBanner` et `useIsDemo()`,
  // à CÔTÉ de `chat_ai` (sans elle, `/chat` reste verrouillé derrière l'offre).
  await page.route('**/credits', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ features: ['chat_ai'], is_demo: true }),
    }),
  )
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: 'd2208037-e2e0-4de3-8f33-000000000039', name: 'Démo Bellum', role: 'owner', memberCount: 1 },
        members: [],
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
  // ── Étape 5 : la sortie. Le serveur réel révoque la session ET efface le
  // cookie `loggedIn:` (`Set-Cookie` expiré) — sans ce geste ici, le cookie
  // posé à la main par ce fichier survit à la déconnexion, `hasLoggedInCookie()`
  // reste vrai sur `/login`, et l'atterrissage authentifié de la page renvoie
  // aussitôt vers `/chat` : un test qui prouverait un aller-retour, pas une
  // vraie sortie.
  await page.route('**/auth/logout', async route => {
    await page.context().clearCookies({ name: `loggedIn:${USER_ID}` })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })
}

test.describe('golden journey 37 (#2208) — utiliser le mode démo', () => {
  test('lien partagé → formulaire → démo (bandeau visible) → sortie réelle', async ({ page }) => {
    // Deux rechargements COMPLETS (entrée puis sortie) + trois attentes de 15 s :
    // le plafond par défaut de 30 s ne les couvre pas sous la charge des 4
    // workers de la CI (CI Y2 du 01/10 : 36 s, « Test timeout of 30000ms »,
    // alors que les parcours voisins prennent 13-20 s). Le budget de CE parcours
    // est celui de ses étapes, pas un flake à masquer par un retry.
    test.setTimeout(75_000)
    await mockDemoMode(page)

    // ÉTAPE 1 — le lien nu, l'explication avant toute rédemption.
    await page.goto('/demo')
    await expect(page.getByRole('heading', { name: /Tu es sur la démo de/ })).toBeVisible()

    // ÉTAPE 2 — premier visiteur : « Lancer la démo » renvoie au formulaire
    // obligatoire, jamais la démo sans savoir qui regarde.
    const leadTouch = page.waitForRequest(
      request => request.url().includes('/demo/lead/touch') && request.method() === 'POST',
    )
    // #4291 — « Lancer la démo forfait / conseil » existe aussi : le libellé EXACT désigne le bouton générique.
    await page.getByRole('button', { name: 'Lancer la démo', exact: true }).click()
    await leadTouch
    await page.waitForURL(`${WEB_ORIGIN}/demo/acces`)
    await expect(page.getByRole('heading', { name: 'Avant de lancer la démo' })).toBeVisible()

    // ÉTAPE 3 — le formulaire obligatoire, geste par geste.
    await page.getByPlaceholder('Marie').fill(FIRST_NAME)
    await page.getByPlaceholder('Dupont').fill('E2E')
    await page.getByPlaceholder('prenom@entreprise.com').fill('demo-visitor@bellum-ai.com')
    await page.getByRole('combobox', { name: 'Fonction' }).click()
    await page.getByRole('option', { name: 'Freelance / Indépendant' }).click()
    await page.getByPlaceholder('Acme').fill('Acme e2e')

    const submit = page.getByRole('button', { name: 'Accéder à la démo' })
    await expect(submit).toBeEnabled()

    const registerLead = page.waitForRequest(
      request =>
        request.url().includes('/demo/lead') && request.method() === 'POST' && !request.url().includes('touch'),
    )
    const redeem = page.waitForRequest(
      request => request.url().includes('/demo/session') && request.method() === 'POST',
    )
    await submit.click()
    await registerLead
    await redeem

    // Le message de remerciement se lit AVANT le rechargement complet
    // (`DEMO_ACCESS_SUCCESS_DELAY_MS`) — jamais dans le même tick.
    await expect(page.getByText(`Merci ${FIRST_NAME}.`)).toBeVisible()

    // ÉTAPE 4 — atterrissage RÉEL après le rechargement complet (même
    // destination que le compte établi de #2446.14 : `/chat`).
    await page.waitForURL(`${WEB_ORIGIN}/chat`, { timeout: 15_000 })

    // LA PREUVE DU MODE DÉMO — le bandeau permanent, jamais un simple atterrissage
    // qui ressemblerait à une vraie session.
    const banner = page.getByRole('status').filter({ hasText: 'Mode démo' })
    await expect(banner).toBeVisible()
    await expect(banner.getByText(/jeu d.exemples/)).toBeVisible()
    await expect(banner.getByText(/pas ton portefeuille réel/)).toBeVisible()

    // ÉTAPE 5 — sortie déterministe : un seul clic, jamais un onglet resté
    // coincé en démonstration (#2602.1).
    const logout = page.waitForRequest(request => request.url().includes('/auth/logout') && request.method() === 'POST')
    await banner.getByRole('button', { name: 'Quitter la démonstration' }).click()
    await logout
    // Navigation DURE (jamais un `router.navigate` annulable) : sous charge,
    // le rechargement complet (nouveau bundle, nouvelle hydratation) peut
    // dépasser le délai `expect` par défaut (5 s) — c'est le POINT de cette
    // étape (une sortie qui repart d'une mémoire propre), pas un flake à
    // masquer par un retry.
    await page.waitForURL(`${WEB_ORIGIN}/login`, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible({ timeout: 15_000 })
  })
})

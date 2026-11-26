import { expect, test, type Page } from '@playwright/test'

/**
 * #2446.14 — GOLDEN JOURNEY 1 : CONNEXION JUSQU'À LA PREMIÈRE ACTION VISIBLE.
 *
 * L'épopée #2773 demande cinq parcours bout-en-bout PROUVÉS À L'ÉCRAN. Les
 * bilans précédents (commentaires de #2773, lots du 25/09 au 27/09) ont
 * laissé ce point non engagé pour DEUX raisons distinctes, creusées le 27/09
 * (lot `feat/epo-g3-27-09`) :
 *
 * 1. La destination post-connexion N'EST PAS un chemin fixe
 *    (`useRedirectAfterAuth.ts` → `resolveLanding`) : elle dépend de trois
 *    lectures asynchrones (`GET /profiles/me`, `GET /onboarding/state`,
 *    `GET /credits`), du mobile et d'une préférence utilisateur
 *    (`defaultView`). Ce fichier mocke les trois pour un compte « établi »
 *    (onboarding terminé, desktop, préférence par défaut) — la destination
 *    « normale » qui en résulte est `/chat` (`resolveDefaultLandingRoute`,
 *    `preferences-provider.tsx`, défaut `chat`).
 * 2. `/chat` (`Chat.tsx`, 4 500+ lignes, des dizaines de hooks réseau
 *    distincts) n'a jamais été cartographié mock par mock — le même risque
 *    que la liste `/accounts` déjà écarté pour #2446.15-découverte. Un e2e
 *    qui resterait bloqué en chargement infini serait un FAUX ROUGE, ce que
 *    la doctrine du chantier (voir les bilans précédents) refuse
 *    explicitement.
 *
 * Ce fichier prouve donc la moitié RÉELLEMENT vérifiable de ce parcours — la
 * CONNEXION elle-même, geste par geste, jamais un cookie posé pour simuler
 * une session déjà ouverte (contrairement aux autres golden journeys, qui
 * partent d'un dossier compte déjà ouvert) : email → code à 6 caractères →
 * session appliquée → atterrissage RÉEL sur `/chat`.
 *
 * Lot V14 (28/09, passe 2) — la seconde moitié, « la première action visible »
 * DANS `/chat`, n'exigeait PAS de cartographier `Chat.tsx` dans son ensemble :
 * `golden-journey-real-conversation-turn.spec.ts` (#1948.53) a déjà cartographié
 * le fil VIDE (aucun historique, aucun compte sélectionné) jusqu'au geste
 * ENVOYER UN MESSAGE → RECEVOIR UNE RÉPONSE — c'est EXACTEMENT la première
 * action concrète disponible en atterrissant sur `/chat`. Ce fichier réutilise
 * ce même socle de mocks (jamais une seconde cartographie) et l'enchaîne
 * directement après la connexion, plutôt que de partir d'un cookie de session.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const EMAIL = 'e2e-2446-14@bellum-ai.com'
const USER_ID = '9a1b2c3d-1414-4e11-8f33-2446140000be'
const OTP_CODE = 'A1B2C3'
const REPLY_TEXT = 'Voici trois comptes prioritaires pour cette semaine, classés par signal le plus récent.'

function sseFrame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

async function mockLoginToChat(page: Page): Promise<void> {
  await page.route('**/auth/request-otp', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )
  await page.route('**/auth/verify-otp', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'authenticated',
        session: {
          access_token: 'e2e-2446-14-token',
          expires_at: Date.now() + 3_600_000,
          user: {
            id: USER_ID,
            email: EMAIL,
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
            created_at: '2026-01-01T00:00:00.000Z',
            roles: ['customer'],
          },
        },
      }),
    }),
  )
  // ── Les trois lectures async de `resolveLanding` — compte ÉTABLI : onboarding
  // déjà terminé, un plan déjà servi, aucun lien profond en attente.
  await page.route('**/profiles/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '9b1c2d3e-1414-4a61-8b72-2446140001',
        user_id: USER_ID,
        email: EMAIL,
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
  // `chat_ai` — la clé de palier qui donne accès à Laura (`plan-features.ts`) :
  // sans elle, `/chat` rend l'écran « Non inclus dans ton offre », jamais le
  // composeur (même constat que #1948.53).
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: ['chat_ai'] }) }),
  )
  // ── Le reste des lectures que `/chat` fait au repos (fil vide, aucun compte
  // sélectionné) — même socle que `golden-journey-real-conversation-turn.spec.ts`
  // (#1948.53), jamais une seconde cartographie de `Chat.tsx`.
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2446140002', name: 'ESN e2e', role: 'owner', memberCount: 1 },
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
  await page.route('**/ia/chat/messages*', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ messages: [] }) })
    }
    const posted = route.request().postDataJSON() as { role?: string; content?: string }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: {
          id: `e2e-2446-14-${posted.role ?? 'msg'}`,
          role: posted.role ?? 'user',
          content: posted.content ?? '',
          created_at: new Date().toISOString(),
        },
      }),
    })
  })
  // ── LE GESTE PROUVÉ ENSUITE : un vrai tour, diffusé en SSE
  // (`consumeChatStream`, `laura-turn.ts`) — jamais un texte de prompt
  // vérifié en boîte blanche.
  await page.route('**/ia/chat', route =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: [
        sseFrame({ type: 'step', label: 'Lecture du portefeuille…' }),
        sseFrame({ type: 'delta', text: REPLY_TEXT }),
        sseFrame({ type: 'done', success: true, data: { reply: REPLY_TEXT, turn_id: 'turn-e2e-2446-14' } }),
      ].join(''),
    }),
  )
}

test.describe('#2446.14 — golden journey : connexion → atterrissage', () => {
  test('email + code à 6 caractères → session appliquée → atterrissage réel sur /chat', async ({ page }) => {
    await mockLoginToChat(page)

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()

    // ÉTAPE A — passer sur le formulaire « code par email ».
    await page.getByRole('button', { name: 'Recevoir un code par email' }).click()
    await expect(page.getByRole('heading', { name: 'Se connecter avec un code' })).toBeVisible()

    // ÉTAPE B — demander le code.
    await page.getByPlaceholder('tu@entreprise.com').fill(EMAIL)
    const requestOtp = page.waitForRequest(
      request => request.url().includes('/auth/request-otp') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Envoyer le code', exact: true }).click()
    await requestOtp
    await expect(page.getByRole('heading', { name: 'Entre ton code' })).toBeVisible()

    // ÉTAPE C — LE GESTE QUI OUVRE LA SESSION : les 6 caractères déclenchent la
    // vérification automatiquement (`handleCodeChange`, `EmailCodeLoginForm.tsx`),
    // jamais un bouton « Valider » séparé.
    const verifyOtp = page.waitForRequest(
      request => request.url().includes('/auth/verify-otp') && request.method() === 'POST',
    )
    await page.locator('input[data-input-otp]').fill(OTP_CODE)
    await verifyOtp

    // ÉCRAN — l'atterrissage RÉEL, décidé par `resolveLanding` (les trois
    // lectures async ci-dessus), jamais un `/dashboard` en dur : pour ce
    // compte établi, desktop, sans préférence de démarrage enregistrée, la
    // destination est `/chat` (défaut `DEFAULT_VIEW_VALUES[0]`).
    await page.waitForURL(`${WEB_ORIGIN}/chat`)
    await expect(page).toHaveURL(/\/chat$/)

    // ÉCRAN — LA PREMIÈRE ACTION CONCRÈTE, visible ET déclenchable dès
    // l'atterrissage : le composeur de Laura (même socle mocké que #1948.53).
    const composer = page.getByRole('textbox', { name: 'Message à Laura' })
    await expect(composer).toBeVisible()
    await expect(composer).toBeEnabled()

    const question = 'Quels sont mes trois comptes les plus prioritaires cette semaine ?'
    await composer.fill(question)

    const turnRequest = page.waitForRequest(
      request => request.url().endsWith('/ia/chat') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await turnRequest

    // La question tapée entre dans le fil (écriture optimiste), puis la
    // réponse diffusée par le flux SSE mocké apparaît réellement — la même
    // preuve qu'un tour RÉEL, pas un texte de prompt vérifié en boîte blanche.
    await expect(page.getByText(question)).toBeVisible()
    await expect(page.getByText(REPLY_TEXT)).toBeVisible()
  })
})

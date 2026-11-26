import { expect, test, type Page } from '@playwright/test'

/**
 * #1948.53 — CHAQUE PROMESSE COMMERCIALE A UN SCÉNARIO E2E, ET CE SCÉNARIO
 * PROUVE UN VRAI TOUR DE CONVERSATION — PAS UN TEXTE DE PROMPT.
 *
 * Réutilisé HORS LOT le 24/09 (tranché sans Louis, commentaire de #2773) dans
 * le même chantier golden-journeys : le constat d'origine (#1948.53) est que
 * les scénarios existants vérifient le CONTENU d'un prompt système (tests
 * `apps/ia`, golden files), jamais qu'un message tapé à l'écran produit
 * réellement une réponse affichée. Ce fichier ferme ce point précis, sans
 * viser les 4 500+ lignes de `Chat.tsx` dans leur ensemble (le même risque de
 * cartographie que #2446.14/#2446.16, documenté dans les bilans précédents de
 * #2773) : seul le geste ENVOYER UN MESSAGE → RECEVOIR UNE RÉPONSE AFFICHÉE
 * est prouvé, avec le fil vide (aucun historique à charger).
 *
 * `POST /ia/chat` diffuse en SSE (`laura-turn.ts`, LOT STREAM 12/09/2026) :
 * ce mock rend une frame `delta` (le texte, comme le ferait le flux réel) puis
 * la frame `done` qui porte l'enveloppe finale — jamais un texte de prompt
 * vérifié en boîte blanche, un VRAI aller-retour réseau intercepté à la même
 * porte que le navigateur (GA-237, `laura-turn-single-door.test.ts`).
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '9a1b2c3d-1953-4e11-8f33-1948530000be'
const REPLY_TEXT = 'Voici trois comptes prioritaires pour cette semaine, classés par signal le plus récent.'

function sseFrame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

async function mockChatShell(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-1948-53@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-1948530001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  // `chat_ai` — la clé de palier qui donne accès à Laura (`plan-features.ts`) :
  // sans elle, `/chat` rend l'écran « Non inclus dans ton offre », jamais le
  // composeur (mesuré en écrivant ce test).
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: ['chat_ai'] }) }),
  )
  await page.route('**/profiles/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '9b1c2d3e-1948-4a61-8b72-194853000a',
        user_id: USER_ID,
        email: 'e2e-1948-53@bellum-ai.com',
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
  // ── Le reste des lectures que `/chat` fait au repos (fil vide, aucun compte
  // sélectionné) : chacune se dégrade proprement sur une liste vide
  // (`Array.isArray`/`?? []` partout — jamais un accrochage sur ces mocks).
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
          id: `e2e-1948-53-${posted.role ?? 'msg'}`,
          role: posted.role ?? 'user',
          content: posted.content ?? '',
          created_at: new Date().toISOString(),
        },
      }),
    })
  })

  // ── LE GESTE PROUVÉ : un vrai tour, diffusé en SSE (`consumeChatStream`,
  // `laura-turn.ts`) — jamais un texte de prompt vérifié en boîte blanche.
  await page.route('**/ia/chat', route =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: [
        sseFrame({ type: 'step', label: 'Lecture du portefeuille…' }),
        sseFrame({ type: 'delta', text: REPLY_TEXT }),
        sseFrame({ type: 'done', success: true, data: { reply: REPLY_TEXT, turn_id: 'turn-e2e-1948-53' } }),
      ].join(''),
    }),
  )
}

test.describe('#1948.53 — un vrai tour de conversation, pas un texte de prompt vérifié en boîte blanche', () => {
  test('taper un message, l’envoyer, et voir la réponse de Laura affichée dans le fil', async ({ page }) => {
    await mockChatShell(page)

    await page.goto('/chat')

    const composer = page.getByRole('textbox', { name: 'Message à Laura' })
    await expect(composer).toBeVisible()

    const question = 'Quels sont mes trois comptes les plus prioritaires cette semaine ?'
    await composer.fill(question)

    const turnRequest = page.waitForRequest(
      request => request.url().endsWith('/ia/chat') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await turnRequest

    // ÉCRAN 1 — la question tapée entre dans le fil, en bulle utilisateur
    // (écriture optimiste, `handleSend`) : elle ne dépend d'aucune réponse.
    await expect(page.getByText(question)).toBeVisible()

    // ÉCRAN 2 — LA PREUVE DU VRAI TOUR : le texte diffusé par le flux SSE
    // mocké apparaît réellement dans le fil, jamais une assertion sur le
    // corps de la requête envoyée (ça, c'est vérifier un prompt).
    await expect(page.getByText(REPLY_TEXT)).toBeVisible()
  })
})

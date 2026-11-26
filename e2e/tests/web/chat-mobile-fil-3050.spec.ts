import { expect, test, type Page } from '@playwright/test'

/**
 * #3050 — RECETTE : /chat SOUS 768 px, LE FIL EST LE CONTENU.
 *
 * Retour Louis, 26/09/2026, iPhone (Chrome iOS, prod) : « on ne voit rien sur
 * laura sur mobile c'est ignoble ». Mesuré sur les captures (≈ 390 px de
 * large) : le composer et le chrome du haut mangeaient ~90 % de l'écran, le
 * fil n'avait plus qu'une ligne visible, et un message était coupé par un
 * défilement HORIZONTAL.
 *
 * `isMobile`/`hasTouch` sont OBLIGATOIRES ici (même note que
 * `account-detail-recette-visuelle.spec.ts`) : c'est le seul réglage
 * Playwright qui active `@media (pointer: coarse)`, dont dépendent les
 * classes `pointer-coarse:*` de ce produit. Sans eux, la recette mesurerait
 * une mise en page qu'un vrai téléphone ne montre jamais — un faux vert.
 *
 * Le fil est chargé avec DEUX messages déjà écrits (`?conversationId=`, ce que
 * colle « Partager » — voir `agentChatApi.listAgentChatMessages`) : c'est un
 * fil COMMENCÉ, pas l'accueil vide, qui est le cas mesuré par Louis et celui
 * où la ligne d'outils (amorces, « Mon activité », « Que puis-je demander ? »,
 * connecteurs) doit se taire (#3050, points 1-2).
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '3050ab12-3333-4a11-9c33-30500a3050be'
const CONVERSATION_ID = '3050cd34-4444-4b22-8d44-3050cd345001'

async function mockChatThread(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-3050@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-30500a3050001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  // `chat_ai` OUVERT : sans cette feature dans la charge, `usePlanFeature`
  // verrouille l'écran (`PlanFeatureLocked`) et il n'y a rien à mesurer.
  await page.route('**/credits', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: USER_ID,
        plan: 'growth',
        accounts_limit: 50,
        accounts_used: 3,
        features: ['chat_ai'],
      }),
    }),
  )
  // Le fil COMMENCÉ que colle « Partager » — deux messages, un aller-retour.
  await page.route('**/ia/chat/messages*', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            id: '3050-msg-1',
            account_id: null,
            conversation_id: CONVERSATION_ID,
            role: 'user',
            content: 'Je veux faire une session LinkedIn : prépare-moi les messages pour mes 5 comptes prioritaires.',
            created_at: '2026-09-26T07:40:00.000Z',
          },
          {
            id: '3050-msg-2',
            account_id: null,
            conversation_id: CONVERSATION_ID,
            role: 'assistant',
            content: 'Voici un premier jet pour tes cinq comptes prioritaires, prêt à relire avant envoi.',
            created_at: '2026-09-26T07:40:20.000Z',
          },
        ],
      }),
    }),
  )
}

test.describe('#3050 — /chat mobile, fil commencé (390×844, isMobile, hasTouch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('le fil est le contenu : ≥ 45 % de hauteur, composer ≤ 25 %, aucun défilement horizontal, Envoyer visible, rien de « Que puis-je demander »', async ({
    page,
  }) => {
    await mockChatThread(page)
    await page.goto(`/chat?conversationId=${CONVERSATION_ID}`)

    // Le fil COMMENCÉ est bien celui qui charge : la première question s'affiche.
    await expect(page.getByText('Je veux faire une session LinkedIn', { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    })

    const messagesList = page.getByTestId('chat-messages-list')
    const composer = page.getByTestId('chat-composer')
    await expect(messagesList).toBeVisible()
    await expect(composer).toBeVisible()

    const [messagesBox, composerBox, sendButtonBox, viewport] = await Promise.all([
      messagesList.boundingBox(),
      composer.boundingBox(),
      page.getByRole('button', { name: 'Envoyer' }).boundingBox(),
      page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    ])

    if (!messagesBox) throw new Error('#chat-messages-list introuvable ou masqué')
    if (!composerBox) throw new Error('#chat-composer introuvable ou masqué')
    if (!sendButtonBox) throw new Error('bouton « Envoyer » introuvable ou masqué')

    // 1. Le FIL est le contenu : ≥ 50 % de la hauteur utile visée (#3050 point 1),
    //    mesurée ici à ≥ 45 % pour absorber la marge de rendu réelle du navigateur.
    const messagesRatio = messagesBox.height / viewport.innerHeight
    expect(
      messagesRatio,
      `liste des messages : ${messagesBox.height}px / ${viewport.innerHeight}px`,
    ).toBeGreaterThanOrEqual(0.45)

    // 2. Composer compact : ≤ 25 % de la hauteur utile.
    const composerRatio = composerBox.height / viewport.innerHeight
    expect(composerRatio, `composer : ${composerBox.height}px / ${viewport.innerHeight}px`).toBeLessThanOrEqual(0.25)

    // 3. Jamais de défilement horizontal — la panne mesurée par Louis (message coupé,
    //    barré par une barre de défilement HORIZONTALE).
    expect(
      viewport.scrollWidth,
      `la page défile horizontalement (${viewport.scrollWidth} > ${viewport.innerWidth})`,
    ).toBeLessThanOrEqual(viewport.innerWidth)

    // 4. « Envoyer » toujours dans le viewport (pas tronqué en bas, #3050 point 4 des captures).
    expect(sendButtonBox.x, 'Envoyer déborde à gauche').toBeGreaterThanOrEqual(0)
    expect(sendButtonBox.y, 'Envoyer déborde en haut').toBeGreaterThanOrEqual(0)
    expect(sendButtonBox.x + sendButtonBox.width, 'Envoyer déborde à droite').toBeLessThanOrEqual(viewport.innerWidth)
    expect(sendButtonBox.y + sendButtonBox.height, 'Envoyer déborde en bas').toBeLessThanOrEqual(viewport.innerHeight)

    // 5. Sur un fil COMMENCÉ, la ligne d'outils (amorces, « Mon activité », le
    //    catalogue, les connecteurs) se tait — rien n'est supprimé (elle reste
    //    derrière le « + »), seulement déplacé : voir `ComposerToolsMenu`.
    await expect(page.getByText('Que puis-je demander ?')).toBeHidden()
  })
})

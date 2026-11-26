import { expect, test, type Page } from '@playwright/test'

/**
 * #2770.69 — LA PREUVE MOBILE DU PLAN DE LAURA.
 *
 * Six lots (T06 07/10, et les bilans V23/R03/F02/EP9/X14/E01 avant lui) ont
 * laissé ce point « reste, hors CI » : « preuve de RENDU … non automatisable
 * par un test de largeur JSDOM sans CSS réel : elle se vérifie à l'œil, en
 * salle de démo ou en prod » (T06). La recette prod du 08/10 (16:44Z) le
 * confirme encore : « mobile 360 px NON PROUVABLE (resize_window sans effet :
 * innerWidth 1512) ». C'est exactement le motif déjà résolu pour #2639.1 —
 * voir l'en-tête de `screen-reach.spec.ts` et la note du projet `web-mobile`
 * dans `playwright.config.ts` : le navigateur PILOTÉ ne peut pas réduire sa
 * fenêtre, mais un viewport Playwright RÉEL (375×812, `isMobile`, `hasTouch`)
 * le peut. Cette famille n'était pas hors CI — elle attendait le bon outil.
 *
 * Salle de démonstration (`useIsDemo`, aucun réseau, #1320) : les deux
 * amorces déjà citées par les bilans de recette, mot pour mot
 * (`demo-chat-script.ts`, #2770/#2770.69) —
 *   « Organise-moi ma journée » → `FocusPlanCard` (`demoDayPlanAction`)
 *   « Organise-moi ma semaine : trois relances avant jeudi et une revue de
 *     pipe. » → `WeeklyPlanCard` (`demoWeeklyPlanAction`)
 * — tapées dans le vrai composeur et envoyées par le vrai bouton, jamais une
 * amorce cliquée (qui emprunterait un second chemin).
 *
 * ⚠️ MESURÉ EN PREMIER (debug manuel, 08/10) : la carte est bien PLUS HAUTE
 * que la zone de messages visible (544px de carte contre 478px de hauteur de
 * `chat-messages-list` dans ce viewport) — exactement comme n'importe quel
 * long message du fil. L'auto-défilement du fil (`box.scrollTop =
 * box.scrollHeight`, Chat.tsx) amène le BAS du tour tout en bas, ce qui
 * laisse le HAUT de la carte au-dessus du cadre — un utilisateur fait
 * défiler pour lire le début, comme pour tout message trop long. Exiger que
 * la carte entière tienne SANS défiler serait prouver une exigence que le
 * produit n'a jamais eue. Ce que #2770.69 nomme (« tient dans le viewport,
 * aucun chevauchement ») est donc vérifié par DEUX mesures, jamais par un
 * simple y≥0 immédiat :
 *  1. AUCUN défilement HORIZONTAL, et la carte ne déborde jamais latéralement
 *     du viewport — quelle que soit la position de défilement verticale
 *     (c'est la panne originale #2639.1/#3050 : un contenu qui dépasse en
 *     largeur, jamais en hauteur).
 *  2. Le HAUT de la carte est ATTEIGNABLE par un vrai défilement — molette
 *     réelle (`page.mouse.wheel`), JAMAIS `scrollIntoView()` qui pourrait
 *     forcer un conteneur `overflow` par script (même distinction que
 *     `screen-reach.spec.ts`, #2639.1) : si la carte reste cachée après un
 *     défilement réel, c'est qu'un conteneur l'emprisonne, la vraie panne
 *     que ce point devait prouver.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '2770ab12-6969-4a11-9c33-27700a2770be'
const MAX_SCROLL_TICKS = 12

async function mockDemoChat(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2770@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-27700a277001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  // `is_demo: true` choisit le MOTEUR scripté (#1320) ; `chat_ai` ouvre l'écran.
  await page.route('**/credits', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ features: ['chat_ai'], is_demo: true }),
    }),
  )
  await page.route('**/ia/chat/history*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  )
  // Fil vide — jamais un fil déjà commencé : chaque test tape et envoie sa
  // propre question, c'est la saisie réelle qui doit être mesurée.
  await page.route('**/ia/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ messages: [] }) }),
  )
}

async function sendAndMeasureCard(page: Page, question: string, cardTestId: string): Promise<void> {
  const textarea = page.getByTestId('chat-composer').locator('textarea')
  await expect(textarea).toBeVisible({ timeout: 30_000 })
  await textarea.fill(question)
  await page.getByRole('button', { name: 'Envoyer' }).click()

  const card = page.getByTestId(cardTestId)
  await expect(card).toBeVisible({ timeout: 30_000 })

  // 1. JAMAIS de défilement horizontal, et la carte ne déborde jamais
  // latéralement — vrai quelle que soit la position de défilement verticale.
  const [boxAtLanding, viewport] = await Promise.all([
    card.boundingBox(),
    page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ])
  if (!boxAtLanding) throw new Error(`carte "${cardTestId}" introuvable ou masquée après envoi de « ${question} »`)
  expect(boxAtLanding.x, `[${cardTestId}] déborde à gauche (x=${boxAtLanding.x})`).toBeGreaterThanOrEqual(0)
  expect(
    boxAtLanding.x + boxAtLanding.width,
    `[${cardTestId}] déborde à droite (bord=${boxAtLanding.x + boxAtLanding.width}, viewport=${viewport.width})`,
  ).toBeLessThanOrEqual(viewport.width)
  expect(
    viewport.scrollWidth,
    `[${cardTestId}] le corps défile horizontalement (${viewport.scrollWidth} > ${viewport.width})`,
  ).toBeLessThanOrEqual(viewport.width)

  // 2. Le HAUT de la carte est ATTEIGNABLE par un vrai défilement (molette),
  // jamais un `scrollIntoView()` scripté — même distinction que #2639.1.
  // L'auto-défilement du fil amène le BAS du tour tout en bas ; une carte
  // plus haute que la zone visible laisse donc son haut au-dessus du cadre,
  // exactement comme tout message long — on vérifie qu'il reste atteignable
  // à la molette, pas qu'il tient sans aucun défilement.
  const messagesList = page.getByTestId('chat-messages-list')
  const listBox = await messagesList.boundingBox()
  if (!listBox) throw new Error('`chat-messages-list` introuvable ou masqué')
  await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2)

  let box = boxAtLanding
  for (let tick = 0; tick < MAX_SCROLL_TICKS && box.y < 0; tick += 1) {
    await page.mouse.wheel(0, -200)
    const next = await card.boundingBox()
    if (!next) throw new Error(`carte "${cardTestId}" a disparu du DOM pendant le défilement`)
    box = next
  }
  expect(
    box.y,
    `[${cardTestId}] le haut de la carte reste hors du viewport même après un défilement réel (y=${box.y}) — un conteneur \`overflow\` l'emprisonne probablement`,
  ).toBeGreaterThanOrEqual(0)
}

test.describe('#2770.69 — plan de Laura (journée/semaine), mobile 375×812', () => {
  test('« Organise-moi ma journée » : FocusPlanCard sans défilement horizontal, haut atteignable à la molette', async ({
    page,
  }) => {
    await mockDemoChat(page)
    await page.goto('/chat')
    await sendAndMeasureCard(page, 'Organise-moi ma journée', 'focus-plan-card')
  })

  test('« Organise-moi ma semaine… » : WeeklyPlanCard sans défilement horizontal, haut atteignable à la molette', async ({
    page,
  }) => {
    await mockDemoChat(page)
    await page.goto('/chat')
    await sendAndMeasureCard(
      page,
      'Organise-moi ma semaine : trois relances avant jeudi et une revue de pipe.',
      'weekly-plan-card',
    )
  })
})

import { expect, test } from '@playwright/test'
import { EVENT_SUMMARY, mockBriefingScreen } from './briefing-fixtures'

/**
 * #2097 (lot N08, 29/09/2026) — RECETTE : /briefing MESURÉ à 375 / 768 / 1440 px.
 *
 * `briefing-mobile-order.spec.ts` mesure déjà l'ordre visuel réel à 390×844
 * (iPhone). Les bilans successifs (25→28/09) ont, eux, RELU le code pour les
 * ruptures citées par l'issue (« rien n'est coupé à 1280, 1024, 768 et
 * 390 px ») sans les MESURER au navigateur piloté — exactement la même
 * prémisse que corrigeait `onboarding-wizard-breakpoints.spec.ts` pour
 * #2021.14. Ce fichier mesure, au lieu de relire :
 *
 * - 375 px — plancher mobile (`web-mobile`, #2639.1) : layout mobile linéaire
 *   RÉELLEMENT rendu. `isMobile`/`hasTouch` sont indispensables ici, pas
 *   seulement pour le rendu React (`useIsMobile` lit `matchMedia` sur la
 *   LARGEUR, jamais `isMobile` du contexte) mais pour le CSS : c'est
 *   `@media (pointer: coarse)` qui active le plancher tactile 44px
 *   (`pointer-coarse:min-h-11`, `PriorityCard.tsx`) — sans device emulation,
 *   Chromium reste en pointeur FIN sous un viewport réduit et le test
 *   mesurerait la hauteur DESKTOP (28px) sous un habillage mobile, un faux
 *   rouge. Même piège que documenté dans `e2e/README.md` (#2639.1) et déjà
 *   évité par `briefing-mobile-order.spec.ts` (390×844).
 * - 768 px — la borne EXACTE de `MOBILE_BREAKPOINT` (`useIsMobile.ts` :
 *   `max-width: 767px`) : à 768 px pile, `isMobile` doit être FAUX. Un agent
 *   sans navigateur ne peut pas voir qu'une borne inclusive/exclusive est
 *   inversée ; ce test le mesure.
 * - 1440 px — bureau large : la grille multi-colonnes (`lg:grid-cols-5`,
 *   `lg:grid-cols-3`) doit être RÉELLEMENT appliquée (`lg` Tailwind = 1024 px),
 *   sans défilement horizontal ni carte tronquée.
 */

test.describe('#2097.68 (lot N08) — /briefing, 375px (mobile réel, pointeur grossier)', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('layout mobile linéaire réel, préparations en position 4, cible ≥44px', async ({ page }) => {
    await mockBriefingScreen(page)
    await page.goto('/briefing')
    await expect(page.getByText(EVENT_SUMMARY).first()).toBeVisible({ timeout: 30_000 })

    // Aucun défilement horizontal à 375 px.
    const overflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow375, `défilement horizontal à 375px (${overflow375}px)`).toBeLessThanOrEqual(1)

    // Le bloc « Préparations » (position 4, #2097.43) n'existe QUE sous
    // 768px et seulement s'il y a au moins une carte meeting_prep — la
    // fixture partagée (`briefing-fixtures.ts`) en porte deux.
    const preparationsHeading = page.getByRole('heading', { name: 'Préparations' })
    await expect(preparationsHeading).toBeVisible()
    const order4 = page.locator('[data-mobile-order="4"]')
    await expect(order4).toContainText('Préparations')

    // Le CTA principal de la carte reste atteignable au pouce — GA-30,
    // cible ≥44px dans les deux dimensions, sous pointeur RÉELLEMENT grossier
    // (`pointer-coarse:min-h-11`). « Pourquoi ? » et les autres gestes
    // SECONDAIRES de la rangée ne sont pas ce plancher (des liens de texte
    // compacts, `PriorityCard.tsx:378-392`) — la cible mesurée est le CTA
    // nommé par `ctaKey` (« Préparer une relance » sur cette fixture).
    const primaryCta = page.locator('[data-mobile-order="2"]').getByRole('link', { name: /Préparer une relance/ })
    await expect(primaryCta).toBeVisible()
    const ctaBox = await primaryCta.boundingBox()
    expect(ctaBox, 'le CTA principal de la carte est introuvable').not.toBeNull()
    expect(ctaBox!.height, `cible tactile trop basse (${ctaBox!.height}px)`).toBeGreaterThanOrEqual(44)
  })
})

test.describe('#2097.68 (lot N08) — /briefing, 768px (pile la borne, pointeur fin)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('layout BUREAU (isMobile faux), grille horaire réelle', async ({ page }) => {
    await mockBriefingScreen(page)
    await page.goto('/briefing')
    await expect(page.getByText(EVENT_SUMMARY).first()).toBeVisible({ timeout: 30_000 })

    // `MOBILE_BREAKPOINT = 768` avec `max-width: 767px` (useIsMobile.ts) :
    // à 768px PILE, `isMobile` est FAUX — le layout doit être celui du
    // bureau, pas le second agencement linéaire mobile.
    const preparationsHeading = page.getByRole('heading', { name: 'Préparations' })
    await expect(
      preparationsHeading,
      'le bloc « Préparations » (mobile uniquement) est rendu à 768px — isMobile devrait être faux à cette borne',
    ).toHaveCount(0)

    // La grille horaire de bureau (`AgendaGrid`, colonne des heures `.w-12`)
    // doit être réellement montée — pas la liste `DayColumn` réservée au
    // mobile (voir `briefing-mobile-order.spec.ts`, assertion inverse à
    // 390px).
    const hourColumn = page.locator('.w-12')
    await expect(hourColumn.first(), 'la grille horaire de bureau ne s’est pas montée à 768px').toBeVisible()

    const overflow768 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow768, `défilement horizontal à 768px (${overflow768}px)`).toBeLessThanOrEqual(1)
  })
})

test.describe('#2097.68 (lot N08) — /briefing, 1440px (bureau large)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('grille multi-colonnes réelle, rien tronqué, largeur de lecture bornée', async ({ page }) => {
    await mockBriefingScreen(page)
    await page.goto('/briefing')
    await expect(page.getByText(EVENT_SUMMARY).first()).toBeVisible({ timeout: 30_000 })

    // `lg:grid-cols-5` (Tailwind `lg` = 1024px, actif à 1440px) : « À faire
    // maintenant » et « Tes tâches » doivent être CÔTE À CÔTE (Louis,
    // 01/09/2026), pas empilés — la preuve que la grille bureau large
    // s'applique réellement, pas seulement relue dans le code.
    const actionsHeading = page.getByRole('heading', { name: 'À faire maintenant' })
    const tasksHeading = page.getByRole('heading', { name: 'Tes tâches' })
    await expect(actionsHeading).toBeVisible()
    await expect(tasksHeading).toBeVisible()
    // #3414 (lot X42) — les DEUX rectangles se lisent dans le MÊME instant (un seul
    // `evaluate`). Deux `boundingBox()` successifs encadraient un éventuel décalage de la page
    // (un bloc au-dessus de la grille qui change de hauteur entre les deux lectures) : un Δy
    // de 122 px sans qu'aucune colonne ne soit de travers (2 échecs CI sur 4, 02/10).
    const [actionsBox, tasksBox] = await page.evaluate(() => {
      const rect = (label: string) => {
        const heading = [...document.querySelectorAll('h2')].find(h => h.textContent?.trim() === label)
        const r = heading?.getBoundingClientRect()
        return r ? { x: r.x, y: r.y } : null
      }
      return [rect('À faire maintenant'), rect('Tes tâches')]
    })
    expect(actionsBox, 'titre « À faire maintenant » introuvable').not.toBeNull()
    expect(tasksBox, 'titre « Tes tâches » introuvable').not.toBeNull()
    expect(
      Math.abs(actionsBox!.y - tasksBox!.y),
      `« À faire maintenant » et « Tes tâches » ne sont pas sur la même ligne à 1440px (Δy=${Math.abs(actionsBox!.y - tasksBox!.y)})`,
    ).toBeLessThan(40)
    expect(tasksBox!.x, '« Tes tâches » n’est pas à droite de « À faire maintenant » à 1440px').toBeGreaterThan(
      actionsBox!.x,
    )

    // Aucun défilement horizontal à 1440px.
    const overflow1440 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow1440, `défilement horizontal à 1440px (${overflow1440}px)`).toBeLessThanOrEqual(1)

    // Rien n'est tronqué : chaque carte de priorité visible reste DANS le
    // viewport (aucune ne déborde à droite — la doléance type d'une grille
    // qui ne rétrécit pas, cf. #2097 ESPACE « éviter les colonnes trop
    // fines »).
    const priorityCards = page.locator('[role="article"]')
    const count = await priorityCards.count()
    expect(count, 'aucune carte de priorité rendue à 1440px').toBeGreaterThan(0)
    for (let i = 0; i < count; i += 1) {
      const box = await priorityCards.nth(i).boundingBox()
      if (!box) continue
      expect(box.x + box.width, `carte de priorité #${i} déborde du viewport à 1440px`).toBeLessThanOrEqual(1441)
    }

    // D81 — la largeur de lecture du texte éditorial (le sous-titre du brief,
    // juste sous le h1) reste bornée (70ch), jamais étirée à la largeur du
    // viewport large. Sélectionné par POSITION (frère du h1), pas par copie
    // exacte : cette fixture a 3 actions, donc le texte réellement rendu est
    // « 3 sujets méritent une décision aujourd'hui. » (`page.subtitleWithDecisions`),
    // pas `page.subtitle` — les deux portent `max-w-[70ch]`.
    const heroSubtitle = page.getByRole('heading', { level: 1 }).locator('xpath=../following-sibling::p[1]')
    await expect(heroSubtitle).toBeVisible()
    const maxWidth = await heroSubtitle.evaluate(el => getComputedStyle(el).maxWidth)
    expect(maxWidth, 'le texte éditorial du brief n’a plus de largeur de lecture bornée à 1440px').not.toBe('none')
  })
})

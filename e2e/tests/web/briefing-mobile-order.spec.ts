import { expect, test } from '@playwright/test'
import { EVENT_SUMMARY, mockBriefingScreen } from './briefing-fixtures'

/**
 * #2097 (correctif du 26/09) — RECETTE : L'ORDRE MOBILE RÉEL DE /briefing.
 *
 * Mesuré sur iPhone en prod le 26/09 07:46 : l'ordre visuel réel ne suivait
 * PAS les `data-mobile-order` posés sur chaque section — aucune règle CSS
 * `order` ne les lisait, et le DOM sous 768px était le même qu'au bureau,
 * retombé en colonne unique dans l'ordre d'écriture. `BriefingPage.test.tsx`
 * (vitest) vérifie déjà que les marqueurs `data-mobile-order` apparaissent
 * dans le bon ordre DANS LE DOM ; ce test-ci va plus loin et mesure la
 * position VISUELLE réelle (`getBoundingClientRect().top`) au viewport
 * 390×844 avec `isMobile`/`hasTouch` — le seul réglage qui active
 * `@media (pointer: coarse)` (voir `screen-reach.spec.ts`) et donc le rendu
 * mobile réel, plutôt qu'un habillage desktop sous une fenêtre réduite.
 *
 * Même patron que `account-detail-recette-visuelle.spec.ts` : la session et
 * les appels dont l'écran a besoin sont simulés ; `apiFetch` (`lib/api.ts`)
 * ne valide rien au runtime (juste un cast TypeScript), donc les corps
 * simulés portent les champs LUS par l'écran, pas le schéma zod complet.
 *
 * Le patron réseau (`mockBriefingScreen`) vit désormais dans
 * `briefing-fixtures.ts`, partagé avec `briefing-responsive-breakpoints.spec.ts`
 * (#2097.68) — Playwright refuse qu'un fichier de test en importe un autre.
 */

test.describe('#2097 (correctif du 26/09) — /briefing, ordre mobile RÉEL', () => {
  // 390×844 (iPhone 12/13/14) avec isMobile/hasTouch : seul réglage qui active
  // `@media (pointer: coarse)`, donc le rendu mobile réel de la page.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('l’ordre VISUEL suit 2,1,3→9 (#4297) puis les sources en dernier, sans défilement horizontal, agenda en liste', async ({
    page,
  }) => {
    await mockBriefingScreen(page)
    await page.goto('/briefing')

    // La page a fini de charger : le rendez-vous simulé est visible.
    await expect(page.getByText(EVENT_SUMMARY).first()).toBeVisible({ timeout: 30_000 })

    // ─── 1. L'ORDRE VISUEL RÉEL, position par position (pas l'ordre du DOM
    // ni celui des données — `getBoundingClientRect().top` de chaque section,
    // ce qui aurait mesuré la panne : les marqueurs existaient déjà, mais
    // rien ne les rendait vrais à l'écran). ───
    // #4297 (F2-FIX, recette prod du 20/10) : « prochain rendez-vous » (1), les décisions
    // et les modes rapides ne OUVRENT plus la page — la première rangée (ici « À faire
    // maintenant », 2) passe devant, `dayHead` suit juste après. Ordre décidé : 2, 1, 3→9.
    const tops: number[] = []
    for (const position of ['2', '1', '3', '4', '5', '6', '7', '8', '9']) {
      const box = await page.locator(`[data-mobile-order="${position}"]`).first().boundingBox()
      expect(box, `position ${position} : introuvable ou invisible à l'écran`).not.toBeNull()
      tops.push(box!.y)
    }
    // « Sources utilisées aujourd'hui » : TOUJOURS en dernier, repliée.
    const sourcesToggle = page.getByRole('button', { name: /Sources utilisées aujourd.hui/ })
    await expect(sourcesToggle).toBeVisible()
    const sourcesBox = await sourcesToggle.boundingBox()
    expect(sourcesBox, 'le bandeau des sources est introuvable').not.toBeNull()
    tops.push(sourcesBox!.y)

    for (let i = 1; i < tops.length; i += 1) {
      expect(
        tops[i],
        `rang ${i === 9 ? 'sources' : i + 1} (y=${tops[i]}) n'est pas SOUS la précédente (y=${tops[i - 1]}) — ordre mesuré : ${tops.join(', ')}`,
      ).toBeGreaterThan(tops[i - 1]!)
    }
    // Le tiroir des sources reste FERMÉ par défaut : son détail n'est pas
    // encore dans le DOM (même patron que `SourcesDisclosure`, vitest).
    expect(await page.getByText('Gérer les connexions').count()).toBe(0)

    // ─── 2. AUCUN DÉFILEMENT HORIZONTAL. ───
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth, `la page défile horizontalement (${scrollWidth} > ${innerWidth})`).toBeLessThanOrEqual(
      innerWidth,
    )

    // ─── 3. L'AGENDA EST UNE LISTE, JAMAIS LA GRILLE HORAIRE VIDE. ───
    // `.w-12` est la colonne des heures d'`AgendaGrid` (`shrink-0`, unique à ce
    // composant dans le dépôt) : sa présence prouverait que la grille de bureau
    // a quand même été montée sous 768px.
    const agendaSection = page.locator('[data-mobile-order="3"]')
    expect(
      await agendaSection.locator('.w-12').count(),
      'la grille horaire (colonne des heures) a été rendue sur mobile',
    ).toBe(0)
    // La liste montre bien le rendez-vous par HEURE + TITRE.
    await expect(agendaSection.getByText(EVENT_SUMMARY)).toBeVisible()
  })
})

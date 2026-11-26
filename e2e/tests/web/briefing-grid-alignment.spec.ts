import { expect, test, type Page, type Route } from '@playwright/test'
import { EVENT_SUMMARY, mockBriefingScreen } from './briefing-fixtures'

/**
 * #3414 (lot X42, 02/10) — « À faire maintenant » et « Tes tâches » restent sur la même ligne, ET
 * l'écran ne bouge pas, quel que soit l'ordre d'arrivée des réponses.
 *
 * Cause trouvée : les deux titres n'ont jamais été de travers (ce sont deux `<Section>` d'une même
 * ligne de grille, titre en tête de chacune). Ce qui bougeait, c'est TOUT ce qui est au-dessus de
 * la grille — la carte du maillon faible (retirée de /briefing le 14/10, refonte Pilotage L1) faisait 76 px en chargement, 52 px en échec (−24 px, puis
 * la barre d'activation réservée −98 px quand sa requête échouait après les reprises) — et le test
 * lisait les deux titres à deux instants, de part et d'autre du saut. Ici, une réponse RETARDÉE
 * (déterministe, pas un `sleep`) rend l'état intermédiaire observable.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const HEADINGS = ['À faire maintenant', 'Tes tâches'] as const

async function headingYs(page: Page): Promise<number[]> {
  return page.evaluate(
    labels => {
      return labels.map(label => {
        const h = [...document.querySelectorAll('h2')].find(e => e.textContent?.trim() === label)
        return h ? Math.round(h.getBoundingClientRect().y) : Number.NaN
      })
    },
    [...HEADINGS],
  )
}

/** Retient la réponse jusqu'à `release()` — l'état intermédiaire dure autant que le test le veut. */
function gate(page: Page, pattern: string) {
  let release!: () => void
  const opened = new Promise<void>(resolve => {
    release = resolve
  })
  const pending: Route[] = []
  void page.route(pattern, async route => {
    pending.push(route)
    await opened
    await route.fallback()
  })
  return { release, held: () => pending.length }
}

for (const [name, pattern] of [
  ['les tâches', '**/tasks**'],
  ['les actions', '**/briefing/actions'],
  ['la barre d’activation', '**/onboarding/activation'],
] as const) {
  test(`titres alignés et immobiles tant que ${name} n’ont pas répondu`, async ({ page }) => {
    await mockBriefingScreen(page)
    const held = gate(page, pattern)
    await page.goto('/briefing')
    await expect(page.getByText(EVENT_SUMMARY).first()).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => held.held(), { message: 'la requête retardée n’est pas partie' }).toBeGreaterThan(0)

    const [actionsY, tasksY] = await headingYs(page)
    expect(Math.abs(actionsY - tasksY), `Δy en attente de ${name}`).toBeLessThan(4)

    held.release()
    await expect(page.getByRole('heading', { name: 'Tes tâches' })).toBeVisible()
    // Laisse la page se re-rendre avec la réponse, puis compare le même couple de titres.
    await page.waitForTimeout(300)
    const [actionsAfter, tasksAfter] = await headingYs(page)
    expect(Math.abs(actionsAfter - tasksAfter), `Δy après l’arrivée de ${name}`).toBeLessThan(4)
    expect(
      Math.abs(actionsAfter - actionsY),
      `l’écran a bougé de ${Math.abs(actionsAfter - actionsY)} px à l’arrivée de ${name}`,
    ).toBeLessThan(4)
  })
}

test('les tâches en ÉCHEC ne font pas bouger l’écran (chargement → erreur)', async ({ page }) => {
  await mockBriefingScreen(page)
  // Dernier `route` posé = premier consulté : l'échec prend la place du mock 200 du fixture.
  // La réponse en échec est RETENUE jusqu'à `release()` : l'état « chargement » dure autant que le
  // test le veut (sans cela il passe trop vite pour être observé, et l'attente rougit au hasard).
  let release!: () => void
  const opened = new Promise<void>(resolve => {
    release = resolve
  })
  let held = 0
  await page.route('**/tasks**', async route => {
    held += 1
    await opened
    await route.fulfill({ status: 500, body: '{}' })
  })
  await page.goto('/briefing')
  await expect(page.getByText(EVENT_SUMMARY).first()).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => held, { message: 'la requête retardée n’est pas partie' }).toBeGreaterThan(0)
  const [loadingY] = await headingYs(page)
  release()
  await expect(page.getByRole('heading', { name: 'Tes tâches' })).toBeVisible()
  await page.waitForTimeout(300)
  const [errorY] = await headingYs(page)
  expect(
    Math.abs(errorY - loadingY),
    `l’écran a bougé de ${Math.abs(errorY - loadingY)} px au passage chargement → erreur`,
  ).toBeLessThan(4)
})

import { expect, test, type Page } from '@playwright/test'

/**
 * #2437.15 (épopée #2863) — outillage QA i18n, volet CAPTURES VISUELLES
 * AUTOMATISÉES PAR LANGUE.
 *
 * Le risque que cible ce test : une traduction EN peut rester plus longue
 * que le FR (ou l'inverse) sur une UI dimensionnée pour une seule langue, et
 * déborder — un débordement qu'aucun test de clé (`parity.test.ts`) ni de
 * pseudo-locale (`pseudo-locale.test.ts`, qui gonfle le texte mais ne rend
 * rien) ne peut voir : il faut un VRAI rendu, dans un VRAI viewport, dans
 * les DEUX langues.
 *
 * Même patron de mesure que `account-detail-recette-visuelle.spec.ts`
 * (`#2117.84`) — scrollWidth vs innerWidth, texte vs fond — appliqué ici au
 * paramètre qui manquait : la LANGUE. Écrans du tier 2 (`web`, non
 * authentifié, backend mort — voir `playwright.config.ts`) : aucun mock
 * réseau à maintenir, donc aucune fixture qui périme.
 *
 * Langue posée par `bellum_lang` en `localStorage` AVANT tout script, comme
 * `login.spec.ts` — c'est le seul mécanisme de langue de l'app avant
 * connexion (pas de sélecteur visible sur ces écrans).
 */

const LANGUAGE_STORAGE_KEY = 'bellum_lang'

type Viewport = { label: string; width: number; height: number }

const VIEWPORTS: Viewport[] = [
  { label: 'desktop 1280px', width: 1280, height: 900 },
  { label: 'tablette 820px', width: 820, height: 1180 },
  { label: 'mobile 375px', width: 375, height: 812 },
]

type Screen = { path: string; label: string; heading: { fr: string; en: string } }

const SCREENS: Screen[] = [
  { path: '/login', label: 'connexion', heading: { fr: 'Se connecter', en: 'Sign in' } },
  { path: '/signup', label: 'création de compte', heading: { fr: 'Créer un compte', en: 'Create an account' } },
  {
    path: '/forgot-password',
    label: 'mot de passe oublié',
    heading: { fr: 'Réinitialiser ton mot de passe', en: 'Reset your password' },
  },
]

type Measurement = { scrollWidth: number; innerWidth: number; invisibleText: string[] }

/** Tout se mesure DANS la page, jamais une classe lue — même fonction que
 *  `account-detail-recette-visuelle.spec.ts`. */
async function measure(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const isRenderedColor = (value: string) =>
      value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)' && !/^rgba\([^)]*,\s*0\)$/.test(value)

    const effectiveBackground = (element: Element): string => {
      let current: Element | null = element
      while (current) {
        const bg = getComputedStyle(current).backgroundColor
        if (isRenderedColor(bg)) return bg
        current = current.parentElement
      }
      return getComputedStyle(document.body).backgroundColor
    }

    const invisibleText: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim()
      if (!text) continue
      const parent = node.parentElement
      if (!parent) continue
      const style = getComputedStyle(parent)
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (style.color === effectiveBackground(parent)) invisibleText.push(text.slice(0, 60))
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      invisibleText,
    }
  })
}

for (const screen of SCREENS) {
  for (const lang of ['fr', 'en'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`i18n visuel — ${screen.label}, ${lang}, ${viewport.label} : pas de débordement, texte lisible`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        if (lang === 'en') {
          await page.addInitScript(key => window.localStorage.setItem(key, 'en'), LANGUAGE_STORAGE_KEY)
        }
        await page.goto(screen.path)

        await expect(page.getByRole('heading', { name: screen.heading[lang] })).toBeVisible()

        const { scrollWidth, innerWidth, invisibleText } = await measure(page)

        expect(
          scrollWidth,
          `[${screen.label}/${lang}/${viewport.label}] débordement horizontal : scrollWidth=${scrollWidth} > innerWidth=${innerWidth} — une traduction plus longue que l'autre langue déborde probablement`,
        ).toBeLessThanOrEqual(innerWidth)

        expect(
          invisibleText,
          `[${screen.label}/${lang}/${viewport.label}] texte partageant sa couleur avec son fond : ${invisibleText.join(', ')}`,
        ).toEqual([])
      })
    }
  }
}

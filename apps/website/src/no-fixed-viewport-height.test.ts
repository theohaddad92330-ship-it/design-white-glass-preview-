import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — §8 du design system BellumAI : « `dvh`, jamais `vh`.
 * `100vh` compte la barre d'adresse comme si elle n'existait pas : le bas de
 * l'écran passe sous le pli. » La garde GA-28 le tient déjà sur `apps/web`
 * (`apps/web/src/architecture`), mais `apps/website` n'a jamais eu
 * l'équivalent — trouvé ici sur trois écrans : `SiteLayout.tsx` (coque de
 * TOUTES les pages), `[locale]/not-found.tsx` et `[locale]/demo/page.tsx`, et
 * en style inline sur le 404 global (`app/not-found.tsx`).
 *
 * Elle lit tout `apps/website/src`, TSX et TS, et refuse :
 *  - les utilitaires Tailwind `h-screen` / `min-h-screen` / `max-h-screen`
 *    (ils calculent depuis `100vh`) ;
 *  - toute valeur `NNvh` littérale — classe arbitraire (`min-h-[70vh]`) ou
 *    style inline (`'100vh'`).
 * `dvh`/`svh`/`lvh` ne matchent JAMAIS ces motifs — ce sont les unités qui
 * remplacent `vh`, pas une variante à interdire.
 */

const WEBSITE_SRC = join(__dirname)

const SCREEN_HEIGHT_CLASS = /\b(?:min-h-screen|max-h-screen|h-screen)\b/
const RAW_VH_VALUE = /\d+(?:\.\d+)?vh\b/

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue // ce fichier compris
    out.push(full)
  }
  return out
}

function fixedViewportHeightOffenses(source: string): string[] {
  const offenses: string[] = []
  if (SCREEN_HEIGHT_CLASS.test(source)) offenses.push('screen-height-class')
  if (RAW_VH_VALUE.test(source)) offenses.push('raw-vh-value')
  return offenses
}

describe('apps/website — dvh, jamais vh (§8 du design system)', () => {
  const files = listSourceFiles(WEBSITE_SRC)

  it('LIT un corpus non vide — sinon la garde ne garde rien', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('SAIT DIRE NON — h-screen et une valeur vh littérale sont détectés', () => {
    expect(fixedViewportHeightOffenses('<main className="min-h-screen" />')).toContain('screen-height-class')
    expect(fixedViewportHeightOffenses('<section className="min-h-[70vh]" />')).toContain('raw-vh-value')
    expect(fixedViewportHeightOffenses("style={{ minHeight: '100vh' }}")).toContain('raw-vh-value')
  })

  it("n'attrape pas ce qu'elle ne vise pas — dvh, svh, lvh et vw passent", () => {
    expect(fixedViewportHeightOffenses('<main className="min-h-dvh" />')).toEqual([])
    expect(fixedViewportHeightOffenses("style={{ minHeight: '100dvh' }}")).toEqual([])
    expect(fixedViewportHeightOffenses('<div className="h-[100svh] max-h-[100lvh]" />')).toEqual([])
    // `vw` est une largeur, pas la hauteur que §8 vise.
    expect(fixedViewportHeightOffenses('<p className="text-[clamp(24px,3vw,34px)]" />')).toEqual([])
    // `w-screen` est une largeur — hors périmètre de cette garde.
    expect(fixedViewportHeightOffenses('<div className="w-screen" />')).toEqual([])
  })

  it('en vrai : aucun fichier du site ne fixe sa hauteur sur vh', () => {
    const offenders = files
      .map(file => ({
        path: relative(WEBSITE_SRC, file),
        offenses: fixedViewportHeightOffenses(readFileSync(file, 'utf8')),
      }))
      .filter(entry => entry.offenses.length > 0)
    expect(offenders, JSON.stringify(offenders)).toEqual([])
  })
})

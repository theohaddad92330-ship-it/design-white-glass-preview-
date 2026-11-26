import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — `Checkbox` et `PasswordField` (bouton œil) : leur zone
 * cliquable reste sous 44×44 px, y compris sous `(pointer: coarse)` (GA-30 /
 * GA-32), alors que le variant existe déjà (`apps/web/tailwind.config.ts`,
 * `addVariant('pointer-coarse', '@media (pointer: coarse)')` — le DOIGT, pas
 * la largeur d'écran).
 *
 * Le rendu VISIBLE ne doit pas bouger (une case à cocher de 44 px serait
 * disproportionnée à côté de son libellé) : la zone tactile s'élargit par un
 * `::after` invisible et positionné, un point que `Checkbox` visait déjà
 * (commentaire « hit zone élargie pour mobile/tactile ») sans jamais
 * fonctionner — un pseudo-élément sans `content` ne génère aucune boîte, donc
 * `after:-inset-x-3 after:-inset-y-2` ne s'appliquait à rien.
 *
 * Cette garde calcule la taille RÉELLE atteinte (boîte visible + les deux
 * bords de l'extension) à partir des utilitaires Tailwind lus dans le
 * source, plutôt que de comparer des chaînes exactes : une valeur qui
 * repasserait sous 44 px la fait échouer même si l'écriture de la classe
 * change de forme.
 */

const UI_SRC = join(__dirname, '..')

/** `n` d'une classe d'espacement Tailwind (échelle par défaut) → pixels : n × 4. */
function spacingToPx(token: string): number {
  return Number(token) * 4
}

/**
 * Extension totale (les deux bords) apportée par un `::after` élargi sous
 * `pointer-coarse`, sur l'axe demandé — cherche d'abord la forme spécifique à
 * l'axe (`pointer-coarse:after:-inset-x-N`), puis la forme générale
 * (`pointer-coarse:after:-inset-N`, qui vaut pour les deux axes). 0 si absente.
 */
function pointerCoarseAfterInsetPx(source: string, axis: 'x' | 'y'): number {
  const specific = source.match(new RegExp(`pointer-coarse:after:-inset-${axis}-([0-9.]+)`))
  if (specific) return spacingToPx(specific[1]) * 2
  const general = source.match(/pointer-coarse:after:-inset-([0-9.]+)(?!-)/)
  if (general) return spacingToPx(general[1]) * 2
  return 0
}

/** `content-['']` (ou équivalent) sur le `::after` — sans lui, aucune boîte n'est générée. */
function afterHasContent(source: string): boolean {
  return /after:content-\[/.test(source)
}

/** Côté (en pixels) d'une classe `size-N`. */
function sizeClassPx(source: string): number | null {
  const match = source.match(/(?:^|[\s'"])size-([0-9.]+)(?:[\s'"]|$)/)
  return match ? spacingToPx(match[1]) : null
}

/** Côté (en pixels) d'un couple `h-N w-N` identiques. */
function squareHwClassPx(source: string): number | null {
  const h = source.match(/(?:^|[\s'"])h-([0-9.]+)(?:[\s'"]|$)/)
  const w = source.match(/(?:^|[\s'"])w-([0-9.]+)(?:[\s'"]|$)/)
  if (!h || !w || h[1] !== w[1]) return null
  return spacingToPx(h[1])
}

describe('zone tactile ≥ 44×44 sous pointer-coarse — Checkbox, PasswordField', () => {
  it('Checkbox (packages/ui/src/components/checkbox.tsx) : ::after élargi atteint 44px sous pointer-coarse', () => {
    const source = readFileSync(join(UI_SRC, 'components/checkbox.tsx'), 'utf8')

    const base = sizeClassPx(source)
    expect(base, 'la classe size-N de la case visible').not.toBeNull()
    // visuel inchangé : la case visible reste 16px (size-4)
    expect(base).toBe(16)

    expect(afterHasContent(source), "le ::after a besoin de content-[''] pour générer une boîte").toBe(true)

    const reachX = (base as number) + pointerCoarseAfterInsetPx(source, 'x')
    const reachY = (base as number) + pointerCoarseAfterInsetPx(source, 'y')
    expect(reachX, `zone tactile horizontale atteinte : ${reachX}px`).toBeGreaterThanOrEqual(44)
    expect(reachY, `zone tactile verticale atteinte : ${reachY}px`).toBeGreaterThanOrEqual(44)
  })

  it('PasswordField (packages/ui/src/components/password-field.tsx) : bouton œil atteint 44px sous pointer-coarse', () => {
    const source = readFileSync(join(UI_SRC, 'components/password-field.tsx'), 'utf8')

    const base = squareHwClassPx(source)
    expect(base, 'la classe h-N w-N du bouton').not.toBeNull()
    // visuel inchangé : le bouton reste 28px (h-7 w-7), l'icône reste h-4 w-4
    expect(base).toBe(28)
    expect(source).toMatch(/<Icon className="h-4 w-4" \/>/)

    expect(afterHasContent(source), "le ::after a besoin de content-[''] pour générer une boîte").toBe(true)

    const reachX = (base as number) + pointerCoarseAfterInsetPx(source, 'x')
    const reachY = (base as number) + pointerCoarseAfterInsetPx(source, 'y')
    expect(reachX, `zone tactile horizontale atteinte : ${reachX}px`).toBeGreaterThanOrEqual(44)
    expect(reachY, `zone tactile verticale atteinte : ${reachY}px`).toBeGreaterThanOrEqual(44)
  })

  it('SAIT DIRE NON — une extension qui reste sous 44px est détectée', () => {
    const snippet = `className="size-4 after:absolute after:content-[''] pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-1"`
    const reach = (sizeClassPx(snippet) as number) + pointerCoarseAfterInsetPx(snippet, 'x')
    expect(reach).toBeLessThan(44)
  })

  it("n'attrape pas ce qu'elle ne vise pas — inset-x/inset-y ne matchent pas la forme générale", () => {
    const snippet = `pointer-coarse:after:-inset-x-3.5 pointer-coarse:after:-inset-y-3.5`
    // La forme générale (\`pointer-coarse:after:-inset-N\`) ne doit PAS
    // confondre "x-3.5" avec un nombre : "x" n'est pas un chiffre.
    expect(pointerCoarseAfterInsetPx(snippet, 'x')).toBe(28) // 3.5 * 4 * 2
    expect(pointerCoarseAfterInsetPx(snippet, 'y')).toBe(28)
  })
})

/**
 * Écart figma-sync — `CONTENT_BASE` (`page-gutter.ts`) n'avait aucune largeur
 * maximale : `w-full` sur un écran 2560/3440px étirait le contenu de la coque
 * `CustomerPage` sur toute la largeur, y compris les paragraphes de texte
 * suivi qui passent par ce conteneur avant d'atteindre `Text` (GA-34, 70ch).
 *
 * §5 du design system (D81) : listes/tableaux restent PLEINE LARGEUR, seul le
 * texte suivi est borné — donc `CONTENT_BASE` (qui enveloppe indifféremment
 * les deux) ne peut pas se borner à la largeur de lecture. La borne posée ici
 * est un PLAFOND d'ultra-large, choisi pour ne RIEN changer au rendu jusqu'à
 * 1920px (le point que le lot #ecarts-ux-design-system nomme explicitement) :
 * un contenu de ≤1920px ne rencontre jamais `max-w-[1920px]`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pageContentClassName } from '../components/page/page-gutter'

const SOURCE_PATH = join(__dirname, '../components/page/page-gutter.ts')

/** Plus petite largeur de plafond acceptée : ne doit jamais mordre sur 1920px. */
const MIN_CEILING_PX = 1920

function ceilingPx(classes: string): number | null {
  const match = classes.match(/max-w-\[(\d+)px\]/)
  return match ? Number(match[1]) : null
}

describe('page-gutter — CONTENT_BASE plafonne la largeur sur ultra-large', () => {
  it('pageContentClassName() porte un plafond de largeur ≥ 1920px', () => {
    const classes = pageContentClassName()
    const ceiling = ceilingPx(classes)
    expect(ceiling, `aucun max-w-[Npx] trouvé dans "${classes}"`).not.toBeNull()
    expect(ceiling as number).toBeGreaterThanOrEqual(MIN_CEILING_PX)
  })

  it('reste w-full et mx-auto — le rendu ≤1920px ne bouge pas, le plafond ne joue qu au-delà', () => {
    const classes = pageContentClassName().split(/\s+/)
    expect(classes).toContain('w-full')
    expect(classes).toContain('mx-auto')
  })

  it('un contentClassName appelant qui pose son propre max-w garde la main (comportement cn existant)', () => {
    const classes = pageContentClassName('max-w-[600px]')
    // tailwind-merge retient le DERNIER jeton max-w-* en conflit : celui de l'appelant.
    expect(ceilingPx(classes)).toBe(600)
  })

  it("le plafond vit dans page-gutter.ts, à l'endroit documenté (CONTENT_BASE)", () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    const contentBaseLine = source.match(/const CONTENT_BASE = '([^']*)'/)
    expect(contentBaseLine, 'la déclaration de CONTENT_BASE').not.toBeNull()
    const ceiling = ceilingPx(contentBaseLine?.[1] ?? '')
    expect(ceiling, `aucun max-w-[Npx] dans CONTENT_BASE : "${contentBaseLine?.[1]}"`).not.toBeNull()
    expect(ceiling as number).toBeGreaterThanOrEqual(MIN_CEILING_PX)
  })
})

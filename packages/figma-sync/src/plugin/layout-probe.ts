import tokensJson from '../../generated/tokens.json'
import type { FakeNode } from './fake-scene'

/**
 * Une mise en page APPROCHÉE de l'arbre du faux figma, pour les gardes de rendu
 * (`render-quality-*.test.ts`). Le faux figma ne calcule aucun pixel : on rejoue
 * ici, statiquement, les trois règles d'auto-layout qui font les défauts vus
 * dans Figma le 25/09/2026 :
 *
 * - un enfant FILL prend la largeur INTÉRIEURE de son parent (partagée avec ses
 *   frères FILL dans une rangée) ;
 * - un parent HUG a la largeur de ses enfants NON-FILL — un texte FILL posé
 *   dans une colonne HUG prend donc la largeur de son frère le plus large
 *   (« Ce/que/ces/régla/ges » sous un titre « Profil ») ;
 * - un texte se mesure à ~0,6 × sa taille par caractère.
 */

const CHAR = 0.6

const STYLE_SIZE = new Map(tokensJson.textStyles.map(t => [`S:text/${t.name}`, t.fontSize]))

/** La taille de police d'un texte (un style `text/*` du faux figma ne pose pas `fontSize` : lue dans les tokens). */
export const fontSizeOf = (n: FakeNode): number =>
  n.textStyleId ? (STYLE_SIZE.get(n.textStyleId) ?? 14) : Number(n.fontSize ?? 14)

type Sizing = 'FILL' | 'FIXED' | 'HUG'

function hSizing(n: FakeNode): Sizing {
  const parent = n.parent
  if (n.layoutSizingHorizontal === 'FILL') return 'FILL'
  if (parent && parent.layoutMode === 'HORIZONTAL' && n.layoutGrow === 1 && n.layoutPositioning !== 'ABSOLUTE')
    return 'FILL'
  if (n.type === 'TEXT') return n.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'HUG' : 'FIXED'
  if (n.layoutSizingHorizontal === 'FIXED') return 'FIXED'
  const mode = n.layoutMode as string | undefined
  if (!mode || mode === 'NONE') return 'FIXED'
  if (mode === 'HORIZONTAL') return n.primaryAxisSizingMode === 'FIXED' ? 'FIXED' : 'HUG'
  return n.counterAxisSizingMode === 'FIXED' ? 'FIXED' : 'HUG'
}

const shown = (n: FakeNode): boolean => n.visible && n.layoutPositioning !== 'ABSOLUTE'
const pads = (n: FakeNode): number => Number(n.paddingLeft ?? 0) + Number(n.paddingRight ?? 0)

/** La largeur que le contenu d'un nœud EXIGE (ses enfants FILL n'exigent que leur `minWidth`). */
function contentWidth(n: FakeNode): number {
  const own = typeof n.minWidth === 'number' ? n.minWidth : 0
  if (n.type === 'TEXT') {
    if (hSizing(n) === 'FILL') return own
    return n.textAutoResize === 'WIDTH_AND_HEIGHT' ? n.characters.length * fontSizeOf(n) * CHAR : n.width
  }
  const sizing = hSizing(n)
  if (sizing === 'FIXED') return n.width
  if (sizing === 'FILL') return own
  const kids = n.children.filter(shown).map(contentWidth)
  const row = n.layoutMode === 'HORIZONTAL' && n.layoutWrap !== 'WRAP'
  const content = row
    ? kids.reduce((a, b) => a + b, 0) + Number(n.itemSpacing ?? 0) * Math.max(kids.length - 1, 0)
    : Math.max(0, ...kids)
  return Math.max(own, pads(n) + content)
}

/** La largeur qu'un nœud OBTIENT dans son parent. */
function effectiveWidth(n: FakeNode, memo = new Map<FakeNode, number>()): number {
  const hit = memo.get(n)
  if (hit !== undefined) return hit
  let w: number
  const sizing = hSizing(n)
  const parent = n.parent
  if (sizing !== 'FILL' || !parent || parent.type === 'PAGE') w = contentWidth(n)
  else {
    const inner = effectiveWidth(parent, memo) - pads(parent)
    if (parent.layoutMode === 'HORIZONTAL' && parent.layoutWrap !== 'WRAP') {
      const siblings = parent.children.filter(shown)
      const fills = siblings.filter(c => hSizing(c) === 'FILL')
      const fixed = siblings.filter(c => hSizing(c) !== 'FILL').reduce((a, c) => a + contentWidth(c), 0)
      const gaps = Number(parent.itemSpacing ?? 0) * Math.max(siblings.length - 1, 0)
      w = (inner - fixed - gaps) / Math.max(fills.length, 1)
    } else w = inner
    const min = typeof n.minWidth === 'number' ? n.minWidth : 0
    const max = typeof n.maxWidth === 'number' ? n.maxWidth : Infinity
    w = Math.max(min, Math.min(max, w))
  }
  memo.set(n, w)
  return w
}

/** Caractères par ligne d'un texte qui passe à la ligne (`Infinity` pour un texte sur une ligne). */
export function charsPerLine(n: FakeNode, memo?: Map<FakeNode, number>): number {
  if (n.type !== 'TEXT' || n.textAutoResize === 'WIDTH_AND_HEIGHT') return Infinity
  return effectiveWidth(n, memo) / (fontSizeOf(n) * CHAR)
}

/** Les nœuds VISIBLES sous un cadre (un parent caché cache sa descendance). */
export function visibleDescendants(root: FakeNode): FakeNode[] {
  const out: FakeNode[] = []
  const visit = (n: FakeNode): void => {
    if (!n.visible) return
    out.push(n)
    for (const c of n.children) visit(c)
  }
  for (const c of root.children) visit(c)
  return out
}

/**
 * La largeur qu'un libellé sur UNE ligne obtient, moins celle qu'il exige : `< 0` = libellé coupé
 * (un onglet de segment tronqué à 1440, défaut H du 25/09/2026). Un texte qui passe à la ligne rend 0.
 */
export function labelShortfall(n: FakeNode, memo?: Map<FakeNode, number>): number {
  if (n.type !== 'TEXT') return 0
  if (hSizing(n) !== 'FILL' && n.textAutoResize === 'WIDTH_AND_HEIGHT') {
    // Un texte HUG : c'est le cadre défilant (rogné) le plus proche qui peut le couper.
    let up = n.parent
    while (up && up.overflowDirection !== 'HORIZONTAL') up = up.parent
    if (!up) return 0
    const kids = up.children.filter(shown).map(contentWidth)
    const row = up.layoutMode === 'HORIZONTAL'
    const need = row
      ? kids.reduce((a, b) => a + b, 0) + Number(up.itemSpacing ?? 0) * Math.max(kids.length - 1, 0)
      : Math.max(0, ...kids)
    return effectiveWidth(up, memo) - (pads(up) + need)
  }
  if (n.maxLines !== 1 && n.textTruncation !== 'ENDING') return 0
  return effectiveWidth(n, memo) - n.characters.length * fontSizeOf(n) * CHAR
}

/** La largeur minimale qu'un nœud exige (auto-layout statique : pas de rendu, la même règle que Figma). */
function requiredWidth(n: FakeNode): number {
  if (!n.visible || n.layoutPositioning === 'ABSOLUTE') return 0
  const own = typeof n.minWidth === 'number' ? n.minWidth : 0
  if (n.type === 'TEXT') {
    if (n.layoutSizingHorizontal === 'FILL') return own
    return n.textAutoResize === 'HEIGHT' ? n.width : n.characters.length * Number(n.fontSize ?? 12) * 0.5
  }
  if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE' || n.type === 'VECTOR')
    return n.layoutSizingHorizontal === 'FILL' ? own : n.width
  const mode = n.layoutMode as string | undefined
  const fixed =
    n.layoutSizingHorizontal === 'FIXED' ||
    (n.layoutSizingHorizontal !== 'FILL' &&
      ((mode === 'HORIZONTAL' && n.primaryAxisSizingMode === 'FIXED') ||
        (mode === 'VERTICAL' && n.counterAxisSizingMode === 'FIXED') ||
        !mode ||
        mode === 'NONE'))
  if (fixed) return n.width
  // Un cadre qui défile en largeur (`overflow-x-auto`) n'impose pas son contenu à son parent.
  if (n.overflowDirection === 'HORIZONTAL') return own
  const kids = n.children.filter(c => c.visible).map(requiredWidth)
  const pads = Number(n.paddingLeft ?? 0) + Number(n.paddingRight ?? 0)
  const content =
    mode === 'HORIZONTAL' && n.layoutWrap !== 'WRAP'
      ? kids.reduce((a, b) => a + b, 0) + Number(n.itemSpacing ?? 0) * Math.max(kids.length - 1, 0)
      : Math.max(0, ...kids)
  return Math.max(own, pads + content)
}

/** Les enfants qui débordent d'un parent à largeur fixe. */
export function overflows(root: FakeNode): string[] {
  const out: string[] = []
  const visit = (n: FakeNode, path: string): void => {
    if (!n.visible) return
    const mode = n.layoutMode as string | undefined
    if (n.type !== 'TEXT' && mode && mode !== 'NONE' && n.overflowDirection !== 'HORIZONTAL') {
      const inner = n.width - Number(n.paddingLeft ?? 0) - Number(n.paddingRight ?? 0)
      const fixedWidth = requiredWidth(n) === n.width
      if (fixedWidth) {
        const kids = n.children.filter(c => c.visible).map(requiredWidth)
        const need =
          mode === 'HORIZONTAL' && n.layoutWrap !== 'WRAP'
            ? kids.reduce((a, b) => a + b, 0) + Number(n.itemSpacing ?? 0) * Math.max(kids.length - 1, 0)
            : Math.max(0, ...kids)
        if (need > inner + 0.5) {
          // Le chemin du plus exigeant, jusqu'à la feuille : c'est lui qu'il faut corriger.
          const chain: string[] = []
          let cur: FakeNode | undefined = n
          while (cur) {
            const worst: FakeNode | undefined = cur.children
              .filter(c => c.visible)
              .sort((a, z) => requiredWidth(z) - requiredWidth(a))[0]
            if (worst) chain.push(`${worst.name}:${Math.round(requiredWidth(worst))}`)
            cur = worst
          }
          out.push(`${path} : ${Math.round(need)} > ${Math.round(inner)} (${chain.join(' > ')})`)
        }
      }
    }
    for (const c of n.children) visit(c, `${path}/${c.name}`)
  }
  visit(root, root.name)
  return out
}

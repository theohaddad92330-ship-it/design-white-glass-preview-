import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lot V16 (08/10), point 4 — « ouvrir le sélecteur de mode décale le
 * composeur (layout shift) ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CAUSE : UNE COMPENSATION POUR UNE BARRE QUI N'EXISTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `@radix-ui/react-select` (`SelectContent`) enveloppe son menu ouvert dans
 * `react-remove-scroll`, qui pose `body[data-scroll-locked]` et injecte une
 * feuille de style measurant la largeur de la barre de défilement du
 * NAVIGATEUR pour la compenser par `margin-right`/`padding-right` — un
 * comportement pensé pour une page qui défile au niveau du `<body>`.
 *
 * Ce produit ne défile JAMAIS au niveau du corps de la page : `#app-shell`
 * est fixé à `100dvh`, `overflow: hidden` (règle #1701, voir le bloc
 * au-dessus dans `index.css`) — « ce qui déborde défile dans SON conteneur,
 * jamais le corps de la page » (D81). Le `body` n'a donc AUCUNE barre à
 * retirer ; la compensation ajoute quand même sa marge, qui décale tout le
 * contenu visible (le composeur de `/chat` compris) le temps que le menu
 * reste ouvert.
 *
 * Le popover reste un OVERLAY (`position: fixed`, rendu par `Portal`) : rien
 * ne change à son positionnement. Seule la compensation de scrollbar, sans
 * objet ici, est neutralisée — globalement, pour CHAQUE sélecteur ou menu
 * Radix qui en hérite, pas seulement `ResearchModeSelector`.
 */

const racineWeb = join(__dirname, '..')
const GLOBAL_CSS = join(racineWeb, 'index.css')

const SELECTOR = /(?<![.\w])body\[data-scroll-locked\]\s*\{/
const MARGIN = /margin-right\s*:\s*0\s*!important\s*;/
const PADDING = /padding-right\s*:\s*0\s*!important\s*;/

/** Le contenu du PREMIER bloc `{ … }` qui suit le sélecteur donné, ou `null`
 *  si le sélecteur n'apparaît pas — même technique que
 *  `overscroll-behavior-x-blinde-la-page.test.ts`, sans parseur CSS complet. */
function blocDe(source: string, selecteur: RegExp): string | null {
  const match = selecteur.exec(source)
  if (!match) return null
  const debut = match.index + match[0].length
  const fin = source.indexOf('}', debut)
  return fin === -1 ? null : source.slice(debut, fin)
}

export function neutraliseLaCompensationDeScrollbar(source: string): boolean {
  const bloc = blocDe(source, SELECTOR)
  return bloc !== null && MARGIN.test(bloc) && PADDING.test(bloc)
}

describe('Lot V16.4 — le popover d’un sélecteur ne décale plus la page', () => {
  it('sait dire NON avant de dire OUI — la feuille de style d’avant ce lot', () => {
    // ⚠️ PROUVÉE ROUGE : la forme du fichier avant ce lot, sans la règle.
    const coupable = 'html {\n  overscroll-behavior-x: contain;\n}\n\nbody {\n  background: hsl(var(--background));\n}'
    expect(neutraliseLaCompensationDeScrollbar(coupable)).toBe(false)

    const partiel = 'body[data-scroll-locked] {\n  overflow: hidden !important;\n}'
    expect(neutraliseLaCompensationDeScrollbar(partiel)).toBe(false)

    const corrige = 'body[data-scroll-locked] {\n  margin-right: 0 !important;\n  padding-right: 0 !important;\n}'
    expect(neutraliseLaCompensationDeScrollbar(corrige)).toBe(true)
  })

  it('la feuille de style globale neutralise la marge ET le padding injectés par react-remove-scroll', () => {
    const source = readFileSync(GLOBAL_CSS, 'utf8')
    expect(
      neutraliseLaCompensationDeScrollbar(source),
      'body[data-scroll-locked] ne neutralise pas margin-right ET padding-right à 0',
    ).toBe(true)
  })
})

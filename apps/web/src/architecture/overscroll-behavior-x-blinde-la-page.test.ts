import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2588 (suite) — un correctif posait déjà `overscroll-x-contain` sur le
 * conteneur du tableau de `/missions`
 * (`un-debordement-horizontal-ne-renvoie-pas-en-arriere.test.ts`), mais
 * `html` et `body` restaient mesurés à `auto` : la CHAÎNE vers le retour
 * arrière natif du navigateur ne passe pas que par les conteneurs qui
 * DÉBORDENT réellement — un balayage qui commence sur un pixel sans
 * conteneur déclaré (une marge, un fond) remonte directement à la page.
 * Décision de Louis (18/09) : blinder `html`/`body` dans la feuille de style
 * globale, en plus du conteneur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `overscroll-behavior-x: contain` N'EMPÊCHE PAS le défilement horizontal
 * ─────────────────────────────────────────────────────────────────────────
 * `contain` arrête la PROPAGATION du geste de défilement une fois la borne
 * de l'élément atteinte (il ne remonte plus au parent, donc plus jusqu'au
 * geste natif du navigateur) ; il ne touche pas au défilement DANS
 * l'élément lui-même, qui reste entier. Un tableau plus large que l'écran,
 * à l'intérieur d'un conteneur `overflow-x-auto`, continue donc de se
 * faire défiler à la main — c'est `overflow-x`, pas `overscroll-behavior-x`,
 * qui gouverne CETTE partie-là.
 */

const racineWeb = join(__dirname, '..')
const GLOBAL_CSS = join(racineWeb, 'index.css')

const DECLARATION = /overscroll-behavior-x\s*:\s*contain\s*;/

/** Le contenu du PREMIER bloc `{ … }` qui suit le sélecteur donné, ou `null`
 *  si le sélecteur n'apparaît pas. Assez pour lire `html { … }` / `body { … }`
 *  sans dépendre d'un parseur CSS complet. */
function blocDe(source: string, selecteur: RegExp): string | null {
  const match = selecteur.exec(source)
  if (!match) return null
  const debut = match.index + match[0].length
  const fin = source.indexOf('}', debut)
  if (fin === -1) return null
  return source.slice(debut, fin)
}

export function declareOverscrollBehaviorX(source: string, selecteur: RegExp): boolean {
  const bloc = blocDe(source, selecteur)
  return bloc !== null && DECLARATION.test(bloc)
}

describe('#2588 — html/body contiennent le débordement horizontal, pas seulement les tableaux', () => {
  it('sait dire NON avant de dire OUI — un coupable factice sans la déclaration', () => {
    // ⚠️ PROUVÉE ROUGE : ce fixture est la forme du fichier AVANT ce lot
    // (`html { text-rendering: optimizeLegibility; }`, sans
    // `overscroll-behavior-x`). Retirer la déclaration de `index.css` ferait
    // échouer le test suivant de la même façon.
    const coupable =
      'html {\n  text-rendering: optimizeLegibility;\n}\n\nbody {\n  background: hsl(var(--background));\n}'
    expect(declareOverscrollBehaviorX(coupable, /html\s*\{/)).toBe(false)
    expect(declareOverscrollBehaviorX(coupable, /body\s*\{/)).toBe(false)

    const corrige =
      'html {\n  text-rendering: optimizeLegibility;\n  overscroll-behavior-x: contain;\n}\n\nbody {\n  background: hsl(var(--background));\n  overscroll-behavior-x: contain;\n}'
    expect(declareOverscrollBehaviorX(corrige, /html\s*\{/)).toBe(true)
    expect(declareOverscrollBehaviorX(corrige, /body\s*\{/)).toBe(true)
  })

  it('un bloc `html.pointer` ou tout autre sélecteur composé ne se fait pas passer pour `html {`', () => {
    // `html.pointer-coarse { … }` existe déjà plus bas dans le fichier — le
    // sélecteur `/html\s*\{/` ne doit matcher QUE `html {` nu, jamais lui.
    const source = 'html.pointer-coarse {\n  overscroll-behavior-x: contain;\n}\n\nhtml {\n  color: red;\n}'
    expect(declareOverscrollBehaviorX(source, /(?<![.\w])html\s*\{/)).toBe(false)
  })

  it('la feuille de style globale déclare overscroll-behavior-x: contain sur html ET body', () => {
    const source = readFileSync(GLOBAL_CSS, 'utf8')
    expect(
      declareOverscrollBehaviorX(source, /(?<![.\w])html\s*\{/),
      'html ne déclare pas overscroll-behavior-x: contain',
    ).toBe(true)
    expect(
      declareOverscrollBehaviorX(source, /(?<![.\w])body\s*\{/),
      'body ne déclare pas overscroll-behavior-x: contain',
    ).toBe(true)
  })
})

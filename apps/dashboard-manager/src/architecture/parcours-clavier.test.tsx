import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * GA-268 — #1674.3 (le test T2 de l'issue) : « tout atteignable au clavier,
 * dans un ordre logique, avec un anneau de focus visible, Échap qui ferme
 * toute modale ». Les PIÈCES existaient déjà, dispersées dans six fichiers
 * (`global-search.tsx`, `DataTable.tsx`, `FilterBar.tsx`, `report-issue.tsx`,
 * `guided-tour.tsx`, et un SEPTIÈME trouvé en écrivant cette garde —
 * `element-picker.tsx`, absent du rapport d'éclaireur). Ce qui MANQUAIT est
 * la garde elle-même : rien dans `architecture/` ne balayait le clavier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMMENT CETTE GARDE DÉCOUVRE SA POPULATION — pas une liste écrite à la main
 * ─────────────────────────────────────────────────────────────────────────
 * Trois idiomes RÉELS de ce dépôt, chacun propre à une façon d'ouvrir une
 * couche par-dessus le contenu — mesurés, pas supposés (voir les DEUX tests
 * « LIT vraiment » ci-dessous, qui rejouent les chiffres) :
 *
 *  1. `role="dialog"` dans le JSX — l'idiome ARIA d'une modale.
 *  2. `<sélecteur>[hidden] { display: none }` dans une feuille CSS — la façon
 *     dont CE dépôt fait prendre effet à `hidden={!x}` (DataTable, FilterBar).
 *  3. `position: fixed` ET `inset: 0` dans la MÊME règle CSS — une couche qui
 *     couvre le viewport entier (le backdrop de la palette, le halo de la
 *     visite guidée, le cadre plein écran du viseur d'élément).
 *
 * Un fichier `.module.css` porte sa couche jusqu'à son `.tsx` SIBLING (même
 * dossier, même nom) ; `globals.css` n'a pas de sibling — sa classe se
 * résout en cherchant `className="<classe>"` littéralement dans les `.tsx`.
 *
 * CE QUE CES TROIS IDIOMES EXCLUENT, À DESSEIN : `.report-fab` (le bouton
 * déclencheur du signalement) est `position: fixed` avec un `z-index`, mais
 * SANS `inset: 0` — un bouton ancré dans un coin, pas une couche. Le témoin
 * ci-dessous le prouve sur le VRAI extrait de `globals.css`, pas sur une
 * supposition.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VOIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Un panneau qui s'ouvrirait sans JAMAIS utiliser `role="dialog"`, `[hidden]`
 * ni `position: fixed` + `inset: 0` — un `<details>` natif, par exemple, ou
 * une couche qui masque via un `overflow: hidden` posé sur un PARENT plutôt
 * que sur elle-même. Ce sont les trois idiomes VRAIMENT utilisés dans ce
 * dépôt aujourd'hui ; un quatrième idiome qui apparaîtrait demain échapperait
 * à cette garde tant qu'il n'y est pas ajouté — exactement comme `HERITAGE`
 * dans `couleurs-passent-par-un-token.test.ts` ne voit qu'un style déjà
 * recensé.
 */

// `new URL('..', …)` sur un fichier rend un chemin de RÉPERTOIRE, donc avec
// un `/` final (contrairement à `new URL('../app', …)`, un segment nommé,
// utilisé ailleurs dans ce dépôt) — retiré ici pour que `.slice(longueur + 1)`
// coupe au bon endroit.
const RACINE_SRC_BRUTE = fileURLToPath(new URL('..', import.meta.url))
const RACINE_SRC = RACINE_SRC_BRUTE.endsWith('/') ? RACINE_SRC_BRUTE.slice(0, -1) : RACINE_SRC_BRUTE

function fichiersDe(dossier: string, filtre: (nom: string) => boolean, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) fichiersDe(chemin, filtre, acc)
    else if (filtre(entree)) acc.push(chemin)
  }
  return acc
}

const FICHIERS_TSX = fichiersDe(RACINE_SRC, nom => nom.endsWith('.tsx') && !nom.includes('.test.'))
const FICHIERS_CSS = fichiersDe(RACINE_SRC, nom => nom.endsWith('.css'))

// ─────────────────────────────────────────────────────────────────────────
// Lecture des règles CSS — même technique de profondeur d'accolades que
// `contraste-aa.test.ts` (`borneDuBloc`), généralisée à TOUTES les règles
// d'un fichier plutôt qu'à un seul bloc nommé.
// ─────────────────────────────────────────────────────────────────────────
type RegleCss = { selecteur: string; corps: string }

function reglesCss(texteBrut: string): RegleCss[] {
  // Retire les commentaires D'ABORD — sinon un exemple cité EN COMMENTAIRE
  // (« /* position: fixed, mauvais exemple */ ») compterait comme une vraie
  // règle.
  const texte = texteBrut.replace(/\/\*[\s\S]*?\*\//g, '')
  const regles: RegleCss[] = []
  let profondeur = 0
  let debutSelecteur = 0
  let debutCorps = 0
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === '{') {
      if (profondeur === 0) debutCorps = i + 1
      profondeur++
    } else if (texte[i] === '}') {
      profondeur--
      if (profondeur === 0) {
        regles.push({
          selecteur: texte.slice(debutSelecteur, debutCorps - 1).trim(),
          corps: texte.slice(debutCorps, i),
        })
        debutSelecteur = i + 1
      }
    }
  }
  return regles
}

/** `.xxx[hidden] { … }` → `xxx`. L'idiome disclosure-panel de ce dépôt. */
function classesDisclosurePanel(regles: RegleCss[]): string[] {
  const trouvees: string[] = []
  for (const regle of regles) {
    const m = /^\.([\w-]+)\[hidden\]$/.exec(regle.selecteur)
    if (m) trouvees.push(m[1] as string)
  }
  return trouvees
}

/** Une classe simple, `position: fixed` ET `inset: 0` dans la MÊME règle —
 * l'idiome couche-plein-viewport de ce dépôt. `.report-fab` (fixed, SANS
 * inset: 0) ne matche pas : c'est le témoin ci-dessous. */
function classesCouchePleinViewport(regles: RegleCss[]): string[] {
  const trouvees: string[] = []
  for (const regle of regles) {
    if (!/^\.[\w-]+$/.test(regle.selecteur)) continue
    if (regle.corps.includes('position: fixed') && regle.corps.includes('inset: 0')) {
      trouvees.push(regle.selecteur.slice(1))
    }
  }
  return trouvees
}

/** Le `.tsx` qui rend une classe : le sibling du `.module.css`, ou — pour
 * `globals.css`, qui n'a pas de sibling — tout fichier qui écrit
 * `className="<classe>"` littéralement. */
function fichiersTsxPourClasse(fichierCss: string, classe: string): string[] {
  if (fichierCss.endsWith('.module.css')) {
    const sibling = fichierCss.slice(0, -'.module.css'.length) + '.tsx'
    return FICHIERS_TSX.includes(sibling) ? [sibling] : []
  }
  const marqueur = `className="${classe}"`
  return FICHIERS_TSX.filter(f => readFileSync(f, 'utf8').includes(marqueur))
}

function decouvrirPopulation(): Set<string> {
  const population = new Set<string>()

  for (const fichierCss of FICHIERS_CSS) {
    const regles = reglesCss(readFileSync(fichierCss, 'utf8'))
    const classes = [...classesDisclosurePanel(regles), ...classesCouchePleinViewport(regles)]
    for (const classe of classes) {
      for (const tsx of fichiersTsxPourClasse(fichierCss, classe)) population.add(tsx)
    }
  }

  for (const fichierTsx of FICHIERS_TSX) {
    if (readFileSync(fichierTsx, 'utf8').includes('role="dialog"')) population.add(fichierTsx)
  }

  return population
}

/** Le JSX ferme-t-il à Échap ? L'idiome unique de ce dépôt, sur les SIX
 * fichiers déjà conformes : `<expr>.key === 'Escape'`. */
function fermeAEchap(source: string): boolean {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return /\.key\s*===\s*'Escape'/.test(sansCommentaires)
}

// ⚠️ « issue 1674.3 », jamais « #1674.3 » : `couleurs-passent-par-un-token.test.ts`
// lit `#[0-9a-fA-F]{3,8}` sur TOUT `.tsx` du dépôt, commentaires mis à part —
// et un `#` suivi de quatre chiffres hexadécimaux valides (1,6,7,4 le sont)
// dans une CHAÎNE (pas un commentaire) s'y lit comme une couleur nouvelle.
describe('GA-268 — tout ce qui s’ouvre par-dessus l’écran se referme à Échap (issue 1674.3, test T2)', () => {
  it('LIT quelque chose — le corpus de fichiers n’est pas vide', () => {
    // Sans ce test, un chemin faux rendrait la garde verte en ne lisant RIEN.
    expect(FICHIERS_TSX.length).toBeGreaterThan(100)
    expect(FICHIERS_CSS.length).toBeGreaterThan(10)
  })

  it('LIT vraiment — le parseur de règles CSS retrouve les VRAIES règles de globals.css', () => {
    const regles = reglesCss(readFileSync(join(RACINE_SRC, 'app', 'globals.css'), 'utf8'))
    const parNom = new Map(regles.map(r => [r.selecteur, r.corps]))
    expect(parNom.get('.picker-layer')).toContain('position: fixed')
    expect(parNom.get('.picker-layer')).toContain('inset: 0')
    expect(parNom.get('.report-fab')).toContain('position: fixed')
    // Le témoin : .report-fab N'A PAS `inset: 0` — un bouton de coin, pas une
    // couche. La preuve que l'idiome couche-plein-viewport ne le vise pas.
    expect(parNom.get('.report-fab')).not.toContain('inset: 0')
  })

  it('n’attrape PAS ce qu’elle ne vise pas — .report-fab (bouton ancré) n’entre pas dans la population', () => {
    const regles = reglesCss(readFileSync(join(RACINE_SRC, 'app', 'globals.css'), 'utf8'))
    const couches = classesCouchePleinViewport(regles)
    const disclosure = classesDisclosurePanel(regles)
    expect(couches).not.toContain('report-fab')
    expect(disclosure).not.toContain('report-fab')
    // Et la classe qui EST une couche est bien trouvée à côté de lui, dans le
    // même fichier — la distinction se fait par RÈGLE, pas par fichier entier.
    expect(couches).toContain('picker-layer')
  })

  it('TROUVE une population non vide — sinon elle garderait un ensemble vide', () => {
    const population = decouvrirPopulation()
    expect(population.size).toBeGreaterThanOrEqual(6)
    const relatifs = [...population].map(f => f.slice(RACINE_SRC.length + 1)).sort()
    // Les six fichiers connus (rapport d'éclaireur + le septième trouvé ici)
    // doivent tous y être — pas une supposition, une vérification.
    for (const attendu of [
      join('app', '_components', 'global-search.tsx'),
      join('app', '_components', 'report-issue.tsx'),
      join('app', '_components', 'guided-tour.tsx'),
      join('app', '_components', 'element-picker.tsx'),
      join('ui', 'DataTable.tsx'),
      join('ui', 'FilterBar.tsx'),
    ]) {
      expect(relatifs).toContain(attendu)
    }
  })

  it('sait dire NON — rejoue un manquant réel : la garde nomme le fichier fautif', () => {
    // On ne fabrique pas un cas synthétique : on rejoue, sur le VRAI texte de
    // DataTable.tsx, ce qui se passerait si son Échap disparaissait — sans
    // toucher au fichier sur disque (la preuve d'exécution RÉELLE, casser le
    // vrai fichier puis le restaurer, est faite à la main pendant l'écriture
    // de cette garde ; voir le rapport de ce lot).
    const source = readFileSync(join(RACINE_SRC, 'ui', 'DataTable.tsx'), 'utf8')
    expect(fermeAEchap(source)).toBe(true)
    const sansEchap = source.replace(
      /if \(e\.key === 'Escape'\) setPickerOpen\(false\)/,
      'if (false) { /* Échap retiré */ }',
    )
    expect(sansEchap).not.toBe(source)
    expect(fermeAEchap(sansEchap)).toBe(false)
  })

  it('chaque composant qui ouvre un panneau ou une modale ferme à Échap', () => {
    const population = decouvrirPopulation()
    const manquants: string[] = []
    for (const fichier of population) {
      const source = readFileSync(fichier, 'utf8')
      if (!fermeAEchap(source)) manquants.push(fichier.slice(RACINE_SRC.length + 1))
    }
    expect(manquants).toEqual([])
  })
})

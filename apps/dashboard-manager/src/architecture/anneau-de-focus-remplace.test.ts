import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * GA-269 — #1674.8 (le test T3 de l'issue) : « aucun `outline: none` sans
 * remplacement visible ». Un anneau supprimé sans rien à la place rend le
 * clavier AVEUGLE — on tabule, on ne voit jamais où on est. Personne ne
 * gardait ça : le balayage précédent avait été fait À LA MAIN. Cette garde
 * en fait un BALAYAGE — tous les `.css`/`.module.css` du dépôt, pas les deux
 * fichiers qu'on connaît déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX OCCURRENCES RÉELLES DU DÉPÔT (vérifiées, pas supposées)
 * ─────────────────────────────────────────────────────────────────────────
 *  1. `DataTable.module.css` — `.resizeHandle:hover, .resizeHandle:focus-visible`
 *     remplace l'anneau par un FOND, dans le MÊME bloc CSS. C'est la forme
 *     stricte de remplacement que cette garde vérifie PAR LE CALCUL : le
 *     sélecteur porte `:focus-visible` ET son corps déclare une propriété
 *     visible (fond, bordure, ombre).
 *  2. `global-search.module.css` (`.input`, le champ de la palette ⌘K) —
 *     VÉRIFIÉ à l'écriture de cette garde : ni bloc `:focus-visible` propre,
 *     ni `:focus-within` sur son conteneur (`.panel`) n'existent dans ce
 *     fichier. Le remplacement n'est pas VISUEL, il est dans la GESTION DE
 *     FOCUS du composant (`global-search.tsx` : `role="dialog"` +
 *     `aria-modal`, le focus part dans le champ à l'ouverture et REVIENT au
 *     déclencheur à la fermeture, Échap referme) — le champ est le SEUL
 *     élément interactif d'une boîte de dialogue qui vient d'apparaître, son
 *     curseur texte y clignote déjà. Ce n'est PAS calculable par cette garde
 *     (rien à mesurer dans le CSS), donc c'est une EXCEPTION NOMMÉE, DATÉE,
 *     avec sa raison écrite — même esprit que `HERITAGE_NON_CORRIGE` dans
 *     `contraste-aa.test.ts`. Un TROISIÈME `outline: none` qui apparaîtrait
 *     demain sans bloc `:focus-visible` propre ET sans entrée ici ferait
 *     échouer la garde : l'exception ne s'agrandit pas silencieusement.
 */

const RACINE_SRC_BRUTE = fileURLToPath(new URL('..', import.meta.url))
// `new URL('..', …)` sur un fichier rend un chemin de RÉPERTOIRE (`/` final) —
// retiré pour que `.slice(longueur + 1)` coupe au bon endroit (même piège que
// dans `parcours-clavier.test.tsx`).
const RACINE_SRC = RACINE_SRC_BRUTE.endsWith('/') ? RACINE_SRC_BRUTE.slice(0, -1) : RACINE_SRC_BRUTE

function fichiersCss(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) fichiersCss(chemin, acc)
    else if (entree.endsWith('.css')) acc.push(chemin)
  }
  return acc
}

const FICHIERS_CSS = fichiersCss(RACINE_SRC)

// ─────────────────────────────────────────────────────────────────────────
// Lecture des règles CSS — même technique de profondeur d'accolades que
// `contraste-aa.test.ts` / `parcours-clavier.test.tsx`, généralisée à TOUTES
// les règles d'un fichier, avec le numéro de ligne de chacune (pour nommer
// précisément un défaut, comme l'exige le rapport).
// ─────────────────────────────────────────────────────────────────────────
type RegleCss = { selecteur: string; corps: string; ligne: number }

/** Un commentaire retiré en GARDANT ses retours à la ligne, sinon tous les
 * numéros de ligne qui le suivent se décalent. */
function retireCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
}

function reglesCss(texteBrut: string): RegleCss[] {
  const texte = retireCommentaires(texteBrut)
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
        const selecteur = texte.slice(debutSelecteur, debutCorps - 1).trim()
        const corps = texte.slice(debutCorps, i)
        const ligne = texte.slice(0, debutSelecteur).split('\n').length
        regles.push({ selecteur, corps, ligne })
        debutSelecteur = i + 1
      }
    }
  }
  return regles
}

function supprimeLAnneau(corps: string): boolean {
  return /outline\s*:\s*(none|0)\s*;/.test(corps)
}

/** Remplacement DANS LE MÊME BLOC : le sélecteur porte un pseudo-classe de
 * focus ET le corps déclare une propriété visuellement visible. Une simple
 * présence de `background` ne suffit PAS si le sélecteur n'est pas qualifié
 * par le focus — sinon un fond de repos, sans lien avec l'état focus, ferait
 * passer n'importe quel `outline: none` (témoin ci-dessous). */
function remplaceDansLeMemeBloc(regle: RegleCss): boolean {
  const selecteurQualifieFocus = /:focus(-visible|-within)?\b/.test(regle.selecteur)
  if (!selecteurQualifieFocus) return false
  return /\b(background|background-color|border|border-color|box-shadow)\s*:\s*[^;]*[^;\s](?<!none)(?<!\btransparent);/.test(
    regle.corps,
  )
}

type Occurrence = { fichierRelatif: string; regle: RegleCss }

function toutesLesOccurrences(): Occurrence[] {
  const occurrences: Occurrence[] = []
  for (const chemin of FICHIERS_CSS) {
    const regles = reglesCss(readFileSync(chemin, 'utf8'))
    for (const regle of regles) {
      if (supprimeLAnneau(regle.corps)) {
        occurrences.push({ fichierRelatif: chemin.slice(RACINE_SRC.length + 1), regle })
      }
    }
  }
  return occurrences
}

/** Exceptions NOMMÉES, DATÉES, avec leur raison — jamais une case cochée
 * sans y regarder : le test « LIT vraiment » ci-dessous relit le VRAI
 * fichier, à l'endroit exact, et vérifie que l'exception est encore vraie. */
type ExceptionOutline = { fichierRelatif: string; selecteur: string; raison: string }

const EXCEPTIONS_NOMMEES: ExceptionOutline[] = [
  {
    fichierRelatif: join('app', '_components', 'global-search.module.css'),
    selecteur: '.input',
    raison:
      'Champ de la palette ⌘K. Ni bloc :focus-visible propre, ni :focus-within ' +
      'sur .panel (VÉRIFIÉ le 09/09/2026 : aucun des deux n’existe dans ce ' +
      'fichier). Remplacement non-visuel : la GESTION DE FOCUS du composant ' +
      '(role="dialog" + aria-modal, focus déplacé dans le champ à ' +
      'l’ouverture, restauré au déclencheur à la fermeture, Échap qui ' +
      'referme — global-search.tsx) fait du champ le SEUL élément interactif ' +
      'd’une boîte de dialogue qui vient d’apparaître. Accepté le 09/09/2026, ' +
      'pas gardé par le calcul — à revoir si la palette gagne un second champ.',
  },
]

function exceptionPour(occ: Occurrence): ExceptionOutline | undefined {
  return EXCEPTIONS_NOMMEES.find(e => e.fichierRelatif === occ.fichierRelatif && e.selecteur === occ.regle.selecteur)
}

describe('GA-269 — aucun outline supprimé sans remplacement visible (#1674.8, test T3)', () => {
  it('LIT quelque chose — le corpus CSS n’est pas vide, et il trouve les deux occurrences connues', () => {
    // Contrôle positif : un chemin faux rendrait `FICHIERS_CSS` vide, donc
    // zéro occurrence, donc une garde verte qui n'a rien lu.
    expect(FICHIERS_CSS.length).toBeGreaterThan(10)
    const occurrences = toutesLesOccurrences()
    expect(occurrences.length).toBe(2)
  })

  it('LIT vraiment — les deux occurrences connues sont retrouvées à la BONNE ligne, avec le BON corps', () => {
    const occurrences = toutesLesOccurrences()
    const dataTable = occurrences.find(o => o.fichierRelatif === join('ui', 'DataTable.module.css'))
    const globalSearch = occurrences.find(
      o => o.fichierRelatif === join('app', '_components', 'global-search.module.css'),
    )

    expect(dataTable).toBeDefined()
    expect(dataTable?.regle.ligne).toBe(195)
    expect(dataTable?.regle.selecteur).toContain(':focus-visible')
    expect(dataTable?.regle.corps).toContain('background:')

    expect(globalSearch).toBeDefined()
    expect(globalSearch?.regle.ligne).toBe(36)
    expect(globalSearch?.regle.selecteur).toBe('.input')

    // Et l'exception nommée est encore À JOUR sur ces deux mêmes faits : pas
    // de :focus-visible propre, pas de :focus-within sur .panel — sinon
    // cette exception serait un CONSTAT PÉRIMÉ.
    const texteGlobalSearch = readFileSync(join(RACINE_SRC, 'app', '_components', 'global-search.module.css'), 'utf8')
    expect(texteGlobalSearch).not.toContain(':focus-within')
    expect(texteGlobalSearch.match(/:focus-visible/g)?.length).toBe(1) // `.hit:focus-visible`, sans lien avec `.input`
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un fond de REPOS, sans lien avec le focus, n’exempte rien', () => {
    // Témoin fabriqué : un sélecteur SANS pseudo-classe de focus qui déclare
    // à la fois `outline: none` et `background` (son fond normal, au repos,
    // pas un remplacement d'anneau). Si la garde se contentait de chercher
    // « il y a un fond dans le bloc », elle laisserait passer ceci — donc
    // elle exige AUSSI que le sélecteur porte le focus.
    const temoin: RegleCss = { selecteur: '.exemple', corps: 'background: red;\noutline: none;', ligne: 1 }
    expect(supprimeLAnneau(temoin.corps)).toBe(true)
    expect(remplaceDansLeMemeBloc(temoin)).toBe(false)
  })

  it('sait dire NON — sur son PROPRE mécanisme : retirer le fond du bloc :focus-visible de DataTable le fait échouer', () => {
    const occurrences = toutesLesOccurrences()
    const dataTable = occurrences.find(o => o.fichierRelatif === join('ui', 'DataTable.module.css')) as Occurrence
    expect(remplaceDansLeMemeBloc(dataTable.regle)).toBe(true)

    const sansFond: RegleCss = { ...dataTable.regle, corps: dataTable.regle.corps.replace(/background:[^;]+;/, '') }
    expect(sansFond.corps).not.toBe(dataTable.regle.corps)
    expect(remplaceDansLeMemeBloc(sansFond)).toBe(false)
  })

  it('chaque outline supprimé a un remplacement — dans son bloc, ou par une exception nommée et VÉRIFIÉE', () => {
    const occurrences = toutesLesOccurrences()
    const manquants: string[] = []

    for (const occ of occurrences) {
      if (remplaceDansLeMemeBloc(occ.regle)) continue
      const exception = exceptionPour(occ)
      if (exception) continue
      manquants.push(
        `${occ.fichierRelatif}:${occ.regle.ligne} (${occ.regle.selecteur}) — outline supprimé sans remplacement ` +
          `visible dans le même bloc, et sans exception nommée`,
      )
    }

    expect(manquants).toEqual([])
  })
})

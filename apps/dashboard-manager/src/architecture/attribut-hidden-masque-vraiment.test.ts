import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Ce qu'on masque avec l'attribut `hidden` doit VRAIMENT être masqué.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'INCIDENT, MESURÉ EN PRODUCTION LE 09/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Le sélecteur de colonnes du `DataTable` était OUVERT en permanence, sur un
 * chargement neuf, et recouvrait les deux dernières colonnes du tableau —
 * sur `/users`, l'écran le plus dense de la console.
 *
 * Le composant faisait tout juste : `hidden={!pickerOpen}`, et le bouton
 * annonçait `aria-expanded="false"`. Le CSS, lui, déclarait `display: grid`
 * sur la même classe. La règle du navigateur (`[hidden] { display: none }`) a
 * la même spécificité qu'une classe d'auteur, et perd contre celle définie
 * plus tard. Le composant croyait cacher ; la feuille de style rouvrait.
 *
 * ⚠️ Ce défaut ne se voit dans AUCUN test unitaire : le composant rend bien
 * l'attribut, et jsdom ne met rien en page. Il se voit en MESURANT le rendu —
 * `aria-expanded="false"` d'un côté, 170 × 306 px visibles de l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * Un module CSS dont le composant frère masque par `hidden` doit neutraliser
 * son `display` pour `[hidden]`. C'est une règle, pas un état : elle reste
 * vraie quand le code grandit, et ne rougit que si quelqu'un pose un `display`
 * sans sa contrepartie.
 */

const RACINE = fileURLToPath(new URL('..', import.meta.url))

function fichiers(dossier: string, suffixe: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) fichiers(chemin, suffixe, acc)
    else if (entree.endsWith(suffixe) && !entree.includes('.test.')) acc.push(chemin)
  }
  return acc
}

/** Les classes passées à un élément qui porte `hidden={…}` dans ce fichier. */
function classesMasqueesParHidden(source: string): string[] {
  const out: string[] = []
  // `className={styles['x'] ?? ''}` … `hidden={…}` dans la même balise.
  for (const balise of source.split('<').slice(1)) {
    const tete = balise.slice(0, balise.indexOf('>') + 1 || balise.length)
    if (!/\bhidden=\{/.test(tete)) continue
    for (const m of tete.matchAll(/styles\[['"]([^'"]+)['"]\]/g)) out.push(m[1] as string)
  }
  return out
}

describe('l’attribut `hidden` masque vraiment', () => {
  const tsx = fichiers(RACINE, '.tsx')

  it('LIT quelque chose — le corpus de composants n’est pas vide', () => {
    expect(tsx.length).toBeGreaterThan(30)
  })

  it('TROUVE des éléments masqués par `hidden` — sinon la garde ne garde rien', () => {
    const total = tsx.reduce((n, f) => n + classesMasqueesParHidden(readFileSync(f, 'utf8')).length, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('toute classe masquée par `hidden` neutralise son `display`', () => {
    const fautifs: string[] = []
    for (const fichier of tsx) {
      const classes = classesMasqueesParHidden(readFileSync(fichier, 'utf8'))
      if (classes.length === 0) continue
      const css = fichier.replace(/\.tsx$/, '.module.css')
      let feuille = ''
      try {
        feuille = readFileSync(css, 'utf8')
      } catch {
        continue // pas de module CSS frère : rien à neutraliser
      }
      for (const classe of classes) {
        const poseUnDisplay = new RegExp(`\\.${classe}\\s*\\{[^}]*display\\s*:\\s*(?!none)`, 's').test(feuille)
        const neutralise = feuille.includes(`.${classe}[hidden]`)
        if (poseUnDisplay && !neutralise) {
          fautifs.push(`${classe} (${css.slice(RACINE.length)}) pose un display sans .${classe}[hidden]`)
        }
      }
    }
    expect(fautifs).toEqual([])
  })
})

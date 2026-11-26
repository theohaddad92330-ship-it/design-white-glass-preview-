import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-39 — `useLaura` est la SEULE porte vers l'assistante (Tome 7 §48).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome le dit deux fois et le qualifie de « risque technique n°1 du
 * programme » : **si chaque écran implémente sa propre logique d'interruption,
 * le budget de trois messages par jour ne tiendra pas une semaine.**
 *
 * Le mécanisme du défaut est banal. Laura doit apparaître sur plusieurs
 * surfaces — une carte en bas à droite, un bloc dans un écran, une bulle. Le
 * jour où la deuxième arrive, recopier les vingt lignes de la première est plus
 * rapide que d'extraire un hook. Il y a alors deux compteurs de « une demande
 * par écran », deux gestions de la réaction, et le plafond côté serveur ne voit
 * plus qu'un flux d'appels qu'il ne peut plus attribuer.
 *
 * Cette garde ne peut pas empêcher quelqu'un d'écrire sa propre logique. Elle
 * empêche la seule chose qui la rende possible : appeler `/laura/*` ailleurs.
 *
 * ⚠️ Le tome numérote cette garde `GA-20`. Ce numéro est PRIS dans ce dépôt
 * (« un repository injecté est déclaré dans son module »). On ne renomme pas
 * pour plaire à un document — c'est la règle posée par D72 — donc elle prend le
 * numéro libre suivant.
 */

const WEB_SRC = join(__dirname, '..')

/** Le seul fichier autorisé à parler à l'assistante. */
const THE_DOOR = 'features/laura/useLaura.ts'

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Retire les commentaires AVANT lecture — leçon GA-08 : sans quoi le docblock
 *  de cette garde, qui cite `/laura/`, se dénoncerait lui-même. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('GA-39 — une seule porte vers Laura', () => {
  const files = sourceFiles(WEB_SRC)

  it('lit un corpus non vide', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some(file => file.endsWith(THE_DOOR))).toBe(true)
  })

  it('aucun écran n’appelle `/laura/` directement', () => {
    const offenders = files
      .filter(file => !file.endsWith(THE_DOOR))
      .filter(file => /['"`]\/laura\//.test(stripComments(readFileSync(file, 'utf8'))))
      .map(file => file.slice(file.indexOf('src/')))
    expect(offenders.sort()).toEqual([])
  })

  it('la garde sait dire NON — la porte, elle, appelle bien `/laura/`', () => {
    // Preuve qu'elle ne passe pas au vert sur du vide : si le motif ne trouvait
    // plus rien nulle part, l'assertion ci-dessus serait verte pour toujours.
    const door = files.find(file => file.endsWith(THE_DOOR)) as string
    expect(stripComments(readFileSync(door, 'utf8'))).toContain("'/laura/plan'")
  })
})

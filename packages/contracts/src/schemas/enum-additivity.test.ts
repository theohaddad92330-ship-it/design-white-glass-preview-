import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENUM_BASELINE } from './enum-baseline.js'

/**
 * GA-08 — les taxonomies ne peuvent que GRANDIR.
 *
 * Renommer ou retirer une valeur d'enum est le premier interdit du socle
 * d'architecture, et pour une raison mécanique : la valeur est écrite en base,
 * contrainte par un `CHECK`, recopiée dans les jeux de démo, traduite dans deux
 * langues et parfois échangée avec le service Python. La retirer du TypeScript
 * ne la retire pas des lignes déjà écrites — elles deviennent illisibles.
 *
 * Le dépôt avait la convention (« Additive by design », les commentaires
 * forward-only des migrations) et aucune vérification. Trois tests voisins
 * pouvaient faire illusion sans jamais l'attraper : la parité zod ↔ JSON Schema
 * compare les deux côtés **à l'instant T** (un retrait des deux côtés passe au
 * vert), la parité i18n ne voit que les clés présentes, et `parseGraphEvent`
 * tolère un type inconnu à l'exécution — ce qui est une souplesse de
 * déploiement, pas une garde.
 *
 * Trois règles, dans l'ordre de gravité :
 *  1. aucune valeur ne disparaît ;
 *  2. l'ordre des valeurs existantes ne change pas — pour plusieurs taxonomies
 *     (`PROJECT_STAGES`, `SUBMISSION_STAGES`, les niveaux d'automatisation),
 *     l'index EST la progression : réordonner change silencieusement le sens de
 *     « ce projet a avancé » ;
 *  3. les nouveautés s'ajoutent EN FIN, jamais au milieu.
 *
 * Un enum entièrement nouveau est libre : il n'a pas d'historique à casser.
 */

const SCHEMAS = new URL('.', import.meta.url).pathname

/** Même extraction que celle qui a produit la référence : `export const X = [
 *  'a', 'b' ] as const`. Volontairement littérale — une taxonomie construite
 *  dynamiquement ne serait de toute façon pas gelable. */
const ENUM_PATTERN = /export const ([A-Za-z0-9_]+)\s*=\s*\[([^\]]*)\]\s*as const/gs

/**
 * Les commentaires partent AVANT l'extraction.
 *
 * Ce n'est pas une précaution de style : la moitié des taxonomies documente
 * chaque valeur en français, et une apostrophe de « n'a pas » se lit comme une
 * chaîne. Sans ce nettoyage, la référence se remplit de fragments de phrases —
 * et la garde compare alors du bruit à du bruit.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^.*?\/\/.*$/gm, match => match.split('//')[0] ?? '')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && entry !== 'enum-baseline.ts') out.push(full)
  }
  return out
}

function currentEnums(): Record<string, string[]> {
  const found: Record<string, string[]> = {}
  for (const file of sourceFiles(SCHEMAS)) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const [, name, body] of source.matchAll(ENUM_PATTERN)) {
      const values = [...(body ?? '').matchAll(/'([^']*)'/g)]
        .map(match => match[1] as string)
        .filter(value => value.length > 0)
      if (values.length >= 2) found[name as string] = values
    }
  }
  return found
}

describe('GA-08 — les enums sont additifs', () => {
  const current = currentEnums()

  it('aucune taxonomie de la référence n’a disparu', () => {
    const vanished = Object.keys(ENUM_BASELINE).filter(name => !(name in current))
    // Si ce test tombe : la taxonomie est encore écrite dans des lignes en
    // base. La renommer ne les renomme pas — elles deviennent illisibles.
    expect(vanished).toEqual([])
  })

  it('aucune VALEUR n’a été retirée ni renommée', () => {
    const losses: Record<string, string[]> = {}
    for (const [name, baseline] of Object.entries(ENUM_BASELINE)) {
      const values = current[name]
      if (!values) continue
      const missing = baseline.filter(value => !values.includes(value))
      if (missing.length > 0) losses[name] = missing
    }
    // Si ce test tombe : ajoute la nouvelle valeur SANS retirer l'ancienne, et
    // migre les lignes existantes avant de supprimer quoi que ce soit.
    expect(losses).toEqual({})
  })

  it('l’ordre des valeurs existantes est inchangé — pour plusieurs taxonomies, l’index EST la progression', () => {
    const reordered: string[] = []
    for (const [name, baseline] of Object.entries(ENUM_BASELINE)) {
      const values = current[name]
      if (!values) continue
      const kept = values.filter(value => baseline.includes(value))
      if (kept.join('|') !== baseline.filter(value => values.includes(value)).join('|')) reordered.push(name)
    }
    expect(reordered).toEqual([])
  })

  it('les valeurs ajoutées le sont EN FIN, jamais insérées au milieu', () => {
    const inserted: Record<string, string[]> = {}
    for (const [name, baseline] of Object.entries(ENUM_BASELINE)) {
      const values = current[name]
      if (!values || baseline.some(value => !values.includes(value))) continue
      const head = values.slice(0, baseline.length)
      if (head.join('|') !== baseline.join('|')) {
        inserted[name] = values.filter(value => !baseline.includes(value))
      }
    }
    // Insérer au milieu décale tout ce qui suit : un `sortOrder` calculé sur
    // l'index, un affichage ordonné, un rapport comparé d'un mois à l'autre
    // changent tous de sens sans qu'une seule ligne de leur code ne bouge.
    expect(inserted).toEqual({})
  })

  it('la référence couvre bien les taxonomies du paquet — une garde vide passe au vert pour toujours', () => {
    expect(Object.keys(ENUM_BASELINE).length).toBeGreaterThanOrEqual(100)
  })
})

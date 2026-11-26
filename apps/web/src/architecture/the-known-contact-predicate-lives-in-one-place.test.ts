/**
 * Le prédicat « contact connu » n'est défini qu'à UN seul endroit (GA-26, #4678).
 *
 * `contacts.source` vaut `import` (reprise de masse) ou `crm` (ligne d'un CRM connecté) pour une relation que le
 * commercial connaissait déjà. La liste de ces deux valeurs vit dans `packages/contracts`
 * (`KNOWN_CONTACT_SOURCES` / `isKnownContact`) ; tout le reste l'importe. `csv_import` n'est PAS une source de contact
 * (c'est une source de besoin) : l'écrire dans une telle liste serait la faute que cette garde nomme.
 *
 * CE QUE CETTE GARDE LIT : le dépôt entier (web, api, paquets, IA Python) à la recherche d'une SECONDE liste de
 * valeurs de source — un tableau ou un `IN (…)` dont les seuls éléments sont `import` et `crm`. Elle SAIT DIRE NON
 * (le détecteur est essayé sur les formes qu'il doit refuser ET sur celles qu'il doit laisser passer) et elle prouve
 * qu'elle lit en retrouvant la définition unique.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(__dirname, '../../../..')
const ROOTS = [
  'apps/web/src',
  'apps/api/src',
  'apps/ia/app',
  ...readdirSync(join(REPO, 'packages')).map(p => `packages/${p}/src`),
]
const DEFINITION = 'packages/contracts/src/schemas/crm-account-provenance.ts'

const Q = `['"]`
/** Un tableau / tuple / `IN (…)` dont les SEULS éléments sont import et crm, dans un ordre ou l'autre. */
const PAIR_LIST = new RegExp(`[\\[(]\\s*${Q}(import|crm)${Q}\\s*,\\s*${Q}(?!\\1)(import|crm)${Q}\\s*,?\\s*[\\])]`)

function secondKnownSourceList(line: string): boolean {
  // Une clé de requête (`['crm', 'import']`) n'est pas une liste de sources.
  if (/queryKey/.test(line)) return false
  return PAIR_LIST.test(line)
}

function walk(dir: string, out: string[] = []): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (name === 'node_modules' || name === 'dist' || name === '__pycache__' || name === 'migrations') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|py)$/.test(name) && !/(\.test\.|\.spec\.|\/tests?\/|test_)/.test(full)) out.push(full)
  }
  return out
}

describe('le prédicat « contact connu » vit à un seul endroit', () => {
  const files = ROOTS.flatMap(root => walk(join(REPO, root)))

  it('la garde LIT quelque chose : elle parcourt les quatre mondes et retrouve la définition unique', () => {
    expect(files.length).toBeGreaterThan(1000)
    expect(files.some(f => f.includes('apps/ia/app'))).toBe(true)
    expect(readFileSync(join(REPO, DEFINITION), 'utf8')).toMatch(/KNOWN_CONTACT_SOURCES = \['import', 'crm'\]/)
  })

  it('aucune seconde liste {import, crm} ailleurs que dans la définition', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(REPO.length + 1)
      if (rel === DEFINITION) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (secondKnownSourceList(line)) offenders.push(`${rel}:${index + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('SAIT DIRE NON — le détecteur refuse les secondes listes, sous toutes leurs formes', () => {
    expect(secondKnownSourceList("const KNOWN = ['import', 'crm']")).toBe(true)
    expect(secondKnownSourceList('const KNOWN = ["crm", "import"] as const')).toBe(true)
    expect(secondKnownSourceList("WHERE c.source IN ('import', 'crm')")).toBe(true)
    expect(secondKnownSourceList('KNOWN_SOURCES = ("import", "crm")')).toBe(true)
  })

  it('SAIT DIRE NON — et laisse passer ce qu’il ne vise pas', () => {
    expect(secondKnownSourceList("qc.invalidateQueries({ queryKey: ['crm', 'import'] })")).toBe(false)
    expect(secondKnownSourceList("const ORIGINS = ['discover', 'search', 'import', 'crm', 'manual']")).toBe(false)
    expect(secondKnownSourceList("NOT IN ('manual', 'import', 'crm')")).toBe(false)
    expect(secondKnownSourceList("const SAME = ['crm', 'crm']")).toBe(false)
  })
})

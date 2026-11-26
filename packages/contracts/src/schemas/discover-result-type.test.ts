import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_NAF_PREFIXES,
  DEFAULT_DISCOVER_RESULT_TYPE,
  DISCOVER_RESULT_TYPES,
  discoverResultTypeFrom,
  discoverResultTypeSchema,
  ESN_NAF_PREFIXES,
  esnNafClass,
} from './discover-result-type.js'

/**
 * #2165.7 à #2165.10 — le TYPE DE RÉSULTAT d'une recherche Découvrir.
 *
 * Deux choses sont gardées ici, et elles n'ont pas la même nature :
 *
 * 1. le VOCABULAIRE des quatre types et son caractère EXCLUSIF (#2165.10) —
 *    une recherche rend des comptes, ou des personnes, ou des besoins, ou des
 *    partenaires, jamais deux à la fois ;
 * 2. la PARITÉ du classement NAF avec `apps/ia/app/services/esn_naf.py`
 *    (#2165.9 / #2166.34). Le service IA porte déjà la décision « ce code
 *    désigne-t-il une ESN » ; l'écrire une seconde fois côté TypeScript sans
 *    la relier au Python, c'est deux vérités qui divergent au premier code
 *    ajouté.
 *
 * ⚠️ Le premier test vérifie le CORPUS, pas le verdict : sans lui, un chemin
 * renommé rendrait toute la parité vraie par vacuité, pour toujours.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const ESN_NAF_PY = readFileSync(monorepoFile('apps/ia/app/services/esn_naf.py'), 'utf8')

/** Le tuple Python `NOM: tuple[str, ...] = ("a", "b")`, lu hors commentaire. */
function pythonTuple(source: string, name: string): string[] {
  const line = source
    .split('\n')
    .filter(l => !l.trimStart().startsWith('#'))
    .find(l => l.startsWith(`${name}:`) || l.startsWith(`${name} =`))
  if (!line) throw new Error(`Tuple Python introuvable : ${name}`)
  return [...line.matchAll(/"([^"]+)"/g)].map(m => m[1] as string)
}

describe('corpus lu', () => {
  it('lit le module Python du retournement NAF', () => {
    expect(ESN_NAF_PY.length).toBeGreaterThan(500)
    expect(ESN_NAF_PY).toContain('ESN_NAF_PREFIXES')
  })

  it('en extrait des préfixes non vides', () => {
    expect(pythonTuple(ESN_NAF_PY, 'ESN_NAF_PREFIXES').length).toBeGreaterThan(0)
    expect(pythonTuple(ESN_NAF_PY, 'AMBIGUOUS_NAF_PREFIXES').length).toBeGreaterThan(0)
  })
})

describe('les quatre types de résultat (#2165.7-.10)', () => {
  it('nomme comptes, contacts, besoins, partenaires et appels', () => {
    // #2545.1 — un cinquième type : la LISTE D'APPELS, qui croise comptes et
    // personnes de la même recherche dans un seul tableau exportable.
    expect([...DISCOVER_RESULT_TYPES]).toEqual(['accounts', 'contacts', 'needs', 'partners', 'calls'])
  })

  it('ouvre sur les comptes — le seul type que Découvrir rendait avant', () => {
    expect(DEFAULT_DISCOVER_RESULT_TYPE).toBe('accounts')
  })

  it('refuse une valeur hors vocabulaire plutôt que de la ranger au hasard', () => {
    expect(discoverResultTypeSchema.safeParse('esn').success).toBe(false)
    expect(discoverResultTypeSchema.safeParse('needs').success).toBe(true)
  })

  it('#2165.10 — un lien collé de travers rouvre sur les comptes, jamais deux types', () => {
    expect(discoverResultTypeFrom('needs')).toBe('needs')
    expect(discoverResultTypeFrom('Needs')).toBe('accounts')
    expect(discoverResultTypeFrom(['needs', 'contacts'])).toBe('accounts')
    expect(discoverResultTypeFrom(undefined)).toBe('accounts')
  })
})

describe('classement NAF — parité avec esn_naf.py (#2165.9)', () => {
  it('porte EXACTEMENT les préfixes du service IA', () => {
    expect([...ESN_NAF_PREFIXES]).toEqual(pythonTuple(ESN_NAF_PY, 'ESN_NAF_PREFIXES'))
    expect([...AMBIGUOUS_NAF_PREFIXES]).toEqual(pythonTuple(ESN_NAF_PY, 'AMBIGUOUS_NAF_PREFIXES'))
  })

  it("ne conclut JAMAIS d'un silence : NAF absent = null, pas « client »", () => {
    expect(esnNafClass(null)).toBeNull()
    expect(esnNafClass(undefined)).toBeNull()
    expect(esnNafClass('')).toBeNull()
    expect(esnNafClass('62')).toBeNull()
  })

  it('classe une ESN franche, quel que soit le point et la casse', () => {
    expect(esnNafClass('62.01Z')).toBe('esn')
    expect(esnNafClass('6202a')).toBe('esn')
    expect(esnNafClass('62.03Z')).toBe('esn')
  })

  it('rend AMBIGU ce qui apparaît des deux côtés, jamais rangé au hasard', () => {
    expect(esnNafClass('70.22Z')).toBe('ambiguous')
    expect(esnNafClass('62.09Z')).toBe('ambiguous')
  })

  it("n'attrape pas ce qu'il ne vise pas : un NAF industriel reste un client", () => {
    expect(esnNafClass('30.30Z')).toBe('client')
    expect(esnNafClass('47.11F')).toBe('client')
    expect(esnNafClass('61.10Z')).toBe('client')
  })
})

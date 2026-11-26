import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { METHOD_REFUSALS, METHOD_RULES } from './method-delta.js'

/**
 * La garde de parité des règles de MÉTHODE — TS (le registre distillé) ↔ Python
 * (le corpus que le copilote peut citer).
 *
 * ## Ce qu'elle protège
 *
 * Les onze règles gardées et les sept interdits ont été distillés ici, écrits et
 * testés — et pendant des mois **aucun appelant applicatif** : le copilote ne
 * les avait jamais vues. Ils sont maintenant portés côté Python par
 * `apps/ia/app/knowledge/method_rules.py`, quatrième source du corpus citable de
 * `app/services/method_knowledge.py`.
 *
 * ## Pourquoi une copie, et pourquoi elle ne peut pas être un import
 *
 * Le service IA est un autre processus, en Python : il n'a pas le paquet
 * `contracts` à l'exécution. La frontière interdit l'import ; elle n'interdit pas
 * de vérifier. Une valeur recopiée à la main dans deux langages diverge
 * toujours — ce qui l'empêche est ce test, pas une bonne intention.
 *
 * ## Deux pièges que cette garde évite explicitement
 *
 * 1. **Une garde qui cherche un MOT trouve les commentaires.** On ne compare pas
 *    des chaînes libres : on extrait des ENSEMBLES D'IDENTIFIANTS depuis les
 *    seuls corps littéraux des deux tuples, commentaires `#` et docstrings
 *    retirés d'abord.
 * 2. **Une garde borgne passe au vert.** Une regex périmée ou un chemin renommé
 *    rendrait toutes les comparaisons vraies par vacuité, pour toujours. Le
 *    premier test ci-dessous vérifie donc le CORPUS et pas le verdict : bornes
 *    basses sur ce qui est lu, comptes exacts sur ce qui est extrait.
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

const RULES_PY = monorepoFile('apps/ia/app/knowledge/method_rules.py')
const pythonSource = readFileSync(RULES_PY, 'utf8')

/**
 * Le source Python débarrassé de tout ce qu'un humain y écrit pour lui-même.
 *
 * Les docstrings `"""…"""` partent en premier (elles peuvent contenir un `#`),
 * puis les commentaires `#`. Sans cette passe, la doc de tête de `method_rules.py`
 * — qui parle des littéraux que cette garde lit — se ferait compter comme des
 * règles, et la garde lirait un corpus qu'elle a inventé.
 */
const withoutProse = pythonSource.replace(/"""[\s\S]*?"""/g, '').replace(/#[^\n]*/g, '')

/** Le corps littéral d'un tuple `NOM: tuple[MethodRule, ...] = ( … )`. */
function tupleBody(name: string): string {
  const marker = `${name}: tuple[MethodRule, ...] = (`
  const start = withoutProse.indexOf(marker)
  expect(start, `déclaration \`${marker}\` introuvable dans ${RULES_PY}`).toBeGreaterThan(-1)
  const body = withoutProse.slice(start + marker.length).split('\n)')[0] ?? ''
  return body
}

/** Les couples `(id, statement)` déclarés dans ce tuple, dans l'ordre du fichier. */
function declared(name: string): { id: string; statement: string }[] {
  const body = tupleBody(name)
  return [...body.matchAll(/id="([a-z0-9_]+)",\s*\n\s*statement="([^"]+)",/g)].map(match => ({
    id: match[1] as string,
    statement: match[2] as string,
  }))
}

describe('parité des règles de méthode — le registre TS ↔ le corpus Python', () => {
  it('LIT vraiment le module Python (sinon la garde est borgne)', () => {
    // Le corpus, pas le verdict. Un fichier vidé, renommé ou une regex périmée
    // rendrait chaque `expect` ci-dessous vrai sans rien avoir comparé.
    expect(pythonSource.length).toBeGreaterThan(2000)
    expect(pythonSource).toContain('class MethodRule')
    expect(withoutProse).toContain('METHOD_RULES: tuple[MethodRule, ...] = (')
    expect(withoutProse).toContain('METHOD_REFUSALS: tuple[MethodRule, ...] = (')

    // Les comptes EXACTS : une extraction qui avalerait une règle (ou en
    // inventerait une depuis un commentaire) rougit ici, avant toute comparaison.
    expect(declared('METHOD_RULES')).toHaveLength(11)
    expect(declared('METHOD_REFUSALS')).toHaveLength(7)
    expect(METHOD_RULES).toHaveLength(11)
    expect(METHOD_REFUSALS).toHaveLength(7)
  })

  it('la passe anti-prose retire bien les commentaires et les docstrings', () => {
    // La preuve que le piège est réellement désamorcé : la doc de tête du module
    // Python parle de `statement=` — sans cette passe, elle serait comptée.
    expect(pythonSource).toContain('⚠️ Conséquence pratique')
    expect(withoutProse).not.toContain('⚠️ Conséquence pratique')
    expect(withoutProse).not.toContain('On désigne, on ne refait pas.')
  })

  it('les onze règles gardées ont les MÊMES identifiants des deux côtés', () => {
    expect(declared('METHOD_RULES').map(rule => rule.id)).toEqual(METHOD_RULES.map(rule => rule.id))
  })

  it('les sept interdits ont les MÊMES identifiants des deux côtés', () => {
    expect(declared('METHOD_REFUSALS').map(rule => rule.id)).toEqual(METHOD_REFUSALS.map(rule => rule.id))
  })

  it('chaque énoncé est VERBATIM des deux côtés, identifiant par identifiant', () => {
    // Comparer les ensembles d'identifiants ne suffit pas : deux listes peuvent
    // porter les mêmes noms et dire deux choses différentes. On joint par CLÉ —
    // jamais par rang, qui glisse au premier réordonnancement.
    for (const [name, registre] of [
      ['METHOD_RULES', METHOD_RULES],
      ['METHOD_REFUSALS', METHOD_REFUSALS],
    ] as const) {
      const python = new Map(declared(name).map(rule => [rule.id, rule.statement]))
      expect(python.size, `extraction vide pour ${name}`).toBeGreaterThan(0)
      for (const rule of registre) {
        // Absent et divergent sont deux pannes différentes : la première dit
        // « quelqu'un a renommé ou supprimé une règle d'un seul côté », la
        // seconde « les deux énoncés ont dérivé ». Un message qui les confond
        // envoie chercher au mauvais endroit.
        expect(python.has(rule.id), `\`${rule.id}\` n’existe pas dans ${RULES_PY}`).toBe(true)
        expect(python.get(rule.id), `\`${rule.id}\` : l’énoncé a dérivé entre TS et Python`).toBe(rule.statement)
      }
    }
  })

  it('aucun identifiant n’est déclaré deux fois, d’aucun côté', () => {
    const tous = [...METHOD_RULES, ...METHOD_REFUSALS].map(rule => rule.id)
    expect(new Set(tous).size).toBe(tous.length)
    const python = [...declared('METHOD_RULES'), ...declared('METHOD_REFUSALS')].map(rule => rule.id)
    expect(python.length).toBe(18)
    expect(new Set(python).size).toBe(python.length)
  })

  it('les énoncés publics restent DÉRIVÉS du registre à identifiants', () => {
    // Si quelqu'un réintroduit une liste de chaînes maintenue à la main à côté,
    // les deux divergeront au premier ajout — et c'est le contrôle qui perdra.
    const source = readFileSync(join(_here, 'method-delta.ts'), 'utf8')
    expect(source).toContain('METHOD_RULES_KEPT: readonly string[] = METHOD_RULES.map')
    expect(source).toContain('METHOD_RULES_REFUSED: readonly string[] = METHOD_REFUSALS.map')
  })
})

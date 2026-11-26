import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Un paramètre placé dans un `CASE` doit porter son type.
 *
 * Postgres déduit le type d'un `$n` de son CONTEXTE. Dans
 * `stage_entered_at = $3`, la colonne donne le contexte. Dans
 * `CASE WHEN … THEN $3 ELSE NULL END`, il n'y en a aucun : ni la branche
 * `NULL`, ni le `CASE` lui-même n'imposent quoi que ce soit, et le paramètre
 * retombe sur `text`. Le même `$3` reçoit alors deux types dans une seule
 * requête, et le serveur la refuse ENTIÈREMENT :
 * « inconsistent types deduced for parameter $3 ».
 *
 * Ce que ça a coûté : le seed de l'espace de démonstration échouait sur cette
 * requête, donc `POST /demo/session` répondait 500, donc tout visiteur du lien
 * public — celui qu'un commercial colle dans un message — voyait « Démo
 * indisponible ». Rien dans les tests ne le voyait, parce que la requête est
 * valide à la lecture et que seul Postgres tranche.
 *
 * Le garde lit donc les requêtes brutes du dépôt et exige le cast là où le
 * moteur n'a rien pour deviner.
 */

const API_SRC = join(__dirname, '..')

/** Les occurrences `THEN $n` / `ELSE $n` sans cast, fichier par fichier. */
function uncastParametersInCase(): string[] {
  const offences: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
      // Ligne à ligne, en sautant les commentaires : une explication du défaut
      // contient forcément la forme fautive, et un garde qui se déclenche sur
      // sa propre documentation ne se laisse pas expliquer.
      for (const line of readFileSync(full, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('--')) continue
        // #2497 (vague 23) — `\d+` est glouton mais BACKTRACKE : sur `$32::bigint`
        // il recule à `$3` pour esquiver le `(?!\s*::)`, et signale un faux `$3`
        // nu. `(?!\d)` bloque ce recul — le nombre entier ne peut plus rétrécir.
        const match = trimmed.match(/\b(?:THEN|ELSE)\s+(\$\d+)(?!\d)(?!\s*::)/i)
        if (match) offences.push(`${full.replace(API_SRC, '')}: ${match[0].trim()}`)
      }
    }
  }
  walk(API_SRC)
  return offences
}

/**
 * Un paramètre casté quelque part ne doit pas rester NU dans un `ANY(...)`.
 *
 * Deuxième forme du même défaut, et celle qui a mis le matching en 500 dès son
 * premier appel réel : `($3::uuid[] IS NULL OR c.id = ANY($3))`. Le premier
 * emploi impose `uuid[]`, le second n'a aucun contexte et retombe sur `text`.
 * La requête est refusée ENTIÈREMENT — « inconsistent types deduced for
 * parameter $3 » — et l'écran ne montre qu'un 500 muet.
 *
 * On ne cherche pas les paramètres employés une seule fois : là, la colonne
 * donne le contexte, et exiger un cast partout produirait du bruit que personne
 * ne lirait.
 */
export function inconsistentlyCastParameters(rawSql: string): string[] {
  // Les commentaires SQL sont retirés : une explication du défaut contient
  // forcément la forme fautive, et une garde qui se déclenche sur sa propre
  // documentation ne se laisse pas expliquer.
  const sql = rawSql.replace(/^\s*--.*$/gm, ' ')
  const cast = new Set<string>()
  for (const match of sql.matchAll(/\$(\d+)::/g)) cast.add(`$${match[1]}`)

  // Le second emploi n'est un problème que dans un contexte SANS type. Contre
  // une COLONNE — `s.workspace_id = $2` — Postgres déduit le type de la colonne
  // et les deux emplois s'accordent ; c'est la forme la plus répandue du dépôt
  // et elle est correcte. Dans `ANY($n)` seul, il n'y a rien à déduire.
  const bareInAny = new Set<string>()
  for (const match of sql.matchAll(/\b(?:ANY|ALL)\s*\(\s*\$(\d+)\s*\)/gi)) bareInAny.add(`$${match[1]}`)

  return [...bareInAny].filter(parameter => cast.has(parameter)).sort()
}

describe('les paramètres SQL portent leur type là où Postgres ne peut pas le déduire', () => {
  it('aucun paramètre nu dans une branche de CASE', () => {
    // Le message porte le fichier ET l'expression : l'erreur de production, elle,
    // ne nomme que le numéro du paramètre.
    expect(uncastParametersInCase()).toEqual([])
  })

  it('sait reconnaître la forme qui a mis la démonstration hors service', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper.
    const sample = "closed_at = CASE WHEN $2 = 'won' THEN $3 ELSE NULL END"
    expect(/\b(?:THEN|ELSE)\s+(\$\d+)(?!\d)(?!\s*::)/i.test(sample)).toBe(true)
    expect(/\b(?:THEN|ELSE)\s+(\$\d+)(?!\d)(?!\s*::)/i.test(sample.replace('$3', '$3::timestamptz'))).toBe(false)
  })

  it('ne se laisse pas tromper par un paramètre à DEUX chiffres castés — $32 n’est pas $3', () => {
    // Régression vague 23 (PR #2497) : `THEN $32::bigint` (staffing.service.ts:559)
    // rendait un faux positif « THEN $3 » — `\d+` reculait d'un chiffre pour
    // esquiver le `(?!\s*::)`, un `(?!\d)` bloque ce recul.
    const pattern = /\b(?:THEN|ELSE)\s+(\$\d+)(?!\d)(?!\s*::)/i
    // Témoin du cas légitime : un paramètre à deux chiffres, casté, n'est PAS signalé.
    expect(pattern.test('THEN $32::bigint')).toBe(false)
    // La garde sait toujours dire NON : un paramètre à deux chiffres NU l'est encore.
    expect(pattern.test('THEN $12')).toBe(true)
  })

  it('aucun paramètre casté d’un côté et nu de l’autre dans la même requête', () => {
    const offences: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.endsWith('.ts') || entry.includes('.spec.')) continue
        for (const literal of readFileSync(full, 'utf8').matchAll(/`([^`]*)`/gs)) {
          const sql = literal[1] ?? ''
          if (!/\b(select|insert into|update |delete from)\b/i.test(sql)) continue
          for (const parameter of inconsistentlyCastParameters(sql)) {
            offences.push(`${full.replace(API_SRC, '')}: ${parameter}`)
          }
        }
      }
    }
    walk(API_SRC)
    expect(offences).toEqual([])
  })

  it('attrape la forme qui a mis le matching en 500', () => {
    expect(inconsistentlyCastParameters('WHERE ($3::uuid[] IS NULL OR c.id = ANY($3))')).toEqual(['$3'])
  })

  it('laisse passer un paramètre casté partout, et un paramètre nu partout', () => {
    expect(inconsistentlyCastParameters('WHERE ($3::uuid[] IS NULL OR c.id = ANY($3::uuid[]))')).toEqual([])
    expect(inconsistentlyCastParameters('WHERE a = $1 AND b = $1')).toEqual([])
  })

  it('laisse passer un emploi nu contre une COLONNE — c’est elle qui donne le type', () => {
    // La forme la plus répandue du dépôt, et elle est correcte.
    expect(inconsistentlyCastParameters('WHERE ($2::uuid IS NULL OR s.workspace_id = $2)')).toEqual([])
  })
})

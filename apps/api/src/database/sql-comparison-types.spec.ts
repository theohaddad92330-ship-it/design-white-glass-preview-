import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-61 — UNE COMPARAISON SQL ÉCRITE À LA MAIN DOIT AVOIR LE BON TYPE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE (28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * La routine « besoins sans shortlist » n'a JAMAIS produit une seule ligne. Elle
 * s'écrivait :
 *
 *     AND COALESCE(n.staffable, true) = true
 *
 * `project_needs.staffable` est un `text NOT NULL DEFAULT 'unknown'` — la porte
 * G3 a TROIS issues (`unknown` / `yes` / `no`), pas deux. Postgres ne fait pas
 * correspondre `text` et `boolean` : il refuse la requête ENTIÈRE, à chaque
 * exécution, avec « les COALESCE types text et boolean ne peuvent pas
 * correspondre ». Le même jour, le KPI « besoins refusés par cause » portait
 * `staffable = false` et rendait un tableau vide qui se lit « aucun refus ».
 *
 * Les deux échouaient DEPUIS TOUJOURS, et les deux étaient silencieux : la
 * routine avale ses erreurs par nature de routine, et `crm-kpis.service.ts`
 * enveloppe chaque bloc pour qu'un indicateur en échec n'emporte pas les huit
 * autres. C'est la signature de ce dépôt — l'échec ressemble au succès.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES GARDES SQL EXISTANTES NE POUVAIENT PAS LE VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `sql-table-names.spec.ts` vérifie que la TABLE existe : `project_needs`
 * existe. `sql-column-names.spec.ts` vérifie que la COLONNE existe :
 * `staffable` existe. Les deux étaient vertes, et elles avaient raison — la
 * faute n'était ni dans la table, ni dans le nom de la colonne, mais dans le
 * TYPE de ce qu'on lui comparait. Aucune garde ne regardait ça.
 *
 * Le typage TypeScript ne peut rien : une requête est une chaîne, et une chaîne
 * n'a pas de champs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REGARDE, ET CE QU'ELLE S'INTERDIT DE REGARDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne prétend pas analyser du SQL. Elle attrape UNE faute, celle qui a
 * réellement coûté deux fonctionnalités : **un littéral booléen (`true`/`false`)
 * confronté à une colonne qui n'est pas booléenne, et un littéral texte
 * confronté à une colonne qui l'est.** Ces deux formes sont des erreurs
 * Postgres certaines, jamais des cas limites — c'est ce qui permet de les
 * refuser sans jamais crier faux.
 *
 * Elle résout les colonnes de deux façons, la seconde étant précisément celle
 * qui manquait à `sql-column-names.spec.ts` :
 *
 *  1. `alias.colonne`, quand l'alias est lié à une table (`FROM project_needs n`) ;
 *  2. `colonne` NUE, mais SEULEMENT si la requête ne nomme qu'UNE table. C'est
 *     le cas du KPI fautif (`FROM project_needs`, puis `staffable = false`), que
 *     la garde des noms de colonnes ne voyait pas faute d'alias.
 *
 * Une requête qui nomme deux tables sans alias n'est pas jugée : on préfère
 * taire un doute que d'accuser du code juste. Une garde qui crie faux finit
 * désactivée.
 */

const SRC = join(__dirname, '..')
const ENTITIES = join(__dirname, 'entities')
const MIGRATIONS = join(SRC, 'migrations')

/** Les types SQL que la garde sait classer. Tout le reste est ignoré. */
type TypeClass = 'boolean' | 'text' | 'other'

function classify(sqlType: string): TypeClass {
  const type = sqlType.toLowerCase().trim()
  if (type === 'boolean' || type === 'bool') return 'boolean'
  if (type === 'text' || type === 'varchar' || type === 'character varying' || type === 'citext') return 'text'
  return 'other'
}

/**
 * Le type de chaque colonne : celui déclaré par une entité TypeORM, complété par
 * celui des migrations. Deux sources, aucune liste tenue à la main — une
 * allowlist finirait par accueillir la faute qu'on cherche à empêcher.
 *
 * ⚠️ Quand les deux sources se contredisent, la MIGRATION gagne : c'est elle qui
 * a créé la colonne, et c'est elle que Postgres a lue.
 */
export function columnTypes(): Map<string, TypeClass> {
  const types = new Map<string, TypeClass>()

  for (const file of readdirSync(ENTITIES)) {
    if (!file.endsWith('.entity.ts')) continue
    const source = readFileSync(join(ENTITIES, file), 'utf8')
    for (const block of source.split(/@Entity\(\{\s*name:\s*'/).slice(1)) {
      const table = block.slice(0, block.indexOf("'"))
      // `@Column('text', { … })` et `@Column({ type: 'boolean', … })`.
      for (const match of block.matchAll(
        /@Column\(\s*(?:'([a-z ]+)'|\{[^}]*?\btype:\s*'([a-z ]+)')[\s\S]*?\)\s*\n\s*([a-z_][a-zA-Z0-9_]*)/g,
      )) {
        const sqlType = match[1] ?? match[2] ?? ''
        const column = match[3]
        if (!column) continue
        types.set(`${table}.${column}`, classify(sqlType))
      }
    }
  }

  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(MIGRATIONS, file), 'utf8')

    for (const match of source.matchAll(/ALTER\s+TABLE\s+([a-z_][a-zA-Z0-9_]*)([\s\S]{0,800}?)(?:`|;)/gi)) {
      const table = match[1]!.toLowerCase()
      for (const added of (match[2] ?? '').matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-zA-Z0-9_]*)\s+([a-z]+(?:\s+varying)?)/gi,
      )) {
        types.set(`${table}.${added[1]}`, classify(added[2] ?? ''))
      }
    }

    for (const match of source.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\)\s*`/gi,
    )) {
      const table = match[1]!.toLowerCase()
      for (const line of (match[2] ?? '').split('\n')) {
        const column = line.trim().match(/^([a-z_][a-zA-Z0-9_]*)\s+([a-z]+(?:\s+varying)?)\b/i)
        if (!column) continue
        if (/^(constraint|primary|unique|foreign|check)$/i.test(column[1]!)) continue
        types.set(`${table}.${column[1]}`, classify(column[2] ?? ''))
      }
    }
  }

  return types
}

/** Les alias explicitement liés à une table dans cette requête. */
function aliasesOf(sql: string): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-zA-Z0-9_]*)\s+(?:AS\s+)?([a-z][a-zA-Z0-9_]*)\b/gi)) {
    const alias = match[2]!.toLowerCase()
    if (SQL_KEYWORDS.has(alias.toUpperCase())) continue
    aliases.set(alias, match[1]!.toLowerCase())
  }
  return aliases
}

const SQL_KEYWORDS = new Set([
  'ON',
  'WHERE',
  'SET',
  'VALUES',
  'AS',
  'USING',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'JOIN',
  'GROUP',
  'ORDER',
  'LIMIT',
  'AND',
  'OR',
  'HAVING',
  'RETURNING',
  'CROSS',
  'FULL',
])

/**
 * Toutes les tables nommées par un `FROM`/`JOIN`, alias ou non.
 *
 * ⚠️ UNE CLAUSE `FROM` PEUT EN NOMMER PLUSIEURS, séparées par des virgules :
 * `FROM project_needs, shortlists`. Ne lire que la première ferait croire à une
 * table unique, et la garde résoudrait alors les colonnes NUES sur la mauvaise
 * table — c'est-à-dire qu'elle accuserait du code juste. C'est la première
 * version de cette fonction qui s'est fait prendre par son propre test « sait
 * dire NON ».
 */
function tablesNamedIn(sql: string): string[] {
  const tables = new Set<string>()
  for (const match of sql.matchAll(/\bJOIN\s+([a-z_][a-zA-Z0-9_]*)/gi)) {
    tables.add(match[1]!.toLowerCase())
  }
  const clause = /\bFROM\s+([\s\S]*?)(?=\b(?:WHERE|GROUP|ORDER|LIMIT|HAVING|JOIN|UNION|RETURNING|SET|ON)\b|\)|;|$)/gi
  for (const match of sql.matchAll(clause)) {
    for (const part of (match[1] ?? '').split(',')) {
      // Une table dérivée (`FROM (SELECT …) x`) ne commence pas par un
      // identifiant : elle n'est pas nommée, donc pas résolue.
      const name = part.trim().match(/^([a-z_][a-zA-Z0-9_]*)/i)
      if (name) tables.add(name[1]!.toLowerCase())
    }
  }
  return [...tables]
}

export type Mismatch = { column: string; declared: TypeClass; compared: 'boolean' | 'text'; excerpt: string }

/**
 * Les comparaisons dont le type ne peut pas tenir.
 *
 * Trois formes, parce que ce sont les trois qui ont existé : `col = true`,
 * `COALESCE(col, true)` et `col = 'texte'` sur une colonne booléenne.
 */
export function typeMismatches(sql: string, types: Map<string, TypeClass>): Mismatch[] {
  const aliases = aliasesOf(sql)
  const tables = tablesNamedIn(sql)
  // La table implicite d'une requête qui n'en nomme qu'une : c'est elle qui
  // porte les colonnes écrites NUES. À deux tables, on ne devine pas.
  const soleTable = tables.length === 1 ? tables[0] : undefined

  const resolve = (alias: string | undefined, column: string): string | undefined => {
    if (alias) {
      const table = aliases.get(alias.toLowerCase())
      return table ? `${table}.${column}` : undefined
    }
    return soleTable ? `${soleTable}.${column}` : undefined
  }

  const found: Mismatch[] = []
  const push = (key: string | undefined, compared: 'boolean' | 'text', excerpt: string): void => {
    if (!key) return
    const declared = types.get(key)
    if (declared === undefined || declared === 'other') return
    if (declared === compared) return
    found.push({ column: key, declared, compared, excerpt: excerpt.trim() })
  }

  // `COALESCE(col, true)` / `COALESCE(col, 'texte')` — la forme exacte du défaut.
  for (const match of sql.matchAll(
    /\bCOALESCE\s*\(\s*(?:([a-z][a-zA-Z0-9_]*)\.)?([a-z_][a-zA-Z0-9_]*)\s*,\s*(true|false|'[^']*')\s*\)/gi,
  )) {
    const literal = match[3] ?? ''
    push(resolve(match[1], match[2]!), /^(true|false)$/i.test(literal) ? 'boolean' : 'text', match[0])
  }

  // `col = true`, `col <> false`, `col IS true`.
  for (const match of sql.matchAll(
    /\b(?:([a-z][a-zA-Z0-9_]*)\.)?([a-z_][a-zA-Z0-9_]*)\s*(?:=|<>|!=|\bIS\b)\s*(true|false)\b/gi,
  )) {
    push(resolve(match[1], match[2]!), 'boolean', match[0])
  }

  // `col = 'texte'` sur une colonne BOOLÉENNE — la faute miroir.
  for (const match of sql.matchAll(/\b(?:([a-z][a-zA-Z0-9_]*)\.)?([a-z_][a-zA-Z0-9_]*)\s*(?:=|<>|!=)\s*'[^']*'/gi)) {
    push(resolve(match[1], match[2]!), 'text', match[0])
  }

  return found
}

/** Le source débarrassé de ce qui n'est pas du code — une phrase qui CITE un
 *  prédicat ne doit pas le faire passer pour appliqué, ni pour une faute. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' ')).replace(/(?<!:)\/\/[^\n]*/g, ' ')
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (!full.endsWith('.ts') || full.endsWith('.d.ts')) continue
    if (full.endsWith('.spec.ts') || full.endsWith('.test.ts')) continue
    // Les migrations sont l'histoire de la base : elles CRÉENT les colonnes,
    // elles ne les interrogent pas.
    if (full.includes(`${'/'}migrations${'/'}`)) continue
    out.push(full)
  }
  return out
}

/** Les requêtes écrites à la main d'un fichier. */
function sqlLiterals(source: string): string[] {
  const out: string[] = []
  for (const literal of withoutComments(source).matchAll(/`([^`]*)`/gs)) {
    const sql = literal[1] ?? ''
    if (!/\b(select|insert into|update |delete from)\b/i.test(sql)) continue
    out.push(sql)
  }
  return out
}

describe('GA-61 — une comparaison SQL écrite à la main a le bon type', () => {
  const types = columnTypes()
  const files = sourceFiles(SRC)

  it('aucune requête ne compare une colonne à un littéral d’un autre type', () => {
    const offences: string[] = []
    for (const file of files) {
      for (const sql of sqlLiterals(readFileSync(file, 'utf8'))) {
        for (const mismatch of typeMismatches(sql, types)) {
          offences.push(
            `${file.replace(SRC, '')} → ${mismatch.excerpt}   ` +
              `← \`${mismatch.column}\` est ${mismatch.declared}, comparée à un littéral ${mismatch.compared}`,
          )
        }
      }
    }

    if (offences.length > 0) {
      throw new Error(
        [
          'Une requête compare une colonne à un littéral que Postgres refusera.',
          '',
          "Ce n'est pas un avertissement : Postgres rejette la requête ENTIÈRE, et",
          "l'appelant l'avale généralement en silence. La routine « besoins sans",
          'shortlist » a vécu ainsi depuis sa mise en service, sans produire une',
          'seule ligne.',
          '',
          ...offences.map(offence => `  ${offence}`),
          '',
          'Si la colonne est une PORTE à plusieurs issues (`staffable`), la question',
          "n'est pas « vrai ou faux » : demande le prédicat au contrat",
          '(`needStaffableNotRefusedSql`, `needStaffableRefusedSql`).',
        ].join('\n'),
      )
    }
    expect(offences).toEqual([])
  })

  it('la garde LIT vraiment un corpus, et il n’est pas vide', () => {
    // Un corpus vide passerait au vert éternellement. Bornes basses et larges :
    // elles tombent si l'arborescence bouge sous la garde, pas à chaque fichier
    // ajouté.
    expect(files.length).toBeGreaterThan(300)
    expect(sqlLiterals(files.map(file => readFileSync(file, 'utf8')).join('\n')).length).toBeGreaterThan(50)

    // Elle connaît les types, et les connaît JUSTE — c'est tout le sujet.
    expect(types.size).toBeGreaterThan(500)
    expect(types.get('project_needs.staffable')).toBe('text')
    expect(types.get('project_needs.staffable_reason')).toBe('text')
    expect(types.get('need_unstaffable_reasons.archived')).toBe('boolean')
  })

  it('la garde sait dire NON — et pas seulement sur du code inventé', () => {
    // ── Les deux formes qui ont réellement tourné en production ──────────────
    const routine = `SELECT n.title FROM project_needs n
                      WHERE n.workspace_id = $1 AND COALESCE(n.staffable, true) = true`
    expect(typeMismatches(routine, types)).toHaveLength(1)
    expect(typeMismatches(routine, types)[0]?.column).toBe('project_needs.staffable')
    expect(typeMismatches(routine, types)[0]?.declared).toBe('text')

    // Le KPI : colonne NUE, une seule table — la forme qu'aucune garde ne voyait.
    const kpi = `SELECT count(*) FROM project_needs WHERE workspace_id = $1 AND staffable = false`
    expect(typeMismatches(kpi, types)).toHaveLength(1)
    expect(typeMismatches(kpi, types)[0]?.column).toBe('project_needs.staffable')

    // ── La faute miroir : du texte confronté à une colonne booléenne ─────────
    const mirror = `SELECT 1 FROM need_unstaffable_reasons r WHERE r.archived = 'no'`
    expect(typeMismatches(mirror, types)).toHaveLength(1)
    expect(typeMismatches(mirror, types)[0]?.compared).toBe('text')

    // ── Et elle laisse passer ce qui est JUSTE ──────────────────────────────
    const fixed = `SELECT n.title FROM project_needs n
                    WHERE COALESCE(n.staffable, 'unknown') <> 'no'`
    expect(typeMismatches(fixed, types)).toEqual([])
    expect(typeMismatches(`SELECT 1 FROM need_unstaffable_reasons r WHERE r.archived = false`, types)).toEqual([])

    // Deux tables sans alias : on ne devine pas, donc on n'accuse pas.
    const ambiguous = `SELECT 1 FROM project_needs, shortlists WHERE staffable = false`
    expect(typeMismatches(ambiguous, types)).toEqual([])

    // Un alias non lié à une table connue ne produit rien non plus.
    expect(typeMismatches(`SELECT 1 FROM (SELECT 1) x WHERE x.staffable = false`, types)).toEqual([])
  })
})

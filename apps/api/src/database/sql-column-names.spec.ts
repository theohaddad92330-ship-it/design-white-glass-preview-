import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toute colonne nommée dans du SQL écrit à la main doit EXISTER.
 *
 * Trois défauts de cette famille sont sortis de la même recette, en dix
 * minutes : `accounts.name` (la colonne s'appelle `company_name`),
 * `accounts.owner_id` (elle n'existe pas du tout) et `project_needs.role` (elle
 * s'appelle `title`). Chacun rend un 500 muet — Postgres refuse la requête
 * ENTIÈRE, l'écran affiche « n'a pas pu être chargé », et rien ne dit quelle
 * colonne. Le dernier cassait l'onglet Positionnements depuis des semaines.
 *
 * La garde des TABLES existait déjà et ne pouvait pas les voir : la table était
 * bonne, c'est la colonne qui n'existait pas.
 *
 * Le périmètre est volontairement étroit : seuls les alias explicitement liés à
 * une table (`FROM accounts a`, `JOIN project_needs n`) sont vérifiés. Un alias
 * de CTE, de table dérivée ou de fonction ne l'est pas — on ne prétend pas
 * analyser du SQL, on attrape la faute la plus fréquente.
 */

const SRC = join(__dirname, '..')
const ENTITIES = join(__dirname, 'entities')
const MIGRATIONS = join(SRC, 'migrations')

/**
 * Les colonnes déclarées dans un bout de source d'entité. Une colonne peut porter un nom SQL différent de la
 * propriété TS (`@Column('text', { name: 'other' }) other_axis: string`) — la colonne réelle est celle de `name:`.
 */
function columnNames(source: string): string[] {
  const names: string[] = []
  for (const match of source.matchAll(
    /@(?:Column|PrimaryGeneratedColumn|PrimaryColumn|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)\(([\s\S]*?)\)\s*\n\s*([a-z_][a-zA-Z0-9_]*)/g,
  )) {
    const nameOverride = (match[1] ?? '').match(/name:\s*'([a-z_][a-zA-Z0-9_]*)'/)
    names.push(nameOverride ? nameOverride[1]! : match[2]!)
  }
  return names
}

/**
 * Les colonnes de chaque table : celles déclarées par une entité TypeORM, plus
 * celles ajoutées par une migration (`ADD COLUMN`) sans passer par l'entité.
 *
 * Les deux sources, et aucune liste tenue à la main : une allowlist finirait par
 * accueillir la faute qu'on cherche à empêcher.
 */
function columnsByTable(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>()

  for (const file of readdirSync(ENTITIES)) {
    if (!file.endsWith('.entity.ts')) continue
    const source = readFileSync(join(ENTITIES, file), 'utf8')
    // Un fichier peut porter plusieurs entités : on découpe sur @Entity.
    const parts = source.split(/@Entity\(\{\s*name:\s*'/)
    // Une classe de BASE abstraite du même fichier (`abstract class X`, colonnes communes — le miroir CRM) :
    // ses colonnes appartiennent à chaque entité qui l'étend, sinon la garde les croirait inexistantes.
    const baseColumns = new Map<string, string[]>()
    for (const match of (parts[0] ?? '').matchAll(/abstract class (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
      baseColumns.set(match[1]!, columnNames(match[2]!))
    }
    for (const block of parts.slice(1)) {
      const table = block.slice(0, block.indexOf("'"))
      const columns = tables.get(table) ?? new Set<string>()
      const base = block.match(/class \w+ extends (\w+)/)?.[1]
      for (const name of (base ? baseColumns.get(base) : undefined) ?? []) columns.add(name)
      for (const name of columnNames(block)) columns.add(name)
      tables.set(table, columns)
    }
  }

  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(MIGRATIONS, file), 'utf8')
    for (const match of source.matchAll(/ALTER\s+TABLE\s+([a-z_][a-zA-Z0-9_]*)([\s\S]{0,800}?)(?:`|;)/gi)) {
      const table = match[1]!.toLowerCase()
      const columns = tables.get(table) ?? new Set<string>()
      for (const added of (match[2] ?? '').matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-zA-Z0-9_]*)/gi,
      )) {
        columns.add(added[1]!)
      }
      tables.set(table, columns)
    }
    for (const match of source.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\)\s*`/gi,
    )) {
      const table = match[1]!.toLowerCase()
      const columns = tables.get(table) ?? new Set<string>()
      for (const line of (match[2] ?? '').split('\n')) {
        const column = line.trim().match(/^([a-z_][a-zA-Z0-9_]*)\s+[a-z]/i)
        if (column && !/^(constraint|primary|unique|foreign|check)$/i.test(column[1]!)) columns.add(column[1]!)
      }
      tables.set(table, columns)
    }
  }

  return tables
}

/** Les alias explicitement liés à une table dans cette requête. */
export function aliasesOf(sql: string): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-zA-Z0-9_]*)\s+(?:AS\s+)?([a-z][a-zA-Z0-9_]*)\b/gi)) {
    const table = match[1]!.toLowerCase()
    const alias = match[2]!.toLowerCase()
    // `FROM x ON`, `JOIN y WHERE` : le second mot est un mot-clé, pas un alias.
    if (/^(on|where|set|values|as|using|left|right|inner|outer|join|group|order|limit|and|or)$/i.test(alias)) continue
    aliases.set(alias, table)
  }
  return aliases
}

/** Les `alias.colonne` d'une requête qui ne correspondent à aucune colonne connue. */
export function unknownColumns(sql: string, tables: Map<string, Set<string>>): string[] {
  const aliases = aliasesOf(sql)
  const offences: string[] = []
  for (const match of sql.matchAll(/\b([a-z][a-zA-Z0-9_]*)\.([a-z_][a-zA-Z0-9_]*)\b/gi)) {
    const alias = match[1]!.toLowerCase()
    const column = match[2]!
    const table = aliases.get(alias)
    if (!table) continue
    const known = tables.get(table)
    // Table inconnue de nos entités : la garde des TABLES s'en occupe.
    if (!known || known.size === 0) continue
    if (!known.has(column)) offences.push(`${table}.${column}`)
  }
  return [...new Set(offences)]
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts') || entry.includes('.spec.')) continue
    out.push(full)
  }
  return out
}

describe('les colonnes nommées dans le SQL écrit à la main existent', () => {
  const tables = columnsByTable()

  it('connaît les colonnes des tables du domaine', () => {
    expect(tables.get('accounts')?.has('company_name')).toBe(true)
    expect(tables.get('accounts')?.has('name')).toBe(false)
    expect(tables.get('project_needs')?.has('title')).toBe(true)
    expect(tables.get('project_needs')?.has('role')).toBe(false)
  })

  it('aucune requête ne nomme une colonne inexistante', () => {
    const offences: string[] = []
    for (const file of sourceFiles(SRC)) {
      for (const literal of readFileSync(file, 'utf8').matchAll(/`([^`]*)`/gs)) {
        const sql = literal[1] ?? ''
        if (!/\b(select|insert into|update |delete from)\b/i.test(sql)) continue
        for (const offence of unknownColumns(sql, tables)) {
          offences.push(`${file.replace(SRC, '')} → ${offence}`)
        }
      }
    }
    // Le message porte la colonne ET son fichier : « column a.name does not
    // exist » en production ne nomme ni la table, ni l'endroit.
    expect(offences).toEqual([])
  })

  it('attrape les trois colonnes qui ont rendu des 500 muets', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper — sinon c'est une
    // tautologie, et ce dépôt en a déjà rencontré.
    expect(unknownColumns('SELECT a.name FROM accounts a', tables)).toEqual(['accounts.name'])
    expect(unknownColumns('SELECT 1 FROM accounts a WHERE a.owner_id = $1', tables)).toEqual(['accounts.owner_id'])
    expect(unknownColumns('SELECT n.role FROM project_needs n', tables)).toEqual(['project_needs.role'])
  })

  it('laisse passer les colonnes qui existent', () => {
    expect(unknownColumns('SELECT a.company_name, n.title FROM accounts a, project_needs n', tables)).toEqual([])
  })
})

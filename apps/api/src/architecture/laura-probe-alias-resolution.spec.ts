import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getMetadataArgsStorage } from 'typeorm'
import { ENTITIES } from '../database/database.module'

/**
 * GA — UNE SONDE DE LAURA LIT LA COLONNE **SUR LA BONNE TABLE**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CETTE GARDE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `laura-probe.service.ts` porte 37 requêtes en SQL BRUT qui alimentent les
 * vingt-cinq détecteurs des bulles de Laura. Ni le compilateur ni
 * TypeORM ne peuvent les voir — c'est du texte dans une chaîne — et chaque
 * lecture est isolée dans son `try` : une requête FAUSSE rend donc exactement le
 * même `null` qu'une donnée absente. Une bulle qui ne s'affiche pas ne fait
 * aucun bruit.
 *
 * La garde qui existait (`laura-probe.spec.ts`) exige que tout identifiant cité
 * soit déclaré par UNE entité, quelque part. Son auteur a écrit noir sur blanc
 * ce qu'elle ne voyait pas :
 *
 *   « un vrai nom de colonne lu sur la mauvaise table […] demanderait de
 *     résoudre les alias SQL, ce qui est un analyseur, pas une garde. »
 *
 * Autrement dit `SELECT t.completed_at FROM missions t` passait, alors que
 * `completed_at` vit sur `tasks`. Le détecteur bâti là-dessus ne se déclenche
 * JAMAIS (la requête lève, `null`, rien à signaler) ou, quand la colonne existe
 * des deux côtés avec un sens différent, se déclenche À TORT.
 *
 * Cette garde EST l'analyseur. Elle résout les alias — `FROM x a`, `FROM x AS a`,
 * `JOIN y b ON …`, sous-requêtes corrélées et tables dérivées comprises — puis
 * confronte chaque couple (table résolue, colonne) au schéma du dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE BLANCHIT AVANT DE LIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Huit gardes borgnes en trois jours dans ce dépôt, dont une qui comptait ses
 * propres commentaires. Le fichier sondé est écrit à 40 % en commentaires, qui
 * citent des noms de tables (« `mission_timesheets` n'a pas de `workspace_id` »)
 * et des morceaux de SQL. Une garde qui cherche un MOT y trouve la doctrine.
 *
 * D'où un vrai tokenizer TypeScript ({@link stringLiterals}) : il traverse le
 * source caractère par caractère en distinguant code, commentaire de ligne,
 * commentaire de bloc, chaîne simple, chaîne double et littéral gabarit. Rien de
 * ce qui vit dans un commentaire n'atteint l'analyseur. Puis, dans le SQL, les
 * littéraux `'…'` sont vidés — `'renewal_at_risk'` est une valeur d'enum, pas
 * une colonne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS LIRE — et qui est DÉCLARÉ, jamais avalé
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui s'exempte en silence de ce qu'elle ne comprend pas est une garde
 * borgne. Les quatre choses que cet analyseur ne peut pas trancher sont donc des
 * ERREURS par défaut, et ne passent qu'inscrites dans {@link UNRESOLVABLE} avec
 * leur raison :
 *
 *  1. un littéral SQL contenant une interpolation `${…}` — le texte réel n'est
 *     connu qu'à l'exécution ;
 *  2. un `SELECT *` — la liste des colonnes n'est pas écrite ;
 *  3. une référence `alias.colonne` sur une table DÉRIVÉE (`FROM (…) s`) dont la
 *     liste de sortie n'est pas nommable ;
 *  4. une colonne non qualifiée qu'aucune table du scope ne déclare.
 *
 * Deux limites assumées, écrites ici plutôt que dans une liste, parce qu'elles
 * portent sur le VOCABULAIRE et non sur une requête : les mots de
 * {@link SQL_WORDS} ne sont jamais lus comme des colonnes (une colonne qui
 * s'appellerait `date` ou `text` échapperait au contrôle des colonnes NON
 * qualifiées — jamais à celui des colonnes qualifiées, qui ne consulte pas cette
 * liste), et un identifiant suivi d'une parenthèse est tenu pour un appel de
 * fonction.
 */

const PROBE = join(__dirname, '..', 'modules', 'laura', 'laura-probe.service.ts')
const MIGRATIONS = join(__dirname, '..', 'migrations')
const MIGRATION_GUARD = join(__dirname, 'migration-columns-declared.spec.ts')

/**
 * Ce que l'analyseur ne sait pas trancher, requête par requête, avec sa raison.
 *
 * Clé = `<étiquette de requête> — <ce qui n'est pas résoluble>`. La liste est
 * VIDE aujourd'hui, et c'est un fait MESURÉ, pas un oubli : les 37 requêtes de
 * la sonde sont intégralement résolubles — aucune interpolation, aucun
 * `SELECT *`, aucune référence à une table dérivée. Une requête qui deviendrait
 * dynamique demain fait rougir la CI jusqu'à ce que quelqu'un écrive ici
 * pourquoi on ne peut pas la vérifier.
 */
const UNRESOLVABLE: Readonly<Record<string, string>> = {}

/* ────────────────────────────── le schéma réel ────────────────────────────── */

/**
 * Colonnes qu'une migration déclare et que la base de PRODUCTION n'a pas.
 *
 * ⚠️ La liste ne vit PAS ici : elle appartient à GA-36, qui l'a payée d'une
 * production en 500 le 24/08/2026 (`profiles.onboarding_completed`). Un réglage
 * vit à un seul endroit (GA-26) — on la LIT donc chez elle. Le test « corpus non
 * vide » vérifie que le lien tient : si quelqu'un renomme la constante là-bas,
 * l'extraction rend un ensemble vide et la garde le dit, au lieu d'élargir en
 * silence le schéma qu'elle croit connaître.
 */
function columnsAbsentFromProduction(): Set<string> {
  const source = readFileSync(MIGRATION_GUARD, 'utf8')
  const body = source.split('const NOT_IN_PRODUCTION')[1]?.split('\n}')[0] ?? ''
  return new Set([...body.matchAll(/'([a-z0-9_]+\.[a-z0-9_]+)'\s*:/g)].map(match => match[1] as string))
}

/** Table SQL → colonnes, depuis les métadonnées des entités ENREGISTRÉES. */
function entityColumns(): Map<string, Set<string>> {
  const storage = getMetadataArgsStorage()
  const registered = new Set<unknown>(ENTITIES)
  const targetsByTable = new Map<string, unknown[]>()
  for (const table of storage.tables) {
    if (!registered.has(table.target) || typeof table.name !== 'string') continue
    const name = table.name.toLowerCase()
    targetsByTable.set(name, [...(targetsByTable.get(name) ?? []), table.target])
  }
  const byTable = new Map<string, Set<string>>()
  for (const [name, targets] of targetsByTable) {
    const columns = new Set<string>()
    for (const column of storage.columns) {
      if (!targets.includes(column.target)) continue
      columns.add(((column.options.name ?? column.propertyName) as string).toLowerCase())
    }
    byTable.set(name, columns)
  }
  return byTable
}

/** Retire les commentaires TypeScript d'un fichier de migration avant lecture. */
function stripTsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Le corps parenthésé qui commence à `open`, parenthèses appariées. */
function balanced(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return ''
}

const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?\s*\(/gi
const ALTER_TABLE = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([a-z0-9_]+)"?([\s\S]*?)(?=;|`|ALTER\s+TABLE|$)/gi
const ADD_COLUMN = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi
const DROP_COLUMN = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi
const RENAME_COLUMN = /RENAME\s+COLUMN\s+"?([a-z0-9_]+)"?\s+TO\s+"?([a-z0-9_]+)"?/gi
const DROP_TABLE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi
/** Mots qui ouvrent une CONTRAINTE de table, jamais une colonne. */
const NOT_A_COLUMN = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude', 'like'])

/**
 * Table SQL → colonnes, depuis les migrations (`CREATE TABLE` + `ADD COLUMN`).
 *
 * La seconde moitié de la vérité : une table peut exister sans entité (les
 * tables techniques), et le sujet de cette garde est ce que la BASE porte, pas
 * ce que TypeORM en connaît.
 */
function migrationColumns(): Map<string, Set<string>> {
  const byTable = new Map<string, Set<string>>()
  const add = (table: string, column: string): void => {
    const set = byTable.get(table) ?? new Set<string>()
    set.add(column.toLowerCase())
    byTable.set(table, set)
  }
  for (const file of readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()) {
    const source = stripTsComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    // Seul le `up()` compte : le `down()` restaure volontairement l'état d'avant.
    const up = source.split('public async down')[0] ?? source
    for (const match of up.matchAll(CREATE_TABLE)) {
      const table = (match[1] as string).toLowerCase()
      const body = balanced(up, (match.index ?? 0) + match[0].length - 1)
      let depth = 0
      let item = ''
      const items: string[] = []
      for (const char of body) {
        if (char === '(') depth += 1
        else if (char === ')') depth -= 1
        if (char === ',' && depth === 0) {
          items.push(item)
          item = ''
          continue
        }
        item += char
      }
      items.push(item)
      for (const raw of items) {
        const name = raw.trim().match(/^"?([a-z_][a-z0-9_]*)"?/i)?.[1]
        if (!name || NOT_A_COLUMN.has(name.toLowerCase())) continue
        add(table, name)
      }
    }
    for (const [, rawTable, statement] of up.matchAll(ALTER_TABLE)) {
      const table = (rawTable as string).toLowerCase()
      for (const [, column] of (statement as string).matchAll(ADD_COLUMN)) add(table, column as string)
      // Une colonne re-supprimée n'est plus dans la base : la garder ferait de
      // ce lecteur une porte de sortie silencieuse — le défaut même qu'il garde.
      for (const [, column] of (statement as string).matchAll(DROP_COLUMN)) {
        byTable.get(table)?.delete((column as string).toLowerCase())
      }
      for (const [, from, to] of (statement as string).matchAll(RENAME_COLUMN)) {
        const set = byTable.get(table)
        if (set?.delete((from as string).toLowerCase())) set.add((to as string).toLowerCase())
      }
    }
    for (const [, table] of up.matchAll(DROP_TABLE)) byTable.delete((table as string).toLowerCase())
  }
  return byTable
}

/** Le schéma que la garde oppose à la sonde : entités ∪ migrations − absentes de production. */
function schema(): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>()
  for (const [table, columns] of entityColumns()) merged.set(table, new Set(columns))
  for (const [table, columns] of migrationColumns()) {
    const set = merged.get(table) ?? new Set<string>()
    for (const column of columns) set.add(column)
    merged.set(table, set)
  }
  for (const key of columnsAbsentFromProduction()) {
    const [table, column] = key.split('.')
    if (table && column) merged.get(table)?.delete(column)
  }
  return merged
}

/* ──────────────────── le SQL, extrait sans lire un commentaire ──────────────────── */

type Literal = { text: string; line: number; interpolated: boolean }

/**
 * Toutes les chaînes du fichier — simples, doubles et gabarits — commentaires
 * EXCLUS, parce qu'un tokenizer sait où il est et une expression régulière non.
 *
 * ⚠️ Les chaînes SIMPLES comptent : les cinq requêtes de `depth()` sont écrites
 * en apostrophes, pas en gabarits. La garde d'origine ne lisait que les gabarits
 * et ne les a donc JAMAIS vues.
 */
function stringLiterals(source: string): Literal[] {
  const out: Literal[] = []
  let line = 1
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (char === '\n') {
      line += 1
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      i -= 1
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1
        i += 1
      }
      i += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char
      const start = line
      let text = ''
      let interpolated = false
      i += 1
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          text += source[i + 1] ?? ''
          i += 2
          continue
        }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          interpolated = true
          i += 2
          let depth = 1
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') depth -= 1
            else if (source[i] === '\n') line += 1
            i += 1
          }
          text += ' '
          continue
        }
        if (source[i] === '\n') line += 1
        text += source[i]
        i += 1
      }
      out.push({ text, line: start, interpolated })
      continue
    }
  }
  return out
}

/** Une clé de la table des lecteurs : `consultants: scoped(…)`, `rfpsDueWithGaps: () =>`. */
const READER_KEY = /^\s+([a-z][A-Za-z0-9_]*):\s*(?:scoped|personal|\(\))/
/** Une méthode du service : `private async depth(…)`. */
const METHOD = /^\s*(?:private\s+|public\s+|protected\s+)?(?:async\s+)?([a-z][A-Za-z0-9_]*)\s*\(/

/**
 * Le nom de la mesure à laquelle une requête appartient — pour NOMMER le fautif.
 *
 * ⚠️ Deux motifs, pas un seul « identifiant suivi de `(` ou `:` » : celui-là
 * attrapait la ligne `workspaceId: string,` d'une signature étalée sur trois
 * lignes, et baptisait `billingWindow` du nom de son paramètre. Un message
 * d'échec qui nomme la mauvaise requête coûte la passe entière à qui le lit.
 */
function label(source: string, line: number): string {
  const lines = source.split('\n')
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i -= 1) {
    const text = lines[i] ?? ''
    const name = text.match(READER_KEY)?.[1] ?? text.match(METHOD)?.[1]
    if (name && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) return `${name} (l.${line})`
  }
  return `l.${line}`
}

/**
 * Le SQL débarrassé de ce qui n'est pas un identifiant : littéraux, casts,
 * paramètres, commentaires SQL.
 *
 * Les littéraux passent EN PREMIER : `'active'`, `'renewal_at_risk'`,
 * `'14 days'` sont des valeurs, et les exiger comme colonnes ferait une garde
 * qui crie au loup. La sonde n'écrit aucun commentaire SQL — le nettoyage est là
 * pour celui qu'on écrira un jour.
 */
function normalizeSql(sql: string): string {
  return sql
    .replace(/'[^']*'/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/::\s*[a-z][a-z0-9_]*/gi, ' ')
    .replace(/\$\d+/g, ' ')
}

/* ─────────────────────────── l'analyseur d'alias ─────────────────────────── */

type Binding = { table: string | null; derived: boolean }

type Scope = {
  id: number
  sql: string
  parent: Scope | null
  bindings: Map<string, Binding>
}

/** Découpe le SQL en scopes emboîtés : chaque parenthèse est un scope enfant. */
function scopesOf(sql: string): Scope[] {
  const scopes: Scope[] = []
  const build = (text: string, parent: Scope | null): Scope => {
    const scope: Scope = { id: scopes.length, sql: '', parent, bindings: new Map() }
    scopes.push(scope)
    let masked = ''
    let i = 0
    while (i < text.length) {
      if (text[i] === '(') {
        let depth = 1
        let j = i + 1
        while (j < text.length && depth > 0) {
          if (text[j] === '(') depth += 1
          else if (text[j] === ')') depth -= 1
          j += 1
        }
        const child = build(text.slice(i + 1, j - 1), scope)
        masked += ` #${child.id}# `
        i = j
        continue
      }
      masked += text[i]
      i += 1
    }
    scope.sql = masked
    return scope
  }
  build(sql, null)
  return scopes
}

/** Mots qui ne peuvent pas être l'alias d'une table. */
const NOT_AN_ALIAS = new Set([
  'where',
  'on',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'union',
  'except',
  'intersect',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'cross',
  'join',
  'natural',
  'lateral',
  'and',
  'or',
  'not',
  'as',
  'using',
  'when',
  'then',
  'else',
  'end',
  'filter',
  'for',
  'into',
  'window',
  'fetch',
  'returning',
  'set',
])

const FROM_JOIN = /\b(?:FROM|JOIN)\s+(?:#(\d+)#|([a-z_][a-z0-9_]*))(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi

/** Mots du langage, types et fonctions — jamais des colonnes. */
const SQL_WORDS = new Set([
  'select',
  'distinct',
  'from',
  'where',
  'group',
  'by',
  'having',
  'order',
  'asc',
  'desc',
  'limit',
  'offset',
  'fetch',
  'first',
  'next',
  'rows',
  'only',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'lateral',
  'natural',
  'on',
  'using',
  'as',
  'and',
  'or',
  'not',
  'is',
  'isnull',
  'notnull',
  'null',
  'true',
  'false',
  'unknown',
  'in',
  'any',
  'all',
  'some',
  'exists',
  'between',
  'symmetric',
  'asymmetric',
  'like',
  'ilike',
  'similar',
  'escape',
  'case',
  'when',
  'then',
  'else',
  'end',
  'cast',
  'filter',
  'over',
  'partition',
  'window',
  'union',
  'intersect',
  'except',
  'with',
  'recursive',
  'values',
  'default',
  'nulls',
  'last',
  'interval',
  // Le champ de `EXTRACT(EPOCH FROM …)` : un mot-clé de la construction, au même
  // titre que `interval` ou `current_date`, et non une colonne qu'une table
  // devrait déclarer. Il entre ici parce que l'extracteur voit `EPOCH` comme un
  // mot nu — pas parce qu'une colonne inconnue serait devenue acceptable.
  'epoch',
  'current_date',
  'current_time',
  'current_timestamp',
  'localtime',
  'localtimestamp',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'int',
  'int2',
  'int4',
  'int8',
  'integer',
  'bigint',
  'smallint',
  'numeric',
  'decimal',
  'real',
  'float',
  'double',
  'precision',
  'boolean',
  'bool',
  'text',
  'varchar',
  'char',
  'uuid',
  'json',
  'jsonb',
  'array',
])

type Finding = { kind: 'qualified' | 'bare' | 'table' | 'unresolvable'; message: string }

type Analysis = {
  tables: string[]
  qualified: number
  bare: number
  derivedAliases: number
  findings: Finding[]
}

/**
 * Une requête, résolue.
 *
 * Chaque `alias.colonne` est rattaché à la table de SON scope, ou du scope
 * PARENT quand la sous-requête est corrélée (`NOT EXISTS (SELECT 1 FROM tasks t
 * WHERE t.account_id = a.id)` — `a` vient de dehors). Chaque colonne NON
 * qualifiée est cherchée dans les tables du scope et de ses ancêtres : elle doit
 * exister dans au moins une. Zéro table qui la porte = défaut.
 */
function analyse(sql: string, known: Map<string, Set<string>>): Analysis {
  const findings: Finding[] = []
  const normalized = normalizeSql(sql)
  if (/\bSELECT\s+\*/i.test(normalized)) {
    findings.push({ kind: 'unresolvable', message: '`SELECT *` — la liste des colonnes n’est pas écrite' })
  }
  const scopes = scopesOf(normalized)
  const tables = new Set<string>()
  let derivedAliases = 0

  for (const scope of scopes) {
    for (const match of scope.sql.matchAll(FROM_JOIN)) {
      const derivedId = match[1]
      const table = match[2]?.toLowerCase() ?? null
      const rawAlias = match[3]?.toLowerCase()
      const alias = rawAlias && !NOT_AN_ALIAS.has(rawAlias) ? rawAlias : undefined
      if (derivedId !== undefined) {
        derivedAliases += 1
        if (alias) scope.bindings.set(alias, { table: null, derived: true })
        continue
      }
      if (!table) continue
      tables.add(table)
      scope.bindings.set(alias ?? table, { table, derived: false })
    }
  }

  for (const table of tables) {
    if (!known.has(table))
      findings.push({ kind: 'table', message: `table \`${table}\` — aucune entité, aucune migration` })
  }

  const resolve = (scope: Scope, alias: string): Binding | undefined => {
    for (let current: Scope | null = scope; current; current = current.parent) {
      const binding = current.bindings.get(alias)
      if (binding) return binding
    }
    return undefined
  }

  let qualified = 0
  let bare = 0

  for (const scope of scopes) {
    for (const match of scope.sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/g)) {
      const alias = (match[1] as string).toLowerCase()
      const column = (match[2] as string).toLowerCase()
      qualified += 1
      const binding = resolve(scope, alias)
      if (!binding) {
        findings.push({
          kind: 'qualified',
          message: `\`${alias}.${column}\` — l’alias \`${alias}\` n’est lié à aucune table`,
        })
        continue
      }
      if (binding.derived) {
        findings.push({
          kind: 'unresolvable',
          message: `\`${alias}.${column}\` — \`${alias}\` est une table DÉRIVÉE, sa liste de sortie n’est pas nommable`,
        })
        continue
      }
      const columns = known.get(binding.table as string)
      if (!columns) continue // table inconnue : déjà signalée une fois plus haut
      if (!columns.has(column)) {
        findings.push({
          kind: 'qualified',
          message: `\`${alias}.${column}\` — l’alias \`${alias}\` désigne \`${binding.table}\`, qui ne déclare pas \`${column}\``,
        })
      }
    }

    // Les colonnes NON qualifiées. On retire d'abord les clauses FROM/JOIN (leurs
    // noms de tables ne sont pas des colonnes) et les alias de sortie (`AS n`).
    const bareText = scope.sql.replace(FROM_JOIN, ' ').replace(/\bAS\s+[a-z_][a-z0-9_]*/gi, ' ')
    for (const match of bareText.matchAll(/[a-z_][a-z0-9_]*/gi)) {
      const word = match[0].toLowerCase()
      const before = bareText[(match.index ?? 0) - 1]
      const after = bareText.slice((match.index ?? 0) + match[0].length).match(/^\s*(.)/)?.[1]
      if (before === '.' || after === '.') continue // moitié d'une référence qualifiée
      if (after === '#') continue // appel de fonction : `count(…)`, `now()`
      if (SQL_WORDS.has(word)) continue
      if (resolve(scope, word)) continue // c'est un alias ou un nom de table en scope
      bare += 1
      const candidates: string[] = []
      const inScope: string[] = []
      for (let current: Scope | null = scope; current; current = current.parent) {
        for (const binding of current.bindings.values()) {
          if (binding.derived || !binding.table) continue
          inScope.push(binding.table)
          if (known.get(binding.table)?.has(word)) candidates.push(binding.table)
        }
      }
      if (candidates.length === 0) {
        findings.push({
          kind: 'bare',
          message: `\`${word}\` — aucune table du scope ne la déclare (${inScope.length ? inScope.join(', ') : 'aucune table en scope'})`,
        })
      }
    }
  }

  return { tables: [...tables].sort(), qualified, bare, derivedAliases, findings }
}

/* ─────────────────────────────── la garde ─────────────────────────────── */

const SOURCE = readFileSync(PROBE, 'utf8')
const KNOWN = schema()

type Query = { name: string; sql: string; interpolated: boolean }

const QUERIES: Query[] = stringLiterals(SOURCE)
  .filter(literal => /\bSELECT\b/.test(literal.text) && /\bFROM\b/.test(literal.text))
  .map(literal => ({ name: label(SOURCE, literal.line), sql: literal.text, interpolated: literal.interpolated }))

const ANALYSES = QUERIES.map(query => ({ query, analysis: analyse(query.sql, KNOWN) }))

describe('GA — la garde LIT quelque chose', () => {
  it('extrait un corpus de requêtes NON VIDE', () => {
    // Trois bornes basses, parce que trois choses peuvent se vider en silence :
    // le tokenizer, le filtre « c'est du SQL », et le fichier lui-même.
    expect(QUERIES.length).toBeGreaterThanOrEqual(35)
    expect(new Set(QUERIES.map(query => query.name)).size).toBeGreaterThanOrEqual(25)
  })

  it('résout un nombre NON NUL de couples (alias, colonne) et de colonnes nues', () => {
    // Mesuré le 28/08/2026 : 64 références qualifiées, 57 colonnes nues,
    // 24 tables distinctes. Les bornes sont volontairement en dessous — c'est un
    // CLIQUET contre un extracteur qui se viderait, pas un compte à tenir à jour.
    const qualified = ANALYSES.reduce((total, entry) => total + entry.analysis.qualified, 0)
    const bare = ANALYSES.reduce((total, entry) => total + entry.analysis.bare, 0)
    expect(qualified).toBeGreaterThanOrEqual(40)
    expect(bare).toBeGreaterThanOrEqual(25)
    expect(new Set(ANALYSES.flatMap(entry => entry.analysis.tables)).size).toBeGreaterThanOrEqual(18)
  })

  it('reconnaît les tables DÉRIVÉES — sans ça `FROM (…) s` passerait pour une table', () => {
    const derived = ANALYSES.reduce((total, entry) => total + entry.analysis.derivedAliases, 0)
    expect(derived).toBeGreaterThanOrEqual(2)
  })

  it('connaît un schéma NON VIDE, des deux sources', () => {
    expect(KNOWN.size).toBeGreaterThanOrEqual(100)
    // Deux canaris pris un dans chaque moitié : une colonne d'entité et une
    // colonne que seule une migration écrit.
    expect(KNOWN.get('accounts')?.has('commercial_status')).toBe(true)
    expect(migrationColumns().get('rex_entries')?.has('mission_id')).toBe(true)
  })

  it('lit encore la liste des colonnes absentes de production chez GA-36', () => {
    // Le jour où quelqu'un renomme `NOT_IN_PRODUCTION` là-bas, cette garde
    // élargirait en silence le schéma qu'elle croit connaître. Elle le dit.
    expect(columnsAbsentFromProduction().size).toBeGreaterThanOrEqual(1)
  })
})

describe('GA — chaque requête de la sonde résout ses alias sur le schéma réel', () => {
  it.each(ANALYSES.map(entry => [entry.query.name, entry] as const))('%s', (_name, entry) => {
    const declared = Object.keys(UNRESOLVABLE)
    const problems = entry.analysis.findings
      .map(finding => `${entry.query.name} — ${finding.message}`)
      .filter(problem => !declared.includes(problem))
    expect(problems).toEqual([])
  })

  it('aucune requête n’est interpolée — un SQL assemblé à l’exécution n’est pas vérifiable', () => {
    const interpolated = QUERIES.filter(query => query.interpolated).map(query => query.name)
    expect(interpolated.filter(name => !Object.keys(UNRESOLVABLE).includes(`${name} — interpolation`))).toEqual([])
  })
})

describe('GA — la garde sait dire NON', () => {
  /**
   * La preuve permanente, et elle exerce les QUATRE natures de défaut que
   * l'analyseur sait produire — pas seulement celle du jour. Une garde dont trois
   * détecteurs sur quatre n'ont jamais tourné est une garde dont on ne sait rien.
   *
   * Le premier cas est mot pour mot celui que la garde d'origine laissait passer :
   * une bonne colonne lue sur la mauvaise table.
   */
  it('refuse une bonne colonne lue sur la MAUVAISE table', () => {
    const { findings } = analyse('SELECT t.completed_at FROM missions t WHERE t.workspace_id = $1', KNOWN)
    expect(findings.map(finding => finding.message)).toEqual([
      '`t.completed_at` — l’alias `t` désigne `missions`, qui ne déclare pas `completed_at`',
    ])
  })

  it('refuse un alias qui n’est lié à aucune table', () => {
    const { findings } = analyse('SELECT x.id FROM accounts a WHERE a.workspace_id = $1', KNOWN)
    expect(findings.map(finding => finding.message)).toEqual(['`x.id` — l’alias `x` n’est lié à aucune table'])
  })

  it('refuse une colonne NUE qu’aucune table du scope ne déclare', () => {
    const { findings } = analyse('SELECT count(*) AS n FROM missions WHERE completed_at IS NULL', KNOWN)
    expect(findings.map(finding => finding.message)).toEqual([
      '`completed_at` — aucune table du scope ne la déclare (missions)',
    ])
  })

  it('refuse une TABLE qu’aucune entité et aucune migration ne porte', () => {
    const { findings } = analyse('SELECT x.id FROM table_qui_nexiste_pas x', KNOWN)
    expect(findings.map(finding => `${finding.kind} — ${finding.message}`)).toEqual([
      'table — table `table_qui_nexiste_pas` — aucune entité, aucune migration',
    ])
  })

  it('refuse ce qu’elle ne SAIT PAS lire, au lieu de l’avaler', () => {
    // Les deux formes non résolubles, celles qui n'ont le droit de passer
    // qu'inscrites dans `UNRESOLVABLE` avec leur raison.
    expect(analyse('SELECT * FROM accounts', KNOWN).findings.map(finding => finding.kind)).toEqual(['unresolvable'])
    const derived = analyse('SELECT s.total FROM (SELECT count(*) AS total FROM accounts) s', KNOWN)
    expect(derived.findings.map(finding => `${finding.kind} — ${finding.message}`)).toEqual([
      'unresolvable — `s.total` — `s` est une table DÉRIVÉE, sa liste de sortie n’est pas nommable',
    ])
  })

  it('accepte la MÊME colonne sur la bonne table — sans quoi elle dirait NON à tout', () => {
    const { findings } = analyse('SELECT t.completed_at FROM tasks t WHERE t.workspace_id = $1', KNOWN)
    expect(findings).toEqual([])
  })

  it('résout un alias du scope PARENT dans une sous-requête corrélée', () => {
    const { findings } = analyse(
      'SELECT 1 FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.account_id = a.id)',
      KNOWN,
    )
    expect(findings).toEqual([])
  })

  it('ne lit AUCUN commentaire — le fichier sondé en est plein', () => {
    const literals = stringLiterals(
      [
        '// SELECT ceci_nexiste_pas FROM nulle_part',
        '/* SELECT autre_chose FROM ailleurs */',
        "const a = 'SELECT id FROM accounts'",
      ].join('\n'),
    )
    expect(literals.map(literal => literal.text)).toEqual(['SELECT id FROM accounts'])
  })
})

describe('GA — ce qui n’est pas résoluble est NOMMÉ, avec sa raison', () => {
  it('chaque exception porte une raison écrite', () => {
    // Vingt caractères : de quoi refuser « TODO » ou « à voir », qui sont des
    // façons de ne pas répondre à la question.
    const thin = Object.entries(UNRESOLVABLE)
      .filter(([, reason]) => reason.trim().length <= 20)
      .map(([key]) => key)
    expect(thin).toEqual([])
  })

  it('n’exempte aucune requête qui a disparu — une exception orpheline ment sur la couverture', () => {
    const live = new Set(
      ANALYSES.flatMap(entry => entry.analysis.findings.map(finding => `${entry.query.name} — ${finding.message}`)),
    )
    const orphans = Object.keys(UNRESOLVABLE).filter(key => !live.has(key) && !key.endsWith('— interpolation'))
    expect(orphans).toEqual([])
  })
})

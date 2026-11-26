import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-129 — une colonne relâchée en TypeScript l'a d'abord été en SQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE N'ÉTAIT GARDÉE PAR PERSONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit » (GA-11, GA-12). Cette règle avait deux gardes, et
 * toutes deux regardent l'AJOUT :
 *
 *  - GA-36 (`migration-columns-declared`) : une colonne ajoutée par migration
 *    est déclarée par son entité ;
 *  - GA-11 / GA-12 : une valeur d'énumération existe dans le `CHECK` avant
 *    d'être écrite.
 *
 * Le RELÂCHEMENT n'était couvert par aucune. Or c'est le même défaut, en pire :
 * une entité qui déclare `full_name: string | null` pendant que la base tient
 * `NOT NULL` compile, passe les tests unitaires (qui n'ont pas de base), et
 * tombe en 500 au PREMIER dépôt de CV réel — lu « le service est tombé » alors
 * que c'est une contrainte qui fait son travail. Le désaccord est invisible de
 * tout ce qui ne parle pas à PostgreSQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle croise DEUX sources qui doivent dire la même chose :
 *
 *  - les migrations — quelles colonnes sont posées `NOT NULL`, lesquelles ont
 *    été relâchées par un `ALTER COLUMN … DROP NOT NULL`, lesquelles ont été
 *    supprimées depuis ;
 *  - les entités TypeORM — quelles colonnes se déclarent `nullable: true`.
 *
 * Une colonne déclarée nullable côté entité et jamais relâchée côté SQL est un
 * offender. Mesuré le 30/08/2026 sur le dépôt : 122 entités, 867 colonnes
 * `NOT NULL`, 619 déclarations nullables, **zéro désaccord** — la règle est
 * donc un INTERDIT sans liste d'exceptions, et elle doit le rester.
 *
 * ⚠️ CE QU'ELLE NE PEUT PAS SAVOIR — la leçon payée par GA-36 : elle lit des
 * MIGRATIONS, pas une base. « Une migration relâche la colonne » n'est pas
 * « la colonne est nullable en production ». Elle protège l'ACCORD entre les
 * deux fichiers, ce qui est déjà le défaut qu'on a rencontré ; elle ne remplace
 * pas de regarder la vraie base avant un déploiement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée le 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Code protégé : retiré la ligne `ALTER COLUMN full_name DROP NOT NULL` de
 *   `1790871117001-TalentNameOrNothing.ts` → ROUGE sur « aucune colonne
 *   nullable côté entité n'est restée NOT NULL en base », nommant
 *   `consultants.full_name` et la migration qui l'a posée NOT NULL.
 * · Corpus : forcé `MIGRATIONS` sur un dossier vide → ROUGE sur « la garde LIT
 *   ses deux sources », avant toute autre assertion.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')
const ENTITIES = join(__dirname, '..', 'database', 'entities')

/* ─────────────────────────── Lecture des migrations ────────────────────── */

type SqlState = {
  /** `table.colonne` → la migration qui l'a posée `NOT NULL`. */
  notNull: Map<string, string>
  /** `table.colonne` relâchées par un `DROP NOT NULL`. */
  relaxed: Set<string>
}

/**
 * L'état de nullabilité tel que les migrations le décrivent, dans leur ORDRE.
 *
 * L'ordre compte : une colonne posée `NOT NULL` puis relâchée est nullable, et
 * lire les fichiers dans le désordre inverserait la conclusion. Les noms de
 * migration commencent par leur horodatage, donc l'ordre alphabétique EST
 * l'ordre chronologique.
 */
function readSqlState(dir: string): SqlState {
  const notNull = new Map<string, string>()
  const relaxed = new Set<string>()

  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.ts')) continue
    const source = readFileSync(join(dir, name), 'utf8')

    for (const table of source.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+"?(\w+)"?\s*\(([\s\S]*?)\n\s*\)/gi)) {
      for (const line of (table[2] as string).split('\n')) {
        const column = /^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z][\w\s()[\],]*?NOT NULL/i.exec(line)
        if (column) notNull.set(`${table[1]}.${column[1]}`, name)
      }
    }
    for (const [table, column] of addColumnNotNullColumns(source)) {
      notNull.set(`${table}.${column}`, name)
    }
    for (const dropped of source.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+ALTER COLUMN\s+"?(\w+)"?\s+DROP NOT NULL/gi)) {
      relaxed.add(`${dropped[1]}.${dropped[2]}`)
    }
    // Une colonne SUPPRIMÉE n'a plus de contrainte à tenir. L'oublier ferait
    // signaler des colonnes qui n'existent plus — et une garde qui signale des
    // fantômes finit par ne plus être lue.
    for (const gone of source.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+DROP COLUMN(?: IF EXISTS)?\s+"?(\w+)"?/gi)) {
      notNull.delete(`${gone[1]}.${gone[2]}`)
    }
  }

  return { notNull, relaxed }
}

/* ──────────────────────────── Lecture des entités ──────────────────────── */

/**
 * Les colonnes qu'une entité déclare `nullable: true`.
 *
 * Le décorateur est découpé en COMPTANT LES PARENTHÈSES et non par un
 * `[^)]*` : un défaut courant s'écrit
 * `@Column('jsonb', { nullable: true, default: () => "'{}'" })`, dont la
 * parenthèse interne couperait le motif — la garde ne verrait alors que les
 * colonnes les plus simples, et serait verte sur les autres. C'est exactement
 * la façon dont une garde devient borgne.
 */
function nullableColumns(source: string): string[] {
  const table = /@Entity\(\{\s*name:\s*'([^']+)'/.exec(source)
  if (!table) return []

  const columns: string[] = []
  const decorator = /@Column\s*\(/g
  let match: RegExpExecArray | null
  while ((match = decorator.exec(source)) !== null) {
    let i = match.index + match[0].length
    let depth = 1
    while (i < source.length && depth > 0) {
      const ch = source[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      i += 1
    }
    const args = source.slice(match.index, i)
    if (!/nullable:\s*true/.test(args)) continue
    // Le nom de la propriété suit le décorateur, éventuellement après d'autres
    // décorateurs ou un commentaire.
    const after = source.slice(i, i + 400).replace(/\/\*[\s\S]*?\*\//g, ' ')
    const property = /(?:^|\n)\s*(?:@[\w.]+\([\s\S]*?\)\s*)*\s*([a-z_][\w]*)\s*[!?]?\s*:/i.exec(after)
    if (property) columns.push(`${table[1]}.${property[1]}`)
  }
  return columns
}

/**
 * Découpe une liste SQL séparée par virgules en clauses de plus haut niveau —
 * une virgule DANS une parenthèse (`numeric(10,2)`) ou une chaîne littérale
 * (`DEFAULT 'a,b'`) ne termine pas la clause.
 */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === "'") {
      current += ch
      i += 1
      while (i < text.length && text[i] !== "'") {
        current += text[i]
        i += 1
      }
      current += text[i] ?? ''
      continue
    }
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

/**
 * Les colonnes posées `NOT NULL` par un `ALTER TABLE … ADD COLUMN …[, ADD COLUMN …]`.
 *
 * #2497 (vague 23) — plusieurs clauses `ADD COLUMN` PARTAGENT une seule
 * instruction `ALTER TABLE`, séparées par des virgules, et une clause ne dit
 * RIEN de la nullabilité d'une autre. Un `[^;`]*?NOT NULL` naïf traversait la
 * virgule et attribuait le `NOT NULL` de `cost_breakdown` à `cost_source`
 * (`1795340000001-MissionMarginEngine.ts`) — deux colonnes différentes, une
 * seule réellement `NOT NULL`. Chaque clause est donc isolée par sa propre
 * virgule de plus haut niveau, et sa nullabilité ne regarde qu'ELLE-MÊME.
 */
export function addColumnNotNullColumns(source: string): Array<[table: string, column: string]> {
  const result: Array<[string, string]> = []
  for (const alter of source.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+([\s\S]*?)(?=;|`|$)/gi)) {
    const table = alter[1] as string
    for (const clause of splitTopLevelCommas(alter[2] as string)) {
      const added = /^\s*ADD COLUMN(?: IF NOT EXISTS)?\s+"?(\w+)"?\s+([\s\S]*)$/i.exec(clause)
      if (added && /\bNOT NULL\b/i.test(added[2] as string)) {
        result.push([table, added[1] as string])
      }
    }
  }
  return result
}

function entityFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => name.endsWith('.entity.ts'))
    .map(name => join(dir, name))
}

/** Les colonnes nullables côté entité que le SQL tient encore `NOT NULL`. */
function disagreements(sql: SqlState, columns: readonly string[]): string[] {
  return columns
    .filter(key => sql.notNull.has(key) && !sql.relaxed.has(key))
    .map(key => `${key} — posée NOT NULL par ${sql.notNull.get(key)}, jamais relâchée`)
    .sort()
}

describe('GA-129 — une colonne nullable côté entité l’est aussi en SQL', () => {
  const sql = readSqlState(MIGRATIONS)
  const entities = entityFiles(ENTITIES)
  const declaredNullable = entities.flatMap(file => nullableColumns(readFileSync(file, 'utf8')))

  /* --- 0. La garde LIT ses deux sources --- */

  it('LIT ses deux sources, et elles ne sont pas vides', () => {
    // Une garde qui ne lit rien est verte pour toujours — et celle-ci croise
    // DEUX corpus, donc elle peut devenir borgne de deux façons. Les deux sont
    // vérifiées, plus le fait qu'elle sait reconnaître un relâchement.
    expect(entities.length).toBeGreaterThan(100)
    expect(sql.notNull.size).toBeGreaterThan(500)
    expect(declaredNullable.length).toBeGreaterThan(300)
    // Le relâchement de ce lot doit être VU : sans lui, le détecteur de
    // `DROP NOT NULL` pourrait être cassé sans que rien ne le dise.
    expect([...sql.relaxed]).toContain('consultants.full_name')
    expect(declaredNullable).toContain('consultants.full_name')
  })

  /* --- 1. La garde sait dire NON --- */

  it('signale une entité relâchée sans migration', () => {
    const sansRelachement: SqlState = {
      notNull: new Map([['consultants.full_name', '1788013450112-Consultants.ts']]),
      relaxed: new Set(),
    }
    expect(disagreements(sansRelachement, ['consultants.full_name'])).toEqual([
      'consultants.full_name — posée NOT NULL par 1788013450112-Consultants.ts, jamais relâchée',
    ])
  })

  it('se tait quand la migration a bien précédé', () => {
    const avecRelachement: SqlState = {
      notNull: new Map([['consultants.full_name', '1788013450112-Consultants.ts']]),
      relaxed: new Set(['consultants.full_name']),
    }
    expect(disagreements(avecRelachement, ['consultants.full_name'])).toEqual([])
  })

  it('sait lire un décorateur dont un argument contient une PARENTHÈSE', () => {
    // Le piège qui rend ce genre de garde borgne : couper à la première `)`.
    const source = `
      @Entity({ name: 'demo' })
      export class DemoEntity {
        @Column('jsonb', { nullable: true, default: () => "'{}'" })
        payload: unknown

        @Column('text', { nullable: true })
        label: string | null
      }
    `
    expect(nullableColumns(source)).toEqual(['demo.payload', 'demo.label'])
  })

  it('ne compte pas une colonne NON nullable', () => {
    const source = `
      @Entity({ name: 'demo' })
      export class DemoEntity {
        @Column('text')
        required: string
      }
    `
    expect(nullableColumns(source)).toEqual([])
  })

  it('ne signale PAS une colonne nue quand une AUTRE clause du même ALTER TABLE est NOT NULL', () => {
    // Témoin du cas légitime : la forme réelle de #2420
    // (1795340000001-MissionMarginEngine.ts) — cinq colonnes sur UN seul
    // ALTER TABLE, une seule `NOT NULL DEFAULT`, les quatre autres nues.
    const sql = `
      ALTER TABLE mission_commercial_terms
        ADD COLUMN IF NOT EXISTS cost_source text,
        ADD COLUMN IF NOT EXISTS currency text,
        ADD COLUMN IF NOT EXISTS cost_currency text,
        ADD COLUMN IF NOT EXISTS cost_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS cost_recorded_rate_cents bigint
    `
    expect(addColumnNotNullColumns(sql)).toEqual([['mission_commercial_terms', 'cost_breakdown']])
  })

  it('sait toujours dire NON : signale une colonne réellement NOT NULL au milieu d’une clause multiple', () => {
    const sql = `
      ALTER TABLE t
        ADD COLUMN a text,
        ADD COLUMN b text NOT NULL DEFAULT '',
        ADD COLUMN c text
    `
    expect(addColumnNotNullColumns(sql)).toEqual([['t', 'b']])
  })

  it('oublie une colonne SUPPRIMÉE depuis', () => {
    // Sinon la garde signale des fantômes, et une garde qui signale des
    // fantômes cesse d'être lue.
    expect(sql.notNull.has('consultants.__colonne_inexistante__')).toBe(false)
  })

  /* --- 2. La règle, sur le vrai dépôt --- */

  it('aucune colonne nullable côté entité n’est restée NOT NULL en base', () => {
    // Si ce test tombe : une entité vient d'être relâchée sans sa migration, et
    // la prochaine écriture de `null` tombera en 500 sur la vraie base. La
    // réponse est une migration `ALTER COLUMN … DROP NOT NULL`, livrée AVANT le
    // code qui écrit — jamais un `?? ''` pour contourner la contrainte.
    expect(disagreements(sql, declaredNullable)).toEqual([])
  })
})

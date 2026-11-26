import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  SHARED_PERSON_PUBLIC_FIELDS,
  SHARED_PERSON_TECHNICAL_COLUMNS,
  SHARED_PERSON_TRACE_COLUMNS,
  SHARED_PERSON_TRACE_SHAPE,
} from '@bellum/contracts'

/**
 * GA-418 (#4800.1, décision Louis 29/10/2026) — LE FAIT PUBLIC TRAVERSE, LA TRACE JAMAIS.
 *
 * L'inventaire champ par champ vit dans `packages/contracts/src/schemas/shared-person-fields.ts` :
 * ce qu'une personne donne à la base commune (poste, employeur, ancienneté, coordonnée pro) et ce qui
 * reste à l'espace (qui l'a cherchée, qui l'a contactée, ce que l'accès a coûté).
 *
 * La garde LIT trois choses :
 *  1. les colonnes des tables communes, relevées dans les migrations — chacune est un fait déclaré ou
 *     un champ technique nommé, et AUCUNE n'est une trace ;
 *  2. l'entité `contacts` — toute colonne qui a la FORME d'une trace (espace, utilisateur, coût, envoi,
 *     « par qui ») est déclarée trace ; une nouvelle colonne de ce genre, non classée, fait échouer la CI ;
 *  3. les ordres d'écriture du module de partage — ils n'écrivent que des colonnes déclarées.
 *
 * Elle ne dit pas ce qui est un fait : elle exige qu'une réponse écrite existe. Elle sait dire NON
 * (cas plantés) et prouve qu'elle lit (les colonnes relevées ne sont pas vides).
 */

const API_SRC = join(__dirname, '..')
const SHARED_TABLES = ['shared_company_people', 'shared_person_coordinates'] as const
const TRACE = new Set<string>(SHARED_PERSON_TRACE_COLUMNS)
const TECHNICAL = new Set<string>(SHARED_PERSON_TECHNICAL_COLUMNS)
const PUBLIC_SHARED = new Set(SHARED_PERSON_PUBLIC_FIELDS.map(f => `${f.sharedTable}.${f.sharedColumn}`))

function migrationsSource(): string {
  const dir = join(API_SRC, 'migrations')
  return readdirSync(dir)
    .filter(name => name.endsWith('.ts'))
    .map(name => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
}

/** Les colonnes d'une table commune : son CREATE TABLE puis chaque ADD COLUMN. */
function sharedColumns(migrations: string, table: string): string[] {
  const out = new Set<string>()
  const create = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\s*\\)\\n`).exec(migrations)
  for (const line of (create?.[1] ?? '').split('\n')) {
    const m = /^\s*([a-z_][a-z0-9_]*)\s+(?:uuid|text|timestamptz|date|integer|boolean|jsonb)\b/.exec(line)
    if (m) out.add(m[1] as string)
  }
  const alter = new RegExp(`ALTER TABLE ${table}\\b([\\s\\S]*?)\`\\)`, 'g')
  for (const block of migrations.matchAll(alter)) {
    for (const m of (block[1] ?? '').matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_][a-z0-9_]*)/g)) out.add(m[1] as string)
  }
  return [...out]
}

/** Les colonnes de l'entité `contacts` (propriétés décorées d'une colonne). */
function contactColumns(entity: string): string[] {
  return [
    ...entity.matchAll(
      /@(?:Column|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\(.*\)\s+([a-z_][a-z0-9_]*)[!?]?:/g,
    ),
  ].map(m => m[1] as string)
}

/** Les colonnes d'un INSERT INTO <table> (…) du module de partage. */
function insertedColumns(source: string, table: string): string[] {
  return [...source.matchAll(new RegExp(`INSERT INTO ${table}\\s*\\(([^)]*)\\)`, 'g'))].flatMap(m =>
    (m[1] ?? '')
      .split(',')
      .map(c => c.trim())
      .filter(Boolean),
  )
}

/** Ce que la garde reproche à une colonne commune. */
function sharedColumnViolations(table: string, columns: string[]): string[] {
  const out: string[] = []
  for (const column of columns) {
    if (TRACE.has(column) || SHARED_PERSON_TRACE_SHAPE.test(column))
      out.push(`${table}.${column} : une TRACE d'espace dans la base commune`)
    else if (!TECHNICAL.has(column) && !PUBLIC_SHARED.has(`${table}.${column}`))
      out.push(`${table}.${column} : colonne commune non classée`)
  }
  return out
}

/** Ce que la garde reproche à une colonne de fiche. */
function contactViolations(columns: string[]): string[] {
  const declared = new Set<string>([...TRACE, ...SHARED_PERSON_PUBLIC_FIELDS.map(f => f.contactColumn)])
  return columns
    .filter(c => SHARED_PERSON_TRACE_SHAPE.test(c) && !declared.has(c))
    .map(c => `contacts.${c} : a la forme d'une trace sans être déclarée (shared-person-fields.ts)`)
}

describe('GA-418 — le fait public traverse, la trace jamais (#4800.1)', () => {
  const migrations = migrationsSource()
  const entity = readFileSync(join(API_SRC, 'database/entities/contact.entity.ts'), 'utf8')
  const writes = readFileSync(join(API_SRC, 'modules/shared-base/shared-company-facts-writes.ts'), 'utf8')

  it('prouve qu’elle LIT : les tables communes et la fiche ont des colonnes relevées', () => {
    expect(sharedColumns(migrations, 'shared_company_people')).toEqual(
      expect.arrayContaining(['full_name', 'title', 'employment_state', 'left_at']),
    )
    expect(sharedColumns(migrations, 'shared_person_coordinates')).toEqual(expect.arrayContaining(['email', 'phone']))
    expect(contactColumns(entity)).toEqual(expect.arrayContaining(['workspace_id', 'email_cost_credits', 'title']))
  })

  it.each(SHARED_TABLES)('chaque colonne de %s est un fait déclaré ou un champ technique — aucune trace', table => {
    expect(sharedColumnViolations(table, sharedColumns(migrations, table))).toEqual([])
  })

  it('chaque colonne de fiche qui a la forme d’une trace est déclarée trace (ou fait nommé)', () => {
    expect(contactViolations(contactColumns(entity))).toEqual([])
  })

  it('l’inventaire ne nomme aucun fantôme : traces et sources de faits existent sur la fiche', () => {
    const columns = new Set(contactColumns(entity))
    const missingTraces = SHARED_PERSON_TRACE_COLUMNS.filter(c => !columns.has(c))
    const missingFacts = SHARED_PERSON_PUBLIC_FIELDS.map(f => f.contactColumn).filter(
      c => !c.includes('.') && !columns.has(c),
    )
    expect({ missingTraces, missingFacts }).toEqual({ missingTraces: [], missingFacts: [] })
  })

  it('une trace n’est jamais aussi un fait (les deux listes sont disjointes)', () => {
    const facts = SHARED_PERSON_PUBLIC_FIELDS.map(f => f.contactColumn)
    expect(facts.filter(c => TRACE.has(c))).toEqual([])
  })

  it('les ordres d’écriture du partage n’écrivent que des colonnes déclarées', () => {
    for (const table of SHARED_TABLES) {
      const written = insertedColumns(writes, table)
      expect(written.length).toBeGreaterThan(0)
      expect(sharedColumnViolations(table, written)).toEqual([])
    }
  })

  describe('sait dire NON — cas plantés', () => {
    it('une colonne d’espace ou de coût dans une table commune', () => {
      expect(sharedColumnViolations('shared_company_people', ['workspace_id', 'email_cost_credits'])).toEqual([
        "shared_company_people.workspace_id : une TRACE d'espace dans la base commune",
        "shared_company_people.email_cost_credits : une TRACE d'espace dans la base commune",
      ])
    })

    it('une colonne commune que personne n’a classée', () => {
      expect(sharedColumnViolations('shared_company_people', ['salary_expectation'])).toEqual([
        'shared_company_people.salary_expectation : colonne commune non classée',
      ])
    })

    it('une nouvelle colonne de fiche en forme de trace, non déclarée', () => {
      expect(contactViolations(['title', 'last_contacted_by', 'phone_cost_credits', 'linkedin_sent_at'])).toEqual([
        "contacts.last_contacted_by : a la forme d'une trace sans être déclarée (shared-person-fields.ts)",
        "contacts.linkedin_sent_at : a la forme d'une trace sans être déclarée (shared-person-fields.ts)",
      ])
    })

    it('laisse passer : un fait déclaré, un champ technique, une colonne de fiche sans forme de trace', () => {
      expect(
        sharedColumnViolations('shared_person_coordinates', ['fact_id', 'email', 'phone', 'last_seen_at']),
      ).toEqual([])
      expect(contactViolations(['title', 'linkedin_url', 'email_cost_credits', 'photo_url'])).toEqual([])
    })
  })
})

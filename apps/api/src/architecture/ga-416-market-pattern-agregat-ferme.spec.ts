import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARKET_PATTERN_TABLE,
  SHARED_AGGREGATE_TABLES,
  SHARED_BASE_MIN_WORKSPACES,
  SHARED_FORBIDDEN_COLUMNS,
  toMarketPatternLine,
} from '@bellum/contracts'

/**
 * GA-416 — `market_pattern` : une tendance de marché entre espaces est un AGRÉGAT FERMÉ.
 *
 * #4286.15.c — DÉCISION LOUIS 22/10/2026 (`c127_market_pattern_tendances_entre_espaces`) : des
 * tendances de marché entre espaces, en agrégats sur jetons fermés, publiées SEULEMENT si au moins
 * trois espaces contributeurs distincts les portent, JAMAIS de coût, de prix, de TJM, ni de nom
 * d'espace ou de client, ni de contenu de message, de note ou de CRM.
 *
 * GA-43 tient déjà la famille des tables communes (aucune colonne de portée, CHECK du seuil, jetons
 * fermés, écriture par `poolSharedCells`). Cette garde tient ce que la décision AJOUTE, en trois
 * lectures qui savent chacune dire NON :
 *  1. le SCHÉMA — le seuil du CHECK est la constante unique (pas « >= 2 »), et aucune colonne ne porte
 *     un coût, un prix, un TJM, un montant, une marge, un salaire, ni rien de `SHARED_FORBIDDEN_COLUMNS` ;
 *  2. la LECTURE — tout fichier qui lit la table passe chaque ligne par la porte `toMarketPatternLine`
 *     (forme fermée, seuil redit, libellé « observé dans N espaces ») ;
 *  3. la PORTE elle-même — un agrégat sous trois espaces, ou porteur d'un champ de coût, est refusé.
 *
 * ⚠️ La garde lit du SQL : commentaires retirés AVANT (ce docblock écrit « TJM »).
 */

const API_SRC = join(__dirname, '..')
const MIGRATIONS = join(API_SRC, 'migrations')

/** Les mots d'un prix ou d'un coût — la décision les nomme, la garde les refuse partout dans la table. */
const COST_WORDS = [
  'cost',
  'costs',
  'price',
  'prices',
  'tjm',
  'daily_rate',
  'rate',
  'amount',
  'margin',
  'salary',
  'budget',
  'revenue',
  'fee',
  'fees',
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full)
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : []
  })
}

/** Tout le SQL des `up()` qui touche la table : son `CREATE TABLE` et chaque `ALTER TABLE` ultérieur. */
function tableSql(): string {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()
    .map(name => stripComments(readFileSync(join(MIGRATIONS, name), 'utf8')).split('public async down')[0] ?? '')
    .flatMap(sql => {
      const parts: string[] = []
      const create = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${MARKET_PATTERN_TABLE}`)
      if (create >= 0) parts.push(sql.slice(create, sql.indexOf('`)', create)))
      for (const match of sql.matchAll(new RegExp(`ALTER TABLE (?:IF EXISTS )?${MARKET_PATTERN_TABLE}\\b[^\`]*`, 'g')))
        parts.push(match[0])
      return parts
    })
    .join('\n')
}

/** La règle du schéma, rejouable sur un schéma fabriqué. */
function schemaProblems(sql: string): string[] {
  const problems: string[] = []
  const threshold = /CONSTRAINT\s+[a-z0-9_]+\s+CHECK\s*\(\s*contributing_workspaces\s*>=\s*(\d+)\s*\)/i.exec(sql)
  if (!threshold) problems.push('aucun CHECK nommé sur contributing_workspaces')
  else if (Number(threshold[1]) !== SHARED_BASE_MIN_WORKSPACES)
    problems.push(`seuil ${threshold[1]} ≠ SHARED_BASE_MIN_WORKSPACES (${SHARED_BASE_MIN_WORKSPACES})`)
  const columns = [
    ...sql.matchAll(
      /(?:\(|,|ADD COLUMN (?:IF NOT EXISTS )?)\s*([a-z_]+)\s+(?:text|integer|int|bigint|uuid|numeric|jsonb|boolean|timestamptz|date)\b/gi,
    ),
  ].map(match => (match[1] ?? '').toLowerCase())
  for (const column of columns) {
    const words = column.split('_')
    if (COST_WORDS.some(word => column === word || words.includes(word) || column.endsWith(`_${word}`)))
      problems.push(`${column} — un coût, un prix ou un TJM ne s'agrège jamais entre espaces`)
    if ((SHARED_FORBIDDEN_COLUMNS as readonly string[]).includes(column))
      problems.push(`${column} — colonne de portée, d'identité ou de texte libre`)
  }
  return problems
}

/**
 * Les fichiers qui LISENT la table (un `FROM` sur elle, par son nom ou par la constante). Un `DELETE FROM`
 * n'est pas une lecture : c'est la réécriture du périmètre par l'écrivain, tenue par GA-43.
 */
function readers(): Array<{ file: string; source: string }> {
  const read = new RegExp(`(?<!DELETE\\s{1,8})FROM\\s+(?:${MARKET_PATTERN_TABLE}\\b|\\$\\{MARKET_PATTERN_TABLE\\})`)
  return sourceFiles(join(API_SRC, 'modules'))
    .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
    .filter(({ source }) => read.test(source))
}

describe('GA-416 — une tendance de marché entre espaces est un agrégat fermé, à trois espaces, sans coût', () => {
  it('LIT quelque chose — la table est créée par une migration et inscrite parmi les agrégats communs', () => {
    expect(tableSql()).toContain(`CREATE TABLE IF NOT EXISTS ${MARKET_PATTERN_TABLE}`)
    expect(SHARED_AGGREGATE_TABLES).toContain(MARKET_PATTERN_TABLE)
    expect(readers().length).toBeGreaterThan(0)
  })

  it('le schéma réel : seuil = la constante unique, aucune colonne de coût, de prix, de TJM ni d’identité', () => {
    expect(schemaProblems(tableSql())).toEqual([])
  })

  it('sait dire NON — un seuil à deux espaces, une colonne `tjm`, une colonne `workspace_id`', () => {
    const fabricated = `CREATE TABLE IF NOT EXISTS ${MARKET_PATTERN_TABLE} (scope text NOT NULL, workspace_id uuid NOT NULL, avg_tjm integer NOT NULL, CONSTRAINT k CHECK (contributing_workspaces >= 2))`
    const problems = schemaProblems(fabricated)
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('seuil 2'),
        expect.stringContaining('avg_tjm'),
        expect.stringContaining('workspace_id'),
      ]),
    )
    expect(schemaProblems(`ALTER TABLE ${MARKET_PATTERN_TABLE} ADD COLUMN IF NOT EXISTS price_band text`)).toEqual(
      expect.arrayContaining([expect.stringContaining('price_band')]),
    )
  })

  it('chaque lecteur passe les lignes par la porte `toMarketPatternLine`', () => {
    const bypass = readers().filter(({ source }) => !/\btoMarketPatternLine\s*\(/.test(source))
    expect(bypass.map(({ file }) => file)).toEqual([])
  })

  it('la porte sait dire NON — sous trois espaces, ou avec un champ de coût, rien ne se publie', () => {
    const cell = {
      topic: 'data',
      sectorKey: 'all',
      sizeBand: 'all',
      regionKey: 'all',
      observations: 5,
      contributingWorkspaces: SHARED_BASE_MIN_WORKSPACES,
    }
    expect(toMarketPatternLine(cell)?.observedIn).toBe(`observé dans ${SHARED_BASE_MIN_WORKSPACES} espaces`)
    expect(toMarketPatternLine({ ...cell, contributingWorkspaces: SHARED_BASE_MIN_WORKSPACES - 1 })).toBeNull()
    expect(toMarketPatternLine({ ...cell, tjm: 650 })).toBeNull()
    expect(toMarketPatternLine({ ...cell, cost: 1 })).toBeNull()
    expect(toMarketPatternLine({ ...cell, clientName: 'ACME' })).toBeNull()
  })
})

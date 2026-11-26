import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { WORKSPACE_PRIVATE_TABLES } from '@bellum/contracts'

/**
 * GA-415 (#4268.c, décision Louis 19/10/2026) — UN CHEMIN DE PARTAGE NE LIT JAMAIS UNE TABLE
 * PROPRE À L'ESPACE SANS BORNE D'ESPACE.
 *
 * La base commune profite à tous les espaces de ce que Bellum collecte ; elle ne transporte
 * jamais ce qui concerne l'ESN ou l'utilisateur — CRM, messages, prix et coûts d'accès,
 * corrections, plans, consultants, comptes suivis (`WORKSPACE_PRIVATE_TABLES`,
 * `packages/contracts/src/schemas/workspace-private-tables.ts`).
 *
 * La garde LIT les fichiers du module de partage (`modules/shared-base/`, specs exclues) :
 * chaque requête SQL (littéral qui porte un mot-clé SQL) et chaque jointure de QueryBuilder
 * qui nomme une table privée doit porter `workspace_id` — filtre, jointure, ou comptage par
 * espace d'un agrégat anonyme (GA-43). Seule exception : une sonde d'existence
 * (`EXISTS (SELECT 1 FROM …)`), qui ne rend aucune valeur de la table (ex. « ce champ a été
 * corrigé à la main », pour l'EXCLURE du partage).
 *
 * Elle sait dire NON (cas plantés ci-dessous), elle prouve qu'elle lit (les agrégats réels
 * nomment des tables privées), et chaque table de la liste existe dans une migration.
 */

const API_SRC = join(__dirname, '..')
const SHARING_DIR = join(API_SRC, 'modules/shared-base')
const PRIVATE = new Set<string>(Object.values(WORKSPACE_PRIVATE_TABLES).flat())

/** Les littéraux de chaîne d'un fichier TS (gabarits, simples, doubles). */
function literals(source: string): string[] {
  return (source.match(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) ?? []).map(l => l.slice(1, -1))
}

const SQL_KEYWORD = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|WHERE|JOIN)\b/
const TABLE_REF = /\b(FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/g
const QB_JOIN =
  /\.(?:innerJoin|leftJoin|innerJoinAndSelect|leftJoinAndSelect|from)\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*,\s*['"`][a-z_]+['"`]\s*(?:,\s*(['"`])((?:(?!\2)[\s\S])*)\2)?/g

/** Ce que la garde reproche à un fichier de partage. */
function violations(file: string, source: string): string[] {
  const out: string[] = []
  for (const sql of literals(source).filter(l => SQL_KEYWORD.test(l))) {
    for (const match of sql.matchAll(TABLE_REF)) {
      const table = match[2] as string
      if (!PRIVATE.has(table) || /\bworkspace_id\b/.test(sql)) continue
      const before = sql.slice(0, match.index).replace(/\s+/g, ' ')
      if (match[1] === 'FROM' && /EXISTS \(SELECT 1 $/.test(before)) continue
      out.push(`${file} : ${table} lue sans borne d'espace`)
    }
  }
  for (const match of source.matchAll(QB_JOIN)) {
    const table = match[1] as string
    if (PRIVATE.has(table) && !/\bworkspace_id\b/.test(match[3] ?? '')) {
      out.push(`${file} : ${table} jointe sans borne d'espace`)
    }
  }
  return out
}

function sharingFiles(): Array<{ file: string; source: string }> {
  return readdirSync(SHARING_DIR)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map(name => ({ file: `modules/shared-base/${name}`, source: readFileSync(join(SHARING_DIR, name), 'utf8') }))
}

describe('GA-415 — un chemin de partage ne lit jamais une table propre à l’espace sans borne d’espace (#4268.c)', () => {
  it('aucun fichier du module de partage ne lit une table privée sans `workspace_id`', () => {
    expect(sharingFiles().flatMap(({ file, source }) => violations(file, source))).toEqual([])
  })

  it('prouve qu’elle LIT : les vrais fichiers sont lus et des tables privées y sont nommées (agrégats bornés)', () => {
    const files = sharingFiles()
    expect(files.length).toBeGreaterThanOrEqual(5)
    const named = new Set(
      files.flatMap(({ source }) =>
        literals(source)
          .filter(l => SQL_KEYWORD.test(l))
          .flatMap(sql => [...sql.matchAll(TABLE_REF)].map(m => m[2] as string)),
      ),
    )
    expect([...named].filter(table => PRIVATE.has(table)).length).toBeGreaterThan(0)
  })

  it('chaque table déclarée privée existe dans une migration (la liste ne nomme pas des fantômes)', () => {
    const migrations = readdirSync(join(API_SRC, 'migrations'))
      .filter(name => name.endsWith('.ts'))
      .map(name => readFileSync(join(API_SRC, 'migrations', name), 'utf8'))
      .join('\n')
    const missing = [...PRIVATE].filter(
      table => !new RegExp(`CREATE TABLE (IF NOT EXISTS )?(public\\.)?"?${table}"?\\b`).test(migrations),
    )
    expect(missing).toEqual([])
  })

  describe('sait dire NON — cas plantés', () => {
    it('une requête sur une table privée sans `workspace_id`', () => {
      const planted = 'const q = `SELECT body FROM outreach_message_versions WHERE account_id = $1`'
      expect(violations('planté.ts', planted)).toEqual([
        "planté.ts : outreach_message_versions lue sans borne d'espace",
      ])
    })

    it('une jointure de QueryBuilder sur une table privée sans `workspace_id`', () => {
      const planted = ".innerJoin('access_facts', 'f', 'f.account_id = a.id')"
      expect(violations('planté.ts', planted)).toEqual(["planté.ts : access_facts jointe sans borne d'espace"])
    })

    it('un prix lu en clair, même à côté d’une sonde d’existence', () => {
      const planted =
        '`SELECT m.rate FROM mission_rate_history m WHERE EXISTS (SELECT 1 FROM field_provenance fp WHERE fp.entity_id = m.id)`'
      expect(violations('planté.ts', planted)).toEqual(["planté.ts : mission_rate_history lue sans borne d'espace"])
    })

    it('laisse passer : une lecture bornée, un agrégat compté par espace, une sonde d’existence', () => {
      const ok = [
        '`SELECT o.stage FROM opportunities o WHERE o.workspace_id = $1`',
        '`SELECT COUNT(DISTINCT a.workspace_id) FROM action_plan_items i JOIN accounts a ON a.id = i.account_id`',
        "`EXISTS (SELECT 1 FROM field_provenance fp WHERE fp.entity_id = c.id AND fp.source = 'human')`",
        ".innerJoin('accounts', 'a', 'a.id = c.account_id')",
      ].join('\n')
      expect(violations('ok.ts', ok)).toEqual([])
    })
  })
})

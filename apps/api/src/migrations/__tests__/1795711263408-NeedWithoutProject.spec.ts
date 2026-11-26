import type { QueryRunner } from 'typeorm'
import { NeedWithoutProject1795711263408 } from '../1795711263408-NeedWithoutProject'

/**
 * #2558.1 — UN BESOIN EXISTE SANS PROJET : la contrainte s'élargit AVANT le
 * code qui écrit (GA-11 / GA-12).
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises et
 * lit ce qu'elles DISENT. Ce qu'elle exige, dans cet ordre :
 *
 *  1. `account_id` est AJOUTÉE — c'est le lien qui remplace celui qu'on retire ;
 *  2. l'existant est REPORTÉ depuis `opportunities.account_id` AVANT tout
 *     `SET NOT NULL`, sinon le déploiement s'abandonne sur la première ligne ;
 *  3. `account_id` devient `NOT NULL` — un besoin sans compte n'a aucun sens,
 *     on ne remplace pas une contrainte par rien ;
 *  4. `project_id` devient NULLABLE — et seulement là ;
 *  5. RIEN n'est effacé : on archive, on ne supprime pas.
 */
function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function run(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new NeedWithoutProject1795711263408().up(runner)
  return queries.map(normalize)
}

const indexOf = (sql: string[], needle: string): number => sql.findIndex(q => q.includes(needle))

describe('NeedWithoutProject1795711263408', () => {
  it('lit quelque chose — la migration émet des instructions', async () => {
    expect((await run()).length).toBeGreaterThan(0)
  })

  it('ajoute `project_needs.account_id`, additive et idempotente', async () => {
    const sql = await run()
    const add = sql.find(q => q.includes('ADD COLUMN IF NOT EXISTS account_id uuid'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE project_needs')
    // Ajoutée SANS `NOT NULL` : la colonne naît vide, le report la remplit,
    // et c'est seulement ensuite qu'elle se referme.
    expect(add).not.toContain('NOT NULL')
  })

  it('REPORTE l’existant depuis le projet — chaque besoin déjà en base porte le compte de son projet', async () => {
    const sql = await run()
    const backfill = sql.find(q => /^UPDATE project_needs/i.test(q))
    expect(backfill).toBeDefined()
    expect(backfill).toContain('FROM opportunities')
    expect(backfill).toContain('account_id =')
    expect(backfill).toContain('project_id')
  })

  it('le report vient AVANT le `SET NOT NULL` — l’inverse abandonne le déploiement sur la première ligne', async () => {
    const sql = await run()
    const backfill = sql.findIndex(q => /^UPDATE project_needs/i.test(q))
    const notNull = indexOf(sql, 'ALTER COLUMN account_id SET NOT NULL')
    expect(backfill).toBeGreaterThanOrEqual(0)
    expect(notNull).toBeGreaterThan(backfill)
  })

  it('`account_id` remplace l’invariant retiré : elle est NOT NULL et référence le compte', async () => {
    const sql = await run()
    expect(indexOf(sql, 'ALTER COLUMN account_id SET NOT NULL')).toBeGreaterThanOrEqual(0)
    const fk = sql.find(q => q.includes('ADD CONSTRAINT project_needs_account_fk'))
    expect(fk).toBeDefined()
    expect(fk).toContain('REFERENCES accounts(id)')
    // La contrainte se retire AVANT de se reposer : elle ne se remplace pas en place.
    const drop = indexOf(sql, 'DROP CONSTRAINT IF EXISTS project_needs_account_fk')
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(indexOf(sql, 'ADD CONSTRAINT project_needs_account_fk')).toBeGreaterThan(drop)
  })

  it('`project_id` devient NULLABLE — c’est tout l’objet du lot', async () => {
    const sql = await run()
    expect(indexOf(sql, 'ALTER COLUMN project_id DROP NOT NULL')).toBeGreaterThanOrEqual(0)
  })

  it('le compte est INDEXÉ — la liste des besoins d’un compte ne passe plus par le projet', async () => {
    const sql = await run()
    const idx = sql.find(q => q.includes('CREATE INDEX IF NOT EXISTS project_needs_account_idx'))
    expect(idx).toBeDefined()
    expect(idx).toContain('(workspace_id, account_id)')
  })

  it('on archive, on ne supprime pas — aucun DELETE, aucun DROP COLUMN, aucun `project_id` vidé', async () => {
    const sql = await run()
    expect(sql.some(q => /^DELETE\s+FROM/i.test(q))).toBe(false)
    expect(sql.some(q => /DROP\s+COLUMN/i.test(q))).toBe(false)
    expect(sql.some(q => /SET\s+project_id\s*=\s*NULL/i.test(q))).toBe(false)
  })

  it('`down` n’est pas supporté (convention du dépôt)', async () => {
    await expect(new NeedWithoutProject1795711263408().down()).rejects.toThrow()
  })
})

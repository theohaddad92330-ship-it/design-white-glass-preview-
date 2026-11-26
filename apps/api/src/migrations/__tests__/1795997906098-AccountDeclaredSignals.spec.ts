import type { QueryRunner } from 'typeorm'
import { AccountDeclaredSignals1795997906098 } from '../1795997906098-AccountDeclaredSignals'

/**
 * #2634.1 — LinkedIn comme source de signaux d'achat, par une voie autorisée
 * (saisie manuelle, import d'un export déjà possédé par le client, ou un
 * futur connecteur officiel) — jamais un scraping.
 *
 * `accounts.declared_signals` est un JSONB SÉPARÉ de `accounts.recent_signals`
 * (que l'IA réécrit intégralement à chaque analyse) : un signal déclaré par un
 * humain doit SURVIVRE à chaque ré-analyse, exactement comme
 * `org_declared_people` (#1103) survit aux réanalyses de l'organigramme.
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises,
 * sur le modèle de `1789995163283-AccountPartnerDeclaredBy.spec.ts`.
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

async function runUp(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new AccountDeclaredSignals1795997906098().up(runner)
  return queries.map(normalize)
}

async function runDown(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new AccountDeclaredSignals1795997906098().down(runner)
  return queries.map(normalize)
}

describe('AccountDeclaredSignals1795997906098', () => {
  it('ajoute `accounts.declared_signals`, un JSONB NOT NULL DEFAULT vide', async () => {
    const sql = await runUp()
    const add = sql.find(q => q.includes('ADD COLUMN IF NOT EXISTS declared_signals jsonb'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE accounts')
    expect(add).toContain("NOT NULL DEFAULT '[]'")
  })

  it('ne BACKFILL rien — aucun signal déclaré n’existait avant cette colonne', async () => {
    const sql = await runUp()
    expect(sql.some(q => /^UPDATE\s+accounts/i.test(q))).toBe(false)
  })

  it('down retire la colonne — additive, donc réversible sans perte d’un invariant', async () => {
    const sql = await runDown()
    const drop = sql.find(q => q.includes('DROP COLUMN IF EXISTS declared_signals'))
    expect(drop).toBeDefined()
    expect(drop).toContain('ALTER TABLE accounts')
  })

  it('on archive, on ne supprime pas — `up` ne DELETE et ne DROP aucune ligne ni table', async () => {
    const sql = await runUp()
    expect(sql.some(q => /^DELETE\s+FROM/i.test(q))).toBe(false)
    expect(sql.some(q => /DROP\s+TABLE/i.test(q))).toBe(false)
  })
})

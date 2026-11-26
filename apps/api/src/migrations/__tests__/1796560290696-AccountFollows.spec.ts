import type { QueryRunner } from 'typeorm'
import { ACCOUNT_FOLLOW_ARCHIVE_REASONS } from '@bellum/contracts'
import { AccountFollows1796560290696 } from '../1796560290696-AccountFollows'

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

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new AccountFollows1796560290696().up(runner)
  return queries.map(normalize)
}

// #4267 — le suivi explicite par utilisateur. La reprise elle-même est prouvée sur une vraie base
// dans `1796560290696-AccountFollows.db.spec.ts` (opt-in) ; ici, la forme du SQL.
describe('AccountFollows1796560290696 (#4267)', () => {
  it('ajoute seulement : aucune colonne existante touchée, le statut commercial n’est pas modifié (4267.4)', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i)
    expect(flat).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(flat).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i)
    expect(flat).not.toMatch(/ALTER TABLE accounts/i)
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS account_follows')
  })

  it('chaque FK porte son ON DELETE explicite — sinon le reset démo casse en silence', async () => {
    const create = (await upQueries()).find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS account_follows'))!
    const references = create.match(/REFERENCES [a-z_.]+\(id\)[^,]*/g) ?? []
    expect(references).toHaveLength(3)
    for (const reference of references) expect(reference).toMatch(/ON DELETE CASCADE/)
  })

  it('une seule ligne par (utilisateur, compte), archivage cohérent, CHECK couvrant le contrat (GA-12)', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).toContain('CONSTRAINT account_follows_once UNIQUE (user_id, account_id)')
    expect(flat).toContain(
      'CONSTRAINT account_follows_archived_coherent CHECK ((archived_at IS NULL) = (archived_reason IS NULL))',
    )
    const check = flat.slice(flat.indexOf('account_follows_archived_reason_check'))
    for (const reason of ACCOUNT_FOLLOW_ARCHIVE_REASONS) expect(check.slice(0, 160)).toContain(`'${reason}'`)
  })

  it('RLS : ses propres suivis, dans un espace dont on est membre', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).toContain('ALTER TABLE account_follows ENABLE ROW LEVEL SECURITY')
    expect(flat).toMatch(/CREATE POLICY account_follows_own ON account_follows FOR ALL/)
    expect(flat).toMatch(/user_id = auth\.uid\(\)/)
    expect(flat).toMatch(/FROM workspace_members m WHERE m\.workspace_id = account_follows\.workspace_id/)
  })

  it('la reprise est idempotente : elle ne touche que les utilisateurs sans aucune ligne', async () => {
    const reprise = (await upQueries()).find(sql => sql.startsWith('INSERT INTO account_follows'))!
    expect(reprise).toContain('NOT EXISTS (SELECT 1 FROM account_follows f WHERE f.user_id = a.user_id)')
    expect(reprise).toContain('ON CONFLICT (user_id, account_id) DO NOTHING')
    expect(reprise).toContain('PARTITION BY a.user_id ORDER BY a.updated_at DESC')
  })

  it('down() retire seulement la table ajoutée', async () => {
    const { runner, queries } = createRunner()
    await new AccountFollows1796560290696().down(runner)
    expect(queries.map(normalize)).toEqual(['DROP TABLE IF EXISTS account_follows'])
  })
})

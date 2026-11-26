import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DataSource } from 'typeorm'
import { SqlWorkspaceMergeStore } from './workspace-merge.sql-store'

// #4158.57 — l'adaptateur SQL du rapatriement : chaque requête de données est bornée par l'espace
// qu'elle vise (source en lecture, cible en ajout), et aucune ligne existante n'est réécrite.

const SOURCE = 'aaaaaaaa-0000-4000-8000-000000000001'
const TARGET = 'bbbbbbbb-0000-4000-8000-000000000002'

type Call = { sql: string; params: unknown[] }

function fakeDataSource(answer: (sql: string) => unknown[] = () => []) {
  const calls: Call[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
    return answer(sql)
  })
  const dataSource = {
    query,
    transaction: jest.fn(async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query })),
  } as unknown as DataSource
  return { dataSource, calls }
}

const COLUMNS = ['id', 'workspace_id', 'user_id', 'company_name', 'siren', 'merged_into_id', 'business_unit_id']
const CONTACT_COLUMNS = ['id', 'workspace_id', 'account_id', 'full_name', 'email', 'email_provider_message_id']

describe('SqlWorkspaceMergeStore (#4158.57)', () => {
  it('lit la source et cherche les doublons dans la cible, chaque requête bornée par SON espace', async () => {
    const { dataSource, calls } = fakeDataSource()
    const store = new SqlWorkspaceMergeStore(dataSource)
    await store.activeAccounts(SOURCE)
    await store.activeContacts(SOURCE)
    await store.targetDuplicates(TARGET, {
      sirens: ['552100554'],
      registries: [{ country: 'BE', id: '0123' }],
      emails: ['a@b.fr'],
      linkedins: ['linkedin.com/in/x'],
    })
    expect(calls).toHaveLength(4)
    for (const [i, call] of calls.entries()) {
      expect(call.sql).toMatch(/WHERE (a|c)\.workspace_id = \$1/)
      expect(call.params[0]).toBe(i < 2 ? SOURCE : TARGET)
    }
    expect(calls[2]!.params).toEqual([TARGET, ['552100554'], ['BE|0123']])
    // Une fiche archivée, supprimée ou déjà fusionnée ne part pas et ne compte pas comme doublon.
    expect(calls[0]!.sql).toContain("NOT IN ('archived', 'deleted')")
    expect(calls[1]!.sql).toContain('c.deleted_at IS NULL AND c.merged_into_id IS NULL')
  })

  it('une étape déjà journalisée ne recopie RIEN (idempotence)', async () => {
    const { dataSource, calls } = fakeDataSource(sql =>
      sql.includes('information_schema') ? COLUMNS.map(column_name => ({ column_name })) : [],
    )
    const store = new SqlWorkspaceMergeStore(dataSource)
    const result = await store.applyStep({
      requestId: 'r1',
      sourceWorkspaceId: SOURCE,
      targetWorkspaceId: TARGET,
      table: 'accounts',
      sourceId: 'acc-1',
      outcome: 'copied',
      targetId: null,
      targetAccountId: null,
    })
    expect(result).toEqual({ state: 'already' })
    expect(calls.some(call => call.sql.startsWith('INSERT INTO accounts'))).toBe(false)
  })

  it('la copie lit la ligne DANS l’espace source, la réécrit dans la cible avec un nouvel id et sans lien vers la source', async () => {
    const { dataSource, calls } = fakeDataSource(sql => {
      if (sql.includes('information_schema')) return COLUMNS.map(column_name => ({ column_name }))
      if (sql.includes('INSERT INTO workspace_merge_items')) return [{ id: 'item-1' }]
      if (sql.includes('INSERT INTO accounts')) return [{ id: 'copy-1' }]
      return []
    })
    const store = new SqlWorkspaceMergeStore(dataSource)
    const result = await store.applyStep({
      requestId: 'r1',
      sourceWorkspaceId: SOURCE,
      targetWorkspaceId: TARGET,
      table: 'accounts',
      sourceId: 'acc-1',
      outcome: 'copied',
      targetId: null,
      targetAccountId: null,
    })
    expect(result).toEqual({ state: 'written', targetId: 'copy-1' })
    const insert = calls.find(call => call.sql.startsWith('INSERT INTO accounts'))!
    expect(insert.sql).toContain(
      'SELECT gen_random_uuid(), $3::uuid, src."user_id", src."company_name", src."siren", NULL, NULL FROM accounts src WHERE src.id = $1 AND src.workspace_id = $2',
    )
    expect(insert.params).toEqual(['acc-1', SOURCE, TARGET])
    const journal = calls.find(call => call.sql.startsWith('UPDATE workspace_merge_items'))!
    expect(journal.params).toEqual(['copy-1', 'item-1', TARGET])
  })

  it('un contact recopié est rattaché à la COPIE de son compte, jamais à une fiche de la source', async () => {
    const { dataSource, calls } = fakeDataSource(sql => {
      if (sql.includes('information_schema')) return CONTACT_COLUMNS.map(column_name => ({ column_name }))
      if (sql.includes('INSERT INTO workspace_merge_items')) return [{ id: 'item-2' }]
      if (sql.includes('INSERT INTO contacts')) return [{ id: 'copy-c' }]
      return []
    })
    const store = new SqlWorkspaceMergeStore(dataSource)
    await store.applyStep({
      requestId: 'r1',
      sourceWorkspaceId: SOURCE,
      targetWorkspaceId: TARGET,
      table: 'contacts',
      sourceId: 'c-1',
      outcome: 'copied',
      targetId: null,
      targetAccountId: 'copy-acc',
    })
    const insert = calls.find(call => call.sql.startsWith('INSERT INTO contacts'))!
    expect(insert.sql).toContain('SELECT gen_random_uuid(), $3::uuid, $4::uuid, src."full_name", src."email", NULL')
    expect(insert.params).toEqual(['c-1', SOURCE, TARGET, 'copy-acc'])
  })

  it('une ligne d’origine absente de la source n’écrit rien : le journal est annulé avec la transaction', async () => {
    const { dataSource } = fakeDataSource(sql => {
      if (sql.includes('information_schema')) return COLUMNS.map(column_name => ({ column_name }))
      if (sql.includes('INSERT INTO workspace_merge_items')) return [{ id: 'item-1' }]
      return []
    })
    const store = new SqlWorkspaceMergeStore(dataSource)
    await expect(
      store.applyStep({
        requestId: 'r1',
        sourceWorkspaceId: SOURCE,
        targetWorkspaceId: TARGET,
        table: 'accounts',
        sourceId: 'acc-tiers',
        outcome: 'copied',
        targetId: null,
        targetAccountId: null,
      }),
    ).resolves.toEqual({ state: 'missing' })
  })

  it('un doublon proposé n’écrit que sa ligne de journal — la fiche existante n’est jamais touchée', async () => {
    const { dataSource, calls } = fakeDataSource(sql =>
      sql.includes('INSERT INTO workspace_merge_items') ? [{ id: 'item-3' }] : [],
    )
    const store = new SqlWorkspaceMergeStore(dataSource)
    await store.applyStep({
      requestId: 'r1',
      sourceWorkspaceId: SOURCE,
      targetWorkspaceId: TARGET,
      table: 'accounts',
      sourceId: 'acc-1',
      outcome: 'duplicate_proposed',
      targetId: 'existing',
      targetAccountId: null,
    })
    expect(calls.filter(call => !call.sql.includes('information_schema')).map(call => call.sql.split(' (')[0])).toEqual(
      ['INSERT INTO workspace_merge_items'],
    )
  })

  it('aucune requête du fichier ne met à jour ni ne supprime une ligne de accounts / contacts / workspaces existante, hors archivage', () => {
    const source = readFileSync(join(__dirname, 'workspace-merge.sql-store.ts'), 'utf8')
    expect(source).not.toMatch(/UPDATE\s+(accounts|contacts)\b/i)
    expect(source).not.toMatch(/DELETE\s+FROM/i)
    // Le seul UPDATE de `workspaces` archive l'espace de son propriétaire.
    const updates = [...source.matchAll(/UPDATE workspaces SET[^`]*/g)].map(m => m[0])
    expect(updates).toHaveLength(1)
    expect(updates[0]).toContain('archived_at = COALESCE(archived_at, now())')
    expect(updates[0]).toContain('WHERE id = $1 AND owner_user_id = $3')
  })
})

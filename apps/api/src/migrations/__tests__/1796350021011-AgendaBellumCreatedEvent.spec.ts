import type { QueryRunner } from 'typeorm'
import { AgendaBellumCreatedEvent1796350021011 } from '../1796350021011-AgendaBellumCreatedEvent'

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

// #2770 (#2101.19/.21/.22/.37) — la table qui porte la preuve locale
// « BellumAI a écrit cet évènement », sans round-trip fournisseur.
describe('AgendaBellumCreatedEvent1796350021011', () => {
  it('creates agenda_bellum_created_event with a FK on accounts and no down-only columns', async () => {
    const { runner, queries } = createRunner()
    await new AgendaBellumCreatedEvent1796350021011().up(runner)
    const create = queries
      .map(normalize)
      .find(q => q.includes('CREATE TABLE IF NOT EXISTS agenda_bellum_created_event'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid NOT NULL')
    expect(create).toContain('account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE')
    expect(create).toContain('external_event_id text NOT NULL')
    expect(create).toContain('CONSTRAINT agenda_bellum_created_event_unique UNIQUE (user_id, external_event_id)')
  })

  it('indexes the table by user_id for the web read', async () => {
    const { runner, queries } = createRunner()
    await new AgendaBellumCreatedEvent1796350021011().up(runner)
    const index = queries
      .map(normalize)
      .find(q => q.includes('CREATE INDEX IF NOT EXISTS idx_agenda_bellum_created_event_user'))
    expect(index).toBeDefined()
    expect(index).toContain('ON agenda_bellum_created_event (user_id, created_at DESC)')
  })

  it('down() is not supported — CREATE TABLE only, append-only table', async () => {
    await expect(new AgendaBellumCreatedEvent1796350021011().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})

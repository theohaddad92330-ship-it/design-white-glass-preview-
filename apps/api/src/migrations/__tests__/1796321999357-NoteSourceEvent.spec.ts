import type { QueryRunner } from 'typeorm'
import { NoteSourceEvent1796321999357 } from '../1796321999357-NoteSourceEvent'

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

// #2103.1 — `source_event_id` : le rendez-vous d'origine d'une note, pour
// savoir si un CR existe déjà avant d'en reproposer un.
describe('NoteSourceEvent1796321999357', () => {
  it('adds source_event_id (text, nullable) on notes', async () => {
    const { runner, queries } = createRunner()
    await new NoteSourceEvent1796321999357().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD COLUMN IF NOT EXISTS source_event_id'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_event_id text')
  })

  it('adds a partial index on source_event_id', async () => {
    const { runner, queries } = createRunner()
    await new NoteSourceEvent1796321999357().up(runner)
    const index = queries.map(normalize).find(q => q.includes('CREATE INDEX'))
    expect(index).toContain('notes_source_event_id_idx ON notes (source_event_id) WHERE source_event_id IS NOT NULL')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new NoteSourceEvent1796321999357().down()).rejects.toThrow('down migrations are not supported')
  })
})

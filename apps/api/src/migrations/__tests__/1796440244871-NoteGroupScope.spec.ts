import type { QueryRunner } from 'typeorm'
import { NoteGroupScope1796440244871 } from '../1796440244871-NoteGroupScope'

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

// #3895 — la portée entité du groupe d'une note.
describe('NoteGroupScope1796440244871', () => {
  it('ajoute un tableau d’uuid VIDE par défaut : une note existante reste celle de son compte', async () => {
    const { runner, queries } = createRunner()
    await new NoteGroupScope1796440244871().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("ADD COLUMN IF NOT EXISTS also_applies_to_account_ids uuid[] NOT NULL DEFAULT '{}'")
  })

  it('borne la portée à vingt entités par une contrainte NOMMÉE, AVANT le code qui écrit (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new NoteGroupScope1796440244871().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CONSTRAINT notes_group_scope_size_check')
    expect(flat).toContain('cardinality(also_applies_to_account_ids) <= 20')
  })

  it('indexe la lecture « les notes qui valent pour CE compte »', async () => {
    const { runner, queries } = createRunner()
    await new NoteGroupScope1796440244871().up(runner)
    expect(queries.map(normalize).join(' ')).toContain('USING gin (also_applies_to_account_ids)')
  })

  it('down retire l’index, la contrainte puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new NoteGroupScope1796440244871().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP INDEX IF EXISTS notes_group_scope_idx')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS notes_group_scope_size_check')
    expect(flat).toContain('DROP COLUMN IF EXISTS also_applies_to_account_ids')
  })
})

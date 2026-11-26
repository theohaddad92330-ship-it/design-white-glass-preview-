import type { QueryRunner } from 'typeorm'
import { MESSAGE_STYLE_IMPORT_KINDS, MESSAGE_STYLE_SOURCE_TYPES } from '@bellum/contracts'
import { MessageStyleImports1796322001347 } from '../1796322001347-MessageStyleImports'

/**
 * #2369.2/.3 (épopée #2768) — LA CONTRAINTE COUVRE l'énumération TypeScript
 * AVANT le code qui écrit (GA-11/GA-12), même patron que
 * `1796321264605-MessageStyleTemplates`.
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises
 * et lit ce qu'elles DISENT.
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
  await new MessageStyleImports1796322001347().up(runner)
  return queries.map(normalize)
}

describe('MessageStyleImports1796322001347', () => {
  it('lit quelque chose — la migration émet des instructions', async () => {
    expect((await runUp()).length).toBeGreaterThan(0)
  })

  it('crée la table avec ses colonnes NOT NULL', async () => {
    const sql = await runUp()
    const create = sql.find(q => q.includes('CREATE TABLE IF NOT EXISTS message_style_imports'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid')
    expect(create).toContain('user_id      uuid NOT NULL'.replace(/\s+/g, ' '))
    expect(create).toContain('import_kind  text NOT NULL'.replace(/\s+/g, ' '))
    expect(create).toContain('source_type  text NOT NULL'.replace(/\s+/g, ' '))
    expect(create).toContain('raw_text     text NOT NULL'.replace(/\s+/g, ' '))
  })

  it('pose `message_style_imports_import_kind_check` sur les SEPT natures de #2369.3 (GA-26)', async () => {
    const sql = await runUp()
    const create = sql.find(q => q.includes('message_style_imports_import_kind_check'))
    expect(create).toBeDefined()
    for (const kind of MESSAGE_STYLE_IMPORT_KINDS) {
      expect(create).toContain(`'${kind}'`)
    }
    expect(MESSAGE_STYLE_IMPORT_KINDS.length).toBe(7)
  })

  it('pose `message_style_imports_source_type_check` sur les QUINZE sources de #2369.2 (GA-26)', async () => {
    const sql = await runUp()
    const create = sql.find(q => q.includes('message_style_imports_source_type_check'))
    expect(create).toBeDefined()
    for (const source of MESSAGE_STYLE_SOURCE_TYPES) {
      expect(create).toContain(`'${source}'`)
    }
    expect(MESSAGE_STYLE_SOURCE_TYPES.length).toBe(15)
  })

  it('active la RLS', async () => {
    const sql = await runUp()
    expect(sql.some(q => q === 'ALTER TABLE message_style_imports ENABLE ROW LEVEL SECURITY')).toBe(true)
  })

  it('`down` supprime la table — convention symétrique de `MessageStyleTemplates`', async () => {
    const { runner, queries } = createRunner()
    await new MessageStyleImports1796322001347().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS message_style_imports')
  })
})

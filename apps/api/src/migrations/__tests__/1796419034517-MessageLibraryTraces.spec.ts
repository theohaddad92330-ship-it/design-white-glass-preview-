import { getMetadataArgsStorage } from 'typeorm'
import type { QueryRunner } from 'typeorm'
import { MessageLibraryTraceEntity } from '../../database/entities/message-library-trace.entity'
import { MessageLibraryTraces1796419034517 } from '../1796419034517-MessageLibraryTraces'

/**
 * #3446.10 — preuve côté BASE : la table que la recette ne peut pas voir à
 * l'écran. Le SQL de la migration doit porter chaque colonne de l'entité que
 * `MessageLibraryService` écrit, les deux CHECK (kind, decision), la RLS et
 * l'index de lecture — sinon l'écriture de la trace échouerait en prod, en
 * silence (un échec d'écriture ne casse jamais la sélection).
 */
async function up(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new MessageLibraryTraces1796419034517().up(runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ').trim()).join(' ')
}

describe('migration MessageLibraryTraces (#3446.10)', () => {
  it('chaque colonne de l’entité existe dans la table créée', async () => {
    const sql = await up()
    const columns = getMetadataArgsStorage()
      .columns.filter(column => column.target === MessageLibraryTraceEntity)
      .map(column => column.propertyName)
    expect(columns.length).toBeGreaterThanOrEqual(14)
    const missing = columns.filter(name => !new RegExp(`\\b${name}\\s+(uuid|text|integer|jsonb|timestamptz)`).test(sql))
    expect(missing).toEqual([])
  })

  it('les CHECK reprennent exactement les valeurs écrites par le service', async () => {
    const sql = await up()
    expect(sql).toContain("CHECK (kind IN ('verbatim', 'inspiration'))")
    for (const decision of ['template_selected', 'no_template', 'examples_injected', 'no_example']) {
      expect(sql).toContain(`'${decision}'`)
    }
  })

  it('RLS activée, index de lecture par espace, aucune colonne de corps de message', async () => {
    const sql = await up()
    expect(sql).toContain('ALTER TABLE message_library_traces ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ON message_library_traces (workspace_id, created_at DESC)')
    expect(sql).not.toMatch(/\b(body|content|text_body|message_body)\b\s+(text|jsonb)/)
  })

  it('down retire la table', async () => {
    const queries: string[] = []
    const runner = { query: jest.fn(async (sql: string) => void queries.push(sql)) } as unknown as QueryRunner
    await new MessageLibraryTraces1796419034517().down(runner)
    expect(queries.join(' ')).toContain('DROP TABLE IF EXISTS message_library_traces')
  })
})

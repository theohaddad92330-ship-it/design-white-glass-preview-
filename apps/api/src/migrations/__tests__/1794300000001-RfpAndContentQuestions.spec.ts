import type { QueryRunner } from 'typeorm'
import { RfpAndContentQuestions1794300000001 } from '../1794300000001-RfpAndContentQuestions'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

const TEXT_COLUMNS = [
  'rfp_referencing_status',
  'rfp_lot_allocation',
  'rfp_response_templates',
  'rfp_volume',
  'rfp_volume_period',
  'rfp_go_no_go_process',
  'rfp_document_readiness',
  'content_audience_size',
  'content_reactions',
  'content_conversations_generated',
]

const ARRAY_COLUMNS = [
  'rfp_platforms_used',
  'rfp_outcomes',
  'content_active_profile',
  'content_visible_expertise',
  'content_funnel_stages_reached',
]

const ALL_COLUMNS = [...TEXT_COLUMNS, ...ARRAY_COLUMNS]

// #2056 (appels d'offres) / #2057 (contenu).
describe('RfpAndContentQuestions1794300000001', () => {
  it('ajoute les 15 colonnes neuves : texte NULLABLE, tableau vide par défaut', async () => {
    const { runner, queries } = createRunner()
    await new RfpAndContentQuestions1794300000001().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of TEXT_COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text;`)
    }
    for (const column of ARRAY_COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text[] NOT NULL DEFAULT '{}'`)
    }
  })

  it('est rejouable : tout passe par IF NOT EXISTS, une instruction par colonne', async () => {
    const { runner, queries } = createRunner()
    await new RfpAndContentQuestions1794300000001().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(ALL_COLUMNS.length)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre — les 15 colonnes, jamais une de plus (témoin de non-fuite)', async () => {
    const { runner, queries } = createRunner()
    await new RfpAndContentQuestions1794300000001().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ALL_COLUMNS) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(ALL_COLUMNS.length)
  })
})

import type { QueryRunner } from 'typeorm'
import { COMMERCIAL_TRANSITION_SOURCES } from '@bellum/contracts'
import { CommercialTransitionsSource1796351088561 } from '../1796351088561-CommercialTransitionsSource'

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

describe('CommercialTransitionsSource1796351088561', () => {
  it('up() ajoute la colonne source, défaut human, sans réécrire les lignes existantes', async () => {
    const { runner, queries } = createRunner()
    await new CommercialTransitionsSource1796351088561().up(runner)
    const sql = queries.map(normalize).join(' ; ')
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human'")
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/)
  })

  it('up() pose la contrainte avec EXACTEMENT les valeurs du contrat (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CommercialTransitionsSource1796351088561().up(runner)
    const sql = queries.map(normalize).join(' ; ')
    const values = COMMERCIAL_TRANSITION_SOURCES.map(v => `'${v}'`).join(', ')
    expect(sql).toContain(`ADD CONSTRAINT commercial_transitions_source_check CHECK (source IN (${values}))`)
  })

  it('down() retire la contrainte puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new CommercialTransitionsSource1796351088561().down(runner)
    const sql = queries.map(normalize).join(' ; ')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS commercial_transitions_source_check')
    expect(sql).toContain('DROP COLUMN IF EXISTS source')
  })
})

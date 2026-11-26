import type { QueryRunner } from 'typeorm'
import {
  EXPERTISE_GROUNDING_KINDS,
  EXPERTISE_GROUNDING_SOURCE_TYPES,
  EXPERTISE_GROUNDING_STATES,
  EXPERTISE_REFERENCE_CONFIDENTIALITIES,
} from '@bellum/contracts'
import { ExpertiseGroundings1796350700361 } from '../1796350700361-ExpertiseGroundings'

async function upSql(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new ExpertiseGroundings1796350700361().up(runner)
  return queries.join(' ').replace(/\s+/g, ' ')
}

describe('ExpertiseGroundings1796350700361 (#2880)', () => {
  it('crée la table, scopée à un espace, avec la RLS des membres', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS expertise_groundings')
    expect(sql).toContain('workspace_id uuid NOT NULL')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FROM workspace_members WHERE user_id = auth.uid()')
  })

  it('chaque CHECK couvre son énumération du contrat (GA-12)', async () => {
    const sql = await upSql()
    for (const value of [
      ...EXPERTISE_GROUNDING_KINDS,
      ...EXPERTISE_GROUNDING_STATES,
      ...EXPERTISE_GROUNDING_SOURCE_TYPES,
      ...EXPERTISE_REFERENCE_CONFIDENTIALITIES,
    ]) {
      expect(sql).toContain(`'${value}'`)
    }
  })

  it('« prouvé » exige un objet source, en base aussi', async () => {
    expect(await upSql()).toContain("CHECK (state <> 'proven' OR source_id IS NOT NULL)")
  })

  it('on archive, on ne supprime pas : `archived_at` existe', async () => {
    expect(await upSql()).toContain('archived_at timestamptz NULL')
  })
})

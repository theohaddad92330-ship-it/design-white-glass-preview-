import type { QueryRunner } from 'typeorm'
import { PIPELINE_DETECTION_KINDS, PIPELINE_DETECTION_STATUSES } from '@bellum/contracts'
import { PipelineDetections1796440171265 } from '../1796440171265-PipelineDetections'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

const run = async (direction: 'up' | 'down'): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new PipelineDetections1796440171265()[direction](runner)
  return queries.map(normalize).join(' ')
}

const sqlList = (values: readonly string[]): string => values.map(value => `'${value}'`).join(', ')

describe('PipelineDetections1796440171265 (#4016 L6)', () => {
  it('crée la table scopée à un espace, en cascade', async () => {
    const flat = await run('up')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS pipeline_detections')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(flat).toContain('account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE')
  })

  it('les CHECK reprennent EXACTEMENT les valeurs du contrat (GA-11/GA-12)', async () => {
    const flat = await run('up')
    expect(flat).toContain(`CHECK (kind IN (${sqlList(PIPELINE_DETECTION_KINDS)}))`)
    expect(flat).toContain(`CHECK (status IN (${sqlList(PIPELINE_DETECTION_STATUSES)}))`)
    expect(flat).toContain("status text NOT NULL DEFAULT 'detected'")
  })

  it('une source ne fait naître qu’UNE ligne par passage — un rebalayage ne double rien', async () => {
    const flat = await run('up')
    expect(flat).toContain('UNIQUE (workspace_id, kind, source_key)')
  })

  it('une décision porte son auteur et sa date, ou n’existe pas', async () => {
    const flat = await run('up')
    expect(flat).toContain(
      "(status = 'detected' AND decided_at IS NULL) OR (status <> 'detected' AND decided_at IS NOT NULL)",
    )
  })

  it('down retire la table', async () => {
    expect(await run('down')).toContain('DROP TABLE IF EXISTS pipeline_detections')
  })
})

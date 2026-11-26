import type { QueryRunner } from 'typeorm'
import { MissionTimesheetExceptions1795725435866 } from '../1795725435866-MissionTimesheetExceptions'

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

async function upSql(): Promise<string> {
  const { runner, queries } = createRunner()
  await new MissionTimesheetExceptions1795725435866().up(runner)
  return normalize(queries.join(' '))
}

// #2196.31 — l'exception « non applicable » d'un relevé, TRACÉE et RÉVERSIBLE.
describe('MissionTimesheetExceptions1795725435866', () => {
  it('crée la table à la maille mission × consultant × mois, bornée à l’espace', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mission_timesheet_exceptions')
    expect(sql).toContain('workspace_id uuid NOT NULL')
    expect(sql).toContain('mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE')
    expect(sql).toContain('consultant_id uuid')
    expect(sql).toContain('period_month date NOT NULL')
  })

  it('le MOTIF est obligatoire EN BASE — le dernier rempart, qu’aucun appelant ne contourne', async () => {
    const sql = await upSql()
    expect(sql).toContain('reason text NOT NULL')
    expect(sql).toContain('CONSTRAINT mission_timesheet_exceptions_reason_check CHECK (length(btrim(reason)) > 0)')
  })

  it('QUI et QUAND à la pose, QUI et QUAND à la révocation — les deux ensemble ou aucun', async () => {
    const sql = await upSql()
    expect(sql).toContain('created_by uuid NOT NULL')
    expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()')
    expect(sql).toContain(
      'CONSTRAINT mission_timesheet_exceptions_revoked_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))',
    )
  })

  it('la nature est une liste FERMÉE, élargie AVANT le code qui l’écrit (GA-11/GA-12)', async () => {
    const sql = await upSql()
    expect(sql).toContain("CONSTRAINT mission_timesheet_exceptions_kind_check CHECK (kind IN ('not_applicable'))")
  })

  it('une seule exception ACTIVE par maille — la révocation garde la ligne, l’index ne compte que les vivantes', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_timesheet_exceptions_active')
    expect(sql).toContain('WHERE revoked_at IS NULL')
  })

  it('RLS : lue par les membres de l’espace, jamais au-delà', async () => {
    const sql = await upSql()
    expect(sql).toContain('ALTER TABLE mission_timesheet_exceptions ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))',
    )
  })

  it('down retire la table', async () => {
    const { runner, queries } = createRunner()
    await new MissionTimesheetExceptions1795725435866().down(runner)
    expect(normalize(queries.join(' '))).toContain('DROP TABLE IF EXISTS mission_timesheet_exceptions')
  })
})

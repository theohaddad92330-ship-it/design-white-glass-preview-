import type { QueryRunner } from 'typeorm'
import { missionStatusSchema, ASSIGNMENT_STATUSES } from '@bellum/contracts'
import { MissionStatusTransitions1795999468527 } from '../1795999468527-MissionStatusTransitions'

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
  await new MissionStatusTransitions1795999468527().up(runner)
  return normalize(queries.join(' '))
}

// #2407.5 / #2407.6 — tranché par Louis 22/09 soir (decisions §9).
describe('MissionStatusTransitions1795999468527', () => {
  it('ÉLARGIT la contrainte du statut de mission AVANT le code qui l’écrit (GA-11/GA-12) — les six historiques gardés', async () => {
    const sql = await upSql()
    expect(sql).toContain('ADD CONSTRAINT missions_status_check CHECK (status IN (')
    for (const status of missionStatusSchema.options) expect(sql).toContain(`'${status}'`)
  })

  it('#2407.6 — l’affectation porte SON statut, indépendant de la mission, défaut « confirmée » pour l’existant', async () => {
    const sql = await upSql()
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'")
    expect(sql).toContain('ADD CONSTRAINT mission_assignments_status_check CHECK (status IN (')
    for (const status of ASSIGNMENT_STATUSES) expect(sql).toContain(`'${status}'`)
  })

  it('le journal des transitions : sens, motif OBLIGATOIRE sur un retour arrière, QUI et QUAND', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mission_status_transitions')
    expect(sql).toContain(
      "CONSTRAINT mission_status_transitions_subject_check CHECK (subject IN ('mission', 'assignment'))",
    )
    expect(sql).toContain(
      "CONSTRAINT mission_status_transitions_direction_check CHECK (direction IN ('forward', 'backward'))",
    )
    expect(sql).toContain(
      "CONSTRAINT mission_status_transitions_reason_check CHECK (direction <> 'backward' OR length(btrim(coalesce(reason, ''))) > 0)",
    )
    expect(sql).toContain('ALTER TABLE mission_status_transitions ENABLE ROW LEVEL SECURITY')
  })

  it('down retire le journal et la colonne, et rétablit la contrainte d’origine', async () => {
    const { runner, queries } = createRunner()
    await new MissionStatusTransitions1795999468527().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP TABLE IF EXISTS mission_status_transitions')
    expect(sql).toContain('DROP COLUMN IF EXISTS status')
  })
})

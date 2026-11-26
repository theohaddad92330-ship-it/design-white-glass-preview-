import type { QueryRunner } from 'typeorm'
import { ConsultantInterviewTraits1796373653977 } from '../1796373653977-ConsultantInterviewTraits'

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

describe('ConsultantInterviewTraits1796373653977', () => {
  it('ajoute les cinq colonnes additives, nullables, sans DEFAULT — jamais un trait ni une bande devinée', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantInterviewTraits1796373653977().up(runner)
    const flat = normalize(queries.join(' '))
    for (const fragment of [
      'ADD COLUMN IF NOT EXISTS interview_traits jsonb',
      'ADD COLUMN IF NOT EXISTS ramp_up_band text',
      'ADD COLUMN IF NOT EXISTS ramp_up_note text',
      'ADD COLUMN IF NOT EXISTS ramp_up_recorded_at timestamptz',
      'ADD COLUMN IF NOT EXISTS ramp_up_recorded_by_name text',
    ]) {
      expect(flat).toContain(fragment)
    }
    expect(flat.includes('DEFAULT')).toBe(false)
  })

  it('est idempotente (IF NOT EXISTS) — une seconde exécution ne casse rien', async () => {
    const { runner } = createRunner()
    await expect(new ConsultantInterviewTraits1796373653977().up(runner)).resolves.not.toThrow()
  })

  it('down() retire uniquement les colonnes ajoutées', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantInterviewTraits1796373653977().down(runner)
    const flat = normalize(queries.join(' '))
    for (const fragment of [
      'DROP COLUMN IF EXISTS interview_traits',
      'DROP COLUMN IF EXISTS ramp_up_band',
      'DROP COLUMN IF EXISTS ramp_up_note',
      'DROP COLUMN IF EXISTS ramp_up_recorded_at',
      'DROP COLUMN IF EXISTS ramp_up_recorded_by_name',
    ]) {
      expect(flat).toContain(fragment)
    }
  })
})

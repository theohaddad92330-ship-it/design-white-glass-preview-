import type { QueryRunner } from 'typeorm'
import { TelephonyRecordingConsentAnnounced1796440227536 } from '../1796440227536-TelephonyRecordingConsentAnnounced'

async function upSql(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new TelephonyRecordingConsentAnnounced1796440227536().up(runner)
  return queries.join('\n')
}

describe('TelephonyRecordingConsentAnnounced1796440227536 (#4016 L12)', () => {
  it('ajoute la déclaration à FAUX par défaut, et sa date NULLABLE', async () => {
    const sql = await upSql()
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS recording_consent_announced boolean NOT NULL DEFAULT false')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS recording_consent_announced_at timestamptz(?! NOT NULL)/)
  })

  it('ne réécrit AUCUNE ligne et ne touche à aucune contrainte (GA-11 / GA-12)', async () => {
    const sql = await upSql()
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|DROP |ADD CONSTRAINT/i)
  })
})

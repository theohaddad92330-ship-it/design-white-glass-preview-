import type { QueryRunner } from 'typeorm'
import { CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847 } from '../1796458312847-CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(normalize(sql))
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

describe('CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847 (#3915.1)', () => {
  it('ajoute quatre colonnes NULLABLES — ajout seulement, les lignes existantes restent valides', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847().up(runner)
    const flat = queries.join(' ')
    for (const col of ['severity', 'dedupe_key', 'expires_at', 'status']) {
      expect(flat).toContain(`ADD COLUMN IF NOT EXISTS ${col}`)
    }
    expect(flat).not.toMatch(/NOT NULL/)
  })

  it('borne le statut aux trois valeurs du contrat (TRIGGER_STATUSES)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847().up(runner)
    const flat = queries.join(' ')
    expect(flat).toContain("status IS NULL OR status IN ('open', 'acknowledged', 'resolved')")
  })

  it('down() retire ce que up() a posé', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847().down(runner)
    const flat = queries.join(' ')
    for (const col of ['severity', 'dedupe_key', 'expires_at', 'status']) {
      expect(flat).toContain(`DROP COLUMN IF EXISTS ${col}`)
    }
  })
})

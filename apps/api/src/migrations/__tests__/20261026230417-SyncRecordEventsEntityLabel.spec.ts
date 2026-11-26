import { QueryRunner } from 'typeorm'
import { SyncRecordEventsEntityLabel20261026230417 } from '../20261026230417-SyncRecordEventsEntityLabel'

// #4615 (BELLUM-API-3B) — la requête de /crm/import/status lit e.entity_label ; la colonne doit exister en base.
describe('SyncRecordEventsEntityLabel (#4615)', () => {
  it('ajoute entity_label (nullable, idempotent) sans rien supprimer', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new SyncRecordEventsEntityLabel20261026230417().up({ query } as unknown as QueryRunner)
    const sqls = query.mock.calls.map(c => String(c[0]))
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toMatch(/ALTER TABLE sync_record_events ADD COLUMN IF NOT EXISTS entity_label text\s*$/)
    expect(sqls[0]).not.toMatch(/NOT NULL|DROP/i)
  })
})

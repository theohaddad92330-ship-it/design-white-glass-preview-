import type { Repository } from 'typeorm'
import type { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import type { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { ProvenanceService } from './provenance.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const ENTITY = 'e0000000-0000-4000-8000-000000000001'

/**
 * #2327.21 — l'historique garde l'ancienne valeur, la nouvelle, la source,
 * l'auteur, la date… et la RÈGLE qui a produit l'écriture.
 */
function makeService(historyRows: unknown[] = []) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return sql.includes('FROM record_field_audit') ? historyRows : []
  })
  const manager = { query, transaction: jest.fn(async (run: (m: unknown) => Promise<void>) => run({ query })) }
  const provenance = { manager } as unknown as Repository<FieldProvenanceEntity>
  const audit = { manager } as unknown as Repository<RecordFieldAuditEntity>
  return { service: new ProvenanceService(provenance, audit), calls }
}

describe('ProvenanceService — la règle dans le journal (#2327.21)', () => {
  it('écrit la règle nommée à côté de la valeur', async () => {
    const { service, calls } = makeService()
    await service.commit({
      workspaceId: WS,
      entityType: 'consultant',
      entityId: ENTITY,
      source: 'human',
      actorId: null,
      rule: 'cv_parse.review',
      changes: [{ field: 'title', oldValue: 'Dev', newValue: 'Architecte' }],
    })
    const insert = calls.find(call => call.sql.includes('INSERT INTO record_field_audit'))
    expect(insert?.sql).toContain('rule')
    expect(insert?.params).toEqual([
      WS,
      'consultant',
      ENTITY,
      'title',
      'Dev',
      'Architecte',
      'human',
      null,
      'cv_parse.review',
      null,
    ])
  })

  it('écrit `null` quand aucune règle n’est nommée — jamais une règle devinée', async () => {
    const { service, calls } = makeService()
    await service.commit({
      workspaceId: WS,
      entityType: 'consultant',
      entityId: ENTITY,
      source: 'human',
      actorId: null,
      changes: [{ field: 'title', oldValue: null, newValue: 'Dev' }],
    })
    const insert = calls.find(call => call.sql.includes('INSERT INTO record_field_audit'))
    expect(insert?.params[8]).toBeNull()
  })

  it('#190.2 — écrit la portée DÉCLARÉE, `null` sinon (jamais devinée)', async () => {
    const { service, calls } = makeService()
    await service.commit({
      workspaceId: WS,
      entityType: 'account',
      entityId: ENTITY,
      source: 'connector',
      actorId: null,
      changes: [
        { field: 'headcount', oldValue: null, newValue: 12, scope: ' équipe Data ' },
        { field: 'headcount', oldValue: 12, newValue: 500 },
      ],
    })
    const inserts = calls.filter(call => call.sql.includes('INSERT INTO record_field_audit'))
    expect(inserts[0].sql).toContain('scope')
    expect(inserts.map(call => call.params.at(-1))).toEqual(['équipe Data', null])
  })

  it('rend la règle dans l’historique', async () => {
    const { service } = makeService([
      {
        id: 'a1',
        entityType: 'consultant',
        entityId: ENTITY,
        field: 'title',
        oldValue: null,
        newValue: 'Dev',
        source: 'human',
        actorId: null,
        firstName: null,
        lastName: null,
        email: null,
        createdAt: '2026-09-17T08:00:00.000Z',
        rule: 'talent_form',
      },
    ])
    const [entry] = await service.history(WS, 'consultant', ENTITY)
    expect(entry?.rule).toBe('talent_form')
  })
})

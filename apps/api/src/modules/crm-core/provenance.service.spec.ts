import type { Repository } from 'typeorm'
import type { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import type { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { ProvenanceService } from './provenance.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const ENTITY = 'e0000000-0000-4000-8000-000000000001'

/**
 * #2403.38 (épopée #2995) — `lastHumanCorrectionAt` : la DERNIÈRE correction
 * humaine connue sur une fiche, lue sur `record_field_audit` (déjà écrit par
 * `commit`), jamais un signal inventé.
 */
function makeService(row: { maxCreatedAt: Date | string | null } | undefined) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return row === undefined ? [] : [row]
  })
  const manager = { query }
  const provenance = { manager } as unknown as Repository<FieldProvenanceEntity>
  const audit = { manager } as unknown as Repository<RecordFieldAuditEntity>
  return { service: new ProvenanceService(provenance, audit), calls }
}

describe('ProvenanceService.lastHumanCorrectionAt (#2403.38)', () => {
  it('aucune correction humaine connue ⇒ null (comportement le plus courant)', async () => {
    const { service } = makeService({ maxCreatedAt: null })
    const result = await service.lastHumanCorrectionAt(WS, 'account', ENTITY)
    expect(result).toBeNull()
  })

  it('une ligne « aucune ligne » (jamais interrogée) rend aussi null — jamais deviné', async () => {
    const { service } = makeService(undefined)
    const result = await service.lastHumanCorrectionAt(WS, 'account', ENTITY)
    expect(result).toBeNull()
  })

  it('rend la date de la DERNIÈRE correction humaine trouvée', async () => {
    const { service } = makeService({ maxCreatedAt: new Date('2026-09-21T09:00:00.000Z') })
    const result = await service.lastHumanCorrectionAt(WS, 'account', ENTITY)
    expect(result?.toISOString()).toBe('2026-09-21T09:00:00.000Z')
  })

  it('filtre sur `source = human` — ne compte ni pipeline ni model ni connector', async () => {
    const { service, calls } = makeService({ maxCreatedAt: null })
    await service.lastHumanCorrectionAt(WS, 'account', ENTITY)
    expect(calls[0]?.sql).toContain("source = 'human'")
  })

  it('scope à l’ESPACE, exactement comme `history`', async () => {
    const { service, calls } = makeService({ maxCreatedAt: null })
    await service.lastHumanCorrectionAt(WS, 'account', ENTITY)
    expect(calls[0]?.params).toEqual(['account', ENTITY, WS])
  })
})

describe('ProvenanceService.estimatedAmong (#4016 L4)', () => {
  it('une seule requête pour la liste, filtrée sur la provenance `inferred` du champ', async () => {
    const find = jest.fn(async () => [{ entity_id: ENTITY, observed_at: new Date('2026-10-11T08:00:00.000Z') }])
    const service = new ProvenanceService(
      { find } as unknown as Repository<FieldProvenanceEntity>,
      {} as Repository<RecordFieldAuditEntity>,
    )
    const result = await service.estimatedAmong('contact', [ENTITY, 'autre'], 'email')
    expect(find).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(find.mock.calls[0])).toContain('"source":"inferred"')
    expect(result.get(ENTITY)).toBe('2026-10-11T08:00:00.000Z')
    expect(result.has('autre')).toBe(false)
  })

  it('une liste vide ne lit rien', async () => {
    const find = jest.fn()
    const service = new ProvenanceService(
      { find } as unknown as Repository<FieldProvenanceEntity>,
      {} as Repository<RecordFieldAuditEntity>,
    )
    expect((await service.estimatedAmong('contact', [], 'email')).size).toBe(0)
    expect(find).not.toHaveBeenCalled()
  })
})

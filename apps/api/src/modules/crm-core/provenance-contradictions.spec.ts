import type { Repository } from 'typeorm'
import type { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import type { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { ProvenanceService } from './provenance.service'

const ENTITY = 'e0000000-0000-4000-8000-000000000001'
const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

/**
 * #4016.L13 — « fait confirmé jusqu'à preuve contraire » : la contradiction s'écrit dans
 * `field_contradictions`, le fait confirmé n'est jamais touché, et la lecture ne rend que ce qui
 * tient encore (champ toujours confirmé à la main, aucune correction humaine postérieure).
 */
function makeService(provenanceRows: Partial<FieldProvenanceEntity>[], contradictionRows: unknown[] = []) {
  const insert = jest.fn(async () => undefined)
  const findContradictions = jest.fn(async () => contradictionRows)
  const manager = { getRepository: () => ({ insert, find: findContradictions }) }
  const provenance = {
    find: jest.fn(async () => provenanceRows),
    manager,
  } as unknown as Repository<FieldProvenanceEntity>
  const audit = {} as unknown as Repository<RecordFieldAuditEntity>
  return { service: new ProvenanceService(provenance, audit), insert, findContradictions }
}

describe('ProvenanceService — contradictions d’un fait confirmé (#4016.L13)', () => {
  it('écrit la valeur ADVERSE, sa source et l’objet — rien d’autre', async () => {
    const { service, insert } = makeService([])
    await service.recordContradictions({
      workspaceId: WORKSPACE,
      entityType: 'contact',
      entityId: ENTITY,
      source: 'pipeline',
      contradictions: [{ field: 'email', value: 'j.dupont@acme.fr' }],
    })
    expect(insert).toHaveBeenCalledWith([
      {
        workspace_id: WORKSPACE,
        entity_type: 'contact',
        entity_id: ENTITY,
        field: 'email',
        value: 'j.dupont@acme.fr',
        source: 'pipeline',
      },
    ])
  })

  it('sait dire NON : rien à écrire, aucune requête', async () => {
    const { service, insert } = makeService([])
    await service.recordContradictions({
      workspaceId: WORKSPACE,
      entityType: 'contact',
      entityId: ENTITY,
      source: 'pipeline',
      contradictions: [],
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('lit la contradiction tant que le fait confirmé tient, la tait après une correction humaine', async () => {
    const contradiction = {
      field: 'email',
      value: 'j.dupont@acme.fr',
      source: 'pipeline',
      observed_at: new Date('2026-10-10T10:00:00.000Z'),
    }
    const held = makeService(
      [{ field: 'email', source: 'human', observed_at: new Date('2026-10-01T10:00:00.000Z') }],
      [contradiction],
    )
    expect(await held.service.contradictionsFor(WORKSPACE, 'contact', ENTITY)).toEqual([
      { field: 'email', value: 'j.dupont@acme.fr', source: 'pipeline', observedAt: '2026-10-10T10:00:00.000Z' },
    ])

    const recorrected = makeService(
      [{ field: 'email', source: 'human', observed_at: new Date('2026-10-12T10:00:00.000Z') }],
      [contradiction],
    )
    expect(await recorrected.service.contradictionsFor(WORKSPACE, 'contact', ENTITY)).toEqual([])
  })
})

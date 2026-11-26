import type { Repository } from 'typeorm'
import type { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import type { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { ProvenanceService } from './provenance.service'

const ENTITY = 'e0000000-0000-4000-8000-000000000001'

/**
 * #2988 (#2161) — `currentSourcesDetailed` sert la fiche contact : source ET
 * date PAR CHAMP, pas seulement la catégorie (`currentSources`, déjà testée
 * ailleurs pour l'arbitrage d'écriture).
 */
function makeService(rows: Partial<FieldProvenanceEntity>[]) {
  const find = jest.fn(async () => rows)
  const provenance = { find } as unknown as Repository<FieldProvenanceEntity>
  const audit = {} as unknown as Repository<RecordFieldAuditEntity>
  return { service: new ProvenanceService(provenance, audit), find }
}

describe('ProvenanceService.currentSourcesDetailed (#2988, #2161)', () => {
  it('rend la source ET la date de chaque champ connu', async () => {
    const observedAt = new Date('2026-09-25T10:00:00.000Z')
    const { service } = makeService([
      { field: 'email', source: 'pipeline', observed_at: observedAt },
      { field: 'phone', source: 'human', observed_at: observedAt },
    ])

    const result = await service.currentSourcesDetailed('contact', ENTITY)

    expect(result.email).toEqual({ source: 'pipeline', observedAt: observedAt.toISOString() })
    expect(result.phone).toEqual({ source: 'human', observedAt: observedAt.toISOString() })
  })

  it('un champ sans ligne est ABSENT du résultat — jamais une provenance devinée', async () => {
    const { service } = makeService([])
    const result = await service.currentSourcesDetailed('contact', ENTITY)
    expect(result.linkedin_url).toBeUndefined()
    expect(Object.keys(result)).toHaveLength(0)
  })
})

import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { DataSource } from 'typeorm'
import { ExpertiseGroundingService } from './expertise-grounding.service'

type Handler = (sql: string, params: unknown[]) => unknown[]

function build(handler: Handler) {
  const calls: { sql: string; params: unknown[] }[] = []
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return handler(sql, params)
    }),
  } as unknown as DataSource
  return { service: new ExpertiseGroundingService(dataSource), calls }
}

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  expertise_key: 'Cloud',
  kind: 'client_reference',
  state: 'proven',
  state_source: 'user',
  source_type: 'mission',
  source_id: '22222222-2222-4222-8222-222222222222',
  label: null,
  confidentiality: 'citable',
  archived_at: null,
  created_at: '2026-09-28T10:00:00.000Z',
  updated_at: '2026-09-28T10:00:00.000Z',
}

describe('ExpertiseGroundingService (#2880)', () => {
  it('lit les lignes de l’espace, projette les réponses plates et calcule l’audit à 3 états', async () => {
    const { service, calls } = build(sql => {
      if (sql.includes('FROM expertise_groundings')) return [ROW]
      if (sql.includes('FROM missions')) return [{ id: ROW.source_id, label: 'Migration AWS — Hexa' }]
      return []
    })
    const out = await service.list('ws-1', {
      expertise_areas: ['Cloud', 'Data'],
      expertise_personal_experience: ['Data'],
      expertise_client_reference: ['Cloud'],
    })
    // la ligne stockée gagne sur la réponse plate « Cloud / référence client »
    expect(out.groundings.map(g => [g.expertiseKey, g.kind, g.id === null])).toEqual([
      ['Cloud', 'client_reference', false],
      ['Data', 'personal_experience', true],
    ])
    expect(out.groundings[0]?.sourceLabel).toBe('Migration AWS — Hexa')
    expect(out.audit.map(a => [a.expertiseKey, a.proof.status])).toEqual([
      ['Cloud', 'established'],
      ['Data', 'not_established'],
    ])
    // chaque lecture est bornée à l'espace
    for (const call of calls) expect(call.params).toContain('ws-1')
  })

  it('crée une ligne quand l’objet source appartient à l’espace', async () => {
    const { service, calls } = build(sql => {
      if (sql.includes('FROM missions')) return [{ id: ROW.source_id, label: 'M' }]
      if (sql.startsWith('INSERT')) return [{ id: ROW.id }]
      return []
    })
    await service.create('ws-1', 'user-1', {
      expertiseKey: 'Cloud',
      kind: 'client_reference',
      state: 'proven',
      sourceType: 'mission',
      sourceId: ROW.source_id,
      label: null,
      confidentiality: 'anonymizable',
    })
    const insert = calls.find(c => c.sql.startsWith('INSERT'))
    expect(insert?.params).toEqual([
      'ws-1',
      'Cloud',
      'client_reference',
      'proven',
      'mission',
      ROW.source_id,
      null,
      'anonymizable',
      'user-1',
    ])
  })

  it('refuse un objet source d’un AUTRE espace (jamais une preuve empruntée)', async () => {
    const { service } = build(() => [])
    await expect(
      service.create('ws-1', 'user-1', {
        expertiseKey: 'Cloud',
        kind: 'client_reference',
        state: 'proven',
        sourceType: 'document',
        sourceId: ROW.source_id,
        label: null,
        confidentiality: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse de retirer la source d’une ligne « prouvée » sans changer son état', async () => {
    const { service } = build(sql => (sql.includes('FROM expertise_groundings') ? [ROW] : []))
    await expect(service.update('ws-1', ROW.id, { sourceType: null, sourceId: null })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('archive, ne supprime jamais', async () => {
    const { service, calls } = build(sql => (sql.includes('FROM expertise_groundings') ? [ROW] : []))
    await service.archive('ws-1', ROW.id)
    expect(calls.some(c => /DELETE/i.test(c.sql))).toBe(false)
    expect(calls.some(c => c.sql.includes('SET archived_at = now()'))).toBe(true)
  })

  it('une ligne d’un autre espace est introuvable', async () => {
    const { service } = build(() => [])
    await expect(service.archive('ws-1', ROW.id)).rejects.toBeInstanceOf(NotFoundException)
  })
})

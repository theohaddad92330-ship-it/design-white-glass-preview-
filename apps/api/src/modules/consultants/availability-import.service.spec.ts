import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import { AvailabilityImportService } from './availability-import.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

function makeService(consultants: Partial<ConsultantEntity>[]) {
  const updates: { id: string; patch: Partial<ConsultantEntity> }[] = []
  const repo = {
    find: jest.fn(async () => consultants as ConsultantEntity[]),
    update: jest.fn(async (criteria: { id: string }, patch: Partial<ConsultantEntity>) => {
      updates.push({ id: criteria.id, patch })
    }),
  } as unknown as Repository<ConsultantEntity>
  return { service: new AvailabilityImportService(repo), updates }
}

describe('#2326.7/.9 — AvailabilityImportService — met à jour, ne crée jamais', () => {
  it('rapproche par e-mail en priorité, met à jour date et taux', async () => {
    const { service, updates } = makeService([{ id: 'c1', full_name: 'Jean Dupont', email: 'jean@acme.fr' }])
    const report = await service.importCsv(
      WORKSPACE,
      ['Nom,Email,Date de disponibilité,TJM', 'Jean D.,jean@acme.fr,01/10/2026,650'].join('\n'),
    )
    expect(report.summary).toEqual({ updated: 1, unmatched: 0, skipped: 0 })
    expect(report.outcomes).toEqual([
      { status: 'updated', line: 2, consultantId: 'c1', matchedOn: 'email', fields: ['available_from', 'tjm'] },
    ])
    expect(updates).toEqual([
      { id: 'c1', patch: { available_from: '2026-10-01', tjm: 650, availability_checked_at: expect.any(Date) } },
    ])
  })

  it('rapproche par nom quand aucun e-mail ne correspond', async () => {
    const { service, updates } = makeService([{ id: 'c2', full_name: 'Ada Lovelace', email: null }])
    const report = await service.importCsv(WORKSPACE, ['Nom,Email,TJM', 'Ada Lovelace,,700'].join('\n'))
    expect(report.outcomes).toEqual([
      { status: 'updated', line: 2, consultantId: 'c2', matchedOn: 'name', fields: ['tjm'] },
    ])
    expect(updates[0]?.patch.tjm).toBe(700)
  })

  it('ne crée JAMAIS de talent — une ligne non rapprochée est listée', async () => {
    const { service, updates } = makeService([{ id: 'c1', full_name: 'Jean Dupont', email: 'jean@acme.fr' }])
    const report = await service.importCsv(
      WORKSPACE,
      ['Nom,Email,TJM', 'Inconnu Personne,x@ailleurs.fr,500'].join('\n'),
    )
    expect(report.outcomes).toEqual([{ status: 'unmatched', line: 2, identity: 'x@ailleurs.fr', reason: 'not_found' }])
    expect(updates).toEqual([])
  })

  it('un nom ambigu (deux fiches homonymes) ne devine pas', async () => {
    const { service, updates } = makeService([
      { id: 'c1', full_name: 'Jean Dupont', email: null },
      { id: 'c2', full_name: 'Jean Dupont', email: null },
    ])
    const report = await service.importCsv(WORKSPACE, ['Nom,Email,TJM', 'Jean Dupont,,500'].join('\n'))
    expect(report.outcomes).toEqual([
      { status: 'unmatched', line: 2, identity: 'Jean Dupont', reason: 'ambiguous_name' },
    ])
    expect(updates).toEqual([])
  })

  it('une ligne malformée reste dans le rapport, jamais silencieuse', async () => {
    const { service } = makeService([{ id: 'c1', full_name: 'Jean Dupont', email: 'jean@acme.fr' }])
    const report = await service.importCsv(WORKSPACE, ['Nom,Email,TJM', ',,'].join('\n'))
    expect(report.outcomes).toEqual([{ status: 'skipped', line: 2, reason: 'malformed' }])
  })
})

import { ConflictException } from '@nestjs/common'
import { ConsultantsService } from './consultants.service'

/**
 * #4196 — un consultant en mission n'est JAMAIS archivé : le geste est refusé
 * (409) avec la date de fin, que ce soit à l'unité ou en lot.
 */
const C1 = '00000000-0000-4000-8000-0000000000c1'
const C2 = '00000000-0000-4000-8000-0000000000c2'

function build(opts: { busy: { consultant_id: string; ends_on: string | null }[]; found: string[] }) {
  const entities = opts.found.map(id => ({ id, archived_at: null, archived_reason: null }))
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(entities),
    getOne: jest.fn().mockResolvedValue(entities[0] ?? null),
  }
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    findOne: jest.fn().mockResolvedValue(entities[0] ?? null),
    save: jest.fn(async (e: unknown) => e),
    manager: {
      query: jest.fn(async () => opts.busy.map(b => ({ ...b, mission_id: 'm1', label: 'Refonte SI' }))),
    },
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  return { service, repo }
}

describe('ConsultantsService.archive — refus pendant une mission', () => {
  it('409 « en mission jusqu’au JJ/MM/AAAA » et rien n’est sauvegardé', async () => {
    const { service, repo } = build({ busy: [{ consultant_id: C1, ends_on: '2027-03-31' }], found: [C1] })
    const attempt = service.archive(C1, 'ws', 'u', null)
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(attempt).rejects.toThrow('en mission jusqu’au 31/03/2027')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('une affectation sans fin connue le dit sans inventer de date', async () => {
    const { service } = build({ busy: [{ consultant_id: C1, ends_on: null }], found: [C1] })
    await expect(service.archive(C1, 'ws', 'u', null)).rejects.toThrow('en mission (sans date de fin connue)')
  })

  it('sans affectation en cours, l’archivage passe comme avant', async () => {
    const { service, repo } = build({ busy: [], found: [C1] })
    await service.archive(C1, 'ws', 'u', 'parti')
    expect(repo.save).toHaveBeenCalled()
  })
})

describe('ConsultantsService.archiveBulk — archivage PARTIEL (#4191 G5)', () => {
  it('archive les lignes valides, REFUSE celle en mission avec sa date de fin, sans faire échouer le lot', async () => {
    const { service, repo } = build({ busy: [{ consultant_id: C2, ends_on: '2027-01-15' }], found: [C1, C2] })
    const result = await service.archiveBulk([C1, C2], 'ws', 'u', null)
    expect(result.archived).toEqual([C1])
    expect(result.refused).toEqual([{ id: C2, reason: 'on_mission', ends_on: '2027-01-15' }])
    // Seule la ligne valide est sauvegardée : on archive, on ne supprime pas.
    const saved = repo.save.mock.calls[0]?.[0] as { id: string }[]
    expect(saved.map(entity => entity.id)).toEqual([C1])
  })

  it('lot mixte : un valide, un en mission sans fin connue, un introuvable', async () => {
    const C3 = '00000000-0000-4000-8000-0000000000c3'
    const { service } = build({ busy: [{ consultant_id: C2, ends_on: null }], found: [C1, C2] })
    const result = await service.archiveBulk([C1, C2, C3], 'ws', 'u', null)
    expect(result.archived).toEqual([C1])
    expect(result.refused).toEqual([
      { id: C2, reason: 'on_mission', ends_on: null },
      { id: C3, reason: 'not_found', ends_on: null },
    ])
  })

  it('tout le lot refusé : rien n’est sauvegardé, la réponse nomme chaque refus (pas de 409)', async () => {
    const { service, repo } = build({ busy: [{ consultant_id: C1, ends_on: '2027-03-31' }], found: [C1] })
    const result = await service.archiveBulk([C1], 'ws', 'u', null)
    expect(result.archived).toEqual([])
    expect(result.refused).toEqual([{ id: C1, reason: 'on_mission', ends_on: '2027-03-31' }])
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('un consultant à plusieurs affectations en cours n’est refusé qu’UNE fois', async () => {
    const { service } = build({
      busy: [
        { consultant_id: C1, ends_on: null },
        { consultant_id: C1, ends_on: '2027-03-31' },
      ],
      found: [C1],
    })
    const result = await service.archiveBulk([C1], 'ws', 'u', null)
    expect(result.refused).toHaveLength(1)
  })
})

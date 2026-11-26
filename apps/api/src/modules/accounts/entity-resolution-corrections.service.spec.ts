import type { Repository } from 'typeorm'
import { EntityResolutionCorrectionEntity } from '../../database/entities/entity-resolution-correction.entity'
import { createMockRepository } from '../../database/test-utils'
import { EntityResolutionCorrectionsService } from './entity-resolution-corrections.service'

/**
 * #2284.67-.69 — le service de la correction d'identité versionnée.
 *
 * Ce qu'il tient : une ligne PAR GESTE (jamais d'update ni de delete — on
 * archive), la version suivante de CE compte dans CET espace, et une lecture
 * qui ne franchit jamais la frontière d'un espace.
 */
function row(version: number, overrides: Partial<EntityResolutionCorrectionEntity> = {}) {
  return {
    id: `id-${version}`,
    workspaceId: 'ws-1',
    accountId: 'acc-1',
    version,
    decision: 'rejected' as const,
    targetName: 'ORANGE BANK',
    targetSiren: '572043800',
    note: null,
    decidedBy: 'user-1',
    decidedAt: new Date('2026-09-24T08:00:00Z'),
    ...overrides,
  }
}

function build() {
  const repo = createMockRepository<EntityResolutionCorrectionEntity>()
  const service = new EntityResolutionCorrectionsService(
    repo as unknown as Repository<EntityResolutionCorrectionEntity>,
  )
  return { repo, service }
}

describe('EntityResolutionCorrectionsService', () => {
  it('#2284.68 — un geste AJOUTE la version suivante, sans toucher aux précédentes', async () => {
    const { repo, service } = build()
    repo.findOne.mockResolvedValue(row(2))

    const out = await service.record({
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      decidedBy: 'user-1',
      request: { decision: 'confirmed', target_name: 'ORANGE', target_siren: '380129866', note: '   ' },
    })

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      version: 3,
      decision: 'confirmed',
      targetName: 'ORANGE',
      targetSiren: '380129866',
      // Une suite d'espaces n'est pas une raison.
      note: null,
      decidedBy: 'user-1',
    })
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.delete).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
    expect(out).toMatchObject({ version: 3, decision: 'confirmed', target_siren: '380129866', note: null })
  })

  it('la première correction d’un compte est la version 1', async () => {
    const { repo, service } = build()
    await service.record({
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      decidedBy: 'user-1',
      request: { decision: 'rejected', target_name: 'ORANGE BANK' },
    })
    expect(repo.insert.mock.calls[0]?.[0]).toMatchObject({ version: 1, targetSiren: null })
  })

  it('la version suivante se cherche dans CET espace et pour CE compte', async () => {
    const { repo, service } = build()
    await service.record({
      workspaceId: 'ws-2',
      accountId: 'acc-9',
      decidedBy: 'user-1',
      request: { decision: 'rejected', target_name: 'X' },
    })
    expect(repo.findOne.mock.calls[0]?.[0]).toMatchObject({
      where: { workspaceId: 'ws-2', accountId: 'acc-9' },
      order: { version: 'DESC' },
    })
  })

  it('deux gestes simultanés : la collision d’unicité reprend à la version d’après, jamais deux lignes sous un numéro', async () => {
    const { repo, service } = build()
    repo.findOne.mockResolvedValueOnce(row(1)).mockResolvedValueOnce(row(2))
    repo.insert.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))

    const out = await service.record({
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      decidedBy: 'user-1',
      request: { decision: 'rejected', target_name: 'X' },
    })
    expect(repo.insert).toHaveBeenCalledTimes(2)
    expect(out.version).toBe(3)
  })

  it('une autre panne d’écriture remonte, elle n’est pas avalée', async () => {
    const { repo, service } = build()
    repo.insert.mockRejectedValueOnce(new Error('connection lost'))
    await expect(
      service.record({
        workspaceId: 'ws-1',
        accountId: 'acc-1',
        decidedBy: 'user-1',
        request: { decision: 'rejected', target_name: 'X' },
      }),
    ).rejects.toThrow('connection lost')
  })

  it('#2284.69 — la lecture est scopée à l’espace, rendue dans l’ordre des versions, au format du contrat', async () => {
    const { repo, service } = build()
    repo.find.mockResolvedValue([row(1), row(2, { decision: 'confirmed', note: 'vu au registre' })])

    const out = await service.list('ws-1', 'acc-1')

    expect(repo.find.mock.calls[0]?.[0]).toMatchObject({
      where: { workspaceId: 'ws-1', accountId: 'acc-1' },
      order: { version: 'ASC' },
    })
    expect(out).toEqual([
      {
        version: 1,
        decision: 'rejected',
        target_name: 'ORANGE BANK',
        target_siren: '572043800',
        note: null,
        decided_at: '2026-09-24T08:00:00.000Z',
      },
      {
        version: 2,
        decision: 'confirmed',
        target_name: 'ORANGE BANK',
        target_siren: '572043800',
        note: 'vu au registre',
        decided_at: '2026-09-24T08:00:00.000Z',
      },
    ])
    // L'auteur ne sort pas : la carte n'en a pas besoin, et un identifiant ne s'affiche pas.
    expect(out[0]).not.toHaveProperty('decided_by')
  })
})

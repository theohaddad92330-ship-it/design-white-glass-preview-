import { NotFoundException } from '@nestjs/common'
import { MissionDocumentsService } from './mission-documents.service'

/**
 * #2193.51 (épopée #2953) — Les DOCUMENTS d'une mission — contrat signé,
 * avenant, NDA. Même discipline que `ProjectDocumentsService`
 * (#2171.24) : bornée à l'espace ET à la mission, jamais un identifiant deviné.
 */
describe('MissionDocumentsService', () => {
  const MISSION_ID = '22222222-2222-4222-8222-222222222222'
  const ROW = {
    id: 'd-1',
    workspace_id: 'w-1',
    mission_id: MISSION_ID,
    kind: 'contract' as const,
    name: 'Contrat_MissionFiabilisation.pdf',
    status: 'sent' as const,
    created_at: new Date('2026-05-20T09:00:00.000Z'),
    updated_at: new Date('2026-05-20T09:00:00.000Z'),
  }

  function build(missionFound = true) {
    const documents = {
      find: jest.fn().mockResolvedValue([ROW]),
      save: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
    }
    const missions = { findOne: jest.fn().mockResolvedValue(missionFound ? { id: MISSION_ID } : null) }
    return { service: new MissionDocumentsService(documents as never, missions as never), documents, missions }
  }

  it('refuse une mission qui n’est pas dans l’espace — avant toute lecture', async () => {
    const { service, documents } = build(false)
    await expect(service.list('w-1', MISSION_ID)).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.find).not.toHaveBeenCalled()
  })

  it('rend les documents au format du contrat — dates en ISO, jamais un objet Date brut', async () => {
    const { service } = build()
    const items = await service.list('w-1', MISSION_ID)
    expect(items).toEqual([
      {
        id: 'd-1',
        missionId: MISSION_ID,
        kind: 'contract',
        name: 'Contrat_MissionFiabilisation.pdf',
        status: 'sent',
        createdAt: '2026-05-20T09:00:00.000Z',
        updatedAt: '2026-05-20T09:00:00.000Z',
      },
    ])
  })

  it('rend une liste VIDE pour une mission sans document — pas une erreur', async () => {
    const documents = { find: jest.fn().mockResolvedValue([]) }
    const missions = { findOne: jest.fn().mockResolvedValue({ id: MISSION_ID }) }
    const service = new MissionDocumentsService(documents as never, missions as never)
    expect(await service.list('w-1', MISSION_ID)).toEqual([])
  })

  it('crée un document en brouillon — jamais un statut « envoyé » que personne n’a affirmé', async () => {
    const documents = {
      find: jest.fn(),
      create: jest.fn((row: object) => row),
      save: jest.fn(async (row: object) => ({
        id: 'd-neuf',
        created_at: new Date('2026-09-29T09:00:00.000Z'),
        updated_at: new Date('2026-09-29T09:00:00.000Z'),
        ...row,
      })),
    }
    const missions = { findOne: jest.fn().mockResolvedValue({ id: MISSION_ID }) }
    const service = new MissionDocumentsService(documents as never, missions as never)

    const created = await service.create('w-1', MISSION_ID, { kind: 'nda', name: 'NDA_BellumAI.pdf' })

    expect(documents.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'w-1', mission_id: MISSION_ID, status: 'draft' }),
    )
    expect(created.status).toBe('draft')
  })

  it('refuse de créer sur une mission d’un AUTRE espace — avant toute écriture', async () => {
    const documents = { find: jest.fn(), save: jest.fn(), create: jest.fn() }
    const missions = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new MissionDocumentsService(documents as never, missions as never)
    await expect(service.create('w-1', MISSION_ID, { kind: 'contract', name: 'a.pdf' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(documents.save).not.toHaveBeenCalled()
  })

  it('change le statut d’un document — en le bornant à l’espace ET à la mission', async () => {
    const documents = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ ...ROW, id: 'd-1' }),
      save: jest.fn(async (row: object) => row),
    }
    const missions = { findOne: jest.fn().mockResolvedValue({ id: MISSION_ID }) }
    const service = new MissionDocumentsService(documents as never, missions as never)

    const updated = await service.updateStatus('w-1', MISSION_ID, 'd-1', 'signed')
    expect(updated.status).toBe('signed')
    expect(documents.findOne).toHaveBeenCalledWith({
      where: { id: 'd-1', workspace_id: 'w-1', mission_id: MISSION_ID },
    })
  })

  it('refuse de changer le statut d’un document introuvable sur cette mission', async () => {
    const documents = { find: jest.fn(), findOne: jest.fn().mockResolvedValue(null), save: jest.fn() }
    const missions = { findOne: jest.fn().mockResolvedValue({ id: MISSION_ID }) }
    const service = new MissionDocumentsService(documents as never, missions as never)
    await expect(service.updateStatus('w-1', MISSION_ID, 'd-1', 'signed')).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.save).not.toHaveBeenCalled()
  })
})

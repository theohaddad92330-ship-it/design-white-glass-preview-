import { NotFoundException } from '@nestjs/common'
import { ProjectDocumentsService } from './project-documents.service'

/**
 * #2171.24 — Les DOCUMENTS d'une opportunité — devis, NDA, contrat cadre.
 * Même discipline que `NeedDocumentsService` : bornée à l'espace ET à
 * l'opportunité, jamais un identifiant deviné.
 */
describe('ProjectDocumentsService', () => {
  const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
  const ROW = {
    id: 'd-1',
    workspace_id: 'w-1',
    project_id: PROJECT_ID,
    kind: 'quote' as const,
    name: 'Devis_ClientDior_20052026.pdf',
    status: 'sent' as const,
    created_at: new Date('2026-05-20T09:00:00.000Z'),
    updated_at: new Date('2026-05-20T09:00:00.000Z'),
  }

  function build(projectFound = true) {
    const documents = {
      find: jest.fn().mockResolvedValue([ROW]),
      save: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
    }
    const projects = { findOne: jest.fn().mockResolvedValue(projectFound ? { id: PROJECT_ID } : null) }
    return { service: new ProjectDocumentsService(documents as never, projects as never), documents, projects }
  }

  it('refuse une opportunité qui n’est pas dans l’espace — avant toute lecture', async () => {
    const { service, documents } = build(false)
    await expect(service.list('w-1', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.find).not.toHaveBeenCalled()
  })

  it('rend les documents au format du contrat — dates en ISO, jamais un objet Date brut', async () => {
    const { service } = build()
    const items = await service.list('w-1', PROJECT_ID)
    expect(items).toEqual([
      {
        id: 'd-1',
        projectId: PROJECT_ID,
        kind: 'quote',
        name: 'Devis_ClientDior_20052026.pdf',
        status: 'sent',
        createdAt: '2026-05-20T09:00:00.000Z',
        updatedAt: '2026-05-20T09:00:00.000Z',
      },
    ])
  })

  it('rend une liste VIDE pour une opportunité sans document — pas une erreur', async () => {
    const documents = { find: jest.fn().mockResolvedValue([]) }
    const projects = { findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID }) }
    const service = new ProjectDocumentsService(documents as never, projects as never)
    expect(await service.list('w-1', PROJECT_ID)).toEqual([])
  })

  it('crée un document en brouillon — jamais un statut « envoyé » que personne n’a affirmé', async () => {
    const documents = {
      find: jest.fn(),
      create: jest.fn((row: object) => row),
      save: jest.fn(async (row: object) => ({
        id: 'd-neuf',
        created_at: new Date('2026-09-26T09:00:00.000Z'),
        updated_at: new Date('2026-09-26T09:00:00.000Z'),
        ...row,
      })),
    }
    const projects = { findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID }) }
    const service = new ProjectDocumentsService(documents as never, projects as never)

    const created = await service.create('w-1', PROJECT_ID, { kind: 'nda', name: 'NDA_BellumAI.pdf' })

    expect(documents.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'w-1', project_id: PROJECT_ID, status: 'draft' }),
    )
    expect(created.status).toBe('draft')
  })

  it('refuse de créer sur une opportunité d’un AUTRE espace — avant toute écriture', async () => {
    const documents = { find: jest.fn(), save: jest.fn(), create: jest.fn() }
    const projects = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new ProjectDocumentsService(documents as never, projects as never)
    await expect(service.create('w-1', PROJECT_ID, { kind: 'quote', name: 'a.pdf' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(documents.save).not.toHaveBeenCalled()
  })

  it('change le statut d’un document — en le bornant à l’espace ET à l’opportunité', async () => {
    const documents = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ ...ROW, id: 'd-1' }),
      save: jest.fn(async (row: object) => row),
    }
    const projects = { findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID }) }
    const service = new ProjectDocumentsService(documents as never, projects as never)

    const updated = await service.updateStatus('w-1', PROJECT_ID, 'd-1', 'signed')
    expect(updated.status).toBe('signed')
    expect(documents.findOne).toHaveBeenCalledWith({
      where: { id: 'd-1', workspace_id: 'w-1', project_id: PROJECT_ID },
    })
  })

  it('refuse de changer le statut d’un document introuvable sur cette opportunité', async () => {
    const documents = { find: jest.fn(), findOne: jest.fn().mockResolvedValue(null), save: jest.fn() }
    const projects = { findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID }) }
    const service = new ProjectDocumentsService(documents as never, projects as never)
    await expect(service.updateStatus('w-1', PROJECT_ID, 'd-1', 'signed')).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.save).not.toHaveBeenCalled()
  })
})

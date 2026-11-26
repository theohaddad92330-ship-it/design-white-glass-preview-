import { NotFoundException } from '@nestjs/common'
import { NeedDocumentsService } from './need-documents.service'

/**
 * Les DOCUMENTS d'un besoin — lecture seule (voir le docblock du service).
 *
 * Ce que ces tests protègent : un besoin d'un AUTRE espace ne fuite jamais
 * (404 avant toute lecture des documents), et les dates repartent en ISO —
 * jamais un objet `Date` brut, que `JSON.stringify` sérialiserait pareil mais
 * que le contrat `needDocumentSchema` (une chaîne) refuserait.
 */
describe('NeedDocumentsService', () => {
  const NEED_ID = '11111111-1111-4111-8111-111111111111'
  const ROW = {
    id: 'd-1',
    workspace_id: 'w-1',
    need_id: NEED_ID,
    kind: 'quote' as const,
    name: 'Devis_ClientDior_20052026.pdf',
    status: 'sent' as const,
    created_at: new Date('2026-05-20T09:00:00.000Z'),
    updated_at: new Date('2026-05-20T09:00:00.000Z'),
  }

  function build(needFound = true) {
    const documents = { find: jest.fn().mockResolvedValue([ROW]) }
    const needs = { findOne: jest.fn().mockResolvedValue(needFound ? { id: NEED_ID } : null) }
    return { service: new NeedDocumentsService(documents as never, needs as never), documents, needs }
  }

  it('refuse un besoin qui n’est pas dans l’espace — avant toute lecture des documents', async () => {
    const { service, documents } = build(false)
    await expect(service.list('w-1', NEED_ID)).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.find).not.toHaveBeenCalled()
  })

  it('rend les documents au format du contrat — dates en ISO, jamais un objet Date brut', async () => {
    const { service } = build()
    const items = await service.list('w-1', NEED_ID)
    expect(items).toEqual([
      {
        id: 'd-1',
        needId: NEED_ID,
        kind: 'quote',
        name: 'Devis_ClientDior_20052026.pdf',
        status: 'sent',
        createdAt: '2026-05-20T09:00:00.000Z',
        updatedAt: '2026-05-20T09:00:00.000Z',
      },
    ])
  })

  it('rend une liste VIDE pour un besoin sans document — pas une erreur', async () => {
    const documents = { find: jest.fn().mockResolvedValue([]) }
    const needs = { findOne: jest.fn().mockResolvedValue({ id: NEED_ID }) }
    const service = new NeedDocumentsService(documents as never, needs as never)
    expect(await service.list('w-1', NEED_ID)).toEqual([])
  })

  /* ════════════════════════════════════════════════════════════════════ */
  /*  L'ÉCRITURE — le geste qui manquait (31/08/2026)                     */
  /* ════════════════════════════════════════════════════════════════════ */

  const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'
  const OBJECT_ID = '33333333-3333-4333-8333-333333333333'

  it('crée un document ET garde le lien vers son fichier', async () => {
    const saved = { ...ROW, id: DOCUMENT_ID, storage_object_id: OBJECT_ID, kind: 'nda' as const, status: 'draft' }
    const documents = {
      find: jest.fn(),
      save: jest.fn().mockResolvedValue(saved),
      create: jest.fn().mockImplementation((row: unknown) => row),
    }
    const needs = { findOne: jest.fn().mockResolvedValue({ id: NEED_ID }) }
    const service = new NeedDocumentsService(documents as never, needs as never)

    const created = await service.create('w-1', NEED_ID, {
      kind: 'nda',
      name: 'NDA_BellumAI.pdf',
      storageObjectId: OBJECT_ID,
    })

    expect(created.id).toBe(DOCUMENT_ID)
    // L'espace est écrit sur la ligne : une lecture ultérieure le borne dessus.
    expect(documents.save).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'w-1', need_id: NEED_ID }))
  })

  it('refuse de créer sur un besoin d’un AUTRE espace — avant toute écriture', async () => {
    const documents = { find: jest.fn(), save: jest.fn(), create: jest.fn() }
    const needs = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new NeedDocumentsService(documents as never, needs as never)
    await expect(
      service.create('w-1', NEED_ID, { kind: 'quote', name: 'a.pdf', storageObjectId: OBJECT_ID }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.save).not.toHaveBeenCalled()
  })

  it('change le statut d’un document — en le bornant à l’espace ET au besoin', async () => {
    const documents = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ ...ROW, id: DOCUMENT_ID }),
      save: jest.fn().mockImplementation((row: unknown) => Promise.resolve(row)),
    }
    const needs = { findOne: jest.fn().mockResolvedValue({ id: NEED_ID }) }
    const service = new NeedDocumentsService(documents as never, needs as never)

    const updated = await service.updateStatus('w-1', NEED_ID, DOCUMENT_ID, 'signed')
    expect(updated.status).toBe('signed')
    expect(documents.findOne).toHaveBeenCalledWith({
      where: { id: DOCUMENT_ID, workspace_id: 'w-1', need_id: NEED_ID },
    })
  })

  it('refuse de changer le statut d’un document introuvable dans l’espace', async () => {
    const documents = { find: jest.fn(), findOne: jest.fn().mockResolvedValue(null), save: jest.fn() }
    const needs = { findOne: jest.fn().mockResolvedValue({ id: NEED_ID }) }
    const service = new NeedDocumentsService(documents as never, needs as never)
    await expect(service.updateStatus('w-1', NEED_ID, DOCUMENT_ID, 'signed')).rejects.toBeInstanceOf(NotFoundException)
    expect(documents.save).not.toHaveBeenCalled()
  })

  it('rend le lien document → fichier, et SAUTE ceux qui n’en ont pas', async () => {
    const documents = {
      find: jest.fn().mockResolvedValue([
        { ...ROW, id: 'd-1', storage_object_id: OBJECT_ID },
        { ...ROW, id: 'd-2', storage_object_id: null },
      ]),
    }
    const needs = { findOne: jest.fn().mockResolvedValue({ id: NEED_ID }) }
    const service = new NeedDocumentsService(documents as never, needs as never)
    // Un document SANS fichier est une réponse — on suit l'état d'une NDA
    // qu'on n'a pas encore reçue — pas un trou à combler.
    expect(await service.objectIdsOf('w-1', NEED_ID)).toEqual(new Map([['d-1', OBJECT_ID]]))
  })
})

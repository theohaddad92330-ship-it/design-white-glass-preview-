import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { hasPermission } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { StorageService } from '../storage/storage.service'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { InvoiceAttachmentsController } from './invoice-attachments.controller'
import type { InvoiceAttachmentsService } from './invoice-attachments.service'

/**
 * #2814 — la porte des pièces jointes d'une facture préparée.
 *
 *  · LIRE (liste, téléchargement) exige `finance:read` : une pièce de facture
 *    porte le montant, l'ouvrir c'est le lire ;
 *  · ÉCRIRE (dépôt, retrait) exige `finance:write` ;
 *  · l'espace vient de la SESSION, jamais d'un paramètre ;
 *  · une mission d'un autre espace : 404 et AUCUN octet déposé ;
 *  · si le lien échoue, les octets REPARTENT ;
 *  · le téléchargement est une URL SIGNÉE courte, jamais une URL permanente ;
 *  · le mois se dit `AAAA-MM-01` — tout autre texte est refusé AVANT le service.
 */

const USER = { userId: 'u-1' } as CurrentUserPayload
const MISSION = '11111111-1111-4111-8111-111111111111'
const OBJECT = '22222222-2222-4222-8222-222222222222'
const LINK = '33333333-3333-4333-8333-333333333333'
const MONTH = '2026-09-01'
const UPLOAD = { fileName: 'BC.pdf', contentType: '', fileB64: 'JVBERi0xLjQ=' }
const STORED = {
  id: OBJECT,
  fileName: 'BC.pdf',
  contentType: 'application/pdf',
  byteSize: 8,
  retentionUntil: '2036-09-25',
  uploadedAt: '2026-09-25T10:00:00.000Z',
}

function make(options: { otherWorkspace?: boolean; linkFails?: boolean } = {}) {
  const attachments = {
    assertMission: jest.fn(async () => {
      if (options.otherWorkspace) throw new NotFoundException('Mission introuvable dans cet espace.')
    }),
    list: jest.fn(async () => []),
    link: jest.fn(async () => {
      if (options.linkFails) throw new Error('violation')
      return { ...STORED, id: LINK, downloadPath: 'x' }
    }),
    objectIdOf: jest.fn(async () => {
      if (options.otherWorkspace) throw new NotFoundException('Pièce introuvable pour cette facture.')
      return OBJECT
    }),
    unlink: jest.fn(async () => undefined),
  }
  const storage = {
    put: jest.fn(async () => STORED),
    remove: jest.fn(async () => undefined),
    signedUrlFor: jest.fn(async () => ({ url: 'https://signed', expiresAt: 'x', fileName: 'BC.pdf' })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-session' })),
  } as unknown as WorkspaceContextService
  const controller = new InvoiceAttachmentsController(
    attachments as unknown as InvoiceAttachmentsService,
    workspaceContext,
    storage as unknown as StorageService,
  )
  return { controller, attachments, storage }
}

function permissionOf(handler: unknown): unknown {
  return Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)
}

describe('InvoiceAttachmentsController — les droits (#2814)', () => {
  const proto = InvoiceAttachmentsController.prototype
  it('lire exige `finance:read`, écrire exige `finance:write`', () => {
    expect(permissionOf(proto.list)).toEqual(['finance:read'])
    expect(permissionOf(proto.download)).toEqual(['finance:read'])
    expect(permissionOf(proto.upload)).toEqual(['finance:write'])
    expect(permissionOf(proto.remove)).toEqual(['finance:write'])
  })

  it('SAIT DIRE NON — un commercial (sans droit finance) est refusé par cette matrice', () => {
    expect(hasPermission('sales', 'finance:read')).toBe(false)
    expect(hasPermission('sales', 'finance:write')).toBe(false)
    expect(hasPermission('owner', 'finance:write')).toBe(true)
  })
})

describe('InvoiceAttachmentsController — le dépôt (#2814)', () => {
  it('dépose dans le domaine `invoice_attachment`, dans l’espace de la SESSION, puis écrit le lien', async () => {
    const { controller, attachments, storage } = make()
    const file = await controller.upload(USER, MISSION, MONTH, UPLOAD)
    expect(attachments.assertMission).toHaveBeenCalledWith('ws-session', MISSION)
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-session', domain: 'invoice_attachment', uploadedBy: 'u-1' }),
    )
    expect(attachments.link).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-session', missionId: MISSION, periodMonth: MONTH, stored: STORED }),
    )
    expect(file.id).toBe(LINK)
  })

  it('SAIT DIRE NON — une mission d’un AUTRE espace : 404, et aucun octet déposé', async () => {
    const { controller, storage } = make({ otherWorkspace: true })
    await expect(controller.upload(USER, MISSION, MONTH, UPLOAD)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('si le lien ne s’écrit pas, les octets REPARTENT et l’erreur d’origine remonte', async () => {
    const { controller, storage } = make({ linkFails: true })
    await expect(controller.upload(USER, MISSION, MONTH, UPLOAD)).rejects.toThrow('violation')
    expect(storage.remove).toHaveBeenCalledWith('ws-session', OBJECT)
  })
})

describe('InvoiceAttachmentsController — lire et retirer (#2814)', () => {
  it('ouvre une pièce par une URL SIGNÉE, après l’avoir retrouvée DANS l’espace', async () => {
    const { controller, attachments, storage } = make()
    const signed = await controller.download(USER, MISSION, MONTH, LINK)
    expect(attachments.objectIdOf).toHaveBeenCalledWith('ws-session', MISSION, MONTH, LINK)
    expect(storage.signedUrlFor).toHaveBeenCalledWith('ws-session', OBJECT)
    expect(signed.url).toBe('https://signed')
  })

  it('SAIT DIRE NON — une pièce d’un autre espace : 404, aucune URL signée, rien retiré', async () => {
    const { controller, storage, attachments } = make({ otherWorkspace: true })
    await expect(controller.download(USER, MISSION, MONTH, LINK)).rejects.toBeInstanceOf(NotFoundException)
    await expect(controller.remove(USER, MISSION, MONTH, LINK)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.signedUrlFor).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
    expect(attachments.unlink).not.toHaveBeenCalled()
  })

  it('retire les octets PUIS le lien', async () => {
    const { controller, storage, attachments } = make()
    await controller.remove(USER, MISSION, MONTH, LINK)
    expect(storage.remove).toHaveBeenCalledWith('ws-session', OBJECT)
    expect(attachments.unlink).toHaveBeenCalledWith('ws-session', LINK)
    expect(storage.remove.mock.invocationCallOrder[0]).toBeLessThan(attachments.unlink.mock.invocationCallOrder[0] ?? 0)
  })

  it('la liste lit l’espace de la SESSION', async () => {
    const { controller, attachments } = make()
    await expect(controller.list(USER, MISSION, MONTH)).resolves.toEqual({ files: [] })
    expect(attachments.list).toHaveBeenCalledWith('ws-session', MISSION, MONTH)
  })

  it('SAIT DIRE NON — un mois mal formé est refusé avant le service', async () => {
    const { controller, attachments } = make()
    await expect(controller.list(USER, MISSION, '2026-09-15')).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.list(USER, MISSION, '..%2F')).rejects.toBeInstanceOf(BadRequestException)
    expect(attachments.list).not.toHaveBeenCalled()
  })
})

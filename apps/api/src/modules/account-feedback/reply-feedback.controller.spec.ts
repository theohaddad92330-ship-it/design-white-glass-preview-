import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { ReplyFeedbackAck } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { OrgGraphVersionService } from '../org-graph/org-graph.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { AccountFeedbackService } from './account-feedback.service'
import type { CreateReplyFeedbackDto } from './dto/reply-feedback.dto'
import { ReplyFeedbackController } from './reply-feedback.controller'
import type { ReplyFeedbackService } from './reply-feedback.service'

const ACCOUNT = '5b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const DIGEST = '1a93ea25d9ba5927'

describe('ReplyFeedbackController — #1919', () => {
  const user = { userId: 'u-1', email: 'u@example.com' } as CurrentUserPayload
  const ack: ReplyFeedbackAck = {
    item: {
      id: 'rf-1',
      replyDigest: DIGEST,
      verdict: 'pas_pertinent',
      reason: 'mauvais_timing',
      category: null,
      accountCorrected: false,
      createdAt: '2026-09-13T08:00:00.000Z',
    },
    preferenceSuggestion: null,
  }

  function build(opts: { targetsInWorkspace?: boolean; canWriteRecords?: boolean } = {}) {
    const replyFeedback = {
      assertTargetsInWorkspace: jest.fn(async () => {
        if (opts.targetsInWorkspace === false) throw new NotFoundException('Compte introuvable')
      }),
      create: jest.fn().mockResolvedValue(ack),
      listMine: jest.fn().mockResolvedValue([ack.item]),
      withdraw: jest.fn().mockResolvedValue(true),
    }
    const accountFeedback = {
      create: jest.fn().mockResolvedValue({ id: 'af-1' }),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'viewer' }),
      assertPermission: jest.fn(async () => {
        if (opts.canWriteRecords === false) throw new ForbiddenException('Rôle insuffisant pour cette action')
      }),
    }
    const orgGraph = { recordCorrection: jest.fn().mockResolvedValue(null) }
    const controller = new ReplyFeedbackController(
      replyFeedback as unknown as ReplyFeedbackService,
      accountFeedback as unknown as AccountFeedbackService,
      workspaceContext as unknown as WorkspaceContextService,
      orgGraph as unknown as OrgGraphVersionService,
    )
    return { replyFeedback, accountFeedback, workspaceContext, orgGraph, controller }
  }

  it('estampille l’auteur du JWT et l’espace actif — jamais une valeur du corps', async () => {
    const { replyFeedback, workspaceContext, controller } = build()
    const dto = { replyDigest: DIGEST, verdict: 'pas_pertinent', reason: 'mauvais_timing' } as CreateReplyFeedbackDto
    const result = await controller.create(user, dto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(replyFeedback.create).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-1',
      body: dto,
      accountFeedbackId: null,
    })
    expect(result).toBe(ack)
  })

  it('un retour personnel ne demande AUCUNE permission d’espace — un lecteur peut dire « pas pertinent »', async () => {
    const { workspaceContext, accountFeedback, controller } = build()
    await controller.create(user, { replyDigest: DIGEST, verdict: 'utile' } as CreateReplyFeedbackDto)
    expect(workspaceContext.assertPermission).not.toHaveBeenCalled()
    expect(accountFeedback.create).not.toHaveBeenCalled()
  })

  it('#1919.7 — une correction limitée à la réponse n’écrit rien dans le dossier', async () => {
    const { accountFeedback, orgGraph, controller } = build()
    await controller.create(user, {
      replyDigest: DIGEST,
      verdict: 'donnee_fausse',
      accountId: ACCOUNT,
      correction: { field: 'Le DSI', value: 'Claire Martin', scope: 'reply' },
    } as CreateReplyFeedbackDto)
    expect(accountFeedback.create).not.toHaveBeenCalled()
    expect(orgGraph.recordCorrection).not.toHaveBeenCalled()
  })

  it('#1919.7 — une correction du DOSSIER passe par la porte existante, après la permission `records:write`', async () => {
    const { replyFeedback, accountFeedback, workspaceContext, orgGraph, controller } = build()
    await controller.create(user, {
      replyDigest: DIGEST,
      verdict: 'donnee_fausse',
      accountId: ACCOUNT,
      correction: { field: 'Le DSI', value: 'Claire Martin', scope: 'account' },
    } as CreateReplyFeedbackDto)

    expect(workspaceContext.assertPermission).toHaveBeenCalledWith('u-1', 'ws-1', 'records:write')
    // Le mécanisme de « Signaler › Faux » du dossier, pas une écriture parallèle.
    expect(accountFeedback.create).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      workspaceId: 'ws-1',
      userId: 'u-1',
      target: 'global',
      targetRef: 'Le DSI',
      verdict: 'faux',
      note: 'Claire Martin',
    })
    expect(orgGraph.recordCorrection).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      target: 'global',
      targetRef: 'Le DSI',
      verdict: 'faux',
    })
    const permissionOrder = workspaceContext.assertPermission.mock.invocationCallOrder[0] ?? Infinity
    const writeOrder = accountFeedback.create.mock.invocationCallOrder[0] ?? -Infinity
    expect(permissionOrder).toBeLessThan(writeOrder)
    expect(replyFeedback.create).toHaveBeenCalledWith(expect.objectContaining({ accountFeedbackId: 'af-1' }))
  })

  it('sait dire NON — sans `records:write`, rien n’est écrit, ni dans le dossier ni dans la mémoire', async () => {
    const { replyFeedback, accountFeedback, controller } = build({ canWriteRecords: false })
    await expect(
      controller.create(user, {
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        accountId: ACCOUNT,
        correction: { field: 'Le DSI', scope: 'account' },
      } as CreateReplyFeedbackDto),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(accountFeedback.create).not.toHaveBeenCalled()
    expect(replyFeedback.create).not.toHaveBeenCalled()
  })

  it('un compte hors de l’espace rend 404 avant toute écriture', async () => {
    const { replyFeedback, accountFeedback, controller } = build({ targetsInWorkspace: false })
    await expect(
      controller.create(user, { replyDigest: DIGEST, verdict: 'utile', accountId: ACCOUNT } as CreateReplyFeedbackDto),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(replyFeedback.create).not.toHaveBeenCalled()
    expect(accountFeedback.create).not.toHaveBeenCalled()
  })

  it('#1919.17 — relit les retours de la personne pour les montrer sous leurs réponses', async () => {
    const { replyFeedback, controller } = build()
    expect(await controller.listMine(user)).toEqual({ items: [ack.item] })
    expect(replyFeedback.listMine).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u-1' })
  })

  it('retirer un retour qui n’est pas le sien (ou déjà retiré) rend 404', async () => {
    const { replyFeedback, controller } = build()
    replyFeedback.withdraw.mockResolvedValue(false)
    await expect(controller.withdraw('rf-1', user)).rejects.toBeInstanceOf(NotFoundException)
    expect(replyFeedback.withdraw).toHaveBeenCalledWith({ id: 'rf-1', workspaceId: 'ws-1', userId: 'u-1' })
  })
})

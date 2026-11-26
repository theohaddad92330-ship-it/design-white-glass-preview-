import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { OrgGraphVersionService } from '../org-graph/org-graph.service'
import { AccountFeedbackController } from './account-feedback.controller'
import type { AccountFeedbackService } from './account-feedback.service'
import type { CreateAccountFeedbackDto } from './dto/account-feedback.dto'

describe('AccountFeedbackController', () => {
  const user = { userId: 'u-1', email: 'u@example.com' } as CurrentUserPayload
  const dto = { target: 'play', targetRef: 'Play cyber', verdict: 'inutile' } as CreateAccountFeedbackDto

  function build(opts: { accountInWorkspace?: boolean } = {}) {
    const feedback = {
      create: jest.fn().mockResolvedValue({
        id: 'fb-1',
        target: 'play',
        targetRef: 'Play cyber',
        verdict: 'inutile',
        note: null,
        createdAt: '2026-07-16T08:00:00.000Z',
      }),
      listForAccount: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<AccountFeedbackService, 'create' | 'listForAccount'>>
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
    } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace'>>
    const accounts = {
      findOne: jest.fn().mockResolvedValue(opts.accountInWorkspace === false ? null : { id: 'acc-1' }),
    } as unknown as jest.Mocked<Pick<Repository<AccountEntity>, 'findOne'>>
    const orgGraph = {
      recordCorrection: jest.fn().mockResolvedValue({ graphVersion: 2, rejected: null }),
    } as unknown as jest.Mocked<Pick<OrgGraphVersionService, 'recordCorrection'>>
    const controller = new AccountFeedbackController(
      feedback as unknown as AccountFeedbackService,
      workspaceContext as unknown as WorkspaceContextService,
      accounts as unknown as Repository<AccountEntity>,
      orgGraph as unknown as OrgGraphVersionService,
    )
    return { feedback, workspaceContext, accounts, orgGraph, controller }
  }

  it('records feedback stamped from the JWT user + resolved workspace (never the body)', async () => {
    const { feedback, workspaceContext, accounts, controller } = build()
    const result = await controller.create('acc-1', user, dto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 'acc-1', workspace_id: 'ws-1' } })
    expect(feedback.create).toHaveBeenCalledWith({
      accountId: 'acc-1',
      workspaceId: 'ws-1',
      userId: 'u-1',
      target: 'play',
      targetRef: 'Play cyber',
      verdict: 'inutile',
      note: undefined,
    })
    expect(result.item.id).toBe('fb-1')
  })

  it("404s when the account is not in the caller's workspace (write)", async () => {
    const { feedback, controller } = build({ accountInWorkspace: false })
    await expect(controller.create('acc-other-team', user, dto)).rejects.toBeInstanceOf(NotFoundException)
    expect(feedback.create).not.toHaveBeenCalled()
  })

  it("404s when the account is not in the caller's workspace (read)", async () => {
    const { feedback, controller } = build({ accountInWorkspace: false })
    await expect(controller.list('acc-other-team', user)).rejects.toBeInstanceOf(NotFoundException)
    expect(feedback.listForAccount).not.toHaveBeenCalled()
  })

  it('fait produire une nouvelle version du graphe par la correction (Annexe Organigramme p30)', async () => {
    const { orgGraph, controller } = build()
    await controller.create('acc-1', user, dto)
    expect(orgGraph.recordCorrection).toHaveBeenCalledWith({
      accountId: 'acc-1',
      target: 'play',
      targetRef: 'Play cyber',
      verdict: 'inutile',
    })
  })

  it("ne versionne rien quand le compte n'est pas au workspace de l'appelant", async () => {
    const { orgGraph, controller } = build({ accountInWorkspace: false })
    await expect(controller.create('acc-other-team', user, dto)).rejects.toBeInstanceOf(NotFoundException)
    expect(orgGraph.recordCorrection).not.toHaveBeenCalled()
  })

  it('lists the account feedback scoped by workspace', async () => {
    const { feedback, controller } = build()
    const result = await controller.list('acc-1', user)
    expect(feedback.listForAccount).toHaveBeenCalledWith('acc-1', 'ws-1')
    expect(result.items).toEqual([])
  })
})

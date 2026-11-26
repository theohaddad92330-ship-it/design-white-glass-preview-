import { BadRequestException, NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { AccountsService } from './accounts.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { BusinessUnitService } from '../business-unit/business-unit.service'
import { EntityResolutionCorrectionsController } from './entity-resolution-corrections.controller'
import type { EntityResolutionCorrectionsService } from './entity-resolution-corrections.service'

/**
 * #2284.65 / .67-.69 — la porte HTTP du geste « c'est bien celle-ci » /
 * « ce n'est pas celle-ci » de la carte « Entité résolue ».
 */
const USER = { userId: 'user-1' } as never
const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function build(visible = true) {
  const corrections = {
    list: jest.fn().mockResolvedValue([]),
    record: jest.fn().mockResolvedValue({ version: 1 }),
  }
  const accounts = {
    findOneForWorkspace: jest
      .fn()
      .mockResolvedValue(visible ? success({ id: ACCOUNT }) : failure({ code: 'not_found', message: 'absent' })),
  }
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-token' }) }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }
  const controller = new EntityResolutionCorrectionsController(
    corrections as unknown as EntityResolutionCorrectionsService,
    accounts as unknown as AccountsService,
    workspace as unknown as WorkspaceContextService,
    businessUnits as unknown as BusinessUnitService,
  )
  return { controller, corrections, accounts }
}

describe('EntityResolutionCorrectionsController', () => {
  it('écrit la décision avec l’espace et l’auteur du JETON, jamais ceux du corps', async () => {
    const { controller, corrections } = build()
    await controller.record(ACCOUNT, USER, {
      decision: 'confirmed',
      target_name: 'ORANGE',
      target_siren: '380129866',
      workspace_id: 'ws-forged',
      decided_by: 'someone-else',
    })
    expect(corrections.record).toHaveBeenCalledWith({
      workspaceId: 'ws-token',
      accountId: ACCOUNT,
      decidedBy: 'user-1',
      request: { decision: 'confirmed', target_name: 'ORANGE', target_siren: '380129866' },
    })
  })

  it('un compte hors de l’espace (ou du périmètre) rend 404, et RIEN n’est écrit', async () => {
    const { controller, corrections } = build(false)
    await expect(controller.record(ACCOUNT, USER, { decision: 'rejected', target_name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(corrections.record).not.toHaveBeenCalled()
  })

  it('un corps illisible rend 400 avec une raison lisible, pas un 500', async () => {
    const { controller, corrections } = build()
    await expect(controller.record(ACCOUNT, USER, { decision: 'merge', target_name: 'X' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(corrections.record).not.toHaveBeenCalled()
  })

  it('la lecture passe par la même porte de périmètre', async () => {
    const { controller, corrections } = build(false)
    await expect(controller.list(ACCOUNT, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(corrections.list).not.toHaveBeenCalled()
  })

  it('la lecture rend l’historique de l’espace du jeton', async () => {
    const { controller, corrections } = build()
    await controller.list(ACCOUNT, USER)
    expect(corrections.list).toHaveBeenCalledWith('ws-token', ACCOUNT)
  })
})

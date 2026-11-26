import { BadRequestException, NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { ContactsService } from './contacts.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { BusinessUnitService } from '../business-unit/business-unit.service'
import { ContactResolutionCorrectionsController } from './contact-resolution-corrections.controller'
import type { ContactResolutionCorrectionsService } from './contact-resolution-corrections.service'

/**
 * #2159.35 — la porte HTTP du geste « ce n'est pas la même personne » sur un
 * contact rapproché par un import. Même patron que
 * `EntityResolutionCorrectionsController` (comptes) : l'espace et l'auteur
 * viennent du JETON, jamais du corps.
 */
const USER = { userId: 'user-1' } as never
const CONTACT = '11111111-1111-4111-8111-111111111111'

function build(visible = true) {
  const corrections = {
    list: jest.fn().mockResolvedValue([]),
    record: jest.fn().mockResolvedValue({ version: 1 }),
  }
  const contactsService = {
    findOne: jest
      .fn()
      .mockResolvedValue(visible ? success({ id: CONTACT }) : failure({ code: 'not_found', message: 'absent' })),
  }
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-token' }) }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }
  const controller = new ContactResolutionCorrectionsController(
    corrections as unknown as ContactResolutionCorrectionsService,
    contactsService as unknown as ContactsService,
    workspace as unknown as WorkspaceContextService,
    businessUnits as unknown as BusinessUnitService,
  )
  return { controller, corrections, contactsService }
}

describe('ContactResolutionCorrectionsController', () => {
  it('écrit la décision avec l’espace et l’auteur du JETON, jamais ceux du corps', async () => {
    const { controller, corrections } = build()
    await controller.record(CONTACT, USER, {
      decision: 'rejected',
      note: 'Standard accueil, pas la même personne',
      workspace_id: 'ws-forged',
      decided_by: 'someone-else',
    })
    expect(corrections.record).toHaveBeenCalledWith({
      workspaceId: 'ws-token',
      contactId: CONTACT,
      decidedBy: 'user-1',
      request: { decision: 'rejected', note: 'Standard accueil, pas la même personne' },
    })
  })

  it('un contact hors de l’espace (ou du périmètre) rend 404, et RIEN n’est écrit', async () => {
    const { controller, corrections } = build(false)
    await expect(controller.record(CONTACT, USER, { decision: 'rejected' })).rejects.toBeInstanceOf(NotFoundException)
    expect(corrections.record).not.toHaveBeenCalled()
  })

  it('un corps illisible rend 400 avec une raison lisible, pas un 500', async () => {
    const { controller, corrections } = build()
    await expect(controller.record(CONTACT, USER, { decision: 'merge' })).rejects.toBeInstanceOf(BadRequestException)
    expect(corrections.record).not.toHaveBeenCalled()
  })

  it('la lecture passe par la même porte de périmètre', async () => {
    const { controller, corrections } = build(false)
    await expect(controller.list(CONTACT, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(corrections.list).not.toHaveBeenCalled()
  })

  it('la lecture rend l’historique de l’espace du jeton', async () => {
    const { controller, corrections } = build()
    await controller.list(CONTACT, USER)
    expect(corrections.list).toHaveBeenCalledWith('ws-token', CONTACT)
  })
})

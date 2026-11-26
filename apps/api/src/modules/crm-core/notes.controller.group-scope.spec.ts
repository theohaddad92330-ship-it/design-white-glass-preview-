import { ServiceUnavailableException } from '@nestjs/common'
import { NotesController } from './crm-core.controller'

const USER = { userId: 'user-1' } as never
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const BU = '44444444-4444-4444-8444-444444444444'

function build(businessUnits?: { scopeFor: jest.Mock }) {
  const notes = { groupEntities: jest.fn(async () => []), list: jest.fn(async () => []) }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })) }
  const controller = new NotesController(notes as never, workspaceContext as never, businessUnits as never)
  return { controller, notes }
}

describe('#4158.62 — NotesController : le périmètre BU est résolu au bord', () => {
  it('passe le périmètre du lecteur au service', async () => {
    const scope = { businessUnitIds: [BU], includeUnassigned: true }
    const { controller, notes } = build({ scopeFor: jest.fn(async () => scope) })
    await controller.groupEntities(USER, ACCOUNT)
    expect(notes.groupEntities).toHaveBeenCalledWith('user-1', ACCOUNT, scope)
  })

  it('sans service BU câblé : LÈVE (fail-closed), ne sert jamais tout l’espace', async () => {
    const { controller, notes } = build(undefined)
    await expect(controller.groupEntities(USER, ACCOUNT)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(notes.groupEntities).not.toHaveBeenCalled()
  })
  it('list : les notes d’un COMPTE passent le périmètre BU du lecteur', async () => {
    const scope = { businessUnitIds: [BU], includeUnassigned: true }
    const { controller, notes } = build({ scopeFor: jest.fn(async () => scope) })
    await controller.list(USER, { entityType: 'account', entityId: ACCOUNT } as never)
    expect(notes.list).toHaveBeenCalledWith('user-1', 'account', ACCOUNT, scope)
  })

  it('list : sans service BU câblé, les notes d’un compte LÈVENT au lieu de servir tout l’espace', async () => {
    const { controller, notes } = build(undefined)
    await expect(controller.list(USER, { entityType: 'account', entityId: ACCOUNT } as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(notes.list).not.toHaveBeenCalled()
  })

  it('list : un autre objet (contact…) ne résout aucun périmètre', async () => {
    const scopeFor = jest.fn()
    const { controller, notes } = build({ scopeFor })
    await controller.list(USER, { entityType: 'contact', entityId: ACCOUNT } as never)
    expect(scopeFor).not.toHaveBeenCalled()
    expect(notes.list).toHaveBeenCalledWith('user-1', 'contact', ACCOUNT, null)
  })
})

describe('#4158.58 — NotesController.create : le périmètre BU du rédacteur suit l’écriture', () => {
  it('une note sur un COMPTE passe le périmètre au service', async () => {
    const scope = { businessUnitIds: [BU], includeUnassigned: true }
    const { controller, notes } = build({ scopeFor: jest.fn(async () => scope) })
    ;(notes as { create?: jest.Mock }).create = jest.fn(async () => ({}))
    await controller.create(USER, { entityType: 'account', entityId: ACCOUNT, body: 'x' } as never)
    expect((notes as unknown as { create: jest.Mock }).create).toHaveBeenCalledWith(
      'user-1',
      { entityType: 'account', entityId: ACCOUNT, body: 'x' },
      { scope },
    )
  })

  it('sans service BU câblé, une note sur un compte LÈVE (fail-closed)', async () => {
    const { controller, notes } = build(undefined)
    ;(notes as { create?: jest.Mock }).create = jest.fn(async () => ({}))
    await expect(
      controller.create(USER, { entityType: 'account', entityId: ACCOUNT, body: 'x' } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

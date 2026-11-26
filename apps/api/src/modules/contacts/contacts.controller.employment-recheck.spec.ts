import { ContactsController } from './contacts.controller'
import type { ContactsService } from './contacts.service'
import type { EmploymentRecheckRequester } from './employment-recheck.requester'

// #4286.13 — l'ouverture d'une fiche enfile la relecture, sans jamais l'attendre.
function controllerWith(requestIfDue: jest.Mock) {
  const contact = { id: 'c-1', workspace_id: 'ws-1', raw_data: { apolloId: 'p1' } }
  const contactsService = { findOne: jest.fn().mockResolvedValue({ type: 'success', output: contact }) }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }
  const args: unknown[] = [contactsService as unknown as ContactsService, {} as never]
  args[2] = workspaceContext
  args[3] = businessUnits
  args[7] = { requestIfDue } as unknown as EmploymentRecheckRequester
  return {
    controller: new (ContactsController as unknown as new (...a: unknown[]) => ContactsController)(...args),
    contact,
  }
}

describe('ContactsController.findOne — relecture d’employeur (#4286.13)', () => {
  it('demande la relecture avec l’espace et le contact, sans attendre sa fin', async () => {
    const requestIfDue = jest.fn().mockReturnValue(new Promise(() => undefined)) // ne se résout jamais
    const { controller, contact } = controllerWith(requestIfDue)
    const result = await controller.findOne('c-1', { userId: 'u1' } as never)
    expect(result).toBe(contact)
    expect(requestIfDue).toHaveBeenCalledWith('ws-1', contact)
  })
})

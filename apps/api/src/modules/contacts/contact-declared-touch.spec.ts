import { ContactsService } from './contacts.service'
import { resolveBrand } from '@bellum/contracts'

const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * #4418.1 / #4418.3 — « Marquer envoyé » depuis le panneau d'un message préparé au plan d'un contact.
 * Le geste n'existait qu'au pas d'une séquence : ce chemin-ci pose les MÊMES relances J+3/J+6/J+9
 * (`CadenceService.scheduleForContact`), ancrées sur le jour du geste, SANS aucune preuve d'envoi.
 */
describe('relances d’un geste déclaratif « Marquer envoyé » (#4418.1)', () => {
  let repo: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock }
  let cadence: { scheduleForContact: jest.Mock }
  let service: ContactsService

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'c-1', user_id: 'u-1', account_id: 'a-1', email_sent_at: null }),
      update: jest.fn(),
      save: jest.fn(),
    }
    cadence = { scheduleForContact: jest.fn().mockResolvedValue(undefined) }
    const filler = (count: number) => Array.from({ length: count }, () => ({}) as never)
    const args: never[] = [
      repo as never,
      ...filler(3),
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }) } as never,
      ...filler(3),
      cadence as never,
      ...filler(6),
      brandsStub as never,
    ]
    service = new (ContactsService as unknown as new (...ctorArgs: never[]) => ContactsService)(...args)
  })

  it('planifie les relances du contact, ancrées sur AUJOURD’HUI', async () => {
    const result = await service.scheduleFollowUpsForDeclaredTouch('c-1', 'u-1')
    expect(result.type).toBe('success')
    expect(cadence.scheduleForContact).toHaveBeenCalledTimes(1)
    const [contactArg, userArg, anchor] = cadence.scheduleForContact.mock.calls[0]
    expect(contactArg.id).toBe('c-1')
    expect(userArg).toBe('u-1')
    expect(anchor).toBeInstanceOf(Date)
  })

  it('ne présente JAMAIS le geste comme une preuve d’envoi : aucune écriture sur le contact', async () => {
    await service.scheduleFollowUpsForDeclaredTouch('c-1', 'u-1')
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('refuse un contact qui n’est pas celui de l’appelant', async () => {
    repo.findOne.mockResolvedValue(null)
    const result = await service.scheduleFollowUpsForDeclaredTouch('c-x', 'u-1')
    expect(result.type).toBe('failure')
    expect(cadence.scheduleForContact).not.toHaveBeenCalled()
  })
})

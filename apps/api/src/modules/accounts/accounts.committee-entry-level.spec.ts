import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #3282 / #3263.30 — le niveau d'entrée du comité d'achat, SAISI par le
 * commercial dans une liste fermée. Lecture et écriture cloisonnées par espace ;
 * `null` = non déclaré (jamais un échelon deviné).
 */
describe('AccountsService.getCommitteeEntryLevel / setCommitteeEntryLevel (#3282)', () => {
  let repo: MockRepository<AccountEntity>
  let service: AccountsService

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    service = new AccountsService(repo as never, {} as never, {} as never, {} as never)
  })

  it('rend le niveau déclaré, cloisonné par espace', async () => {
    repo.findOne.mockResolvedValue({ id: 'a1', committee_entry_level: 'manager' })
    await expect(service.getCommitteeEntryLevel('a1', 'w1')).resolves.toEqual({ level: 'manager' })
    expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a1', workspace_id: 'w1' } }))
  })

  it('rend null quand rien n’est déclaré ou quand la valeur stockée n’est pas dans la liste fermée', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'a1', committee_entry_level: null })
    await expect(service.getCommitteeEntryLevel('a1', 'w1')).resolves.toEqual({ level: null })
    repo.findOne.mockResolvedValueOnce({ id: 'a1', committee_entry_level: 'dg' })
    await expect(service.getCommitteeEntryLevel('a1', 'w1')).resolves.toEqual({ level: null })
    repo.findOne.mockResolvedValueOnce(null)
    await expect(service.getCommitteeEntryLevel('a1', 'w1')).resolves.toEqual({ level: null })
  })

  it('écrit (ou retire avec null) sur le compte de l’espace, rien d’autre', async () => {
    await service.setCommitteeEntryLevel('a1', 'w1', { level: 'direction' })
    expect(repo.update).toHaveBeenCalledWith({ id: 'a1', workspace_id: 'w1' }, { committee_entry_level: 'direction' })
    await service.setCommitteeEntryLevel('a1', 'w1', { level: null })
    expect(repo.update).toHaveBeenLastCalledWith({ id: 'a1', workspace_id: 'w1' }, { committee_entry_level: null })
  })
})

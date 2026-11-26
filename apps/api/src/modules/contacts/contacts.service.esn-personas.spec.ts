/**
 * #3754.3/.5 — `rankForAccount` lit les postes cibles de l'ESN : ils ordonnent
 * le chemin ; sans poste importé, l'ordre est celui d'avant.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

const build = (personas: Array<{ title: string; decision_level: number }> | null) => {
  const contacts = createMockRepository()
  const accounts = createMockRepository()
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
  const personaRepo = { find: jest.fn().mockResolvedValue(personas ?? []) }
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    { enrichContact: jest.fn() } as never,
    {} as never,
    workspace as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    accounts as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
    undefined, // analytics
    undefined, // providerCosts
    undefined, // provenance
    undefined, // sprintBus
    undefined, // crmConnections
    undefined, // enrichmentDuration
    undefined, // personErasures
    undefined, // contactStops
    undefined, // outcomes
    undefined, // intakeExclusions
    personaRepo as never,
  )
  return { service, contacts, accounts, personaRepo }
}

const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  account_id: 'a1',
  full_name: `Contact ${id}`,
  title,
  decision_role: 'user',
  email: null,
  ...extra,
})

describe('ContactsService.rankForAccount — postes cibles de l’ESN (#3754)', () => {
  it('un « VP Tech & Architecture » passe avant un « Tech Lead », avec son niveau', async () => {
    const { service, contacts, accounts, personaRepo } = build([
      { title: 'VP Tech & Architecture', decision_level: 1 },
      { title: 'Tech Lead', decision_level: 4 },
    ])
    contacts.find.mockResolvedValue([
      row('lead', 'Tech Lead', { decision_role: 'economic', email: 'a@x.fr' }),
      row('vp', 'VP Tech & Architecture'),
    ])
    accounts.findOne.mockResolvedValue({ id: 'a1', raw_analysis: null })

    const res = await service.rankForAccount('a1', 'user-1', {} as never)

    expect(personaRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    expect(res.ranked.map(r => r.contact_id)).toEqual(['vp', 'lead'])
    expect(res.ranked.map(r => r.esn_target_level)).toEqual([1, 4])
  })

  it('sans poste importé : aucun niveau sur les lignes', async () => {
    const { service, contacts, accounts } = build(null)
    contacts.find.mockResolvedValue([row('a', 'Tech Lead'), row('b', 'VP Tech & Architecture')])
    accounts.findOne.mockResolvedValue({ id: 'a1', raw_analysis: null })

    const res = await service.rankForAccount('a1', 'user-1', {} as never)

    expect(res.ranked.every(r => !('esn_target_level' in r))).toBe(true)
  })
})

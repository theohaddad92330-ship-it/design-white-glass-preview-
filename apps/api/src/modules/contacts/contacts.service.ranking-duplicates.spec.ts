/**
 * Le chemin prioritaire (`rankForAccount`) ne montre jamais deux fois la même personne probable : « Prénom NOM »
 * (décideur) et « Prénom N. » (champion) ne font qu'UNE carte. Rien n'est supprimé : seul le classement regroupe.
 */
import { ContactsService } from './contacts.service'

const row = (id: string, full_name: string, extra: Record<string, unknown> = {}) => ({
  id,
  account_id: 'acc-1',
  full_name,
  title: null,
  entity: null,
  decision_role: null,
  email: null,
  email_verified: null,
  phone: null,
  linkedin_url: null,
  source: null,
  user_status: 'new',
  email_sent_at: null,
  last_enrichment_at: null,
  priority: null,
  demo_seed_first_door: null,
  ...extra,
})

const build = (rows: unknown[], rejected?: Set<string>) => {
  const service = Object.assign(Object.create(ContactsService.prototype), {
    workspaceContext: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) },
    accountIsInScope: jest.fn().mockResolvedValue(true),
    contacts: { find: jest.fn().mockResolvedValue(rows) },
    accounts: { findOne: jest.fn().mockResolvedValue({ raw_analysis: {}, employees: null }) },
    outcomes: undefined,
    loadTargetPersonas: jest.fn().mockResolvedValue(undefined),
    loadAccessStatus: jest.fn().mockResolvedValue(undefined),
    profileDataOf: jest.fn().mockResolvedValue(null),
    nextActionDueByContact: jest.fn().mockResolvedValue(new Map()),
    lastGestureByContact: jest.fn().mockResolvedValue(new Map()),
    duplicateDecisionsReader: rejected ? { rejectedPairKeys: jest.fn().mockResolvedValue(rejected) } : undefined,
  }) as ContactsService
  return service
}

describe('ContactsService.rankForAccount — une personne, une carte', () => {
  it("n'affiche qu'une carte pour deux fiches de la même personne probable", async () => {
    const service = build([
      row('full', 'Claire Fontaine', { decision_role: 'economic_buyer', title: 'PDG', email: 'c@x.fr' }),
      row('short', 'Claire F.', { decision_role: 'champion' }),
      row('other', 'Marc Lambert', { decision_role: 'champion' }),
    ])
    const out = await service.rankForAccount('acc-1', 'user-1', {})
    const ids = out.ranked.map(item => item.contact_id)
    expect(ids).toContain('full')
    expect(ids).not.toContain('short')
    expect(ids).toContain('other')
  })
  it('la correction humaine gagne : une paire refusée garde ses deux cartes', async () => {
    const service = build([row('a', 'Claire Fontaine'), row('b', 'Claire F.')], new Set(['a|b']))
    const out = await service.rankForAccount('acc-1', 'user-1', {})
    expect(out.ranked.map(item => item.contact_id).sort()).toEqual(['a', 'b'])
  })
})

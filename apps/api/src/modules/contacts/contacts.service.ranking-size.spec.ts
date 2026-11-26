/**
 * #4984.2 — le palier de taille qui a décidé du niveau hiérarchique cherché VIT À UN SEUL ENDROIT (GA-26,
 * `contact-seller-focus.ts`) et voyage dans la réponse du classement : l'écran le LIT, il ne recode pas 1 000 / 10 000.
 */
import { ContactsService } from './contacts.service'
import { accountSize } from './contact-seller-focus'

const row = (id: string) => ({
  id,
  account_id: 'acc-1',
  full_name: `Personne ${id}`,
  title: 'Directeur général',
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
})

const build = (employees: string | null) =>
  Object.assign(Object.create(ContactsService.prototype), {
    workspaceContext: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) },
    accountIsInScope: jest.fn().mockResolvedValue(true),
    contacts: { find: jest.fn().mockResolvedValue([row('a')]) },
    accounts: { findOne: jest.fn().mockResolvedValue({ raw_analysis: {}, employees }) },
    outcomes: undefined,
    loadTargetPersonas: jest.fn().mockResolvedValue(undefined),
    loadAccessStatus: jest.fn().mockResolvedValue(undefined),
    profileDataOf: jest.fn().mockResolvedValue(null),
    nextActionDueByContact: jest.fn().mockResolvedValue(new Map()),
    lastGestureByContact: jest.fn().mockResolvedValue(new Map()),
    duplicateDecisionsReader: undefined,
  }) as ContactsService

describe('#4984.2 — accountSize (palier lu là où il est défini)', () => {
  it('donne l’effectif et son palier', () => {
    expect(accountSize('500')).toEqual({ employees: 500, tier: 'small' })
    expect(accountSize('1 000')).toEqual({ employees: 1000, tier: 'mid' })
    expect(accountSize('10 000')).toEqual({ employees: 10000, tier: 'mid' })
    expect(accountSize('20 000')).toEqual({ employees: 20000, tier: 'large' })
  })
  it('effectif inconnu : null, jamais un palier inventé ni 0', () => {
    expect(accountSize(null)).toBeNull()
    expect(accountSize('inconnu')).toBeNull()
    expect(accountSize('0')).toBeNull()
  })
})

describe('#4984.2 — rankForAccount porte le palier', () => {
  it('le classement dit la taille et le palier qui ont servi', async () => {
    const out = await build('3 000').rankForAccount('acc-1', 'user-1', {})
    expect(out.account_size).toEqual({ employees: 3000, tier: 'mid' })
  })
  it('effectif inconnu : aucun champ account_size', async () => {
    const out = await build(null).rankForAccount('acc-1', 'user-1', {})
    expect(out.account_size).toBeUndefined()
  })
})

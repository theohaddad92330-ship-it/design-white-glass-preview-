/**
 * Lot 758 (CONTACTS 4/6) — l'APPELANT, pas seulement le noyau : `rankForAccount` et
 * `findByAccount` lisent l'offre DÉCLARÉE au profil de l'ESN. Pour une ESN data, le Head of
 * Data passe devant le chef de l'architecture joignable, et le score servi est la pertinence.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

const build = (offers: string[] | null) => {
  const contacts = createMockRepository()
  const accounts = createMockRepository()
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
  const profileReader = { resolveProfileData: jest.fn().mockResolvedValue(offers ? { offers } : {}) }
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
    undefined, // targetPersonas
    undefined, // outageAlert
    undefined, // mailboxSender
    undefined, // phoneReveal
    undefined, // emailAttachments
    profileReader as never,
  )
  return { service, contacts, accounts, profileReader }
}

const ROWS = [
  {
    id: 'archi',
    account_id: 'a1',
    full_name: 'Alex Archi',
    title: "Directeur de l'architecture",
    decision_role: 'technical',
    email: 'archi@x.fr',
    email_verified: true,
    phone: '+33 1 00 00 00 00',
    source: 'apollo',
  },
  {
    id: 'data',
    account_id: 'a1',
    full_name: 'Dana Data',
    title: 'Head of Data',
    decision_role: 'technical',
    email: null,
    email_verified: false,
    phone: null,
    source: 'apollo',
  },
]

describe('ContactsService — l’offre déclarée de l’ESN ordonne et note (lot 758)', () => {
  it('chemin recommandé : pour une ESN data, le Head of Data est la porte d’entrée', async () => {
    const { service, contacts, accounts, profileReader } = build(['Data & IA'])
    contacts.find.mockResolvedValue(ROWS)
    accounts.findOne.mockResolvedValue({ id: 'a1', raw_analysis: null })

    const res = await service.rankForAccount('a1', 'user-1', {} as never)

    expect(profileReader.resolveProfileData).toHaveBeenCalledTimes(1)
    expect(res.ranked.map(r => r.contact_id)).toEqual(['data', 'archi'])
    expect(res.context.offer_source).toBe('profile')
  })

  it('témoin : sans offre déclarée, l’ordre d’avant (la joignabilité départage)', async () => {
    const { service, contacts, accounts } = build(null)
    contacts.find.mockResolvedValue(ROWS)
    accounts.findOne.mockResolvedValue({ id: 'a1', raw_analysis: null })

    const res = await service.rankForAccount('a1', 'user-1', {} as never)

    expect(res.ranked[0].contact_id).toBe('archi')
    expect(res.context.offer_source).toBe('none')
  })

  it('score servi : la pertinence contre l’offre, et la joignabilité en pastille', async () => {
    const { service, contacts, accounts } = build(['Data & IA'])
    contacts.find.mockResolvedValue(ROWS)
    accounts.findOne.mockResolvedValue({ id: 'a1', company_name: 'Cible', raw_analysis: {} })

    const rows = await service.findByAccount('a1', 'user-1')
    const byId = Object.fromEntries(rows.map(r => [r.id, r]))

    expect(byId.data.contact_score).toBeGreaterThan(byId.archi.contact_score)
    expect(byId.archi.contact_reachability).toBe('verified_email')
    expect(byId.data.contact_reachability).toBeNull()
    const offer = byId.archi.contact_score_breakdown.find(c => c.key === 'angleFit')
    expect(offer).toMatchObject({ points: 0, evaluated: true, proof: 'hors de ton offre' })
  })
})

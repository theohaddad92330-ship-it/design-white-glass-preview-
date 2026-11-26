/**
 * #2545 / #3819 (démo Ludovic 08/10) — `ContactsService.callList` lit les
 * contacts DU compte rapproché (SIREN/id/nom), bornée à l'espace actif ; un
 * candidat sans compte rend des listes vides et `null`, jamais un contact inventé.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

const build = (accounts: Array<{ id: string; siren: string | null; company_name: string }>) => {
  const contacts = createMockRepository()
  const accountsRepo = createMockRepository()
  const where: string[] = []
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn((clause: string) => {
      where.push(clause)
      return qb
    }),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(accounts),
  }
  ;(accountsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
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
    accountsRepo as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
  )
  return { service, contacts, where }
}

const contact = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  account_id: 'acc-arquus',
  full_name: `Personne ${id}`,
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
  hidden: false,
  excluded_at: null,
  lifecycle_state: null,
  recommendation_authorized_reason: null,
  why_contact: null,
  location: null,
  ...overrides,
})

describe('ContactsService.callList (#2545 / #3819)', () => {
  it('rapproche par SIREN, rend les contacts classés en clair et les signaux datés du compte', async () => {
    const { service, contacts, where } = build([{ id: 'acc-arquus', siren: '123456789', company_name: 'ARQUUS' }])
    ;(contacts.find as jest.Mock).mockResolvedValue([
      contact('c1', { full_name: 'Claire Martin', email: 'claire@arquus.fr', phone: '+33 3 86 00 00 00' }),
    ])
    ;(contacts.manager.query as jest.Mock).mockResolvedValue([
      {
        account_id: 'acc-arquus',
        label: 'Contrat cadre défense remporté',
        signal_type: 'marche_public',
        source: 'Defence Procurement International',
        signal_date: '2026-09-30',
        first_detected_at: new Date('2026-10-01T00:00:00Z'),
        first_detection_exact: true,
      },
    ])

    const result = await service.callList('user-1', {
      companies: [
        { key: '123456789', siren: '123456789', name: 'Arquus' },
        { key: '000000000', siren: '000000000', name: 'Inconnue' },
      ],
    })

    expect(where[0]).toContain('workspace_id')
    expect(contacts.find).toHaveBeenCalledTimes(1)
    expect(result.companies[0]).toMatchObject({
      key: '123456789',
      accountId: 'acc-arquus',
      contactsTotal: 1,
      contacts: [{ id: 'c1', full_name: 'Claire Martin', email: 'claire@arquus.fr', company_name: 'ARQUUS' }],
      signals: [{ kind: 'marche_public', date: '2026-09-30', source: 'Defence Procurement International' }],
    })
    expect(result.companies[1]).toEqual({
      key: '000000000',
      accountId: null,
      contactsTotal: null,
      contacts: [],
      signals: [],
    })
  })

  it('aucun compte rapproché → aucune lecture de contacts ni de signaux', async () => {
    const { service, contacts } = build([])
    const result = await service.callList('user-1', { companies: [{ key: 'k', siren: '1', name: 'X' }] })
    expect(contacts.find).not.toHaveBeenCalled()
    expect(contacts.manager.query).not.toHaveBeenCalled()
    expect(result.companies[0].accountId).toBeNull()
  })

  it('#4068 — les actes administratifs et titres vides ne prennent plus les dix places : le recrutement reste', async () => {
    const { service, contacts } = build([{ id: 'acc-late', siren: '572050169', company_name: 'LATECOERE' }])
    ;(contacts.find as jest.Mock).mockResolvedValue([])
    const row = (label: string, signal_type: string | null, signal_date: string) => ({
      account_id: 'acc-late',
      label,
      signal_type,
      source: null,
      signal_date,
      first_detected_at: new Date(`${signal_date}T00:00:00Z`),
      first_detection_exact: true,
    })
    ;(contacts.manager.query as jest.Mock).mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) =>
        row(`Modification survenue sur le capital (${i})`, 'restructuration', `2026-10-0${i + 1}`),
      ),
      row('Modifications diverses', null, '2026-10-08'),
      row('Lerevenu', null, '2026-10-09'),
      row('Latecoere : quelles perspectives ?', null, '2026-10-09'),
      row('Changement de dirigeant', 'nomination', '2026-10-10'),
      row('Stage – Bac+5 – Ingénieur méthodes', 'recrutement', '2026-10-11'),
      row('Ingénieur systèmes embarqués H/F', 'recrutement', '2026-08-20'),
    ])

    const result = await service.callList('user-1', {
      companies: [{ key: 'k', siren: '572050169', name: 'Latecoere' }],
    })

    const labels = result.companies[0].signals.map(signal => signal.label)
    expect(labels).toEqual(['Ingénieur systèmes embarqués H/F'])
  })
})

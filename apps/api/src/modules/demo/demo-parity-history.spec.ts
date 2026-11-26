import { DEMO_ANALYSED_ACCOUNTS, DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'
import {
  DEMO_PARITY_ACTIVITIES,
  DEMO_PARITY_COMPANIES,
  DEMO_PARITY_DEALS,
  DEMO_PARITY_USER_ACTIONS,
  buildParityDealRows,
} from './demo-parity-history'

/**
 * R33b (16/10/2026) — « en démo AUCUN compte mince » (Louis 12/10, 13/10) : Renault, Airbus, EDF, Thales et Orange
 * s'ouvrent sur un historique daté et des affaires, comme Société Générale. Ce test lit le vrai semis.
 */
const VALID_STAGES = ['qualified', 'confirmed', 'profiles_submitted', 'negotiation', 'won', 'lost', 'dormant']
const VALID_ROLES = ['sponsor', 'decideur', 'prescripteur', 'acheteur', 'utilisateur', 'bloqueur']

function contactNamesOf(company: string): Set<string> {
  const account = [...DEMO_ANALYSED_ACCOUNTS, ...DEMO_EXTENSION_ACCOUNTS].find(a => a.company_name === company)
  return new Set((account?.contacts ?? []).map(c => c.full_name))
}

describe('R33b — parité d’historique et d’affaires des comptes de brief démo', () => {
  it('couvre Renault, Airbus, EDF, Thales et Orange', () => {
    expect([...DEMO_PARITY_COMPANIES].sort()).toEqual(['Airbus', 'EDF', 'Orange', 'Renault', 'Thales'])
  })

  it.each([...DEMO_PARITY_COMPANIES])(
    '%s : un historique d’échanges daté, avec une réponse reçue et un appel',
    company => {
      const rows = DEMO_PARITY_ACTIVITIES.filter(a => a.company === company)
      expect(rows.length).toBeGreaterThanOrEqual(6)
      expect(rows.some(a => a.direction === 'inbound')).toBe(true)
      expect(rows.some(a => a.kind === 'call')).toBe(true)
      expect(rows.some(a => a.kind === 'email' && a.direction === 'outbound')).toBe(true)
      for (const row of rows) {
        expect(row.daysAgo).toBeGreaterThanOrEqual(0)
        expect(row.daysAgo).toBeLessThanOrEqual(60)
        expect(row.source).toBeUndefined()
      }
    },
  )

  it.each([...DEMO_PARITY_COMPANIES])('%s : « Ce qui s’est passé » porte des actions faites', company => {
    const rows = DEMO_PARITY_USER_ACTIONS.filter(a => a.company === company)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.some(a => a.action_type === 'analysis_completed')).toBe(true)
    expect(rows.some(a => a.action_type === 'plan_action_completed')).toBe(true)
    expect(rows.some(a => a.action_type === 'message_copied')).toBe(true)
    for (const row of rows.filter(a => a.action_type === 'message_copied')) {
      expect(String(row.metadata['subject'] ?? '').length).toBeGreaterThan(0)
      expect(row.metadata).not.toHaveProperty('body')
    }
  })

  it('aucun échange n’est attribué à une personne réelle du dossier (décision 04/10)', () => {
    for (const row of DEMO_PARITY_ACTIVITIES) expect(row.contact).toBeNull()
    for (const row of DEMO_PARITY_USER_ACTIONS) expect(row.contact).toBeNull()
  })

  it.each([...DEMO_PARITY_COMPANIES])(
    '%s : 1 à 3 affaires, stades variés, rattachées à des décideurs semés',
    company => {
      const deals = DEMO_PARITY_DEALS.filter(d => d.account === company)
      expect(deals.length).toBeGreaterThanOrEqual(1)
      expect(deals.length).toBeLessThanOrEqual(3)
      const names = contactNamesOf(company)
      for (const deal of deals) {
        expect(VALID_STAGES).toContain(deal.stage)
        if (deal.amountCents !== null) expect(deal.amountCents).toBeGreaterThan(0)
        expect(deal.contacts.length).toBeGreaterThanOrEqual(1)
        for (const link of deal.contacts) {
          expect(VALID_ROLES).toContain(link.role)
          expect(names.has(link.full_name)).toBe(true)
          expect(link.full_name.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
        }
      }
    },
  )

  it('les stades sont variés sur l’ensemble et le journal finit sur le stade courant', () => {
    expect(new Set(DEMO_PARITY_DEALS.map(d => d.stage)).size).toBeGreaterThanOrEqual(3)
    for (const deal of DEMO_PARITY_DEALS) {
      expect(deal.transitions[deal.transitions.length - 1]?.to).toBe(deal.stage)
    }
    const rows = buildParityDealRows(new Date('2026-10-16T12:00:00Z'))
    expect(rows).toHaveLength(DEMO_PARITY_DEALS.length)
    for (const row of rows) expect(row.firstDetectedAt.getTime()).toBeLessThan(row.stageEnteredAt.getTime() + 1)
  })
})

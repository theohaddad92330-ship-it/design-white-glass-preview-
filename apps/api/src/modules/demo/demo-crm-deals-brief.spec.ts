import { buildAccountFactsBrief, weighAccountFacts } from '@bellum/contracts'
import { crmDealFacts, dormantDealFacts } from '../account-facts/account-facts.sources'
import { buildDemoCrmDeals } from './demo-crm-deals'

/**
 * #4069.4 — les affaires de Société Générale semées en démo arrivent bien, par le lecteur du socle, jusqu'à
 * la fiche (`AccountDealFactsSection`) : gagnée, perdue et en sommeil, chacune datée.
 */
describe('#4069.4 — les affaires CRM de la salle se lisent dans la fiche de préparation', () => {
  const now = new Date('2026-10-15T10:00:00Z')
  const { facts, signals } = buildDemoCrmDeals(now)
  const raw = [
    ...crmDealFacts(facts.filter(f => f.is_closed)),
    ...dormantDealFacts(
      signals
        .filter(s => s.kind === 'affaire_dormante')
        .map(s => ({ evidence: s.evidence, occurred_at: s.occurredAt })),
    ),
  ]
  const brief = buildAccountFactsBrief(now.toISOString(), weighAccountFacts(raw, now))

  it('une affaire gagnée, une perdue et une en sommeil', () => {
    expect(brief.deals.map(d => d.kind).sort()).toEqual(['deal_dormant', 'deal_lost', 'deal_won'])
  })
})

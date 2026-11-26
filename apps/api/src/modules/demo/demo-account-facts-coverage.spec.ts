import { accountFactSchema, supplierNamesIn, weighAccountFacts } from '@bellum/contracts'
import { crmDealFacts, currentSignalFacts, dormantDealFacts, noteFacts } from '../account-facts/account-facts.sources'
import { DEMO_ACCOUNT_FACTS_COVERAGE } from './demo-coverage'
import { buildDemoCrmDeals } from './demo-crm-deals'
import { DEMO_CRM_DEALS, DEMO_DOSSIERS, DEMO_NOTES } from './demo-dataset'

/**
 * #4069.4 — « et en démonstration, le socle des faits du compte rend-il quelque chose ? » (craft rule n°9).
 *
 * Aucune table neuve : le lecteur (`AccountFactsService`) relit des tables DÉJÀ semées. Ce fichier rejoue
 * ses familles sur le VRAI jeu de données du compte vitrine (Société Générale) — signaux du dossier,
 * affaires gagnée / perdue / en sommeil, notes — avec les MÊMES fonctions que la lecture de production.
 */
describe('#4069.4 — les faits du compte en démonstration', () => {
  const now = new Date('2026-10-12T08:00:00.000Z')
  const account = DEMO_CRM_DEALS.account
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === account)?.account
  const { facts: deals, signals } = buildDemoCrmDeals(now)
  const raw = [
    ...currentSignalFacts(dossier?.recent_signals),
    ...crmDealFacts(deals.map(d => ({ ...d, last_activity_at: d.last_activity_at ?? null }))),
    ...dormantDealFacts(
      signals
        .filter(s => s.kind === 'affaire_dormante')
        .map(s => ({ evidence: s.evidence, occurred_at: s.occurredAt })),
    ),
    ...noteFacts(
      DEMO_NOTES.filter(n => n.company === account && n.contact === null).map(n => ({
        body: n.body,
        created_at: new Date(now.getTime() - n.daysAgo * 86_400_000),
        is_meeting: false,
      })),
    ),
  ]
  const facts = weighAccountFacts(raw, now)

  it('est classé seedé, avec sa raison — et nomme ce qui reste vide à dessein', () => {
    expect(DEMO_ACCOUNT_FACTS_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_FACTS_COVERAGE.reason).toContain('#4069')
    for (const table of ['signal_history', 'account_feedback'])
      expect(DEMO_ACCOUNT_FACTS_COVERAGE.reason).toContain(table)
  })

  it('LIT le vrai compte vitrine — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(dossier).toBeDefined()
    expect(deals.length).toBeGreaterThan(0)
  })

  it('le compte vitrine porte des faits d’au moins quatre familles, dont une affaire gagnée, une perdue et une en sommeil', () => {
    const kinds = new Set(facts.map(f => f.kind))
    for (const kind of ['deal_won', 'deal_lost', 'deal_dormant', 'note'] as const) expect(kinds).toContain(kind)
    expect([...kinds].some(k => k === 'signal' || k === 'hiring' || k === 'need')).toBe(true)
  })

  it('sait dire NON : chaque fait respecte le contrat et aucun ne nomme un fournisseur', () => {
    for (const fact of facts) {
      expect(accountFactSchema.safeParse(fact).success).toBe(true)
      expect(supplierNamesIn(fact.label)).toEqual([])
    }
  })
})

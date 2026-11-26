import { projectDealFacts } from '../account-facts/account-facts.sources'
import { DEMO_SECOND_LOST_DEAL } from './demo-dataset'

/**
 * W-G (13/10) — « et en démonstration, une affaire perdue arrive-t-elle dans les faits du compte de Laura ? »
 * (craft rule n°9). Aucune table neuve : l'affaire perdue du client de livraison est déjà semée dans
 * `opportunities` (`outcome = 'lost'`) ; ce fichier rejoue la lecture de production (`projectDealFacts`) dessus.
 */
describe('W-G — l’affaire perdue de la démo devient un fait du compte', () => {
  const { account, lost } = DEMO_SECOND_LOST_DEAL

  it('LIT une vraie affaire perdue, datée — sinon la suite serait vraie par vacuité', () => {
    expect(account.company_name.length).toBeGreaterThan(0)
    expect(lost.label.trim().length).toBeGreaterThan(0)
    expect(lost.closed_days_ago).toBeGreaterThan(0)
  })

  it('produit un fait « affaire perdue » avec sa date, comme la lecture de production', () => {
    const closedAt = new Date(Date.now() - lost.closed_days_ago * 86_400_000)
    const facts = projectDealFacts([
      { label: lost.label, outcome: 'lost', closed_at: closedAt, stage_entered_at: closedAt },
    ])
    expect(facts).toEqual([{ date: closedAt.toISOString().slice(0, 10), kind: 'deal_lost', label: lost.label }])
  })
})

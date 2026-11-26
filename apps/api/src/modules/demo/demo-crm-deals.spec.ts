import { buildDemoCrmDeals } from './demo-crm-deals'

const NOW = new Date('2026-10-09T08:00:00.000Z')

describe('#3918.b — buildDemoCrmDeals (salle de démonstration)', () => {
  it('rend les trois affaires de Société Générale et UN signal par affaire, sortis des règles de production', () => {
    const { facts, signals } = buildDemoCrmDeals(NOW)
    expect(facts).toHaveLength(3)
    expect(signals.map(s => s.kind).sort()).toEqual(['affaire_dormante', 'affaire_perdue', 'affaire_renouvellement'])
    // La phrase est celle de la règle, pas une phrase de démo : « il y a N mois », « depuis N jours ».
    expect(signals.find(s => s.kind === 'affaire_perdue')?.evidence).toBe(
      'Migration cloud — Direction des risques : affaire perdue il y a 4 mois.',
    )
    expect(signals.find(s => s.kind === 'affaire_dormante')?.evidence).toBe(
      'TMA applicative — Banque de détail : sans la moindre activité connue depuis 62 jours.',
    )
  })

  it('chaque signal pointe sa propre affaire et la date du FAIT, jamais l’instant du semis', () => {
    const { facts, signals } = buildDemoCrmDeals(NOW)
    for (const signal of signals) {
      const fact = facts.find(f => f.deal_id === signal.dealId)
      expect(fact).toBeDefined()
      expect(signal.occurredAt).not.toBe(NOW.toISOString())
    }
  })

  it("le fournisseur est « demo » : le rapport pipeline (lu sur 'hubspot') ne lit jamais ces lignes", () => {
    expect(new Set(buildDemoCrmDeals(NOW).facts.map(f => f.provider))).toEqual(new Set(['demo']))
  })
})

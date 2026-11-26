import { describe, expect, it } from 'vitest'
import { ACCOUNT_PAIN_INTERVENTION_KEY, accountSuggestionSchema } from './laura-account-context.js'
import { accountPainFacts, signalAge } from './laura-account-pain.js'
import { LAURA_INTERVENTIONS } from './laura-interventions.js'

// #3939.3 — dates RELATIVES, calculées une fois : un test daté en dur d'un
// signal qui vieillit finirait par mentir.
const NOW = new Date()
function isoDaysAgo(days: number): string {
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - days))
  return d.toISOString().slice(0, 10)
}
function monthsAgo(months: number): string {
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - months, 1))
  return d.toISOString().slice(0, 7)
}

describe('#3939.3 — l’âge d’un signal : mesuré sur la précision qu’il porte, jamais inventé', () => {
  it('un jour précis donne des jours', () => {
    expect(signalAge(isoDaysAgo(12), NOW)).toEqual({ unit: 'days', value: 12 })
  })
  it('un mois seul donne des mois — jamais des jours inventés', () => {
    expect(signalAge(monthsAgo(3), NOW)).toEqual({ unit: 'months', value: 3 })
  })
  it('une année seule, un texte libre, une absence ou une date future ne sont PAS datés', () => {
    expect(signalAge(String(NOW.getUTCFullYear()), NOW)).toBeNull()
    expect(signalAge('printemps 2026', NOW)).toBeNull()
    expect(signalAge(null, NOW)).toBeNull()
    expect(signalAge(undefined, NOW)).toBeNull()
    expect(signalAge(isoDaysAgo(-5), NOW)).toBeNull()
    expect(signalAge('2026-02-31', NOW)).toBeNull()
  })
})

describe('#3939.3 — une douleur qualifiée + un signal FONDÉ et DATÉ, sinon rien', () => {
  const dated = { id: 's1', signal: 'Plan stratégique annoncé', date: isoDaysAgo(20), freshness: 'current' as const }
  const older = { id: 's2', signal: 'Objectifs relevés', date: monthsAgo(2), freshness: 'current' as const }

  it('rend l’hypothèse puis ses signaux fondateurs datés, le plus récent d’abord, sans source nommée', () => {
    const facts = accountPainFacts(
      {
        qualified_hypotheses: [{ hypothesis: 'Arbitrage budgétaire avant le plan', based_on_signal_ids: ['s2', 's1'] }],
        recent_signals: [older, dated],
      },
      NOW,
    )
    expect(facts.map(fact => fact.kind)).toEqual(['pain_hypothesis', 'pain_signal', 'pain_signal'])
    expect(facts[0]!.statement).toBe('Arbitrage budgétaire avant le plan')
    expect(facts[1]!.statement).toBe('Plan stratégique annoncé')
    expect(facts[1]!.observedOn).toBe(dated.date)
    expect(facts.every(fact => fact.source === null)).toBe(true)
    // Le contrat de la suggestion l'accepte, sans mesure de vivier (elle ne le croise pas).
    expect(() => accountSuggestionSchema.parse({ accountId: crypto.randomUUID(), facts, resource: null })).not.toThrow()
  })

  it('sait dire NON : signal sans date, d’une année seule, archivé ou non cité ⇒ aucune intervention', () => {
    const base = { hypothesis: 'Une hypothèse', based_on_signal_ids: ['s1'] }
    expect(accountPainFacts({ qualified_hypotheses: [base], recent_signals: [{ ...dated, date: null }] }, NOW)).toEqual(
      [],
    )
    expect(
      accountPainFacts({ qualified_hypotheses: [base], recent_signals: [{ ...dated, date: '2026' }] }, NOW),
    ).toEqual([])
    expect(
      accountPainFacts({ qualified_hypotheses: [base], recent_signals: [{ ...dated, freshness: 'archive' }] }, NOW),
    ).toEqual([])
    expect(
      accountPainFacts(
        { qualified_hypotheses: [{ ...base, based_on_signal_ids: ['s9'] }], recent_signals: [dated] },
        NOW,
      ),
    ).toEqual([])
    expect(
      accountPainFacts({ qualified_hypotheses: [{ ...base, hypothesis: '  ' }], recent_signals: [dated] }, NOW),
    ).toEqual([])
    expect(accountPainFacts({}, NOW)).toEqual([])
  })

  it('à défaut d’hypothèse fondée, lit les douleurs comme la question de douleur (#3939, même domaine d’offre)', () => {
    const facts = accountPainFacts(
      {
        pains: [
          { pain: 'Sans domaine', domain_code: null },
          { pain: 'Réconcilier la donnée client', domain_code: 'data' },
        ],
        recent_signals: [
          { ...dated, domain_code: 'data' },
          { ...older, domain_code: 'cloud' },
        ],
      },
      NOW,
    )
    expect(facts.map(fact => fact.statement)).toEqual(['Réconcilier la donnée client', 'Plan stratégique annoncé'])
  })

  it('choisit l’hypothèse dont le signal fondateur est le plus récent, et borne à trois signaux', () => {
    const facts = accountPainFacts(
      {
        qualified_hypotheses: [
          { hypothesis: 'Ancienne', based_on_signal_ids: ['s2'] },
          { hypothesis: 'Récente', based_on_signal_ids: ['s1', 's3', 's4', 's5'] },
        ],
        recent_signals: [
          older,
          dated,
          { id: 's3', signal: 'c', date: isoDaysAgo(30) },
          { id: 's4', signal: 'd', date: isoDaysAgo(40) },
          { id: 's5', signal: 'e', date: isoDaysAgo(50) },
        ],
      },
      NOW,
    )
    expect(facts[0]!.statement).toBe('Récente')
    expect(facts.filter(fact => fact.kind === 'pain_signal')).toHaveLength(3)
  })
})

describe('#3939.3 — la seconde intervention du dossier de compte', () => {
  it('est au catalogue, sur le dossier ouvert, sans route figée', () => {
    const entry = LAURA_INTERVENTIONS.find(intervention => intervention.key === ACCOUNT_PAIN_INTERVENTION_KEY)
    expect(entry?.screen).toBe('/accounts/:id')
    expect(entry?.route).toBeNull()
    expect(entry?.family).toBe('business_value')
  })
})

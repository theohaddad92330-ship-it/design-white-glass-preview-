import { describe, expect, it } from 'vitest'
import { ACCOUNT_FACT_KINDS, accountFactSchema, accountFactsSchema } from './account-facts.js'

const fact = {
  date: '2025-08-12',
  kind: 'need' as const,
  label: 'Besoin exprimé : migration de la paie vers le cloud',
  weight: 0.42,
  ageDays: 426,
}

describe('#4069.3 — contrat des faits du compte', () => {
  it('accepte un fait daté, typé, pesé — avec ou sans lien', () => {
    expect(accountFactSchema.parse(fact)).toEqual(fact)
    expect(accountFactSchema.parse({ ...fact, url: 'https://exemple.fr/offre' }).url).toBe('https://exemple.fr/offre')
    expect(accountFactSchema.parse({ ...fact, date: '2026-10-01T09:00:00+02:00' }).date).toBe(
      '2026-10-01T09:00:00+02:00',
    )
  })

  it('porte exactement les quinze natures tranchées (« exchange » #4072.2/.3, « deal_renewal » #3918.6, « career » #4284.19)', () => {
    expect(ACCOUNT_FACT_KINDS).toEqual([
      'hiring',
      'need',
      'signal',
      'deal_won',
      'deal_lost',
      'deal_dormant',
      'deal_renewal',
      'mission',
      'note',
      'meeting',
      'correction',
      'market_observation',
      'document',
      'exchange',
      'career',
    ])
    expect(accountFactSchema.safeParse({ ...fact, kind: 'dataforge' }).success).toBe(false)
  })

  it('REFUSE tout champ de provenance — un fait ne nomme jamais sa source', () => {
    for (const key of ['source', 'provider', 'origin', 'sourceLabel']) {
      expect(accountFactSchema.safeParse({ ...fact, [key]: 'hubspot' }).success).toBe(false)
    }
  })

  it('refuse un fait sans date, sans âge, ou à l’âge négatif — aucune coupure, mais toujours daté', () => {
    const { date: _d, ...noDate } = fact
    const { ageDays: _a, ...noAge } = fact
    expect(accountFactSchema.safeParse(noDate).success).toBe(false)
    expect(accountFactSchema.safeParse(noAge).success).toBe(false)
    expect(accountFactSchema.safeParse({ ...fact, ageDays: -1 }).success).toBe(false)
    expect(accountFactSchema.safeParse({ ...fact, date: 'il y a longtemps' }).success).toBe(false)
    expect(accountFactSchema.safeParse({ ...fact, ageDays: 3650 }).success).toBe(true)
  })

  it('refuse un poids négatif ou non fini, et un libellé vide', () => {
    expect(accountFactSchema.safeParse({ ...fact, weight: -0.1 }).success).toBe(false)
    expect(accountFactSchema.safeParse({ ...fact, weight: Number.POSITIVE_INFINITY }).success).toBe(false)
    expect(accountFactSchema.safeParse({ ...fact, label: '   ' }).success).toBe(false)
  })

  it('la réponse du lecteur porte son instant de calcul et refuse les champs en trop', () => {
    const body = { asOf: '2026-10-12T08:00:00.000Z', facts: [fact] }
    expect(accountFactsSchema.parse(body)).toEqual(body)
    expect(accountFactsSchema.safeParse({ ...body, sources: ['crm'] }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { accountFactAgeDays, accountFactDecay, weighAccountFacts } from './account-facts-weight.js'
import { accountFactSchema } from './account-facts.js'

const AS_OF = new Date('2026-10-12T08:00:00.000Z')

describe('#4069.2 — décote par l’âge, bonus de récurrence', () => {
  it('compte l’âge en jours entiers, jamais négatif', () => {
    expect(accountFactAgeDays('2026-10-12', AS_OF)).toBe(0)
    expect(accountFactAgeDays('2026-10-02T08:00:00Z', AS_OF)).toBe(10)
    expect(accountFactAgeDays('2025-08-12', AS_OF)).toBe(426)
    expect(accountFactAgeDays('2027-01-01', AS_OF)).toBe(0)
  })

  it('décote avec l’âge, sans AUCUNE coupure : un fait de dix ans pèse encore', () => {
    expect(accountFactDecay(0)).toBe(1)
    expect(accountFactDecay(365)).toBeCloseTo(0.5)
    expect(accountFactDecay(30)).toBeGreaterThan(accountFactDecay(400))
    expect(accountFactDecay(3650)).toBeGreaterThan(0)
  })

  it('un besoin récurrent pèse plus qu’un besoin isolé du même âge', () => {
    const facts = weighAccountFacts(
      [
        { date: '2026-06-01', kind: 'need', label: 'Migration paie cloud' },
        { date: '2025-06-01', kind: 'need', label: 'Migration  PAIE cloud.' },
        { date: '2026-06-01', kind: 'need', label: 'Audit sécurité' },
      ],
      AS_OF,
    )
    const recurrent = facts.find(f => f.label === 'Migration paie cloud')
    const isolated = facts.find(f => f.label === 'Audit sécurité')
    expect(recurrent?.weight).toBeGreaterThan(isolated?.weight ?? Infinity)
    expect(facts[0]?.label).toBe('Migration paie cloud')
  })

  it('le même fait lu deux fois le même jour n’est PAS une récurrence', () => {
    const [a, b] = weighAccountFacts(
      [
        { date: '2026-06-01', kind: 'need', label: 'Audit sécurité' },
        { date: '2026-06-01T10:00:00Z', kind: 'need', label: 'audit sécurité' },
      ],
      AS_OF,
    )
    expect(a?.weight).toBe(accountFactDecay(a?.ageDays ?? 0))
    expect(b?.weight).toBe(accountFactDecay(b?.ageDays ?? 0))
  })

  it('trie les plus pesants d’abord, rend des faits conformes au contrat, et écarte une date illisible', () => {
    const facts = weighAccountFacts(
      [
        { date: '2023-01-01', kind: 'deal_lost', label: 'Affaire perdue : TMA SI RH' },
        { date: '2026-10-01', kind: 'signal', label: 'Levée de fonds', url: 'https://exemple.fr/levee' },
        { date: 'pas une date', kind: 'note', label: 'Note sans date' },
      ],
      AS_OF,
    )
    expect(facts.map(f => f.kind)).toEqual(['signal', 'deal_lost'])
    for (const f of facts) expect(accountFactSchema.safeParse(f).success).toBe(true)
    expect(facts[1]?.ageDays).toBeGreaterThan(1000)
  })
})

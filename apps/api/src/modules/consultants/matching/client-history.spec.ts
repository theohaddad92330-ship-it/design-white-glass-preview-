import type { MatchNeed } from '@bellum/contracts'
import { axisClientHistory, clientHistoryFactsFor } from './axes'

const NOW = new Date('2026-10-12T00:00:00Z')
const need = (clientHistory?: MatchNeed['clientHistory']): MatchNeed =>
  ({
    role: 'Architecte Java',
    skills: [{ term: 'Java', label: 'Java', required: true, level: null }],
    clientHistory,
  }) as MatchNeed

// #4072.6
describe('axisClientHistory', () => {
  it('sort du dénominateur (null) sans aucun fait — non mesuré n’est pas 0', () => {
    expect(axisClientHistory(need(), NOW).score).toBeNull()
    expect(axisClientHistory(need([]), NOW).score).toBeNull()
  })

  it('une affaire gagnée récente chez ce client relève le score et se nomme par sa nature', () => {
    const out = axisClientHistory(need([{ kind: 'deal_won', date: '2026-09-01', label: 'TMA' }]), NOW)
    expect(out.score).toBeGreaterThan(50)
    expect(out.detail).toMatch(/affaire gagnée/i)
    expect(out.detail).toMatch(/il y a/)
  })

  it('une affaire perdue l’abaisse, et plus faiblement quand elle est ancienne (décote, pas de coupure)', () => {
    const recent = axisClientHistory(need([{ kind: 'deal_lost', date: '2026-09-01', label: 'x' }]), NOW).score ?? 0
    const old = axisClientHistory(need([{ kind: 'deal_lost', date: '2022-09-01', label: 'x' }]), NOW).score ?? 0
    expect(recent).toBeLessThan(50)
    expect(old).toBeLessThan(50)
    expect(old).toBeGreaterThan(recent)
  })

  it('un besoin déjà exprimé deux fois sur le même terme est un besoin récurrent', () => {
    const out = axisClientHistory(
      need([
        { kind: 'need', date: '2025-06-01', label: 'Développeur Java senior' },
        { kind: 'need', date: '2026-02-01', label: 'Architecte Java' },
        { kind: 'need', date: '2026-03-01', label: 'Data engineer Spark' },
      ]),
      NOW,
    )
    expect(out.score).toBeGreaterThan(50)
    expect(out.detail).toMatch(/besoin récurrent/i)
  })

  it('un besoin passé sans rapport avec ce besoin ne pèse pas', () => {
    expect(
      axisClientHistory(need([{ kind: 'need', date: '2026-02-01', label: 'Data engineer Spark' }]), NOW).score,
    ).toBeNull()
  })

  it('ne nomme jamais de provenance dans la preuve', () => {
    const out = axisClientHistory(need([{ kind: 'deal_won', date: '2026-09-01', label: 'TMA' }]), NOW)
    expect(JSON.stringify(out)).not.toMatch(/hubspot|salesforce|pipedrive|crm|dataforge/i)
  })
})

describe('clientHistoryFactsFor', () => {
  it('ne garde que les natures utiles à l’axe et borne la liste', () => {
    const facts = Array.from({ length: 60 }, (_, i) => ({
      date: '2026-01-01',
      kind: i % 2 ? ('deal_won' as const) : ('note' as const),
      label: `f${i}`,
      weight: 1,
      ageDays: 10,
    }))
    const out = clientHistoryFactsFor(facts)
    expect(out.every(f => f.kind === 'deal_won')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(40)
  })
})

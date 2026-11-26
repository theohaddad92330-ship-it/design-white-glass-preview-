import { describe, expect, it } from 'vitest'
import {
  buildAccountFactsBrief,
  findRecurringNeed,
  knownPersonKey,
  recentAccountFacts,
  recentExchanges,
  relanceHistoryOf,
  signalRecurrenceOf,
} from './account-facts-screens.js'
import type { AccountFact } from './account-facts.js'

const fact = (over: Partial<AccountFact>): AccountFact => ({
  date: '2026-01-01',
  kind: 'signal',
  label: 'x',
  weight: 1,
  ageDays: 0,
  ...over,
})

// #4072.5
describe('recentAccountFacts', () => {
  it('rend les N plus récents par DATE (pas par poids), sans poids ni provenance', () => {
    const out = recentAccountFacts(
      [
        fact({ date: '2024-01-01', label: 'vieux', weight: 9 }),
        fact({ date: '2026-09-01', label: 'récent', url: 'https://example.org/a' }),
        fact({ date: '2026-03-01', label: 'milieu' }),
        fact({ date: '2025-05-01', label: 'avant' }),
      ],
      3,
    )
    expect(out.map(f => f.label)).toEqual(['récent', 'milieu', 'avant'])
    expect(out[0]).toEqual({ date: '2026-09-01', kind: 'signal', label: 'récent', url: 'https://example.org/a' })
    expect(out[0]).not.toHaveProperty('weight')
  })
  it('écarte notes et corrections internes, dédoublonne, et rend [] sans fait', () => {
    const out = recentAccountFacts([
      fact({ kind: 'note', label: 'n' }),
      fact({ kind: 'correction', label: 'c' }),
      fact({ label: 'a', date: '2026-02-01' }),
      fact({ label: 'A', date: '2026-02-01T10:00:00Z' }),
    ])
    expect(out).toHaveLength(1)
    expect(recentAccountFacts([])).toEqual([])
  })
})

// #4072.4
describe('findRecurringNeed', () => {
  const past = [
    fact({ kind: 'need', label: 'Développeur Java senior', date: '2025-08-01', ageDays: 400 }),
    fact({ kind: 'deal_won', label: 'TMA Java', date: '2025-09-01' }),
  ]
  it('signale un fait neuf qui répète un besoin passé', () => {
    const hit = findRecurringNeed({ label: 'Recrutement développeur Java senior', date: '2026-10-10' }, past)
    expect(hit).toMatchObject({ kind: 'need', date: '2025-08-01' })
  })
  it('ne signale rien sans mot commun significatif, ni pour un fait du même jour', () => {
    expect(findRecurringNeed({ label: 'Levée de fonds série B', date: '2026-10-10' }, past)).toBeNull()
    expect(findRecurringNeed({ label: 'Développeur Java senior', date: '2025-08-01' }, past)).toBeNull()
  })
  it('ne compare qu’aux besoins et recrutements passés, pas aux affaires', () => {
    expect(
      findRecurringNeed({ label: 'TMA Java', date: '2026-10-10' }, [fact({ kind: 'deal_won', label: 'TMA Java' })]),
    ).toBeNull()
  })
})

// #4072.2 / #4072.3
describe('recentExchanges et buildAccountFactsBrief', () => {
  const ex = (date: string, label: string) => fact({ kind: 'exchange', date, label })
  it('les échanges ne polluent pas les faits récents des cibles, et ont leur propre lecture', () => {
    const facts = [ex('2026-09-01', 'E-mail envoyé à Jeanne — Point projet'), fact({ label: 's', date: '2026-01-01' })]
    expect(recentAccountFacts(facts).map(f => f.label)).toEqual(['s'])
    expect(recentExchanges(facts, 3).map(f => f.label)).toEqual(['E-mail envoyé à Jeanne — Point projet'])
  })
  it('range la fiche : affaires, missions, besoins récurrents (≥ 2 jours distincts), échanges', () => {
    const brief = buildAccountFactsBrief('2026-10-12T00:00:00Z', [
      fact({ kind: 'deal_won', label: 'TMA', date: '2025-01-01' }),
      fact({ kind: 'deal_lost', label: 'Refonte', date: '2025-06-01' }),
      fact({ kind: 'mission', label: 'Mission data', date: '2024-01-01' }),
      fact({ kind: 'need', label: 'Développeur Java', date: '2025-02-01' }),
      fact({ kind: 'hiring', label: 'développeur java', date: '2026-03-01' }),
      fact({ kind: 'need', label: 'DevOps', date: '2026-03-01' }),
      ex('2026-09-01', 'Appel avec Jeanne'),
    ])
    expect(brief.deals.map(d => d.label)).toEqual(['Refonte', 'TMA'])
    expect(brief.notes).toEqual([])
    expect(brief.missions).toHaveLength(1)
    expect(brief.recurringNeeds).toEqual([{ label: 'développeur java', occurrences: 2, lastDate: '2026-03-01' }])
    expect(brief.exchanges).toHaveLength(1)
  })
  it('#4069.4 — les notes de l’équipe se lisent dans la fiche, les plus récentes d’abord', () => {
    const brief = buildAccountFactsBrief('2026-10-12T00:00:00Z', [
      fact({ kind: 'note', label: 'Sponsor rencontré au salon', date: '2026-09-01' }),
      fact({ kind: 'note', label: 'Budget gelé jusqu’en janvier', date: '2026-10-01' }),
      fact({ kind: 'meeting', label: 'Compte rendu du comité', date: '2026-10-05' }),
    ])
    expect(brief.notes.map(n => n.label)).toEqual(['Budget gelé jusqu’en janvier', 'Sponsor rencontré au salon'])
  })
  it('#4424.3 — les comptes rendus de rendez-vous et les besoins se lisent à part, pour la reprise du R1', () => {
    const brief = buildAccountFactsBrief('2026-10-12T00:00:00Z', [
      fact({ kind: 'note', label: 'Note libre', date: '2026-09-01' }),
      fact({ kind: 'meeting', label: 'CR du R1', date: '2026-10-05' }),
      fact({ kind: 'meeting', label: 'CR plus ancien', date: '2026-04-05' }),
      fact({ kind: 'need', label: 'Lead data', date: '2026-10-06' }),
      fact({ kind: 'hiring', label: 'Offre publiée', date: '2026-10-07' }),
    ])
    expect(brief.meetings?.map(m => m.label)).toEqual(['CR du R1', 'CR plus ancien'])
    // Un besoin ENREGISTRÉ, pas une offre d'emploi publiée.
    expect(brief.needs?.map(n => n.label)).toEqual(['Lead data'])
    expect(brief.notes?.map(n => n.label)).toEqual(['Note libre'])
  })
  it('une rubrique sans fait est vide — jamais inventée', () => {
    const brief = buildAccountFactsBrief('2026-10-12T00:00:00Z', [])
    expect(brief).toMatchObject({ deals: [], missions: [], recurringNeeds: [], exchanges: [] })
  })
})

// #4072.2
describe('relanceHistoryOf', () => {
  it('porte 3 échanges et 2 faits récents au plus, null sans rien', () => {
    const facts = [
      ...[1, 2, 3, 4].map(n => fact({ kind: 'exchange', date: `2026-0${n}-01`, label: `e${n}` })),
      ...[5, 6, 7].map(n => fact({ date: `2026-0${n}-01`, label: `s${n}` })),
    ]
    const h = relanceHistoryOf(facts)
    expect(h?.exchanges.map(e => e.label)).toEqual(['e4', 'e3', 'e2'])
    expect(h?.recent_facts.map(e => e.label)).toEqual(['s7', 's6'])
    expect(relanceHistoryOf([])).toBeNull()
  })
})

// #4072.1
describe('knownPersonKey', () => {
  it('neutralise la forme, jamais l’orthographe', () => {
    expect(knownPersonKey('  Hélène  GARREAU ')).toBe('helene garreau')
    expect(knownPersonKey('Jean Dupond')).not.toBe(knownPersonKey('Jean Dupont'))
  })
})

// #4072.4 — la récurrence d'un signal par cible (Watchlist)
describe('signalRecurrenceOf', () => {
  const asOf = new Date('2026-10-15T08:00:00Z')
  const s = (kind: AccountFact['kind'], date: string, label = `${kind} ${date}`) => ({ kind, date, label })

  it('compte le Ne signal de recrutement dans les 30 jours', () => {
    const r = signalRecurrenceOf(
      [s('hiring', '2026-10-10'), s('hiring', '2026-10-01'), s('hiring', '2026-09-20'), s('hiring', '2026-08-01')],
      asOf,
    )
    expect(r).toEqual({ kind: 'hiring', count: 3, windowDays: 30 })
  })

  it('sait dire NON : un seul signal, ou hors fenêtre, ou le même fait relu — rien', () => {
    expect(signalRecurrenceOf([s('hiring', '2026-10-10')], asOf)).toBeNull()
    expect(signalRecurrenceOf([s('hiring', '2026-10-10'), s('hiring', '2026-07-01')], asOf)).toBeNull()
    expect(
      signalRecurrenceOf([s('hiring', '2026-10-10', 'Recrutement'), s('hiring', '2026-10-10', 'recrutement')], asOf),
    ).toBeNull()
    expect(signalRecurrenceOf([s('hiring', '2026-10-10'), s('need', '2026-10-09')], asOf)).toBeNull()
    expect(signalRecurrenceOf([], asOf)).toBeNull()
  })

  it('ignore les natures internes et les dates futures', () => {
    expect(signalRecurrenceOf([s('note', '2026-10-10'), s('note', '2026-10-09')], asOf)).toBeNull()
    expect(signalRecurrenceOf([s('hiring', '2026-10-30'), s('hiring', '2026-10-29')], asOf)).toBeNull()
  })
})

import { DISCOVER_BLOCK_CAP } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { historyReason, historySubject, splitDiscoverBlocks } from './discover-history-blocks'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'

const NOW = Date.parse('2026-10-28T12:00:00Z')

const offer = (date: string, label = 'Développeur Java'): DiscoverSignal => ({ type: 'hiring', date, label })

function candidate(siren: string, signals: DiscoverSignal[]): DiscoverCandidate {
  return { name: `Compte ${siren}`, siren, signals } as unknown as DiscoverCandidate
}

describe('#4758 — la raison d’un compte à historique', () => {
  it('nomme la techno, le nombre, la période et l’âge du plus récent', () => {
    const signals = [
      offer('2025-03-01'),
      offer('2025-11-10'),
      offer('2026-07-20'),
      offer('2026-01-05', 'Ingénieur Python'),
    ]
    expect(historyReason(candidate('1', signals), { nowMs: NOW, subject: 'Java' })).toEqual({
      count: 3,
      kind: 'offers',
      subject: 'Java',
      fromYear: 2025,
      toYear: 2026,
      lastAgeDays: 100,
    })
  })

  it('sans sujet de recherche, compte tous les besoins datés et ne nomme aucune techno', () => {
    const reason = historyReason(candidate('1', [offer('2025-03-01'), offer('2025-04-01')]), { nowMs: NOW })
    expect(reason).toMatchObject({ count: 2, subject: null, fromYear: 2025, toYear: 2025 })
  })

  it('un sujet qui ne recoupe aucun besoin n’est pas inventé : on compte sans le nommer', () => {
    const reason = historyReason(candidate('1', [offer('2025-03-01')]), { nowMs: NOW, subject: 'Rust' })
    expect(reason).toMatchObject({ count: 1, subject: null })
  })

  it('dit « besoins » et non « offres » dès qu’un besoin compté n’est pas une offre d’emploi', () => {
    const tender: DiscoverSignal = { type: 'tender', date: '2025-05-01', label: 'Appel d’offres Java' }
    expect(historyReason(candidate('1', [offer('2025-03-01'), tender]), { nowMs: NOW })?.kind).toBe('needs')
  })

  it('rien de daté, ou que de la vie juridique, ou une date de détection : pas de raison', () => {
    expect(historyReason(candidate('1', []), { nowMs: NOW })).toBeNull()
    expect(
      historyReason(candidate('1', [{ type: 'legal', date: '2025-01-01', label: 'Dépôt' }]), { nowMs: NOW }),
    ).toBeNull()
    expect(
      historyReason(candidate('1', [{ ...offer('2025-01-01'), dateIsDetection: true }]), { nowMs: NOW }),
    ).toBeNull()
  })
})

describe('#4761 — deux blocs, un plafond, jamais silencieux', () => {
  const recent = (n: number) => candidate(`r${n}`, [offer('2026-10-20')])
  const old = (n: number) => candidate(`h${n}`, [offer('2025-02-01')])
  const none = candidate('n', [])

  it('range les comptes à signal récent, puis ceux à historique seul', () => {
    const blocks = splitDiscoverBlocks([old(1), recent(1), none, recent(2)], { nowMs: NOW })
    expect(blocks.recent.rows.map(c => c.siren)).toEqual(['r1', 'r2'])
    expect(blocks.history.rows.map(c => c.siren)).toEqual(['h1'])
    expect(blocks.unlisted).toBe(1)
  })

  it('plafonne chaque bloc à DISCOVER_BLOCK_CAP et dit le total et le reste', () => {
    const rows = [...Array.from({ length: 134 }, (_, i) => recent(i)), ...Array.from({ length: 25 }, (_, i) => old(i))]
    const { recent: r, history: h } = splitDiscoverBlocks(rows, { nowMs: NOW })
    expect(DISCOVER_BLOCK_CAP).toBe(20)
    expect(r.shown).toHaveLength(20)
    expect([r.total, r.hidden]).toEqual([134, 114])
    expect([h.shown.length, h.total, h.hidden]).toEqual([20, 25, 5])
  })

  it('« voir les autres » ouvre tout le bloc', () => {
    const rows = Array.from({ length: 30 }, (_, i) => recent(i))
    expect(splitDiscoverBlocks(rows, { nowMs: NOW, expanded: { recent: true } }).recent.shown).toHaveLength(30)
  })

  it('un bloc vide est vide : total 0, aucune ligne — l’écran le fait disparaître', () => {
    const { history } = splitDiscoverBlocks([recent(1)], { nowMs: NOW })
    expect([history.total, history.hidden, history.shown]).toEqual([0, 0, []])
  })
})

describe('#4758 — le sujet de la raison suit le geste du commercial', () => {
  it('l’expertise cochée passe devant, puis les mots-clés actifs, puis la saisie libre', () => {
    expect(historySubject({ skills: 'Java', keywords: 'Go', freetext: 'Rust' })).toBe('Java')
    expect(historySubject({ skills: '', keywords: 'Go', freetext: 'Rust' })).toBe('Go')
  })

  it('« Java » tapé dans la barre (freetext) nomme la techno, comme une expertise cochée', () => {
    expect(historySubject({ skills: '', keywords: '', freetext: '  Java ' })).toBe('Java')
    const reason = historyReason(candidate('1', [offer('2025-03-01'), offer('2025-11-10')]), {
      nowMs: NOW,
      subject: historySubject({ skills: '', keywords: '', freetext: 'Java' }),
    })
    expect(reason).toMatchObject({ count: 2, subject: 'Java' })
  })

  it('rien de tapé : pas de sujet, jamais de techno devinée', () => {
    expect(historySubject({ skills: '', keywords: '', freetext: '   ' })).toBe('')
  })

  it('une phrase ne recoupe aucun besoin : la ligne reste générique, rien n’est inventé', () => {
    const reason = historyReason(candidate('1', [offer('2025-03-01')]), {
      nowMs: NOW,
      subject: historySubject({ skills: '', keywords: '', freetext: 'qui recrute des développeurs Java' }),
    })
    expect(reason).toMatchObject({ count: 1, subject: null })
  })
})

describe('#4819 — le bloc « à historique » ne contredit pas la ligne de preuve de la carte', () => {
  const withEvidence = (signals: DiscoverSignal[], date: string | null): DiscoverCandidate =>
    ({
      ...candidate('1', signals),
      skillEvidence: {
        skill: 'Java',
        offerCount: 2,
        latestOffer: { title: 'Lead Java', city: null, date, url: null, source: null },
      },
    }) as unknown as DiscoverCandidate

  // Le cas du jour : le seul signal de la fenêtre est une offre FERMÉE → rangé en historique.
  const closed: DiscoverSignal = { type: 'hiring', date: '2026-10-06', label: 'Lead Java', stillOpen: false }

  it('une offre de la preuve datée DANS la fenêtre, sur un compte rangé en historique, est signalée', () => {
    const c = withEvidence([closed], '2026-10-06')
    expect(splitDiscoverBlocks([c], { nowMs: NOW, windowDays: 90 }).history.total).toBe(1)
    expect(historyReason(c, { nowMs: NOW, windowDays: 90 })?.evidenceInsideWindow).toBe(true)
  })

  it('dit NON : une offre de la preuve plus vieille que la fenêtre, ou sans date, ne signale rien', () => {
    const old = withEvidence([closed], '2026-05-01')
    expect(historyReason(old, { nowMs: NOW, windowDays: 90 })?.evidenceInsideWindow).toBeUndefined()
    const undated = withEvidence([closed], null)
    expect(historyReason(undated, { nowMs: NOW, windowDays: 90 })?.evidenceInsideWindow).toBeUndefined()
  })
})

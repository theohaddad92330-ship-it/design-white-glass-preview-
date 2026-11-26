import { describe, expect, it } from 'vitest'
import { declaredSignalFreshness, pickDominantRecentSignal, summarizeSignalFreshness } from './signal-freshness-line.js'

const NOW = Date.UTC(2026, 9, 6)

describe('pickDominantRecentSignal — #3682.1', () => {
  it('prend le premier fait actuel, puis le premier non ancien, puis le premier', () => {
    const a = { freshness: 'archive' }
    const b = { freshness: null }
    const c = { freshness: 'current' }
    expect(pickDominantRecentSignal([a, b, c])).toBe(c)
    expect(pickDominantRecentSignal([a, b])).toBe(b)
    expect(pickDominantRecentSignal([a])).toBe(a)
    expect(pickDominantRecentSignal([])).toBeNull()
  })
})

describe('summarizeSignalFreshness — #3682.3/.4', () => {
  it('sépare la vérification (aujourd’hui) du dernier événement utile (juin 2026)', () => {
    const s = summarizeSignalFreshness({
      dominant: { date: 'juin 2026', freshness: 'current' },
      verifiedAt: '2026-10-06T08:00:00.000Z',
      nowMs: NOW,
    })
    expect(s).toEqual({ verifiedAt: '2026-10-06T08:00:00.000Z', eventDate: 'juin 2026', state: 'current' })
  })

  it('cas TF1 : un fait de 2024 reste historique malgré une analyse relancée en 2026', () => {
    const s = summarizeSignalFreshness({
      dominant: { date: '2024-10', freshness: 'archive' },
      verifiedAt: '2026-10-06T08:00:00.000Z',
      nowMs: NOW,
    })
    expect(s.state).toBe('historical')
    expect(s.eventDate).toBe('2024-10')
  })

  it('un fait sans fraîcheur posée mais vieux de plus de 24 mois est historique', () => {
    const s = summarizeSignalFreshness({ dominant: { date: '2021', freshness: null }, verifiedAt: null, nowMs: NOW })
    expect(s.state).toBe('historical')
  })

  it('date inconnue : jamais la date de vérification ni d’import', () => {
    const s = summarizeSignalFreshness({
      dominant: { date: null, freshness: null },
      verifiedAt: '2026-10-06T08:00:00.000Z',
      nowMs: NOW,
    })
    expect(s).toEqual({ verifiedAt: '2026-10-06T08:00:00.000Z', eventDate: null, state: 'undated' })
  })

  it('date future dans un texte de programme = horizon, pas date de publication', () => {
    const s = summarizeSignalFreshness({
      dominant: { date: 'décembre 2026', freshness: 'current' },
      verifiedAt: null,
      nowMs: NOW,
    })
    expect(s.eventDate).toBeNull()
    expect(s.state).toBe('undated')
  })

  it('aucun signal : aucun événement, la vérification reste dite', () => {
    const s = summarizeSignalFreshness({ dominant: null, verifiedAt: '2026-10-06T08:00:00.000Z', nowMs: NOW })
    expect(s).toEqual({ verifiedAt: '2026-10-06T08:00:00.000Z', eventDate: null, state: 'none' })
  })
})

describe('declaredSignalFreshness — #3682.6 un import ne rajeunit pas ses faits', () => {
  it('un document de 2023 importé en 2026 est archive, pas actuel', () => {
    expect(declaredSignalFreshness('2023-03-01', NOW)).toBe('archive')
  })
  it('sans date : undated, jamais current', () => {
    expect(declaredSignalFreshness(null, NOW)).toBe('undated')
  })
  it('un fait récent reste actuel', () => {
    expect(declaredSignalFreshness('2026-06-01', NOW)).toBe('current')
  })
})

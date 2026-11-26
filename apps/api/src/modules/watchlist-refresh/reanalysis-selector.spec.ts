import {
  REANALYSIS_AFTER_DAYS,
  isReanalysisDue,
  nextReanalysisAt,
  nextReanalysisFor,
  nextReanalysisReasonFor,
  reanalysisJobId,
  selectReanalysisBatch,
} from './watchlist-refresh.queue'

const NOW = new Date('2026-10-19T04:40:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

// #4267.5 — un compte suivi explicitement dont la dernière analyse a plus de 15 jours est ré-analysé.
describe('isReanalysisDue (#4267.5)', () => {
  it('le délai est de 15 jours', () => {
    expect(REANALYSIS_AFTER_DAYS).toBe(15)
  })

  it('suivi, dernière analyse il y a 16 jours → oui', () => {
    expect(isReanalysisDue({ followed: true, lastAnalysisAt: daysAgo(16), now: NOW })).toBe(true)
  })

  it('suivi, dernière analyse il y a 14 jours → non', () => {
    expect(isReanalysisDue({ followed: true, lastAnalysisAt: daysAgo(14), now: NOW })).toBe(false)
  })

  it('non suivi, même très ancien → non', () => {
    expect(isReanalysisDue({ followed: false, lastAnalysisAt: daysAgo(200), now: NOW })).toBe(false)
  })

  it('dernière analyse inconnue → non (on ne devine pas une date)', () => {
    expect(isReanalysisDue({ followed: true, lastAnalysisAt: null, now: NOW })).toBe(false)
  })
})

describe('selectReanalysisBatch / reanalysisJobId (#4267.5)', () => {
  const row = (id: string, days: number, followed = true) => ({
    id,
    user_id: 'u1',
    followed,
    last_analysis_at: daysAgo(days),
  })

  it('ne garde que les comptes dus, jamais tout le parc', () => {
    const batch = selectReanalysisBatch([row('a', 16), row('b', 14), row('c', 30, false)], NOW)

    expect(batch.map(r => r.id)).toEqual(['a'])
  })

  it('jamais deux fois le même compte pour la même analyse précédente', () => {
    const last = new Date('2026-10-03T14:00:00Z')
    const id = reanalysisJobId('a', last)
    expect(reanalysisJobId('a', new Date('2026-10-03T08:00:00Z'))).toBe(id)
    expect(reanalysisJobId('b', last)).not.toBe(id)
    // une nouvelle analyse ouvre une nouvelle fenêtre : le rejeu suivant n'est pas dédupliqué par erreur.
    expect(reanalysisJobId('a', new Date('2026-10-19T14:00:00Z'))).not.toBe(id)
  })
})

// #4283.8 — « au plus 15 jours » : le cron passe à 04:40, une analyse de 14 h est rejouée le 15e jour, pas le 16e.
describe('échéance au jour près (#4283.8)', () => {
  it('analysée il y a 15 jours calendaires, même tard le soir → due au tick du matin', () => {
    const last = new Date('2026-10-04T14:00:00Z')
    expect(isReanalysisDue({ followed: true, lastAnalysisAt: last, now: NOW })).toBe(true)
  })

  it('analysée il y a 14 jours calendaires → pas encore, jamais de rejeu anticipé', () => {
    const last = new Date('2026-10-05T01:00:00Z')
    expect(isReanalysisDue({ followed: true, lastAnalysisAt: last, now: NOW })).toBe(false)
  })

  it('nextReanalysisAt : le jour de la prochaine, 15 jours calendaires après la dernière analyse', () => {
    expect(nextReanalysisAt(new Date('2026-10-04T14:00:00Z'))).toBe('2026-10-19')
  })

  it('nextReanalysisAt : date inconnue → null, jamais devinée', () => {
    expect(nextReanalysisAt(null)).toBeNull()
  })
})

// #4283.8 / recette 21/10 K4 — un compte SUIVI sans date dit POURQUOI ; jamais un null muet.
describe('nextReanalysisReasonFor (#4283.8, recette 21/10 K4)', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })
  const analysed = new Date('2026-10-04T14:00:00Z')

  it('suivi, analysé, veille active → une date, aucune raison', () => {
    expect(nextReanalysisFor(true, analysed)).toBe('2026-10-19')
    expect(nextReanalysisReasonFor(true, analysed)).toBeNull()
  })

  it('suivi mais jamais analysé → pas de date, raison « never_analyzed »', () => {
    expect(nextReanalysisFor(true, null)).toBeNull()
    expect(nextReanalysisReasonFor(true, null)).toBe('never_analyzed')
  })

  it('suivi, veille coupée (kill switch) → pas de date, raison « suspended »', () => {
    process.env['WATCHLIST_REFRESH_DISABLED'] = 'true'
    expect(nextReanalysisFor(true, analysed)).toBeNull()
    expect(nextReanalysisReasonFor(true, analysed)).toBe('suspended')
  })

  it('suivi, plafond à 0 → la veille est coupée : « suspended », pas de date', () => {
    process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '0'
    expect(nextReanalysisFor(true, analysed)).toBeNull()
    expect(nextReanalysisReasonFor(true, analysed)).toBe('suspended')
  })

  it('compte NON suivi → pas de date, raison « not_followed » (recette 22/10 K4), quoi qu’il arrive', () => {
    expect(nextReanalysisFor(false, analysed)).toBeNull()
    expect(nextReanalysisReasonFor(false, null)).toBe('not_followed')
    expect(nextReanalysisReasonFor(false, analysed)).toBe('not_followed')
    process.env['WATCHLIST_REFRESH_DISABLED'] = 'true'
    expect(nextReanalysisReasonFor(false, analysed)).toBe('not_followed')
  })

  it('⚠️ un compte suivi n’a jamais date ET raison nulles ensemble', () => {
    for (const last of [null, analysed, new Date('garbage')]) {
      expect(nextReanalysisFor(true, last) ?? nextReanalysisReasonFor(true, last)).not.toBeNull()
    }
  })
})

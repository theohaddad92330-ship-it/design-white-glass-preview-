import { describe, expect, it } from 'vitest'
import {
  classifyTemporalStatus,
  countActiveSignals,
  isSignalArchived,
  signalDateMs,
  signalImportance,
} from './account.js'

// 2026-07-14 UTC — fixed so the ~24-month archive boundary is deterministic.
const NOW = Date.UTC(2026, 6, 14)

describe('isSignalArchived (Théo p.7/p.35 — a 2021 signal is an archive)', () => {
  it('archives a signal older than ~24 months (by date)', () => {
    expect(isSignalArchived({ date: '10 mars 2021' }, NOW)).toBe(true)
    expect(isSignalArchived({ date: '2000-01-01' }, NOW)).toBe(true)
  })

  it('keeps a recent or future signal active', () => {
    expect(isSignalArchived({ date: '1 janv. 2026' }, NOW)).toBe(false)
    expect(isSignalArchived({ date: 'Mai 2025' }, NOW)).toBe(false) // ~14 months
    expect(isSignalArchived({ date: '2999-01-01' }, NOW)).toBe(false)
  })

  it('reads the LEADING year, not a later date embedded in the string', () => {
    // "Revenus 2022 … accounts filed 2025-11" — about 2022 (archive), not 2025-11.
    // #4832 : l'année seule vaut la FIN de 2022 (31/12), pas le 1er janvier — 2022 reste archive à 730 j.
    expect(isSignalArchived({ date: '2022 (full year accounts filed 2025-11)' }, NOW)).toBe(true)
  })

  it('an undated signal is not an archive', () => {
    expect(isSignalArchived({ date: 'date non normalisée' }, NOW)).toBe(false)
    expect(isSignalArchived({ date: null }, NOW)).toBe(false)
  })

  it('honours an IA-stamped freshness over the date', () => {
    expect(isSignalArchived({ freshness: 'archive', date: '2026-01-01' }, NOW)).toBe(true)
    expect(isSignalArchived({ freshness: 'current', date: '2019-01-01' }, NOW)).toBe(false)
  })
})

describe('signalImportance (V2 §20 — dérivée de règles existantes, jamais inventée)', () => {
  it('an active, SOURCED signal is high — la règle « un signal sans source n’est pas une preuve »', () => {
    expect(signalImportance({ date: 'Juillet 2026', source: 'Les Échos' }, NOW)).toBe('high')
    expect(signalImportance({ freshness: 'current', source: 'https://exemple.fr/news' }, NOW)).toBe('high')
  })

  it('an active but UNSOURCED signal is medium — réel, non opposable', () => {
    expect(signalImportance({ date: 'Juillet 2026', source: null }, NOW)).toBe('medium')
    expect(signalImportance({ date: 'Juillet 2026', source: '   ' }, NOW)).toBe('medium')
  })

  it('an ARCHIVED signal is low, sourced or not — la règle partagée Cockpit/Veille', () => {
    expect(signalImportance({ date: '10 mars 2021', source: 'Les Échos' }, NOW)).toBe('low')
    expect(signalImportance({ freshness: 'archive', date: '2026-01-01', source: 'Les Échos' }, NOW)).toBe('low')
  })

  it('returns null when nothing situates the signal in time (never a guess)', () => {
    expect(signalImportance({ freshness: 'undated', source: 'Les Échos' }, NOW)).toBeNull()
    expect(signalImportance({ date: null, source: 'Les Échos' }, NOW)).toBeNull()
    expect(signalImportance({ date: 'date non normalisée', source: 'Les Échos' }, NOW)).toBeNull()
    expect(signalImportance({}, NOW)).toBeNull()
  })

  it('agrees with isSignalArchived on every dated signal (one shared rule, not two)', () => {
    for (const date of ['Juillet 2026', 'Mai 2025', '10 mars 2021', '2024 (accounts filed 2025-11)']) {
      const archived = isSignalArchived({ date }, NOW)
      expect(signalImportance({ date, source: 'Les Échos' }, NOW)).toBe(archived ? 'low' : 'high')
    }
  })
})

describe('classifyTemporalStatus (#3206.3, épopée #3240 — additif, jamais un remplacement de freshness)', () => {
  it('trusts an IA-stamped temporal_status over any derivation', () => {
    expect(classifyTemporalStatus({ temporal_status: 'STALE', freshness: 'current', date: '2026-01-01' }, NOW)).toBe(
      'STALE',
    )
  })

  it('derives UNDATED / RECENT the same way as isSignalArchived when unstamped (legacy rows)', () => {
    expect(classifyTemporalStatus({ freshness: 'undated' }, NOW)).toBe('UNDATED')
    expect(classifyTemporalStatus({ date: 'Juillet 2026' }, NOW)).toBe('RECENT')
  })

  it('an archived STATE-describing type (nomination/partenariat/restructuration/acquisition) is HISTORICAL', () => {
    expect(classifyTemporalStatus({ date: '10 mars 2021', type: 'nomination' }, NOW)).toBe('HISTORICAL')
  })

  it('an archived TIME-LIMITED or unknown type is STALE', () => {
    expect(classifyTemporalStatus({ date: '10 mars 2021', type: 'budget' }, NOW)).toBe('STALE')
    expect(classifyTemporalStatus({ date: '10 mars 2021' }, NOW)).toBe('STALE')
  })

  it('returns null when nothing situates the signal in time (never a guess)', () => {
    expect(classifyTemporalStatus({ date: 'date non normalisée' }, NOW)).toBeNull()
    expect(classifyTemporalStatus({}, NOW)).toBeNull()
  })

  // #3206.2 (partiel, épopée #3240) — un commercial a cliqué « Marquer
  // vérifié » (`POST /signal-history/verify`). Une observation n'est pas une
  // vérification : celle-ci vient d'un geste humain explicite, jamais d'une
  // re-détection, et elle gagne sur ce que l'IA avait stampé — même doctrine
  // que « une correction humaine gagne toujours ».
  describe('CURRENT_VERIFIED — la vérification humaine que l’IA ne stampe jamais', () => {
    it('wins over an IA-stamped STALE when verified recently', () => {
      expect(
        classifyTemporalStatus(
          { temporal_status: 'STALE', date: '10 mars 2021', last_verified_at: '2026-06-20T00:00:00.000Z' },
          NOW,
        ),
      ).toBe('CURRENT_VERIFIED')
    })

    it('rescues even an UNDATED or unparsable signal — the human confirms it, the date no longer matters', () => {
      expect(classifyTemporalStatus({ freshness: 'undated', last_verified_at: '2026-06-20T00:00:00.000Z' }, NOW)).toBe(
        'CURRENT_VERIFIED',
      )
      expect(
        classifyTemporalStatus({ date: 'date non normalisée', last_verified_at: '2026-06-20T00:00:00.000Z' }, NOW),
      ).toBe('CURRENT_VERIFIED')
    })

    it('expires — a verification is perishable too (tranché sans Louis : 90 jours)', () => {
      expect(
        classifyTemporalStatus(
          { date: '10 mars 2021', type: 'budget', last_verified_at: '2025-01-01T00:00:00.000Z' },
          NOW,
        ),
      ).toBe('STALE')
    })

    it('ignores a null/absent/malformed last_verified_at — never a guessed verification', () => {
      expect(classifyTemporalStatus({ date: 'Juillet 2026', last_verified_at: null }, NOW)).toBe('RECENT')
      expect(classifyTemporalStatus({ date: 'Juillet 2026', last_verified_at: 'pas une date' }, NOW)).toBe('RECENT')
    })
  })

  // #3206.3 (reste, épopée #3240) — SUPERSEDED : un fait DÉJÀ posé en base
  // (`history_status: 'resolved'`, signal_history — « no longer present in
  // the latest analysis »), jamais une comparaison de texte entre signaux.
  describe('SUPERSEDED — un signal résolu, plus rapporté par la dernière analyse', () => {
    it('wins over an IA-stamped RECENT when the signal was resolved', () => {
      expect(
        classifyTemporalStatus({ temporal_status: 'RECENT', date: 'Juillet 2026', history_status: 'resolved' }, NOW),
      ).toBe('SUPERSEDED')
    })

    it('wins even over CURRENT_VERIFIED — a resolved fact is no longer the current one', () => {
      expect(
        classifyTemporalStatus(
          { date: 'Juillet 2026', last_verified_at: '2026-06-20T00:00:00.000Z', history_status: 'resolved' },
          NOW,
        ),
      ).toBe('SUPERSEDED')
    })

    it('an active (non-resolved) signal is never SUPERSEDED', () => {
      expect(classifyTemporalStatus({ date: 'Juillet 2026', history_status: 'active' }, NOW)).toBe('RECENT')
      expect(classifyTemporalStatus({ date: 'Juillet 2026', history_status: null }, NOW)).toBe('RECENT')
    })
  })
})

describe('countActiveSignals — the shared Cockpit/Veille metric', () => {
  it('counts only non-archived signals', () => {
    const signals = [
      { date: 'Juillet 2026' }, // active
      { date: 'Mai 2025' }, // active
      { date: '10 mars 2021' }, // archive
      { date: '2022 (accounts filed 2025-11)' }, // archive
    ]
    expect(countActiveSignals(signals, NOW)).toBe(2)
  })
})

// #4716 — miroir TS de `read_signal_date` (apps/ia/app/services/signal_freshness.py, #4647).
describe('signalDateMs (#4716 — mois en toutes lettres, jamais le 1er janvier)', () => {
  const MONTHS: ReadonlyArray<readonly [string, number]> = [
    ['janvier', 1], ['février', 2], ['mars', 3], ['avril', 4], ['mai', 5], ['juin', 6],
    ['juillet', 7], ['août', 8], ['septembre', 9], ['octobre', 10], ['novembre', 11], ['décembre', 12],
  ] // prettier-ignore

  it.each(MONTHS)('lit « 15 %s 2026 »', (name, month) => {
    expect(signalDateMs(`15 ${name} 2026`)).toBe(Date.UTC(2026, month - 1, 15))
    expect(signalDateMs(`15 ${name.toUpperCase()} 2026`)).toBe(Date.UTC(2026, month - 1, 15))
  })

  it('lit les abréviations, avec ou sans accent et point', () => {
    expect(signalDateMs('1 janv. 2026')).toBe(Date.UTC(2026, 0, 1))
    expect(signalDateMs('3 févr. 2026')).toBe(Date.UTC(2026, 1, 3))
    expect(signalDateMs('3 fevr 2026')).toBe(Date.UTC(2026, 1, 3))
    expect(signalDateMs('9 sept. 2026')).toBe(Date.UTC(2026, 8, 9))
    expect(signalDateMs('9 déc. 2026')).toBe(Date.UTC(2026, 11, 9))
    expect(signalDateMs('1er octobre 2026')).toBe(Date.UTC(2026, 9, 1))
  })

  it('le cas du dossier : « 23 octobre 2026 » est le 23 octobre', () => {
    expect(signalDateMs('23 octobre 2026')).toBe(Date.UTC(2026, 9, 23))
  })

  it('un mois sans jour vaut la FIN du mois (#4832), pas le 1er janvier', () => {
    expect(signalDateMs('octobre 2026')).toBe(Date.UTC(2026, 9, 31))
  })

  it('lit les deux formats numériques', () => {
    expect(signalDateMs('2026-10-23')).toBe(Date.UTC(2026, 9, 23))
    expect(signalDateMs('2026/10/23')).toBe(Date.UTC(2026, 9, 23))
    expect(signalDateMs('2026-10')).toBe(Date.UTC(2026, 9, 31))
    expect(signalDateMs('2026')).toBe(Date.UTC(2026, 11, 31))
  })

  it('ancre sur la PREMIÈRE année : une date postérieure dans une parenthèse ne gagne pas', () => {
    expect(signalDateMs('2024 (comptes déposés 2025-11)')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('2024 (déposés le 3 mars 2025)')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('10 mars 2021 (rapport 2025-11)')).toBe(Date.UTC(2021, 2, 10))
  })

  it('une plage d’années vaut son année de fin, jamais « mois 20 »', () => {
    expect(signalDateMs('2023-2024')).toBe(Date.UTC(2024, 11, 31))
  })

  it('borne le jour au mois réel et le mois à 1-12', () => {
    expect(signalDateMs('31 novembre 2026')).toBe(Date.UTC(2026, 10, 30))
    expect(signalDateMs('2026-02-31')).toBe(Date.UTC(2026, 1, 28))
    // #4832 — un mois hors 1-12 n'est plus clampé : il n'est pas un mois. Seule l'année
    // ancre, et une année seule vaut son 31/12 (c'est ce qui empêche « 2023-2024 » d'être
    // lu comme un mois 20).
    expect(signalDateMs('2026-13-01')).toBe(Date.UTC(2026, 11, 31))
  })

  it('dit NON : un mot qui n’est pas un mois, du texte sans année, du vide', () => {
    expect(signalDateMs('depuis lundi 2026')).toBe(Date.UTC(2026, 11, 31))
    expect(signalDateMs('Non daté précisément')).toBeNull()
    expect(signalDateMs('')).toBeNull()
    expect(signalDateMs(null)).toBeNull()
  })

  it('« 23 octobre 2026 » n’est plus une archive, une vraie offre de 2024 l’est toujours', () => {
    const now = Date.UTC(2026, 9, 27)
    expect(isSignalArchived({ date: '23 octobre 2026' }, now)).toBe(false)
    expect(signalDateMs('23 octobre 2026')).toBeGreaterThan(now - 5 * 24 * 3600 * 1000)
    expect(isSignalArchived({ date: '12 mars 2024' }, now)).toBe(true)
  })
})

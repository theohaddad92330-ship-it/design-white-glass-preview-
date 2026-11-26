import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_VERDICT_COLOR,
  accountDisplayVerdict,
  accountVerdictFromScore,
  normalizeStoredVerdict,
} from './account-score.js'

describe('EXPLORER verdict (annexe méthodo p25)', () => {
  it('is never derived from the /10 score alone', () => {
    // EXPLORER needs a data-completeness signal → only the stored verdict carries it.
    for (const s of [0, 4, 4.9, 5, 6.9, 7, 10]) {
      expect(accountVerdictFromScore(s)).not.toBe('EXPLORER')
    }
  })

  it('has a distinct display colour', () => {
    expect(ACCOUNT_VERDICT_COLOR.EXPLORER).toBe('#6366F1')
  })
})

describe('normalizeStoredVerdict — IA/legacy verdict → display verdict', () => {
  it('folds STOP and legacy NO-GO/CONDITIONNEL, preserves EXPLORER', () => {
    expect(normalizeStoredVerdict('GO')).toBe('GO')
    expect(normalizeStoredVerdict('PRUDENT')).toBe('PRUDENT')
    expect(normalizeStoredVerdict('CONDITIONNEL')).toBe('PRUDENT')
    expect(normalizeStoredVerdict('STOP')).toBe('NO-GO')
    expect(normalizeStoredVerdict('NO-GO')).toBe('NO-GO')
    expect(normalizeStoredVerdict('EXPLORER')).toBe('EXPLORER')
  })

  it('is case/space tolerant and null-safe', () => {
    expect(normalizeStoredVerdict(' explorer ')).toBe('EXPLORER')
    expect(normalizeStoredVerdict(null)).toBeNull()
    expect(normalizeStoredVerdict('')).toBeNull()
    expect(normalizeStoredVerdict('bogus')).toBeNull()
  })
})

describe('accountDisplayVerdict — le verdict affiché du dossier (badge sous le score)', () => {
  it('préfère le verdict émis par l’IA quand il existe', () => {
    // Le bug vécu sur TF1 : le donut affiche 3/10 → dérivé « NO-GO », mais l’IA
    // a écrit « EXPLORER » dans le dossier. Le badge doit dire ce que l’IA a
    // conclu, pas ce que le seuil /10 recalcule à côté.
    expect(accountDisplayVerdict(3, 'EXPLORER')).toBe('EXPLORER')
    expect(accountDisplayVerdict(8, 'PRUDENT')).toBe('PRUDENT')
    expect(accountDisplayVerdict(3, 'STOP')).toBe('NO-GO')
  })

  it('retombe sur le dérivé /10 quand l’IA n’a pas émis de verdict', () => {
    expect(accountDisplayVerdict(8, null)).toBe('GO')
    expect(accountDisplayVerdict(6, undefined)).toBe('PRUDENT')
    expect(accountDisplayVerdict(2, '')).toBe('NO-GO')
    expect(accountDisplayVerdict(2, 'bogus')).toBe('NO-GO')
  })

  it('sans score ET sans verdict → rien à afficher', () => {
    expect(accountDisplayVerdict(null, null)).toBeNull()
    expect(accountDisplayVerdict(undefined, '')).toBeNull()
  })

  it('un verdict IA seul suffit même sans score', () => {
    expect(accountDisplayVerdict(null, 'EXPLORER')).toBe('EXPLORER')
  })
})

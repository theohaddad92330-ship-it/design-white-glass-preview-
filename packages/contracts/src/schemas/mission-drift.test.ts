import { describe, expect, it } from 'vitest'
import {
  MISSION_DRIFT_SIGNAL_IDS,
  MISSION_DRIFT_THRESHOLDS,
  detectMissionDrift,
  type MissionMonth,
} from './mission-drift.js'

/**
 * Le détecteur de dérive — PDF5Delivery §7.2, « la mission qui dérape ».
 *
 * Une mission ne se casse pas d'un coup. L'écart entre jours prévus et déclarés
 * se creuse mois après mois, et on s'en aperçoit au troisième.
 */

/** Un mois sain : rien à signaler sur aucun des cinq signaux. */
function month(period: string, over: Partial<MissionMonth> = {}): MissionMonth {
  return {
    period,
    expectedDays: 20,
    declaredDays: 20,
    daysToSubmit: 3,
    daysToClientValidation: 2,
    satisfaction: 80,
    disputed: false,
    ...over,
  }
}

describe('detectMissionDrift — la règle d’honnêteté avant tout', () => {
  it('dit « non mesuré » et JAMAIS « pas de dérive » sous trois mois d’historique', () => {
    // « Cassé » et « rien à signaler » se ressemblent trop : deux mois ne
    // permettent pas de conclure, et une mission neuve n'est pas une mission saine.
    const verdict = detectMissionDrift([month('2026-06'), month('2026-07')])
    expect(verdict.kind).toBe('unmeasurable')
    expect(verdict.months).toBe(2)
  })

  it('exige DEUX signaux minimum — un point unique n’est pas une dérive', () => {
    // « Un mois d'écart n'est pas une dérive — c'est un mois. Alerter sur un
    // point unique détruit la crédibilité de l'alerte. »
    const months = [
      month('2026-05', { declaredDays: 18 }),
      month('2026-06', { declaredDays: 16 }),
      month('2026-07', { declaredDays: 14 }),
    ]
    const verdict = detectMissionDrift(months)
    expect(verdict.kind).toBe('steady')
    if (verdict.kind === 'steady') expect(verdict.firing).toEqual(['growing_day_gap'])
  })

  it('alerte dès que DEUX signaux se déclenchent sur trois mois', () => {
    const months = [
      month('2026-05', { declaredDays: 18, daysToSubmit: 3 }),
      month('2026-06', { declaredDays: 16, daysToSubmit: 6 }),
      month('2026-07', { declaredDays: 14, daysToSubmit: 11 }),
    ]
    const verdict = detectMissionDrift(months)
    expect(verdict.kind).toBe('drifting')
    if (verdict.kind === 'drifting') {
      expect(verdict.signals).toEqual(['growing_day_gap', 'late_timesheet'])
      expect(verdict.months).toBe(3)
    }
  })
})

describe('detectMissionDrift — les cinq signaux, un par un', () => {
  const filler = [month('2026-05'), month('2026-06'), month('2026-07')]

  function firing(months: MissionMonth[]): readonly string[] {
    const verdict = detectMissionDrift(months)
    return verdict.kind === 'drifting' ? verdict.signals : verdict.kind === 'steady' ? verdict.firing : []
  }

  it('1 · écart de jours croissant — trois mois CONSÉCUTIFS d’écart négatif', () => {
    expect(
      firing([
        month('2026-05', { declaredDays: 18 }),
        month('2026-06', { declaredDays: 16 }),
        month('2026-07', { declaredDays: 14 }),
      ]),
    ).toContain('growing_day_gap')
    // Deux mois négatifs séparés par un mois complet ne sont pas consécutifs.
    expect(
      firing([month('2026-05', { declaredDays: 18 }), month('2026-06'), month('2026-07', { declaredDays: 14 })]),
    ).not.toContain('growing_day_gap')
    // Un écart POSITIF (heures supplémentaires) n'est pas une dérive de ce signal.
    expect(
      firing([
        month('2026-05', { declaredDays: 22 }),
        month('2026-06', { declaredDays: 24 }),
        month('2026-07', { declaredDays: 26 }),
      ]),
    ).not.toContain('growing_day_gap')
  })

  it('2 · CRA de plus en plus tardif — délai de remise en hausse sur trois mois', () => {
    expect(
      firing([
        month('2026-05', { daysToSubmit: 2 }),
        month('2026-06', { daysToSubmit: 6 }),
        month('2026-07', { daysToSubmit: 9 }),
      ]),
    ).toContain('late_timesheet')
    // Un délai STABLE, même long, n'est pas une dérive : c'est une habitude.
    expect(
      firing([
        month('2026-05', { daysToSubmit: 9 }),
        month('2026-06', { daysToSubmit: 9 }),
        month('2026-07', { daysToSubmit: 9 }),
      ]),
    ).not.toContain('late_timesheet')
  })

  it('3 · validation client de plus en plus lente — même seuil que le CRA', () => {
    expect(
      firing([
        month('2026-05', { daysToClientValidation: 1 }),
        month('2026-06', { daysToClientValidation: 4 }),
        month('2026-07', { daysToClientValidation: 8 }),
      ]),
    ).toContain('slow_client_validation')
  })

  it('4 · satisfaction en baisse — DEUX mesures consécutives', () => {
    expect(
      firing([
        month('2026-05', { satisfaction: 80 }),
        month('2026-06', { satisfaction: 70 }),
        month('2026-07', { satisfaction: 60 }),
      ]),
    ).toContain('satisfaction_drop')
    // Les mois SANS mesure ne cassent pas la série : on compare des mesures.
    expect(
      firing([
        month('2026-05', { satisfaction: 80 }),
        month('2026-06', { satisfaction: null }),
        month('2026-07', { satisfaction: 55 }),
      ]),
    ).toContain('satisfaction_drop')
  })

  it('5 · contestation de jours — une seule suffit', () => {
    expect(firing([month('2026-05'), month('2026-06'), month('2026-07', { disputed: true })])).toContain(
      'disputed_days',
    )
    expect(firing(filler)).not.toContain('disputed_days')
  })

  it('couvre les CINQ signaux et pas un de plus', () => {
    expect(MISSION_DRIFT_SIGNAL_IDS).toEqual([
      'growing_day_gap',
      'late_timesheet',
      'slow_client_validation',
      'satisfaction_drop',
      'disputed_days',
    ])
  })
})

describe('detectMissionDrift — « non mesuré » n’est jamais « pas de dérive »', () => {
  it('NOMME les signaux qu’il n’a pas pu évaluer', () => {
    const blind = [
      month('2026-05', { declaredDays: null, satisfaction: null }),
      month('2026-06', { declaredDays: null, satisfaction: null }),
      month('2026-07', { declaredDays: null, satisfaction: null }),
    ]
    const verdict = detectMissionDrift(blind)
    expect(verdict.unmeasurable).toEqual(expect.arrayContaining(['growing_day_gap', 'satisfaction_drop']))
  })

  it('refuse de conclure quand il reste moins de signaux mesurables que le minimum', () => {
    // Quatre signaux aveugles : même si le cinquième criait, il ne pourrait
    // jamais atteindre les deux signaux exigés. Conclure « pas de dérive »
    // ferait passer une mission illisible pour une mission saine.
    const blind = [
      month('2026-05', { declaredDays: null, daysToSubmit: null, daysToClientValidation: null, satisfaction: null }),
      month('2026-06', { declaredDays: null, daysToSubmit: null, daysToClientValidation: null, satisfaction: null }),
      month('2026-07', { declaredDays: null, daysToSubmit: null, daysToClientValidation: null, satisfaction: null }),
    ]
    const verdict = detectMissionDrift(blind)
    expect(verdict.kind).toBe('unmeasurable')
    expect(verdict.unmeasurable).toHaveLength(4)
  })

  it('ne compte JAMAIS un mois sans relevé comme un mois à zéro jour déclaré', () => {
    // 0 jour déclaré serait l'écart le plus négatif possible : le détecteur
    // crierait à la dérive sur une mission dont le CRA n'est simplement pas
    // encore arrivé.
    const verdict = detectMissionDrift([
      month('2026-05', { declaredDays: null }),
      month('2026-06', { declaredDays: null }),
      month('2026-07', { declaredDays: null }),
    ])
    if (verdict.kind === 'drifting') expect(verdict.signals).not.toContain('growing_day_gap')
    expect(verdict.unmeasurable).toContain('growing_day_gap')
  })

  it('ne lit pas un mois sans jours PRÉVUS comme un écart', () => {
    const verdict = detectMissionDrift([
      month('2026-05', { expectedDays: null }),
      month('2026-06', { expectedDays: null }),
      month('2026-07', { expectedDays: null }),
    ])
    expect(verdict.unmeasurable).toContain('growing_day_gap')
  })
})

describe('MISSION_DRIFT_THRESHOLDS — un réglage vit à un seul endroit', () => {
  it('porte les sept seuils du §7.2, et chacun est lu par le détecteur', () => {
    expect(MISSION_DRIFT_THRESHOLDS).toEqual({
      negativeGapMonths: 3,
      submitDelayTrendMonths: 3,
      clientValidationTrendMonths: 3,
      satisfactionDropMeasures: 2,
      disputedPeriods: 1,
      minimumSignals: 2,
      minimumMonths: 3,
    })
  })

  it('range les mois par période, quel que soit l’ordre d’arrivée', () => {
    const shuffled = [
      month('2026-07', { declaredDays: 14 }),
      month('2026-05', { declaredDays: 18 }),
      month('2026-06', { declaredDays: 16 }),
    ]
    const verdict = detectMissionDrift(shuffled)
    expect(verdict.kind === 'drifting' ? verdict.signals : verdict.kind === 'steady' ? verdict.firing : []).toContain(
      'growing_day_gap',
    )
  })
})

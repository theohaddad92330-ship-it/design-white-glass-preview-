import { describe, expect, it } from 'vitest'
import { WEEKLY_SALES_TIME_BANDS } from './onboarding/answers-temps.js'
import {
  HOURS_PER_ACTIVE_DOSSIER_PER_WEEK,
  WEEKLY_SALES_TIME_BAND_LOWER_BOUND_HOURS_LABELS,
  pipelineCapacity,
  weeklySalesTimeBandLowerBoundHours,
  type PipelineCapacityInput,
} from './pipeline-capacity.js'

/**
 * #2325.27-.31 — LE VOLUME DE DOSSIERS ACTIFS RESPECTE-T-IL LA CAPACITÉ RÉELLE.
 *
 * Décision tranchée le 25/09/2026 (sans Louis, reco appliquée — voir le
 * docblock de `pipeline-capacity.ts`) : quatre signaux, chacun mesuré ou
 * explicitement non évaluable, jamais un zéro deviné, jamais une alerte sur
 * une entrée absente.
 */

const NONE: PipelineCapacityInput = {
  activeDossiersCount: 0,
  members: [],
  prioritySectors: [],
  activeDossierSectors: [],
  openNeedsCount: null,
  presentationDossiersCount: null,
  consultantsAvailableSoonCount: null,
}

describe('les libellés des bandes de temps commercial ne divergent jamais du questionnaire', () => {
  it('recopie WEEKLY_SALES_TIME_BANDS à l’octet près, dans le même ordre', () => {
    expect(WEEKLY_SALES_TIME_BAND_LOWER_BOUND_HOURS_LABELS).toEqual(WEEKLY_SALES_TIME_BANDS)
  })
})

describe('weeklySalesTimeBandLowerBoundHours', () => {
  it('rend la borne basse de chaque tranche connue', () => {
    expect(weeklySalesTimeBandLowerBoundHours('Aucune heure dans une semaine ordinaire')).toBe(0)
    expect(weeklySalesTimeBandLowerBoundHours('Moins de 2 heures par semaine')).toBe(0)
    expect(weeklySalesTimeBandLowerBoundHours('2 à 5 heures par semaine')).toBe(2)
    expect(weeklySalesTimeBandLowerBoundHours('5 à 10 heures par semaine')).toBe(5)
    expect(weeklySalesTimeBandLowerBoundHours('10 à 20 heures par semaine')).toBe(10)
    expect(weeklySalesTimeBandLowerBoundHours('Plus de 20 heures par semaine')).toBe(20)
  })

  it('« Je ne sais pas » et une bande absente ne sont jamais mesurables', () => {
    expect(weeklySalesTimeBandLowerBoundHours('Je ne sais pas')).toBeNull()
    expect(weeklySalesTimeBandLowerBoundHours(null)).toBeNull()
    expect(weeklySalesTimeBandLowerBoundHours(undefined)).toBeNull()
    expect(weeklySalesTimeBandLowerBoundHours('une bande inconnue')).toBeNull()
  })
})

describe('le signal capacité (#2325.27/.28)', () => {
  it('est non évaluable sans aucun membre mesurable', () => {
    expect(pipelineCapacity(NONE).capacity).toEqual({ measured: false })
    expect(
      pipelineCapacity({ ...NONE, members: [{ weeklySalesTimeResidualBand: 'Je ne sais pas' }] }).capacity,
    ).toEqual({ measured: false })
  })

  it('additionne les bornes basses des membres mesurables et divise par le réglage', () => {
    // Deux membres à « 5 à 10 h » (borne basse 5) : 10 h ÷ 1,5 = 6,67 dossiers.
    const signal = pipelineCapacity({
      ...NONE,
      activeDossiersCount: 5,
      members: [
        { weeklySalesTimeResidualBand: '5 à 10 heures par semaine' },
        { weeklySalesTimeResidualBand: '5 à 10 heures par semaine' },
      ],
    }).capacity
    expect(signal).toMatchObject({ measured: true, measuredMembers: 2, totalMembers: 2, alert: false })
    if (signal.measured) expect(signal.capacityDossiers).toBeCloseTo(10 / HOURS_PER_ACTIVE_DOSSIER_PER_WEEK)
  })

  it('alerte quand le volume actif dépasse la capacité, jamais en dessous', () => {
    const members = [{ weeklySalesTimeResidualBand: '2 à 5 heures par semaine' }] // 2h -> 1.33 dossier
    expect(pipelineCapacity({ ...NONE, activeDossiersCount: 2, members }).capacity).toMatchObject({ alert: true })
    expect(pipelineCapacity({ ...NONE, activeDossiersCount: 1, members }).capacity).toMatchObject({ alert: false })
  })

  it('un membre non mesurable n’entre pas dans la somme, mais ne bloque pas les autres', () => {
    const signal = pipelineCapacity({
      ...NONE,
      activeDossiersCount: 1,
      members: [
        { weeklySalesTimeResidualBand: 'Je ne sais pas' },
        { weeklySalesTimeResidualBand: '10 à 20 heures par semaine' },
      ],
    }).capacity
    expect(signal).toMatchObject({ measured: true, measuredMembers: 1, totalMembers: 2 })
  })
})

describe('le signal secteurs (#2325.29)', () => {
  it('est non évaluable sans secteurs prioritaires déclarés', () => {
    expect(pipelineCapacity({ ...NONE, prioritySectors: [], activeDossierSectors: ['banque'] }).sectorFit).toEqual({
      measured: false,
    })
  })

  it('est non évaluable quand aucun dossier actif n’a de secteur connu', () => {
    expect(
      pipelineCapacity({ ...NONE, prioritySectors: ['banque'], activeDossierSectors: [null, null] }).sectorFit,
    ).toEqual({ measured: false })
  })

  it('un secteur inconnu par dossier sort du dénominateur, jamais compté « hors »', () => {
    const signal = pipelineCapacity({
      ...NONE,
      prioritySectors: ['banque'],
      activeDossierSectors: ['banque', null, null],
    }).sectorFit
    expect(signal).toMatchObject({ measured: true, knownSectorCount: 1, outsidePriorityCount: 0, alert: false })
  })

  it('alerte au-delà de la moitié des dossiers à secteur connu hors priorités', () => {
    const majoriteHorsPriorite = pipelineCapacity({
      ...NONE,
      prioritySectors: ['banque'],
      activeDossierSectors: ['banque', 'retail', 'retail'],
    }).sectorFit
    expect(majoriteHorsPriorite).toMatchObject({ alert: true, outsidePriorityCount: 2, knownSectorCount: 3 })

    const moitiePile = pipelineCapacity({
      ...NONE,
      prioritySectors: ['banque'],
      activeDossierSectors: ['banque', 'retail'],
    }).sectorFit
    expect(moitiePile).toMatchObject({ alert: false })
  })
})

describe('le signal couverture des besoins (#2325.30)', () => {
  it('est non évaluable si l’une des deux entrées manque', () => {
    expect(pipelineCapacity({ ...NONE, openNeedsCount: 4 }).needsCoverage).toEqual({ measured: false })
    expect(pipelineCapacity({ ...NONE, presentationDossiersCount: 2 }).needsCoverage).toEqual({ measured: false })
  })

  it('alerte quand les besoins ouverts dépassent le double des dossiers de présentation', () => {
    expect(pipelineCapacity({ ...NONE, openNeedsCount: 5, presentationDossiersCount: 2 }).needsCoverage).toMatchObject({
      alert: true,
    })
    expect(pipelineCapacity({ ...NONE, openNeedsCount: 4, presentationDossiersCount: 2 }).needsCoverage).toMatchObject({
      alert: false,
    })
  })
})

describe('le signal disponibilité de staffing (#2325.31)', () => {
  it('est non évaluable si l’une des deux entrées manque', () => {
    expect(pipelineCapacity({ ...NONE, openNeedsCount: 3 }).staffingAvailability).toEqual({ measured: false })
    expect(pipelineCapacity({ ...NONE, consultantsAvailableSoonCount: 1 }).staffingAvailability).toEqual({
      measured: false,
    })
  })

  it('alerte quand les besoins ouverts dépassent les consultants bientôt disponibles', () => {
    expect(
      pipelineCapacity({ ...NONE, openNeedsCount: 3, consultantsAvailableSoonCount: 2 }).staffingAvailability,
    ).toMatchObject({ alert: true })
    expect(
      pipelineCapacity({ ...NONE, openNeedsCount: 2, consultantsAvailableSoonCount: 2 }).staffingAvailability,
    ).toMatchObject({ alert: false })
  })
})

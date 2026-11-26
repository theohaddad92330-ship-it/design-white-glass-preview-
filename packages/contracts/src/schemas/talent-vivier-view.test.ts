import { describe, expect, it } from 'vitest'
import {
  talentScore,
  vivierAvailability,
  type VivierAvailabilityInput,
  type TalentScoreInput,
} from './talent-vivier-view.js'

const NOW = new Date('2026-10-22T09:00:00.000Z')

function scoreRow(overrides: Partial<TalentScoreInput> = {}): TalentScoreInput {
  return {
    fullName: 'Inès Kaczmarek',
    skillCount: 4,
    provenSkillCount: 3,
    tjm: 700,
    hasCv: true,
    reviewStatus: 'qualified',
    staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    availabilityCheckedAt: '2026-10-16T08:00:00.000Z',
    ...overrides,
  }
}

describe('talentScore — le score consultant /100, jamais nu (Théo C talents-vivier.R3)', () => {
  it('moyenne les seuls axes ÉVALUABLES et nomme les 4 axes', () => {
    const score = talentScore(scoreRow(), NOW)
    expect(score.axes.map(axis => axis.key)).toEqual(['file', 'skills', 'availability', 'feedback'])
    // fiche 100 (5/5), compétences prouvées 75 (3/4), dispo confirmée 100, retours non évaluables.
    expect(score.axes.map(axis => axis.score)).toEqual([100, 75, 100, null])
    expect(score.value).toBe(92)
    expect(score.evaluable).toBe(3)
  })

  it('un axe non évaluable sort du calcul : il n’est jamais compté comme zéro', () => {
    const withFeedbackMissing = talentScore(scoreRow(), NOW)
    const withoutProven = talentScore(scoreRow({ skillCount: 0, provenSkillCount: 0 }), NOW)
    expect(withoutProven.axes[1]?.score).toBeNull()
    expect(withoutProven.value).toBeGreaterThan(withFeedbackMissing.value! - 20)
    expect(withoutProven.evaluable).toBe(2)
  })

  it('#4500 — sous DEUX axes évaluables, pas de score (doctrine du 13/10) : l’axe connu reste lisible', () => {
    const score = talentScore(scoreRow({ skillCount: 0, provenSkillCount: 0, availabilityCheckedAt: null }), NOW)
    expect(score.evaluable).toBe(1)
    expect(score.value).toBeNull()
    expect(score.axes[0]?.score).toBe(80)
  })

  it('une fiche à relire (CV pas encore lu) n’est PAS notée : « non évaluable », pas 0', () => {
    const score = talentScore(
      scoreRow({
        reviewStatus: 'needs_review',
        skillCount: 0,
        provenSkillCount: 0,
        availabilityCheckedAt: null,
        hasCv: false,
        tjm: null,
        fullName: 'Thomas Lefèvre',
      }),
      NOW,
    )
    expect(score.value).toBeNull()
    expect(score.evaluable).toBe(0)
    expect(score.axes.every(axis => axis.score === null)).toBe(true)
  })

  it('une confirmation de disponibilité périmée vaut moins qu’une récente, sans tomber à zéro', () => {
    const fresh = talentScore(scoreRow({ availabilityCheckedAt: '2026-10-16T08:00:00.000Z' }), NOW)
    const stale = talentScore(scoreRow({ availabilityCheckedAt: '2026-07-10T08:00:00.000Z' }), NOW)
    expect(fresh.axes[2]?.score).toBe(100)
    expect(stale.axes[2]?.score).toBe(50)
  })

  it('sans nombre de compétences prouvées (ligne d’un ancien serveur), l’axe est non évaluable', () => {
    const score = talentScore(scoreRow({ provenSkillCount: undefined }), NOW)
    expect(score.axes[1]?.score).toBeNull()
  })
})

function availabilityRow(overrides: Partial<VivierAvailabilityInput> = {}): VivierAvailabilityInput {
  return {
    declaredAvailability: 'inconnu',
    declaredAvailableFrom: null,
    availabilityCheckedAt: null,
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    lastMission: null,
    ...overrides,
  }
}

describe('vivierAvailability — déclaration datée contre planning (Théo C talents-vivier.R4/N1/N2)', () => {
  it('la déclaration GAGNE sur le planning quand elle existe, et le planning descend en ligne secondaire', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'immediate',
        declaredAvailableFrom: '2026-11-03',
        availabilityCheckedAt: '2026-10-16T08:00:00.000Z',
        staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-10-31', assignments: 1 },
        lastMission: { label: null, accountName: 'Thales', endsOn: '2026-10-30', startsOn: '2026-01-05' },
      }),
      NOW,
    )
    expect(view.status).toBe('declared')
    expect(view.date).toBe('2026-11-03')
    expect(view.declaredOn).toBe('2026-10-16')
    expect(view.planning).toEqual({ endsOn: '2026-10-30', client: 'Thales' })
  })

  it('en mission : fin prévue + client, sans date déclarée', () => {
    const view = vivierAvailability(
      availabilityRow({
        staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-12-19', assignments: 1 },
        lastMission: { label: null, accountName: 'Airbus', endsOn: '2026-12-18', startsOn: '2026-03-01' },
      }),
      NOW,
    )
    expect(view.status).toBe('in_mission')
    expect(view.planning).toEqual({ endsOn: '2026-12-18', client: 'Airbus' })
    expect(view.date).toBeNull()
  })

  it('mission sans date de fin : « en mission » sans fin prévue, jamais une date inventée', () => {
    const view = vivierAvailability(
      availabilityRow({
        staffing: { availability: 'busy_open_ended', loadPercent: 100, freeFrom: null, assignments: 1 },
        lastMission: { label: null, accountName: 'EDF', endsOn: null, startsOn: '2026-03-01' },
      }),
      NOW,
    )
    expect(view.status).toBe('in_mission')
    expect(view.planning).toEqual({ endsOn: null, client: 'EDF' })
  })

  it('démarrage prévu : une affectation qui commence après aujourd’hui', () => {
    const view = vivierAvailability(
      availabilityRow({
        staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 1 },
        lastMission: { label: null, accountName: 'SNCF', endsOn: null, startsOn: '2026-11-03' },
      }),
      NOW,
    )
    expect(view.status).toBe('upcoming')
    expect(view.date).toBe('2026-11-03')
    expect(view.planning?.client).toBe('SNCF')
  })

  it('disponible, confirmée à une date : « Confirmée le … »', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'immediate',
        availabilityCheckedAt: '2026-10-20T08:00:00.000Z',
        staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
      }),
      NOW,
    )
    expect(view.status).toBe('available')
    expect(view.confirmedOn).toBe('2026-10-20')
  })

  it('À reconfirmer : la date annoncée ET l’âge de la confirmation (ou son absence)', () => {
    const withAge = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'a_confirmer',
        declaredAvailableFrom: '2026-11-02',
        availabilityCheckedAt: '2026-07-10T08:00:00.000Z',
      }),
      NOW,
    )
    expect(withAge).toMatchObject({ status: 'to_reconfirm', date: '2026-11-02', confirmedOn: '2026-07-10' })
    const without = vivierAvailability(
      availabilityRow({ declaredAvailability: 'a_confirmer', declaredAvailableFrom: '2026-11-09' }),
      NOW,
    )
    expect(without).toMatchObject({ status: 'to_reconfirm', date: '2026-11-09', confirmedOn: null })
  })

  it('une date annoncée déjà échue (aujourd’hui) n’est pas une date à venir : disponible, confirmée à sa date', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'immediate',
        declaredAvailableFrom: '2026-10-22',
        availabilityCheckedAt: '2026-10-20T08:00:00.000Z',
        staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
      }),
      NOW,
    )
    expect(view).toMatchObject({ status: 'available', date: null, confirmedOn: '2026-10-20' })
  })

  it('#4500 — une déclaration NON DATÉE gagne aussi sur le planning : « Disponible » déclaré, en mission au planning', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'immediate',
        availabilityCheckedAt: '2026-10-16T08:00:00.000Z',
        staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-10-31', assignments: 1 },
        lastMission: { label: null, accountName: 'Thales', endsOn: '2026-10-30', startsOn: '2026-01-05' },
      }),
      NOW,
    )
    expect(view).toMatchObject({ status: 'declared', date: null, declaredOn: '2026-10-16' })
    expect(view.planning).toEqual({ endsOn: '2026-10-30', client: 'Thales' })
  })

  it('#4500 — « Indisponible » déclaré n’est jamais relu « Disponible » parce que le planning est vide', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'indisponible',
        staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
      }),
      NOW,
    )
    expect(view).toMatchObject({ status: 'declared', date: null, planning: null })
  })

  it('#4500 — « Sous 1 mois » déclaré se lit tel quel, pas « Disponible »', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'sous_1_mois',
        staffing: { availability: 'partial', loadPercent: 50, freeFrom: null, assignments: 1 },
      }),
      NOW,
    )
    expect(view.status).toBe('declared')
  })

  it('#4500 — une déclaration qui DIT la mission ne la répète pas : le planning parle (fin prévue, client)', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'en_mission',
        staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-12-19', assignments: 1 },
        lastMission: { label: null, accountName: 'Airbus', endsOn: '2026-12-18', startsOn: '2026-03-01' },
      }),
      NOW,
    )
    expect(view.status).toBe('in_mission')
  })

  it('#4500 — en mission sans mission lisible sur la ligne : le planning reste NOMMÉ (sans fin prévue), jamais tu', () => {
    const view = vivierAvailability(
      availabilityRow({
        declaredAvailability: 'immediate',
        staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 },
      }),
      NOW,
    )
    expect(view).toMatchObject({ status: 'declared', planning: { endsOn: null, client: null } })
  })

  it('#4500 — une valeur hors domaine n’est pas une déclaration : « Non renseignée », jamais un badge vide', () => {
    expect(vivierAvailability(availabilityRow({ declaredAvailability: 'unknown' }), NOW).status).toBe('unknown')
  })

  it('rien de déclaré, rien de supposé : non renseignée', () => {
    expect(vivierAvailability(availabilityRow(), NOW).status).toBe('unknown')
  })
})

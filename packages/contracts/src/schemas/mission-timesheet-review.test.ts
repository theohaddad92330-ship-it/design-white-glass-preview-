import { describe, expect, it } from 'vitest'
import {
  TIMESHEET_CHECK_IDS,
  TIMESHEET_RECOMMENDATIONS,
  TIMESHEET_UNVERIFIED_REASONS,
  recommendTimesheetAction,
  runTimesheetChecks,
  timesheetDecisionLock,
  type TimesheetCheck,
  type TimesheetCheckInput,
} from './mission-timesheet-review.js'

/**
 * Les tests portent sur des INVARIANTS, jamais sur une ligne d'implémentation :
 * « aucun contrôle ne conclut sans avoir lu ses entrées », « une recommandation
 * ne naît pas d'un silence ». Un test qui épinglerait l'ordre des contrôles ou
 * le libellé d'un motif se casserait à la première refonte sans qu'aucune règle
 * n'ait bougé.
 */

const DECLARED: TimesheetCheckInput = {
  hasDeclaration: true,
  days: 20,
  expectedDays: 20,
  consultantId: 'c1',
  overlappingMission: { status: 'none' },
  duplicateValidated: { status: 'none' },
}

function byId(checks: readonly TimesheetCheck[], id: (typeof TIMESHEET_CHECK_IDS)[number]): TimesheetCheck {
  const found = checks.find(check => check.id === id)
  if (!found) throw new Error(`contrôle absent : ${id}`)
  return found
}

describe('runTimesheetChecks — ce qui n’a pas pu être vérifié est NOMMÉ', () => {
  it('rend un verdict pour CHAQUE contrôle de la liste, sans trou ni doublon', () => {
    const checks = runTimesheetChecks(DECLARED)
    expect(checks.map(check => check.id).sort()).toEqual([...TIMESHEET_CHECK_IDS].sort())
    expect(new Set(checks.map(check => check.id)).size).toBe(TIMESHEET_CHECK_IDS.length)
  })

  it('« non vérifié » porte TOUJOURS un motif, et lui seul', () => {
    // L'invariant qui empêche « non vérifié » de devenir un silence de plus.
    const inputs: TimesheetCheckInput[] = [
      DECLARED,
      { ...DECLARED, hasDeclaration: false, days: null, expectedDays: null },
      { ...DECLARED, expectedDays: null },
      { ...DECLARED, consultantId: null },
      { ...DECLARED, days: 7.25 },
      { ...DECLARED, overlappingMission: { status: 'unreadable' } },
    ]
    for (const input of inputs) {
      for (const check of runTimesheetChecks(input)) {
        if (check.outcome === 'not_verified') {
          expect(check.reason).not.toBeNull()
          expect(TIMESHEET_UNVERIFIED_REASONS).toContain(check.reason)
        } else {
          expect(check.reason).toBeNull()
        }
      }
    }
  })

  it('sans relevé déposé, AUCUN contrôle ne conclut — jamais « rien à signaler »', () => {
    // Le défaut que ce module existe pour fermer : un mois sans relevé
    // s'affichait « aucune anomalie », c'est-à-dire une bonne nouvelle tirée
    // d'un silence.
    const checks = runTimesheetChecks({
      hasDeclaration: false,
      days: null,
      expectedDays: 21,
      consultantId: 'c1',
      overlappingMission: { status: 'none' },
      duplicateValidated: { status: 'none' },
    })
    expect(checks.every(check => check.outcome === 'not_verified')).toBe(true)
    expect(checks.every(check => check.reason === 'no_declaration')).toBe(true)
  })

  it('les jours fériés ne sont JAMAIS vérifiés — aucun calendrier n’existe dans le produit', () => {
    // D576 : `expectedWorkingDaysInWindow` accepte une liste de jours fériés, et
    // rien ne la remplit. Un calendrier français codé en dur serait une donnée
    // fictive pour toute mission hors de France. Le contrôle le DIT plutôt que
    // de disparaître — un contrôle absent se lit comme un contrôle passé.
    expect(byId(runTimesheetChecks(DECLARED), 'public_holidays')).toMatchObject({
      outcome: 'not_verified',
      reason: 'no_holiday_calendar',
    })
  })

  it('sans charge attendue, l’écart aux jours ouvrés n’est pas « conforme » mais non vérifié', () => {
    expect(byId(runTimesheetChecks({ ...DECLARED, expectedDays: null }), 'working_days')).toMatchObject({
      outcome: 'not_verified',
      reason: 'no_expected_days',
    })
  })

  it('sans consultant, le chevauchement n’est pas « aucun » mais non vérifié', () => {
    // La requête ne part pas : on ne sait pas QUI vérifier. Conclure « aucun
    // chevauchement » serait une garantie qu’aucune lecture n’a produite.
    expect(byId(runTimesheetChecks({ ...DECLARED, consultantId: null }), 'overlapping_mission')).toMatchObject({
      outcome: 'not_verified',
      reason: 'no_consultant',
    })
  })

  it('une lecture croisée EN ÉCHEC ne se rend pas comme « rien trouvé »', () => {
    // « Cassé » et « non mesurable » se ressemblent trop pour qu’on les
    // confonde : c’est un défaut déjà payé dans ce dépôt.
    const checks = runTimesheetChecks({
      ...DECLARED,
      overlappingMission: { status: 'unreadable' },
      duplicateValidated: { status: 'unreadable' },
    })
    expect(byId(checks, 'overlapping_mission')).toMatchObject({ outcome: 'not_verified', reason: 'read_failed' })
    expect(byId(checks, 'duplicate_validated')).toMatchObject({ outcome: 'not_verified', reason: 'read_failed' })
  })

  it('un écart aux jours ouvrés se SIGNALE avec son nombre, dans les deux sens', () => {
    expect(byId(runTimesheetChecks({ ...DECLARED, days: 12 }), 'working_days')).toMatchObject({
      outcome: 'flagged',
      gapDays: -8,
    })
    expect(byId(runTimesheetChecks({ ...DECLARED, days: 23 }), 'working_days')).toMatchObject({
      outcome: 'flagged',
      gapDays: 3,
    })
    expect(byId(runTimesheetChecks(DECLARED), 'working_days')).toMatchObject({ outcome: 'passed', gapDays: 0 })
  })

  it('zéro jour DÉCLARÉ est un constat, pas une absence de relevé', () => {
    // Le relevé existe et porte 0 : c’est une mesure vraie, et elle se signale.
    expect(byId(runTimesheetChecks({ ...DECLARED, days: 0, expectedDays: 21 }), 'zero_days')).toMatchObject({
      outcome: 'flagged',
    })
  })

  it('une fraction de journée inhabituelle se signale, une demi-journée non', () => {
    expect(byId(runTimesheetChecks({ ...DECLARED, days: 7.25 }), 'day_fraction').outcome).toBe('flagged')
    expect(byId(runTimesheetChecks({ ...DECLARED, days: 7.5, expectedDays: 7.5 }), 'day_fraction').outcome).toBe(
      'passed',
    )
  })

  it('le chevauchement et le doublon NOMMENT ce qu’ils ont croisé', () => {
    const checks = runTimesheetChecks({
      ...DECLARED,
      overlappingMission: { status: 'found', subject: 'Refonte SI' },
      duplicateValidated: { status: 'found', subject: 'Sarah Lemoine' },
    })
    expect(byId(checks, 'overlapping_mission')).toMatchObject({ outcome: 'flagged', subject: 'Refonte SI' })
    expect(byId(checks, 'duplicate_validated')).toMatchObject({ outcome: 'flagged', subject: 'Sarah Lemoine' })
  })
})

describe('recommendTimesheetAction — elle se DÉRIVE des constats, ou elle n’existe pas', () => {
  const conclusive = (outcome: 'passed' | 'flagged'): TimesheetCheck[] => [
    { id: 'working_days', outcome, reason: null, gapDays: outcome === 'flagged' ? -3 : 0, subject: null },
    { id: 'public_holidays', outcome: 'not_verified', reason: 'no_holiday_calendar', gapDays: null, subject: null },
  ]

  it('n’invente RIEN quand aucun contrôle n’a abouti', () => {
    // « Si aucune anomalie n’est lisible, il n’y a pas de recommandation — pas
    // une phrase vague. »
    const blind: TimesheetCheck[] = TIMESHEET_CHECK_IDS.map(id => ({
      id,
      outcome: 'not_verified' as const,
      reason: 'no_declaration' as const,
      gapDays: null,
      subject: null,
    }))
    expect(recommendTimesheetAction({ status: 'submitted', validatedByClientAt: null, checks: blind })).toBe(
      'not_measurable',
    )
  })

  it('propose de faire corriger dès qu’un constat est relevé', () => {
    expect(
      recommendTimesheetAction({ status: 'submitted', validatedByClientAt: null, checks: conclusive('flagged') }),
    ).toBe('fix')
  })

  it('propose de valider quand tout ce qui a pu être vérifié est passé', () => {
    expect(
      recommendTimesheetAction({ status: 'submitted', validatedByClientAt: null, checks: conclusive('passed') }),
    ).toBe('validate')
  })

  it('un relevé DÉJÀ DÉCIDÉ ne se re-décide pas', () => {
    expect(
      recommendTimesheetAction({ status: 'rejected', validatedByClientAt: null, checks: conclusive('flagged') }),
    ).toBe('decided')
    expect(
      recommendTimesheetAction({
        status: 'submitted',
        validatedByClientAt: '2026-08-10T00:00:00.000Z',
        checks: conclusive('flagged'),
      }),
    ).toBe('decided')
  })

  it('un mois attendu ou manquant appelle le DÉPÔT, pas une décision', () => {
    for (const status of ['expected', 'missing'] as const) {
      expect(recommendTimesheetAction({ status, validatedByClientAt: null, checks: conclusive('passed') })).toBe(
        'await_declaration',
      )
    }
  })

  it('un contrat sans relevé n’appelle aucune décision', () => {
    expect(recommendTimesheetAction({ status: 'not_required', validatedByClientAt: null, checks: [] })).toBe(
      'not_required',
    )
  })

  it('ne rend jamais autre chose que la liste fermée', () => {
    const all = TIMESHEET_CHECK_IDS.map(id => ({
      id,
      outcome: 'passed' as const,
      reason: null,
      gapDays: null,
      subject: null,
    }))
    for (const status of [
      'expected',
      'missing',
      'draft',
      'submitted',
      'validated',
      'disputed',
      'rejected',
      'not_required',
    ] as const) {
      expect(TIMESHEET_RECOMMENDATIONS).toContain(
        recommendTimesheetAction({ status, validatedByClientAt: null, checks: all }),
      )
    }
  })
})

describe('timesheetDecisionLock — la même frontière que le serveur, à un seul endroit', () => {
  it('sans relevé déposé, ni valider ni rejeter', () => {
    expect(timesheetDecisionLock({ timesheetId: null, status: 'missing', validatedByClientAt: null })).toEqual({
      canValidate: false,
      canReject: false,
      canReviewInternally: false,
    })
  })

  it('un relevé validé par le CLIENT ne se rejette plus — le litige est le chemin', () => {
    expect(
      timesheetDecisionLock({ timesheetId: 't1', status: 'validated', validatedByClientAt: '2026-08-10T00:00:00.000Z' })
        .canReject,
    ).toBe(false)
  })

  it('seul un relevé DÉPOSÉ s’enregistre comme validé par le client', () => {
    expect(
      timesheetDecisionLock({ timesheetId: 't1', status: 'submitted', validatedByClientAt: null }).canValidate,
    ).toBe(true)
    for (const status of ['draft', 'validated', 'disputed', 'rejected', 'expected', 'missing'] as const) {
      expect(timesheetDecisionLock({ timesheetId: 't1', status, validatedByClientAt: null }).canValidate).toBe(false)
    }
  })

  it('un relevé rejeté ou en litige ne se rejette pas deux fois', () => {
    expect(timesheetDecisionLock({ timesheetId: 't1', status: 'rejected', validatedByClientAt: null }).canReject).toBe(
      false,
    )
    expect(timesheetDecisionLock({ timesheetId: 't1', status: 'disputed', validatedByClientAt: null }).canReject).toBe(
      false,
    )
  })

  // #2415.6 — la revue INTERNE est un geste séparé de la validation client :
  // « relu en interne » et « transmis au client » ne sont plus le même clic.
  it('#2415.6 — un relevé DÉPOSÉ, pas encore revu en interne, se marque vérifié interne', () => {
    expect(
      timesheetDecisionLock({
        timesheetId: 't1',
        status: 'submitted',
        validatedByClientAt: null,
        internalReviewedAt: null,
      }).canReviewInternally,
    ).toBe(true)
  })

  it('#2415.6 — sans relevé déposé, la revue interne ne se propose pas', () => {
    expect(
      timesheetDecisionLock({
        timesheetId: null,
        status: 'missing',
        validatedByClientAt: null,
        internalReviewedAt: null,
      }).canReviewInternally,
    ).toBe(false)
  })

  it('#2415.6 — déjà revu en interne, le geste ne se repropose pas', () => {
    expect(
      timesheetDecisionLock({
        timesheetId: 't1',
        status: 'submitted',
        validatedByClientAt: null,
        internalReviewedAt: '2026-09-24T08:00:00.000Z',
      }).canReviewInternally,
    ).toBe(false)
  })

  it('#2415.6 — un statut hors fenêtre (draft, validé, rejeté, litige, attendu, manquant) ne propose pas la revue interne', () => {
    for (const status of ['draft', 'validated', 'disputed', 'rejected', 'expected', 'missing'] as const) {
      expect(
        timesheetDecisionLock({ timesheetId: 't1', status, validatedByClientAt: null, internalReviewedAt: null })
          .canReviewInternally,
      ).toBe(false)
    }
  })
})

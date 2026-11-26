import { describe, expect, it } from 'vitest'
import {
  cancelFocusPlanBlockRequestSchema,
  confirmFocusPlanBlockRequestSchema,
  focusPlanSchema,
  focusWeekPlanSchema,
  setFocusPlanBlockOutcomeRequestSchema,
} from './focus-plan.js'

// #2770.49/.50/.51 — la porte d'écriture d'UN bloc de plan de journée.
describe('confirmFocusPlanBlockRequestSchema', () => {
  const valid = {
    type: 'call_session' as const,
    title: 'Session d’appels — comptes prioritaires',
    start_iso: '2026-09-29T09:00:00+02:00',
    end_iso: '2026-09-29T09:30:00+02:00',
  }

  it('accepts a real placed block', () => {
    expect(confirmFocusPlanBlockRequestSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects end_iso not after start_iso', () => {
    const result = confirmFocusPlanBlockRequestSchema.safeParse({ ...valid, end_iso: valid.start_iso })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown block type', () => {
    const result = confirmFocusPlanBlockRequestSchema.safeParse({ ...valid, type: 'not_a_real_type' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty title', () => {
    const result = confirmFocusPlanBlockRequestSchema.safeParse({ ...valid, title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown extra field', () => {
    const result = confirmFocusPlanBlockRequestSchema.safeParse({ ...valid, accountId: 'acc-1' })
    expect(result.success).toBe(false)
  })
})

// #2770.52 — l'annulation d'un bloc réellement créé, sur son seul identifiant.
describe('cancelFocusPlanBlockRequestSchema', () => {
  it('accepts a real event id', () => {
    expect(cancelFocusPlanBlockRequestSchema.safeParse({ event_id: 'evt-1' }).success).toBe(true)
  })

  it('rejects an empty event id', () => {
    expect(cancelFocusPlanBlockRequestSchema.safeParse({ event_id: '' }).success).toBe(false)
  })

  it('rejects an unknown extra field — never the title/horaires again, they no longer apply once created', () => {
    const result = cancelFocusPlanBlockRequestSchema.safeParse({ event_id: 'evt-1', title: 'Session' })
    expect(result.success).toBe(false)
  })
})

// #2770.63/.64/.65 — la mesure post-bloc, trois états déclarés.
describe('setFocusPlanBlockOutcomeRequestSchema', () => {
  it.each(['realized', 'interrupted', 'postponed'] as const)('accepts the declared outcome %s', outcome => {
    expect(setFocusPlanBlockOutcomeRequestSchema.safeParse({ event_id: 'evt-1', outcome }).success).toBe(true)
  })

  it('rejects an outcome outside the three declared states — never a deduced fourth', () => {
    const result = setFocusPlanBlockOutcomeRequestSchema.safeParse({ event_id: 'evt-1', outcome: 'done' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty event id', () => {
    const result = setFocusPlanBlockOutcomeRequestSchema.safeParse({ event_id: '', outcome: 'realized' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown extra field', () => {
    const result = setFocusPlanBlockOutcomeRequestSchema.safeParse({
      event_id: 'evt-1',
      outcome: 'realized',
      title: 'Session',
    })
    expect(result.success).toBe(false)
  })
})

// #2770.66/.67 (#2391.54/.55) — le résultat en texte libre et la durée réelle,
// l'un et l'autre DÉCLARÉS par la personne, jamais mesurés (#2391.56).
describe('setFocusPlanBlockOutcomeRequestSchema — résultat libre et durée déclarée', () => {
  const base = { event_id: 'evt-1', outcome: 'realized' as const }

  it('reste valide sans note ni durée (les deux sont facultatives)', () => {
    expect(setFocusPlanBlockOutcomeRequestSchema.safeParse(base).success).toBe(true)
  })

  it('accepte une note et une durée en minutes entières', () => {
    const parsed = setFocusPlanBlockOutcomeRequestSchema.safeParse({
      ...base,
      note: '  Deux rendez-vous obtenus  ',
      actual_minutes: 25,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.note).toBe('Deux rendez-vous obtenus')
  })

  it.each([0, -5, 1.5, 1441])('refuse une durée hors 1–1440 minutes entières (%s)', actual_minutes => {
    expect(setFocusPlanBlockOutcomeRequestSchema.safeParse({ ...base, actual_minutes }).success).toBe(false)
  })

  it('refuse une note vide après rognage ou de plus de 500 caractères — jamais une note fantôme', () => {
    expect(setFocusPlanBlockOutcomeRequestSchema.safeParse({ ...base, note: '   ' }).success).toBe(false)
    expect(setFocusPlanBlockOutcomeRequestSchema.safeParse({ ...base, note: 'x'.repeat(501) }).success).toBe(false)
  })
})

// #2770.55-.62 — le plan hebdomadaire se COMPOSE de plans de journée.
describe('focusWeekPlanSchema — la semaine est une suite de jours', () => {
  const day = {
    date: '2026-10-05',
    time_zone: 'Europe/Paris',
    energy: null,
    blocks: [
      {
        type: 'call_session' as const,
        title: 'Appels prospection',
        duration_minutes: 60,
        start_iso: '2026-10-05T09:00:00+02:00',
        end_iso: '2026-10-05T10:00:00+02:00',
        priority_reason: 'Trois comptes chauds',
        priority: 'high' as const,
        deadline: null,
        context: null,
        collision: null,
      },
    ],
    deferred_blocks: [],
    margin_minutes: 90,
  }
  const week = {
    week_start: '2026-10-05',
    time_zone: 'Europe/Paris',
    energy: null,
    days: [day],
    deferred_blocks: [{ type: 'pipeline_review' as const, title: 'Revue pipe', reason: 'capacite_atteinte' as const }],
    margin_minutes: 300,
  }

  it('accepte une semaine de jours planifiés et ses reports', () => {
    expect(focusWeekPlanSchema.safeParse(week).success).toBe(true)
  })

  it('accepte une semaine sans jour (tout reporté) mais jamais plus de sept jours', () => {
    expect(focusWeekPlanSchema.safeParse({ ...week, days: [] }).success).toBe(true)
    expect(focusWeekPlanSchema.safeParse({ ...week, days: Array(8).fill(day) }).success).toBe(false)
  })

  it('refuse une marge négative et un champ en plus (strict)', () => {
    expect(focusWeekPlanSchema.safeParse({ ...week, margin_minutes: -1 }).success).toBe(false)
    expect(focusWeekPlanSchema.safeParse({ ...week, probability: 0.8 }).success).toBe(false)
  })
})

// #2770.35/.36/.37 — ce que le plan n'a PAS pu lire se nomme, jamais tu.
describe('unread_sources — outils, rôle, politique d’équipe', () => {
  const day = {
    date: '2026-10-05',
    time_zone: null,
    energy: null,
    blocks: [],
    deferred_blocks: [],
    margin_minutes: 60,
  }

  it('accepte les trois sources nommées, sur le jour comme sur la semaine', () => {
    const unread_sources = ['tools', 'role', 'team_policy']
    expect(focusPlanSchema.safeParse({ ...day, unread_sources }).success).toBe(true)
    expect(
      focusWeekPlanSchema.safeParse({
        week_start: '2026-10-05',
        time_zone: null,
        energy: null,
        days: [],
        deferred_blocks: [],
        margin_minutes: 0,
        unread_sources,
      }).success,
    ).toBe(true)
  })

  it('reste facultatif : un plan d’avant ce champ se lit toujours', () => {
    expect(focusPlanSchema.safeParse(day).success).toBe(true)
  })

  it('refuse une source inconnue — jamais un libellé libre', () => {
    expect(focusPlanSchema.safeParse({ ...day, unread_sources: ['crm'] }).success).toBe(false)
  })
})

// #2770.35/.37 (décision Louis 11/10) — ce que le plan a LU : outils branchés, politique d'équipe.
describe('connected_tools / team_policy / meetings_count', () => {
  const day = {
    date: '2026-10-05',
    time_zone: null,
    energy: null,
    blocks: [],
    deferred_blocks: [],
    margin_minutes: 60,
    unread_sources: ['role'],
  }
  const policy = {
    prospecting_windows: [{ start_minute: 540, end_minute: 660 }],
    forbidden_windows: [],
    max_meetings_per_day: 4,
    daily_call_target: null,
  }

  it('accepte les outils lus, la politique appliquée et les réunions comptées', () => {
    const plan = { ...day, connected_tools: ['calendar', 'email'], team_policy: policy, meetings_count: 3 }
    expect(focusPlanSchema.safeParse(plan).success).toBe(true)
  })

  it('`team_policy: null` = lue, rien saisi — distinct d’une politique absente (non lue)', () => {
    expect(focusPlanSchema.safeParse({ ...day, team_policy: null }).success).toBe(true)
  })

  it('refuse une famille d’outil hors liste — jamais un nom d’éditeur', () => {
    expect(focusPlanSchema.safeParse({ ...day, connected_tools: ['gmail'] }).success).toBe(false)
  })

  it('un bloc reporté faute d’outil branché porte sa raison', () => {
    const deferred_blocks = [{ type: 'data_correction', title: 'Nettoyer le CRM', reason: 'outil_non_branche' }]
    expect(focusPlanSchema.safeParse({ ...day, deferred_blocks }).success).toBe(true)
  })

  it('la semaine porte la même lecture, une fois', () => {
    const week = {
      week_start: '2026-10-05',
      time_zone: null,
      energy: null,
      days: [],
      deferred_blocks: [],
      margin_minutes: 0,
      connected_tools: ['calendar'],
      team_policy: policy,
    }
    expect(focusWeekPlanSchema.safeParse(week).success).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { DEALS_SHOWN, PROFILES_SHOWN, dealsToAdvance, followedProfiles, pipeTile } from './day-portfolio'

// Louis 23/10 — portés depuis `view/day/day-model.test.ts` (PR11) : la tuile « Affaires en cours », « Les affaires
// à faire avancer » et « Les profils suivis » reviennent dans l'écran Théo de « Ta journée ».

describe('Théo A today-jour.N2 — la tuile « Affaires en cours »', () => {
  const summary = (over: Record<string, number>) =>
    ({ total_count: 4, total_amount_cents: 23_100_000, total_without_amount: 0, ...over }) as never

  it('somme non pondérée des montants saisis', () => {
    expect(pipeTile(summary({}))).toEqual({ kind: 'measured', cents: 23_100_000, count: 4, withoutAmount: 0 })
  })

  it('les affaires sans montant sont NOMMÉES, jamais comptées comme 0 €', () => {
    expect(pipeTile(summary({ total_amount_cents: 10_000_000, total_without_amount: 1 }))).toEqual({
      kind: 'measured',
      cents: 10_000_000,
      count: 4,
      withoutAmount: 1,
    })
  })

  it('aucun montant saisi sur aucune affaire : « non mesuré », pas « 0 € » (GA-18)', () => {
    expect(pipeTile(summary({ total_amount_cents: 0, total_without_amount: 4 }))).toEqual({
      kind: 'unmeasured',
      count: 4,
    })
  })

  it('aucune affaire : état vide, pas de montant', () => {
    expect(pipeTile(summary({ total_count: 0, total_amount_cents: 0 }))).toEqual({ kind: 'none' })
  })

  it('pipe pas encore lu : rien n’est affirmé', () => {
    expect(pipeTile(undefined)).toEqual({ kind: 'unknown' })
  })
})

describe('Théo A today-jour.R8 — « Les affaires à faire avancer » : les miennes, sans prochaine action d’abord', () => {
  const deal = (id: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      owner_id: 'me',
      stage: 'qualified',
      stage_entered_at: '2026-10-01T00:00:00Z',
      next_action: { title: 'x', due_on: '2026-10-30' } as unknown,
      ...over,
    }) as { id: string; owner_id: string; stage: string; stage_entered_at: string; next_action?: unknown }

  it('ne garde que mes affaires encore ouvertes', () => {
    const out = dealsToAdvance(
      [deal('a'), deal('b', { owner_id: 'autre' }), deal('c', { stage: 'won' }), deal('d', { stage: 'lost' })],
      'me',
    )
    expect(out.map(d => d.id)).toEqual(['a'])
  })

  it('met d’abord celles qui n’ont AUCUNE prochaine action, puis la plus ancienne dans son étape', () => {
    const out = dealsToAdvance(
      [
        deal('recent', { stage_entered_at: '2026-10-20T00:00:00Z' }),
        deal('ancienne', { stage_entered_at: '2026-08-01T00:00:00Z' }),
        deal('sans-action', { next_action: null }),
        deal('muette', { next_action: undefined }),
      ],
      'me',
    )
    // `undefined` = l’API ne l’a pas dit : on n’affirme pas « sans prochaine action ».
    expect(out.map(d => d.id)).toEqual(['sans-action', 'ancienne', 'recent', 'muette'])
  })

  it('en montre au plus quatre', () => {
    const many = Array.from({ length: 9 }, (_, i) => deal(`d${i}`))
    expect(dealsToAdvance(many, 'me')).toHaveLength(DEALS_SHOWN)
  })
})

describe('Théo A today-jour.N6 — « Les profils suivis » : mes profils, disponibilité déclarée', () => {
  const profile = (id: string, over: Record<string, unknown> = {}) =>
    ({ id, owner_user_id: 'me', available_from: '2026-11-10', ...over }) as {
      id: string
      owner_user_id: string
      available_from: string | null
    }

  it('garde mes profils avec une date de disponibilité déclarée, la plus proche d’abord', () => {
    const out = followedProfiles(
      [
        profile('tard', { available_from: '2027-01-01' }),
        profile('tot', { available_from: '2026-10-27' }),
        profile('sans-date', { available_from: null }),
        profile('autre', { owner_user_id: 'autre' }),
      ],
      'me',
    )
    expect(out.map(p => p.id)).toEqual(['tot', 'tard'])
  })

  it('en montre au plus trois', () => {
    const many = Array.from({ length: 6 }, (_, i) => profile(`p${i}`))
    expect(followedProfiles(many, 'me')).toHaveLength(PROFILES_SHOWN)
  })
})

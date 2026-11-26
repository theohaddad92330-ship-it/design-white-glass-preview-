import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGER_PERIOD_DAYS,
  MANAGER_PERIOD_DAYS,
  managerTeamStatsSchema,
  parseManagerPeriodDays,
} from './manager.js'

/**
 * #4158.39 / #4158.37 — UNE période pour tout le tableau `/team` (7 / 30 / 90 j),
 * lue depuis l'URL (`?periode=`). Le contrat porte la seule liste, le web et
 * l'API la lisent tous deux d'ici (GA-26).
 */
describe('parseManagerPeriodDays', () => {
  it('accepte les trois périodes, en nombre comme en texte (URL)', () => {
    expect(MANAGER_PERIOD_DAYS).toEqual([7, 30, 90])
    expect(parseManagerPeriodDays(30)).toBe(30)
    expect(parseManagerPeriodDays('90')).toBe(90)
  })

  it('retombe sur 7 j pour toute autre valeur — jamais une fenêtre devinée', () => {
    expect(DEFAULT_MANAGER_PERIOD_DAYS).toBe(7)
    expect(parseManagerPeriodDays(undefined)).toBe(7)
    expect(parseManagerPeriodDays('14')).toBe(7)
    expect(parseManagerPeriodDays('abc')).toBe(7)
    expect(parseManagerPeriodDays(-30)).toBe(7)
  })
})

describe('managerTeamStatsSchema — blocs de période (ajout seulement)', () => {
  const base = {
    workspace: { id: 'w1', name: 'Skaizen', member_count: 1 },
    totals: { accounts: 0, contacts: 0, emails_sent: 0, analyses: 0 },
    pipeline: [],
    members: [],
  }

  it('accepte encore un payload sans aucun des nouveaux blocs (API plus ancienne)', () => {
    expect(() => managerTeamStatsSchema.parse(base)).not.toThrow()
  })

  it('garde le pouls, la revue de pipeline, le staffing et les attentes', () => {
    const parsed = managerTeamStatsSchema.parse({
      ...base,
      period: { days: 7, since: '2026-10-07T00:00:00.000Z', previous_since: '2026-09-30T00:00:00.000Z' },
      pulse: {
        analyses: { current: 4, previous: 2 },
        actions_done: { current: 9, previous: 12 },
        meetings_declared: { current: 1, previous: 0 },
        active_accounts: { current: 6, previous: 6 },
        open_needs: { current: 2, previous: 3 },
      },
      pipeline_review: {
        inactivity_days: 14,
        stuck_days: 9,
        total: 1,
        counts: { no_next_step: 1, no_activity: 0, stuck: 1 },
        items: [
          {
            opportunity_id: 'o1',
            label: 'TMA SI RH',
            account_id: 'a1',
            company_name: 'Acme',
            stage: 'qualified',
            owner_user_id: null,
            reasons: ['no_next_step', 'stuck'],
            stage_entered_at: '2026-09-01T00:00:00.000Z',
            last_activity_at: null,
          },
        ],
      },
      staffing: { open_needs: 3, available_now: 2, available_soon: 1 },
      pending_invitations: 2,
      awaiting_esn_profile: ['u2'],
      period_activity: { total: 0, items: [] },
    })
    expect(parsed.pulse?.meetings_declared.current).toBe(1)
    expect(parsed.pipeline_review?.items[0]?.reasons).toEqual(['no_next_step', 'stuck'])
    expect(parsed.awaiting_esn_profile).toEqual(['u2'])
  })

  it('refuse une raison de revue de pipeline inconnue — aucune probabilité ne s’y glisse', () => {
    expect(() =>
      managerTeamStatsSchema.parse({
        ...base,
        pipeline_review: {
          inactivity_days: 14,
          stuck_days: 9,
          total: 1,
          counts: { no_next_step: 0, no_activity: 0, stuck: 0 },
          items: [
            {
              opportunity_id: 'o1',
              label: 'x',
              account_id: 'a1',
              company_name: 'Acme',
              stage: 'qualified',
              owner_user_id: null,
              reasons: ['low_probability'],
              stage_entered_at: '2026-09-01T00:00:00.000Z',
              last_activity_at: null,
            },
          ],
        },
      }),
    ).toThrow()
  })
})

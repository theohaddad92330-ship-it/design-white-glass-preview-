import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { campaignSummary, filterSequences, filterOptions, NO_FILTERS } from './sequences-list-filters'

const NOW = new Date('2026-10-22T10:00:00.000Z')

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: 's',
    sequence_id: 'q',
    position: 0,
    due_at: '2026-10-27T09:00:00.000Z',
    kind: 'email',
    payload: {},
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step(), step({ position: 1 }), step({ position: 2 })]
  return {
    id: 'q',
    contact_id: 'c',
    contact_name: 'Claire Martin',
    contact_role: 'DSI',
    account_id: 'a',
    account_name: 'Société Générale',
    name: 'Refonte applicative',
    campaign_label: null,
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-10-14T09:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  }
}

const rows = [
  sequence({
    id: '1',
    contact_id: 'c1',
    campaign_label: 'DSI grands comptes',
    template_key: 'prospection_3_touches',
    account_name: 'SNCF',
  }),
  sequence({
    id: '2',
    contact_id: 'c2',
    campaign_label: 'DSI grands comptes',
    template_key: 'prospection_3_touches',
    account_name: 'SNCF',
  }),
  sequence({ id: '3', contact_id: 'c3', status: 'paused', template_key: 'nurturing', account_name: 'Airbus' }),
  sequence({ id: '4', contact_id: 'c4', status: 'completed', template_key: null, account_name: null }),
]

describe('filterSequences — Théo C sequences-liste : tous les filtres à choix multiple', () => {
  it('sans filtre, rend tout', () => {
    expect(filterSequences(rows, NO_FILTERS, NOW).map(r => r.id)).toEqual(['1', '2', '3', '4'])
  })

  it('deux états cochés gardent l’un OU l’autre', () => {
    const kept = filterSequences(rows, { ...NO_FILTERS, states: new Set(['paused', 'completed']) }, NOW)
    expect(kept.map(r => r.id)).toEqual(['3', '4'])
  })

  it('les familles de filtres se composent (ET entre familles)', () => {
    const kept = filterSequences(
      rows,
      { ...NO_FILTERS, accounts: new Set(['SNCF', 'Airbus']), models: new Set(['nurturing']) },
      NOW,
    )
    expect(kept.map(r => r.id)).toEqual(['3'])
  })

  it('une séquence sans compte ne tombe jamais sous un filtre de compte', () => {
    const kept = filterSequences(rows, { ...NO_FILTERS, accounts: new Set(['SNCF']) }, NOW)
    expect(kept.map(r => r.id)).toEqual(['1', '2'])
  })

  it('filtre par campagne, plusieurs à la fois', () => {
    const kept = filterSequences(rows, { ...NO_FILTERS, campaigns: new Set(['DSI grands comptes']) }, NOW)
    expect(kept.map(r => r.id)).toEqual(['1', '2'])
  })
})

describe('filterOptions — une option n’existe que si une ligne la porte', () => {
  it('compte et modèle, comptés, sans valeur absente', () => {
    const options = filterOptions(rows)
    expect(options.accounts).toEqual([
      { value: 'SNCF', label: 'SNCF', count: 2 },
      { value: 'Airbus', label: 'Airbus', count: 1 },
    ])
    expect(options.models.map(o => o.value)).toEqual(['prospection_3_touches', 'nurturing'])
    expect(options.models.every(o => o.label.length > 0)).toBe(true)
  })
})

describe('campaignSummary — « 5 campagnes · 2 actives, 1 planifiée »', () => {
  it('compte les LIGNES d’audience, pas les personnes', () => {
    const summary = campaignSummary(rows, NOW)
    expect(summary.campaigns).toBe(3)
    // La campagne (1, 2) et la séquence seule 3 (en pause) : aucune étape faite → la campagne est planifiée.
    expect(summary.active).toBe(0)
    expect(summary.scheduled).toBe(1)
  })

  it('une étape faite rend la campagne active', () => {
    const started = rows.map(row =>
      row.id === '1'
        ? { ...row, steps: row.steps.map((s, i) => (i === 0 ? { ...s, status: 'done' as const } : s)) }
        : row,
    )
    expect(campaignSummary(started, NOW)).toEqual({ campaigns: 3, active: 1, scheduled: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildCampaignAudience,
  campaignAudienceFiltersSchema,
  campaignAudienceRequestSchema,
  type AudienceCandidate,
} from './campaign-audience-builder.js'

const NOW = new Date('2026-09-29T12:00:00Z')
const ME = 'u-me'

function candidate(over: Partial<AudienceCandidate> & { id: string }): AudienceCandidate {
  return {
    full_name: `Contact ${over.id}`,
    title: null,
    account_id: 'a-1',
    account_name: 'Acme',
    account_parked: false,
    entity: null,
    decision_role: null,
    seniority: null,
    location: null,
    family: null,
    priority: null,
    user_status: 'new',
    assigned_to: null,
    email: `${over.id}@acme.test`,
    phone: null,
    linkedin_url: null,
    identity_confirmed: true,
    last_enrichment_at: null,
    last_contacted_at: null,
    lifecycle_state: null,
    opted_out: false,
    erased: false,
    active_sequence: null,
    prior_sequences_count: 0,
    ...over,
  }
}

const build = (candidates: AudienceCandidate[], filters = {}) =>
  buildCampaignAudience(candidates, campaignAudienceFiltersSchema.parse(filters), { now: NOW, viewerId: ME })

describe('audience — fréquence et conformité affichée (#2974)', () => {
  it('#2380.54 — au plus N contacts par compte, les suivants sont exclus ET comptés', () => {
    const result = build(
      [
        candidate({ id: 'c-1' }),
        candidate({ id: 'c-2' }),
        candidate({ id: 'c-3' }),
        candidate({ id: 'c-4', account_id: 'a-2' }),
      ],
      { max_per_account: 2 },
    )
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2', 'c-4'])
    expect(result.excluded).toEqual([{ contact_id: 'c-3', full_name: 'Contact c-3', reason: 'frequency_cap' }])
    expect(result.preview.frequency_capped).toBe(1)
  })

  it('#2380.54 — un contact sans compte n’est pas plafonné (pas de compte, pas de groupe)', () => {
    const result = build([candidate({ id: 'c-1', account_id: null }), candidate({ id: 'c-2', account_id: null })], {
      max_per_account: 1,
    })
    expect(result.eligible).toHaveLength(2)
  })

  it('#2380.56 — plafond quotidien global : au plus N contacts par lancement', () => {
    const result = build(
      [
        candidate({ id: 'c-1' }),
        candidate({ id: 'c-2', account_id: 'a-2' }),
        candidate({ id: 'c-3', account_id: 'a-3' }),
      ],
      { max_per_day: 2 },
    )
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2'])
    expect(result.excluded.map(e => e.reason)).toEqual(['frequency_cap'])
  })

  it('#2380.53 — au plus N séquences déjà armées pour ce contact (toutes campagnes confondues)', () => {
    const result = build(
      [
        candidate({ id: 'c-1', prior_sequences_count: 2 }),
        candidate({ id: 'c-2', prior_sequences_count: 3 }),
        candidate({ id: 'c-3', prior_sequences_count: 0 }),
      ],
      { max_per_contact: 3 },
    )
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-3'])
    expect(result.excluded).toEqual([{ contact_id: 'c-2', full_name: 'Contact c-2', reason: 'frequency_cap' }])
    expect(result.preview.frequency_capped).toBe(1)
  })

  it('#2380.53 — sans historique de séquence, un contact n’est jamais plafonné', () => {
    const result = build([candidate({ id: 'c-1', prior_sequences_count: 0 })], { max_per_contact: 1 })
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1'])
  })

  it('sans plafond, rien n’est coupé et le compteur reste à zéro (jamais « non mesuré »)', () => {
    const result = build([candidate({ id: 'c-1' }), candidate({ id: 'c-2' })])
    expect(result.preview.frequency_capped).toBe(0)
    expect(result.eligible).toHaveLength(2)
  })

  it('un plafond ne réintègre jamais un exclu de conformité (opt-out reste opt-out)', () => {
    const result = build([candidate({ id: 'c-1', opted_out: true }), candidate({ id: 'c-2' })], { max_per_account: 1 })
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-2'])
    expect(result.excluded.map(e => e.reason)).toEqual(['opted_out'])
  })

  it('#2380.61/.64 — la raison de l’arrêt posé est AFFICHÉE sur l’exclu, jamais devinée', () => {
    const result = build([
      candidate({ id: 'c-1', opted_out: true, stop_reason: 'do_not_call' }),
      candidate({ id: 'c-2', opted_out: true }),
    ])
    expect(result.excluded[0]).toMatchObject({ reason: 'opted_out', stop_reason: 'do_not_call' })
    expect(result.excluded[1].stop_reason).toBeNull()
  })

  it('#2380.8 / #2380.12 — les sources import et comptes dormants sont acceptées, une clé inconnue refusée', () => {
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'import' } }).success).toBe(true)
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'dormant_accounts' } }).success).toBe(true)
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'import', extra: 1 } }).success).toBe(false)
  })
})

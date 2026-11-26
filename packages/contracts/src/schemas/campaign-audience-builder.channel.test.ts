import { describe, expect, it } from 'vitest'
import {
  buildCampaignAudience,
  campaignAudienceFiltersSchema,
  type AudienceCandidate,
} from './campaign-audience-builder.js'

const NOW = new Date('2026-09-30T12:00:00Z')

function candidate(over: Partial<AudienceCandidate> & { id: string }): AudienceCandidate {
  return {
    full_name: `Contact ${over.id}`,
    title: null,
    account_id: null,
    account_name: null,
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
  buildCampaignAudience(candidates, campaignAudienceFiltersSchema.parse(filters), { now: NOW, viewerId: 'u-me' })

describe('audience — canal et contact personnel (#2974)', () => {
  it('#2380.55 — au plus N contacts PAR CANAL ; le canal est celui du filtre, sinon la première coordonnée', () => {
    const result = build(
      [
        candidate({ id: 'e-1' }),
        candidate({ id: 'e-2' }),
        candidate({ id: 'p-1', email: null, phone: '0612345678' }),
        candidate({ id: 'e-3' }),
      ],
      { max_per_channel: 2 },
    )
    expect(result.eligible.map(e => e.contact_id)).toEqual(['e-1', 'e-2', 'p-1'])
    expect(result.excluded).toEqual([{ contact_id: 'e-3', full_name: 'Contact e-3', reason: 'frequency_cap' }])
    expect(result.preview.frequency_capped).toBe(1)
  })

  it('#2380.55 — sans plafond par canal, rien ne est coupé', () => {
    const result = build([candidate({ id: 'e-1' }), candidate({ id: 'e-2' }), candidate({ id: 'e-3' })])
    expect(result.eligible).toHaveLength(3)
    expect(result.preview.frequency_capped).toBe(0)
  })

  it('#2380.55 — un plafond à 0 est refusé, jamais lu comme « aucun plafond »', () => {
    expect(campaignAudienceFiltersSchema.safeParse({ max_per_channel: 0 }).success).toBe(false)
  })

  it('#2380.65 — un contact dont la SEULE coordonnée est une boîte personnelle est exclu et compté', () => {
    const result = build([
      candidate({ id: 'pro', email: 'a@acme.test' }),
      candidate({ id: 'perso', email: 'marie@gmail.com' }),
      candidate({ id: 'perso-tel', email: 'jean@Outlook.fr', phone: '0612345678' }),
    ])
    expect(result.eligible.map(e => e.contact_id)).toEqual(['pro', 'perso-tel'])
    expect(result.excluded).toEqual([{ contact_id: 'perso', full_name: 'Contact perso', reason: 'personal_contact' }])
    expect(result.preview.personal_contacts).toBe(1)
  })

  it('#2380.65 — canal e-mail demandé : une boîte personnelle est exclue même avec un téléphone', () => {
    const result = build([candidate({ id: 'perso-tel', email: 'jean@outlook.fr', phone: '0612345678' })], {
      channel: 'email',
    })
    expect(result.eligible).toEqual([])
    expect(result.excluded[0]?.reason).toBe('personal_contact')
  })

  it('#2380.65 — un domaine qui CONTIENT « gmail.com » sans l’être n’est pas personnel', () => {
    const result = build([candidate({ id: 'x', email: 'a@notgmail.com.acme.test' })])
    expect(result.eligible).toHaveLength(1)
  })
})

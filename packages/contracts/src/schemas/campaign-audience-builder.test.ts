import { describe, expect, it } from 'vitest'
import {
  AUDIENCE_PROTECTED_CRITERIA,
  buildCampaignAudience,
  campaignAudienceFiltersSchema,
  campaignAudienceRequestSchema,
  type AudienceCandidate,
} from './campaign-audience-builder.js'

const NOW = new Date('2026-09-28T12:00:00Z')
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
    ...over,
  }
}

const build = (candidates: AudienceCandidate[], filters = {}, options = {}) =>
  buildCampaignAudience(candidates, campaignAudienceFiltersSchema.parse(filters), {
    now: NOW,
    viewerId: ME,
    ...options,
  })

describe('constructeur d’audience de campagne (#2974)', () => {
  it('produit une LISTE de contacts éligibles, chacun étiqueté mono-contact (c74)', () => {
    const result = build([candidate({ id: 'c-1' }), candidate({ id: 'c-2' })])
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2'])
    expect(result.eligible.every(e => e.sequence_scope === 'mono_contact')).toBe(true)
  })

  describe('déduplication — on PROPOSE, on ne fusionne jamais', () => {
    it('le même contact_id vu deux fois n’apparaît qu’une fois (#2380.43)', () => {
      const result = build([candidate({ id: 'c-1' }), candidate({ id: 'c-1' })])
      expect(result.eligible).toHaveLength(1)
      expect(result.preview.total).toBe(1)
    })

    it('deux fiches au même téléphone sont PROPOSÉES comme doublon, les deux restent (#2380.45)', () => {
      const result = build([
        candidate({ id: 'c-1', email: null, phone: '+33 6 12 34 56 78' }),
        candidate({ id: 'c-2', email: null, phone: '0612345678' }),
      ])
      expect(result.duplicates).toEqual([{ key: 'phone', contact_ids: ['c-1', 'c-2'] }])
      expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2'])
      expect(result.eligible[0].duplicate_suspected).toBe(true)
      expect(result.preview.duplicates).toBe(2)
    })

    it('deux fiches à la même adresse e-mail (casse ignorée) sont proposées comme doublon (#2380.38)', () => {
      const result = build([
        candidate({ id: 'c-1', email: 'Claire@Acme.test' }),
        candidate({ id: 'c-2', email: 'claire@acme.test ' }),
      ])
      expect(result.duplicates).toEqual([{ key: 'email', contact_ids: ['c-1', 'c-2'] }])
    })

    it('une absence ne fait jamais doublon', () => {
      const result = build([candidate({ id: 'c-1', email: null }), candidate({ id: 'c-2', email: null })])
      expect(result.duplicates).toEqual([])
    })
  })

  describe('collision — un contact déjà dans une séquence active', () => {
    const inSequence = candidate({
      id: 'c-1',
      active_sequence: { sequence_id: 's-9', owner_id: 'u-collegue' },
    })

    it('est signalé ET exclu par défaut, avec le collègue engagé (#2380.36, #2380.42, #2380.49)', () => {
      const result = build([inSequence, candidate({ id: 'c-2' })])
      expect(result.eligible.map(e => e.contact_id)).toEqual(['c-2'])
      expect(result.excluded).toEqual([{ contact_id: 'c-1', full_name: 'Contact c-1', reason: 'already_in_sequence' }])
      expect(result.collisions).toEqual([
        { contact_id: 'c-1', sequence_id: 's-9', owner_id: 'u-collegue', is_team_collision: true },
      ])
      expect(result.preview.already_in_sequence).toBe(1)
      expect(result.preview.team_collisions).toBe(1)
    })

    it('ma propre séquence n’est pas une collision d’ÉQUIPE, mais reste exclue', () => {
      const result = build([candidate({ id: 'c-1', active_sequence: { sequence_id: 's-1', owner_id: ME } })])
      expect(result.collisions[0].is_team_collision).toBe(false)
      expect(result.preview.team_collisions).toBe(0)
      expect(result.eligible).toEqual([])
    })
  })

  describe('conformité', () => {
    it('un opt-out est exclu, toujours (#2380.59)', () => {
      const result = build([candidate({ id: 'c-1', opted_out: true })])
      expect(result.excluded[0].reason).toBe('opted_out')
    })

    it('un effacement RGPD demandé est exclu, et ne se nomme pas (#2380.62)', () => {
      const result = build([candidate({ id: 'c-1', erased: true, full_name: 'Jean Dupont' })])
      expect(result.excluded).toEqual([{ contact_id: 'c-1', full_name: null, reason: 'erasure_requested' }])
    })

    it('un compte écarté exclut ses contacts (#2380.40, #2380.66)', () => {
      const result = build([candidate({ id: 'c-1', account_parked: true })])
      expect(result.excluded[0].reason).toBe('account_excluded')
      expect(result.preview.excluded_accounts).toBe(1)
    })

    it('un contact parti est exclu (#2380.41)', () => {
      const result = build([candidate({ id: 'c-1', lifecycle_state: 'historique' })])
      expect(result.excluded[0].reason).toBe('contact_left')
      expect(result.preview.left_contacts).toBe(1)
    })

    it('aucun forçage ne réintègre un opt-out ou un effacement, même en incluant les collisions', () => {
      const result = build(
        [candidate({ id: 'c-1', opted_out: true, active_sequence: { sequence_id: 's', owner_id: 'x' } })],
        {},
        { includeCollisions: true },
      )
      expect(result.eligible).toEqual([])
    })

    it('le filtre refuse tout critère protégé (âge, genre, origine, photo, adresse…)', () => {
      for (const key of AUDIENCE_PROTECTED_CRITERIA) {
        expect(campaignAudienceFiltersSchema.safeParse({ [key]: 'x' }).success, key).toBe(false)
      }
      const shapeKeys = Object.keys(campaignAudienceFiltersSchema.shape)
      for (const key of AUDIENCE_PROTECTED_CRITERIA) expect(shapeKeys).not.toContain(key)
    })
  })

  describe('fréquence — refroidissement (#2380.57) et déjà contactés (#2380.37)', () => {
    it('un contact écrit il y a moins de 14 jours est exclu par défaut', () => {
      const result = build([candidate({ id: 'c-1', last_contacted_at: '2026-09-20T12:00:00Z' })])
      expect(result.excluded[0].reason).toBe('cooldown')
      expect(result.preview.already_contacted).toBe(1)
    })

    it('au-delà du refroidissement, il est éligible mais compté comme déjà contacté', () => {
      const result = build([candidate({ id: 'c-1', last_contacted_at: '2026-08-01T12:00:00Z' })])
      expect(result.eligible).toHaveLength(1)
      expect(result.preview.already_contacted).toBe(1)
    })

    it('le refroidissement se règle', () => {
      const result = build([candidate({ id: 'c-1', last_contacted_at: '2026-09-20T12:00:00Z' })], {
        cooldown_days: 3,
      })
      expect(result.eligible).toHaveLength(1)
    })
  })

  describe('filtres', () => {
    const pool = [
      candidate({
        id: 'c-1',
        account_id: 'a-1',
        entity: 'DSI',
        decision_role: 'decideur',
        seniority: 'director',
        location: 'Lyon',
        assigned_to: ME,
        priority: 1,
        user_status: 'new',
        family: 'tech',
        phone: '0600000001',
        last_enrichment_at: '2026-09-20T00:00:00Z',
      }),
      candidate({
        id: 'c-2',
        account_id: 'a-2',
        entity: 'Achats',
        decision_role: 'influenceur',
        seniority: 'manager',
        location: 'Paris',
        assigned_to: 'u-autre',
        priority: 3,
        user_status: 'contacted',
        family: 'achats',
        email: null,
        last_enrichment_at: '2026-01-01T00:00:00Z',
      }),
    ]
    const ids = (filters: Record<string, unknown>) => build(pool, filters).eligible.map(e => e.contact_id)

    it('entreprise (#2380.14)', () => expect(ids({ account_ids: ['a-2'] })).toEqual(['c-2']))
    it('entité (#2380.15)', () => expect(ids({ entities: ['dsi'] })).toEqual(['c-1']))
    it('rôle (#2380.16)', () => expect(ids({ decision_roles: ['influenceur'] })).toEqual(['c-2']))
    it('séniorité (#2380.17)', () => expect(ids({ seniorities: ['director'] })).toEqual(['c-1']))
    it('territoire (#2380.18)', () => expect(ids({ location_contains: 'par' })).toEqual(['c-2']))
    it('owner (#2380.20)', () => expect(ids({ owner_ids: [ME] })).toEqual(['c-1']))
    it('coordonnées (#2380.21)', () => expect(ids({ require_email: true })).toEqual(['c-1']))
    it('fraîcheur (#2380.22)', () => expect(ids({ enriched_within_days: 30 })).toEqual(['c-1']))
    it('statut (#2380.23)', () => expect(ids({ statuses: ['contacted'] })).toEqual(['c-2']))
    it('persona (#2380.28)', () => expect(ids({ personas: ['achats'] })).toEqual(['c-2']))
    it('dernière interaction : pas écrit depuis N jours (#2380.24)', () => {
      const result = build(
        [
          candidate({ id: 'c-1', last_contacted_at: '2026-09-01T00:00:00Z' }),
          candidate({ id: 'c-2', last_contacted_at: '2026-05-01T00:00:00Z' }),
          candidate({ id: 'c-3' }),
        ],
        { not_contacted_within_days: 60 },
      )
      expect(result.eligible.map(e => e.contact_id)).toEqual(['c-2', 'c-3'])
    })
    it('priorité (#2380.29)', () => expect(ids({ max_priority: 2 })).toEqual(['c-1']))

    it('canal : sans coordonnée pour le canal choisi, le contact est exclu et compté (#2380.27, #2380.33)', () => {
      const result = build(pool, { channel: 'phone' })
      expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1'])
      expect(result.excluded).toEqual([{ contact_id: 'c-2', full_name: 'Contact c-2', reason: 'missing_coordinates' }])
      expect(result.preview.missing_coordinates).toBe(1)
    })

    it('séquence actuelle : ne garder que ceux sans séquence (#2380.25)', () => {
      const withSeq = [...pool, candidate({ id: 'c-3', active_sequence: { sequence_id: 's', owner_id: ME } })]
      const result = buildCampaignAudience(withSeq, campaignAudienceFiltersSchema.parse({ in_sequence: 'no' }), {
        now: NOW,
        viewerId: ME,
      })
      expect(result.preview.total).toBe(2)
    })

    it('un contact filtré ne fait AUCUNE ligne — ni éligible, ni exclu', () => {
      const result = build(pool, { account_ids: ['a-2'] })
      expect(result.excluded).toEqual([])
      expect(result.preview.total).toBe(1)
    })
  })

  describe('preview', () => {
    it('compte total, éligibles, identités non vérifiées et autre owner (#2380.31/.32/.34/.39)', () => {
      const result = build([
        candidate({ id: 'c-1', identity_confirmed: false }),
        candidate({ id: 'c-2', assigned_to: 'u-autre' }),
        candidate({ id: 'c-3', opted_out: true }),
      ])
      expect(result.preview).toMatchObject({
        total: 3,
        eligible: 2,
        unverified_identity: 1,
        other_owner: 1,
      })
      const first = result.eligible.find(e => e.contact_id === 'c-1')
      expect(first?.identity_unverified).toBe(true)
    })
  })

  it('la requête accepte les sources nommées et refuse une clé inconnue', () => {
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'workspace_contacts' } }).success).toBe(true)
    expect(
      campaignAudienceRequestSchema.safeParse({
        source: { kind: 'account', account_id: '0b6e2d3a-4f1c-4c8e-9a1b-2d3e4f5a6b7c' },
        filters: {},
      }).success,
    ).toBe(true)
    expect(
      campaignAudienceRequestSchema.safeParse({ source: { kind: 'workspace_contacts' }, filters: { gender: 'f' } })
        .success,
    ).toBe(false)
  })

  it('#2380.7 — la source « besoin » exige un need_id, refuse une clé inconnue', () => {
    expect(
      campaignAudienceRequestSchema.safeParse({
        source: { kind: 'need', need_id: '0b6e2d3a-4f1c-4c8e-9a1b-2d3e4f5a6b7c' },
      }).success,
    ).toBe(true)
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'need' } }).success).toBe(false)
    expect(
      campaignAudienceRequestSchema.safeParse({
        source: { kind: 'need', need_id: '0b6e2d3a-4f1c-4c8e-9a1b-2d3e4f5a6b7c', extra: true },
      }).success,
    ).toBe(false)
  })
})

describe('campaignAudienceRequestSchema — source saved_view (#2202.12)', () => {
  it('accepte une vue enregistrée par son identifiant, refuse le reste', () => {
    const id = '0b6e2d3a-4f1c-4c8e-9a1b-2d3e4f5a6b7c'
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'saved_view', saved_view_id: id } }).success).toBe(
      true,
    )
    expect(campaignAudienceRequestSchema.safeParse({ source: { kind: 'saved_view' } }).success).toBe(false)
    expect(
      campaignAudienceRequestSchema.safeParse({ source: { kind: 'saved_view', saved_view_id: id, extra: 1 } }).success,
    ).toBe(false)
  })
})

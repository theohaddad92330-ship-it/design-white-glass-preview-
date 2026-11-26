import { describe, expect, it } from 'vitest'
import {
  createLostDealRexSchema,
  LOST_DEAL_MOTIFS,
  LOST_DEAL_REX_EVIDENCE_KINDS,
  LOST_DEAL_REX_REUSE_TARGETS,
  lostDealRexSchema,
} from './lost-deal-rex.js'

const MINIMAL_BODY = {
  project_id: '11111111-1111-1111-1111-111111111111',
  account_id: null,
  perimeter: null,
  need: null,
  people_involved: null,
  real_decider: null,
  sponsor: null,
  route_used: null,
  proof_used: null,
  angle_tried: null,
  angles_not_tried: [],
  last_action: null,
  declared_motif: null,
  declared_motif_note: null,
  suspected_motif: null,
  suspected_motif_note: null,
  competitor: null,
  timing: null,
  cycle_days: null,
  procurement_friction: null,
  consultant_gap: null,
  economics: null,
  what_team_knows_now: null,
  revisit_on: null,
  reuse_targets: [],
}

describe('lostDealRexSchema — REX PERTE (#3272.1)', () => {
  it('accepte un REX où tout est absent sauf le rattachement au projet', () => {
    const result = createLostDealRexSchema.safeParse(MINIMAL_BODY)
    expect(result.success).toBe(true)
  })

  it('refuse un REX sans project_id — la seule ancre obligatoire', () => {
    const { project_id: _omit, ...withoutProject } = MINIMAL_BODY
    const result = createLostDealRexSchema.safeParse(withoutProject)
    expect(result.success).toBe(false)
  })

  it('accepte un REX complet, avec ses affirmations « evidenced »', () => {
    const result = lostDealRexSchema.safeParse({
      id: '22222222-2222-2222-2222-222222222222',
      workspace_id: '33333333-3333-3333-3333-333333333333',
      created_by: '44444444-4444-4444-4444-444444444444',
      created_at: '2026-09-28T18:00:00.000Z',
      ...MINIMAL_BODY,
      account_id: '55555555-5555-5555-5555-555555555555',
      perimeter: 'Refonte du portail RH, 12 mois',
      angle_tried: 'Approche directe via le DSI',
      angles_not_tried: ['Passer par le sponsor métier'],
      last_action: { value: 'Relance envoyée sans réponse', distinction: 'fait_confirme' },
      declared_motif: 'budget',
      declared_motif_note: { value: 'Le client dit avoir gelé le budget IT', distinction: 'retour_client' },
      suspected_motif: 'mauvaise_personne',
      suspected_motif_note: { value: 'On a parlé à un relais, jamais au vrai décideur', distinction: 'hypothese' },
      what_team_knows_now: {
        value: 'Ce compte se joue par le sponsor métier, pas par le DSI',
        distinction: 'interpretation_commerciale',
      },
      revisit_on: '2027-03-01',
      reuse_targets: ['account_local_strategy', 'route'],
    })
    expect(result.success).toBe(true)
  })

  it('refuse une affirmation « evidenced » sans sa distinction', () => {
    const result = lostDealRexSchema.safeParse({
      id: '22222222-2222-2222-2222-222222222222',
      workspace_id: '33333333-3333-3333-3333-333333333333',
      created_by: '44444444-4444-4444-4444-444444444444',
      created_at: '2026-09-28T18:00:00.000Z',
      ...MINIMAL_BODY,
      last_action: { value: 'Relance envoyée' },
    })
    expect(result.success).toBe(false)
  })

  it('refuse un motif hors du catalogue fermé', () => {
    const result = createLostDealRexSchema.safeParse({ ...MINIMAL_BODY, declared_motif: 'trop_cher' })
    expect(result.success).toBe(false)
  })

  it('porte les quatorze motifs de la spec, mot pour mot', () => {
    expect(LOST_DEAL_MOTIFS).toEqual([
      'timing',
      'budget',
      'concurrence',
      'panel',
      'sponsor_absent',
      'mauvaise_personne',
      'mauvais_besoin',
      'proposition',
      'prix',
      'consultant',
      'delivery',
      'decision_interne',
      'aucune_decision',
      'inconnu',
    ])
  })

  it('porte les cinq distinctions de la spec, mot pour mot', () => {
    expect(LOST_DEAL_REX_EVIDENCE_KINDS).toEqual([
      'fait_confirme',
      'retour_client',
      'interpretation_commerciale',
      'hypothese',
      'inconnu',
    ])
  })

  it('porte les sept cibles de réutilisation de la spec, mot pour mot', () => {
    expect(LOST_DEAL_REX_REUSE_TARGETS).toEqual([
      'account_local_strategy',
      'route',
      'message',
      'blocker_list',
      'review_date',
      'comparable_case',
      'workspace_rule',
    ])
  })
})

describe('lostDealRexSchema — NO-GO (#3272.7)', () => {
  it('ne propose aucune cible de réutilisation à portée secteur ou canal', () => {
    for (const target of LOST_DEAL_REX_REUSE_TARGETS) {
      expect(target).not.toMatch(/sector|secteur|channel|canal/i)
    }
  })
})

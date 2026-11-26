import { describe, expect, it } from 'vitest'
import {
  createLostDealRuleProposalSchema,
  lostDealRuleBiasFlags,
  lostDealRuleProposalSchema,
  setWorkspaceMethodRuleActivationSchema,
  WORKSPACE_RULE_PENDING_REVIEW,
  workspaceMethodRuleSchema,
} from './lost-deal-rule-proposal.js'

const REX_A = '11111111-1111-1111-1111-111111111111'
const REX_B = '22222222-2222-2222-2222-222222222222'

describe('createLostDealRuleProposalSchema — apprentissage contrôlé (#3272.5)', () => {
  it('accepte une proposition citant deux REX convergents', () => {
    const result = createLostDealRuleProposalSchema.safeParse({
      domain: 'Opportunité',
      convergent_rex_ids: [REX_A, REX_B],
      observation: 'Deux pertes consécutives sur le même secteur sans sponsor identifié en amont.',
    })
    expect(result.success).toBe(true)
  })

  it('refuse une proposition citant un seul REX — NO-GO, un échec isolé ne généralise pas (#3272.7)', () => {
    const result = createLostDealRuleProposalSchema.safeParse({
      domain: 'Opportunité',
      convergent_rex_ids: [REX_A],
      observation: 'Une seule perte, motif budget.',
    })
    expect(result.success).toBe(false)
  })

  it('refuse une proposition sans aucun cas cité', () => {
    const result = createLostDealRuleProposalSchema.safeParse({
      domain: 'Opportunité',
      convergent_rex_ids: [],
      observation: 'Aucun cas.',
    })
    expect(result.success).toBe(false)
  })

  it('ne porte aucun champ `status` — une création ne peut produire que `pending`', () => {
    // Passer un `status: 'adopted'` en entrée ne doit rien changer : le schéma
    // de création ignore ce champ, la valeur adoptée ne peut venir que de
    // `decideLostDealRuleProposalRequestSchema`.
    const parsed = createLostDealRuleProposalSchema.parse({
      domain: 'Opportunité',
      convergent_rex_ids: [REX_A, REX_B],
      observation: 'Deux cas convergents.',
      status: 'adopted',
    })
    expect(parsed).not.toHaveProperty('status')
  })

  it('refuse un domaine hors des maisons canoniques', () => {
    const result = createLostDealRuleProposalSchema.safeParse({
      domain: 'Deal',
      convergent_rex_ids: [REX_A, REX_B],
      observation: 'Domaine inventé.',
    })
    expect(result.success).toBe(false)
  })
})

describe('lostDealRuleProposalSchema — lecture', () => {
  it('accepte une proposition décidée, avec son décideur et sa date', () => {
    const result = lostDealRuleProposalSchema.safeParse({
      id: '33333333-3333-3333-3333-333333333333',
      workspace_id: '44444444-4444-4444-4444-444444444444',
      domain: 'Opportunité',
      convergent_rex_ids: [REX_A, REX_B],
      observation: 'Deux cas convergents.',
      status: 'adopted',
      proposed_by: '55555555-5555-5555-5555-555555555555',
      decided_by: '66666666-6666-6666-6666-666666666666',
      decided_at: '2026-09-28T18:00:00.000Z',
      created_at: '2026-09-27T10:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepte une proposition `pending` sans décideur ni date de décision', () => {
    // La cohérence statut/décideur est posée par le SERVICE, seul écrivain —
    // la dupliquer en `refine` ici romprait GA-26 (un réglage à un endroit).
    const result = lostDealRuleProposalSchema.safeParse({
      id: '33333333-3333-3333-3333-333333333333',
      workspace_id: '44444444-4444-4444-4444-444444444444',
      domain: 'Opportunité',
      convergent_rex_ids: [REX_A, REX_B],
      observation: 'Deux cas convergents.',
      status: 'pending',
      proposed_by: '55555555-5555-5555-5555-555555555555',
      decided_by: null,
      decided_at: null,
      created_at: '2026-09-27T10:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })
})

// #3295 — promotion réelle d'une proposition ADOPTÉE, et revue de biais.
describe('lostDealRuleBiasFlags — absence de biais évident (#3295)', () => {
  it('nomme chaque critère protégé qu’une observation invoque', () => {
    expect(lostDealRuleBiasFlags('Les clients perdent quand le décideur est une femme de plus de 50 ans')).toEqual([
      'age',
      'gender',
    ])
    expect(lostDealRuleBiasFlags('Éviter les contacts dont la photo ou la nationalité pose question')).toEqual([
      'origin',
      'photo',
    ])
  })

  it('une observation sur la méthode ne lève aucun drapeau', () => {
    expect(lostDealRuleBiasFlags('Sans sponsor identifié avant la démonstration, la perte suit à 90 jours')).toEqual([])
  })

  it('ignore accents et casse — « ÂGE » est un âge', () => {
    expect(lostDealRuleBiasFlags('ÂGE du décideur')).toEqual(['age'])
  })
})

describe('workspaceMethodRuleSchema — une règle promue naît désactivée (#3295)', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    proposal_id: '33333333-3333-4333-8333-333333333333',
    domain: 'Compte',
    statement: 'Sans sponsor avant la démonstration, la perte suit.',
    owner: '44444444-4444-4444-8444-444444444444',
    promoted_at: '2026-10-02T09:00:00.000Z',
    activated_by: null,
    activated_at: null,
  }

  it('désactivée SANS raison est refusée — jamais un silence', () => {
    expect(workspaceMethodRuleSchema.safeParse({ ...base, enabled: false, disabled_reason: null }).success).toBe(false)
  })

  it('désactivée avec sa raison, ou active : acceptée', () => {
    expect(
      workspaceMethodRuleSchema.safeParse({ ...base, enabled: false, disabled_reason: WORKSPACE_RULE_PENDING_REVIEW })
        .success,
    ).toBe(true)
    expect(workspaceMethodRuleSchema.safeParse({ ...base, enabled: true, disabled_reason: null }).success).toBe(true)
  })

  it('la désactivation (rollback) exige sa raison, l’activation non', () => {
    expect(setWorkspaceMethodRuleActivationSchema.safeParse({ enabled: false }).success).toBe(false)
    expect(setWorkspaceMethodRuleActivationSchema.safeParse({ enabled: false, reason: 'Biais constaté' }).success).toBe(
      true,
    )
    expect(setWorkspaceMethodRuleActivationSchema.safeParse({ enabled: true }).success).toBe(true)
  })
})

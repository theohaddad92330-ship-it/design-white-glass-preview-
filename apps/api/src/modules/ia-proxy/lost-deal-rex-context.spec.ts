import type { LostDealRex } from '@bellum/contracts'
import { lostDealRexContextFor } from './lost-deal-rex-context'

/**
 * #3272.6 — Laura cite le REX de perte du compte. Ce module condense les REX
 * déjà persistés en quelques lignes courtes : jamais le REX mot pour mot,
 * jamais une hypothèse présentée comme un fait acquis.
 */
function rex(over: Partial<LostDealRex> = {}): LostDealRex {
  return {
    id: 'rex-1',
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    account_id: 'acc-1',
    created_by: 'user-1',
    created_at: '2026-05-12T10:00:00.000Z',
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
    ...over,
  }
}

describe('lostDealRexContextFor', () => {
  it('rend null sans aucun REX — jamais un bloc vide injecté', () => {
    expect(lostDealRexContextFor([])).toBeNull()
  })

  it('nomme la route utilisée, le sponsor et le motif déclaré', () => {
    const context = lostDealRexContextFor([
      rex({ route_used: 'Approche directe, sans détour par le sponsor', sponsor: null, declared_motif: 'budget' }),
    ])

    expect(context).toContain('2026-05-12')
    expect(context).toContain('Approche directe, sans détour par le sponsor')
    expect(context).toContain('sponsor : non identifié')
    expect(context).toContain('budget')
  })

  it('marque une dernière action HYPOTHÈSE comme non confirmée — jamais un fait acquis (#3272.2)', () => {
    const context = lostDealRexContextFor([
      rex({ last_action: { value: 'Relance email restée sans réponse', distinction: 'hypothese' } }),
    ])

    expect(context).toContain('hypothèse, non confirmée')
    expect(context).toContain('Relance email restée sans réponse')
  })

  it('ne marque RIEN de plus pour un fait confirmé — pas de bruit sur ce qui est déjà sûr', () => {
    const context = lostDealRexContextFor([
      rex({ last_action: { value: 'Le client a signé chez le concurrent', distinction: 'fait_confirme' } }),
    ])

    expect(context).not.toContain('hypothèse')
    expect(context).toContain('Le client a signé chez le concurrent')
  })

  it('tronque un champ trop long — un résumé, jamais le REX mot pour mot', () => {
    const longRoute = 'x'.repeat(500)
    const context = lostDealRexContextFor([rex({ route_used: longRoute })])

    expect(context).not.toBeNull()
    expect(context!.length).toBeLessThan(longRoute.length)
  })

  it('condense plusieurs REX du même compte, une ligne chacun', () => {
    const context = lostDealRexContextFor([
      rex({ id: 'rex-1', created_at: '2026-05-12T10:00:00.000Z', declared_motif: 'budget' }),
      rex({ id: 'rex-2', created_at: '2025-11-03T10:00:00.000Z', declared_motif: 'concurrence' }),
    ])

    expect(context).toContain('2026-05-12')
    expect(context).toContain('2025-11-03')
    expect(context!.split('\n')).toHaveLength(2)
  })

  it('borne le total au budget de contexte — plusieurs REX ne dépassent jamais le plafond', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      rex({ id: `rex-${i}`, route_used: 'y'.repeat(150), sponsor: 'z'.repeat(150) }),
    )
    const context = lostDealRexContextFor(many)

    expect(context!.length).toBeLessThanOrEqual(1201)
  })
})

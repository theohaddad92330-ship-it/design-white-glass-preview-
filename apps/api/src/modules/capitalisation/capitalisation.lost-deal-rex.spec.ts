import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CapitalisationService } from './capitalisation.service'

/**
 * BEL-SC-243 — REX PERTE & apprentissage contrôlé (#3272).
 */
describe('CapitalisationService — REX de perte (#3272.1)', () => {
  const build = (over: { lostDealRexRows?: unknown[]; lostDealRuleProposal?: unknown } = {}) => {
    const proofs = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const rex = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const testimonials = { find: jest.fn().mockResolvedValue([]) }
    const missions = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const accounts = { find: jest.fn().mockResolvedValue([]) }
    const needs = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const auditLog = { save: jest.fn() }
    const lostDealRex = {
      find: jest.fn().mockResolvedValue(over.lostDealRexRows ?? []),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'ldr-1', created_at: new Date(), ...value })),
    }
    const lostDealRuleProposals = {
      findOne: jest.fn().mockResolvedValue(over.lostDealRuleProposal ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'ldp-1', created_at: new Date(), ...value })),
    }
    return {
      service: new CapitalisationService(
        proofs as never,
        rex as never,
        testimonials as never,
        missions as never,
        accounts as never,
        needs as never,
        auditLog as never,
        { find: jest.fn().mockResolvedValue([]) } as never, // projects (#3210)
        lostDealRex as never,
        lostDealRuleProposals as never,
        { find: jest.fn().mockResolvedValue([]) } as never, // accountPartners (#3210.1)
        { find: jest.fn().mockResolvedValue([]) } as never, // contacts (#3210.1, lot R17)
        { find: jest.fn().mockResolvedValue([]) } as never, // outreachMessages (#3210.1, lot R17)
      ),
      lostDealRex,
      lostDealRuleProposals,
    }
  }

  const MINIMAL_BODY = {
    project_id: 'proj-1',
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
    reuse_targets: [] as never[],
  }

  it('crée un REX minimal, rattaché au projet et à son auteur', async () => {
    const { service, lostDealRex } = build()
    const created = await service.createLostDealRex('ws-1', 'user-1', MINIMAL_BODY)

    expect(created.project_id).toBe('proj-1')
    expect(created.created_by).toBe('user-1')
    expect(lostDealRex.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws-1', project_id: 'proj-1', created_by: 'user-1' }),
    )
  })

  it('déplie une affirmation « evidenced » en valeur + distinction séparées', async () => {
    const { service } = build()
    const created = await service.createLostDealRex('ws-1', 'user-1', {
      ...MINIMAL_BODY,
      declared_motif: 'budget',
      declared_motif_note: { value: 'Le client dit avoir gelé le budget', distinction: 'retour_client' },
    })

    expect(created.declared_motif).toBe('budget')
    expect(created.declared_motif_note).toEqual({
      value: 'Le client dit avoir gelé le budget',
      distinction: 'retour_client',
    })
  })

  it('rend tous les REX connus pour un projet, du plus récent au plus ancien', async () => {
    const { service, lostDealRex } = build({
      lostDealRexRows: [
        {
          id: 'a',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          angles_not_tried: [],
          reuse_targets: [],
          created_at: new Date(),
        },
      ],
    })
    const items = await service.lostDealRexForProject('ws-1', 'proj-1')

    expect(items).toHaveLength(1)
    expect(lostDealRex.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'ws-1', project_id: 'proj-1' } }),
    )
  })

  // #3272.6 — Laura cite le REX de perte du COMPTE (plusieurs projets perdus
  // possibles pour le même compte), jamais seulement du projet actif.
  it('rend les REX connus pour un COMPTE, bornés aux plus récents', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `rex-${i}`,
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      project_id: `proj-${i}`,
      angles_not_tried: [],
      reuse_targets: [],
      created_at: new Date(2026, 0, i + 1),
    }))
    const { service, lostDealRex } = build({ lostDealRexRows: rows })
    await service.lostDealRexForAccount('ws-1', 'acc-1')

    expect(lostDealRex.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'ws-1', account_id: 'acc-1' }, take: 3 }),
    )
  })
})

describe('CapitalisationService — apprentissage contrôlé (#3272.5)', () => {
  const build = (rows: { id: string }[]) => {
    const proofs = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const rex = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const testimonials = { find: jest.fn().mockResolvedValue([]) }
    const missions = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const accounts = { find: jest.fn().mockResolvedValue([]) }
    const needs = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const auditLog = { save: jest.fn() }
    const lostDealRex = { find: jest.fn().mockResolvedValue(rows) }
    let saved: Record<string, unknown> | null = null
    const lostDealRuleProposals = {
      findOne: jest.fn().mockImplementation(async () => saved),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        saved = { id: 'ldp-1', created_at: new Date(), ...value }
        return saved
      }),
    }
    return {
      service: new CapitalisationService(
        proofs as never,
        rex as never,
        testimonials as never,
        missions as never,
        accounts as never,
        needs as never,
        auditLog as never,
        { find: jest.fn().mockResolvedValue([]) } as never, // projects (#3210)
        lostDealRex as never,
        lostDealRuleProposals as never,
        { find: jest.fn().mockResolvedValue([]) } as never, // accountPartners (#3210.1)
        { find: jest.fn().mockResolvedValue([]) } as never, // contacts (#3210.1, lot R17)
        { find: jest.fn().mockResolvedValue([]) } as never, // outreachMessages (#3210.1, lot R17)
      ),
    }
  }

  it('crée une proposition `pending` quand les deux REX cités existent dans cet espace', async () => {
    const { service } = build([{ id: 'a' }, { id: 'b' }])
    const created = await service.createLostDealRuleProposal('ws-1', 'user-1', {
      domain: 'Opportunité',
      convergent_rex_ids: ['a', 'b'],
      observation: 'Deux pertes convergentes.',
    })

    expect(created.status).toBe('pending')
    expect(created.decided_by).toBeNull()
  })

  it('refuse une proposition citant un REX introuvable dans cet espace', async () => {
    const { service } = build([{ id: 'a' }])
    await expect(
      service.createLostDealRuleProposal('ws-1', 'user-1', {
        domain: 'Opportunité',
        convergent_rex_ids: ['a', 'ghost'],
        observation: 'Un cas inventé.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('adopte une proposition pending sur décision humaine explicite', async () => {
    const { service } = build([{ id: 'a' }, { id: 'b' }])
    await service.createLostDealRuleProposal('ws-1', 'user-1', {
      domain: 'Opportunité',
      convergent_rex_ids: ['a', 'b'],
      observation: 'Deux cas.',
    })

    const decided = await service.decideLostDealRuleProposal('ws-1', 'reviewer-1', 'ldp-1', 'adopted')
    expect(decided.status).toBe('adopted')
    expect(decided.decided_by).toBe('reviewer-1')
  })

  it('refuse de redécider une proposition déjà tranchée', async () => {
    const { service } = build([{ id: 'a' }, { id: 'b' }])
    await service.createLostDealRuleProposal('ws-1', 'user-1', {
      domain: 'Opportunité',
      convergent_rex_ids: ['a', 'b'],
      observation: 'Deux cas.',
    })
    await service.decideLostDealRuleProposal('ws-1', 'reviewer-1', 'ldp-1', 'adopted')

    await expect(service.decideLostDealRuleProposal('ws-1', 'reviewer-2', 'ldp-1', 'rejected')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('refuse de décider une proposition introuvable dans cet espace', async () => {
    const { service } = build([])
    await expect(service.decideLostDealRuleProposal('ws-1', 'reviewer-1', 'unknown', 'adopted')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

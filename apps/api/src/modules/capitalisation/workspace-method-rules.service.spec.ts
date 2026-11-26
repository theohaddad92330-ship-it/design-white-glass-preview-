import { BadRequestException, NotFoundException } from '@nestjs/common'
import { WORKSPACE_RULE_PENDING_REVIEW } from '@bellum/contracts'
import { WorkspaceMethodRulesService } from './workspace-method-rules.service'

const WS = '22222222-2222-4222-8222-222222222222'
const USER = '44444444-4444-4444-8444-444444444444'
const PROPOSAL_ID = '33333333-3333-4333-8333-333333333333'

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    workspace_id: WS,
    domain: 'Compte',
    convergent_rex_ids: ['a', 'b'],
    observation: 'Sans sponsor identifié avant la démonstration, la perte suit à 90 jours.',
    status: 'pending',
    ...over,
  }
}

function build(over: { proposal?: unknown; rule?: unknown; rules?: unknown[] } = {}) {
  const proposals = { findOne: jest.fn().mockResolvedValue(over.proposal === undefined ? proposal() : over.proposal) }
  const rules = {
    find: jest.fn().mockResolvedValue(over.rules ?? []),
    findOne: jest.fn().mockResolvedValue(over.rule ?? null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({
      id: 'rule-1',
      promoted_at: new Date('2026-10-02T09:00:00Z'),
      ...value,
    })),
  }
  const capitalisation = {
    decideLostDealRuleProposal: jest.fn(async (_ws: string, _user: string, id: string, decision: string) => ({
      id,
      status: decision,
    })),
  }
  return {
    service: new WorkspaceMethodRulesService(rules as never, proposals as never, capitalisation as never),
    rules,
    proposals,
    capitalisation,
  }
}

describe('WorkspaceMethodRulesService — promotion réelle (#3295)', () => {
  it('une proposition ADOPTÉE crée une règle qui naît DÉSACTIVÉE, avec sa raison', async () => {
    const { service, rules } = build()
    const result = await service.decide(WS, USER, PROPOSAL_ID, 'adopted')

    expect(result.rule).toMatchObject({
      proposal_id: PROPOSAL_ID,
      domain: 'Compte',
      enabled: false,
      disabled_reason: WORKSPACE_RULE_PENDING_REVIEW,
      owner: USER,
      activated_by: null,
    })
    expect(rules.save).toHaveBeenCalledTimes(1)
  })

  it('une proposition REJETÉE ne crée aucune règle', async () => {
    const { service, rules } = build()
    const result = await service.decide(WS, USER, PROPOSAL_ID, 'rejected')

    expect(result.rule).toBeNull()
    expect(rules.save).not.toHaveBeenCalled()
  })

  it('refuse d’ADOPTER une observation qui invoque un critère protégé — la décision n’est pas même écrite', async () => {
    const { service, capitalisation, rules } = build({
      proposal: proposal({ observation: 'Les décideurs de plus de 55 ans ne signent jamais.' }),
    })

    await expect(service.decide(WS, USER, PROPOSAL_ID, 'adopted')).rejects.toBeInstanceOf(BadRequestException)
    expect(capitalisation.decideLostDealRuleProposal).not.toHaveBeenCalled()
    expect(rules.save).not.toHaveBeenCalled()
  })

  it('un REJET reste possible sur une observation biaisée — on peut toujours dire non', async () => {
    const { service } = build({ proposal: proposal({ observation: 'Une femme décideuse refuse.' }) })
    await expect(service.decide(WS, USER, PROPOSAL_ID, 'rejected')).resolves.toBeDefined()
  })

  it('une proposition d’un autre espace est introuvable', async () => {
    const { service } = build({ proposal: null })
    await expect(service.decide(WS, USER, PROPOSAL_ID, 'adopted')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('WorkspaceMethodRulesService — activation et rollback (#3295)', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    id: 'rule-1',
    workspace_id: WS,
    proposal_id: PROPOSAL_ID,
    domain: 'Compte',
    statement: 'Sans sponsor, la perte suit.',
    owner: USER,
    enabled: false,
    disabled_reason: WORKSPACE_RULE_PENDING_REVIEW,
    activated_by: null,
    activated_at: null,
    promoted_at: new Date('2026-10-02T09:00:00Z'),
    ...over,
  })

  it('activer pose son auteur et efface la raison', async () => {
    const { service } = build({ rule: stored() })
    const rule = await service.setActivation(WS, 'user-2', 'rule-1', { enabled: true })

    expect(rule).toMatchObject({ enabled: true, disabled_reason: null, activated_by: 'user-2' })
    expect(rule.activated_at).not.toBeNull()
  })

  it('désactiver (rollback) garde sa raison — la règle reste nommée, jamais effacée', async () => {
    const { service } = build({ rule: stored({ enabled: true, disabled_reason: null }) })
    const rule = await service.setActivation(WS, 'user-2', 'rule-1', { enabled: false, reason: 'Biais constaté' })

    expect(rule).toMatchObject({ enabled: false, disabled_reason: 'Biais constaté' })
  })

  it('désactiver sans raison est refusé', async () => {
    const { service } = build({ rule: stored({ enabled: true, disabled_reason: null }) })
    await expect(service.setActivation(WS, 'user-2', 'rule-1', { enabled: false })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('une règle d’un autre espace est introuvable', async () => {
    const { service } = build({ rule: null })
    await expect(service.setActivation(WS, 'user-2', 'rule-1', { enabled: true })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('Laura ne lit QUE les règles actives de l’espace', async () => {
    const { service, rules } = build({ rules: [stored({ enabled: true, disabled_reason: null })] })
    const active = await service.enabledForWorkspace(WS)

    expect(rules.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: WS, enabled: true } }))
    expect(active).toHaveLength(1)
  })
})

describe('WorkspaceMethodRulesService.outcomes — la mesure par règle apprise (#3295)', () => {
  const RULE = '0b9f3a52-6c1e-4c53-9b7e-2f4f1f0a9d11'
  function withItems(rows: unknown[]) {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    }
    const { rules, proposals, capitalisation } = build()
    const items = { createQueryBuilder: jest.fn(() => qb) }
    return {
      qb,
      service: new WorkspaceMethodRulesService(
        rules as never,
        proposals as never,
        capitalisation as never,
        items as never,
      ),
    }
  }

  it('compte les actions posées sous la règle, bornées à l’espace par le compte', async () => {
    const { service, qb } = withItems([
      { method_rule: `learned:${RULE}`, outcome: 'meeting_booked', execution_status: 'done' },
      { method_rule: `learned:${RULE}`, outcome: null, execution_status: 'pending' },
    ])
    const result = await service.outcomes(WS)
    expect(result).toEqual([
      { rule_id: RULE, followed: 2, positive: 1, negative: 0, inconclusive: 0, open: 1, contradicted: false },
    ])
    expect(qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: WS })
  })

  it('une règle jamais suivie ne fait AUCUNE ligne', async () => {
    const { service } = withItems([])
    expect(await service.outcomes(WS)).toEqual([])
  })
})

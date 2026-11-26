import { NotFoundException } from '@nestjs/common'
import type { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRulesService } from './automation-rules.service'

const NOW = new Date('2026-10-14T08:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() - offset * 86_400_000)

const row = (overrides: Partial<AutomationRuleEntity> = {}): AutomationRuleEntity =>
  ({
    id: 'r1',
    workspace_id: 'w1',
    user_id: 'u1',
    signal: 'tender',
    action_kind: 'enroll_sequence',
    playbook_key: 'tender',
    prepared_action: null,
    inactive_days: null,
    enabled: true,
    credit_cap: null,
    template_key: null,
    last_run_at: day(1),
    created_at: day(20),
    draft: null,
    draft_tested_at: null,
    draft_compared_at: null,
    ...overrides,
  }) as AutomationRuleEntity

function build(rules: AutomationRuleEntity[], firings: object[] = []) {
  const store = [...rules]
  const rulesRepo = {
    find: jest.fn().mockImplementation(async () => store),
    findOne: jest
      .fn()
      .mockImplementation(async ({ where }: { where: { id?: string } }) =>
        where.id ? (store.find(r => r.id === where.id) ?? null) : (store[0] ?? null),
      ),
    create: jest.fn().mockImplementation((value: object) => ({ id: 'new', created_at: NOW, ...value })),
    save: jest.fn().mockImplementation(async (value: AutomationRuleEntity) => {
      if (!store.find(r => r.id === value.id)) store.push(value)
      return value
    }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const firingsRepo = { find: jest.fn().mockResolvedValue(firings) }
  return { service: new AutomationRulesService(rulesRepo as never, firingsRepo as never), rulesRepo, firingsRepo }
}

describe('AutomationRulesService', () => {
  it('compte les déclenchements des 30 jours : inscrit ou préparé seulement, jamais ce qui a été écarté', async () => {
    const { service } = build(
      [row()],
      [
        { rule_id: 'r1', outcome: 'enrolled', fired_at: day(2), credits_spent: 0 },
        { rule_id: 'r1', outcome: 'prepared', fired_at: day(3), credits_spent: 0 },
        { rule_id: 'r1', outcome: 'excluded', fired_at: day(3), credits_spent: 0 },
        { rule_id: 'r1', outcome: 'failed', fired_at: day(3), credits_spent: 0 },
      ],
    )
    const [view] = await service.list('w1', 'u1', NOW)
    expect(view?.firings_30d).toBe(2)
    expect(view?.skipped_30d).toBe(2)
  })

  it('une règle qui n’a jamais tourné est « non mesurée » : null, jamais 0', async () => {
    const { service } = build([row({ last_run_at: null })])
    const [view] = await service.list('w1', 'u1', NOW)
    expect(view).toMatchObject({ firings_30d: null, skipped_30d: null, credits_spent_30d: null, last_run_at: null })
  })

  it('une règle qui a tourné sans rien déclencher dit 0 : c’est une mesure', async () => {
    const { service } = build([row()], [])
    const [view] = await service.list('w1', 'u1', NOW)
    expect(view?.firings_30d).toBe(0)
  })

  it('annonce le coût par préparation tiré de la grille de crédits, et le plafond de la règle', async () => {
    const { service } = build([row({ credit_cap: 40 })])
    const [view] = await service.list('w1', 'u1', NOW)
    expect(view).toMatchObject({ credit_cap: 40, credit_cost: expect.any(Number) })
  })

  it('une règle naît ÉTEINTE, et une règle identique n’est pas dupliquée', async () => {
    const created = build([])
    created.rulesRepo.findOne.mockResolvedValueOnce(null)
    const view = await created.service.create('w1', 'u1', {
      signal: 'tender',
      action_kind: 'enroll_sequence',
      playbook_key: 'tender',
    })
    expect(created.rulesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, workspace_id: 'w1', user_id: 'u1' }),
    )
    expect(view.enabled).toBe(false)

    const same = build([row()])
    await same.service.create('w1', 'u1', { signal: 'tender', action_kind: 'enroll_sequence', playbook_key: 'tender' })
    expect(same.rulesRepo.save).not.toHaveBeenCalled()
  })

  it('allume / éteint et plafonne, borné par espace ET par personne', async () => {
    const { service, rulesRepo } = build([row({ enabled: false })])
    const view = await service.update('w1', 'u1', 'r1', { enabled: true, credit_cap: 10 })
    expect(rulesRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r1', workspace_id: 'w1', user_id: 'u1' } })
    expect(view).toMatchObject({ enabled: true, credit_cap: 10 })
  })

  describe('#2399.6 — une règle ACTIVE ne change jamais en silence', () => {
    it('NON : changer le plafond d’une règle active écrit un BROUILLON, la règle servie ne bouge pas', async () => {
      const { service, rulesRepo } = build([row({ enabled: true, credit_cap: 40, name: 'Appel d’offres' })])
      const view = await service.update('w1', 'u1', 'r1', { credit_cap: 10 })
      const saved = rulesRepo.save.mock.calls[0]?.[0] as AutomationRuleEntity
      expect(saved.credit_cap).toBe(40)
      expect(saved.enabled).toBe(true)
      expect(saved.draft).toMatchObject({ signal: 'tender', action_kind: 'enroll_sequence', credit_cap: 10 })
      expect(saved.draft_tested_at).toBeNull()
      expect(saved.draft_compared_at).toBeNull()
      expect(view).toMatchObject({ credit_cap: 40, draft: { credit_cap: 10, tested: false } })
    })

    it('un brouillon déjà en attente garde sa phrase : seul son plafond change, et il est à re-tester', async () => {
      const draft = {
        name: 'v2',
        signal: 'tender' as const,
        action_kind: 'enroll_sequence' as const,
        playbook_key: 'tender' as const,
        credit_cap: 40,
      }
      const { service, rulesRepo } = build([
        row({ enabled: true, credit_cap: 40, draft, draft_tested_at: NOW, draft_compared_at: NOW }),
      ])
      await service.update('w1', 'u1', 'r1', { credit_cap: 10 })
      const saved = rulesRepo.save.mock.calls[0]?.[0] as AutomationRuleEntity
      expect(saved.draft).toEqual({ ...draft, credit_cap: 10 })
      expect(saved.draft_tested_at).toBeNull()
      expect(saved.draft_compared_at).toBeNull()
    })

    it('le même plafond ne crée aucun brouillon', async () => {
      const { service, rulesRepo } = build([row({ enabled: true, credit_cap: 40 })])
      await service.update('w1', 'u1', 'r1', { credit_cap: 40 })
      expect((rulesRepo.save.mock.calls[0]?.[0] as AutomationRuleEntity).draft).toBeNull()
    })

    it('éteindre une règle active reste immédiat : l’interrupteur est le geste, et plafonner en même temps ne tourne plus', async () => {
      const { service } = build([row({ enabled: true, credit_cap: 40 })])
      const view = await service.update('w1', 'u1', 'r1', { enabled: false, credit_cap: 10 })
      expect(view).toMatchObject({ enabled: false, credit_cap: 10, draft: null })
    })

    it('une règle ÉTEINTE se règle en direct : rien ne tourne, il n’y a rien à protéger', async () => {
      const { service } = build([row({ enabled: false, credit_cap: 40 })])
      const view = await service.update('w1', 'u1', 'r1', { credit_cap: 10 })
      expect(view).toMatchObject({ enabled: false, credit_cap: 10, draft: null })
    })
  })

  it('une règle d’un autre espace ou d’une autre personne est introuvable (404), jamais révélée', async () => {
    const { service, rulesRepo } = build([])
    rulesRepo.findOne.mockResolvedValue(null)
    await expect(service.update('w2', 'u2', 'r1', { enabled: true })).rejects.toBeInstanceOf(NotFoundException)
    rulesRepo.delete.mockResolvedValue({ affected: 0 })
    await expect(service.remove('w2', 'u2', 'r1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

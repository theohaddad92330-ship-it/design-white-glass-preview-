import type { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRunnerService } from './automation-runner.service'
import type { AutomationActionsPort } from './automation-ports'

/**
 * Lot L-D1 (#4167) — la préparation du matin : ce qu'elle inscrit, ce qu'elle écarte, ce qu'elle consigne.
 */

const NOW = new Date('2026-10-14T06:00:00Z')

const rule = (overrides: Partial<AutomationRuleEntity> = {}): AutomationRuleEntity =>
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
    last_run_at: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }) as AutomationRuleEntity

const candidate = (id: string) => ({
  signalRef: `trigger:${id}`,
  accountId: `a${id}`,
  contactId: `c${id}`,
  evidence: `Signal ${id}`,
  occurredAt: new Date('2026-10-13T08:00:00Z'),
})

function build(
  opts: {
    candidates?: ReturnType<typeof candidate>[]
    readable?: boolean
    member?: boolean
    exclusions?: Map<string, { code: string; forceable: boolean }[]>
    actions?: Partial<AutomationActionsPort>
    existing?: unknown[]
    demo?: string[]
    rules?: AutomationRuleEntity[]
  } = {},
) {
  const candidates = opts.candidates ?? [candidate('1')]
  const saved: Record<string, unknown>[] = []
  const rules = {
    find: jest.fn().mockResolvedValue(opts.rules ?? [rule()]),
    update: jest.fn().mockResolvedValue(undefined),
    manager: { query: jest.fn().mockResolvedValue((opts.demo ?? []).map(id => ({ id }))) },
  }
  const firings = {
    find: jest
      .fn()
      .mockImplementation(async (arg: { where: { signal_ref?: unknown } }) =>
        arg.where.signal_ref ? (opts.existing ?? []) : [],
      ),
    create: jest.fn().mockImplementation((value: object) => ({ ...value })),
    save: jest.fn().mockImplementation(async (row: Record<string, unknown>) => {
      saved.push(row)
      return row
    }),
  }
  const members = { findOne: jest.fn().mockResolvedValue(opts.member === false ? null : { role: 'member' }) }
  const reader = { read: jest.fn().mockResolvedValue({ readable: opts.readable ?? true, candidates }) }
  const actions: AutomationActionsPort = {
    eligibility: jest
      .fn()
      .mockImplementation(
        async ({ contactIds }: { contactIds: string[] }) => opts.exclusions ?? new Map(contactIds.map(id => [id, []])),
      ),
    enroll: jest.fn().mockResolvedValue({ sequenceId: 's1', messageIds: ['m1'] }),
    prepareEmail: jest.fn().mockResolvedValue({ messageId: 'm2' }),
    prepareCall: jest.fn().mockResolvedValue({ callTaskId: 'k1' }),
    ...opts.actions,
  } as AutomationActionsPort
  const service = new AutomationRunnerService(
    rules as never,
    firings as never,
    members as never,
    reader as never,
    actions,
  )
  return { service, rules, firings, actions, saved }
}

describe('AutomationRunnerService', () => {
  it('inscrit le contact du signal, consigne « enrolled » avec la séquence, et date le passage', async () => {
    const { service, actions, saved, rules } = build()
    const result = await service.runRule(rule(), NOW)
    expect(result).toEqual({ ran: true, acted: 1 })
    expect(actions.enroll).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'c1',
        playbook: 'tender',
        signal: 'tender',
        evidence: 'Signal 1',
        workspaceId: 'w1',
      }),
    )
    expect(saved[0]).toMatchObject({
      rule_id: 'r1',
      signal_ref: 'trigger:1',
      outcome: 'enrolled',
      sequence_id: 's1',
      message_id: 'm1',
    })
    expect(rules.update).toHaveBeenCalledWith({ id: 'r1' }, { last_run_at: NOW })
  })

  it('SAIT DIRE NON — un contact exclu n’est pas inscrit, l’exclusion est consignée par son nom', async () => {
    const { service, actions, saved } = build({
      exclusions: new Map([['c1', [{ code: 'recently_contacted', forceable: true }]]]),
    })
    const result = await service.runRule(rule(), NOW)
    expect(result.acted).toBe(0)
    expect(actions.enroll).not.toHaveBeenCalled()
    expect(saved[0]).toMatchObject({ outcome: 'excluded', reason: 'recently_contacted' })
  })

  it('un signal déjà traité ne se rejoue pas (journal unique par signal)', async () => {
    const { service, actions } = build({ existing: [{ signal_ref: 'trigger:1', outcome: 'enrolled' }] })
    await service.runRule(rule(), NOW)
    expect(actions.enroll).not.toHaveBeenCalled()
  })

  it('un signal repoussé par le plafond (cap_reached) est repris, et son ancienne ligne mise à jour', async () => {
    const old = { signal_ref: 'trigger:1', outcome: 'cap_reached', credits_spent: 0 }
    const { service, actions, saved } = build({ existing: [old] })
    await service.runRule(rule(), NOW)
    expect(actions.enroll).toHaveBeenCalledTimes(1)
    expect(saved[0]).toBe(old)
    expect(old).toMatchObject({ outcome: 'enrolled' })
  })

  it('source illisible : la règle n’a PAS tourné — rien n’est consigné, last_run_at ne bouge pas', async () => {
    const { service, saved, rules } = build({ readable: false })
    expect(await service.runRule(rule(), NOW)).toEqual({ ran: false, acted: 0 })
    expect(saved).toEqual([])
    expect(rules.update).not.toHaveBeenCalled()
  })

  it('la personne a quitté l’espace : rien n’agit en son nom', async () => {
    const { service, actions } = build({ member: false })
    expect(await service.runRule(rule(), NOW)).toEqual({ ran: false, acted: 0 })
    expect(actions.enroll).not.toHaveBeenCalled()
  })

  it('l’échec d’un signal est consigné (« failed » + raison) sans empêcher les suivants', async () => {
    const enroll = jest
      .fn()
      .mockRejectedValueOnce(new Error('Cet espace demande une validation responsable.'))
      .mockResolvedValueOnce({ sequenceId: 's2', messageIds: [] })
    const { service, saved } = build({ candidates: [candidate('1'), candidate('2')], actions: { enroll } })
    const result = await service.runRule(rule(), NOW)
    expect(result.acted).toBe(1)
    expect(saved.map(row => row.outcome)).toEqual(['failed', 'enrolled'])
    expect(saved[0]).toMatchObject({ reason: 'Cet espace demande une validation responsable.' })
  })

  it('« préparer un e-mail » : consigne « prepared » ; si Laura ne rédige rien, « failed » — rien n’est inventé', async () => {
    const prepared = build()
    await prepared.service.runRule(
      rule({ action_kind: 'prepare_action', playbook_key: null, prepared_action: 'email_to_review' }),
      NOW,
    )
    expect(prepared.saved[0]).toMatchObject({ outcome: 'prepared', message_id: 'm2' })

    const empty = build({ actions: { prepareEmail: jest.fn().mockResolvedValue(null) } })
    await empty.service.runRule(
      rule({ action_kind: 'prepare_action', playbook_key: null, prepared_action: 'email_to_review' }),
      NOW,
    )
    expect(empty.saved[0]).toMatchObject({ outcome: 'failed' })
  })

  it('« préparer un appel » passe par la porte des appels', async () => {
    const { service, actions, saved } = build()
    await service.runRule(
      rule({ action_kind: 'prepare_action', playbook_key: null, prepared_action: 'call_to_make' }),
      NOW,
    )
    expect(actions.prepareCall).toHaveBeenCalledTimes(1)
    expect(saved[0]).toMatchObject({ outcome: 'prepared' })
  })

  it('runAll ne touche ni les règles éteintes (la requête ne les lit pas) ni les espaces de démonstration', async () => {
    const { service, rules, actions } = build({ demo: ['w1'] })
    expect(await service.runAll(NOW)).toEqual({ rules: 0, acted: 0 })
    expect(rules.find).toHaveBeenCalledWith({ where: { enabled: true } })
    expect(actions.enroll).not.toHaveBeenCalled()
  })

  it('runAll : l’échec d’une règle ne prive pas les autres de leur matin', async () => {
    const { service, actions, rules } = build({ rules: [rule({ id: 'r1' }), rule({ id: 'r2' })] })
    ;(actions.eligibility as jest.Mock).mockRejectedValueOnce(new Error('base indisponible'))
    const result = await service.runAll(NOW)
    expect(result).toEqual({ rules: 1, acted: 1 })
    expect(rules.update).toHaveBeenCalledWith({ id: 'r2' }, { last_run_at: NOW })
  })
})

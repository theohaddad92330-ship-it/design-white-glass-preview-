import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRuleEditorService } from './automation-rule-editor.service'

/**
 * Théo C automations-editeur.N2/N3/N4/R3 + automations-bibliotheque.N3 — l'éditeur d'une règle : un brouillon qui se
 * teste avant de devenir la version suivante, une copie qui naît éteinte, un archivage qui ne supprime rien, un journal
 * d'essais qui ne crée ni tâche ni message.
 */

const NOW = new Date('2026-10-22T08:00:00Z')

const row = (overrides: Partial<AutomationRuleEntity> = {}): AutomationRuleEntity =>
  ({
    id: 'r1',
    workspace_id: 'w1',
    user_id: 'u1',
    signal: 'mission_end',
    action_kind: 'prepare_action',
    playbook_key: null,
    prepared_action: 'call_to_make',
    inactive_days: null,
    enabled: true,
    credit_cap: null,
    template_key: null,
    last_run_at: null,
    name: 'Une fin de mission approche',
    version: 1,
    draft: null,
    draft_tested_at: null,
    draft_compared_at: null,
    version_history: [],
    archived_at: null,
    created_at: NOW,
    ...overrides,
  }) as AutomationRuleEntity

function build(initial: AutomationRuleEntity | null = row()) {
  const store = initial ? [initial] : []
  const rules = {
    findOne: jest.fn().mockImplementation(async () => store[0] ?? null),
    save: jest.fn().mockImplementation(async (value: AutomationRuleEntity) => {
      if (!store.includes(value)) store.push(value)
      return value
    }),
    create: jest.fn().mockImplementation((value: object) => ({ id: 'copy', created_at: NOW, ...value })),
  }
  const trials = {
    save: jest.fn().mockImplementation(async (value: object) => ({ id: 't1', created_at: NOW, ...value })),
    create: jest.fn().mockImplementation((value: object) => value),
    find: jest.fn().mockResolvedValue([]),
  }
  const accounts = {
    find: jest.fn().mockResolvedValue([
      { id: 'a1', company_name: 'EDF' },
      { id: 'a2', company_name: 'Thales' },
    ]),
  }
  const view = jest.fn().mockImplementation(async (_w: string, _u: string, id: string) => ({ id }))
  const runner = {
    preview: jest.fn().mockResolvedValue({
      readable: true,
      candidates: [{ accountId: 'a1' }, { accountId: 'a2' }],
      plan: [{ type: 'act' }, { type: 'act' }],
    }),
  }
  const firings = { count: jest.fn().mockResolvedValue(3) }
  const service = new AutomationRuleEditorService(
    rules as never,
    trials as never,
    accounts as never,
    { viewOf: view } as never,
    runner as never,
    firings as never,
  )
  return { service, rules, trials, view, runner, store, firings }
}

const DRAFT = {
  name: 'Fin de mission (45 jours)',
  signal: 'mission_end' as const,
  action_kind: 'prepare_action' as const,
  prepared_action: 'email_to_review' as const,
}

describe('AutomationRuleEditorService', () => {
  it('enregistre le brouillon SANS toucher la règle qui tourne, et le remet à « non testé »', async () => {
    const { service, store } = build(row({ draft_tested_at: NOW }))
    await service.saveDraft('w1', 'u1', 'r1', DRAFT)
    const saved = store[0] as AutomationRuleEntity
    expect(saved.draft).toEqual(DRAFT)
    expect(saved.draft_tested_at).toBeNull()
    expect(saved).toMatchObject({ prepared_action: 'call_to_make', version: 1, enabled: true })
  })

  it('un essai du brouillon lit sans rien créer, consigne le journal et marque le brouillon testé', async () => {
    const { service, trials, store, runner } = build(row({ draft: DRAFT }))
    const trial = await service.runTrial('w1', 'u1', 'r1', NOW)
    expect(runner.preview).toHaveBeenCalledWith(expect.objectContaining({ prepared_action: 'email_to_review' }), NOW)
    expect(trials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'draft',
        outcome: 'ok',
        situations_read: 2,
        would_act: 2,
        situation_labels: ['EDF', 'Thales'],
        rule_name: 'Fin de mission (45 jours)',
      }),
    )
    expect(trial).toMatchObject({ outcome: 'ok', would_act: 2 })
    expect((store[0] as AutomationRuleEntity).draft_tested_at).toEqual(NOW)
  })

  it('un essai dont la source est illisible le NOMME, ne compte rien (null, jamais 0) et ne valide pas le brouillon', async () => {
    const { service, trials, runner, store } = build(row({ draft: DRAFT }))
    runner.preview.mockResolvedValue({ readable: false, candidates: [], plan: [] })
    await service.runTrial('w1', 'u1', 'r1', NOW)
    expect(trials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        situations_read: null,
        would_act: null,
        reason: expect.stringContaining('pas pu être lue'),
      }),
    )
    expect((store[0] as AutomationRuleEntity).draft_tested_at).toBeNull()
  })

  it('sans brouillon, l’essai éprouve la règle qui tourne', async () => {
    const { service, trials } = build()
    await service.runTrial('w1', 'u1', 'r1', NOW)
    expect(trials.save).toHaveBeenCalledWith(expect.objectContaining({ target: 'live' }))
  })

  it('activer un brouillon JAMAIS testé est refusé : « Teste le parcours pour pouvoir activer »', async () => {
    const { service } = build(row({ draft: DRAFT, draft_tested_at: null }))
    await expect(service.activateDraft('w1', 'u1', 'r1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('activer un brouillon testé en fait la version suivante et vide le brouillon', async () => {
    const { service, store } = build(row({ draft: DRAFT, draft_tested_at: NOW, draft_compared_at: NOW }))
    await service.activateDraft('w1', 'u1', 'r1', NOW)
    expect(store[0]).toMatchObject({
      version: 2,
      draft: null,
      draft_tested_at: null,
      draft_compared_at: null,
      name: 'Fin de mission (45 jours)',
      prepared_action: 'email_to_review',
      playbook_key: null,
    })
  })

  it('activer sans brouillon est refusé', async () => {
    const { service } = build()
    await expect(service.activateDraft('w1', 'u1', 'r1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('dupliquer crée une copie ÉTEINTE, en version 1, sans brouillon ni historique', async () => {
    const { service, rules } = build(row({ draft: DRAFT, version: 3, last_run_at: NOW }))
    await service.duplicate('w1', 'u1', 'r1')
    expect(rules.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        version: 1,
        draft: null,
        last_run_at: null,
        name: 'Une fin de mission approche (copie)',
        workspace_id: 'w1',
        user_id: 'u1',
      }),
    )
  })

  it('archiver éteint la règle et la retire de la liste — rien n’est supprimé', async () => {
    const { service, store } = build()
    await service.archive('w1', 'u1', 'r1', NOW)
    expect(store[0]).toMatchObject({ enabled: false, archived_at: NOW })
  })

  it('une règle d’un autre espace ou d’une autre personne est introuvable (404)', async () => {
    const { service, rules } = build()
    rules.findOne.mockResolvedValue(null)
    await expect(service.saveDraft('w2', 'u2', 'r1', DRAFT)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.runTrial('w2', 'u2', 'r1', NOW)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.archive('w2', 'u2', 'r1', NOW)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('le journal est borné par espace ET par personne, du plus récent au plus ancien', async () => {
    const { service, trials } = build()
    await service.listTrials('w1', 'u1')
    expect(trials.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'w1', user_id: 'u1' }, order: { created_at: 'DESC' } }),
    )
  })

  describe('#2399.6 / #2399.7 — la bascule montre AVANT, et garde l’ancienne version', () => {
    it('la comparaison nomme les deux versions, les différences, la migration et l’impact — sans rien écrire au journal', async () => {
      const { service, trials, runner } = build(row({ draft: DRAFT, draft_tested_at: NOW, version: 3 }))
      const preview = await service.switchPreview('w1', 'u1', 'r1', NOW)
      expect(preview).toMatchObject({
        rule_id: 'r1',
        from_version: 3,
        to_version: 4,
        differences: [
          { field: 'name', before: 'Une fin de mission approche', after: 'Fin de mission (45 jours)' },
          { field: 'prepared_action', before: 'call_to_make', after: 'email_to_review' },
        ],
        migration: { engaged_firings: 3, signal_changes: false },
        impact: { measured: true, situations_read: 2, would_act: 2 },
      })
      // lecture seule : le brouillon est lu par le même plan que le matin, jamais exécuté ni consigné
      expect(runner.preview).toHaveBeenCalledWith(expect.objectContaining({ prepared_action: 'email_to_review' }), NOW)
      expect(trials.save).not.toHaveBeenCalled()
    })

    it('une source illisible SE NOMME : impact non mesuré avec sa raison, jamais 0 — et la bascule reste possible', async () => {
      const { service, runner, store } = build(row({ draft: DRAFT, draft_tested_at: NOW }))
      runner.preview.mockResolvedValue({ readable: false, candidates: [], plan: [] })
      const preview = await service.switchPreview('w1', 'u1', 'r1', NOW)
      expect(preview.impact).toEqual({ measured: false, reason: expect.stringContaining('pas pu être lue') })
      expect(JSON.stringify(preview.impact)).not.toContain('"would_act":0')
      expect((store[0] as AutomationRuleEntity).draft_compared_at).toEqual(NOW)
    })

    it('une erreur de lecture se NOMME aussi : le service ne casse pas, il dit « non mesuré »', async () => {
      const { service, runner } = build(row({ draft: DRAFT, draft_tested_at: NOW }))
      runner.preview.mockRejectedValue(new Error('timeout'))
      const preview = await service.switchPreview('w1', 'u1', 'r1', NOW)
      expect(preview.impact.measured).toBe(false)
    })

    it('un changement de signal est DIT dans la migration', async () => {
      const { service } = build(row({ draft: { ...DRAFT, signal: 'tender' }, draft_tested_at: NOW }))
      const preview = await service.switchPreview('w1', 'u1', 'r1', NOW)
      expect(preview.migration.signal_changes).toBe(true)
    })

    it('sans brouillon, il n’y a rien à comparer (400)', async () => {
      const { service } = build()
      await expect(service.switchPreview('w1', 'u1', 'r1', NOW)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('la comparaison est bornée par espace ET personne (404 sinon)', async () => {
      const { service, rules } = build(row({ draft: DRAFT }))
      rules.findOne.mockResolvedValue(null)
      await expect(service.switchPreview('w2', 'u2', 'r1', NOW)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('NON : la bascule REFUSE de s’opérer si la comparaison n’a pas été rendue — et ne touche pas la règle', async () => {
      const { service, store } = build(row({ draft: DRAFT, draft_tested_at: NOW, draft_compared_at: null }))
      await expect(service.activateDraft('w1', 'u1', 'r1', NOW)).rejects.toThrow(/comparaison/)
      expect(store[0]).toMatchObject({ version: 1, prepared_action: 'call_to_make' })
    })

    it('rendre la comparaison puis basculer : c’est le geste explicite, dans cet ordre', async () => {
      const { service, store } = build(row({ draft: DRAFT, draft_tested_at: NOW }))
      await service.switchPreview('w1', 'u1', 'r1', NOW)
      await service.activateDraft('w1', 'u1', 'r1', NOW)
      expect(store[0]).toMatchObject({ version: 2, prepared_action: 'email_to_review' })
    })

    it('enregistrer un NOUVEAU brouillon efface la comparaison : on ne bascule pas sur ce qu’on n’a pas revu', async () => {
      const { service, store } = build(row({ draft: DRAFT, draft_tested_at: NOW, draft_compared_at: NOW }))
      await service.saveDraft('w1', 'u1', 'r1', { ...DRAFT, credit_cap: 5 })
      expect((store[0] as AutomationRuleEntity).draft_compared_at).toBeNull()
    })

    it('l’ancienne version est CONSERVÉE (comparable), pas écrasée par l’incrément', async () => {
      const { service, store } = build(
        row({
          draft: DRAFT,
          draft_tested_at: NOW,
          draft_compared_at: NOW,
          version: 2,
          version_history: [
            {
              version: 1,
              signal: 'mission_end',
              action_kind: 'prepare_action',
              replaced_at: '2026-10-01T00:00:00.000Z',
            },
          ],
        }),
      )
      await service.activateDraft('w1', 'u1', 'r1', NOW)
      const saved = store[0] as AutomationRuleEntity
      expect(saved.version).toBe(3)
      expect(saved.version_history).toHaveLength(2)
      expect(saved.version_history[0]).toMatchObject({ version: 1 })
      expect(saved.version_history[1]).toMatchObject({
        version: 2,
        name: 'Une fin de mission approche',
        prepared_action: 'call_to_make',
        replaced_at: NOW.toISOString(),
      })
    })
  })
})

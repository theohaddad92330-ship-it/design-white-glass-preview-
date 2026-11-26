import { IsNull } from 'typeorm'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MANUAL_ACTION_WEEK_INDEX } from '@bellum/contracts'
import { ActionPlanItemsService } from './action-plan-items.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { TaskEntity } from '../../database/entities/task.entity'
import type { WorkspaceMethodRuleEntity } from '../../database/entities/workspace-method-rule.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

type MockWorkspaceContext = {
  resolveActiveWorkspace: jest.Mock
  getMembership: jest.Mock
  extraPermissionsOf: jest.Mock
}

describe('ActionPlanItemsService', () => {
  let service: ActionPlanItemsService
  let items: MockRepository<ActionPlanItemEntity>
  let plans: MockRepository<ActionPlanEntity>
  let actions: MockRepository<UserActionEntity>
  // #2123.46 — lecture seule : la porte d'écriture du plan vérifie que le compte
  // visé est bien dans l'espace de la personne qui écrit.
  let accounts: MockRepository<AccountEntity>
  // #2123.46 — lecture seule : un contact visé n'est lié que s'il est du compte.
  let contacts: MockRepository<ContactEntity>
  let workspace: MockWorkspaceContext

  beforeEach(() => {
    items = createMockRepository<ActionPlanItemEntity>()
    plans = createMockRepository<ActionPlanEntity>()
    actions = createMockRepository<UserActionEntity>()
    accounts = createMockRepository<AccountEntity>()
    contacts = createMockRepository<ContactEntity>()
    // #4158.5 — la lecture d'un plan exige un compte DE L'ESPACE actif.
    accounts.findOne.mockResolvedValue({ id: 'acc-1', workspace_id: 'ws-1' } as AccountEntity)
    workspace = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      getMembership: jest
        .fn()
        .mockResolvedValue({ id: 'm-1', user_id: 'user-2', workspace_id: 'ws-1', role: 'member' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    }
    service = new ActionPlanItemsService(
      items as never,
      plans as never,
      actions as never,
      accounts as never,
      workspace as unknown as WorkspaceContextService,
      contacts as never,
    )
  })

  describe('listLastOutcomes — N comptes, deux requêtes', () => {
    const done = (id: string, account_id: string, completed: string, outcome: string | null) =>
      ({
        id,
        user_id: 'user-1',
        account_id,
        label: id,
        week_index: 0,
        step_index: 0,
        execution_status: 'done',
        outcome,
        completed_at: new Date(completed),
      }) as never

    it('lit les comptes et les lignes UNE fois, et rend la dernière issue de chaque compte', async () => {
      accounts.find.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] as AccountEntity[])
      items.find.mockResolvedValue([
        done('old', 'a1', '2026-10-01', 'positive'),
        done('new', 'a1', '2026-10-10', 'no_response'),
        done('b', 'a2', '2026-10-05', 'positive'),
        done('noissue', 'a3', '2026-10-06', null),
      ])

      const result = await service.listLastOutcomes('user-1', ['a1', 'a2', 'a3'])

      expect(accounts.find).toHaveBeenCalledTimes(1)
      expect(items.find).toHaveBeenCalledTimes(1)
      expect(result.map(row => row.id).sort()).toEqual(['b', 'new'])
    })

    it('ignore un compte hors de l’espace actif — rien ne fuit, la liste ne tombe pas', async () => {
      accounts.find.mockResolvedValue([])
      expect(await service.listLastOutcomes('user-1', ['elsewhere'])).toEqual([])
      expect(items.find).not.toHaveBeenCalled()
    })
  })

  // #2871 / #2395.1 — la LECTURE n'écrit plus RIEN : les étapes du plan sans
  // ligne sont rendues VIRTUELLES (id par position), matérialisées une à une
  // au premier geste (`update`).
  describe('listForAccount — étapes virtuelles, aucune écriture (#2395.1)', () => {
    it('rend une étape virtuelle par action du plan, sans jamais appeler save', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValueOnce({
        id: 'plan-1',
        weeks: [
          { name: 'S1', actions: [{ action: 'A1' }, { action: 'A2' }] },
          { name: 'S2', actions: [{ action: 'B1' }] },
        ],
      } as unknown as ActionPlanEntity)

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(items.save).not.toHaveBeenCalled()
      expect(result.map(row => [row.label, row.week_index, row.step_index])).toEqual([
        ['A1', 0, 0],
        ['A2', 0, 1],
        ['B1', 1, 0],
      ])
      expect(result[0]).toMatchObject({ id: 'plan:acc-1:0:0', account_id: 'acc-1', done: false })
    })

    it('#4804 — can_edit : vrai pour tout coéquipier de l’espace, quel que soit l’auteur ou le rôle', async () => {
      const row = (id: string, user_id: string, assigned_to: string | null, step_index: number) =>
        ({ id, user_id, assigned_to, account_id: 'acc-1', label: id, week_index: 0, step_index, done: false }) as never
      items.find.mockResolvedValue([row('mine', 'user-1', null, 0), row('theirs', 'user-2', 'user-3', 1)])
      plans.findOne.mockResolvedValueOnce(null)
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      const asSales = await service.listForAccount('user-1', 'acc-1')
      expect(asSales.map(r => [r.id, r.can_edit])).toEqual([
        ['mine', true],
        ['theirs', true],
      ])
    })

    it('une étape déjà écrite masque sa jumelle virtuelle — jamais de doublon', async () => {
      items.find.mockResolvedValue([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: true,
        } as ActionPlanItemEntity,
      ])
      plans.findOne.mockResolvedValueOnce({
        id: 'plan-1',
        weeks: [{ name: 'S1', actions: [{ action: 'A1' }, { action: 'A2' }] }],
      } as unknown as ActionPlanEntity)

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result.map(row => row.id)).toEqual(['i1', 'plan:acc-1:0:1'])
      expect(result[0]?.done).toBe(true)
    })

    it('ne rend PAS une action que le plan n’a pas su exprimer, et ne renumérote pas', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValueOnce({
        id: 'plan-1',
        weeks: [{ name: 'S1', actions: [{ action: 'A1' }, { kpi: 'sans libellé' }, { action: 'A3' }] }],
      } as unknown as ActionPlanEntity)

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result.map(row => row.label)).toEqual(['A1', 'A3'])
      // ⚠ La position N'EST PAS recalculée : le plateau web superpose l'état
      // par la clé (week_index, step_index).
      expect(result[1]).toMatchObject({ week_index: 0, step_index: 2 })
    })

    it('#2395.4/#2395.9 — porte channel et expected_outcome du plan', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValueOnce({
        id: 'plan-1',
        weeks: [
          {
            name: 'S1',
            actions: [
              { action: 'Appeler le DSI', channel: 'phone', expectedOutcome: 'Échange de 15 minutes obtenu.' },
              { action: 'Publier un cas client', channel: 'content' },
            ],
          },
        ],
      } as unknown as ActionPlanEntity)

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]).toMatchObject({ channel: 'phone', expected_outcome: 'Échange de 15 minutes obtenu.' })
      // « content » n'a pas d'équivalent canonique : jamais un canal deviné.
      expect(result[1]).toMatchObject({ channel: null, expected_outcome: null })
    })

    it('#3274.4 — chaque action du plan de Laura porte la règle méthode qu’elle applique', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValueOnce({
        id: 'plan-1',
        weeks: [{ name: 'S1', actions: [{ action: 'Appeler le DSI' }, { action: 'Écrire au CFO' }] }],
      } as unknown as ActionPlanEntity)

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result.map(r => r.method_rule)).toEqual(['plan_de_compte_hebdomadaire', 'plan_de_compte_hebdomadaire'])
    })

    // #4158.5 — le plan d'un compte se lit par ESPACE, plus par `user_id` seul.
    it('#4158.5 — lit les lignes ET le plan par compte/espace, jamais par user_id seul', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValueOnce(null)
      await service.listForAccount('collegue', 'acc-1')
      expect(items.find.mock.calls[0][0].where).not.toHaveProperty('user_id')
      expect(items.find.mock.calls[0][0].where).toMatchObject({ account_id: 'acc-1' })
      expect(plans.findOne.mock.calls[0][0].where).toEqual({ account_id: 'acc-1', workspace_id: 'ws-1' })
    })

    it('#4158.5 — un collègue voit la ligne cochée par l’autre membre (état réel du plan)', async () => {
      items.find.mockResolvedValue([
        { id: 'i1', user_id: 'alice', account_id: 'acc-1', week_index: 0, step_index: 0, label: 'A1', done: true },
      ] as ActionPlanItemEntity[])
      plans.findOne.mockResolvedValueOnce({
        id: 'plan-1',
        weeks: [{ name: 'S1', actions: [{ action: 'A1' }, { action: 'A2' }] }],
      } as unknown as ActionPlanEntity)
      const rows = await service.listForAccount('bob', 'acc-1')
      expect(rows.map(r => [r.label, r.done])).toEqual([
        ['A1', true],
        ['A2', false],
      ])
    })

    it('#4158.5 — deux lignes pour la même étape : une seule, la mienne d’abord', async () => {
      items.find.mockResolvedValue([
        { id: 'i1', user_id: 'alice', account_id: 'acc-1', week_index: 0, step_index: 0, label: 'A1', done: true },
        { id: 'i2', user_id: 'bob', account_id: 'acc-1', week_index: 0, step_index: 0, label: 'A1', done: false },
      ] as ActionPlanItemEntity[])
      plans.findOne.mockResolvedValueOnce(null)
      const rows = await service.listForAccount('bob', 'acc-1')
      expect(rows.map(r => r.id)).toEqual(['i2'])
    })

    it('#4158.5 — un compte d’un AUTRE espace : 404, aucune ligne lue', async () => {
      accounts.findOne.mockResolvedValue(null)
      await expect(service.listForAccount('intrus', 'acc-1')).rejects.toBeInstanceOf(NotFoundException)
      expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 'acc-1', workspace_id: 'ws-1' } })
      expect(items.find).not.toHaveBeenCalled()
    })

    it('rend une liste vide sans plan, sans rien écrire', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValueOnce(null)

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(items.save).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('update — écriture par POSITION d’une étape virtuelle (#2395.1)', () => {
    const plan = {
      id: 'plan-1',
      created_at: new Date('2026-09-01T00:00:00Z'),
      weeks: [{ name: 'S1', actions: [{ action: 'A1', channel: 'phone' }, { action: 'A2' }] }],
    } as unknown as ActionPlanEntity

    it('matérialise UNE seule ligne (l’étape touchée) puis applique le geste', async () => {
      items.findOne.mockResolvedValue(null)
      plans.findOne.mockResolvedValueOnce(plan)

      const result = await service.update('user-1', 'plan:acc-1:0:1', { due_date: '2026-10-01' })

      expect(items.save).toHaveBeenCalledTimes(1)
      const written = items.save.mock.calls[0][0] as Partial<ActionPlanItemEntity>
      expect(written).toMatchObject({
        user_id: 'user-1',
        account_id: 'acc-1',
        source_plan_id: 'plan-1',
        label: 'A2',
        week_index: 0,
        step_index: 1,
        due_date: '2026-10-01',
      })
      expect(result.label).toBe('A2')
    })

    it('une étape déjà écrite entre-temps (geste concurrent) est reprise, jamais dupliquée', async () => {
      const already = {
        id: 'real-1',
        user_id: 'user-1',
        account_id: 'acc-1',
        week_index: 0,
        step_index: 0,
        label: 'A1',
      }
      items.findOne.mockResolvedValue(already as unknown as ActionPlanItemEntity)

      await service.update('user-1', 'plan:acc-1:0:0', { due_date: '2026-10-02' })

      expect(plans.findOne).not.toHaveBeenCalled()
      expect(items.save).toHaveBeenCalledTimes(1)
      expect(items.save.mock.calls[0][0]).toMatchObject({ id: 'real-1', due_date: '2026-10-02' })
    })

    it('#4804 — reprend l’étape écrite par un COÉQUIPIER du même espace (clé sans user_id)', async () => {
      const byColleague = { id: 'real-2', user_id: 'user-2', account_id: 'acc-1', week_index: 0, step_index: 0 }
      items.findOne.mockResolvedValue(byColleague as unknown as ActionPlanItemEntity)

      await service.update('user-1', 'plan:acc-1:0:0', { due_date: '2026-10-02' })

      expect(items.findOne).toHaveBeenCalledWith({ where: { account_id: 'acc-1', week_index: 0, step_index: 0 } })
      expect(accounts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { id: 'acc-1', workspace_id: 'ws-1' },
            { id: 'acc-1', workspace_id: IsNull(), user_id: 'user-1' },
          ],
        }),
      )
      expect(items.save.mock.calls[0][0]).toMatchObject({ id: 'real-2' })
    })

    it('#4804 — contrôle négatif : compte d’un AUTRE espace → 404, la ligne n’est jamais lue', async () => {
      accounts.findOne.mockResolvedValue(null)
      items.findOne.mockResolvedValue({ id: 'real-2', user_id: 'user-2' } as unknown as ActionPlanItemEntity)

      await expect(service.update('user-9', 'plan:acc-1:0:0', { due_date: '2026-10-02' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(items.save).not.toHaveBeenCalled()
    })

    it('une position que le plan ne porte pas → 404, rien n’est inventé', async () => {
      items.findOne.mockResolvedValue(null)
      plans.findOne.mockResolvedValueOnce(plan)

      await expect(service.update('user-1', 'plan:acc-1:5:9', { due_date: '2026-10-01' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(items.save).not.toHaveBeenCalled()
    })

    it('un identifiant virtuel mal formé → 404', async () => {
      await expect(service.update('user-1', 'plan:acc-1:x:y', { done: true })).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  /**
   * #2715.1 (corrigé 23/09 — revue du coordinateur) — le plan affiche le
   * statut d'envoi de l'action correspondante, lu sur `user_actions`. DEUX
   * valeurs, jamais fondues sous un `success` unique : `email_sent` (e-mail
   * VÉRIFIÉ, `message_sent` + `via: 'bellum'`) et `declared` (un geste
   * déclaratif — LinkedIn, un appel renseigné, ou un `message_sent`
   * historique sans `via` connu). La vérifiée gagne quand les deux coexistent
   * pour la même cible. Rattachée à l'ACTION précise quand la ligne
   * d'engagement porte `metadata.plan_action_id` ; sinon au CONTACT (repli —
   * aucun chemin d'écriture actuel ne pose cette métadonnée, voir
   * `withSendStatus`).
   */
  describe('listForAccount — send_status (#2715.1)', () => {
    it('marque `email_sent` pour un e-mail VÉRIFIÉ (`message_sent` + `via: bellum`)', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        { contact_id: 'c-1', action_type: 'message_sent', metadata: { via: 'bellum' } } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]?.send_status).toBe('email_sent')
    })

    it('marque `declared` pour un LinkedIn DÉCLARÉ (`plan_action_message_sent`) — jamais `email_sent`', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        {
          contact_id: 'c-1',
          action_type: 'plan_action_message_sent',
          metadata: { via: 'declaration' },
        } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]?.send_status).toBe('declared')
    })

    it('marque `declared` pour un appel renseigné (`plan_action_call_logged`)', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        { contact_id: 'c-1', action_type: 'plan_action_call_logged', metadata: {} } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]?.send_status).toBe('declared')
    })

    it('un `message_sent` historique SANS `via` reste `declared` — dans le doute, jamais vérifié', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        { contact_id: 'c-1', action_type: 'message_sent', metadata: {} } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]?.send_status).toBe('declared')
    })

    it('la VÉRIFIÉE gagne quand un contact porte à la fois un e-mail vérifié et une déclaration', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        {
          contact_id: 'c-1',
          action_type: 'plan_action_message_sent',
          metadata: { via: 'declaration' },
        } as unknown as UserActionEntity,
        { contact_id: 'c-1', action_type: 'message_sent', metadata: { via: 'bellum' } } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]?.send_status).toBe('email_sent')
    })

    it('reste `null` sans envoi enregistré pour ce contact', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result[0]?.send_status).toBeNull()
    })

    it('ne requête pas `user_actions` quand aucune ligne ne vise un contact', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'A1',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: null,
        } as ActionPlanItemEntity,
      ])

      await service.listForAccount('user-1', 'acc-1')

      expect(actions.find).not.toHaveBeenCalled()
    })

    /**
     * #2715.1 (corrigé 23/09) — RATTACHEMENT À L'ITEM : quand la ligne
     * d'engagement porte `metadata.plan_action_id`, le statut se pose sur
     * CETTE action précise, jamais sur toutes les actions du contact — deux
     * actions pour le même contact (un e-mail, un appel) ne doivent pas
     * partager le même badge quand on sait laquelle des deux a été traitée.
     */
    it('rattache le statut à L’ITEM précis quand la ligne porte `metadata.plan_action_id`', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'Relancer par e-mail',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
        {
          id: 'i2',
          account_id: 'acc-1',
          label: 'Relancer par téléphone',
          week_index: 0,
          step_index: 1,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        {
          contact_id: 'c-1',
          action_type: 'plan_action_message_sent',
          metadata: { via: 'declaration', plan_action_id: 'i1' },
        } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result.find(row => row.id === 'i1')?.send_status).toBe('declared')
      // Témoin — sans lien vers i2, i2 ne porte RIEN : le statut ne fuit pas
      // vers les autres actions du même contact dès qu'un lien précis existe.
      expect(result.find(row => row.id === 'i2')?.send_status).toBeNull()
    })

    it('témoin — SANS `plan_action_id`, le repli au contact s’applique à TOUTES ses actions (comportement actuel, aucun chemin d’écriture ne pose la métadonnée)', async () => {
      items.find.mockResolvedValueOnce([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'Relancer par e-mail',
          week_index: 0,
          step_index: 0,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
        {
          id: 'i2',
          account_id: 'acc-1',
          label: 'Relancer par téléphone',
          week_index: 0,
          step_index: 1,
          done: false,
          contact_id: 'c-1',
        } as ActionPlanItemEntity,
      ])
      actions.find.mockResolvedValueOnce([
        {
          contact_id: 'c-1',
          action_type: 'plan_action_message_sent',
          metadata: { via: 'declaration' },
        } as unknown as UserActionEntity,
      ])

      const result = await service.listForAccount('user-1', 'acc-1')

      expect(result.find(row => row.id === 'i1')?.send_status).toBe('declared')
      expect(result.find(row => row.id === 'i2')?.send_status).toBe('declared')
    })
  })

  describe('update — legacy done / due_date', () => {
    const baseItem = () =>
      ({
        id: 'i1',
        user_id: 'user-1',
        account_id: 'acc-1',
        label: 'A1',
        week_index: 0,
        step_index: 0,
        done: false,
        execution_status: 'todo',
        snoozed_until: null,
        assigned_to: null,
        due_date: null,
        completed_at: null,
        last_reminded_on: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }) as ActionPlanItemEntity

    it('persists done=true, stamps completed_at and mirrors execution_status', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { done: true, outcome: 'positive' })

      expect(result.done).toBe(true)
      expect(result.execution_status).toBe('done')
      expect(result.completed_at).not.toBeNull()
      const saved = items.save.mock.calls[0][0] as ActionPlanItemEntity
      expect(saved.completed_at).toBeInstanceOf(Date)
      // #2396.13 — le drapeau historique `done` EST un changement de cycle de
      // vie (il fait exactement ce que ferait `execution_status: 'done'') : il
      // résout l'espace et écrit le MÊME événement d'audit, ou une action se
      // marquait faite sans laisser de trace dans `user_actions`.
      expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      const feed = actions.save.mock.calls[0][0] as Array<Partial<UserActionEntity>>
      expect(feed).toHaveLength(1)
      expect(feed[0]).toMatchObject({
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'acc-1',
        action_type: 'plan_action_completed',
      })
    })

    it('clears completed_at when done flips back to false', async () => {
      const done = {
        ...baseItem(),
        done: true,
        execution_status: 'done',
        completed_at: new Date(),
      } as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(done)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { done: false })

      expect(result.done).toBe(false)
      expect(result.execution_status).toBe('todo')
      expect(result.completed_at).toBeNull()
      // #2396.13 — symétrique : décocher audite aussi (`plan_action_uncompleted`),
      // même chemin que `execution_status: 'todo'`.
      const feed = actions.save.mock.calls[0][0] as Array<Partial<UserActionEntity>>
      expect(feed[0]?.action_type).toBe('plan_action_uncompleted')
    })

    it('persists a due_date', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { due_date: '2026-08-01' })

      expect(result.due_date).toBe('2026-08-01')
    })

    /**
     * #2153.57 — le RÉSULTAT, distinct de `expected_outcome`/`kpi` (l'ATTENDU,
     * avant le geste). Purement DÉCLARATIF, comme « Fait » lui-même
     * (`c73_fait_ne_porte_pas_preuve_denvoi`, doctrine.md:41) : une phrase que le
     * commercial tape, jamais une preuve d'exécution vérifiée.
     */
    it('persists a result note, détouré (trim)', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { result: '  Le DSI a validé le budget  ' })

      expect(result.result).toBe('Le DSI a validé le budget')
    })

    it('efface le résultat sur une chaîne blanche — jamais une phrase vide', async () => {
      items.findOne.mockResolvedValueOnce({ ...baseItem(), result: 'Ancien résultat' } as ActionPlanItemEntity)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { result: '   ' })

      expect(result.result).toBeNull()
    })

    it("scopes by ownership — l'item d'un tiers, ni créé ni délégué, n'est pas trouvé", async () => {
      items.findOne.mockResolvedValueOnce(null)

      await expect(service.update('user-2', 'i1', { done: true })).rejects.toBeInstanceOf(NotFoundException)
      // #1285 : la portée d'écriture est celle de la lecture — créateur OU
      // délégataire. Elle ne lisait que `user_id`.
      expect(items.findOne).toHaveBeenCalledWith({
        where: [
          { id: 'i1', user_id: 'user-2' },
          { id: 'i1', assigned_to: 'user-2' },
        ],
      })
      expect(items.save).not.toHaveBeenCalled()
    })

    it("le délégataire peut clore l'action qu'on lui a assignée (#1285)", async () => {
      // Créée par un collègue, déléguée à moi : elle s'affiche dans « Mes
      // relances à faire » (`listPersonalRelances` la retourne), donc elle doit
      // pouvoir s'y fermer. Elle répondait 404.
      items.findOne.mockResolvedValueOnce({
        ...baseItem(),
        user_id: 'user-9',
        assigned_to: 'user-1',
      } as ActionPlanItemEntity)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { done: true, outcome: 'positive' })

      expect(result.done).toBe(true)
      expect(result.execution_status).toBe('done')
    })
  })

  // #4158.48 — écrire sur la ligne d'action d'un collègue : son `assigned_to`, son
  // créateur, ou un détenteur de `team:manage` du MÊME espace. Autre membre : 403.
  // Autre espace : 404.
  describe('update — ligne d’un collègue (#4158.48)', () => {
    const colleagueItem = () =>
      ({
        id: 'i9',
        user_id: 'user-2',
        account_id: 'acc-1',
        label: 'Relancer',
        week_index: 0,
        step_index: 0,
        done: false,
        execution_status: 'todo',
        snoozed_until: null,
        assigned_to: 'user-3',
        due_date: null,
        completed_at: null,
        last_reminded_on: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }) as ActionPlanItemEntity

    it('#4804 — un membre ordinaire du même espace peut écrire sur l’action d’un coéquipier', async () => {
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      items.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(colleagueItem())
      await service.update('user-1', 'i9', { due_date: '2026-12-01' })
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'i9', due_date: '2026-12-01' }))
    })

    it('404 quand la ligne appartient à un AUTRE espace, même pour un owner', async () => {
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' })
      items.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(colleagueItem())
      accounts.findOne.mockResolvedValue({ id: 'acc-1', workspace_id: 'ws-OTHER' } as AccountEntity)
      await expect(service.update('user-1', 'i9', { due_date: '2026-12-01' })).rejects.toThrow(NotFoundException)
      expect(items.save).not.toHaveBeenCalled()
    })

    it('404 quand la ligne n’existe pas', async () => {
      items.findOne.mockResolvedValue(null)
      await expect(service.update('user-1', 'i9', { due_date: '2026-12-01' })).rejects.toThrow(NotFoundException)
    })

    it('un détenteur de team:manage du même espace peut écrire (échéance)', async () => {
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales_ops' })
      items.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(colleagueItem())
      await service.update('user-1', 'i9', { due_date: '2026-12-01' })
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'i9', due_date: '2026-12-01' }))
    })

    it('une permission nominative team:manage suffit pour un rôle qui ne l’a pas', async () => {
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      workspace.extraPermissionsOf.mockResolvedValue(['team:manage'])
      items.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(colleagueItem())
      await service.update('user-1', 'i9', { due_date: '2026-12-01' })
      expect(items.save).toHaveBeenCalled()
    })
  })

  describe('update — executable lifecycle', () => {
    const baseItem = () =>
      ({
        id: 'i1',
        user_id: 'user-1',
        account_id: 'acc-1',
        label: 'A1',
        week_index: 0,
        step_index: 0,
        done: false,
        execution_status: 'todo',
        snoozed_until: null,
        assigned_to: null,
        due_date: null,
        completed_at: null,
        last_reminded_on: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }) as ActionPlanItemEntity

    // #3416.4 — l'issue d'une action met à jour le CONTACT et le board du COMPTE.
    describe('propagation de l’issue (#3416.4)', () => {
      const bus = { emit: jest.fn() }
      const withContact = () => ({ ...baseItem(), contact_id: 'c1' }) as ActionPlanItemEntity
      const build = () =>
        new ActionPlanItemsService(
          items as never,
          plans as never,
          actions as never,
          accounts as never,
          workspace as unknown as WorkspaceContextService,
          contacts as never,
          bus as never,
        )

      beforeEach(() => {
        bus.emit.mockReset()
        items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
      })

      it('« réponse positive » : le contact passe à replied ET le board du compte avance', async () => {
        items.findOne.mockResolvedValueOnce(withContact())
        contacts.findOne.mockResolvedValueOnce({ id: 'c1', user_status: 'contacted' })

        await build().update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

        expect(contacts.update).toHaveBeenCalledWith({ id: 'c1' }, { user_status: 'replied' })
        expect(bus.emit).toHaveBeenCalledWith({
          workspaceId: 'ws-1',
          accountId: 'acc-1',
          event: 'positive_reply',
          sourceRef: 'i1',
        })
      })

      it('ne recule jamais : un contact déjà en rendez-vous n’est pas repassé à replied', async () => {
        items.findOne.mockResolvedValueOnce(withContact())
        contacts.findOne.mockResolvedValueOnce({ id: 'c1', user_status: 'meeting' })

        await build().update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

        expect(contacts.update).not.toHaveBeenCalled()
        expect(bus.emit).not.toHaveBeenCalled()
      })

      it('une issue sans équivalent (bloqué par achats) ne touche ni le contact ni le board', async () => {
        items.findOne.mockResolvedValueOnce(withContact())

        await build().update('user-1', 'i1', { execution_status: 'done', outcome: 'blocked_by_procurement' })

        expect(contacts.findOne).not.toHaveBeenCalled()
        expect(contacts.update).not.toHaveBeenCalled()
        expect(bus.emit).not.toHaveBeenCalled()
      })

      it('une action sans contact ne propage rien', async () => {
        items.findOne.mockResolvedValueOnce(baseItem())

        await build().update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

        expect(contacts.update).not.toHaveBeenCalled()
      })

      // #3416.4b — les issues sans équivalent de statut contact écrivent UN
      // événement dans la frise du compte (issue nommée FR+EN), sans changer aucun statut.
      it.each([
        ['need_confirmed', 'Besoin confirmé', 'Need confirmed'],
        ['blocked_by_procurement', 'Bloqué par les achats', 'Blocked by procurement'],
        ['blocked_by_margin', 'Bloqué par la marge', 'Blocked by margin'],
        ['technical_error', 'Erreur technique', 'Technical error'],
        ['abandoned', 'Abandonné', 'Abandoned'],
      ] as const)('« %s » : un événement de frise nomme l’issue, aucun statut ne change', async (outcome, fr, en) => {
        items.findOne.mockResolvedValueOnce(withContact())

        await build().update('user-1', 'i1', { execution_status: 'done', outcome })

        expect(contacts.update).not.toHaveBeenCalled()
        expect(bus.emit).not.toHaveBeenCalled()
        const rows = actions.create.mock.calls.map(
          call => call[0] as { action_type: string; metadata: Record<string, unknown> },
        )
        const events = rows.filter(row => row.action_type === 'plan_action_completed')
        expect(events).toHaveLength(1)
        expect(events[0]?.metadata).toMatchObject({ outcome, label_en: expect.stringContaining(en) })
        expect(String(events[0]?.metadata['label'])).toContain(fr)
      })

      it('une issue AVEC équivalent de statut garde le libellé générique (pas de doublon de frise)', async () => {
        items.findOne.mockResolvedValueOnce(withContact())
        contacts.findOne.mockResolvedValueOnce({ id: 'c1', user_status: 'contacted' })

        await build().update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

        const rows = actions.create.mock.calls.map(call => call[0] as { metadata: Record<string, unknown> })
        expect(rows[0]?.metadata['label']).toBe('Action marquée comme faite')
      })

      // #3416.2b — `callback_scheduled` + date ⇒ UNE tâche ouverte datée, idempotente.
      describe('relance datée (#3416.2b)', () => {
        const tasks = createMockRepository<TaskEntity>()
        const buildWithTasks = () =>
          new ActionPlanItemsService(
            items as never,
            plans as never,
            actions as never,
            accounts as never,
            workspace as unknown as WorkspaceContextService,
            contacts as never,
            bus as never,
            tasks as never,
          )
        beforeEach(() => {
          tasks.save.mockReset()
          tasks.create.mockImplementation((row: unknown) => row as TaskEntity)
          tasks.findOne.mockReset()
          tasks.findOne.mockResolvedValue(null)
        })

        it('avec une date : crée UNE tâche ouverte datée sur le compte et le contact', async () => {
          items.findOne.mockResolvedValueOnce(withContact())

          await buildWithTasks().update('user-1', 'i1', {
            execution_status: 'done',
            outcome: 'callback_scheduled',
            callback_date: '2026-10-20',
          })

          expect(tasks.save).toHaveBeenCalledTimes(1)
          expect(tasks.save.mock.calls[0]?.[0]).toMatchObject({
            workspace_id: 'ws-1',
            account_id: 'acc-1',
            contact_id: 'c1',
            status: 'todo',
            due_on: '2026-10-20',
            // #3416 : une source DÉDIÉE — « manual » dirait que l'utilisateur l'a tapée.
            source: 'plan_callback',
            source_label_key: 'plan-item-callback:i1',
          })
        })

        // #3416.2 (recette démo 05/10 : la date ne créait aucune relance visible
        // dans « Mes relances », qui lit les lignes de plan, pas les tâches) —
        // la relance datée est AUSSI une ligne de plan ouverte à cette date.
        it('avec une date : crée la ligne de relance ouverte à cette date (visible dans Mes relances)', async () => {
          items.findOne.mockReset()
          items.findOne.mockResolvedValueOnce(withContact()).mockResolvedValueOnce(null)
          items.create.mockImplementation((row: unknown) => row as never)
          items.save.mockClear()

          await buildWithTasks().update('user-1', 'i1', {
            execution_status: 'done',
            outcome: 'callback_scheduled',
            callback_date: '2026-10-20',
          })

          const created = items.save.mock.calls
            .map(call => call[0] as Record<string, unknown>)
            .find(row => row['depends_on_item_id'] === 'i1')
          expect(created).toMatchObject({
            account_id: 'acc-1',
            contact_id: 'c1',
            due_date: '2026-10-20',
            done: false,
            execution_status: 'todo',
            cadence_step: 'relance',
            depends_on_item_id: 'i1',
          })
        })

        it('NON — rejouer ne recrée pas la ligne de relance', async () => {
          items.findOne.mockReset()
          items.findOne.mockResolvedValueOnce(withContact()).mockResolvedValueOnce({ id: 'r1' } as never)
          items.create.mockImplementation((row: unknown) => row as never)
          items.save.mockClear()

          await buildWithTasks().update('user-1', 'i1', {
            execution_status: 'done',
            outcome: 'callback_scheduled',
            callback_date: '2026-10-20',
          })

          expect(
            items.save.mock.calls.some(call => (call[0] as Record<string, unknown>)['depends_on_item_id'] === 'i1'),
          ).toBe(false)
        })

        it('rejouer ne crée pas de doublon', async () => {
          items.findOne.mockResolvedValueOnce(withContact())
          tasks.findOne.mockResolvedValueOnce({ id: 't1' } as TaskEntity)

          await buildWithTasks().update('user-1', 'i1', {
            execution_status: 'done',
            outcome: 'callback_scheduled',
            callback_date: '2026-10-20',
          })

          expect(tasks.save).not.toHaveBeenCalled()
        })

        it('sans date : rien d’inventé', async () => {
          items.findOne.mockResolvedValueOnce(withContact())

          await buildWithTasks().update('user-1', 'i1', { execution_status: 'done', outcome: 'callback_scheduled' })

          expect(tasks.save).not.toHaveBeenCalled()
        })

        it('« abandonné » clôt sans créer de relance, même avec une date', async () => {
          items.findOne.mockResolvedValueOnce(withContact())

          await buildWithTasks().update('user-1', 'i1', {
            execution_status: 'done',
            outcome: 'abandoned',
            callback_date: '2026-10-20',
          })

          expect(tasks.save).not.toHaveBeenCalled()
        })
      })

      it('un échec de propagation ne défait pas l’issue déjà enregistrée', async () => {
        items.findOne.mockResolvedValueOnce(withContact())
        contacts.findOne.mockRejectedValueOnce(new Error('db'))

        const result = await build().update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

        expect(result.outcome).toBe('positive')
      })
    })

    it('marks an item done via execution_status and records plan_action_completed', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

      expect(result.execution_status).toBe('done')
      expect(result.done).toBe(true)
      expect(result.completed_at).not.toBeNull()
      // #2396.2/.5 — l'issue choisie est persistée ; #2396.1 — le mode l'est aussi,
      // 'manual' est le seul chemin d'écriture réel aujourd'hui.
      expect(result.outcome).toBe('positive')
      expect(result.completion_mode).toBe('manual')
      expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      const feed = actions.save.mock.calls[0][0] as Array<Partial<UserActionEntity>>
      expect(feed).toHaveLength(1)
      expect(feed[0]).toMatchObject({
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'acc-1',
        action_type: 'plan_action_completed',
      })
    })

    // #3416.1 (lot C14 30/09) — les quatre issues ajoutées à la recette bêta
    // sont persistées de BOUT EN BOUT par le MÊME chemin que les issues
    // historiques, pas seulement acceptées par le contrat (packages/contracts/
    // src/schemas/action-plan-items.test.ts en prouve la forme ; ce test
    // prouve l'appelant réel, `ActionPlanItemsService.update`).
    it.each(['blocked_by_procurement', 'blocked_by_margin', 'technical_error', 'abandoned'] as const)(
      'marks an item done with the new outcome %s',
      async outcome => {
        items.findOne.mockResolvedValueOnce(baseItem())
        items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

        const result = await service.update('user-1', 'i1', { execution_status: 'done', outcome })

        expect(result.execution_status).toBe('done')
        expect(result.outcome).toBe(outcome)
      },
    )

    // #2396.2 — le cliquet : sans issue choisie, une transition vers « fait »
    // est refusée et rien n'est écrit.
    it('rejects marking an item done without an outcome', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())

      await expect(service.update('user-1', 'i1', { execution_status: 'done' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(items.save).not.toHaveBeenCalled()
    })

    // #2396.2 — re-patcher une ligne DÉJÀ faite (ex. la réassigner) ne redemande
    // pas d'issue : seule la TRANSITION vers « fait » l'exige.
    it('does not re-require an outcome when a done item is patched again', async () => {
      const done = { ...baseItem(), execution_status: 'done', done: true, outcome: 'positive' } as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(done)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { execution_status: 'done' })

      expect(result.execution_status).toBe('done')
    })

    // #3211.9 (#3234, lot M11 09/10) — l'issue se DÉCLARE après coup sur une
    // action déjà faite sans issue (complétée par preuve d'envoi, ou ancienne).
    it('#3211.9 — fills the outcome of a done item that has none, without touching its completion mode', async () => {
      const done = {
        ...baseItem(),
        execution_status: 'done',
        done: true,
        outcome: null,
        completion_mode: 'proof',
      } as unknown as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(done)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { outcome: 'meeting_booked' })

      expect(result.outcome).toBe('meeting_booked')
      expect(result.execution_status).toBe('done')
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ completion_mode: 'proof' }))
    })

    it('#3211.9 — SAIT DIRE NON : never rewrites an outcome already declared', async () => {
      const done = { ...baseItem(), execution_status: 'done', done: true, outcome: 'declined' } as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(done)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { outcome: 'positive' })

      expect(result.outcome).toBe('declined')
    })

    it('#3211.9 — an outcome alone on an OPEN item does not complete it', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { outcome: 'positive' })

      expect(result.done).toBe(false)
      expect(result.outcome ?? null).toBeNull()
    })

    it('snoozes an item until a timestamp and records plan_action_rescheduled', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
      const until = '2026-08-01T09:00:00.000Z'

      const result = await service.update('user-1', 'i1', { execution_status: 'snoozed', snoozed_until: until })

      expect(result.execution_status).toBe('snoozed')
      expect(result.done).toBe(false)
      expect(result.snoozed_until).toBe(until)
      const feed = actions.save.mock.calls[0][0] as Array<Partial<UserActionEntity>>
      expect(feed[0]?.action_type).toBe('plan_action_rescheduled')
    })

    it('#2123.37 — « prepared » garde l’action ouverte et n’écrit rien au fil d’équipe', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { execution_status: 'prepared' })

      expect(result.execution_status).toBe('prepared')
      // Préparée n'est pas faite : la relance reste due, le compteur ne bouge pas.
      expect(result.done).toBe(false)
      expect(result.completed_at).toBeNull()
      expect(result.snoozed_until).toBeNull()
      expect(actions.save).not.toHaveBeenCalled()
    })

    it('#2317.12 — « obsolete » marque l’action sans l’exécuter, sans l’écrire au fil d’équipe', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { execution_status: 'obsolete' })

      expect(result.execution_status).toBe('obsolete')
      expect(result.done).toBe(false)
      expect(result.completed_at).toBeNull()
      expect(result.snoozed_until).toBeNull()
      // #2317.12 — geste privé, comme « préparée » : rien au fil d'équipe.
      expect(actions.save).not.toHaveBeenCalled()
    })

    it('#2317.12 — « obsolete » bascule vers « todo » (proposer de la remettre à faire)', async () => {
      const obsolete = { ...baseItem(), execution_status: 'obsolete' } as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(obsolete)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { execution_status: 'todo' })

      expect(result.execution_status).toBe('todo')
    })

    it('reopens a snoozed item (todo) and clears snoozed_until', async () => {
      const snoozed = {
        ...baseItem(),
        execution_status: 'snoozed',
        snoozed_until: new Date('2026-08-01T09:00:00.000Z'),
      } as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(snoozed)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { execution_status: 'todo' })

      expect(result.execution_status).toBe('todo')
      expect(result.snoozed_until).toBeNull()
      const feed = actions.save.mock.calls[0][0] as Array<Partial<UserActionEntity>>
      expect(feed[0]?.action_type).toBe('plan_action_uncompleted')
    })

    it('assigns to a workspace member (validated) and records plan_action_assigned', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', {
        assigned_to: 'user-2',
        handoff_note: 'Dossier chaud, voir le mail de lundi',
      })

      expect(workspace.getMembership).toHaveBeenCalledWith('user-2', 'ws-1')
      expect(result.assigned_to).toBe('user-2')
      const feed = actions.save.mock.calls[0][0] as Array<Partial<UserActionEntity>>
      expect(feed[0]).toMatchObject({ action_type: 'plan_action_assigned' })
      expect(feed[0]?.metadata).toMatchObject({ assigned_to: 'user-2' })
    })

    // #4158.16 — une action m'est DÉLÉGUÉE par un collègue : une notification.
    describe('notification du délégataire (#4158.16)', () => {
      let notify: { notifyActionDelegated: jest.Mock }
      beforeEach(() => {
        notify = { notifyActionDelegated: jest.fn().mockResolvedValue(undefined) }
        service = new ActionPlanItemsService(
          items as never,
          plans as never,
          actions as never,
          accounts as never,
          workspace as unknown as WorkspaceContextService,
          contacts as never,
          undefined,
          undefined,
          undefined,
          undefined,
          notify as never,
        )
        items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
      })

      it('prévient le délégataire, dans l’espace actif, avec le compte de l’action', async () => {
        items.findOne.mockResolvedValueOnce({ ...baseItem(), account_id: 'acc-9' } as ActionPlanItemEntity)
        await service.update('user-1', 'i1', { assigned_to: 'user-2', handoff_note: 'Rappeler avant jeudi' })
        expect(notify.notifyActionDelegated).toHaveBeenCalledTimes(1)
        expect(notify.notifyActionDelegated).toHaveBeenCalledWith({
          workspaceId: 'ws-1',
          actorUserId: 'user-1',
          recipientUserId: 'user-2',
          accountId: 'acc-9',
        })
      })

      it('se déléguer l’action à soi-même ne prévient personne', async () => {
        items.findOne.mockResolvedValueOnce(baseItem())
        workspace.getMembership.mockResolvedValueOnce({ id: 'm', user_id: 'user-1', workspace_id: 'ws-1' })
        await service.update('user-1', 'i1', { assigned_to: 'user-1' })
        expect(notify.notifyActionDelegated).not.toHaveBeenCalled()
      })

      it('retirer la délégation ne prévient personne', async () => {
        items.findOne.mockResolvedValueOnce({ ...baseItem(), assigned_to: 'user-2' } as ActionPlanItemEntity)
        await service.update('user-1', 'i1', { assigned_to: null })
        expect(notify.notifyActionDelegated).not.toHaveBeenCalled()
      })

      it('re-déléguer au même délégataire (rien ne change) ne prévient personne', async () => {
        items.findOne.mockResolvedValueOnce({ ...baseItem(), assigned_to: 'user-2' } as ActionPlanItemEntity)
        await service.update('user-1', 'i1', { assigned_to: 'user-2' })
        expect(notify.notifyActionDelegated).not.toHaveBeenCalled()
      })

      it('une délégation REFUSÉE (non-membre) ne prévient personne', async () => {
        items.findOne.mockResolvedValueOnce(baseItem())
        workspace.getMembership.mockResolvedValueOnce(null)
        await expect(service.update('user-1', 'i1', { assigned_to: 'stranger' })).rejects.toBeInstanceOf(
          BadRequestException,
        )
        expect(notify.notifyActionDelegated).not.toHaveBeenCalled()
      })

      it('un changement d’état sans délégation ne prévient personne', async () => {
        items.findOne.mockResolvedValueOnce(baseItem())
        await service.update('user-1', 'i1', { execution_status: 'snoozed' })
        expect(notify.notifyActionDelegated).not.toHaveBeenCalled()
      })
    })

    // #4158.31 — déléguer à un collègue exige une note de contexte, affichée au délégataire.
    it('#4158.31 — refuse de déléguer à un collègue SANS note de contexte, et ne change rien', async () => {
      items.findOne.mockImplementation(async () => baseItem())

      await expect(service.update('user-1', 'i1', { assigned_to: 'user-2' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      await expect(
        service.update('user-1', 'i1', { assigned_to: 'user-2', handoff_note: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(items.save).not.toHaveBeenCalled()
      expect(actions.save).not.toHaveBeenCalled()
    })

    it('#4158.31 — la note est enregistrée avec son auteur et rendue au délégataire', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', {
        assigned_to: 'user-2',
        handoff_note: '  Rappeler avant jeudi  ',
      })

      expect(result.handoff_note).toBe('Rappeler avant jeudi')
      expect(result.handoff_by).toBe('user-1')
    })

    it('#4158.31 — s’attribuer l’action à soi-même n’exige aucune note', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { assigned_to: 'user-1' })

      expect(result.assigned_to).toBe('user-1')
      expect(result.handoff_note).toBeNull()
    })

    it('#4158.31 — libérer l’action efface la note : elle ne suit pas une action qui n’est plus déléguée', async () => {
      const delegated = { ...baseItem(), assigned_to: 'user-2', handoff_note: 'ancienne', handoff_by: 'user-1' }
      items.findOne.mockResolvedValueOnce(delegated as ActionPlanItemEntity)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { assigned_to: null })

      expect(result.handoff_note).toBeNull()
      expect(result.handoff_by).toBeNull()
    })

    it('rejects assigning to a non-member and changes nothing', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      workspace.getMembership.mockResolvedValueOnce(null)

      await expect(
        service.update('user-1', 'i1', { assigned_to: 'stranger', handoff_note: 'contexte' }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(items.save).not.toHaveBeenCalled()
      expect(actions.save).not.toHaveBeenCalled()
    })

    it('unassigns (assigned_to=null) without recording an assignment event', async () => {
      const assigned = { ...baseItem(), assigned_to: 'user-2' } as ActionPlanItemEntity
      items.findOne.mockResolvedValueOnce(assigned)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const result = await service.update('user-1', 'i1', { assigned_to: null })

      expect(workspace.getMembership).not.toHaveBeenCalled()
      expect(result.assigned_to).toBeNull()
      expect(actions.save).not.toHaveBeenCalled()
    })

    it('does not fail the update when the feed write throws', async () => {
      items.findOne.mockResolvedValueOnce(baseItem())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
      actions.save.mockRejectedValueOnce(new Error('feed down'))

      const result = await service.update('user-1', 'i1', { execution_status: 'done', outcome: 'positive' })

      expect(result.execution_status).toBe('done')
    })
  })

  describe('listPersonalRelances (personal cockpit)', () => {
    it('returns only my not-done, dated items, in my workspace, mapped with overdue/assigned flags', async () => {
      items._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'rel-1',
          account_id: 'acc-1',
          company_name: 'ACME',
          label: 'Rappeler la DSI',
          due_date: '2000-01-01', // long past → overdue
          cadence_step: 'relance',
          contact_id: 'c-1',
          assigned_to: 'user-1', // delegated to me
        },
        {
          id: 'rel-2',
          account_id: 'acc-2',
          company_name: null,
          label: null,
          due_date: '2999-12-31', // far future → not overdue
          cadence_step: null,
          contact_id: null,
          assigned_to: null, // unassigned, I own it
        },
      ])

      const result = await service.listPersonalRelances('user-1', 'ws-1')

      // Strict personal ownership: delegated to me OR unassigned-and-mine — never
      // a teammate's item, and never mine once delegated away.
      expect(items._qb.andWhere).toHaveBeenCalledWith(
        '(item.assigned_to = :userId OR (item.assigned_to IS NULL AND item.user_id = :userId))',
        { userId: 'user-1' },
      )
      // Pinned to my active workspace via the account join.
      expect(items._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(items._qb.where).toHaveBeenCalledWith('item.done = false')
      expect(items._qb.andWhere).toHaveBeenCalledWith('item.due_date IS NOT NULL')

      // `rel-2` n'a PAS de libellé : il ne devient pas « Relance ». Un mot
      // inventé à la place d'un texte absent n'est vrai de rien, et il produit
      // une ligne sur laquelle le commercial ne peut rien faire.
      expect(result).toEqual([
        {
          id: 'rel-1',
          account_id: 'acc-1',
          company_name: 'ACME',
          label: 'Rappeler la DSI',
          due_date: '2000-01-01',
          overdue: true,
          cadence_step: 'relance',
          contact_id: 'c-1',
          assigned_to_me: true,
        },
      ])
    })

    it('ne nomme pas « Compte » un compte dont le nom est vide', async () => {
      // `accounts.company_name` est NOT NULL, mais NOT NULL n'interdit pas la
      // chaîne vide. Le mappeur écrivait alors « Compte » — un nom inventé,
      // indiscernable d'un vrai compte qui s'appellerait ainsi. Une relance
      // reste une relance : on ne la jette pas, on dit qu'on ne sait pas.
      items._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'rel-3',
          account_id: 'acc-3',
          company_name: '   ',
          label: 'Rappeler la DSI',
          due_date: '2999-12-31',
          cadence_step: null,
          contact_id: null,
          assigned_to: 'user-1',
        },
      ])

      const result = await service.listPersonalRelances('user-1', 'ws-1')

      expect(result).toHaveLength(1)
      expect(result[0]!.company_name).toBeNull()
    })

    it('écarte en SQL les lignes sans libellé plutôt que d’en inventer un', async () => {
      items._qb.getRawMany.mockResolvedValueOnce([])

      await service.listPersonalRelances('user-1', 'ws-1')

      // Le filtre vit dans la requête : une ligne sans texte ne doit pas
      // consommer le `limit` d'une liste de relances au détriment d'une vraie.
      expect(items._qb.andWhere).toHaveBeenCalledWith("btrim(coalesce(item.label, '')) <> ''")
    })

    it('reprend la portée « ouverte » canonique : ni faite, ni reportée, ni sur un compte archivé (#1285)', async () => {
      items._qb.getRawMany.mockResolvedValueOnce([])

      await service.listPersonalRelances('user-1', 'ws-1')

      // Les trois clauses sont celles de `ManagerService.sharedActions` et de
      // `team-kpis.workloadByMember`. Elles manquaient ici : une relance reportée
      // à la semaine prochaine restait affichée, et en retard.
      expect(items._qb.andWhere).toHaveBeenCalledWith("item.execution_status <> 'done'")
      expect(items._qb.andWhere).toHaveBeenCalledWith('(item.snoozed_until IS NULL OR item.snoozed_until <= now())')
      expect(items._qb.andWhere).toHaveBeenCalledWith("account.commercial_status <> 'archived'")
    })

    it('compte par une REQUÊTE, pas par la longueur de la liste bornée (#1285)', async () => {
      // « 100 relances à faire » mesuré en production le 31/08/2026 : c'était la
      // borne du `limit`, pas un nombre. Le même défaut que `countPersonalAccounts`
      // corrige un cran plus haut.
      items._qb.getRawOne.mockResolvedValueOnce({ open: '137', overdue: '73' })

      await expect(service.countPersonalRelances('user-1', 'ws-1')).resolves.toEqual({ open: 137, overdue: 73 })
      // Même portée que la liste — sinon le nombre annoncé n'est pas celui des
      // lignes affichées en dessous.
      expect(items._qb.andWhere).toHaveBeenCalledWith("item.execution_status <> 'done'")
      expect(items._qb.andWhere).toHaveBeenCalledWith(
        '(item.assigned_to = :userId OR (item.assigned_to IS NULL AND item.user_id = :userId))',
        { userId: 'user-1' },
      )
    })

    it('un comptage impossible rend `null` — pas un zéro', async () => {
      items._qb.getRawOne.mockRejectedValueOnce(new Error('db down'))
      await expect(service.countPersonalRelances('user-1', 'ws-1')).resolves.toBeNull()
    })

    it('fails soft to an empty list on a query error', async () => {
      items._qb.getRawMany.mockRejectedValueOnce(new Error('db down'))
      await expect(service.listPersonalRelances('user-1', 'ws-1')).resolves.toEqual([])
    })
  })

  describe('createManual (MCP create_action)', () => {
    it('appends a manual item in the reserved band (week 1000), after the last manual step', async () => {
      // The checklist already has rows → no seeding pass.
      items.find.mockResolvedValue([{ id: 'i1', week_index: 0, step_index: 0 } as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: 2 })

      const result = await service.createManual('user-1', 'acc-1', {
        label: 'Rappeler le DSI après le salon',
        dueDate: '2026-08-01',
        contactId: 'c-1',
      })

      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          account_id: 'acc-1',
          source_plan_id: null,
          label: 'Rappeler le DSI après le salon',
          week_index: 1000,
          step_index: 3,
          done: false,
          execution_status: 'todo',
          // Linked to a contact WITHOUT being a cadence row — it stays on the
          // account checklist (listForAccount filters `cadence_step IS NULL`).
          contact_id: 'c-1',
          cadence_step: null,
          due_date: '2026-08-01',
        }),
      )
      expect(result).toMatchObject({ label: 'Rappeler le DSI après le salon', due_date: '2026-08-01' })
    })

    it('starts the manual band at step 0 and defaults contact/due to null', async () => {
      items.find.mockResolvedValue([{ id: 'i1' } as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce(null)

      await service.createManual('user-1', 'acc-1', { label: 'Préparer le rendez-vous' })

      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({ week_index: 1000, step_index: 0, contact_id: null, due_date: null }),
      )
    })

    it('#2395.1 — ne matérialise PAS le plan : seule la ligne manuelle est écrite', async () => {
      items.find.mockResolvedValue([])
      plans.findOne.mockResolvedValue({
        id: 'plan-1',
        weeks: [{ name: 'S1', actions: [{ action: 'A1' }] }],
      } as unknown as ActionPlanEntity)
      items._qb.getRawOne.mockResolvedValueOnce(null)

      await service.createManual('user-1', 'acc-1', { label: 'Action manuelle' })

      expect(items.save).toHaveBeenCalledTimes(1)
      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ label: 'Action manuelle' }))
    })
  })

  // #2123.1-.10 — une action vise un objet canonique EXISTANT. Le Plan d'action
  // était une to-do list flottante : du texte et un responsable, qui ne
  // menaient ni au contact, ni au projet, ni au besoin.
  describe("l'objet canonique visé (#2123.1-.10)", () => {
    it("écrit les trois colonnes de l'objet avec l'action", async () => {
      items.find.mockResolvedValue([{ id: 'i1' } as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce(null)

      await service.createManual('user-1', 'acc-1', {
        label: 'Rappeler le DSI',
        target: { kind: 'contact', id: 'c-42', label: 'Sophie Marchand (DSI)' },
      })

      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({
          target_kind: 'contact',
          target_id: 'c-42',
          target_label: 'Sophie Marchand (DSI)',
        }),
      )
    })

    it('rend l’objet sur la ligne lue', async () => {
      items.find.mockResolvedValue([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'Rappeler le DSI',
          week_index: 0,
          step_index: 0,
          target_kind: 'project',
          target_id: 'p-7',
          target_label: 'Refonte du SI RH',
        } as unknown as ActionPlanItemEntity,
      ])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item?.target).toEqual({ kind: 'project', id: 'p-7', label: 'Refonte du SI RH' })
    })

    it('REFUSE une nature inconnue plutôt que de l’afficher — la ligne reste lisible, sans objet', async () => {
      items.find.mockResolvedValue([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'Rappeler le DSI',
          week_index: 0,
          step_index: 0,
          target_kind: 'todo',
          target_id: 'x-1',
          target_label: 'Quelque chose',
        } as unknown as ActionPlanItemEntity,
      ])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item?.target).toBeNull()
    })

    it('REFUSE un objet à moitié écrit — une nature sans identifiant n’ouvre personne', async () => {
      items.find.mockResolvedValue([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'Rappeler le DSI',
          week_index: 0,
          step_index: 0,
          target_kind: 'contact',
          target_id: '  ',
          target_label: 'Sophie',
        } as unknown as ActionPlanItemEntity,
      ])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item?.target).toBeNull()
    })

    it('retombe sur l’identifiant quand le libellé manque, jamais sur une chaîne inventée', async () => {
      items.find.mockResolvedValue([
        {
          id: 'i1',
          account_id: 'acc-1',
          label: 'Vérifier l’effectif',
          week_index: 0,
          step_index: 0,
          target_kind: 'verification',
          target_id: 'account.effectif',
          target_label: null,
        } as unknown as ActionPlanItemEntity,
      ])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item?.target).toEqual({ kind: 'verification', id: 'account.effectif', label: 'account.effectif' })
    })
  })

  // #2123.21-.31 — ce qu'une action porte, et ce qu'elle ne prétend PAS savoir.
  describe("les champs d'une action (#2123.21-.31)", () => {
    // `Record<string, unknown>` et non `Partial<Entity>` : un des cas mesure ce
    // que le service fait d'une valeur que la BASE peut porter et que le type
    // n'admet pas (une source héritée, écrite avant la contrainte).
    const row = (over: Record<string, unknown>) =>
      ({
        id: 'i1',
        account_id: 'acc-1',
        label: 'Rappeler le DSI',
        week_index: 0,
        step_index: 0,
        ...over,
      }) as unknown as ActionPlanItemEntity

    it('rend la raison, le contact, la dépendance, la confiance et le coût', async () => {
      items.find.mockResolvedValue([
        row({
          reason: 'Deux postes data ouverts en trois semaines.',
          contact_id: 'c-42',
          depends_on_item_id: 'i0',
          source: 'human',
          source_at: new Date('2026-09-14T09:00:00.000Z'),
          confidence: 'medium',
          cost_credits: 2,
        }),
      ])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item).toMatchObject({
        reason: 'Deux postes data ouverts en trois semaines.',
        contact_id: 'c-42',
        depends_on_item_id: 'i0',
        provenance: { source: 'human', at: '2026-09-14T09:00:00.000Z' },
        confidence: 'medium',
        cost_credits: 2,
      })
    })

    it('une confiance et un coût NON MESURÉS restent `null` — jamais 0, jamais « faible »', async () => {
      items.find.mockResolvedValue([row({ confidence: null, cost_credits: null })])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item?.confidence).toBeNull()
      expect(item?.cost_credits).toBeNull()
      expect(item?.cost_credits).not.toBe(0)
    })

    it('REFUSE une source inconnue, et ne rend pas une date sans sa source', async () => {
      items.find.mockResolvedValue([row({ source: 'devine', source_at: new Date('2026-09-14T09:00:00.000Z') })])

      const [item] = await service.listForAccount('user-1', 'acc-1')

      expect(item?.provenance).toBeNull()
    })
  })

  /**
   * #2123.46 / #2123.47 — une action créée depuis le plan est UNE ligne.
   *
   * Avant ce lot, le formulaire du plan écrivait dans le JSON de l'analyse
   * (`raw_analysis.user_plan_actions`) : l'action n'avait ni statut, ni objet,
   * ni existence pour l'écran Actions, et le compte portait une deuxième copie
   * de la même tâche.
   */
  describe('#2123.46 — créer une action depuis le plan', () => {
    const existing = () =>
      ({
        id: 'i0',
        account_id: 'acc-1',
        label: 'Action du plan',
        week_index: 0,
        step_index: 0,
      }) as unknown as ActionPlanItemEntity

    it('écrit UNE seule ligne, dans la bande des actions saisies à la main', async () => {
      items.find.mockResolvedValue([existing()])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-1' }))

      const created = await service.createManual('user-1', 'acc-1', {
        label: 'Relancer le DSI après le comité',
        ownerName: 'Sophie',
        target: null,
      })

      expect(items.save).toHaveBeenCalledTimes(1)
      expect(created).toMatchObject({
        account_id: 'acc-1',
        label: 'Relancer le DSI après le comité',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        execution_status: 'todo',
        owner_name: 'Sophie',
        assigned_to: null,
      })
    })

    it('porte sa provenance : écrite par un humain, à une date', async () => {
      items.find.mockResolvedValue([existing()])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-1' }))

      const created = await service.createManual('user-1', 'acc-1', { label: 'Relancer', target: null })

      expect(created.provenance?.source).toBe('human')
      expect(created.provenance?.at).not.toBeNull()
      // L'objet visé n'est pas DEVINÉ : la personne n'en a désigné aucun, et
      // l'écran nommera le manque (« à vérifier d'abord »).
      expect(created.target).toBeNull()
    })

    it('garde l’objet visé quand il est connu — une fiche contact l’apporte', async () => {
      items.find.mockResolvedValue([existing()])
      items._qb.getRawOne.mockResolvedValueOnce({ max: 2 })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-1' }))

      const created = await service.createManual('user-1', 'acc-1', {
        label: 'Écrire à Sophie Marchand',
        target: { kind: 'contact', id: 'c-1', label: 'Sophie Marchand' },
      })

      expect(created.target).toEqual({ kind: 'contact', id: 'c-1', label: 'Sophie Marchand' })
      // La ligne suivante de la bande manuelle, jamais la même position.
      expect(created.step_index).toBe(3)
    })
  })

  /**
   * #2123.46 — l'écran Actions montre MES actions ouvertes, tous comptes
   * confondus. La ligne est la MÊME que celle du plan : changer son statut
   * ici le change là-bas, sans resynchronisation.
   */
  // #4418.1 — `GET /plan-items/mine` plafonne à 200 lignes (tri par échéance, sans échéance en dernier) : une
  // tâche créée sans date au-delà de la 200e disparaissait sans un mot. Le compteur dit combien l'écran
  // devrait montrer, pour qu'il nomme ce qu'il écarte.
  describe('#4418.1 — countMine (le total que /actions plafonne)', () => {
    it('compte la MÊME portée que la liste, sans plafond', async () => {
      items._qb.getCount.mockResolvedValueOnce(216)

      await expect(service.countMine('user-1')).resolves.toEqual({ open: 216 })

      expect(items._qb.where).toHaveBeenCalledWith('item.done = false')
      expect(items._qb.limit).not.toHaveBeenCalled()
      expect(items._qb.andWhere).not.toHaveBeenCalledWith('item.due_date < :today', expect.anything())
    })

    it('restreint aux retards avec le MÊME filtre que la liste « En retard »', async () => {
      items._qb.getCount.mockResolvedValueOnce(40)

      await expect(service.countMine('user-1', true)).resolves.toEqual({ open: 40 })

      expect(items._qb.andWhere).toHaveBeenCalledWith('item.due_date < :today', expect.anything())
    })

    it('contrôle négatif : une lecture impossible rend null, jamais « 0 »', async () => {
      items._qb.getCount.mockRejectedValueOnce(new Error('db down'))

      await expect(service.countMine('user-1')).resolves.toBeNull()
    })
  })

  describe('#2123.46 — listOpenForUser (écran Actions)', () => {
    const openRow = (over: Record<string, unknown> = {}) =>
      ({
        id: 'i1',
        account_id: 'acc-1',
        label: 'Rappeler la DSI',
        week_index: 1000,
        step_index: 0,
        done: false,
        execution_status: 'todo',
        due_date: null,
        ...over,
      }) as unknown as ActionPlanItemEntity

    it('rend la MÊME ligne que le plan, avec le compte qu’elle fait avancer', async () => {
      items._qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [openRow()],
        raw: [{ company_name: 'ACME' }],
      })

      const rows = await service.listOpenForUser('user-1', 'ws-1')

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: 'i1', account_id: 'acc-1', execution_status: 'todo', company_name: 'ACME' })
    })

    // #4521.1/.2 — la carte e-mail issue du plan nomme son contact (nom, fonction) et son signal.
    describe('#4521 — contact et signal sur la relance', () => {
      const label =
        "Envoyer un email J1 (5 lignes, pas de PJ) à Muriel Kumpflen (DG) en s'appuyant sur le signal factuel du repli de CA (72,4 M€ à 69,1 M€)"

      it('résout le contact par son identifiant, avec nom et fonction', async () => {
        contacts.find.mockResolvedValueOnce([
          { id: 'c-1', account_id: 'acc-1', full_name: 'Muriel Kumpflen', title: 'DG' },
        ])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label, contact_id: 'c-1' })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row).toMatchObject({
          contact_id: 'c-1',
          contact_name: 'Muriel Kumpflen',
          contact_role: 'DG',
          signal: { text: 'Repli de CA : 72,4 M€ → 69,1 M€', at: null },
        })
      })

      it('sans identifiant, rapproche le responsable du plan des contacts du compte', async () => {
        contacts.find.mockResolvedValueOnce([
          { id: 'c-1', account_id: 'acc-1', full_name: 'Muriel Kumpflen', title: 'DG' },
          { id: 'c-2', account_id: 'acc-2', full_name: 'Muriel Kumpflen', title: 'DAF' },
        ])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label, owner_name: 'muriel kumpflen (DG)', contact_id: null })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        // Le contact d'un AUTRE compte ne se rapproche jamais.
        expect(row).toMatchObject({ contact_id: 'c-1', contact_name: 'Muriel Kumpflen', contact_role: 'DG' })
      })

      it('ligne antérieure à la résolution (ni contact_id ni responsable) : le nom cité dans la consigne la rattrape, sur le compte seulement', async () => {
        contacts.find.mockResolvedValueOnce([
          { id: 'c-1', account_id: 'acc-1', full_name: 'Muriel Kumpflen', title: 'DG' },
          { id: 'c-2', account_id: 'acc-1', full_name: 'Paul Durand', title: 'DSI' },
          { id: 'c-3', account_id: 'acc-2', full_name: 'Muriel Kumpflen', title: 'DAF' },
        ])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label, owner_name: null, contact_id: null })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row).toMatchObject({ contact_id: 'c-1', contact_name: 'Muriel Kumpflen', contact_role: 'DG' })
      })

      it('ligne antérieure sans nom cité et plusieurs contacts : aucun destinataire deviné', async () => {
        contacts.find.mockResolvedValueOnce([
          { id: 'c-1', account_id: 'acc-1', full_name: 'Muriel Kumpflen', title: 'DG' },
          { id: 'c-2', account_id: 'acc-1', full_name: 'Paul Durand', title: 'DSI' },
        ])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label: 'Envoyer un email J1 au DG', owner_name: null, contact_id: null })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row?.contact_id ?? null).toBeNull()
      })

      // #4521.1 — LE MAILLON : 96 étapes sur 96 sans contact_id ni owner_name (créées par le plan, jamais rattachées).
      // Le contact est NOMMÉ dans le libellé ; la lecture le rapproche sans attendre le rattrapage back-office.
      it('sans identifiant ni responsable, rapproche le contact NOMMÉ dans le libellé (unique, nom complet)', async () => {
        contacts.find.mockResolvedValueOnce([
          { id: 'c-1', account_id: 'acc-1', full_name: 'Muriel Kumpflen', title: 'DG' },
          { id: 'c-3', account_id: 'acc-1', full_name: 'Paul Durand', title: 'DSI' },
        ])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label, owner_name: null, contact_id: null })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row).toMatchObject({ contact_id: 'c-1', contact_name: 'Muriel Kumpflen', contact_role: 'DG' })
      })

      it('libellé qui ne nomme personne, plusieurs contacts : aucun destinataire deviné', async () => {
        contacts.find.mockResolvedValueOnce([
          { id: 'c-1', account_id: 'acc-1', full_name: 'Muriel Kumpflen', title: 'DG' },
          { id: 'c-3', account_id: 'acc-1', full_name: 'Paul Durand', title: 'DSI' },
        ])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label: 'Rappeler la DSI', owner_name: null, contact_id: null })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row?.contact_id ?? null).toBeNull()
        expect(row?.contact_name ?? null).toBeNull()
      })

      it('personne de résolu, aucun signal cité : aucun champ inventé', async () => {
        contacts.find.mockResolvedValueOnce([])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label: 'Rappeler la DSI', owner_name: 'Inconnu' })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row?.contact_id ?? null).toBeNull()
        expect(row?.contact_name ?? null).toBeNull()
        expect(row?.signal ?? null).toBeNull()
      })

      it('porte la date du signal quand la provenance la connaît', async () => {
        contacts.find.mockResolvedValueOnce([])
        items._qb.getRawAndEntities.mockResolvedValueOnce({
          entities: [openRow({ label, source: 'pipeline', source_at: new Date('2026-10-02T08:00:00Z') })],
          raw: [{ company_name: 'ACME' }],
        })
        const [row] = await service.listOpenForUser('user-1', 'ws-1')
        expect(row?.signal?.at).toBe('2026-10-02T08:00:00.000Z')
      })
    })

    // #4072.2 — la relance porte l'historique d'échanges (métadonnées) et les faits récents.
    it('#4072.2 — chaque relance porte ses derniers échanges et ses faits récents, lus par le lecteur unique', async () => {
      const forAccount = jest.fn(async () => ({
        asOf: '2026-10-12T08:00:00.000Z',
        facts: [
          {
            date: '2026-09-02',
            kind: 'exchange',
            label: 'E-mail envoyé à Jeanne — « Point TMA »',
            weight: 1,
            ageDays: 40,
          },
          { date: '2026-10-01', kind: 'signal', label: 'Nouveau DSI', weight: 1, ageDays: 11 },
        ],
      }))
      const withFacts = new ActionPlanItemsService(
        items as never,
        plans as never,
        actions as never,
        accounts as never,
        workspace as unknown as WorkspaceContextService,
        contacts as never,
        undefined,
        undefined,
        undefined,
        { forAccount } as never,
      )
      items._qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [openRow(), openRow({ id: 'i2' }), openRow({ id: 'i3', account_id: 'acc-2' })],
        raw: [{ company_name: 'ACME' }, { company_name: 'ACME' }, { company_name: 'Beta' }],
      })
      const rows = await withFacts.listOpenForUser('user-1', 'ws-1')
      expect(rows[0]?.history?.exchanges.map(e => e.label)).toEqual(['E-mail envoyé à Jeanne — « Point TMA »'])
      expect(rows[0]?.history?.recent_facts.map(e => e.label)).toEqual(['Nouveau DSI'])
      // Un compte lu UNE fois, même pour deux relances.
      expect(forAccount).toHaveBeenCalledTimes(2)
      expect(forAccount).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'user-1', accountId: 'acc-1' })
    })

    it('#4072.2 — une lecture des faits en panne laisse la relance intacte, sans historique', async () => {
      const broken = new ActionPlanItemsService(
        items as never,
        plans as never,
        actions as never,
        accounts as never,
        workspace as unknown as WorkspaceContextService,
        contacts as never,
        undefined,
        undefined,
        undefined,
        { forAccount: jest.fn().mockRejectedValue(new Error('boom')) } as never,
      )
      items._qb.getRawAndEntities.mockResolvedValueOnce({ entities: [openRow()], raw: [{ company_name: 'ACME' }] })
      const rows = await broken.listOpenForUser('user-1', 'ws-1')
      expect(rows).toHaveLength(1)
      expect(rows[0]).not.toHaveProperty('history')
    })

    it('garde une action SANS échéance — « Mes relances » ne voit que les datées', async () => {
      items._qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [openRow({ due_date: null })],
        raw: [{ company_name: null }],
      })

      const rows = await service.listOpenForUser('user-1', 'ws-1')

      expect(rows[0]?.due_date).toBeNull()
      // Un compte sans raison sociale lisible ne reçoit pas un nom inventé.
      expect(rows[0]?.company_name).toBeNull()
    })

    it('échoue en douceur : une liste impossible est vide, jamais une erreur à l’écran', async () => {
      items._qb.getRawAndEntities.mockRejectedValueOnce(new Error('db down'))

      await expect(service.listOpenForUser('user-1', 'ws-1')).resolves.toEqual([])
    })

    it('la porte de l’écran résout MON espace actif — la portée n’est jamais celle du client', async () => {
      items._qb.getRawAndEntities.mockResolvedValueOnce({ entities: [openRow()], raw: [{ company_name: 'ACME' }] })

      await service.listMine('user-1')

      expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    })

    // #2717 — la tuile « En retard » du Dashboard doit atterrir sur une liste
    // FILTRÉE, de la MÊME portée que le comptage du cockpit
    // (`countPersonalRelances`) : le chiffre de la tuile et le nombre de lignes
    // affichées doivent coïncider.
    it('#2717 — overdueOnly ajoute le même filtre `due_date < aujourd’hui` que le comptage du cockpit', async () => {
      items._qb.getRawAndEntities.mockResolvedValueOnce({ entities: [openRow()], raw: [{ company_name: 'ACME' }] })

      await service.listOpenForUser('user-1', 'ws-1', 200, true)

      expect(items._qb.andWhere).toHaveBeenCalledWith('item.due_date < :today', { today: expect.any(String) })
    })

    it('#2717 — sans overdueOnly, aucun filtre de date n’est ajouté (comportement inchangé)', async () => {
      items._qb.getRawAndEntities.mockResolvedValueOnce({ entities: [openRow()], raw: [{ company_name: 'ACME' }] })

      await service.listOpenForUser('user-1', 'ws-1')

      expect(items._qb.andWhere).not.toHaveBeenCalledWith('item.due_date < :today', expect.anything())
    })

    it('#2717 — listMine transmet overdueOnly à listOpenForUser', async () => {
      items._qb.getRawAndEntities.mockResolvedValueOnce({ entities: [openRow()], raw: [{ company_name: 'ACME' }] })

      await service.listMine('user-1', true)

      expect(items._qb.andWhere).toHaveBeenCalledWith('item.due_date < :today', { today: expect.any(String) })
    })
  })

  // #4416 — « Préparer un plan pour <prénom> » : 2-3 étapes rangées dans le plan DU COMPTE.
  describe('#4416 — prepareForContact (étapes ciblées sur un contact)', () => {
    const UUID_ACC = '11111111-1111-4111-8111-111111111111'
    const UUID_CON = '22222222-2222-4222-8222-222222222222'
    const contact = (over: Partial<ContactEntity>) =>
      ({
        id: UUID_CON,
        account_id: UUID_ACC,
        full_name: 'Claire Martin',
        email: 'claire@acme.test',
        phone: '+33102030405',
        linkedin_url: 'https://www.linkedin.com/in/claire',
        ...over,
      }) as ContactEntity

    beforeEach(() => {
      accounts.findOne.mockResolvedValue({ id: UUID_ACC, workspace_id: 'ws-1' } as AccountEntity)
      items.find.mockResolvedValue([{ id: 'i0', account_id: UUID_ACC } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValue({ max: null })
      let n = 0
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: `new-${++n}` }))
    })

    it('REFUSE le contact d’un compte qui n’est pas dans MON espace — rien n’est écrit', async () => {
      accounts.findOne.mockResolvedValue(null)
      await expect(
        service.prepareForContact('user-1', { account_id: UUID_ACC, contact_id: UUID_CON }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(items.save).not.toHaveBeenCalled()
    })

    it('REFUSE un contact qui n’est pas de ce compte', async () => {
      contacts.findOne.mockResolvedValue(null)
      await expect(
        service.prepareForContact('user-1', { account_id: UUID_ACC, contact_id: UUID_CON }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(items.save).not.toHaveBeenCalled()
    })

    it('un contact joignable par e-mail, LinkedIn et téléphone → trois étapes, une par canal, visant le contact', async () => {
      contacts.findOne.mockResolvedValue(contact({}))
      const steps = await service.prepareForContact('user-1', { account_id: UUID_ACC, contact_id: UUID_CON })
      expect(steps.map(step => step.channel)).toEqual(['email', 'linkedin', 'phone'])
      for (const step of steps) {
        expect(step.target).toEqual({ kind: 'contact', id: UUID_CON, label: 'Claire Martin' })
        expect(step.label).toContain('Claire Martin')
        expect(step.reason).toBeTruthy()
        // #2395.8 — la création automatique porte AUSSI un résultat attendu.
        expect(step.expected_outcome).toContain('Claire Martin')
      }
    })

    it('rien d’inventé : seulement les canaux que le contact porte réellement', async () => {
      contacts.findOne.mockResolvedValue(contact({ phone: null, linkedin_url: null }))
      const steps = await service.prepareForContact('user-1', { account_id: UUID_ACC, contact_id: UUID_CON })
      expect(steps.map(step => step.channel)).toEqual(['email'])
    })

    it('aucun canal joignable → refus clair, pas de plan vide', async () => {
      contacts.findOne.mockResolvedValue(contact({ email: null, phone: null, linkedin_url: null }))
      await expect(
        service.prepareForContact('user-1', { account_id: UUID_ACC, contact_id: UUID_CON }),
      ).rejects.toMatchObject({ message: 'contact_no_reachable_channel' })
      expect(items.save).not.toHaveBeenCalled()
    })
  })

  // #2123.46 — la porte d'écriture du formulaire du plan.
  describe('#2123.46 — createFromPlan (formulaire du plan)', () => {
    it('REFUSE un compte qui n’est pas dans MON espace', async () => {
      accounts.findOne.mockResolvedValueOnce(null)

      await expect(
        service.createFromPlan('user-1', {
          account_id: 'acc-9',
          label: 'Relancer',
          reason: 'Objectif de test',
          target: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(items.save).not.toHaveBeenCalled()
    })

    it('écrit la ligne quand le compte est le mien, avec son responsable saisi', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-1' }))

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Relancer le DSI',
        target: null,
        owner_name: 'Sophie',
      })

      expect(created).toMatchObject({ label: 'Relancer le DSI', owner_name: 'Sophie' })
      expect(items.save).toHaveBeenCalledTimes(1)
    })

    it('#2123.72 — la tâche de prise de contact garde sa consigne (`reason`) et son contact visé', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-2' }))

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Appeler Jean Dupont',
        target: { kind: 'contact', id: 'c1', label: 'Jean Dupont' },
        reason: 'Qualifier le programme DORA avant le comité.',
      })

      expect(created).toMatchObject({
        label: 'Appeler Jean Dupont',
        reason: 'Qualifier le programme DORA avant le comité.',
        target: { kind: 'contact', id: 'c1', label: 'Jean Dupont' },
      })
    })

    it('#2871 — l’objectif fourni est écrit tel quel dans `reason` (jamais réécrit)', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-3' }))

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Relancer',
        reason: 'Objectif de test',
        target: null,
      })

      expect(created.reason).toBe('Objectif de test')
    })

    // #2901 (#2395.4) — le CANAL choisi dans le composer, jamais deviné.
    // `seedFromPlan` le pose déjà pour les actions dérivées du plan de
    // Laura ; cette porte manuelle ne le portait pas — mesuré 0/213 en
    // recette prod le 24/09/2026 (f9f23f887) pour les actions AUTOMATIQUES,
    // et cette porte-ci en était la seule à ne pas avoir reçu le correctif.
    it('#2901 — écrit le canal choisi, pour que le type se dérive (canonicalActionFromPlanItem)', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-4' }))

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Appeler le DSI',
        target: null,
        channel: 'phone',
      })

      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ channel: 'phone' }))
      expect(created.channel).toBe('phone')
    })

    it('#2901 — témoin : sans canal choisi, reste null, jamais deviné du libellé', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-5' }))

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Appeler le DSI',
        target: null,
      })

      expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ channel: null }))
      expect(created.channel).toBeNull()
    })
  })

  /**
   * #2123.46 — les QUATRE autres écrivains (veille, fiche contact, panneau
   * besoin, ajout en masse) passent par cette porte. Ils portaient un résultat
   * attendu et un indicateur, et l'ancienne porte était idempotente ET le
   * disait (`added: false`) : les deux promesses survivent à la bascule.
   */
  describe('#2123.46 — createFromPlan : les quatre écrivains basculés', () => {
    const mineAccount = () => accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
    const readyToWrite = () => {
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-9' }))
    }

    it('écrit le résultat attendu et l’indicateur sur la ligne', async () => {
      mineAccount()
      readyToWrite()
      items.findOne.mockResolvedValueOnce(null)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Qualifier le signal : levée de fonds',
        target: null,
        expected_outcome: 'Obtenir un rendez-vous avec la DSI',
        kpi: 'RDV posé',
      })

      expect(created).toMatchObject({
        expected_outcome: 'Obtenir un rendez-vous avec la DSI',
        kpi: 'RDV posé',
        added: true,
      })
    })

    it('témoin — sans eux, les deux champs restent null (jamais un texte de remplissage)', async () => {
      mineAccount()
      readyToWrite()
      items.findOne.mockResolvedValueOnce(null)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Relancer',
        reason: 'Objectif de test',
        target: null,
      })

      expect(created.expected_outcome).toBeNull()
      expect(created.kpi).toBeNull()
    })

    it('n’écrit PAS une seconde fois une action OUVERTE de même libellé et même objet — et le dit', async () => {
      mineAccount()
      items.findOne.mockResolvedValueOnce({
        id: 'i-déjà',
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        step_index: 0,
        done: false,
        target_kind: 'contact',
        target_id: 'c-1',
        target_label: 'Sophie',
      } as unknown as ActionPlanItemEntity)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Prendre contact avec Sophie',
        target: { kind: 'contact', id: 'c-1', label: 'Sophie' },
      })

      expect(created).toMatchObject({ id: 'i-déjà', added: false })
      expect(items.save).not.toHaveBeenCalled()
      // #3265.9 (BEL-SC-236) — la recherche du doublon est bornée à CE COMPTE
      // (déjà mien : `mineAccount()` valide `workspace_id`), avec le MÊME
      // objet — plus à MES lignes seules : `user_id` n'entre plus dans la
      // clé de collision, pour voir l'action déjà posée par un collègue.
      expect(items.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          account_id: 'acc-1',
          week_index: MANUAL_ACTION_WEEK_INDEX,
          label: 'Prendre contact avec Sophie',
          target_kind: 'contact',
          target_id: 'c-1',
          done: false,
        }),
      })
      expect(items.findOne).toHaveBeenCalledWith({ where: expect.not.objectContaining({ user_id: expect.anything() }) })
    })

    it('#3265.9 (BEL-SC-236) — trouve le doublon posé par un COLLÈGUE sur ce compte, ne le fusionne PAS silencieusement', async () => {
      mineAccount()
      items.findOne.mockResolvedValueOnce({
        id: 'i-collègue',
        user_id: 'user-2',
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        step_index: 0,
        done: false,
        target_kind: 'contact',
        target_id: 'c-1',
        target_label: 'Sophie',
        due_date: null,
        reason: null,
        expected_outcome: null,
        kpi: null,
      } as unknown as ActionPlanItemEntity)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        target: { kind: 'contact', id: 'c-1', label: 'Sophie' },
        due_date: '2026-10-01',
        reason: 'Confirmer le périmètre IAM',
      })

      expect(created).toMatchObject({ id: 'i-collègue', added: false })
      // Ligne d'un AUTRE utilisateur : on la signale (added: false), on ne la
      // réécrit jamais — seule une correction du collègue lui-même, ou une
      // action posée en son nom par un manager, touche sa ligne.
      expect(items.save).not.toHaveBeenCalled()
    })

    it('#2317.11 (épopée #2923) — MET À JOUR le doublon de même scope quand il lui manque une info, jamais un second silence', async () => {
      mineAccount()
      items.findOne.mockResolvedValueOnce({
        id: 'i-déjà',
        user_id: 'user-1',
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        step_index: 0,
        done: false,
        target_kind: 'contact',
        target_id: 'c-1',
        target_label: 'Sophie',
        due_date: null,
        reason: null,
        expected_outcome: null,
        kpi: null,
      } as unknown as ActionPlanItemEntity)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        target: { kind: 'contact', id: 'c-1', label: 'Sophie' },
        due_date: '2026-10-01',
        reason: 'Confirmer le périmètre IAM',
        expected_outcome: 'Nommer un owner',
      })

      expect(created).toMatchObject({
        id: 'i-déjà',
        added: false,
        due_date: '2026-10-01',
        reason: 'Confirmer le périmètre IAM',
      })
      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'i-déjà', due_date: '2026-10-01', reason: 'Confirmer le périmètre IAM' }),
      )
    })

    it('#2317.11 — ne touche PAS un champ déjà renseigné du doublon : une correction humaine ne se fait pas écraser par un rejeu', async () => {
      mineAccount()
      items.findOne.mockResolvedValueOnce({
        id: 'i-déjà',
        user_id: 'user-1',
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        step_index: 0,
        done: false,
        target_kind: 'contact',
        target_id: 'c-1',
        target_label: 'Sophie',
        due_date: '2026-09-20',
        reason: 'Raison déjà écrite par le commercial',
        expected_outcome: null,
        kpi: null,
      } as unknown as ActionPlanItemEntity)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Prendre contact avec Sophie',
        target: { kind: 'contact', id: 'c-1', label: 'Sophie' },
        due_date: '2026-10-15',
        reason: 'Reco générée à nouveau',
      })

      expect(created).toMatchObject({ due_date: '2026-09-20', reason: 'Raison déjà écrite par le commercial' })
    })

    it('lie le contact visé quand il appartient au compte — l’écran ne réclame plus « quel contact ? »', async () => {
      mineAccount()
      readyToWrite()
      items.findOne.mockResolvedValueOnce(null)
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', account_id: 'acc-1' } as never)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Prendre contact avec Sophie',
        target: { kind: 'contact', id: '8d2f5a1e-0000-4000-8000-000000000001', label: 'Sophie' },
      })

      expect(contacts.findOne).toHaveBeenCalledWith({
        where: { id: '8d2f5a1e-0000-4000-8000-000000000001', account_id: 'acc-1' },
      })
      expect(created.contact_id).toBe('8d2f5a1e-0000-4000-8000-000000000001')
    })

    it('SAIT DIRE NON — un contact d’un autre compte n’est pas lié', async () => {
      mineAccount()
      readyToWrite()
      items.findOne.mockResolvedValueOnce(null)
      contacts.findOne.mockResolvedValueOnce(null)

      const created = await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Prendre contact avec Sophie',
        target: { kind: 'contact', id: '8d2f5a1e-0000-4000-8000-000000000002', label: 'Sophie' },
      })

      expect(created.contact_id).toBeNull()
    })

    // #2123.46 — alias déprécié le 17/09 : un onglet resté sur l'ancien web
    // appelle encore `POST /accounts/:id/plan/actions`. Il écrit la MÊME ligne,
    // par la MÊME porte, et rend la forme que l'ancien web sait lire.
    it('alias déprécié — l’ancien corps écrit une ligne action_plan_items, jamais raw_analysis', async () => {
      accounts.findOne
        .mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
        .mockResolvedValueOnce({ id: 'acc-1', raw_analysis: { plan: { weeks: [] } } } as never)
      readyToWrite()
      items.findOne.mockResolvedValueOnce(null)

      const response = await service.createFromLegacyPlanAction('user-1', 'acc-1', {
        text: 'Qualifier le signal : levée de fonds',
        responsable: 'Sophie',
        outil: 'Les Échos',
        deadline: 'Cette semaine',
        kpi: 'RDV posé',
        expected_outcome: 'Obtenir un rendez-vous',
      })

      expect(items.save).toHaveBeenCalledTimes(1)
      expect(items.save).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Qualifier le signal : levée de fonds',
          owner_name: 'Sophie',
          expected_outcome: 'Obtenir un rendez-vous',
          kpi: 'RDV posé',
          // Une échéance en prose ne devient pas une date devinée.
          due_date: null,
        }),
      )
      // Rien n'est écrit dans le JSON de l'analyse : une seule écriture (GA-26).
      expect(accounts.manager.query).not.toHaveBeenCalled()
      expect(accounts.save).not.toHaveBeenCalled()
      expect(accounts.update).not.toHaveBeenCalled()
      // La forme que l'ancien web applique à son cache : l'analyse INCHANGÉE.
      expect(response).toEqual({ raw_analysis: { plan: { weeks: [] } }, added: true })
    })

    it('alias déprécié — une date calendaire est gardée, « déjà au plan » est dit', async () => {
      accounts.findOne
        .mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
        .mockResolvedValueOnce({ id: 'acc-1', raw_analysis: null } as never)
      items.findOne.mockResolvedValueOnce({
        id: 'i-déjà',
        account_id: 'acc-1',
        label: 'Relancer',
        week_index: MANUAL_ACTION_WEEK_INDEX,
        step_index: 0,
        done: false,
      } as unknown as ActionPlanItemEntity)

      const response = await service.createFromLegacyPlanAction('user-1', 'acc-1', {
        text: 'Relancer',
        deadline: '2026-09-30',
        expected_outcome: 'Obtenir une réponse',
      })

      expect(items.save).not.toHaveBeenCalled()
      expect(response).toEqual({ raw_analysis: {}, added: false })
    })

    // #2871 (#2395.8) — l'objectif est OBLIGATOIRE à la création, même par l'alias.
    it('alias déprécié — sans objectif (ni résultat attendu), la création est REFUSÉE', async () => {
      await expect(service.createFromLegacyPlanAction('user-1', 'acc-1', { text: 'Relancer' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(items.save).not.toHaveBeenCalled()
    })

    it('témoin — un objet qui n’est pas un contact ne déclenche aucune lecture de contact', async () => {
      mineAccount()
      readyToWrite()
      items.findOne.mockResolvedValueOnce(null)

      await service.createFromPlan('user-1', {
        account_id: 'acc-1',
        reason: 'Objectif de test',
        label: 'Avancer le projet',
        target: { kind: 'project', id: 'p-1', label: 'Programme DORA' },
      })

      expect(contacts.findOne).not.toHaveBeenCalled()
    })
  })

  describe('#3287 (#3265.2) — source_recommendation, method_rule, stop_condition, external_execution_id', () => {
    const base = () =>
      ({
        id: 'i1',
        user_id: 'user-1',
        account_id: 'acc-1',
        label: 'A1',
        week_index: 0,
        step_index: 0,
        done: false,
        execution_status: 'todo',
        snoozed_until: null,
        assigned_to: null,
        due_date: null,
        completed_at: null,
        last_reminded_on: null,
        external_execution_id: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }) as unknown as ActionPlanItemEntity

    async function create(extra: Record<string, unknown>) {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', workspace_id: 'ws-1' } as never)
      items.find.mockResolvedValue([{ id: 'i0', account_id: 'acc-1' } as unknown as ActionPlanItemEntity])
      items._qb.getRawOne.mockResolvedValueOnce({ max: null })
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => ({ ...row, id: 'new-1' }))
      return service.createFromPlan('user-1', {
        account_id: 'acc-1',
        label: 'Préparer le renouvellement',
        reason: 'Objectif de test',
        target: null,
        ...extra,
      })
    }

    it('écrit la recommandation source, la règle méthode et la condition d’arrêt de CETTE action', async () => {
      const created = await create({
        source_recommendation: 'renewal_decision',
        method_rule: 'couverture_multi_roles_niveaux_entites',
        stop_condition: 'Le renouvellement est décidé.',
      })
      expect(created).toMatchObject({
        source_recommendation: 'renewal_decision',
        method_rule: 'couverture_multi_roles_niveaux_entites',
        stop_condition: 'Le renouvellement est décidé.',
        external_execution_id: null,
      })
    })

    it('NON — une règle inconnue du corpus est refusée, jamais écrite', async () => {
      await expect(create({ method_rule: 'regle_inventee' })).rejects.toBeInstanceOf(BadRequestException)
      expect(items.save).not.toHaveBeenCalled()
    })

    // #3295 — l'ATTRIBUTION d'une action à une règle APPRISE de l'espace.
    describe('règle apprise de l’espace (learned:<uuid>)', () => {
      const RULE = '0b9f3a52-6c1e-4c53-9b7e-2f4f1f0a9d11'
      let learnedRules: MockRepository<WorkspaceMethodRuleEntity>
      beforeEach(() => {
        learnedRules = createMockRepository<WorkspaceMethodRuleEntity>()
        service = new ActionPlanItemsService(
          items as never,
          plans as never,
          actions as never,
          accounts as never,
          workspace as unknown as WorkspaceContextService,
          contacts as never,
          undefined,
          undefined,
          learnedRules as never,
        )
      })

      it('écrit la référence quand la règle est ACTIVÉE dans cet espace', async () => {
        learnedRules.findOne.mockResolvedValue({ id: RULE, workspace_id: 'ws-1', enabled: true })
        const created = await create({ method_rule: `learned:${RULE}` })
        expect(created.method_rule).toBe(`learned:${RULE}`)
        expect(learnedRules.findOne).toHaveBeenCalledWith({ where: { id: RULE, workspace_id: 'ws-1', enabled: true } })
      })

      it('NON — une règle d’un autre espace, inconnue ou désactivée est refusée, jamais écrite', async () => {
        learnedRules.findOne.mockResolvedValue(null)
        await expect(create({ method_rule: `learned:${RULE}` })).rejects.toBeInstanceOf(BadRequestException)
        expect(items.save).not.toHaveBeenCalled()
      })

      it('NON — une référence mal formée n’est pas lue comme une règle apprise', async () => {
        await expect(create({ method_rule: 'learned:xyz' })).rejects.toBeInstanceOf(BadRequestException)
        expect(learnedRules.findOne).not.toHaveBeenCalled()
      })
    })

    it('sans ces champs, ils restent null — jamais déduits', async () => {
      const created = await create({})
      expect(created).toMatchObject({ source_recommendation: null, method_rule: null, stop_condition: null })
    })

    it('pose l’identifiant d’exécution externe UNE fois', async () => {
      items.findOne.mockResolvedValueOnce(base())
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
      const result = await service.update('user-1', 'i1', { external_execution_id: 'evt-1' })
      expect(result.external_execution_id).toBe('evt-1')
    })

    it('NON — un identifiant déjà posé n’est pas remplacé', async () => {
      items.findOne.mockResolvedValueOnce({ ...base(), external_execution_id: 'evt-1' } as ActionPlanItemEntity)
      items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
      const result = await service.update('user-1', 'i1', { external_execution_id: 'evt-2' })
      expect(result.external_execution_id).toBe('evt-1')
    })

    // #3777.9 (18/10) — même identifiant ⇒ pas de double exécution : une exécution externe ne se rattache qu'à UNE action.
    it('NON — un identifiant déjà porté par une AUTRE action du même propriétaire est refusé, rien n’est écrit', async () => {
      items.findOne
        .mockResolvedValueOnce(base())
        .mockResolvedValueOnce({ ...base(), id: 'i2', external_execution_id: 'evt-1' } as ActionPlanItemEntity)
      items.save.mockClear()
      await expect(service.update('user-1', 'i1', { external_execution_id: 'evt-1' })).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(items.save).not.toHaveBeenCalled()
    })
  })
})

// #3211.9 (#3234, lot M11 09/10) — la FILE PROACTIVE des issues manquantes.
describe('ActionPlanItemsService.listDoneWithoutOutcome', () => {
  it('lit MES actions faites sans issue, sur l’espace actif, les 30 derniers jours', async () => {
    const items = createMockRepository<ActionPlanItemEntity>()
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
    items.query.mockResolvedValueOnce([
      {
        id: 'i1',
        label: 'Relancer le DSI',
        account_id: 'acc-1',
        company_name: ' Acme ',
        completed_at: new Date('2026-10-01T10:00:00Z'),
        completion_mode: 'proof',
        target_kind: 'contact',
      },
    ])
    const service = new ActionPlanItemsService(
      items as never,
      createMockRepository() as never,
      createMockRepository() as never,
      createMockRepository() as never,
      workspace as never,
      createMockRepository() as never,
    )

    const rows = await service.listDoneWithoutOutcome('user-1')

    expect(rows).toEqual([
      {
        id: 'i1',
        label: 'Relancer le DSI',
        account_id: 'acc-1',
        company_name: 'Acme',
        completed_at: '2026-10-01T10:00:00.000Z',
        completion_mode: 'proof',
        target_kind: 'contact',
      },
    ])
    const [sql, params] = items.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['user-1', 'ws-1'])
    expect(sql).toContain("item.execution_status = 'done'")
    expect(sql).toContain('item.outcome IS NULL')
    expect(sql).toContain('account.workspace_id = $2')
    expect(sql).toContain("interval '30 days'")
  })

  it('SAIT DIRE NON — une lecture en échec rend null, jamais « rien à déclarer »', async () => {
    const items = createMockRepository<ActionPlanItemEntity>()
    items.query.mockRejectedValueOnce(new Error('db down'))
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
    const service = new ActionPlanItemsService(
      items as never,
      createMockRepository() as never,
      createMockRepository() as never,
      createMockRepository() as never,
      workspace as never,
      createMockRepository() as never,
    )
    await expect(service.listDoneWithoutOutcome('user-1')).resolves.toBeNull()
  })
})

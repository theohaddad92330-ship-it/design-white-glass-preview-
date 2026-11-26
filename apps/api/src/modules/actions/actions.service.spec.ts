import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ActionsService } from './actions.service'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { DEMO_USER_ACTIONS } from '../demo/demo-dataset'

describe('ActionsService', () => {
  let service: ActionsService
  let repo: MockRepository<UserActionEntity>
  let accounts: MockRepository<AccountEntity>
  let contacts: MockRepository<ContactEntity>

  beforeEach(() => {
    repo = createMockRepository<UserActionEntity>()
    accounts = createMockRepository<AccountEntity>()
    contacts = createMockRepository<ContactEntity>()
    service = new ActionsService(repo as never, accounts as never, contacts as never)
  })

  describe('track', () => {
    it('stamps both the actor user_id and the active workspace_id', async () => {
      // Account + contact belong to the caller → ownership checks pass.
      accounts.count.mockResolvedValueOnce(1)
      contacts.count.mockResolvedValueOnce(1)
      repo.save.mockResolvedValueOnce({ id: 'action-1' } as UserActionEntity)
      const result = await service.track(
        { action_type: 'message_sent', account_id: 'acc-1', contact_id: 'contact-1', channel: 'linkedin' },
        'user-1',
        'ws-1',
      )
      expect(result).toEqual({ id: 'action-1' })
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          workspace_id: 'ws-1',
          action_type: 'message_sent',
          account_id: 'acc-1',
        }),
      )
    })

    it('rejects an account_id that does not belong to the caller (IDOR guard)', async () => {
      accounts.count.mockResolvedValueOnce(0) // foreign account
      await expect(
        service.track({ action_type: 'message_sent', account_id: 'foreign-acc' }, 'user-1', 'ws-1'),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.save).not.toHaveBeenCalled()
      // Ownership is checked scoped to workspace OR created-by, never id alone.
      expect(accounts.count).toHaveBeenCalledWith({
        where: [
          { id: 'foreign-acc', workspace_id: 'ws-1' },
          { id: 'foreign-acc', user_id: 'user-1' },
        ],
      })
    })

    it('rejects a contact_id that does not belong to the caller (IDOR guard)', async () => {
      accounts.count.mockResolvedValueOnce(1)
      contacts.count.mockResolvedValueOnce(0) // foreign contact
      await expect(
        service.track(
          { action_type: 'message_sent', account_id: 'acc-1', contact_id: 'foreign-contact' },
          'user-1',
          'ws-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('skips ownership checks when no account/contact id is provided', async () => {
      repo.save.mockResolvedValueOnce({ id: 'action-2' } as UserActionEntity)
      await service.track({ action_type: 'analysis_started' }, 'user-1', 'ws-1')
      expect(accounts.count).not.toHaveBeenCalled()
      expect(contacts.count).not.toHaveBeenCalled()
    })
  })

  describe('getWeeklyStats', () => {
    it('aggregates action types into weekly stats, scoped by workspace_id', async () => {
      const rows = [
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
        { action_type: 'response_received', metadata: {} },
        { action_type: 'rdv_obtained', metadata: {} },
        { action_type: 'message_copied', metadata: {} },
      ] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)
      const stats = await service.getWeeklyStats('ws-1')
      expect(stats).toEqual({
        messages_sent: 2,
        messages_breakdown: { verified: 2, declared: 0, unattributed: 0, total: 2 },
        messages_copied: 1,
        responses: 1,
        rdv_obtained: 1,
        response_rate: '50%',
      })
      // Read is scoped by workspace_id, never user_id.
      const where = repo.find.mock.calls[0][0].where as Record<string, unknown>
      expect(where).toEqual(expect.objectContaining({ workspace_id: 'ws-1' }))
      expect(where).not.toHaveProperty('user_id')
    })

    it('says « non mesuré » — and not 0 — when the repo throws', async () => {
      // Une lecture qui échoue ne mesure rien. Rendre `0` ferait passer une panne
      // pour un résultat : à l'écran, « cassé » et « non mesurable » se
      // ressemblent, et seul le repli honnête les distingue.
      repo.find.mockRejectedValueOnce(new Error('boom'))
      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.response_rate).toBeNull()
      expect(stats.responses).toBeNull()
      expect(stats.rdv_obtained).toBeNull()
      expect(stats.messages_breakdown).toEqual({ verified: 0, declared: 0, unattributed: 0, total: 0 })
    })

    it('says « non mesuré » when the workspace has NEVER logged an outcome', async () => {
      // Le défaut que ce lot corrige : `response_received` / `rdv_obtained`
      // étaient lus par la production et écrits par PERSONNE. « Taux de réponse
      // 0 % » affirmait qu'on avait mesuré les réponses et qu'il n'y en avait eu
      // aucune ; la vérité était qu'aucun écran n'offrait le moyen d'en
      // enregistrer une.
      const rows = [{ action_type: 'message_sent', metadata: { via: 'bellum' } }] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)
      repo.count.mockResolvedValue(0) // jamais rien consigné, depuis toujours

      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.responses).toBeNull()
      expect(stats.rdv_obtained).toBeNull()
      expect(stats.response_rate).toBeNull()
      // …et le reste continue de se mesurer normalement.
      expect(stats.messages_sent).toBe(1)
    })

    it('keeps a TRUE zero when the family was logged before, but not this week', async () => {
      // L'autre moitié de la règle : une fois qu'un espace a consigné une issue,
      // « aucune cette semaine » EST une mesure. La rendre « non mesuré » serait
      // le défaut symétrique — effacer un vrai zéro.
      const rows = [{ action_type: 'message_sent', metadata: { via: 'bellum' } }] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)
      repo.count.mockResolvedValue(3) // trois réponses consignées, toutes hors fenêtre

      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.responses).toBe(0)
      expect(stats.rdv_obtained).toBe(0)
      expect(stats.response_rate).toBe('0%')
    })

    it('probes « ever logged » scoped by workspace, and only when the window is empty', async () => {
      // Une occurrence dans la fenêtre PROUVE déjà que l'espace sait en produire :
      // la sonde n'a alors rien à demander.
      const rows = [
        { action_type: 'response_received', metadata: {} },
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
      ] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.responses).toBe(1)
      // `response_received` était dans la fenêtre → aucune sonde pour lui ;
      // `rdv_obtained` n'y était pas → une sonde, scopée à l'espace.
      expect(repo.count).toHaveBeenCalledTimes(1)
      expect(repo.count).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', action_type: 'rdv_obtained' } })
    })

    it('never derives a rate from an empty denominator', async () => {
      // « Taux de réponse 0 % » sur un espace qui n'a envoyé AUCUN message décrit
      // une contre-performance qui n'a pas eu lieu : il n'y a rien à diviser.
      repo.find.mockResolvedValueOnce([
        { action_type: 'response_received', metadata: {} },
      ] as unknown as UserActionEntity[])
      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.responses).toBe(1)
      expect(stats.messages_sent).toBe(0)
      expect(stats.response_rate).toBeNull()
    })

    it('counts declared LinkedIn sends in the total, but separated from verified ones', async () => {
      // Le bug corrigé : ce compteur ignorait `plan_action_message_sent`, là où
      // les KPIs manager le comptaient — le même travail donnait deux chiffres
      // selon l'écran. Les deux lisent désormais le même total.
      const rows = [
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration', declared: true } },
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration', declared: true } },
      ] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.messages_sent).toBe(3)
      expect(stats.messages_breakdown).toEqual({ verified: 1, declared: 2, unattributed: 0, total: 3 })
    })

    it('never counts a provenance-less historical row as verified', async () => {
      // Les lignes écrites avant le marquage `metadata.via` ne prouvent rien :
      // elles restent visibles dans le total mais ne peuvent pas se faire passer
      // pour des envois confirmés.
      const rows = [
        { action_type: 'message_sent', metadata: {} },
        { action_type: 'plan_action_message_sent', metadata: {} },
      ] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.messages_sent).toBe(2)
      expect(stats.messages_breakdown.verified).toBe(0)
      expect(stats.messages_breakdown.unattributed).toBe(2)
    })

    it('loads metadata — without it, provenance cannot be established', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.getWeeklyStats('ws-1')
      const select = repo.find.mock.calls[0][0].select as string[]
      expect(select).toContain('metadata')
    })

    it('derives the response rate from the full send total, not from verified sends alone', async () => {
      // Les réponses arrivent aussi sur les envois LinkedIn déclarés : les
      // diviser par les seuls emails vérifiés gonflerait artificiellement le taux.
      const rows = [
        { action_type: 'message_sent', metadata: { via: 'bellum' } },
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration' } },
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration' } },
        { action_type: 'plan_action_message_sent', metadata: { via: 'declaration' } },
        { action_type: 'response_received', metadata: {} },
      ] as unknown as UserActionEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const stats = await service.getWeeklyStats('ws-1')
      expect(stats.response_rate).toBe('25%') // 1/4, et non 1/1 = 100%
    })
  })

  describe('listHistory', () => {
    it('maps tracked actions to history rows', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          action_id: '44444444-4444-4444-8444-444444444401',
          action_type: 'message_sent',
          channel: 'email',
          metadata: { detail: 'Email de présentation' },
          created_at: new Date('2026-07-07T08:00:00.000Z'),
          user_id: '00000000-0000-4000-8000-000000000001',
          actor_first_name: 'Mattéo',
          actor_last_name: 'Leddé',
          actor_email: 'matteo@example.com',
          account_id: '11111111-1111-4111-8111-111111111111',
          account_name: 'Nordia Group',
          contact_id: null,
          contact_name: null,
        },
      ])

      const history = await service.listHistory('ws-1', { limit: 25 })

      // History reads scope by workspace_id (the actor join stays on user_id).
      expect(repo._qb.where).toHaveBeenCalledWith('action.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      // The account/contact joins must be tenant-scoped so a planted foreign id
      // can't leak another workspace's company_name / contact name.
      expect(repo._qb.leftJoin).toHaveBeenCalledWith(
        'accounts',
        'account',
        expect.stringContaining('account.workspace_id = action.workspace_id'),
      )
      expect(repo._qb.leftJoin).toHaveBeenCalledWith(
        'contacts',
        'contact',
        expect.stringContaining('contact.workspace_id = action.workspace_id'),
      )
      expect(history.data).toHaveLength(1)
      expect(history.data[0]).toMatchObject({
        action_label: 'Message envoyé',
        category: 'message',
        detail: 'Email de présentation',
        status: 'Envoyé',
        target: { label: 'Nordia Group', initials: 'NG' },
        actor: { name: 'Mattéo Leddé', initials: 'ML' },
      })
      expect(history.pagination.totalItems).toBe(1)
    })

    it('#3388 (recette 30/09) — le stade commercial du compte visé est rattaché, pas recalculé', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          action_id: '44444444-4444-4444-8444-444444444402',
          action_type: 'message_sent',
          channel: 'email',
          metadata: { detail: 'Relance' },
          created_at: new Date('2026-07-07T08:00:00.000Z'),
          user_id: '00000000-0000-4000-8000-000000000001',
          actor_first_name: 'Mattéo',
          actor_last_name: 'Leddé',
          actor_email: 'matteo@example.com',
          account_id: '11111111-1111-4111-8111-111111111111',
          account_name: 'Nordia Group',
          contact_id: null,
          contact_name: null,
          // `qualified` ⇒ `besoin_confirme` (STAGE_BY_SUBJECT['need'], commercial-state-machine.ts).
          latest_need_status: 'qualified',
        },
      ])

      const history = await service.listHistory('ws-1', { limit: 25 })

      expect(history.data[0]?.target.commercial_stage).toBe('besoin_confirme')
    })

    it('#3388 — aucun besoin sur le compte : le stade sort `null`, jamais deviné', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          action_id: '44444444-4444-4444-8444-444444444403',
          action_type: 'message_sent',
          channel: 'email',
          metadata: { detail: 'Relance' },
          created_at: new Date('2026-07-07T08:00:00.000Z'),
          user_id: '00000000-0000-4000-8000-000000000001',
          actor_first_name: 'Mattéo',
          actor_last_name: 'Leddé',
          actor_email: 'matteo@example.com',
          account_id: '11111111-1111-4111-8111-111111111111',
          account_name: 'Nordia Group',
          contact_id: null,
          contact_name: null,
          latest_need_status: null,
        },
      ])

      const history = await service.listHistory('ws-1', { limit: 25 })

      expect(history.data[0]?.target.commercial_stage).toBeNull()
    })

    // « La page permet une recherche par compte, membre, type et date » : sans
    // ces deux clauses, chercher « qui a fait quoi chez Decathlon » obligeait à
    // faire défiler tout le journal de l'équipe.
    it('recherche par compte — fragment du nom, insensible à la casse', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', { account: 'decathlon' })

      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.company_name ILIKE :accountSearch', {
        accountSearch: '%decathlon%',
      })
    })

    // Théo B R2.A5 — l'historique est celui de l'espace ; « moi » le restreint à l'appelant.
    it('scope=me restreint à l’appelant ; sans scope, tout l’espace', async () => {
      repo._qb.getCount.mockResolvedValue(0)
      repo._qb.getRawMany.mockResolvedValue([])

      await service.listHistory('ws-1', {}, 'user-9')
      expect(repo._qb.andWhere).not.toHaveBeenCalledWith('action.user_id = :viewerId', expect.anything())

      await service.listHistory('ws-1', { scope: 'space' }, 'user-9')
      expect(repo._qb.andWhere).not.toHaveBeenCalledWith('action.user_id = :viewerId', expect.anything())

      await service.listHistory('ws-1', { scope: 'me' }, 'user-9')
      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.user_id = :viewerId', { viewerId: 'user-9' })
    })

    it('filtre par membre sur l’auteur de l’action, jamais sur la cible', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', { actorId: '00000000-0000-4000-8000-000000000001' })

      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.user_id = :actorId', {
        actorId: '00000000-0000-4000-8000-000000000001',
      })
    })

    // #2200.38 — le journal ne se filtrait pas par canal alors que chaque ligne
    // le porte déjà (`channel`, nullable). Sans ce filtre, « que s'est-il passé
    // sur LinkedIn » obligeait à relire toutes les lignes du journal.
    it('filtre par canal — #2200.38', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', { channel: 'linkedin' })

      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.channel = :channel', { channel: 'linkedin' })
    })

    it('sans filtre utilisateur, seule la clause de repli des runs est posée', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', {})

      // Un run = une ligne : la ligne « Analyse terminée » redondante est exclue.
      // C'est la seule clause quand l'utilisateur ne filtre rien.
      expect(repo._qb.andWhere).toHaveBeenCalledTimes(1)
      expect(repo._qb.andWhere).toHaveBeenCalledWith("action.action_type <> 'analysis_completed'")
    })

    it('replie chaque run en une ligne (exclut « Analyse terminée » du flux)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', { type: 'analysis' })

      // Le filtre « analyse » ne vise plus que la ligne conservée…
      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.action_type IN (:...actionTypes)', {
        actionTypes: ['analysis_started'],
      })
      // …et la ligne redondante est exclue du flux dans tous les cas.
      expect(repo._qb.andWhere).toHaveBeenCalledWith("action.action_type <> 'analysis_completed'")
    })

    it('« Terminée » englobe une analyse dont le run a abouti, via la jointure run', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', { status: 'Terminée' })

      // La jointure sur `analysis_runs` est posée…
      expect(repo._qb.leftJoin).toHaveBeenCalledWith(
        'analysis_runs',
        'run',
        "action.action_type = 'analysis_started' AND run.id::text = action.metadata->>'analysis_run_id'",
      )
      // …et le filtre inclut le run terminé À CÔTÉ des actions de plan terminées.
      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        "(action.action_type IN (:...statusTypes) OR (action.action_type = 'analysis_started' AND run.status = :completedRunStatus))",
        { statusTypes: ['plan_action_completed'], completedRunStatus: 'completed' },
      )
    })

    // Mode « Depuis votre dernière connexion » (§8) : borne basse EXCLUSIVE sur
    // le repère posé au sign-in.
    it('filtre « depuis » : borne created_at STRICTEMENT au-delà du repère', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.listHistory('ws-1', { since: '2026-07-22T18:00:00.000Z' })

      // `>` et non `>=` : l'instant-repère lui-même est exclu de la fenêtre.
      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.created_at > :since', {
        since: '2026-07-22T18:00:00.000Z',
      })
    })
  })

  // §8 « Historique » — l'historique traçait analyses/enrichissements/exports/
  // messages, jamais un changement de score ni de profil. Ces deux événements
  // système se rendent maintenant dans le journal, avec un badge de sens.
  describe('listHistory — restitution des événements système §8', () => {
    function rawRow(overrides: Record<string, unknown>) {
      return {
        action_id: '44444444-4444-4444-8444-444444444490',
        channel: null,
        created_at: new Date('2026-07-23T08:00:00.000Z'),
        user_id: '00000000-0000-4000-8000-000000000001',
        actor_first_name: 'Théo',
        actor_last_name: 'P',
        actor_email: 't@example.com',
        account_id: '11111111-1111-4111-8111-111111111111',
        account_name: 'Decathlon',
        contact_id: null,
        contact_name: null,
        ...overrides,
      }
    }

    it('un score en hausse : catégorie analyse, détail « 6 → 8 », badge « En hausse »', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'account_score_changed', metadata: { from: 6, to: 8 } }),
      ])

      const history = await service.listHistory('ws-1', {})

      expect(history.data[0]).toMatchObject({
        action_type: 'account_score_changed',
        category: 'analysis',
        action_label: 'Score mis à jour',
        detail: '6 → 8',
        status: 'En hausse',
      })
    })

    it('un score en baisse porte le badge « En baisse »', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'account_score_changed', metadata: { from: 8, to: 5 } }),
      ])

      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ detail: '8 → 5', status: 'En baisse' })
    })

    it('une mise à jour de profil se rend avec son libellé et le badge « Mis à jour »', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'profile_updated', account_id: null, account_name: null, metadata: {} }),
      ])

      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({
        action_type: 'profile_updated',
        category: 'other',
        action_label: 'Profil ESN mis à jour',
        status: 'Mis à jour',
      })
    })
  })

  describe('listHistory — le rollback offert, épopée #2771 (#2277.33/.35/.36)', () => {
    function rawRow(overrides: Record<string, unknown>) {
      return {
        action_id: '44444444-4444-4444-8444-444444444491',
        channel: null,
        created_at: new Date('2026-09-25T08:00:00.000Z'),
        user_id: '00000000-0000-4000-8000-000000000001',
        actor_first_name: 'Théo',
        actor_last_name: 'P',
        actor_email: 't@example.com',
        account_id: '11111111-1111-4111-8111-111111111111',
        account_name: 'Decathlon',
        contact_id: '22222222-2222-4222-8222-222222222222',
        contact_name: 'Alix Martin',
        ...overrides,
      }
    }

    it('un rappel programmé (schedule_reminder) offre `cancel_reminder`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'plan_action_added', metadata: { router_intent: 'schedule_reminder' } }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ status: 'Programmé', rollback: 'cancel_reminder' })
    })

    it('un rappel déjà annulé n’offre plus rien, et le dit', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'plan_action_added',
          metadata: { router_intent: 'schedule_reminder', cancelled_at: '2026-09-25T09:00:00.000Z' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ status: 'Annulé', rollback: null })
    })

    it('un événement de calendrier (même action_type) n’offre PAS `cancel_reminder` — pas de compensateur', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'plan_action_added', metadata: { router_intent: 'create_calendar_event' } }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0].rollback).toBeNull()
    })

    it('une tâche CRM créée depuis le routeur offre `remove_crm_task`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'crm_task_created', metadata: { router_intent: 'create_crm_task' } }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ status: 'Créée', rollback: 'remove_crm_task' })
    })

    it('une tâche CRM déjà retirée n’offre plus rien', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'crm_task_created',
          metadata: { router_intent: 'create_crm_task', withdrawn_at: '2026-09-25T09:00:00.000Z' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ status: 'Retirée', rollback: null })
    })

    // #2319.114 (épopée #2985) — la clôture d'une tâche CRM par la porte
    // d'écriture. Seul HubSpot sait fermer une tâche depuis ce dépôt : la
    // ligne dit NON tant que le fournisseur ou la référence externe manquent.
    it('une tâche CRM créée chez HubSpot avec sa référence externe offre `crmTaskClosable`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'crm_task_created',
          metadata: { router_intent: 'create_crm_task', crm_provider: 'hubspot', external_ref: 'task-1' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ crmTaskClosable: true })
    })

    it('une tâche CRM créée chez un autre fournisseur n’offre PAS `crmTaskClosable`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'crm_task_created',
          metadata: { router_intent: 'create_crm_task', crm_provider: 'salesforce', external_ref: 'task-1' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ crmTaskClosable: false })
    })

    it('une tâche CRM déjà clôturée le dit, et n’offre plus ni clôture ni retrait', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'crm_task_created',
          metadata: {
            router_intent: 'create_crm_task',
            crm_provider: 'hubspot',
            external_ref: 'task-1',
            closed_at: '2026-09-27T09:00:00.000Z',
          },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ status: 'Terminée', rollback: null, crmTaskClosable: false })
    })

    it('une réponse consignée avec un statut antérieur tracé offre `restore_status`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'response_received', metadata: { previous_status: 'a_contacter' } }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({
        action_label: 'Réponse consignée',
        status: 'Consignée',
        rollback: 'restore_status',
      })
    })

    it('sans statut antérieur tracé (jamais deviné), aucun rollback', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([rawRow({ action_type: 'rdv_obtained', metadata: {} })])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0].rollback).toBeNull()
    })

    it('sur une déclaration de COMPTE (sans contact), aucun rollback — restore_status ne couvre pas ce périmètre', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'deal_signed',
          contact_id: null,
          contact_name: null,
          metadata: { previous_status: 'qualification' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0].rollback).toBeNull()
    })

    it('un statut déjà restauré n’offre plus rien', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({
          action_type: 'response_received',
          metadata: { previous_status: 'a_contacter', restored_at: '2026-09-25T09:00:00.000Z' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0]).toMatchObject({ status: 'Restauré', rollback: null })
    })

    // Recette écran du 26/09 (#2771) : 5 actions « appliquées » vues en prod
    // (message envoyé, plan terminé…) n'affichaient aucun bouton de retour en
    // arrière — question posée : l'affordance est-elle scopée aux seuls kinds
    // rappel/statut/tâche CRM, ou un bouton manque-t-il ? Les deux tests
    // suivants tranchent avec les VRAIES métadonnées de la démo (pas des
    // fixtures inventées) : la scope est voulue, la démo la prouve déjà.
    // Décision Louis 04/10/2026 — la démo ne sème plus « réponse reçue », « RDV
    // décroché » ni l'e-mail vérifié : chacun attribuait un échange à une
    // personne (« aucune déclaration inventée sur une personne réelle »). Le
    // comportement reste prouvé sur des lignes de la même forme.
    it('la démo ne sème plus d’issue déclarée ni d’e-mail vérifié sur une personne (#2771, décision Louis 04/10)', () => {
      const personal = DEMO_USER_ACTIONS.filter(a =>
        ['response_received', 'rdv_obtained', 'message_sent'].includes(a.action_type),
      )
      expect(personal).toEqual([])
    })

    it('une issue déclarée (réponse, RDV) est éligible au rollback (#2771)', async () => {
      const declared = { via: 'declaration', declared: true, previous_status: 'contacted' }
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_id: 'r-response', action_type: 'response_received', metadata: declared }),
        rawRow({
          action_id: 'r-rdv',
          action_type: 'rdv_obtained',
          metadata: { ...declared, previous_status: 'replied' },
        }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0].rollback).toBe('restore_status')
      expect(history.data[1].rollback).toBe('restore_status')
    })

    it('un e-mail envoyé n’offre PAS de rollback — un envoi réel ne se défait pas (#2771)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        rawRow({ action_type: 'message_sent', metadata: { subject: 'Synthèse', via: 'bellum' } }),
      ])
      const history = await service.listHistory('ws-1', {})
      expect(history.data[0].rollback).toBeNull()
    })
  })

  describe('getHistoryItem', () => {
    it('returns one history item scoped to the workspace', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          action_id: '44444444-4444-4444-8444-444444444402',
          action_type: 'analysis_completed',
          channel: null,
          metadata: {},
          created_at: new Date('2026-07-07T08:00:00.000Z'),
          user_id: '00000000-0000-4000-8000-000000000001',
          actor_first_name: null,
          actor_last_name: null,
          actor_email: 'demo@bellum-ai.com',
          account_id: '11111111-1111-4111-8111-111111111111',
          account_name: 'Nordia Group',
          contact_id: null,
          contact_name: null,
        },
      ])

      const item = await service.getHistoryItem('ws-1', '44444444-4444-4444-8444-444444444402')

      expect(item).toMatchObject({ action_label: 'Analyse terminée', status: 'Terminée' })
      expect(repo._qb.where).toHaveBeenCalledWith('action.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.id = :id', {
        id: '44444444-4444-4444-8444-444444444402',
      })
    })
  })

  // #4455 — l'ancienne adresse `/actions/ecritures` tombe sur la route web `/actions/$id`, qui demande
  // `GET /actions/history/ecritures` : Postgres refusait l'uuid et la page recevait un 500.
  describe('getHistoryItem — identifiant qui n’est pas un uuid (#4455)', () => {
    it.each(['ecritures', 'not-a-uuid', ''])('« %s » ⇒ 404, sans requête SQL', async id => {
      await expect(service.getHistoryItem('ws-1', id)).rejects.toBeInstanceOf(NotFoundException)
      expect(repo._qb.getRawMany).not.toHaveBeenCalled()
    })
  })

  describe('listPersonalMessages (personal cockpit)', () => {
    it('scopes the message feed to the acting user, message types only', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          action_id: '55555555-5555-4555-8555-555555555501',
          action_type: 'message_sent',
          channel: 'email',
          metadata: {},
          created_at: new Date('2026-07-15T10:00:00.000Z'),
          user_id: 'user-1',
          actor_first_name: 'Léa',
          actor_last_name: 'Martin',
          actor_email: 'lea@esn.fr',
          account_id: null,
          account_name: 'ACME',
          contact_id: null,
          contact_name: null,
        },
      ])

      const items = await service.listPersonalMessages('user-1', 5)

      // Personal scope = the actor's own rows (action.user_id), NOT the workspace.
      expect(repo._qb.where).toHaveBeenCalledWith('action.user_id = :userId', { userId: 'user-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('action.action_type IN (:...messageTypes)', {
        messageTypes: ['message_sent', 'message_copied', 'plan_action_message_sent', 'plan_action_message_copied'],
      })
      expect(repo._qb.limit).toHaveBeenCalledWith(5)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({ action_label: 'Message envoyé', category: 'message', actor: { id: 'user-1' } })
    })
  })

  describe('countMessagesSince (personal cockpit)', () => {
    it('counts only the acting user’s message actions', async () => {
      repo.count.mockResolvedValueOnce(3)
      const n = await service.countMessagesSince('user-1', new Date('2026-07-08T00:00:00.000Z'))
      expect(n).toBe(3)
      const where = (repo.count.mock.calls[0]?.[0] as { where?: { user_id?: string } } | undefined)?.where
      expect(where).toMatchObject({ user_id: 'user-1' })
    })

    /**
     * ⚠️ Ce test sait dire NON : avant le correctif, la fonction attrapait
     * l'erreur et rendait `0`. Le cockpit affichait alors « 0 message cette
     * semaine » sur une requête cassée — un chiffre indiscernable d'une
     * semaine réellement sans envoi. « Non mesuré » n'est jamais « 0 ».
     */
    it('laisse REMONTER une panne au lieu de la taire à zéro', async () => {
      repo.count.mockRejectedValueOnce(new Error('connection terminated'))
      await expect(service.countMessagesSince('user-1', new Date('2026-07-08T00:00:00.000Z'))).rejects.toThrow(
        'connection terminated',
      )
    })
  })
})

/**
 * « Analyse lancée » affichait le statut CONSTANT « En cours », dérivé du type
 * d'action — un événement passé, immuable. Le badge ne pouvait donc jamais
 * cesser de dire « en cours ». Deux conséquences vues en prod : une ligne
 * « En cours » éternelle à côté de sa « Terminée », et surtout un run MORT
 * strictement indiscernable d'un run vivant — un échec réel rendu comme une
 * progression normale.
 */
describe('ActionsService — l’issue d’une analyse vient du run, pas du type d’action', () => {
  const RUN_ID = '11111111-1111-1111-1111-111111111111'

  function historyRow(overrides: Record<string, unknown> = {}) {
    return {
      action_id: 'a-1',
      action_type: 'analysis_started',
      channel: null,
      metadata: { detail: 'Analyse lancée', analysis_run_id: RUN_ID },
      created_at: new Date('2026-07-20T18:41:00Z'),
      user_id: 'u-1',
      actor_first_name: 'Louis',
      actor_last_name: 'S',
      actor_email: 'l@example.com',
      account_id: 'acc-1',
      account_name: 'ALSEDIS',
      contact_id: null,
      contact_name: null,
      ...overrides,
    }
  }

  /** Wire a service whose history query returns `rows` and whose analysis_runs
   *  repo returns `runs`. */
  function buildService(rows: unknown[], runs: Array<{ id: string; status: string; created_at: Date }> | Error) {
    const repo = createMockRepository<UserActionEntity>()
    const accounts = createMockRepository<AccountEntity>()
    const contacts = createMockRepository<ContactEntity>()
    const analysisRuns = createMockRepository<AnalysisRunEntity>()

    const builder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(rows.length),
      getRawMany: jest.fn().mockResolvedValue(rows),
    }
    repo.createQueryBuilder.mockReturnValue(builder as never)
    if (runs instanceof Error) analysisRuns.find.mockRejectedValue(runs)
    else analysisRuns.find.mockResolvedValue(runs as never)

    return new ActionsService(repo as never, accounts as never, contacts as never, undefined, analysisRuns as never)
  }

  async function statusOf(
    runs: Array<{ id: string; status: string; created_at: Date }> | Error,
    row = historyRow(),
  ): Promise<string | undefined> {
    const service = buildService([row], runs)
    const result = await service.listHistory('ws-1', {})
    return result.data[0].status
  }

  it('un run terminé affiche « Terminée », pas « En cours » à vie', async () => {
    expect(await statusOf([{ id: RUN_ID, status: 'completed', created_at: new Date() }])).toBe('Terminée')
  })

  // LE défaut : un échec était invisible.
  it('un run ÉCHOUÉ affiche « Échouée » — un échec ne peut plus passer pour un succès', async () => {
    expect(await statusOf([{ id: RUN_ID, status: 'error', created_at: new Date() }])).toBe('Échouée')
  })

  it('un run annulé affiche « Annulée »', async () => {
    expect(await statusOf([{ id: RUN_ID, status: 'canceled', created_at: new Date() }])).toBe('Annulée')
  })

  it('un run réellement en cours affiche « En cours » — le cas où c’était vrai', async () => {
    expect(await statusOf([{ id: RUN_ID, status: 'analyzing', created_at: new Date() }])).toBe('En cours')
  })

  // Ni « En cours » (il ne travaille plus), ni « Échouée » (on n'en sait rien).
  it('un run abandonné au-delà du plafond affiche « Sans suite », jamais « En cours »', async () => {
    const old = new Date(Date.now() - 25 * 60 * 1000)
    expect(await statusOf([{ id: RUN_ID, status: 'analyzing', created_at: old }])).toBe('Sans suite')
  })

  it('une ligne SANS clé de corrélation (héritée) n’affiche AUCUN statut', async () => {
    const legacy = historyRow({ metadata: { detail: 'Analyse lancée' } })
    expect(await statusOf([], legacy)).toBeUndefined()
  })

  it('un run introuvable n’invente pas d’issue', async () => {
    expect(await statusOf([])).toBeUndefined()
  })

  it('un échec de lecture des runs dégrade en issue inconnue, pas en « En cours »', async () => {
    expect(await statusOf(new Error('db down'))).toBeUndefined()
  })

  it('ne requête pas les runs quand aucune ligne d’analyse n’est présente', async () => {
    const messageRow = historyRow({ action_type: 'message_sent', metadata: {}, channel: 'email' })
    const repo = createMockRepository<UserActionEntity>()
    const analysisRuns = createMockRepository<AnalysisRunEntity>()
    const builder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getRawMany: jest.fn().mockResolvedValue([messageRow]),
    }
    repo.createQueryBuilder.mockReturnValue(builder as never)

    const service = new ActionsService(
      repo as never,
      createMockRepository<AccountEntity>() as never,
      createMockRepository<ContactEntity>() as never,
      undefined,
      analysisRuns as never,
    )
    const result = await service.listHistory('ws-1', {})

    expect(analysisRuns.find).not.toHaveBeenCalled()
    expect(result.data[0].status).toBe('Envoyé')
  })
})

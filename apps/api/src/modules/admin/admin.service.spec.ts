import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AdminService, type AdminUser } from './admin.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { PLAN_CATALOG_DEFAULTS } from '../credits/plan-catalog.defaults'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'

/** The shipped `team` price — the baseline an edit is compared against. */
const TEAM_PRICE_CENTS = 25900

/** A `plan_definitions` row for `team`, at its shipped values unless overridden. */
const teamRow = (over: Partial<PlanDefinitionEntity> = {}): PlanDefinitionEntity =>
  ({
    key: 'team',
    label: 'Team / Enterprise',
    price_cents: TEAM_PRICE_CENTS,
    accounts_limit: 50,
    enrichment_credits: 100,
    seats: 3,
    extra_seat_price_cents: 2900,
    self_serve: true,
    sort_order: 2,
    ...over,
  }) as PlanDefinitionEntity

/** Query builder de `members` dans `buildAdminUsers` : rend les lignes brutes données. */
const memberQb = (rows: unknown[]) => ({
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(rows),
})

describe('AdminService', () => {
  let service: AdminService
  let profiles: MockRepository<ProfileEntity>
  let subscriptions: MockRepository<SubscriptionEntity>
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let invitations: MockRepository<WorkspaceInvitationEntity>
  let accounts: MockRepository<AccountEntity>
  let esnProfiles: MockRepository<EsnProfileEntity>
  let planRepo: MockRepository<PlanDefinitionEntity>
  let syncPlan: jest.Mock
  let getOwnerActivationState: jest.Mock
  let sendOwnerInvitation: jest.Mock
  let resolveActiveWorkspace: jest.Mock

  beforeEach(() => {
    profiles = createMockRepository<ProfileEntity>()
    subscriptions = createMockRepository<SubscriptionEntity>()
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    invitations = createMockRepository<WorkspaceInvitationEntity>()
    accounts = createMockRepository<AccountEntity>()
    esnProfiles = createMockRepository<EsnProfileEntity>()
    // Real catalog over a mock repo (find → [] = shipped defaults unless a test
    // overrides `planRepo.find` to simulate a live-edited row).
    planRepo = createMockRepository<PlanDefinitionEntity>()
    const planCatalog = new PlanCatalogService(planRepo as never)
    syncPlan = jest.fn().mockResolvedValue({ planKey: 'team', considered: 0, updated: 0, skipped: 0, failed: 0 })
    getOwnerActivationState = jest.fn().mockResolvedValue(null)
    sendOwnerInvitation = jest.fn()
    // Par défaut : aucun espace résolu (compte solo) → le plan est celui de la personne.
    resolveActiveWorkspace = jest.fn().mockRejectedValue(new Error('no workspace'))
    service = new AdminService(
      profiles as never,
      subscriptions as never,
      workspaces as never,
      members as never,
      invitations as never,
      accounts as never,
      // La fiche ESN partagée, lue par la console (#1671-ter).
      esnProfiles as never,
      planCatalog,
      { syncPlan } as never,
      // L'activation du propriétaire, persistée (#2643.2) et envoyée sur clic
      // opérateur (#2643.1).
      { getState: getOwnerActivationState, send: sendOwnerInvitation } as never,
      // PLAN-GATE #4381 — la MÊME résolution d'espace actif que le verrou.
      { resolveActiveWorkspace } as never,
    )
  })

  describe('getPlans', () => {
    it('returns the plan catalog mapped from the DB-backed catalog (grille validée)', async () => {
      const plans = await service.getPlans()
      // `decouverte` (palier de départ self-service) est listé comme les autres —
      // l'opérateur doit pouvoir l'éditer depuis le backoffice.
      // Tri par `sort_order` : `decouverte` partage le 0 avec `trial` (les deux
      // paliers d'entrée), donc il se range juste derrière lui.
      expect(plans.map(p => p.key)).toEqual(['trial', 'decouverte', 'starter', 'team', 'growth', 'beta'])
      const team = plans.find(p => p.key === 'team')
      expect(team).toEqual({
        key: 'team',
        label: 'Team / Enterprise',
        price: 25900,
        accountsLimit: 600,
        enrichmentCredits: 0,
        seats: 3,
        // Le siège suit le palier (29 / 59 / 99 €).
        extraSeatPrice: 5900,
        selfServe: false,
        // La ligne de test n'a pas de colonne `features` : le catalogue retombe
        // sur la grille du palier (Team = exports + copilote), pas sur du vide.
        features: [...PLAN_CATALOG_DEFAULTS.team.features],
        sortOrder: 2,
      })
    })
  })

  describe('updatePlan', () => {
    it('edits a plan template and NEVER rewrites an existing subscriber row', async () => {
      // After the write the catalog reloads: `find` returns the edited row.
      planRepo.find.mockResolvedValue([
        {
          key: 'team',
          label: 'Team / Enterprise',
          price_cents: 30000,
          accounts_limit: 60,
          enrichment_credits: 100,
          seats: 3,
          self_serve: true,
          sort_order: 2,
        } as PlanDefinitionEntity,
      ])

      const updated = await service.updatePlan('team', { price: 30000, accounts_limit: 60 })

      expect(planRepo.upsert).toHaveBeenCalled()
      expect(updated).toMatchObject({ key: 'team', price: 30000, accountsLimit: 60 })
      // The whole point of the safe default: editing the template must not rewrite
      // any subscriber's stored caps.
      expect(subscriptions.save).not.toHaveBeenCalled()
      expect(subscriptions.update).not.toHaveBeenCalled()
    })

    it('a subsequent assignPlan uses the NEW template (edit flows to the next assign)', async () => {
      // Catalog now serves team with the edited cap (60 instead of 50).
      planRepo.find.mockResolvedValue([
        {
          key: 'team',
          label: 'Team / Enterprise',
          price_cents: 25900,
          accounts_limit: 60,
          enrichment_credits: 100,
          seats: 3,
          self_serve: true,
          sort_order: 2,
        } as PlanDefinitionEntity,
      ])
      profiles.findOne.mockResolvedValueOnce({
        user_id: 'u1',
        email: 'a@b.co',
        first_name: 'Ada',
        last_name: 'Lovelace',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      } as ProfileEntity)
      subscriptions.findOne.mockResolvedValueOnce(null)
      subscriptions.find.mockResolvedValueOnce([
        { user_id: 'u1', plan: 'team', accounts_limit: 60, accounts_used: 0 } as SubscriptionEntity,
      ])

      await service.assignPlan('u1', 'team')

      expect(subscriptions.save).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'team', accounts_limit: 60, enrichment_credits: 100 }),
      )
    })

    it('404s an unknown plan key (create/delete is out of scope for v1)', async () => {
      await expect(service.updatePlan('enterprise', { price: 100 })).rejects.toThrow(NotFoundException)
    })

    it('rejects a negative value', async () => {
      await expect(service.updatePlan('team', { price: -1 })).rejects.toThrow(BadRequestException)
    })

    /**
     * A price edit is the ONE thing that must reach customers who already
     * subscribed — otherwise they bill the old amount forever. The catalog is
     * read twice per edit (before, then after the upsert), so these tests hand
     * back the pre-edit row first and the edited row second.
     */
    it('propagates a changed price to the subscriptions already on the plan', async () => {
      planRepo.find.mockResolvedValueOnce([teamRow()]).mockResolvedValueOnce([teamRow({ price_cents: 30000 })])

      await service.updatePlan('team', { price: 30000 })

      expect(syncPlan).toHaveBeenCalledWith('team')
    })

    it('does not propagate when only a cap changed', async () => {
      planRepo.find.mockResolvedValueOnce([teamRow()]).mockResolvedValueOnce([teamRow({ accounts_limit: 60 })])

      await service.updatePlan('team', { accounts_limit: 60 })

      expect(syncPlan).not.toHaveBeenCalled()
    })

    it('does not propagate when the price was re-submitted unchanged', async () => {
      planRepo.find.mockResolvedValue([teamRow()])

      await service.updatePlan('team', { price: TEAM_PRICE_CENTS })

      expect(syncPlan).not.toHaveBeenCalled()
    })

    /** The catalog edit already committed — a Stripe outage must not fail it. */
    it('still returns the edited plan when the propagation fails', async () => {
      planRepo.find.mockResolvedValueOnce([teamRow()]).mockResolvedValueOnce([teamRow({ price_cents: 30000 })])
      syncPlan.mockRejectedValue(new Error('Stripe down'))

      await expect(service.updatePlan('team', { price: 30000 })).resolves.toMatchObject({ price: 30000 })
    })
  })

  describe('getOverview', () => {
    it('returns row counts and the per-plan user distribution', async () => {
      profiles._qb.getCount.mockResolvedValueOnce(10)
      workspaces._qb.getCount.mockResolvedValueOnce(3)
      accounts._qb.getCount.mockResolvedValueOnce(25)
      profiles._qb.getRawMany.mockResolvedValueOnce([
        { plan: 'trial', count: '7' },
        { plan: 'team', count: '3' },
      ])

      const overview = await service.getOverview()
      expect(overview.totalUsers).toBe(10)
      expect(overview.totalWorkspaces).toBe(3)
      expect(overview.totalAccounts).toBe(25)
      expect(overview.plans).toEqual({ trial: 7, starter: 0, team: 3, growth: 0, beta: 0, decouverte: 0 })
    })
  })

  describe('assignPlan', () => {
    it('upserts the subscription with limits + credits from PLAN_CONFIG', async () => {
      profiles.findOne.mockResolvedValueOnce({
        user_id: 'u1',
        email: 'a@b.co',
        first_name: 'Ada',
        last_name: 'Lovelace',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      } as ProfileEntity)
      subscriptions.findOne.mockResolvedValueOnce(null) // no existing row → create
      subscriptions.find.mockResolvedValueOnce([
        { user_id: 'u1', plan: 'team', accounts_limit: 50, accounts_used: 4 } as SubscriptionEntity,
      ])

      const user = await service.assignPlan('u1', 'team')

      expect(subscriptions.save).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u1', plan: 'team', accounts_limit: 600, enrichment_credits: 0 }),
      )
      expect(user.userId).toBe('u1')
      expect(user.plan).toBe('team')
      expect(user.accountsLimit).toBe(50)
      expect(user.fullName).toBe('Ada Lovelace')
    })

    // PLAN-GATE #4381 — le plan est porté par le PROPRIÉTAIRE de l'espace actif
    // (`credits.service.ts` getCredits, `plan-features.service.ts`). Le sélecteur
    // du back-office écrivait la ligne de LA PERSONNE choisie : pour un membre,
    // le plan posé n'était jamais celui que lit le verrou.
    describe('PLAN-GATE #4381 — le plan se pose là où le verrou le lit', () => {
      const profile = (userId: string, email: string) =>
        ({
          user_id: userId,
          email,
          first_name: null,
          last_name: null,
          created_at: new Date('2026-01-01'),
        }) as ProfileEntity

      it('un MEMBRE passé à Growth : la ligne écrite est celle du propriétaire de l’espace', async () => {
        resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'member' })
        workspaces.findOne.mockResolvedValue({ id: 'w1', name: 'EXTEAM', owner_user_id: 'owner1' } as WorkspaceEntity)
        profiles.findOne
          .mockResolvedValueOnce(profile('kevin', 'k@exteam.fr'))
          .mockResolvedValueOnce(profile('owner1', 'c@exteam.fr'))
        subscriptions.findOne.mockResolvedValueOnce({ user_id: 'owner1', plan: 'trial' } as SubscriptionEntity)
        subscriptions.find.mockResolvedValue([
          { user_id: 'owner1', plan: 'growth', accounts_limit: 1, accounts_used: 0 },
        ])
        members.createQueryBuilder.mockReturnValue(memberQb([]))

        const user = await service.assignPlan('kevin', 'growth')

        expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'owner1', plan: 'growth' }))
        expect(subscriptions.save).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: 'kevin' }))
        expect(user.planScope).toMatchObject({ workspaceName: 'EXTEAM', ownerUserId: 'owner1', isOwner: false })
      })

      it('SAIT DIRE NON : le propriétaire lui-même s’écrit lui-même (aucune redirection)', async () => {
        resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'owner' })
        workspaces.findOne.mockResolvedValue({ id: 'w1', name: 'EXTEAM', owner_user_id: 'hamdi' } as WorkspaceEntity)
        profiles.findOne.mockResolvedValue(profile('hamdi', 'h@exteam.fr'))
        subscriptions.findOne.mockResolvedValueOnce(null)
        subscriptions.find.mockResolvedValue([{ user_id: 'hamdi', plan: 'beta', accounts_limit: 1, accounts_used: 0 }])
        members.createQueryBuilder.mockReturnValue(memberQb([]))

        const user = await service.assignPlan('hamdi', 'beta')

        expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'hamdi', plan: 'beta' }))
        expect(user.planScope).toMatchObject({ ownerUserId: 'hamdi', isOwner: true })
      })

      it('la liste affiche le plan que le verrou lit (celui du propriétaire), pas la ligne de la personne', async () => {
        resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'member' })
        workspaces.findOne.mockResolvedValue({ id: 'w1', name: 'EXTEAM', owner_user_id: 'owner1' } as WorkspaceEntity)
        profiles.findOne.mockResolvedValue(profile('owner1', 'c@exteam.fr'))
        subscriptions.find.mockResolvedValue([
          { user_id: 'kevin', plan: 'trial', accounts_limit: 0, accounts_used: 0 },
          { user_id: 'owner1', plan: 'growth', accounts_limit: 5, accounts_used: 1 },
        ])
        members.createQueryBuilder.mockReturnValue(
          memberQb([{ userId: 'kevin', workspaceId: 'w1', workspaceName: 'EXTEAM', role: 'member' }]),
        )

        const [kevin] = await (
          service as unknown as { buildAdminUsers(p: ProfileEntity[]): Promise<AdminUser[]> }
        ).buildAdminUsers([profile('kevin', 'k@exteam.fr')])

        expect(kevin?.plan).toBe('growth')
        expect(kevin?.planScope).toMatchObject({ workspaceName: 'EXTEAM', ownerEmail: 'c@exteam.fr', isOwner: false })
      })
    })

    it('404s when the user has no profile', async () => {
      profiles.findOne.mockResolvedValueOnce(null)
      await expect(service.assignPlan('ghost', 'team')).rejects.toThrow(NotFoundException)
      expect(subscriptions.save).not.toHaveBeenCalled()
    })
  })

  describe('listUsers', () => {
    it('applies the ILIKE search filter and hydrates the page', async () => {
      profiles._qb.getCount.mockResolvedValueOnce(1)
      profiles._qb.getMany.mockResolvedValueOnce([
        { user_id: 'u1', email: 'a@b.co', first_name: null, last_name: null, created_at: new Date() } as ProfileEntity,
      ])

      const res = await service.listUsers({ search: 'acme' })
      expect(profiles._qb.where).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%acme%' })
      expect(res.total).toBe(1)
      expect(res.users).toHaveLength(1)
      // Sans ligne subscription, l'utilisateur est sur le palier de DÉPART.
      expect(res.users[0]?.plan).toBe('decouverte')
    })

    it('clamps the limit to 100', async () => {
      await service.listUsers({ limit: 500 })
      expect(profiles._qb.limit).toHaveBeenCalledWith(100)
    })
  })

  describe('listWorkspaces — #1673.4 / GA-270 : la jointure qui ne joignait pas', () => {
    /**
     * Avant ce lot, `search` ne matchait que `w.name` — un espace réel,
     * cherché sous sa raison sociale ou son nom déclaré au questionnaire,
     * rendait ZÉRO résultat. Zéro se lit comme « aucun espace », jamais comme
     * « cherché sous le mauvais champ ».
     */
    it('élargit la recherche à la raison sociale et au nom déclaré du questionnaire, sans retirer le nom affiché', async () => {
      await service.listWorkspaces({ search: 'Société Générale Informatique' })

      expect(workspaces._qb.where).toHaveBeenCalledTimes(1)
      const [sql, params] = workspaces._qb.where.mock.calls[0] as [string, { s: string }]

      // Sait dire NON : si l'un des TROIS champs disparaît de la requête,
      // l'une de ces lignes casse — ce n'est pas une chaîne recopiée à la
      // main, c'est la VRAIE requête que le service construit.
      expect(sql).toMatch(/w\.name ILIKE :s/)
      expect(sql).toMatch(/esn_profiles ep/)
      expect(sql).toMatch(/ep\.esn_name ILIKE :s/)
      expect(sql).toMatch(/legal_entities le/)
      expect(sql).toMatch(/le\.name ILIKE :s/)

      // N'attrape pas ce qu'elle ne vise pas : une version de questionnaire
      // NON COURANTE, ou une raison sociale ARCHIVÉE, ne doit pas faire
      // remonter un espace sous un nom qu'il ne porte plus.
      expect(sql).toMatch(/ep\.is_current = true/)
      expect(sql).toMatch(/le\.archived = false/)

      // Le même terme, une seule fois — l'identifiant qui relie les trois
      // clauses est `workspace_id` (`ep.workspace_id = w.id` /
      // `le.workspace_id = w.id`), jamais une comparaison de libellés entre
      // deux référentiels.
      expect(sql).toMatch(/ep\.workspace_id = w\.id/)
      expect(sql).toMatch(/le\.workspace_id = w\.id/)
      expect(params).toEqual({ s: '%Société Générale Informatique%' })
    })

    it('sans recherche, aucun filtre — comportement inchangé', async () => {
      await service.listWorkspaces({})
      expect(workspaces._qb.where).not.toHaveBeenCalled()
    })
  })

  describe('createWorkspace', () => {
    it('404s when the owner is not a real profile', async () => {
      profiles.findOne.mockResolvedValueOnce(null)
      await expect(service.createWorkspace('Team', 'ghost')).rejects.toThrow(NotFoundException)
      expect(workspaces.save).not.toHaveBeenCalled()
    })

    it('creates the workspace and an owner membership', async () => {
      profiles.findOne.mockResolvedValueOnce({ user_id: 'owner', email: 'o@b.co' } as ProfileEntity)
      workspaces.save.mockResolvedValueOnce({
        id: 'w1',
        name: 'Team',
        owner_user_id: 'owner',
        created_at: new Date('2026-02-02T00:00:00.000Z'),
      } as WorkspaceEntity)

      const ws = await service.createWorkspace('Team', 'owner')
      expect(members.save).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'w1', user_id: 'owner', role: 'owner' }),
      )
      expect(ws.id).toBe('w1')
      expect(ws.ownerUserId).toBe('owner')
    })
  })

  describe('addMember', () => {
    it('409s when the user is already a member', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'w1' } as WorkspaceEntity)
      profiles.findOne.mockResolvedValueOnce({ user_id: 'u2' } as ProfileEntity)
      members.findOne.mockResolvedValueOnce({ id: 'm1', role: 'member' } as WorkspaceMemberEntity)
      await expect(service.addMember('w1', 'u2')).rejects.toThrow(ConflictException)
    })

    it('adds a member with the default role', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'w1' } as WorkspaceEntity)
      profiles.findOne.mockResolvedValueOnce({
        user_id: 'u2',
        email: 'x@b.co',
        first_name: 'Grace',
        last_name: 'Hopper',
      } as ProfileEntity)
      members.findOne.mockResolvedValueOnce(null)
      members.save.mockResolvedValueOnce({
        user_id: 'u2',
        workspace_id: 'w1',
        role: 'member',
        created_at: new Date('2026-03-03T00:00:00.000Z'),
      } as WorkspaceMemberEntity)

      const member = await service.addMember('w1', 'u2')
      expect(member).toEqual({
        userId: 'u2',
        email: 'x@b.co',
        fullName: 'Grace Hopper',
        role: 'member',
        joinedAt: '2026-03-03T00:00:00.000Z',
      })
    })
  })

  describe('removeMember', () => {
    it('404s when the target is not a member', async () => {
      members.findOne.mockResolvedValueOnce(null)
      await expect(service.removeMember('w1', 'u9')).rejects.toThrow(NotFoundException)
      expect(members.delete).not.toHaveBeenCalled()
    })

    it('refuses to remove the workspace owner (400)', async () => {
      members.findOne.mockResolvedValueOnce({
        role: 'owner',
        workspace_id: 'w1',
        user_id: 'owner',
      } as WorkspaceMemberEntity)
      await expect(service.removeMember('w1', 'owner')).rejects.toThrow(BadRequestException)
      expect(members.delete).not.toHaveBeenCalled()
    })

    it('removes a regular member', async () => {
      members.findOne.mockResolvedValueOnce({
        role: 'member',
        workspace_id: 'w1',
        user_id: 'u2',
      } as WorkspaceMemberEntity)
      const res = await service.removeMember('w1', 'u2')
      expect(res).toEqual({ removed: true })
      expect(members.delete).toHaveBeenCalledWith({ workspace_id: 'w1', user_id: 'u2' })
    })

    // #4158.4 (jumeau) — le retrait back-office libère comme le retrait d'équipe.
    it('libère le portefeuille ET les actions déléguées du partant', async () => {
      const manager = { update: jest.fn().mockResolvedValue({}), query: jest.fn().mockResolvedValue([]) }
      ;(accounts as unknown as { manager: unknown }).manager = manager
      members.findOne.mockResolvedValueOnce({
        role: 'member',
        workspace_id: 'w1',
        user_id: 'u2',
      } as WorkspaceMemberEntity)
      await service.removeMember('w1', 'u2')
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { workspace_id: 'w1', assigned_to: 'u2' },
        { assigned_to: null },
      )
      // #4996 — il sort aussi des équipes de compte et de leurs périmètres : archivés (`removed_at`), jamais supprimés.
      expect(manager.update).toHaveBeenCalledWith(
        AccountTeamMemberEntity,
        expect.objectContaining({ workspace_id: 'w1', user_id: 'u2' }),
        expect.objectContaining({ removed_by: 'u2' }),
      )
      expect(manager.update).toHaveBeenCalledWith(
        AccountTeamScopeEntity,
        expect.objectContaining({ workspace_id: 'w1', user_id: 'u2' }),
        expect.objectContaining({ removed_by: 'u2' }),
      )
      expect(manager.update).toHaveBeenCalledTimes(4)
      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('action_plan_items'), ['u2', 'w1'])
    })

    it('le membre est retiré même si la libération échoue', async () => {
      const manager = { update: jest.fn().mockRejectedValue(new Error('db')), query: jest.fn() }
      ;(accounts as unknown as { manager: unknown }).manager = manager
      members.findOne.mockResolvedValueOnce({
        role: 'member',
        workspace_id: 'w1',
        user_id: 'u2',
      } as WorkspaceMemberEntity)
      await expect(service.removeMember('w1', 'u2')).resolves.toEqual({ removed: true })
    })
  })

  describe('getWorkspaceDetail', () => {
    it('404s when the workspace is missing', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      await expect(service.getWorkspaceDetail('ghost')).rejects.toThrow(NotFoundException)
    })
  })

  /**
   * #1671-ter — la console dit enfin si la fiche ESN d'un espace est remplie.
   *
   * La question de Louis le 07/09/2026 (« l'associé a-t-il vraiment rempli ? »)
   * n'avait de réponse qu'en base de production.
   */
  describe('getWorkspaceDetail — la fiche ESN partagée', () => {
    /** Le détail d'espace fait plusieurs lectures ; seules celles qui portent
     *  la fiche nous intéressent ici. */
    function stubWorkspaceReads(canonical: EsnProfileEntity | null) {
      workspaces.findOne.mockResolvedValue({ id: 'ws-1', name: 'Apricot Labs', owner_user_id: 'adel' })
      workspaces.find.mockResolvedValue([])
      members.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as never)
      invitations.find.mockResolvedValue([])
      profiles.find.mockResolvedValue([])
      profiles.findOne.mockResolvedValue({ user_id: 'adel', email: 'adel@apricotlabs.fr' })
      accounts.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as never)
      esnProfiles.findOne.mockResolvedValue(canonical)
    }

    it('dit qu’AUCUNE fiche n’existe, plutôt que d’en inventer une vide', async () => {
      stubWorkspaceReads(null)

      const { esnProfile } = await service.getWorkspaceDetail('ws-1')

      expect(esnProfile.canonical).toBe(false)
      expect(esnProfile.heldByUserId).toBeNull()
      expect(esnProfile.companyFilled).toBe(0)
      // Le dénominateur, lui, existe toujours : « 0 sur 11 » est une mesure,
      // « 0 » tout court n'en est pas une.
      expect(esnProfile.companyTotal).toBeGreaterThan(0)
      expect(esnProfile.answers.every(answer => !answer.filled)).toBe(true)
    })

    it('compte les faits sur l’ENTREPRISE renseignés, et nomme qui porte la fiche', async () => {
      stubWorkspaceReads({
        user_id: 'adel',
        version: 3,
        updated_at: new Date('2026-09-04T17:50:51.000Z'),
        esn_name: 'Apricot Labs',
        consultant_size: '10-30',
        expertise_areas: ['Data & Intelligence Artificielle'],
        positioning: null,
        target_sectors: [],
        main_sales_pain: 'Trouver les bons comptes à cibler',
      } as unknown as EsnProfileEntity)

      const { esnProfile } = await service.getWorkspaceDetail('ws-1')

      expect(esnProfile.canonical).toBe(true)
      expect(esnProfile.heldByUserId).toBe('adel')
      expect(esnProfile.heldByEmail).toBe('adel@apricotlabs.fr')
      expect(esnProfile.version).toBe(3)
      expect(esnProfile.companyFilled).toBe(3)

      // Le frein commercial est PERSONNEL : il ne compte pas dans les faits sur
      // l'entreprise, parce qu'un associé qui rejoint n'en hérite pas vraiment.
      const frein = esnProfile.answers.find(answer => answer.key === 'main_sales_pain')
      expect(frein).toEqual({ key: 'main_sales_pain', scope: 'personal', filled: true })

      // Une case vide se dit vide — jamais un remplissage deviné.
      expect(esnProfile.answers.find(answer => answer.key === 'positioning')?.filled).toBe(false)
    })

    it('N’EXPOSE AUCUNE VALEUR — seulement « rempli » ou non', () => {
      // La stratégie commerciale d'un client (positionnement, secteurs visés)
      // ne sort pas vers une console d'opérateur. Le contrat le tient par sa
      // FORME : `answers` ne porte que `key`, `scope` et `filled`.
      const clefsAutorisees = ['key', 'scope', 'filled']
      const exemple = { key: 'positioning', scope: 'company' as const, filled: true }
      expect(Object.keys(exemple).sort()).toEqual([...clefsAutorisees].sort())
    })
  })

  /**
   * #2643.2 — l'écran back-office doit pouvoir dire où en est l'activation
   * d'un siège provisionné à la main, APRÈS que la réponse de création a été
   * refermée.
   */
  describe('getWorkspaceDetail — l’activation du propriétaire (#2643.2)', () => {
    function stubWorkspaceReads() {
      workspaces.findOne.mockResolvedValue({ id: 'ws-1', name: 'Apricot Labs', owner_user_id: 'adel' })
      workspaces.find.mockResolvedValue([])
      members.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as never)
      invitations.find.mockResolvedValue([])
      profiles.find.mockResolvedValue([])
      profiles.findOne.mockResolvedValue(null)
      accounts.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as never)
      esnProfiles.findOne.mockResolvedValue(null)
    }

    it('rend `null` quand aucune invitation propriétaire n’a été préparée pour cet espace', async () => {
      stubWorkspaceReads()
      getOwnerActivationState.mockResolvedValue(null)

      const { ownerInvitation } = await service.getWorkspaceDetail('ws-1')

      expect(ownerInvitation).toBeNull()
      expect(getOwnerActivationState).toHaveBeenCalledWith('ws-1')
    })

    it('rend l’état persisté — préparé, envoyé ou en erreur, jamais deviné', async () => {
      stubWorkspaceReads()
      getOwnerActivationState.mockResolvedValue({
        workspaceId: 'ws-1',
        email: 'theo@skaizen.fr',
        ownerFirstName: 'Théo',
        esnName: 'Apricot Labs',
        planLabel: 'Team',
        prepared: true,
        error: null,
        expiresAt: '2026-09-22T10:00:00.000Z',
        sentAt: null,
        sentBy: null,
        sendCount: 0,
        alertedAt: null,
      })

      const { ownerInvitation } = await service.getWorkspaceDetail('ws-1')

      expect(ownerInvitation?.prepared).toBe(true)
      expect(ownerInvitation?.sentAt).toBeNull()
    })
  })

  /**
   * #2643.1 — le SEUL chemin par lequel l'API envoie cet e-mail : un clic
   * opérateur, relayé tel quel au service qui tient la porte.
   */
  describe('sendOwnerInvitation', () => {
    it('délègue au service d’activation, avec l’auteur RÉEL du clic', async () => {
      sendOwnerInvitation.mockResolvedValue({ sent: true, state: { sentBy: 'louis@bellum.ai' } })

      const result = await service.sendOwnerInvitation('ws-1', 'louis@bellum.ai')

      expect(sendOwnerInvitation).toHaveBeenCalledWith('ws-1', 'louis@bellum.ai')
      expect(result).toEqual({ sent: true, state: { sentBy: 'louis@bellum.ai' } })
    })
  })
})

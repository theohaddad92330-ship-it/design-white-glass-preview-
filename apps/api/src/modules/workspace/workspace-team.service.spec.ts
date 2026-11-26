import { BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { WorkspaceTeamService } from './workspace-team.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import type { WorkspaceContextService } from './workspace-context.service'
import type { MailerService } from '../mailer/mailer.service'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande. `null` =
 *  aucune adresse déclarée par l'espace, donc repli sur l'environnement. */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

const WS = 'ws-1'
const OWNER = 'owner-1'
const CALLER = 'caller-1'

describe('WorkspaceTeamService', () => {
  let service: WorkspaceTeamService
  let context: {
    resolveActiveWorkspace: jest.Mock
    assertRole: jest.Mock
    assertPermission: jest.Mock
    switchWorkspace: jest.Mock
  }
  let config: { get: jest.Mock }
  let mailer: { sendNotificationEmail: jest.Mock }
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let invitations: MockRepository<WorkspaceInvitationEntity>
  let profiles: MockRepository<ProfileEntity>
  let subscriptions: MockRepository<SubscriptionEntity>

  beforeEach(() => {
    context = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'owner' }),
      assertRole: jest.fn().mockResolvedValue({ id: 'm', workspace_id: WS, user_id: CALLER, role: 'owner' }),
      assertPermission: jest.fn().mockResolvedValue({ id: 'm', workspace_id: WS, user_id: CALLER, role: 'owner' }),
      switchWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, workspaceName: 'ESN Acme', role: 'member' }),
    }
    config = { get: jest.fn().mockReturnValue('http://localhost:5173') }
    mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) }
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    invitations = createMockRepository<WorkspaceInvitationEntity>()
    profiles = createMockRepository<ProfileEntity>()
    subscriptions = createMockRepository<SubscriptionEntity>()

    workspaces.findOne.mockResolvedValue({ id: WS, name: 'ESN Acme', owner_user_id: OWNER } as WorkspaceEntity)

    const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
    service = new WorkspaceTeamService(
      context as unknown as WorkspaceContextService,
      config as unknown as ConfigService,
      mailer as unknown as MailerService,
      workspaces as never,
      members as never,
      invitations as never,
      profiles as never,
      subscriptions as never,
      planCatalog,
      brandsStub as never,
    )
  })

  describe('createInvitation', () => {
    it('creates a pending invite and sends the email when a seat is free', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 seats
      members.find.mockResolvedValue([{ user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity]) // 1 used
      invitations.find.mockResolvedValue([]) // 0 pending

      const result = await service.createInvitation(CALLER, { email: 'New@Acme.fr', role: 'member' })

      expect(context.assertPermission).toHaveBeenCalledWith(CALLER, WS, 'team:manage')
      expect(invitations.save).toHaveBeenCalled()
      const saved = invitations.save.mock.calls[0][0] as WorkspaceInvitationEntity
      expect(saved.email).toBe('new@acme.fr') // normalized
      expect(saved.role).toBe('member')
      expect(saved.token).toEqual(expect.any(String))
      expect(saved.expires_at.getTime()).toBeGreaterThan(Date.now())
      expect(mailer.sendNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@acme.fr', ctaUrl: expect.stringContaining('/invitation/') }),
      )
      expect(result.status).toBe('pending')
    })

    it('still creates the invite when the email transport throws (best-effort)', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity)
      members.find.mockResolvedValue([{ user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity])
      invitations.find.mockResolvedValue([])
      mailer.sendNotificationEmail.mockRejectedValue(new Error('no transport'))

      await expect(service.createInvitation(CALLER, { email: 'x@acme.fr', role: 'member' })).resolves.toMatchObject({
        status: 'pending',
      })
      expect(invitations.save).toHaveBeenCalled()
    })

    it('refuses (402) when members + pending already fill the plan seats', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 seats
      members.find.mockResolvedValue([
        { user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity,
        { user_id: 'u-2', role: 'member' } as WorkspaceMemberEntity,
        { user_id: 'u-3', role: 'member' } as WorkspaceMemberEntity,
      ]) // 3 used = full
      invitations.find.mockResolvedValue([])

      const err = await service.createInvitation(CALLER, { email: 'x@acme.fr', role: 'member' }).catch(e => e)
      expect(err).toBeInstanceOf(HttpException)
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
      expect(invitations.save).not.toHaveBeenCalled()
    })

    it('starter (Starter-Solo) includes a SINGLE seat — the first invite is already refused', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'starter' } as SubscriptionEntity) // 1 seat (grille validée)
      members.find.mockResolvedValue([{ user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity]) // owner fills it
      invitations.find.mockResolvedValue([])

      const err = await service.createInvitation(CALLER, { email: 'x@acme.fr', role: 'member' }).catch(e => e)
      expect(err).toBeInstanceOf(HttpException)
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
      expect(invitations.save).not.toHaveBeenCalled()
    })

    it('team inclut 3 sièges — un espace de 2 membres peut encore inviter', async () => {
      // Grille du 16/08 : les paliers publics n'incluent plus qu'UN siège, et
      // l'équipe s'achète siège par siège. Team / Enterprise, provisionné à la
      // main, garde les siens — c'est lui qui porte désormais ce cas.
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 sièges
      members.find.mockResolvedValue(
        Array.from({ length: 2 }, (_, i) => ({ user_id: `u-${i}`, role: 'member' }) as WorkspaceMemberEntity),
      )
      invitations.find.mockResolvedValue([])

      await service.createInvitation(CALLER, { email: 'x@acme.fr', role: 'member' })
      expect(invitations.save).toHaveBeenCalled()
    })

    it('purchased extra seats raise the cap (included + extra)', async () => {
      // team (3) + 2 extra = 5 seats; 3 members + 0 pending → an invite fits.
      subscriptions.findOne.mockResolvedValue({ plan: 'team', extra_seats: 2 } as SubscriptionEntity)
      members.find.mockResolvedValue([
        { user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity,
        { user_id: 'u-2', role: 'member' } as WorkspaceMemberEntity,
        { user_id: 'u-3', role: 'member' } as WorkspaceMemberEntity,
      ])
      invitations.find.mockResolvedValue([])

      await service.createInvitation(CALLER, { email: 'x@acme.fr', role: 'member' })
      expect(invitations.save).toHaveBeenCalled()
    })

    it('rejects a caller lacking team:manage (e.g. sales / viewer)', async () => {
      context.assertPermission.mockRejectedValue(new ForbiddenException())
      await expect(service.createInvitation(CALLER, { email: 'x@acme.fr', role: 'member' })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('rejects a duplicate pending invite for the same email', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity)
      invitations.find.mockResolvedValue([{ email: 'dup@acme.fr', status: 'pending' } as WorkspaceInvitationEntity])
      const err = await service.createInvitation(CALLER, { email: 'dup@acme.fr', role: 'member' }).catch(e => e)
      expect(err.getStatus()).toBe(HttpStatus.CONFLICT)
    })

    it('rejects inviting someone who is already a member', async () => {
      profiles.findOne.mockResolvedValue({ user_id: 'u-9', email: 'here@acme.fr' } as ProfileEntity)
      members.findOne.mockResolvedValue({ user_id: 'u-9', role: 'member' } as WorkspaceMemberEntity)
      const err = await service.createInvitation(CALLER, { email: 'here@acme.fr', role: 'member' }).catch(e => e)
      expect(err.getStatus()).toBe(HttpStatus.CONFLICT)
    })
  })

  describe('acceptInvitation', () => {
    const future = new Date(Date.now() + 60_000)

    it('creates the membership when the caller email matches (case-insensitive)', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'Invitee@Acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      members.findOne.mockResolvedValue(null)

      const result = await service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok')

      expect(members.save).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WS, user_id: CALLER, role: 'member' }),
      )
      const savedInvite = invitations.save.mock.calls.at(-1)?.[0] as WorkspaceInvitationEntity
      expect(savedInvite.status).toBe('accepted')
      expect(result).toEqual({ workspaceId: WS, workspaceName: 'ESN Acme', role: 'member' })
    })

    /**
     * The blocker, end to end. Someone who tried the product first already owns
     * a personal workspace, so accepting used to be a silent no-op: correct
     * membership row, then straight back to their own empty space. Accepting now
     * makes the joined workspace ACTIVE, so the invitation actually lands.
     */
    it('switches the joiner into the workspace they just joined', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'invitee@acme.fr',
        role: 'sales',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      members.findOne.mockResolvedValue(null)

      await service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok')

      expect(context.switchWorkspace).toHaveBeenCalledWith(CALLER, WS)
    })

    it('never switches when the invitation is refused (403 leaves the caller where they were)', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'invitee@acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)

      await expect(service.acceptInvitation(CALLER, 'someone-else@acme.fr', 'tok')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(context.switchWorkspace).not.toHaveBeenCalled()
    })

    /**
     * The membership is already committed at this point. A failure to record the
     * *preference* must not turn a successful join into an error — the user is a
     * member either way and can pick the workspace from the switcher.
     */
    it('still reports success when recording the active workspace fails', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'invitee@acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      members.findOne.mockResolvedValue(null)
      context.switchWorkspace.mockRejectedValueOnce(new Error('db down'))

      await expect(service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok')).resolves.toEqual({
        workspaceId: WS,
        workspaceName: 'ESN Acme',
        role: 'member',
      })
    })

    it('does not duplicate the membership when the caller is already a member', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'invitee@acme.fr',
        role: 'admin',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      members.findOne.mockResolvedValue({ user_id: CALLER, role: 'member' } as WorkspaceMemberEntity)

      const result = await service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok')
      expect(members.save).not.toHaveBeenCalled()
      expect(result.role).toBe('member') // keeps existing role
    })

    it('rejects when the caller email does not match the invite (403)', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'invitee@acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      await expect(service.acceptInvitation(CALLER, 'someone-else@acme.fr', 'tok')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(members.save).not.toHaveBeenCalled()
    })

    it('rejects an expired invite (410)', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'pending',
        email: 'invitee@acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: new Date(Date.now() - 1000),
      } as WorkspaceInvitationEntity)
      const err = await service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok').catch(e => e)
      expect(err.getStatus()).toBe(HttpStatus.GONE)
    })

    it('rejects a revoked invite (410)', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'revoked',
        email: 'invitee@acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      const err = await service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok').catch(e => e)
      expect(err.getStatus()).toBe(HttpStatus.GONE)
    })

    it('rejects an already-used invite (410)', async () => {
      invitations.findOne.mockResolvedValue({
        token: 'tok',
        status: 'accepted',
        email: 'invitee@acme.fr',
        role: 'member',
        workspace_id: WS,
        expires_at: future,
      } as WorkspaceInvitationEntity)
      const err = await service.acceptInvitation(CALLER, 'invitee@acme.fr', 'tok').catch(e => e)
      expect(err.getStatus()).toBe(HttpStatus.GONE)
    })
  })

  describe('removeMember', () => {
    it('removes a non-owner member', async () => {
      members.findOne.mockResolvedValue({ user_id: 'u-2', role: 'member' } as WorkspaceMemberEntity)
      await expect(service.removeMember(CALLER, 'u-2')).resolves.toEqual({ removed: true })
      expect(context.assertPermission).toHaveBeenCalledWith(CALLER, WS, 'team:manage')
      expect(members.delete).toHaveBeenCalledWith({ workspace_id: WS, user_id: 'u-2' })
    })

    it('refuses to remove the owner (400)', async () => {
      members.findOne.mockResolvedValue({ user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity)
      await expect(service.removeMember(CALLER, OWNER)).rejects.toBeInstanceOf(BadRequestException)
      expect(members.delete).not.toHaveBeenCalled()
    })

    it('rejects a caller lacking team:manage', async () => {
      context.assertPermission.mockRejectedValue(new ForbiddenException())
      await expect(service.removeMember(CALLER, 'u-2')).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('updateMemberRole', () => {
    it('changes a member role (team:manage ; admin roles → owner/admin, #4158.1)', async () => {
      members.findOne.mockResolvedValue({
        user_id: 'u-2',
        workspace_id: WS,
        role: 'member',
        created_at: new Date(),
      } as WorkspaceMemberEntity)
      profiles.find.mockResolvedValue([
        { user_id: 'u-2', email: 'm@acme.fr', first_name: 'Marie', last_name: 'Durand' } as ProfileEntity,
      ])

      const result = await service.updateMemberRole(CALLER, 'u-2', 'admin')
      expect(context.assertPermission).toHaveBeenCalledWith(CALLER, WS, 'team:manage')
      expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }))
      expect(result).toMatchObject({ userId: 'u-2', role: 'admin', email: 'm@acme.fr', fullName: 'Marie Durand' })
    })

    it('rejects a caller without team:manage', async () => {
      context.assertPermission.mockRejectedValue(new ForbiddenException())
      await expect(service.updateMemberRole(CALLER, 'u-2', 'admin')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('refuses to change the owner role (400)', async () => {
      members.findOne.mockResolvedValue({ user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity)
      await expect(service.updateMemberRole(CALLER, OWNER, 'admin')).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('setCrossTeamSupport (#3387.10)', () => {
    it('marks a member as cross-team reinforcement (team:manage) and returns the hydrated member', async () => {
      members.findOne.mockResolvedValue({
        user_id: 'u-2',
        workspace_id: WS,
        role: 'sales',
        cross_team_support: false,
        created_at: new Date(),
      } as WorkspaceMemberEntity)
      profiles.find.mockResolvedValue([
        { user_id: 'u-2', email: 'm@acme.fr', first_name: 'Marie', last_name: 'Durand' } as ProfileEntity,
      ])

      const result = await service.setCrossTeamSupport(CALLER, 'u-2', true)
      expect(context.assertPermission).toHaveBeenCalledWith(CALLER, WS, 'team:manage')
      expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ cross_team_support: true }))
      expect(result).toMatchObject({ userId: 'u-2', crossTeamSupport: true })
    })

    it('rejects a caller lacking team:manage', async () => {
      context.assertPermission.mockRejectedValue(new ForbiddenException())
      await expect(service.setCrossTeamSupport(CALLER, 'u-2', true)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('404 on an unknown member', async () => {
      members.findOne.mockResolvedValue(null)
      await expect(service.setCrossTeamSupport(CALLER, 'u-9', true)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('getTeam', () => {
    it('returns the active workspace, members, pending invites and seat usage', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 seats
      members.find.mockResolvedValue([
        { user_id: OWNER, role: 'owner', created_at: new Date() } as WorkspaceMemberEntity,
        { user_id: 'u-2', role: 'member', created_at: new Date() } as WorkspaceMemberEntity,
      ])
      profiles.find.mockResolvedValue([
        { user_id: OWNER, email: 'owner@acme.fr', first_name: 'Owner', last_name: null } as ProfileEntity,
      ])
      invitations.find.mockResolvedValue([
        {
          id: 'inv-1',
          email: 'new@acme.fr',
          role: 'member',
          status: 'pending',
          expires_at: new Date(),
          created_at: new Date(),
        } as WorkspaceInvitationEntity,
      ])

      const team = await service.getTeam(CALLER)
      expect(team.workspace).toMatchObject({ id: WS, name: 'ESN Acme', role: 'owner', memberCount: 2 })
      expect(team.members).toHaveLength(2)
      expect(team.members[0]).toMatchObject({ userId: OWNER, email: 'owner@acme.fr', fullName: 'Owner' })
      expect(team.members[1]).toMatchObject({ userId: 'u-2', email: null, fullName: null })
      expect(team.invitations).toHaveLength(1)
      expect(team.seats).toEqual({ used: 3, total: 3 })
    })

    /**
     * Le cloisonnement du portefeuille voyage jusqu'à l'écran.
     *
     * L'endpoint d'ÉCRITURE (`PATCH /workspaces/portfolio-visibility`) et le
     * calcul (`portfolioScopeFor`) existaient depuis des mois ; aucune route ne
     * rendait la valeur EN COURS. Un écran ne pouvait donc que la deviner — et
     * deviner « ouvert » chez une ESN qui a cloisonné affiche l'inverse de la
     * vérité. Ces deux tests sont ce qui empêche la valeur de s'arrêter en
     * chemin une seconde fois.
     */
    it('rend le cloisonnement du portefeuille tel qu il est en base', async () => {
      workspaces.findOne.mockResolvedValue({
        id: WS,
        name: 'ESN Acme',
        owner_user_id: OWNER,
        portfolio_visibility: 'restricted',
      } as WorkspaceEntity)
      members.find.mockResolvedValue([
        { user_id: OWNER, role: 'owner', created_at: new Date() } as WorkspaceMemberEntity,
      ])
      profiles.find.mockResolvedValue([])
      invitations.find.mockResolvedValue([])

      const team = await service.getTeam(CALLER)
      expect(team.workspace.portfolioVisibility).toBe('restricted')
    })

    /**
     * D17 — le lexique de l'espace voyage jusqu'à la NAVIGATION de chacun.
     *
     * C'est la seule raison pour laquelle il descend par cette réponse-là : son
     * domicile (`GET /esn-profile/offer-portfolio`) se lit avec `team:manage`,
     * et un commercial y aurait lu « Besoins » pendant que son responsable a
     * écrit « Postes ». Ces trois tests sont ce qui empêche la valeur de
     * s'arrêter en chemin.
     */
    describe('le lexique de l’espace (D17)', () => {
      function stubTeam(): void {
        members.find.mockResolvedValue([
          { user_id: OWNER, role: 'owner', created_at: new Date() } as WorkspaceMemberEntity,
        ])
        profiles.find.mockResolvedValue([])
        invitations.find.mockResolvedValue([])
      }

      it('descend les mots de l’équipe avec l’espace', async () => {
        stubTeam()
        workspaces.manager.query.mockResolvedValue([
          {
            offer_portfolio: {
              lexicon: { overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }] },
            },
          },
        ])

        const team = await service.getTeam(CALLER)
        expect(team.workspace.lexicon.overrides).toEqual([
          { concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' },
        ])
        // Scopé à l'espace : jamais une lecture par id seul (GA-46).
        expect(workspaces.manager.query.mock.calls[0]?.[1]).toEqual([WS])
      })

      it('un espace sans lexique rend « aucune surcharge » — le no-op est strict', async () => {
        stubTeam()
        workspaces.manager.query.mockResolvedValue([{ offer_portfolio: null }])
        const team = await service.getTeam(CALLER)
        // #2862 (#2437.8) — `version`/`updatedAt` rejoignent `overrides` dans
        // `EMPTY_STRUCTURED_LEXICON` : `null` tant qu'aucune modification n'a
        // jamais été enregistrée, jamais un défaut deviné. #2847 ajoute
        // `updatedBy` à la même famille (auteur de la dernière modification).
        expect(team.workspace.lexicon).toEqual({ overrides: [], version: null, updatedAt: null, updatedBy: null })
      })

      it('un lexique ILLISIBLE ne fait pas tomber l’écran Équipe', async () => {
        // Le repli honnête, c'est les libellés du produit — jamais une erreur,
        // et jamais une donnée inventée.
        stubTeam()
        workspaces.manager.query.mockRejectedValue(new Error('colonne absente'))
        await expect(service.getTeam(CALLER)).resolves.toMatchObject({
          workspace: { lexicon: { overrides: [] } },
        })
      })
    })

    it('rend « open » quand la colonne est absente — le défaut SQL, pas une invention', async () => {
      workspaces.findOne.mockResolvedValue({ id: WS, name: 'ESN Acme', owner_user_id: OWNER } as WorkspaceEntity)
      members.find.mockResolvedValue([
        { user_id: OWNER, role: 'owner', created_at: new Date() } as WorkspaceMemberEntity,
      ])
      profiles.find.mockResolvedValue([])
      invitations.find.mockResolvedValue([])

      const team = await service.getTeam(CALLER)
      expect(team.workspace.portfolioVisibility).toBe('open')
    })

    /**
     * Seat accounting across a join. A pending invitation already occupies a
     * seat (`used = members + pending`); accepting converts it into a member.
     * The count must therefore be IDENTICAL either side of the accept — a join
     * neither frees a seat (no free rider) nor bills two (no double count).
     */
    it('conserves seat usage when a pending invitation becomes a member', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 seats
      profiles.find.mockResolvedValue([])

      // Before: 1 member + 1 pending invite.
      members.find.mockResolvedValueOnce([{ user_id: OWNER, role: 'owner', created_at: new Date() }] as never)
      invitations.find.mockResolvedValueOnce([
        {
          id: 'inv-1',
          email: 'joiner@acme.fr',
          role: 'sales',
          status: 'pending',
          expires_at: new Date(),
          created_at: new Date(),
        },
      ] as never)
      const before = await service.getTeam(CALLER)

      // After: the invite was accepted — 2 members, 0 pending.
      members.find.mockResolvedValueOnce([
        { user_id: OWNER, role: 'owner', created_at: new Date() },
        { user_id: 'joiner', role: 'sales', created_at: new Date() },
      ] as never)
      invitations.find.mockResolvedValueOnce([])
      const after = await service.getTeam(CALLER)

      expect(before.seats).toEqual({ used: 2, total: 3 })
      expect(after.seats).toEqual({ used: 2, total: 3 })
    })
  })

  // Journal d'activité (Théo p.21 P2) — team mutations append an audit line
  // (type/target/date/actor only) into the product_events stream.
  describe('audit events (journal d’activité)', () => {
    let analytics: { track: jest.Mock }

    beforeEach(() => {
      analytics = { track: jest.fn().mockResolvedValue(undefined) }
      const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
      service = new WorkspaceTeamService(
        context as unknown as WorkspaceContextService,
        config as unknown as ConfigService,
        mailer as unknown as MailerService,
        workspaces as never,
        members as never,
        invitations as never,
        profiles as never,
        subscriptions as never,
        planCatalog,
        brandsStub as never,
        analytics as never,
      )
    })

    it('createInvitation appends member_invited with the invited email + role', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity)
      members.find.mockResolvedValue([{ user_id: OWNER, role: 'owner' } as WorkspaceMemberEntity])
      invitations.find.mockResolvedValue([])
      invitations.save.mockImplementation(async inv => ({ ...(inv as object), id: 'inv-1' }))

      await service.createInvitation(CALLER, { email: 'Collab@ESN.fr', role: 'sales' })

      expect(analytics.track).toHaveBeenCalledWith('member_invited', {
        userId: CALLER,
        workspaceId: WS,
        properties: { target: 'collab@esn.fr', role: 'sales', invitationId: 'inv-1' },
      })
    })

    it('revokeInvitation appends invitation_revoked (pending invite only)', async () => {
      invitations.findOne.mockResolvedValue({
        id: 'inv-1',
        workspace_id: WS,
        email: 'collab@esn.fr',
        status: 'pending',
      } as WorkspaceInvitationEntity)

      await service.revokeInvitation(CALLER, 'inv-1')

      expect(analytics.track).toHaveBeenCalledWith('invitation_revoked', {
        userId: CALLER,
        workspaceId: WS,
        properties: { target: 'collab@esn.fr', invitationId: 'inv-1' },
      })
    })

    it('revokeInvitation appends nothing for an already-revoked invite', async () => {
      invitations.findOne.mockResolvedValue({
        id: 'inv-1',
        workspace_id: WS,
        email: 'collab@esn.fr',
        status: 'revoked',
      } as WorkspaceInvitationEntity)

      await service.revokeInvitation(CALLER, 'inv-1')
      expect(analytics.track).not.toHaveBeenCalled()
    })

    it('removeMember appends member_removed with the removed member label', async () => {
      members.findOne.mockResolvedValue({ workspace_id: WS, user_id: 'u-2', role: 'member' } as WorkspaceMemberEntity)
      profiles.findOne.mockResolvedValue({ user_id: 'u-2', email: 'parti@esn.fr' } as ProfileEntity)

      await service.removeMember(CALLER, 'u-2')
      await new Promise(resolve => setImmediate(resolve)) // flush fire-and-forget emit

      expect(analytics.track).toHaveBeenCalledWith('member_removed', {
        userId: CALLER,
        workspaceId: WS,
        properties: { target: 'parti@esn.fr', targetUserId: 'u-2' },
      })
    })

    it('updateMemberRole appends member_role_changed with the new role', async () => {
      members.findOne.mockResolvedValue({ workspace_id: WS, user_id: 'u-2', role: 'member' } as WorkspaceMemberEntity)
      profiles.find.mockResolvedValue([{ user_id: 'u-2', email: 'collab@esn.fr' } as ProfileEntity])

      await service.updateMemberRole(CALLER, 'u-2', 'sales_ops')

      expect(analytics.track).toHaveBeenCalledWith('member_role_changed', {
        userId: CALLER,
        workspaceId: WS,
        properties: { target: 'collab@esn.fr', targetUserId: 'u-2', role: 'sales_ops' },
      })
    })
  })

  // #2077.9 — la dérivation lue par ActivationService pour le jalon « premier
  // collègue invité » : `team:manage` + un siège libre, sinon `false`.
  describe('canInviteColleague', () => {
    it('is true for an owner with a free seat', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 seats
      members.count.mockResolvedValue(1) // owner only
      invitations.find.mockResolvedValue([]) // 0 pending

      await expect(service.canInviteColleague(CALLER)).resolves.toBe(true)
    })

    it('is false without `team:manage` — a plain member never sees this jalon as reachable', async () => {
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WS, role: 'member' })

      await expect(service.canInviteColleague(CALLER)).resolves.toBe(false)
    })

    it('is false once members + pending invites fill the plan seats', async () => {
      subscriptions.findOne.mockResolvedValue({ plan: 'team' } as SubscriptionEntity) // 3 seats
      members.count.mockResolvedValue(3)
      invitations.find.mockResolvedValue([])

      await expect(service.canInviteColleague(CALLER)).resolves.toBe(false)
    })

    it('SAIT DIRE NON : dégrade à false plutôt que de planter sur une lecture en échec', async () => {
      context.resolveActiveWorkspace.mockRejectedValue(new Error('boom'))

      await expect(service.canInviteColleague(CALLER)).resolves.toBe(false)
    })
  })
})

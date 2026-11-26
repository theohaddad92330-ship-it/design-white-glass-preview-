import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AdminUsersService } from './admin-users.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

type MockAuthAdmin = {
  getUserById: jest.Mock
  updateUserById: jest.Mock
  deleteUser: jest.Mock
  generateLink: jest.Mock
  listUsers: jest.Mock
}

describe('AdminUsersService', () => {
  let service: AdminUsersService
  let profiles: MockRepository<ProfileEntity>
  let subscriptions: MockRepository<SubscriptionEntity>
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let accounts: MockRepository<AccountEntity>
  let ledger: MockRepository<CreditLedgerEntity>
  let authAdmin: MockAuthAdmin
  let actions: MockRepository<UserActionEntity>
  let chatMessages: MockRepository<ChatMessageEntity>

  beforeEach(() => {
    profiles = createMockRepository<ProfileEntity>()
    subscriptions = createMockRepository<SubscriptionEntity>()
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    accounts = createMockRepository<AccountEntity>()
    ledger = createMockRepository<CreditLedgerEntity>()
    actions = createMockRepository<UserActionEntity>()
    chatMessages = createMockRepository<ChatMessageEntity>()
    authAdmin = {
      getUserById: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      updateUserById: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      deleteUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
      generateLink: jest.fn().mockResolvedValue({ data: { properties: null }, error: null }),
      listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    }
    const supabase = { getClient: () => ({ auth: { admin: authAdmin } }) }
    const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
    service = new AdminUsersService(
      profiles as never,
      subscriptions as never,
      workspaces as never,
      members as never,
      accounts as never,
      ledger as never,
      supabase as never,
      planCatalog,
      {
        get: (key: string, fallback?: string) => (key === 'frontendUrl' ? 'https://app.bellum-ai.com' : fallback),
        getOrThrow: () => 'test-reset-signing-secret',
      } as never,
      actions as never,
      chatMessages as never,
    )
  })

  const profileRow = (over: Partial<ProfileEntity> = {}): ProfileEntity =>
    ({
      user_id: 'u1',
      email: 'ada@b.co',
      first_name: 'Ada',
      last_name: 'Lovelace',
      avatar_url: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    }) as ProfileEntity

  describe('getUserDetail', () => {
    // #4423.1 — « Dernière connexion » du 01/10 alors que l'espace vit jusqu'au 20/10 :
    // `last_sign_in_at` ne bouge qu'au mot de passe. La fiche affiche la dernière ACTIVITÉ.
    describe('dernière activité (#4423.1)', () => {
      const withSignIn = (iso: string | null) =>
        authAdmin.getUserById.mockResolvedValueOnce({
          data: { user: { id: 'u1', email: 'ada@b.co', last_sign_in_at: iso, banned_until: null } },
          error: null,
        })

      it('sign-in au 01/10 + activité au 20/10 → 20/10, source nommée', async () => {
        profiles.findOne.mockResolvedValueOnce(profileRow())
        withSignIn('2026-10-01T10:02:00.000Z')
        actions._qb.getRawOne.mockResolvedValueOnce({ lastAt: '2026-10-20T08:00:00.000Z' })
        chatMessages._qb.getRawOne.mockResolvedValueOnce({ lastAt: '2026-10-19T08:00:00.000Z' })

        const detail = await service.getUserDetail('u1', null)

        expect(detail.lastActivity).toEqual({ at: '2026-10-20T08:00:00.000Z', source: 'action' })
        expect(detail.auth?.lastSignInAt).toBe('2026-10-01T10:02:00.000Z')
      })

      it('un message Laura plus récent gagne', async () => {
        profiles.findOne.mockResolvedValueOnce(profileRow())
        withSignIn('2026-10-01T10:02:00.000Z')
        actions._qb.getRawOne.mockResolvedValueOnce({ lastAt: '2026-10-10T08:00:00.000Z' })
        chatMessages._qb.getRawOne.mockResolvedValueOnce({ lastAt: '2026-10-19T08:00:00.000Z' })

        const detail = await service.getUserDetail('u1', null)

        expect(detail.lastActivity).toEqual({ at: '2026-10-19T08:00:00.000Z', source: 'laura' })
      })

      it('sans aucune trace, la connexion par mot de passe reste la réponse', async () => {
        profiles.findOne.mockResolvedValueOnce(profileRow())
        withSignIn('2026-10-01T10:02:00.000Z')
        actions._qb.getRawOne.mockResolvedValueOnce({ lastAt: null })
        chatMessages._qb.getRawOne.mockResolvedValueOnce(undefined)

        const detail = await service.getUserDetail('u1', null)

        expect(detail.lastActivity).toEqual({ at: '2026-10-01T10:02:00.000Z', source: 'sign_in' })
      })

      it('rien nulle part → null, jamais une date inventée', async () => {
        profiles.findOne.mockResolvedValueOnce(profileRow())
        withSignIn(null)
        actions._qb.getRawOne.mockResolvedValueOnce(undefined)
        chatMessages._qb.getRawOne.mockResolvedValueOnce(undefined)

        const detail = await service.getUserDetail('u1', null)

        expect(detail.lastActivity).toBeNull()
      })
    })

    // #4423.2 — trois chiffres pour la même chose : BO « 6 dossiers », Laura « 5 comptes analysés »
    // (analyses TERMINÉES), app « 5 suivis » (statut commercial). L'écart se NOMME.
    it('ventile les analyses lancées : terminées / suivies, écarts nommés', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      accounts.count.mockResolvedValueOnce(6)
      accounts.find.mockResolvedValueOnce([
        { company_name: 'A', status: 'completed', commercial_status: 'watching' },
        { company_name: 'B', status: 'completed', commercial_status: 'customer' },
        { company_name: 'C', status: 'completed', commercial_status: 'opening' },
        { company_name: 'D', status: 'completed', commercial_status: 'opportunity' },
        { company_name: 'E', status: 'completed', commercial_status: 'watching' },
        { company_name: 'Dachser France', status: 'failed', commercial_status: 'new' },
      ] as never)

      const detail = await service.getUserDetail('u1', null)

      expect(detail.accountsBreakdown).toEqual({
        total: 6,
        completed: 5,
        active: 6,
        followed: 5,
        notCompletedNames: ['Dachser France'],
        notFollowedNames: ['Dachser France'],
        notCompletedByStatus: { failed: 1 },
        failedReasons: [],
      })
    })

    // #4423.2 (recette 22/10) — « 281 lancées / 5 terminées » : les 276 autres NOMMENT leur statut,
    // et un compte en échec dit sa raison (jamais « Échec » nu).
    it('nomme le statut des non terminées et la raison des échecs', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      accounts.find.mockResolvedValueOnce([
        { company_name: 'A', status: 'completed', commercial_status: 'watching', error_message: null },
        { company_name: 'B', status: 'imported', commercial_status: 'new', error_message: null },
        { company_name: 'C', status: 'imported', commercial_status: 'new', error_message: null },
        { company_name: 'D', status: 'error', commercial_status: 'new', error_message: 'Société introuvable' },
        { company_name: 'E', status: 'error', commercial_status: 'new', error_message: null },
      ] as never)

      const detail = await service.getUserDetail('u1', null)

      expect(detail.accountsBreakdown?.notCompletedByStatus).toEqual({ imported: 2, error: 2 })
      expect(detail.accountsBreakdown?.failedReasons).toEqual([
        { name: 'D', reason: 'Société introuvable' },
        { name: 'E', reason: null },
      ])
    })

    it('404s when the user has no profile', async () => {
      profiles.findOne.mockResolvedValueOnce(null)
      await expect(service.getUserDetail('ghost', null)).rejects.toThrow(NotFoundException)
    })

    it('assembles profile, plan/credits, workspaces, account count and auth state', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce({
        user_id: 'u1',
        plan: 'team',
        accounts_limit: 30,
        accounts_used: 4,
        enrichment_credits: 50,
      } as SubscriptionEntity)
      members._qb.getRawMany.mockResolvedValueOnce([{ workspaceId: 'w1', workspaceName: 'Acme', role: 'owner' }])
      accounts.count.mockResolvedValueOnce(7)
      authAdmin.getUserById.mockResolvedValueOnce({
        data: {
          user: {
            id: 'u1',
            email: 'ada@b.co',
            email_confirmed_at: '2026-01-02T00:00:00.000Z',
            last_sign_in_at: '2026-06-01T00:00:00.000Z',
            banned_until: null,
          },
        },
        error: null,
      })

      const detail = await service.getUserDetail('u1', null)

      expect(detail.userId).toBe('u1')
      expect(detail.fullName).toBe('Ada Lovelace')
      expect(detail.plan).toBe('team')
      expect(detail.accountsLimit).toBe(30)
      expect(detail.accountsUsed).toBe(4)
      expect(detail.enrichmentCredits).toBe(50)
      // `isActive: false` — aucun espace actif n'a été passé, donc aucune ligne
      // n'est marquée. Une console ne devine pas l'espace qu'on voit.
      expect(detail.workspaces).toEqual([{ id: 'w1', name: 'Acme', role: 'owner', isActive: false }])
      expect(detail.accountsCount).toBe(7)
      expect(detail.auth).toEqual({
        confirmed: true,
        banned: false,
        bannedUntil: null,
        lastSignInAt: '2026-06-01T00:00:00.000Z',
        email: 'ada@b.co',
      })
      expect(authAdmin.getUserById).toHaveBeenCalledWith('u1')
    })

    /**
     * #1671-ter — « quel espace cette personne voit-elle ? »
     *
     * Le cas de Bedros, 07/09/2026 : membre d'APRICOT LABS ET propriétaire d'un
     * espace personnel vide que le déclencheur d'inscription donne à chacun.
     * Deux adhésions valides ; seul le sélecteur dit laquelle est active, et
     * c'est CETTE ligne que l'opérateur doit voir marquée.
     */
    it('marque l’espace que la personne voit — et lui SEUL', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce(null)
      accounts.count.mockResolvedValueOnce(0)
      members.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { workspaceId: 'ws-perso', workspaceName: 'Mon espace', role: 'owner' },
          { workspaceId: 'ws-esn', workspaceName: 'APRICOT LABS SAS', role: 'member' },
        ]),
      } as never)

      const detail = await service.getUserDetail('u1', 'ws-esn')

      expect(detail.workspaces).toEqual([
        { id: 'ws-perso', name: 'Mon espace', role: 'owner', isActive: false },
        { id: 'ws-esn', name: 'APRICOT LABS SAS', role: 'member', isActive: true },
      ])
    })

    it('SAIT DIRE NON — sans espace actif résolu, aucune ligne n’est marquée', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce(null)
      accounts.count.mockResolvedValueOnce(0)
      members.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ workspaceId: 'ws-perso', workspaceName: 'Mon espace', role: 'owner' }]),
      } as never)

      const detail = await service.getUserDetail('u1', null)

      expect(detail.workspaces.every(workspace => !workspace.isActive)).toBe(true)
    })

    // CEDRIC-FIX C.10 — fiche client Keyrus : 0/600 au back-office, 1104 dans l'app.
    // L'app lit le pool du PROPRIÉTAIRE de l'espace actif (`CreditsService.resolveBillingSubscription`)
    // et sa capacité complète (`creditCapacity` : quota + recharge + report valide). La fiche lisait la
    // ligne d'abonnement DE LA PERSONNE et omettait le report : deux sources, deux chiffres.
    it('C.10 — montre le pool du propriétaire de l’espace actif, report valide compris (= l’app)', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockImplementation(((opts: { where: { user_id: string } }) =>
        Promise.resolve(
          opts.where.user_id === 'u1'
            ? ({ user_id: 'u1', plan: 'starter', accounts_limit: 600, accounts_used: 0 } as SubscriptionEntity)
            : ({
                user_id: 'owner',
                plan: 'growth',
                accounts_limit: 600,
                accounts_used: 12,
                topup_analyses: 0,
                rollover_credits: 504,
                rollover_expires_at: new Date(Date.now() + 86_400_000),
              } as SubscriptionEntity),
        )) as never)
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-keyrus', owner_user_id: 'owner' } as WorkspaceEntity)
      accounts.count.mockResolvedValueOnce(0)

      const detail = await service.getUserDetail('u1', 'ws-keyrus')

      expect(detail.accountsLimit).toBe(1104)
      expect(detail.accountsUsed).toBe(12)
      expect(detail.plan).toBe('growth')
    })

    it('C.10 SAIT DIRE NON — un report EXPIRÉ ne compte pas, et sans espace actif on lit la ligne de la personne', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce({
        user_id: 'u1',
        plan: 'team',
        accounts_limit: 30,
        accounts_used: 4,
        rollover_credits: 99,
        rollover_expires_at: new Date(Date.now() - 86_400_000),
      } as SubscriptionEntity)
      accounts.count.mockResolvedValueOnce(0)

      const detail = await service.getUserDetail('u1', null)

      expect(detail.accountsLimit).toBe(30)
      expect(workspaces.findOne).not.toHaveBeenCalled()
    })

    it('affiche un compte SANS ligne d’abonnement comme verrouillé — zéro crédit', async () => {
      // C'était « l'essai pondéré, 15 analyses » : le backoffice annonçait 120
      // crédits à un utilisateur qui n'avait aucune ligne. Depuis le 02/09/2026
      // `trial` est l'état verrouillé, et l'écran opérateur dit ce qui est vrai.
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce(null)
      accounts.count.mockResolvedValueOnce(0)

      const detail = await service.getUserDetail('u1', null)
      expect(detail.plan).toBe('trial')
      expect(detail.accountsLimit).toBe(0)
      expect(detail.enrichmentCredits).toBe(0)
    })

    it('marks a user banned when banned_until is in the future', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      accounts.count.mockResolvedValueOnce(0)
      authAdmin.getUserById.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'ada@b.co', banned_until: '2999-01-01T00:00:00.000Z' } },
        error: null,
      })
      const detail = await service.getUserDetail('u1', null)
      expect(detail.auth?.banned).toBe(true)
    })

    it('degrades auth to null (never invents data) when the Supabase lookup errors', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      accounts.count.mockResolvedValueOnce(0)
      authAdmin.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'boom' } })
      const detail = await service.getUserDetail('u1', null)
      expect(detail.auth).toBeNull()
    })
  })

  describe('listAuthStates (#1664)', () => {
    const authUser = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      id: 'u1',
      email: 'ada@b.co',
      email_confirmed_at: '2026-01-02T00:00:00.000Z',
      last_sign_in_at: '2026-06-01T00:00:00.000Z',
      banned_until: null,
      ...over,
    })

    it('rend un état par compte, avec la suspension et la dernière connexion', async () => {
      authAdmin.listUsers.mockResolvedValueOnce({
        data: {
          users: [authUser(), authUser({ id: 'u2', last_sign_in_at: null, banned_until: '2126-01-01T00:00:00.000Z' })],
        },
        error: null,
      })

      const res = await service.listAuthStates()

      expect(res.complete).toBe(true)
      expect(res.states).toEqual([
        {
          userId: 'u1',
          confirmed: true,
          banned: false,
          bannedUntil: null,
          lastSignInAt: '2026-06-01T00:00:00.000Z',
        },
        {
          userId: 'u2',
          confirmed: true,
          banned: true,
          bannedUntil: '2126-01-01T00:00:00.000Z',
          lastSignInAt: null,
        },
      ])
    })

    it('n’expose PAS l’adresse — l’annuaire la porte déjà, et une adresse qui voyage deux fois se masque une fois sur deux', async () => {
      authAdmin.listUsers.mockResolvedValueOnce({ data: { users: [authUser()] }, error: null })
      const res = await service.listAuthStates()
      expect(Object.keys(res.states[0] ?? {})).not.toContain('email')
    })

    it('n’INVENTE rien quand le magasin est en panne — les pages déjà lues restent, le reste est INCONNU', async () => {
      // ⚠️ Le mensonge qu'on refuse : « tout le monde est actif et personne ne
      // s'est jamais connecté ». `complete: false` est ce qui empêche l'écran
      // d'écrire « jamais connecté » sur un compte dont on ne sait rien.
      authAdmin.listUsers.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      const res = await service.listAuthStates()
      expect(res).toEqual({ complete: false, states: [] })
    })

    it('garde les pages déjà lues quand la panne survient en cours de route', async () => {
      const premierePage = Array.from({ length: 200 }, (_, i) => authUser({ id: `u${i}` }))
      authAdmin.listUsers
        .mockResolvedValueOnce({ data: { users: premierePage }, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })

      const res = await service.listAuthStates()

      expect(res.complete).toBe(false)
      expect(res.states).toHaveLength(200)
    })

    it('pagine jusqu’à la dernière page, et ne rappelle pas au-delà', async () => {
      const pleine = Array.from({ length: 200 }, (_, i) => authUser({ id: `a${i}` }))
      authAdmin.listUsers
        .mockResolvedValueOnce({ data: { users: pleine }, error: null })
        .mockResolvedValueOnce({ data: { users: [authUser({ id: 'dernier' })] }, error: null })

      const res = await service.listAuthStates()

      expect(authAdmin.listUsers).toHaveBeenCalledTimes(2)
      expect(authAdmin.listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 200 })
      expect(authAdmin.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 200 })
      expect(res.complete).toBe(true)
      expect(res.states).toHaveLength(201)
    })

    it('une exception ne remonte pas — elle rend « incomplet », jamais un 500 sur une console de diagnostic', async () => {
      authAdmin.listUsers.mockRejectedValueOnce(new Error('réseau'))
      await expect(service.listAuthStates()).resolves.toEqual({ complete: false, states: [] })
    })
  })

  describe('suspendUser', () => {
    it('bans via updateUserById with the long ban_duration', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.updateUserById.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'ada@b.co', banned_until: '2999-01-01T00:00:00.000Z' } },
        error: null,
      })
      const res = await service.suspendUser('u1')
      expect(authAdmin.updateUserById).toHaveBeenCalledWith('u1', { ban_duration: '876000h' })
      expect(res.banned).toBe(true)
    })

    it('404s when the profile is missing', async () => {
      profiles.findOne.mockResolvedValueOnce(null)
      await expect(service.suspendUser('ghost')).rejects.toThrow(NotFoundException)
      expect(authAdmin.updateUserById).not.toHaveBeenCalled()
    })

    it('throws when Supabase returns an error', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'nope' } })
      await expect(service.suspendUser('u1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('unsuspendUser', () => {
    it('lifts the ban with ban_duration none', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.updateUserById.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'ada@b.co', banned_until: null } },
        error: null,
      })
      const res = await service.unsuspendUser('u1')
      expect(authAdmin.updateUserById).toHaveBeenCalledWith('u1', { ban_duration: 'none' })
      expect(res.banned).toBe(false)
    })
  })

  describe('deleteUser', () => {
    it('deletes the auth user irreversibly', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      const res = await service.deleteUser('u1')
      expect(authAdmin.deleteUser).toHaveBeenCalledWith('u1')
      expect(res).toEqual({ deleted: true, userId: 'u1' })
    })

    it('throws when the delete errors', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.deleteUser.mockResolvedValueOnce({ data: {}, error: { message: 'fk violation' } })
      await expect(service.deleteUser('u1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('generateResetLink', () => {
    it('rend un lien vers NOTRE écran, pas le lien Supabase brut', async () => {
      // Le défaut du 20/08 : on rendait `action_link`, qui atterrit sur la
      // RACINE de l'application — où aucun écran ne sait le consommer.
      // L'opérateur remettait un lien qui ne permettait pas de changer son mot
      // de passe, et la personne se retrouvait sur la page d'accueil.
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.generateLink.mockResolvedValueOnce({
        data: {
          properties: { hashed_token: 'abc123', action_link: 'https://qkpu.supabase.co/auth/v1/verify?token=x' },
        },
        error: null,
      })
      const res = await service.generateResetLink('u1')
      expect(res.link).toContain('https://app.bellum-ai.com/auth/reset-password?')
      expect(res.link).toContain('token_hash=abc123')
      expect(res.link).toMatch(/signature=[a-f0-9]{64}/)
      // Et surtout : jamais le lien du fournisseur.
      expect(res.link).not.toContain('supabase.co')
    })

    it('dit QUAND le lien expire — un opérateur ne peut pas le deviner', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.generateLink.mockResolvedValueOnce({
        data: { properties: { hashed_token: 'abc123' } },
        error: null,
      })
      const res = await service.generateResetLink('u1')
      expect(Date.parse(res.expiresAt)).toBeGreaterThan(Date.now())
    })

    it('refuse quand Supabase ne rend AUCUN jeton exploitable', async () => {
      // Un `action_link` sans `hashed_token` ne sert à rien : mieux vaut un
      // refus net qu'un lien qu'on remettra sans savoir qu'il est mort.
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.generateLink.mockResolvedValueOnce({
        data: { properties: { action_link: 'https://qkpu.supabase.co/auth/v1/verify?token=x' } },
        error: null,
      })
      await expect(service.generateResetLink('u1')).rejects.toThrow(BadRequestException)
    })

    it('400s when the user has no email on file', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow({ email: null }))
      await expect(service.generateResetLink('u1')).rejects.toThrow(BadRequestException)
      expect(authAdmin.generateLink).not.toHaveBeenCalled()
    })

    it('throws when Supabase returns no link', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      authAdmin.generateLink.mockResolvedValueOnce({ data: { properties: null }, error: null })
      await expect(service.generateResetLink('u1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('grantCredits', () => {
    it('bumps both counters and writes one ledger row per non-zero delta', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce({
        user_id: 'u1',
        plan: 'team',
        accounts_limit: 30,
        accounts_used: 4,
        enrichment_credits: 50,
      } as SubscriptionEntity)

      const res = await service.grantCredits('u1', { accounts: 5, enrichment: 10, reason: 'geste commercial' })

      expect(subscriptions.save).toHaveBeenCalledWith(
        expect.objectContaining({ accounts_limit: 35, enrichment_credits: 60 }),
      )
      expect(ledger.insert).toHaveBeenCalledTimes(2)
      expect(ledger.insert).toHaveBeenCalledWith(
        expect.objectContaining({ owner_user_id: 'u1', resource: 'analysis_slot', delta: 5 }),
      )
      expect(ledger.insert).toHaveBeenCalledWith(
        expect.objectContaining({ owner_user_id: 'u1', resource: 'enrichment_credit', delta: 10 }),
      )
      expect(res.accountsLimit).toBe(35)
      expect(res.enrichmentCredits).toBe(60)
    })

    it('floors a negative adjustment at zero and only writes the touched ledger row', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce({
        user_id: 'u1',
        plan: 'trial',
        accounts_limit: 3,
        accounts_used: 0,
        enrichment_credits: 2,
      } as SubscriptionEntity)

      const res = await service.grantCredits('u1', { enrichment: -10, reason: 'correction' })
      expect(res.enrichmentCredits).toBe(0)
      expect(res.accountsLimit).toBe(3)
      expect(ledger.insert).toHaveBeenCalledTimes(1)
      expect(ledger.insert).toHaveBeenCalledWith(expect.objectContaining({ resource: 'enrichment_credit', delta: -10 }))
    })

    it('sème une ligne verrouillée quand il n’y en a pas, puis accorde EXACTEMENT ce qui est demandé', async () => {
      // Le défaut que ce retournement corrige : un opérateur qui accordait 2
      // crédits à un utilisateur sans ligne lui en donnait 122 — les 120 de
      // l'essai s'ajoutaient en silence à son geste. Le socle étant désormais à
      // zéro, un don de 2 vaut 2.
      profiles.findOne.mockResolvedValueOnce(profileRow())
      subscriptions.findOne.mockResolvedValueOnce(null)

      const res = await service.grantCredits('u1', { accounts: 2, reason: 'geste commercial' })
      expect(subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', plan: 'trial' }))
      expect(res.accountsLimit).toBe(2)
    })

    it('404s when the user has no profile', async () => {
      profiles.findOne.mockResolvedValueOnce(null)
      await expect(service.grantCredits('ghost', { accounts: 1, reason: 'x' })).rejects.toThrow(NotFoundException)
      expect(subscriptions.save).not.toHaveBeenCalled()
    })

    it('400s when both deltas are zero/absent', async () => {
      profiles.findOne.mockResolvedValueOnce(profileRow())
      await expect(service.grantCredits('u1', { reason: 'noop' })).rejects.toThrow(BadRequestException)
    })
  })
})

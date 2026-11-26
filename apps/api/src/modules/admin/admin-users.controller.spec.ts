import { DEFAULT_RESET_LINK_TTL } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminIdentityService } from './admin-identity.service'
import { AdminUsersController } from './admin-users.controller'
import { AdminUsersService } from './admin-users.service'

type MockAdminUsersService = {
  getUserDetail: jest.Mock
  suspendUser: jest.Mock
  unsuspendUser: jest.Mock
  deleteUser: jest.Mock
  generateResetLink: jest.Mock
  grantCredits: jest.Mock
  listAuthStates: jest.Mock
}

type MockAdminIdentityService = {
  findDuplicates: jest.Mock
  mergeIdentities: jest.Mock
}

describe('AdminUsersController', () => {
  let users: MockAdminUsersService
  let identities: MockAdminIdentityService
  let controller: AdminUsersController

  beforeEach(() => {
    users = {
      getUserDetail: jest.fn().mockResolvedValue({ userId: 'u1' }),
      suspendUser: jest.fn().mockResolvedValue({ userId: 'u1', banned: true, bannedUntil: null }),
      unsuspendUser: jest.fn().mockResolvedValue({ userId: 'u1', banned: false, bannedUntil: null }),
      deleteUser: jest.fn().mockResolvedValue({ deleted: true, userId: 'u1' }),
      generateResetLink: jest.fn().mockResolvedValue({ link: 'https://x', email: 'a@b.co' }),
      grantCredits: jest.fn().mockResolvedValue({ userId: 'u1' }),
      listAuthStates: jest.fn().mockResolvedValue({ complete: true, states: [] }),
    }
    identities = {
      findDuplicates: jest.fn().mockResolvedValue({ pairs: [], scanned: 0 }),
      mergeIdentities: jest.fn().mockResolvedValue({ keepUserId: 'u1', absorbUserId: 'u2' }),
    }
    // LA résolution d'espace du produit — le contrôleur la consulte pour dire
    // quel espace l'utilisateur VOIT (#1671-ter).
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    controller = new AdminUsersController(
      users as unknown as AdminUsersService,
      identities as unknown as AdminIdentityService,
      workspaceContext as never,
    )
  })

  it('propose les doublons d’identité sans rien fusionner (IDENT-01)', async () => {
    await controller.findDuplicates('0.7', '10')
    expect(identities.findDuplicates).toHaveBeenCalledWith({ minConfidence: 0.7, limit: 10 })
    expect(identities.mergeIdentities).not.toHaveBeenCalled()
  })

  it('ne fusionne que sur DEUX identifiants explicitement fournis', async () => {
    await controller.mergeIdentities({ keep_user_id: 'keep', absorb_user_id: 'absorb' } as never)
    expect(identities.mergeIdentities).toHaveBeenCalledWith('keep', 'absorb')
  })

  it('sert les états d’authentification de l’annuaire (#1664)', async () => {
    await expect(controller.listAuthStates()).resolves.toEqual({ complete: true, states: [] })
    expect(users.listAuthStates).toHaveBeenCalledTimes(1)
  })

  it('la route des états ne vit PAS sous `users/`, où `:userId` la capturerait', () => {
    // ⚠️ Deux contrôleurs partagent le préfixe `internal/admin`, et celui-ci
    // porte `users/:userId`. Une route littérale sous `users/` dépendrait de
    // l'ordre d'enregistrement des modules pour ne pas être avalée — piège déjà
    // payé dans ce dépôt. Le segment est donc de premier niveau.
    const chemin = Reflect.getMetadata('path', AdminUsersController.prototype.listAuthStates) as string
    expect(chemin).toBe('users-auth-states')
    expect(chemin.startsWith('users/')).toBe(false)
  })

  it('is guarded by InternalSecretGuard at the class level', () => {
    // Losing the guard would expose destructive cross-tenant auth ops — tripwire.
    const guards = Reflect.getMetadata('__guards__', AdminUsersController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it("délègue la fiche AVEC l'espace que l'utilisateur voit réellement (#1671-ter)", async () => {
    await controller.getUserDetail('u1')
    // L'espace actif vient de LA résolution du produit, pas d'une seconde
    // lecture : c'est ce qui empêche la console de diverger de ce que
    // l'utilisateur voit.
    expect(users.getUserDetail).toHaveBeenCalledWith('u1', 'ws-1')
  })

  it('suspends via the service', async () => {
    await controller.suspendUser('u1')
    expect(users.suspendUser).toHaveBeenCalledWith('u1')
  })

  it('unsuspends via the service', async () => {
    await controller.unsuspendUser('u1')
    expect(users.unsuspendUser).toHaveBeenCalledWith('u1')
  })

  it('deletes via the service', async () => {
    // #1664.2 — the confirmation itself is enforced by DeleteUserDto (Zod, at
    // the HTTP boundary — see admin-users-delete.controller.e2e.spec.ts).
    // Here we're past that gate; the controller still just delegates the id.
    await controller.deleteUser('u1', { confirm: 'SUPPRIMER' })
    expect(users.deleteUser).toHaveBeenCalledWith('u1')
  })

  it('forwards the chosen TTL to the service', async () => {
    await controller.resetLink('u1', { ttl: '1h' } as never)
    expect(users.generateResetLink).toHaveBeenCalledWith('u1', '1h')
  })

  it('defaults to 24 h when the caller asks for nothing', async () => {
    // Un lien de back-office se transmet à la main et s'ouvre quand la personne
    // peut. Le défaut historique — quinze minutes, celui du flux e-mail en
    // libre-service — obligeait à regénérer un lien à chaque fois que quelqu'un
    // ne répondait pas dans l'heure. 24 h est le maximum que Supabase autorise.
    await controller.resetLink('u1', { ttl: DEFAULT_RESET_LINK_TTL } as never)
    expect(users.generateResetLink).toHaveBeenCalledWith('u1', '24h')
  })

  it('forwards the credits dto fields to the service', async () => {
    await controller.grantCredits('u1', { accounts: 5, enrichment: 10, reason: 'geste' } as never)
    expect(users.grantCredits).toHaveBeenCalledWith('u1', { accounts: 5, enrichment: 10, reason: 'geste' })
  })
})

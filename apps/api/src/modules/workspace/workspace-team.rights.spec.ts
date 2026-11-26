import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { resolveBrand } from '@bellum/contracts'
import { WorkspaceTeamService } from './workspace-team.service'
import { createMockRepository } from '../../database/test-utils'
import { PlanCatalogService } from '../credits/plan-catalog.service'

/**
 * #4158.1–4 — droits des rôles admin/owner, renvoi, expiration, retrait.
 * Le rôle de l'appelant vient de `assertPermission` (la ligne d'appartenance).
 */
const WS = 'ws-1'
const brandsStub = {
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

const build = (callerRole: string) => {
  const context = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: callerRole }),
    assertPermission: jest.fn().mockResolvedValue({ workspace_id: WS, user_id: 'caller', role: callerRole }),
    assertRole: jest.fn().mockResolvedValue({ workspace_id: WS, user_id: 'caller', role: callerRole }),
  }
  const mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) }
  const workspaces = createMockRepository<never>()
  const members = createMockRepository<never>()
  const invitations = createMockRepository<never>()
  const profiles = createMockRepository<never>()
  const subscriptions = createMockRepository<never>()
  const planItems = createMockRepository<never>()
  // #4158.54 — la libération passe par le helper partagé : `manager.update` (comptes, contacts) puis `manager.query`.
  Object.assign(planItems.manager, { update: jest.fn().mockResolvedValue({ affected: 0 }) })
  workspaces.findOne.mockResolvedValue({ id: WS, name: 'Acme', owner_user_id: 'owner' })
  subscriptions.findOne.mockResolvedValue({ plan: 'team' })
  members.find.mockResolvedValue([{ user_id: 'owner' }])
  invitations.find.mockResolvedValue([])
  const service = new WorkspaceTeamService(
    context as never,
    { get: jest.fn().mockReturnValue('http://localhost:5173') } as never,
    mailer as never,
    workspaces as never,
    members as never,
    invitations as never,
    profiles as never,
    subscriptions as never,
    new PlanCatalogService(createMockRepository<never>() as never),
    brandsStub as never,
    undefined,
    undefined,
    undefined,
    undefined,
    planItems as never,
  )
  return { service, context, mailer, members, invitations, planItems }
}

describe('#4158.1 — sales_ops ne touche pas aux rôles admin/owner', () => {
  it('sales_ops invite un admin → 403, rien d’écrit', async () => {
    const { service, invitations } = build('sales_ops')
    await expect(service.createInvitation('caller', { email: 'a@acme.fr', role: 'admin' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(invitations.save).not.toHaveBeenCalled()
  })

  it('sales_ops invite un sales → accepté', async () => {
    const { service } = build('sales_ops')
    await expect(service.createInvitation('caller', { email: 'a@acme.fr', role: 'sales' })).resolves.toBeDefined()
  })

  it('admin invite un admin → accepté', async () => {
    const { service } = build('admin')
    await expect(service.createInvitation('caller', { email: 'a@acme.fr', role: 'admin' })).resolves.toBeDefined()
  })

  it('sales_ops retire un admin → 403 ; retire un sales → ok', async () => {
    const a = build('sales_ops')
    a.members.findOne.mockResolvedValue({ user_id: 'u2', role: 'admin' })
    await expect(a.service.removeMember('caller', 'u2')).rejects.toBeInstanceOf(ForbiddenException)
    expect(a.members.delete).not.toHaveBeenCalled()
    const b = build('sales_ops')
    b.members.findOne.mockResolvedValue({ user_id: 'u3', role: 'sales' })
    await expect(b.service.removeMember('caller', 'u3')).resolves.toEqual({ removed: true })
  })

  it('un admin ne retire pas le propriétaire (400)', async () => {
    const { service, members } = build('admin')
    members.findOne.mockResolvedValue({ user_id: 'owner', role: 'owner' })
    await expect(service.removeMember('caller', 'owner')).rejects.toThrow()
    expect(members.delete).not.toHaveBeenCalled()
  })

  it('sales_ops promeut quelqu’un admin → 403 ; rétrograde un admin → 403 ; sales → viewer ok', async () => {
    const a = build('sales_ops')
    a.members.findOne.mockResolvedValue({ user_id: 'u2', role: 'sales' })
    await expect(a.service.updateMemberRole('caller', 'u2', 'admin')).rejects.toBeInstanceOf(ForbiddenException)
    a.members.findOne.mockResolvedValue({ user_id: 'u3', role: 'admin' })
    await expect(a.service.updateMemberRole('caller', 'u3', 'sales')).rejects.toBeInstanceOf(ForbiddenException)
    expect(a.members.save).not.toHaveBeenCalled()
    a.members.findOne.mockResolvedValue({ user_id: 'u2', role: 'sales' })
    a.members.find.mockResolvedValue([])
    await expect(a.service.updateMemberRole('caller', 'u2', 'viewer')).resolves.toBeDefined()
  })

  it('un admin promeut quelqu’un admin → ok', async () => {
    const { service, members } = build('admin')
    members.findOne.mockResolvedValue({ user_id: 'u2', role: 'sales' })
    await expect(service.updateMemberRole('caller', 'u2', 'admin')).resolves.toBeDefined()
  })
})

describe('#4158.2 — renvoi d’une invitation', () => {
  const pending = (over: object = {}) => ({
    id: 'inv-1',
    workspace_id: WS,
    email: 'a@acme.fr',
    role: 'sales',
    token: 'old-token',
    status: 'pending',
    expires_at: new Date(Date.now() + 1000),
    ...over,
  })

  it('régénère le jeton, repousse l’expiration de 7 j, renvoie l’e-mail et dit l’issue', async () => {
    const { service, invitations, mailer } = build('sales_ops')
    invitations.findOne.mockResolvedValue(pending())
    const res = await service.resendInvitation('caller', 'inv-1')
    const saved = invitations.save.mock.calls[0][0]
    expect(saved.token).not.toBe('old-token')
    expect(saved.expires_at.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000)
    expect(mailer.sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@acme.fr', ctaUrl: expect.stringContaining(saved.token) }),
    )
    expect(res.emailSent).toBe(true)
  })

  it('e-mail non parti → emailSent false, l’invitation est quand même renouvelée', async () => {
    const { service, invitations, mailer } = build('owner')
    invitations.findOne.mockResolvedValue(pending())
    mailer.sendNotificationEmail.mockRejectedValue(new Error('smtp'))
    const res = await service.resendInvitation('caller', 'inv-1')
    expect(res.emailSent).toBe(false)
    expect(res.emailError).toBe('smtp')
    expect(invitations.save).toHaveBeenCalled()
  })

  it('invitation d’un AUTRE espace → 404 (la recherche est bornée à l’espace actif)', async () => {
    const { service, invitations } = build('owner')
    invitations.findOne.mockResolvedValue(null)
    await expect(service.resendInvitation('caller', 'inv-x')).rejects.toBeInstanceOf(NotFoundException)
    expect(invitations.findOne).toHaveBeenCalledWith({ where: { id: 'inv-x', workspace_id: WS } })
  })

  it('mêmes règles que #1 : sales_ops ne renvoie pas une invitation admin (403)', async () => {
    const { service, invitations, mailer } = build('sales_ops')
    invitations.findOne.mockResolvedValue(pending({ role: 'admin' }))
    await expect(service.resendInvitation('caller', 'inv-1')).rejects.toBeInstanceOf(ForbiddenException)
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('une invitation acceptée ou révoquée ne se renvoie pas (409)', async () => {
    const { service, invitations } = build('owner')
    invitations.findOne.mockResolvedValue(pending({ status: 'accepted' }))
    await expect(service.resendInvitation('caller', 'inv-1')).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('#4158.3 — expiration', () => {
  it('une invitation périmée mais encore `pending` ne compte plus comme siège ni ne bloque le même e-mail', async () => {
    const { service, invitations } = build('owner')
    invitations.find.mockImplementation(async (opts: { where?: { expires_at?: unknown } }) =>
      opts?.where?.expires_at ? [] : [{ email: 'a@acme.fr', status: 'pending', expires_at: new Date(0) }],
    )
    await expect(service.createInvitation('caller', { email: 'a@acme.fr', role: 'sales' })).resolves.toBeDefined()
  })

  it('la ré-invitation marque d’abord la ligne périmée `expired` (index unique sur pending)', async () => {
    const { service, invitations } = build('owner')
    await service.createInvitation('caller', { email: 'a@acme.fr', role: 'sales' })
    expect(invitations.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WS, email: 'a@acme.fr', status: 'pending' }),
      { status: 'expired' },
    )
  })

  it('markExpiredInvitations marque en lot et rend le nombre', async () => {
    const { service, invitations } = build('owner')
    invitations.update.mockResolvedValue({ affected: 3 })
    await expect(service.markExpiredInvitations()).resolves.toBe(3)
    expect(invitations.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), {
      status: 'expired',
    })
  })
})

describe('#4158.4 — retrait : les actions déléguées sont libérées', () => {
  it('assigned_to du partant remis à NULL (retour au créateur), borné aux comptes de l’espace', async () => {
    const { service, members, planItems } = build('owner')
    members.findOne.mockResolvedValue({ user_id: 'u2', role: 'sales' })
    await service.removeMember('caller', 'u2')
    expect(planItems.manager.query).toHaveBeenCalledTimes(1)
    const [sql, params] = planItems.manager.query.mock.calls[0]
    expect(sql).toMatch(/UPDATE action_plan_items/i)
    expect(sql).toMatch(/workspace_id/)
    expect(params).toEqual(['u2', WS])
  })

  it('un échec de la libération ne défait pas le retrait', async () => {
    const { service, members, planItems } = build('owner')
    members.findOne.mockResolvedValue({ user_id: 'u2', role: 'sales' })
    planItems.manager.query.mockRejectedValue(new Error('db'))
    await expect(service.removeMember('caller', 'u2')).resolves.toEqual({ removed: true })
  })
})

import { planOwnershipTransfer, type OwnershipTransferContext } from './workspace-ownership-transfer-plan'

const OLD = 'user-old'
const NEW = 'user-new'

const base = (): OwnershipTransferContext => ({
  workspace: { id: 'ws-1', ownerUserId: OLD, isDemo: false },
  newOwnerUserId: NEW,
  newOwnerRole: 'admin',
  currentOwnerSubscription: {
    billingMode: 'manual',
    plan: 'team',
    accountsLimit: 40,
    accountsUsed: 12,
    enrichmentCredits: 300,
    extraSeats: 2,
  },
  newOwnerHasSubscription: false,
  currentOwnerOtherWorkspaces: 0,
  newOwnerOtherWorkspaces: 0,
})

// #4158.33 — le planificateur sait dire NON : chaque refus a son code et son message.
describe('planOwnershipTransfer (#4158.33)', () => {
  it('facturation manuelle + cible admin : autorisé, et le pool est conservé au centime', () => {
    const plan = planOwnershipTransfer(base())
    expect(plan).toMatchObject({
      ok: true,
      fromUserId: OLD,
      toUserId: NEW,
      movesSubscription: true,
      pool: { accountsLimit: 40, accountsUsed: 12, enrichmentCredits: 300, extraSeats: 2, plan: 'team' },
    })
  })

  it('refuse si la cible n’est pas membre', () => {
    expect(planOwnershipTransfer({ ...base(), newOwnerRole: null })).toMatchObject({ ok: false, code: 'not_member' })
  })

  it.each(['member', 'sales_ops', 'viewer', 'sales'] as const)('refuse si la cible est %s (pas admin)', role => {
    expect(planOwnershipTransfer({ ...base(), newOwnerRole: role })).toMatchObject({ ok: false, code: 'not_admin' })
  })

  it('refuse de « transférer » à l’actuel propriétaire', () => {
    expect(planOwnershipTransfer({ ...base(), newOwnerUserId: OLD, newOwnerRole: 'owner' })).toMatchObject({
      ok: false,
      code: 'already_owner',
    })
  })

  it('refuse un abonnement Stripe, avec un message clair', () => {
    const ctx = base()
    ctx.currentOwnerSubscription = { ...ctx.currentOwnerSubscription!, billingMode: 'stripe' }
    const plan = planOwnershipTransfer(ctx)
    expect(plan).toMatchObject({ ok: false, code: 'stripe_billing' })
    expect(plan.ok === false && plan.message).toContain('Stripe')
  })

  it('refuse si la cible porte déjà un abonnement (on ne l’écrase pas)', () => {
    expect(planOwnershipTransfer({ ...base(), newOwnerHasSubscription: true })).toMatchObject({
      ok: false,
      code: 'target_has_subscription',
    })
  })

  it('refuse si l’ancien propriétaire possède un autre espace (le pool est par personne)', () => {
    expect(planOwnershipTransfer({ ...base(), currentOwnerOtherWorkspaces: 1 })).toMatchObject({
      ok: false,
      code: 'owner_has_other_workspaces',
    })
  })

  it('refuse si la cible possède un autre espace', () => {
    expect(planOwnershipTransfer({ ...base(), newOwnerOtherWorkspaces: 1 })).toMatchObject({
      ok: false,
      code: 'target_owns_other_workspace',
    })
  })

  it('refuse un espace de démonstration', () => {
    const ctx = base()
    ctx.workspace = { ...ctx.workspace, isDemo: true }
    expect(planOwnershipTransfer(ctx)).toMatchObject({ ok: false, code: 'demo_workspace' })
  })

  it('sans abonnement à déplacer : autorisé, rien à déplacer', () => {
    expect(planOwnershipTransfer({ ...base(), currentOwnerSubscription: null })).toMatchObject({
      ok: true,
      movesSubscription: false,
      pool: null,
    })
  })
})

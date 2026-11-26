import { buildConsumption, readPool, UNLIMITED_ACCOUNTS_LIMIT } from './credit-consumption'

// #4467 — la consommation de crédits ne se voit QUE dans le back-office : par
// espace ET par utilisateur. Le solde est celui du POOL de l'espace (partagé,
// porté par l'abonnement du propriétaire) ; la consommation par utilisateur vient
// du grand livre (`actor_user_id`).

function sub(over: Partial<Parameters<typeof readPool>[0] & object> = {}): NonNullable<Parameters<typeof readPool>[0]> {
  return {
    plan: 'growth',
    accounts_limit: 100,
    accounts_used: 40,
    topup_analyses: 0,
    rollover_credits: 0,
    rollover_expires_at: null,
    period_start: new Date('2026-10-05T00:00:00Z'),
    ...over,
  }
}

describe('readPool — le solde du pool d’un espace', () => {
  it('dit le solde restant, la capacité et la date de renouvellement', () => {
    const pool = readPool(sub())
    expect(pool).toMatchObject({ capacity: 100, remaining: 60, exhausted: false, unlimited: false })
    expect(pool.renewsAt?.slice(0, 10)).toBe('2026-11-05')
  })

  it('compte la recharge et le report encore valide dans la capacité', () => {
    const pool = readPool(
      sub({ topup_analyses: 10, rollover_credits: 5, rollover_expires_at: new Date(Date.now() + 86_400_000) }),
    )
    expect(pool.capacity).toBe(115)
    expect(pool.remaining).toBe(75)
  })

  it('est ÉPUISÉ quand le solde atteint zéro — jamais négatif', () => {
    expect(readPool(sub({ accounts_used: 100 }))).toMatchObject({ remaining: 0, exhausted: true })
    expect(readPool(sub({ accounts_used: 130 }))).toMatchObject({ remaining: 0, exhausted: true })
  })

  it('un pool illimité n’a ni solde ni épuisement : non mesurable n’est pas zéro', () => {
    const pool = readPool(sub({ accounts_limit: UNLIMITED_ACCOUNTS_LIMIT }))
    expect(pool).toMatchObject({ unlimited: true, capacity: null, remaining: null, exhausted: false })
  })

  it('sans abonnement : rien n’est inventé', () => {
    expect(readPool(null)).toEqual({
      capacity: null,
      remaining: null,
      exhausted: false,
      unlimited: false,
      renewsAt: null,
    })
  })

  it('un palier à fenêtre (essai) n’a pas de date de renouvellement', () => {
    expect(readPool(sub({ plan: 'trial' })).renewsAt).toBeNull()
  })
})

const WS = { id: 'w1', name: 'Acme ESN', ownerUserId: 'u-owner' }

describe('buildConsumption — par espace ET par utilisateur', () => {
  const emails = new Map([
    ['u-owner', 'owner@acme.fr'],
    ['u-a', 'a@acme.fr'],
    ['u-b', 'b@acme.fr'],
  ])

  it('une ligne par espace avec solde, consommé sur la fenêtre et renouvellement', () => {
    const { workspaces } = buildConsumption({
      windowDays: 30,
      workspaces: [{ ...WS, memberIds: ['u-owner', 'u-a'], sub: sub() }],
      ledger: [
        { workspaceId: 'w1', actorUserId: 'u-a', consumed: 12 },
        { workspaceId: 'w1', actorUserId: 'u-owner', consumed: 3 },
      ],
      emails,
    })
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      workspaceId: 'w1',
      remaining: 60,
      capacity: 100,
      consumed: 15,
      exhausted: false,
      memberCount: 2,
    })
    expect(workspaces[0]!.renewsAt?.slice(0, 10)).toBe('2026-11-05')
  })

  it('une ligne par membre : sa consommation propre, le solde du pool de son espace', () => {
    const { users } = buildConsumption({
      windowDays: 30,
      workspaces: [{ ...WS, memberIds: ['u-owner', 'u-a', 'u-b'], sub: sub() }],
      ledger: [{ workspaceId: 'w1', actorUserId: 'u-a', consumed: 12 }],
      emails,
    })
    const a = users.find(row => row.userId === 'u-a')!
    expect(a).toMatchObject({ email: 'a@acme.fr', consumed: 12, remaining: 60, workspaceName: 'Acme ESN' })
    // Le grand livre a des lignes pour cet espace : un membre sans ligne a vraiment consommé 0.
    expect(users.find(row => row.userId === 'u-b')!.consumed).toBe(0)
  })

  it('la consommation d’un membre est NON MESURÉE (null) quand le grand livre est muet alors que le pool a débité', () => {
    const { users } = buildConsumption({
      windowDays: 30,
      workspaces: [{ ...WS, memberIds: ['u-a'], sub: sub({ accounts_used: 40 }) }],
      ledger: [],
      emails,
    })
    expect(users[0]!.consumed).toBeNull()
  })

  it('liste les comptes à solde épuisé — ceux qui voient le frein doux — et eux seuls', () => {
    const { exhausted } = buildConsumption({
      windowDays: 30,
      workspaces: [
        { ...WS, memberIds: ['u-owner', 'u-a'], sub: sub({ accounts_used: 100 }) },
        { id: 'w2', name: 'Beta SARL', ownerUserId: 'u-b', memberIds: ['u-b'], sub: sub() },
        { id: 'w3', name: 'Illimité', ownerUserId: 'u-x', memberIds: ['u-x'], sub: sub({ accounts_limit: 999_999 }) },
      ],
      ledger: [],
      emails,
    })
    expect(exhausted.map(row => row.userId).sort()).toEqual(['u-a', 'u-owner'])
    expect(exhausted.every(row => row.workspaceName === 'Acme ESN')).toBe(true)
  })

  it('sans abonnement lisible, l’espace n’a ni solde ni épuisement', () => {
    const { workspaces, exhausted } = buildConsumption({
      windowDays: 30,
      workspaces: [{ ...WS, memberIds: ['u-owner'], sub: null }],
      ledger: [],
      emails,
    })
    expect(workspaces[0]).toMatchObject({ remaining: null, capacity: null, exhausted: false })
    expect(exhausted).toEqual([])
  })

  it('ignore les lignes du grand livre sans auteur pour les membres, mais les compte dans l’espace', () => {
    const { workspaces, users } = buildConsumption({
      windowDays: 30,
      workspaces: [{ ...WS, memberIds: ['u-a'], sub: sub() }],
      ledger: [
        { workspaceId: 'w1', actorUserId: null, consumed: 5 },
        { workspaceId: 'w1', actorUserId: 'u-a', consumed: 2 },
      ],
      emails,
    })
    expect(workspaces[0]!.consumed).toBe(7)
    expect(users[0]!.consumed).toBe(2)
  })
})

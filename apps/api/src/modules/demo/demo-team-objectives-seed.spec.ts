import { DEMO_COLLEAGUES } from './demo-dataset'
import { DEMO_PROPOSED_TARGET, seedTeamObjectives } from './demo-team-objectives-seed'

const lea = DEMO_COLLEAGUES.find(c => c.key === 'lea')!

function db(memberIds: string[]) {
  const writes: { sql: string; params: unknown[] }[] = []
  async function query<T>(sql: string, params: unknown[] = []): Promise<T> {
    if (sql.includes('FROM workspace_members')) return memberIds.map(user_id => ({ user_id })) as T
    writes.push({ sql, params })
    return [] as T
  }
  return { writes, query }
}

const input = { workspaceId: 'ws-1', ownerUserId: 'owner', now: new Date(2026, 9, 22) }

describe('seedTeamObjectives (Théo D team-business.N2, craft rule n°9)', () => {
  it('sans collègue fictif, ne sème rien — jamais une cible attribuée à quelqu’un qui n’existe pas', async () => {
    const conn = db([])
    expect(await seedTeamObjectives(conn, input)).toEqual({ seeded: false })
    expect(conn.writes).toHaveLength(0)
  })

  it('sème la cible déclarée de Léa pour le mois courant', async () => {
    const conn = db([lea.userId])
    await seedTeamObjectives(conn, input)
    const insert = conn.writes.find(w => w.sql.includes('INSERT INTO member_objectives'))
    expect(insert?.params).toEqual([lea.userId, 'ws-1', '2026-10-01', 10, 6, 60000])
  })

  it('sème UNE proposition de l’occupant à Léa, en attente, jamais appliquée à sa cible', async () => {
    const conn = db([lea.userId])
    await seedTeamObjectives(conn, input)
    const proposal = conn.writes.find(w => w.sql.includes('INSERT INTO objective_proposals'))
    expect(proposal?.sql).toContain("'proposed'")
    expect(proposal?.params.slice(0, 3)).toEqual(['ws-1', lea.userId, 'owner'])
    expect(proposal?.params).toContain(DEMO_PROPOSED_TARGET.revenue)
    // la cible de Léa reste celle qu’elle a déclarée : la proposition n’écrit pas `member_objectives`.
    expect(conn.writes.filter(w => w.sql.includes('INSERT INTO member_objectives'))).toHaveLength(1)
  })

  it('est idempotent : chaque écriture est gardée', async () => {
    const conn = db([lea.userId])
    await seedTeamObjectives(conn, input)
    for (const w of conn.writes) expect(w.sql).toMatch(/ON CONFLICT|NOT EXISTS/)
  })
})

import { ConflictException, NotFoundException } from '@nestjs/common'
import type { DataSource } from 'typeorm'
import { WorkspaceOwnershipTransferService } from './workspace-ownership-transfer.service'

const WS = 'ws-1'
const OTHER_WS = 'ws-2'
const OLD = 'user-old'
const NEW = 'user-new'
const OTHER_OWNER = 'user-other'

type Db = {
  workspaces: { id: string; name: string; owner_user_id: string; is_demo: boolean }[]
  members: { workspace_id: string; user_id: string; role: string; created_at: number }[]
  subscriptions: Record<string, unknown>[]
  ledger: Record<string, unknown>[]
  writes: { sql: string; params: unknown[] }[]
}

/** Une base en mémoire qui comprend EXACTEMENT les requêtes du service, et rien d'autre. */
function fakeDataSource(db: Db): DataSource {
  const query = async (sql: string, p: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim()
    if (s.startsWith('SELECT id, name, owner_user_id, is_demo FROM workspaces')) {
      return db.workspaces.filter(w => w.id === p[0])
    }
    if (s.startsWith('SELECT role FROM workspace_members')) {
      return db.members.filter(m => m.workspace_id === p[0] && m.user_id === p[1])
    }
    if (s.startsWith('SELECT user_id FROM workspace_members')) {
      return db.members.filter(m => m.workspace_id === p[0] && m.role === 'admin')
    }
    if (s.startsWith('SELECT billing_mode')) return db.subscriptions.filter(r => r['user_id'] === p[0])
    if (s.startsWith('SELECT 1 FROM subscriptions')) return db.subscriptions.filter(r => r['user_id'] === p[0])
    if (s.startsWith('SELECT COUNT(*)')) {
      return [{ n: db.workspaces.filter(w => w.owner_user_id === p[0] && w.id !== p[1] && !w.is_demo).length }]
    }
    if (s.startsWith('SELECT user_id, email FROM profiles')) {
      return (p[0] as string[]).map(id => ({ user_id: id, email: `${id}@esn.test` }))
    }
    db.writes.push({ sql: s, params: p })
    if (s.startsWith("UPDATE workspace_members SET role = 'admin'")) {
      db.members.filter(m => m.workspace_id === p[0] && m.user_id === p[1]).forEach(m => (m.role = 'admin'))
    } else if (s.startsWith("UPDATE workspace_members SET role = 'owner'")) {
      db.members.filter(m => m.workspace_id === p[0] && m.user_id === p[1]).forEach(m => (m.role = 'owner'))
    } else if (s.startsWith('UPDATE workspaces SET owner_user_id')) {
      db.workspaces.filter(w => w.id === p[0]).forEach(w => (w.owner_user_id = p[1] as string))
    } else if (s.startsWith('UPDATE subscriptions SET user_id')) {
      db.subscriptions.filter(r => r['user_id'] === p[0]).forEach(r => (r['user_id'] = p[1]))
    } else if (s.startsWith('UPDATE credit_ledger SET owner_user_id')) {
      db.ledger
        .filter(r => r['workspace_id'] === p[0] && r['owner_user_id'] === p[1])
        .forEach(r => (r['owner_user_id'] = p[2]))
    } else if (s.startsWith('INSERT INTO credit_ledger')) {
      db.ledger.push({ owner_user_id: p[0], workspace_id: p[1], kind: 'ownership_transfer', delta: 0, reason: p[2] })
    } else {
      throw new Error(`requête inattendue : ${s}`)
    }
    return []
  }
  return { transaction: async (fn: (m: unknown) => unknown) => fn({ query }) } as unknown as DataSource
}

const POOL = {
  user_id: OLD,
  billing_mode: 'manual',
  plan: 'team',
  accounts_limit: 40,
  accounts_used: 12,
  topup_analyses: 5,
  enrichment_credits: 300,
  extra_seats: 2,
}

function freshDb(): Db {
  return {
    workspaces: [
      { id: WS, name: 'Alpha ESN', owner_user_id: OLD, is_demo: false },
      { id: OTHER_WS, name: 'Beta ESN', owner_user_id: OTHER_OWNER, is_demo: false },
    ],
    members: [
      { workspace_id: WS, user_id: OLD, role: 'owner', created_at: 1 },
      { workspace_id: WS, user_id: NEW, role: 'admin', created_at: 2 },
      { workspace_id: OTHER_WS, user_id: OTHER_OWNER, role: 'owner', created_at: 1 },
      { workspace_id: OTHER_WS, user_id: NEW, role: 'admin', created_at: 2 },
    ],
    subscriptions: [{ ...POOL }, { ...POOL, user_id: OTHER_OWNER, plan: 'growth', accounts_limit: 99 }],
    ledger: [
      { owner_user_id: OLD, workspace_id: WS, kind: 'consume_analysis', delta: -1 },
      { owner_user_id: OTHER_OWNER, workspace_id: OTHER_WS, kind: 'consume_analysis', delta: -1 },
    ],
    writes: [],
  }
}

// #4158.33
describe('WorkspaceOwnershipTransferService', () => {
  // NEW est admin de OTHER_WS sans le posséder : il ne possède aucun autre espace.
  it('transfert réussi : nouveau owner, ancien admin, pool et abonnement suivent', async () => {
    const db = freshDb()
    const res = await new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)

    expect(res).toEqual({ workspaceId: WS, fromUserId: OLD, toUserId: NEW, movedSubscription: true })
    expect(db.workspaces[0]!.owner_user_id).toBe(NEW)
    expect(db.members.find(m => m.workspace_id === WS && m.user_id === NEW)!.role).toBe('owner')
    expect(db.members.find(m => m.workspace_id === WS && m.user_id === OLD)!.role).toBe('admin')
    expect(db.members.filter(m => m.workspace_id === WS && m.role === 'owner')).toHaveLength(1)
  })

  it('crédits conservés au centime : la même ligne change de porteur, aucun compteur n’est touché', async () => {
    const db = freshDb()
    await new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)

    expect(db.subscriptions.find(r => r['user_id'] === OLD)).toBeUndefined()
    expect(db.subscriptions.find(r => r['user_id'] === NEW)).toEqual({ ...POOL, user_id: NEW })
    // Aucune requête n'écrit un compteur : seul `user_id` bouge.
    const subscriptionWrites = db.writes.filter(w => w.sql.startsWith('UPDATE subscriptions'))
    expect(subscriptionWrites).toHaveLength(1)
    expect(subscriptionWrites[0]!.sql).toBe('UPDATE subscriptions SET user_id = $2 WHERE user_id = $1')
  })

  it('une ligne de grand livre (delta 0) trace le changement de porteur, et l’historique de l’espace suit', async () => {
    const db = freshDb()
    await new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)

    const transferLines = db.ledger.filter(r => r['kind'] === 'ownership_transfer')
    expect(transferLines).toHaveLength(1)
    expect(transferLines[0]).toMatchObject({ owner_user_id: NEW, workspace_id: WS, delta: 0 })
    expect(String(transferLines[0]!['reason'])).toContain('12/40')
    expect(db.ledger.find(r => r['kind'] === 'consume_analysis' && r['workspace_id'] === WS)!['owner_user_id']).toBe(
      NEW,
    )
  })

  it('isolation : un AUTRE espace (propriétaire, rôles, abonnement, grand livre) reste intact', async () => {
    const db = freshDb()
    await new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)

    expect(db.workspaces[1]).toEqual({ id: OTHER_WS, name: 'Beta ESN', owner_user_id: OTHER_OWNER, is_demo: false })
    expect(db.members.filter(m => m.workspace_id === OTHER_WS).map(m => [m.user_id, m.role])).toEqual([
      [OTHER_OWNER, 'owner'],
      [NEW, 'admin'],
    ])
    expect(db.subscriptions.find(r => r['user_id'] === OTHER_OWNER)).toMatchObject({
      plan: 'growth',
      accounts_limit: 99,
    })
    expect(db.ledger.find(r => r['workspace_id'] === OTHER_WS)!['owner_user_id']).toBe(OTHER_OWNER)
  })

  it('refus si la cible n’est pas admin : rien n’est écrit', async () => {
    const db = freshDb()
    db.members.find(m => m.workspace_id === WS && m.user_id === NEW)!.role = 'member'
    await expect(new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)).rejects.toMatchObject({
      response: { code: 'not_admin' },
    })
    expect(db.writes).toEqual([])
  })

  it('refus si la facturation est Stripe : message clair, rien n’est écrit', async () => {
    const db = freshDb()
    db.subscriptions[0]!['billing_mode'] = 'stripe'
    const attempt = new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(attempt).rejects.toMatchObject({ response: { code: 'stripe_billing' } })
    expect(db.writes).toEqual([])
    expect(db.workspaces[0]!.owner_user_id).toBe(OLD)
  })

  it('espace inconnu : 404', async () => {
    await expect(
      new WorkspaceOwnershipTransferService(fakeDataSource(freshDb())).transfer('ws-ghost', NEW),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('une cible administratrice d’un AUTRE espace seulement n’est pas membre de celui-ci', async () => {
    const db = freshDb()
    db.members = db.members.filter(m => !(m.workspace_id === WS && m.user_id === NEW))
    await expect(new WorkspaceOwnershipTransferService(fakeDataSource(db)).transfer(WS, NEW)).rejects.toMatchObject({
      response: { code: 'not_member' },
    })
  })

  it('prévisualisation : n’écrit rien, nomme les admins candidats et dit si le transfert passerait', async () => {
    const db = freshDb()
    const preview = await new WorkspaceOwnershipTransferService(fakeDataSource(db)).preview(WS, NEW)
    expect(db.writes).toEqual([])
    expect(preview.plan).toMatchObject({ ok: true, movesSubscription: true })
    expect(preview.workspaceName).toBe('Alpha ESN')
    expect(preview.candidates.map(c => c.userId)).toEqual([NEW])
    expect(preview.currentOwner).toEqual({ userId: OLD, email: 'user-old@esn.test' })
  })
})

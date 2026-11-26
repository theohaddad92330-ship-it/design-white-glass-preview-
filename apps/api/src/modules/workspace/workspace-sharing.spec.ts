import { isSuccess } from '@bellum/utils'
import { WorkspaceContextService } from './workspace-context.service'
import { AccountsService } from '../accounts/accounts.service'

/**
 * End-to-end (query-level) proof of the multi-user Phase 2 sharing contract:
 * two members of the SAME workspace share data, and a member of a DIFFERENT
 * workspace does not. Uses the REAL {@link WorkspaceContextService} +
 * {@link AccountsService} over in-memory repos that actually honour the
 * `workspace_id` predicate — so this exercises the whole chain
 * (resolveActiveWorkspace → stamp on write → workspace-scoped read), not a mock
 * assertion. See `agent_docs/multi-user-workspaces.md`.
 *
 * Fixture: workspace **W** owned by member **A**, with **B** an (invited) member
 * who owns nothing; workspace **V** owned by outsider **C**.
 */

type Ordered = { created_at: string }
type FindOneArgs = { where: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'> }

/** Tiny in-memory repo emulating the `findOne({ where, order })` / `find(...)`
 *  shapes {@link WorkspaceContextService} relies on. Matches every key in
 *  `where` (equality, `In([...])` supported) and applies `order` (ISO
 *  `created_at` sorts chronologically). */
function findOneRepo<T extends Ordered & Record<string, unknown>>(rows: T[]) {
  const matching = (args: FindOneArgs): T[] => {
    let matches = rows.filter(row =>
      Object.entries(args.where).every(([key, value]) => {
        // TypeORM `In([...])` serialises to an object carrying `_value`.
        const list = (value as { _value?: unknown[] })?._value
        return Array.isArray(list) ? list.includes(row[key]) : row[key] === value
      }),
    )
    const order = args.order ? Object.entries(args.order)[0] : undefined
    if (order) {
      const [col, dir] = order
      matches = [...matches].sort((left, right) => {
        const cmp = String(left[col]).localeCompare(String(right[col]))
        return dir === 'ASC' ? cmp : -cmp
      })
    }
    return matches
  }
  return {
    async findOne(args: FindOneArgs): Promise<T | null> {
      return matching(args)[0] ?? null
    },
    async find(args: FindOneArgs): Promise<T[]> {
      return matching(args)
    },
    // `listWorkspaces` counts members with a grouped QueryBuilder; the headcount
    // is cosmetic here, so a stub that yields zero rows keeps this spec focused
    // on WHO can see WHAT.
    createQueryBuilder() {
      const qb = {
        select: () => qb,
        addSelect: () => qb,
        where: () => qb,
        groupBy: () => qb,
        getRawMany: async () => [] as Array<{ workspaceId: string; count: string }>,
      }
      return qb
    },
  }
}

type SelectionRow = { user_id: string; workspace_id: string }

/** In-memory `workspace_active_selections` — the persisted "which workspace am
 *  I working in" choice. Honours `upsert` (one row per user) and `delete`. */
function selectionRepo(rows: SelectionRow[] = []) {
  return {
    async findOne(args: { where: { user_id: string } }): Promise<SelectionRow | null> {
      return rows.find(row => row.user_id === args.where.user_id) ?? null
    },
    async upsert(entity: SelectionRow) {
      const existing = rows.find(row => row.user_id === entity.user_id)
      if (existing) existing.workspace_id = entity.workspace_id
      else rows.push({ ...entity })
      return { identifiers: [], generatedMaps: [], raw: [] }
    },
    async delete(criteria: { user_id: string }) {
      const index = rows.findIndex(row => row.user_id === criteria.user_id)
      if (index >= 0) rows.splice(index, 1)
      return { affected: index >= 0 ? 1 : 0 }
    },
  }
}

type AccountRow = Record<string, unknown> & {
  id: string
  workspace_id: string | null
  status: string
  created_at: string
}

/** In-memory accounts repo that honours the `workspace_id` scope on the
 *  QueryBuilder path (mirrors `accounts.service.spec.ts`), so a write stamped
 *  with workspace W is only returned by a read scoped to W. */
function inMemoryAccountsRepo() {
  const rows: AccountRow[] = []
  const makeQb = () => {
    const preds: Array<(row: AccountRow) => boolean> = []
    let off = 0
    let lim = Number.POSITIVE_INFINITY
    const qb = {
      where(_sql: string, params?: Record<string, unknown>) {
        return qb.andWhere(_sql, params)
      },
      andWhere(_sql: string, params?: Record<string, unknown>) {
        if (params && 'workspaceId' in params) preds.push(row => row.workspace_id === params['workspaceId'])
        if (params && 'deletedStatus' in params) preds.push(row => row.status !== params['deletedStatus'])
        if (params && 'status' in params) preds.push(row => row.status === params['status'])
        return qb
      },
      orderBy() {
        return qb
      },
      // Départage stable du tri « dernière analyse » — sans effet sur ces
      // preuves de cloisonnement, mais le service l'appelle.
      addOrderBy() {
        return qb
      },
      select() {
        return qb
      },
      offset(n: number) {
        off = n
        return qb
      },
      limit(n: number) {
        lim = n
        return qb
      },
      clone() {
        return qb
      },
      async getCount() {
        return rows.filter(row => preds.every(pred => pred(row))).length
      },
      async getRawMany() {
        return rows.filter(row => preds.every(pred => pred(row))).slice(off, off + lim)
      },
    }
    return qb
  }
  return {
    createQueryBuilder: () => makeQb(),
    create: (entity: Partial<AccountRow>) => ({ ...entity }),
    save: async (entity: Partial<AccountRow>) => {
      const row = {
        ...entity,
        id: entity.id ?? `acc-${rows.length + 1}`,
        created_at: (entity.created_at as string) ?? new Date().toISOString(),
      } as AccountRow
      rows.push(row)
      return row
    },
    manager: { query: async () => [] },
  }
}

describe('multi-user Phase 2 — workspace data sharing', () => {
  const at = (day: string) => `2026-01-${day}T00:00:00.000Z`

  let workspaceContext: WorkspaceContextService
  let accounts: AccountsService

  beforeEach(() => {
    const workspaces = findOneRepo([
      { id: 'W', owner_user_id: 'userA', created_at: at('01') },
      { id: 'V', owner_user_id: 'userC', created_at: at('01') },
    ])
    const members = findOneRepo([
      { workspace_id: 'W', user_id: 'userA', role: 'owner', created_at: at('01') },
      { workspace_id: 'W', user_id: 'userB', role: 'member', created_at: at('02') },
      { workspace_id: 'V', user_id: 'userC', role: 'owner', created_at: at('01') },
    ])
    workspaceContext = new WorkspaceContextService(workspaces as never, members as never, selectionRepo() as never)
    // Profil vendeur non exercé ici (scoring « comptes similaires ») → stub vide.
    const esnProfile = { resolveProfileData: async () => ({}) }
    accounts = new AccountsService(inMemoryAccountsRepo() as never, {} as never, workspaceContext, esnProfile as never)
  })

  it('resolves both members of a workspace to that SAME workspace (owner + invited)', async () => {
    // A owns W → owner. B owns nothing but is a member of W → member fallback.
    // C owns a different workspace V.
    await expect(workspaceContext.resolveActiveWorkspace('userA')).resolves.toEqual({
      workspaceId: 'W',
      role: 'owner',
    })
    await expect(workspaceContext.resolveActiveWorkspace('userB')).resolves.toEqual({
      workspaceId: 'W',
      role: 'member',
    })
    await expect(workspaceContext.resolveActiveWorkspace('userC')).resolves.toEqual({
      workspaceId: 'V',
      role: 'owner',
    })
  })

  it('a row member A creates is visible to member B of the same workspace', async () => {
    // Write: A creates an account — AccountsService stamps workspace_id from A's
    // resolved active workspace (W). user_id stays A (created-by).
    const created = await accounts.create('userA', { company_name: 'Acme Corp' })
    expect(isSuccess(created)).toBe(true)

    // Read: B resolves to the SAME workspace W and the workspace-scoped list
    // returns A's account — team sharing works.
    const { workspaceId: wsB } = await workspaceContext.resolveActiveWorkspace('userB')
    const listB = await accounts.findAccountsByWorkspace(wsB)
    expect(listB.data.map(account => account.company_name)).toContain('Acme Corp')
  })

  it('a member of a DIFFERENT workspace does NOT see the row (tenant isolation)', async () => {
    await accounts.create('userA', { company_name: 'Acme Corp' })

    // C is in workspace V, not W → the scoped read must not leak A's account.
    const { workspaceId: wsC } = await workspaceContext.resolveActiveWorkspace('userC')
    const listC = await accounts.findAccountsByWorkspace(wsC)
    expect(listC.data.map(account => account.company_name)).not.toContain('Acme Corp')
  })
})

/**
 * The join scenario the switcher exists for, proven at query level.
 *
 * **D** signed up on their own first (personal workspace **P**, seeded by the
 * signup trigger) and built dossiers there. The ESN that owns workspace **W**
 * then invites them. Before the switcher, D's acceptance wrote a correct
 * `workspace_members` row and D still landed in P forever — the invitation was
 * a silent dead end.
 *
 * What this fixture asserts is the part that must NEVER regress: joining is
 * ADDITIVE (P survives with its data) and BOUNDED (W's members do not gain
 * D's personal dossiers, D does not gain a workspace they were not invited to,
 * and reads follow whichever workspace is active — not the union of both).
 */
describe('multi-user — joining a second workspace with an existing account', () => {
  const at = (day: string) => `2026-01-${day}T00:00:00.000Z`

  let workspaceContext: WorkspaceContextService
  let accounts: AccountsService

  beforeEach(() => {
    const workspaces = findOneRepo([
      { id: 'W', name: 'ESN Skaizen', owner_user_id: 'userA', created_at: at('01') },
      { id: 'P', name: 'Mon espace', owner_user_id: 'userD', created_at: at('01') },
      { id: 'V', name: 'Autre ESN', owner_user_id: 'userC', created_at: at('01') },
    ])
    const members = findOneRepo([
      { workspace_id: 'W', user_id: 'userA', role: 'owner', created_at: at('01') },
      { workspace_id: 'P', user_id: 'userD', role: 'owner', created_at: at('01') },
      // D accepted the ESN's invitation — the membership row the accept writes.
      { workspace_id: 'W', user_id: 'userD', role: 'sales', created_at: at('05') },
      { workspace_id: 'V', user_id: 'userC', role: 'owner', created_at: at('01') },
    ])
    workspaceContext = new WorkspaceContextService(workspaces as never, members as never, selectionRepo() as never)
    const esnProfile = { resolveProfileData: async () => ({}) }
    accounts = new AccountsService(inMemoryAccountsRepo() as never, {} as never, workspaceContext, esnProfile as never)
  })

  it('lands D in the ESN once they switch — the membership alone was never enough', async () => {
    // Before switching, the owned personal workspace still wins (legacy default).
    await expect(workspaceContext.resolveActiveWorkspace('userD')).resolves.toEqual({
      workspaceId: 'P',
      role: 'owner',
    })

    await workspaceContext.switchWorkspace('userD', 'W')

    // After: D resolves to the ESN, with the role the ESN granted them.
    await expect(workspaceContext.resolveActiveWorkspace('userD')).resolves.toEqual({
      workspaceId: 'W',
      role: 'sales',
    })
  })

  it('REFUSES a switch to a workspace D was never invited to (403, nothing persisted)', async () => {
    await expect(workspaceContext.switchWorkspace('userD', 'V')).rejects.toThrow()

    // …and the refusal leaves D exactly where they were — no partial write.
    await expect(workspaceContext.resolveActiveWorkspace('userD')).resolves.toEqual({
      workspaceId: 'P',
      role: 'owner',
    })
  })

  it("keeps D's personal dossiers OUT of the ESN's reach (no privacy leak on join)", async () => {
    // D built this before ever being invited, in their own workspace.
    await accounts.create('userD', { company_name: 'Dossier Perso' })

    await workspaceContext.switchWorkspace('userD', 'W')
    // The ESN's owner reads their own workspace…
    const { workspaceId: wsA } = await workspaceContext.resolveActiveWorkspace('userA')
    const listA = await accounts.findAccountsByWorkspace(wsA)
    // …and D's personal dossier is NOT there. Joining shares nothing backwards.
    expect(listA.data.map(account => account.company_name)).not.toContain('Dossier Perso')
  })

  it("keeps the ESN's dossiers out of D's personal workspace (no leak forwards)", async () => {
    await workspaceContext.switchWorkspace('userD', 'W')
    await accounts.create('userA', { company_name: 'Grand Compte ESN' })

    // D switches back to their own space — the ESN's account does not follow.
    await workspaceContext.switchWorkspace('userD', 'P')
    const { workspaceId } = await workspaceContext.resolveActiveWorkspace('userD')
    const listD = await accounts.findAccountsByWorkspace(workspaceId)
    expect(listD.data.map(account => account.company_name)).not.toContain('Grand Compte ESN')
  })

  it('never loses the personal dossiers — they are one switch away, not merged', async () => {
    await accounts.create('userD', { company_name: 'Dossier Perso' })
    await workspaceContext.switchWorkspace('userD', 'W')

    // Active in the ESN: the personal dossier is correctly not in scope…
    const inEsn = await accounts.findAccountsByWorkspace(
      (await workspaceContext.resolveActiveWorkspace('userD')).workspaceId,
    )
    expect(inEsn.data.map(account => account.company_name)).not.toContain('Dossier Perso')

    // …but switching back finds it intact. Joining moved nothing and deleted nothing.
    await workspaceContext.switchWorkspace('userD', 'P')
    const back = await accounts.findAccountsByWorkspace(
      (await workspaceContext.resolveActiveWorkspace('userD')).workspaceId,
    )
    expect(back.data.map(account => account.company_name)).toContain('Dossier Perso')
  })

  it('offers both workspaces in the switcher, flagging the active one and their own', async () => {
    await workspaceContext.switchWorkspace('userD', 'W')
    const list = await workspaceContext.listWorkspaces('userD')

    expect(list).toEqual([
      expect.objectContaining({ id: 'P', role: 'owner', isPersonal: true, isActive: false }),
      expect.objectContaining({ id: 'W', role: 'sales', isPersonal: false, isActive: true }),
    ])
  })

  it('never lists a workspace the user does not belong to', async () => {
    const list = await workspaceContext.listWorkspaces('userD')
    expect(list.map(workspace => workspace.id)).not.toContain('V')
  })

  /**
   * Seat revoked while D was parked in the ESN. The stale selection must not
   * keep them reading W's data: the resolver re-proves membership, drops the
   * preference, and D falls back to their own workspace on the next request.
   */
  it('drops an ex-member back to their own workspace the moment the seat is revoked', async () => {
    const selections = selectionRepo([{ user_id: 'userD', workspace_id: 'W' }])
    const workspaces = findOneRepo([
      { id: 'W', name: 'ESN Skaizen', owner_user_id: 'userA', created_at: at('01') },
      { id: 'P', name: 'Mon espace', owner_user_id: 'userD', created_at: at('01') },
    ])
    // D's membership in W is GONE (seat revoked) — only their own remains.
    const members = findOneRepo([
      { workspace_id: 'W', user_id: 'userA', role: 'owner', created_at: at('01') },
      { workspace_id: 'P', user_id: 'userD', role: 'owner', created_at: at('01') },
    ])
    const context = new WorkspaceContextService(workspaces as never, members as never, selections as never)

    await expect(context.resolveActiveWorkspace('userD')).resolves.toEqual({ workspaceId: 'P', role: 'owner' })
    // The dangling preference is cleared, not retried on every request.
    await expect(selections.findOne({ where: { user_id: 'userD' } })).resolves.toBeNull()
  })
})

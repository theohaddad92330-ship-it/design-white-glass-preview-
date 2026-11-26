import { FindOperator } from 'typeorm'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { resolveBrand } from '@bellum/contracts'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceTeamService } from './workspace-team.service'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { createMockRepository } from '../../database/test-utils'

/**
 * #4158.7 / #4158.8 — intégration à DEUX utilisateurs (et plus) sur de VRAIS
 * services : `WorkspaceContextService` (rôles, espace actif) + `WorkspaceTeamService`
 * + `ActionPlanItemsService`, branchés sur des dépôts EN MÉMOIRE qui appliquent
 * réellement les filtres `where` (égalité, `IsNull`, `MoreThan`, `LessThanOrEqual`).
 * Ce n'est pas du mock par appel : un filtre oublié dans le code fait échouer ici.
 *
 * Remplace le scénario e2e `invite.spec.ts` (Tier 3 absent, deux comptes
 * impossibles) : même parcours — invitation, acceptation, arrivée dans LE MÊME
 * espace — joué côté API.
 */
type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key]
    if (expected instanceof FindOperator) {
      const v = expected.value as unknown
      switch (expected.type) {
        case 'isNull':
          return actual === null || actual === undefined
        case 'moreThan':
          return (actual as Date).getTime() > (v as Date).getTime()
        case 'lessThanOrEqual':
          return (actual as Date).getTime() <= (v as Date).getTime()
        case 'in':
          return (v as unknown[]).includes(actual)
        default:
          throw new Error(`opérateur non géré par le fake: ${expected.type}`)
      }
    }
    return actual === expected
  })
}

/** Dépôt en mémoire : find / findOne / save / create / update / delete avec filtres réels. */
function memoryRepo(initial: Row[] = []) {
  const rows: Row[] = [...initial]
  let seq = 0
  const pick = (opts?: { where?: Row | Row[] }) => {
    const w = opts?.where
    if (!w) return rows
    const alternatives = Array.isArray(w) ? w : [w]
    return rows.filter(r => alternatives.some(a => matches(r, a)))
  }
  const repo = createMockRepository<never>()
  repo.find.mockImplementation(async (opts: { where?: Row | Row[] }) => pick(opts))
  repo.findOne.mockImplementation(async (opts: { where?: Row | Row[] }) => pick(opts)[0] ?? null)
  repo.create.mockImplementation((r: Row) => ({ ...r }))
  repo.save.mockImplementation(async (r: Row) => {
    if (!r.id) r.id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
    if (!r.created_at) r.created_at = new Date()
    if (!rows.includes(r)) {
      const at = rows.findIndex(x => x.id === r.id)
      if (at >= 0) rows[at] = r
      else rows.push(r)
    }
    return r
  })
  repo.update.mockImplementation(async (where: Row, patch: Row) => {
    const hit = rows.filter(r => matches(r, where))
    hit.forEach(r => Object.assign(r, patch))
    return { affected: hit.length }
  })
  repo.delete.mockImplementation(async (where: Row) => {
    const keep = rows.filter(r => !matches(r, where))
    const affected = rows.length - keep.length
    rows.splice(0, rows.length, ...keep)
    return { affected }
  })
  return { repo, rows }
}

const WS_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const WS_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const OWNER = 'u-owner'
const SALES_OPS = 'u-salesops'
const BOB = 'u-bob'
const CAROL = 'u-carol' // propriétaire d'un AUTRE espace

function world() {
  const ws = memoryRepo([
    { id: WS_A, name: 'ESN A', owner_user_id: OWNER, created_at: new Date(1) },
    { id: WS_B, name: 'ESN B', owner_user_id: CAROL, created_at: new Date(2) },
  ])
  const members = memoryRepo([
    { workspace_id: WS_A, user_id: OWNER, role: 'owner', created_at: new Date(1) },
    { workspace_id: WS_A, user_id: SALES_OPS, role: 'sales_ops', created_at: new Date(2) },
    { workspace_id: WS_A, user_id: BOB, role: 'sales', created_at: new Date(3) },
    { workspace_id: WS_B, user_id: CAROL, role: 'owner', created_at: new Date(4) },
  ])
  const selections = memoryRepo()
  const invitations = memoryRepo()
  const profiles = memoryRepo([{ user_id: BOB, email: 'bob@a.fr' }])
  const subs = memoryRepo([{ user_id: OWNER, plan: 'team', extra_seats: 5 }])
  const planItems = memoryRepo()
  // #4158.54 — la libération passe par `releaseMemberWork` : `manager.update` (comptes, contacts), puis `manager.query`.
  Object.assign(planItems.repo.manager, { update: jest.fn().mockResolvedValue({ affected: 0 }) })
  planItems.repo.manager.query.mockImplementation(async (_sql: string, [userId, workspaceId]: [string, string]) => {
    // simule la borne SQL « comptes de cet espace » : comptes de WS_A = acc-a
    if (workspaceId === WS_A)
      planItems.rows
        .filter(r => r.assigned_to === userId && r.account_id === 'acc-a')
        .forEach(r => (r.assigned_to = null))
    return []
  })
  const context = new WorkspaceContextService(ws.repo as never, members.repo as never, selections.repo as never)
  const mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) }
  const brands = {
    getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
    getSendingAddress: jest.fn().mockResolvedValue(null),
  }
  const team = new WorkspaceTeamService(
    context,
    { get: jest.fn().mockReturnValue('http://localhost:5173') } as never,
    mailer as never,
    ws.repo as never,
    members.repo as never,
    invitations.repo as never,
    profiles.repo as never,
    subs.repo as never,
    new PlanCatalogService(createMockRepository<never>() as never),
    brands as never,
    undefined,
    undefined,
    undefined,
    undefined,
    planItems.repo as never,
  )
  const accounts = memoryRepo([
    { id: 'acc-a', workspace_id: WS_A },
    { id: 'acc-b', workspace_id: WS_B },
  ])
  const plans = memoryRepo([
    {
      id: 'plan-a',
      account_id: 'acc-a',
      workspace_id: WS_A,
      user_id: OWNER,
      created_at: new Date(),
      weeks: [{ name: 'S1', actions: [{ action: 'Appeler la DSI' }] }],
    },
  ])
  const actionItems = new ActionPlanItemsService(
    planItems.repo as never,
    plans.repo as never,
    createMockRepository<never>() as never,
    accounts.repo as never,
    context,
    createMockRepository<never>() as never,
  )
  return { team, context, mailer, members, invitations, planItems, actionItems }
}

describe('mode équipe — deux utilisateurs réels (#4158.7)', () => {
  it('escalade : sales_ops ne fabrique pas d’admin, ni ne retire ou rétrograde un admin ; owner/admin le peuvent', async () => {
    const w = world()
    await expect(w.team.createInvitation(SALES_OPS, { email: 'x@a.fr', role: 'admin' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(w.invitations.rows).toHaveLength(0)

    const inv = await w.team.createInvitation(OWNER, { email: 'adm@a.fr', role: 'admin' })
    expect(inv.role).toBe('admin')
    await w.members.repo.save({ workspace_id: WS_A, user_id: 'u-admin', role: 'admin' })
    await expect(w.team.removeMember(SALES_OPS, 'u-admin')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(w.team.updateMemberRole(SALES_OPS, 'u-admin', 'sales')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(w.team.updateMemberRole(SALES_OPS, BOB, 'admin')).rejects.toBeInstanceOf(ForbiddenException)
    expect(w.members.rows.find(r => r.user_id === 'u-admin')?.role).toBe('admin')
    expect(w.members.rows.find(r => r.user_id === BOB)?.role).toBe('sales')

    await expect(w.team.updateMemberRole(SALES_OPS, BOB, 'viewer')).resolves.toMatchObject({ role: 'viewer' })
    await expect(w.team.removeMember('u-admin', OWNER)).rejects.toThrow() // l'admin ne retire pas le propriétaire
    await expect(w.team.removeMember(OWNER, 'u-admin')).resolves.toEqual({ removed: true })
  })

  it('parcours d’invitation (ex-e2e #2085.34) : invité accepté dans LE MÊME espace', async () => {
    const w = world()
    const inv = await w.team.createInvitation(SALES_OPS, { email: 'new@a.fr', role: 'sales' })
    expect(w.mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
    const token = w.invitations.rows[0]!.token as string
    const joined = await w.team.acceptInvitation('u-new', 'New@A.fr', token)
    expect(joined).toMatchObject({ workspaceId: WS_A, role: 'sales' })
    expect(w.members.rows.some(r => r.user_id === 'u-new' && r.workspace_id === WS_A)).toBe(true)
    await expect(w.context.resolveActiveWorkspace('u-new')).resolves.toMatchObject({ workspaceId: WS_A })
    expect(inv.email).toBe('new@a.fr')
  })

  it('renvoi : l’ancien lien meurt, le nouveau marche ; un utilisateur d’un autre espace reçoit 404', async () => {
    const w = world()
    await w.team.createInvitation(OWNER, { email: 'new@a.fr', role: 'sales' })
    const row = w.invitations.rows[0]!
    const oldToken = row.token as string

    await expect(w.team.resendInvitation(CAROL, row.id as string)).rejects.toBeInstanceOf(NotFoundException)
    expect(row.token).toBe(oldToken) // rien touché

    const res = await w.team.resendInvitation(SALES_OPS, row.id as string)
    expect(res.emailSent).toBe(true)
    expect(row.token).not.toBe(oldToken)
    await expect(w.team.acceptInvitation('u-new', 'new@a.fr', oldToken)).rejects.toBeInstanceOf(NotFoundException)
    await expect(w.team.acceptInvitation('u-new', 'new@a.fr', row.token as string)).resolves.toMatchObject({
      workspaceId: WS_A,
    })
  })

  it('expiration : libère le siège et le même e-mail peut être ré-invité, qu’un balayage soit passé ou non', async () => {
    const w = world()
    await w.team.createInvitation(OWNER, { email: 'late@a.fr', role: 'sales' })
    w.invitations.rows[0]!.expires_at = new Date(Date.now() - 1000) // périmée, MAIS encore `pending`
    expect((await w.team.getTeam(OWNER)).invitations).toHaveLength(0)
    expect((await w.team.listInvitations(OWNER)).length).toBe(0)

    await expect(w.team.createInvitation(OWNER, { email: 'late@a.fr', role: 'sales' })).resolves.toBeDefined()
    expect(w.invitations.rows.map(r => r.status).sort()).toEqual(['expired', 'pending'])
    // le balayage ne casse rien et ne touche pas la vivante
    await expect(w.team.markExpiredInvitations()).resolves.toBe(0)
    await expect(w.team.acceptInvitation('u-x', 'late@a.fr', 'jeton-inconnu')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retrait : ses actions déléguées retournent au créateur, elles ne disparaissent pas', async () => {
    const w = world()
    await w.planItems.repo.save({ account_id: 'acc-a', user_id: OWNER, assigned_to: BOB, label: 'Relancer' })
    await w.team.removeMember(OWNER, BOB)
    const item = w.planItems.rows[0]!
    expect(item.assigned_to).toBeNull()
    expect(item.user_id).toBe(OWNER)
  })

  it('plan partagé : un collègue de l’espace voit l’état réel ; un autre espace reçoit 404', async () => {
    const w = world()
    await w.planItems.repo.save({
      account_id: 'acc-a',
      user_id: OWNER,
      week_index: 0,
      step_index: 0,
      label: 'Appeler la DSI',
      done: true,
      execution_status: 'done',
      cadence_step: null,
    })
    const seenByBob = await w.actionItems.listForAccount(BOB, 'acc-a')
    expect(seenByBob.map(r => [r.label, r.done])).toEqual([['Appeler la DSI', true]])
    await expect(w.actionItems.listForAccount(CAROL, 'acc-a')).rejects.toBeInstanceOf(NotFoundException)
    await expect(w.actionItems.listPersistedForAccount(CAROL, 'acc-a')).rejects.toBeInstanceOf(NotFoundException)
    // et l'inverse : le compte de B est invisible depuis A
    await expect(w.actionItems.listForAccount(BOB, 'acc-b')).rejects.toBeInstanceOf(NotFoundException)
  })
  // #4158.57-.59 (EX-01, Exteam) — un utilisateur DÉJÀ inscrit avant l'invitation. Tant que le geste de
  // fusion (aperçu puis validation, arbitrage Louis 15/10) n'existe pas, REJOINDRE ne déplace rien :
  // l'espace perso reste entier, à côté, jamais transféré sans accord explicite.
  describe('EX-01 — un solo déjà inscrit rejoint l’ESN', () => {
    const SOLO = 'u-solo'
    const WS_SOLO = 'cccccccc-0000-4000-8000-000000000003'

    async function soloWorld() {
      const w = world()
      // L'espace perso du solo, avec ses propres données (comptes, actions) rattachées à SON espace.
      await w.members.repo.save({ workspace_id: WS_SOLO, user_id: SOLO, role: 'owner', created_at: new Date(5) })
      await w.planItems.repo.save({
        account_id: 'acc-solo',
        user_id: SOLO,
        workspace_id: WS_SOLO,
        label: 'Mon brouillon',
      })
      await w.team.createInvitation(OWNER, { email: 'solo@pro.fr', role: 'sales' })
      const token = w.invitations.rows[0]!.token as string
      return { w, token }
    }

    it('rejoindre n’emporte ni ne déplace rien de l’espace perso : membre, rôle et données restent à leur place', async () => {
      const { w, token } = await soloWorld()
      const personalBefore = JSON.stringify(w.members.rows.filter(r => r.workspace_id === WS_SOLO))
      const itemsBefore = JSON.stringify(w.planItems.rows)

      await expect(w.team.acceptInvitation(SOLO, 'solo@pro.fr', token)).resolves.toMatchObject({ workspaceId: WS_A })

      expect(JSON.stringify(w.members.rows.filter(r => r.workspace_id === WS_SOLO))).toBe(personalBefore)
      expect(JSON.stringify(w.planItems.rows)).toBe(itemsBefore)
      // Un seul siège pris dans l'ESN, et aucun second espace créé pour la personne.
      expect(w.members.rows.filter(r => r.user_id === SOLO && r.workspace_id === WS_A)).toHaveLength(1)
      expect(w.members.rows.filter(r => r.user_id === SOLO)).toHaveLength(2)
    })

    it('rejoindre deux fois ne crée pas de second siège (un seul espace concurrent par ESN)', async () => {
      const { w, token } = await soloWorld()
      await w.team.acceptInvitation(SOLO, 'solo@pro.fr', token)
      await w.team.createInvitation(OWNER, { email: 'solo@pro.fr', role: 'sales' })
      const second = w.invitations.rows.find(r => r.status === 'pending')!.token as string
      await w.team.acceptInvitation(SOLO, 'solo@pro.fr', second)
      expect(w.members.rows.filter(r => r.user_id === SOLO && r.workspace_id === WS_A)).toHaveLength(1)
    })

    it('une invitation vers la mauvaise personne n’ouvre aucun accès (adresse différente → 403, aucun siège écrit)', async () => {
      const { w, token } = await soloWorld()
      const before = w.members.rows.length
      await expect(w.team.acceptInvitation(SOLO, 'autre@pro.fr', token)).rejects.toBeInstanceOf(ForbiddenException)
      expect(w.members.rows).toHaveLength(before)
      expect(w.invitations.rows[0]!.status).toBe('pending')
    })

    it('le jeton d’une ESN n’ouvre pas une AUTRE ESN : l’accès suit l’espace de l’invitation, jamais celui de l’utilisateur', async () => {
      const { w, token } = await soloWorld()
      await w.team.acceptInvitation(SOLO, 'solo@pro.fr', token)
      expect(w.members.rows.some(r => r.user_id === SOLO && r.workspace_id === WS_B)).toBe(false)
    })
  })
})

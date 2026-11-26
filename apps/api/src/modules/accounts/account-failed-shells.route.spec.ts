import { AccountsController } from './accounts.controller'
import { archiveFailedShells, type ShellManager } from './account-failed-shells'
import type { BusinessUnitScopeClause } from './business-unit-scope.clause'

/**
 * #4785 — LA ROUTE EST APPELÉE POUR DE VRAI. Deux gardes avaient parlé (colonne `notes.account_id` inexistante,
 * route sans périmètre BU — GA-336) sans qu'aucun test ne traverse le contrôleur jusqu'au SQL émis.
 * Le contrôleur est réel, la fonction d'archivage est réelle ; seule la base est un double qui trace le SQL.
 */
const WS = '11111111-1111-1111-1111-111111111111'
const BU = '22222222-2222-2222-2222-222222222222'
const USER = { userId: 'user-1', email: 'u@esn.fr' }

function build(scope: BusinessUnitScopeClause) {
  const issued: Array<{ sql: string; params: unknown[] }> = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    issued.push({ sql, params })
    if (/^\s*SELECT/i.test(sql)) return [{ id: 'a' }]
    return [[{ id: 'a' }], 1]
  })
  const manager: ShellManager = { transaction: async cb => cb({ query }) }
  const accountsService = {
    archiveFailedShells: (ws: string, opts: { createdOn: string }, businessUnitScope: BusinessUnitScopeClause) =>
      archiveFailedShells(manager, ws, { ...opts, businessUnitScope }),
  }
  const controller = new AccountsController(
    accountsService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS }) } as never,
    {} as never,
    { track: jest.fn() } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { scopeFor: jest.fn().mockResolvedValue(scope) } as never,
  )
  return { controller, issued }
}

describe('POST /accounts/archive-failed-shells — traverse le contrôleur jusqu’au SQL', () => {
  it('interroge les notes par entity_type/entity_id, jamais par une colonne account_id inexistante', async () => {
    const { controller, issued } = build(null)
    const out = await controller.archiveFailedShells({ createdOn: '2026-10-18' } as never, USER)
    expect(out).toMatchObject({ createdOn: '2026-10-18', candidates: 1, archived: 1 })
    const sql = issued.map(i => i.sql).join('\n')
    expect(sql).toContain("FROM notes n WHERE n.entity_type = 'account' AND n.entity_id = account.id")
    expect(sql).not.toMatch(/n\.account_id/)
  })

  it('un membre cloisonné n’archive que les fiches de son unité (lecture ET écriture)', async () => {
    const { controller, issued } = build({ businessUnitIds: [BU], includeUnassigned: true })
    await controller.archiveFailedShells({ createdOn: '2026-10-18' } as never, USER)
    const [select, update] = issued
    expect(select?.sql).toContain('account.business_unit_id IN (SELECT unnest($3::uuid[]))')
    expect(select?.params).toEqual([WS, '2026-10-18', [BU]])
    expect(update?.sql).toContain('account.business_unit_id IN (SELECT unnest($4::uuid[]))')
    expect(update?.params).toEqual([WS, '2026-10-18', ['a'], [BU]])
  })

  it('un périmètre VIDE ne vaut pas « voit tout » : seules les fiches sans unité', async () => {
    const { controller, issued } = build({ businessUnitIds: [], includeUnassigned: true })
    await controller.archiveFailedShells({ createdOn: '2026-10-18' } as never, USER)
    expect(issued[0]?.sql).toContain('account.business_unit_id IS NULL')
  })
})

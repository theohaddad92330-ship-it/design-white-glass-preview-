import { BadRequestException } from '@nestjs/common'
import { AccountTeamCatchupService } from './account-team-catchup.service'

const WS = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'

// #4996 L2 (Q3, doctrine 18/09 #2543) — rattrapage CIBLÉ (un espace), à la demande, dry-run d'abord, jamais au déploiement.
describe('AccountTeamCatchupService', () => {
  const build = (counts: { team: number; scopes: number; duplicates: number }) => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (/UPDATE account_team_members/.test(sql)) return [[], counts.team]
      if (/UPDATE account_team_scopes/.test(sql)) return [[], counts.scopes]
      if (/FROM account_team_members t\s+JOIN accounts/.test(sql)) return [{ n: String(counts.duplicates) }]
      if (/SELECT count\(\*\)[\s\S]*FROM account_team_members/.test(sql)) return [{ n: String(counts.team) }]
      if (/SELECT count\(\*\)[\s\S]*FROM account_team_scopes/.test(sql)) return [{ n: String(counts.scopes) }]
      return []
    })
    return { service: new AccountTeamCatchupService({ manager: { query } } as never), query }
  }

  it('dry-run : compte les lignes de non-membres et le doublon responsable/co-équipier, n’écrit RIEN', async () => {
    const { service, query } = build({ team: 4, scopes: 2, duplicates: 3 })
    const out = await service.run({ workspaceId: WS, dryRun: true })
    expect(out).toEqual({
      workspaceId: WS,
      dryRun: true,
      departedTeamRows: 4,
      departedScopes: 2,
      responsibleAlsoMember: 3,
      archived: 0,
    })
    expect(query.mock.calls.some(c => /UPDATE/.test(String(c[0])))).toBe(false)
  })

  it('exécution réelle : archive les lignes des non-membres, bornée à l’espace, avec l’auteur humain', async () => {
    const { service, query } = build({ team: 4, scopes: 2, duplicates: 3 })
    const out = await service.run({ workspaceId: WS, dryRun: false, removedBy: ADMIN })
    expect(out.archived).toBe(6)
    const updates = query.mock.calls.filter(c => /UPDATE/.test(String(c[0])))
    expect(updates).toHaveLength(2)
    for (const [sql, params] of updates) {
      expect(String(sql)).toMatch(/workspace_id = \$1/)
      expect(String(sql)).toMatch(/NOT IN \(SELECT user_id FROM workspace_members WHERE workspace_id = \$1\)/)
      expect(params).toEqual([WS, ADMIN])
    }
  })

  it('n’archive PAS le doublon responsable/co-équipier : il est seulement compté (Q3 : commande à la main ensuite)', async () => {
    const { service, query } = build({ team: 0, scopes: 0, duplicates: 5 })
    await service.run({ workspaceId: WS, dryRun: false, removedBy: ADMIN })
    expect(query.mock.calls.some(c => /assigned_to/.test(String(c[0])) && /UPDATE/.test(String(c[0])))).toBe(false)
  })

  it('refuse l’exécution réelle sans auteur (removed_by doit être un humain)', async () => {
    const { service, query } = build({ team: 1, scopes: 0, duplicates: 0 })
    await expect(service.run({ workspaceId: WS, dryRun: false })).rejects.toBeInstanceOf(BadRequestException)
    expect(query).not.toHaveBeenCalled()
  })
})

import { IsNull } from 'typeorm'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import { releaseMemberWork } from './release-member-work'

// #4996 L2 — un partant ne reste pas inscrit (en ligne active) dans les équipes de compte ni dans leurs périmètres.
describe('releaseMemberWork — équipes et périmètres (#4996)', () => {
  const build = () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 })
    const query = jest.fn().mockResolvedValue([])
    return { manager: { update, query } as never, update }
  }

  it('archive ses lignes d’équipe ET ses périmètres dans CET espace, avec l’auteur du retrait', async () => {
    const { manager, update } = build()
    await releaseMemberWork(manager, 'w-1', 'u-partant', 'u-manager')
    for (const entity of [AccountTeamMemberEntity, AccountTeamScopeEntity]) {
      expect(update).toHaveBeenCalledWith(
        entity,
        { workspace_id: 'w-1', user_id: 'u-partant', removed_at: IsNull() },
        { removed_at: expect.any(Date), removed_by: 'u-manager' },
      )
    }
  })

  it('sans auteur fourni (retrait back-office), le partant signe lui-même l’archivage', async () => {
    const { manager, update } = build()
    await releaseMemberWork(manager, 'w-1', 'u-partant')
    expect(update).toHaveBeenCalledWith(
      AccountTeamScopeEntity,
      expect.objectContaining({ workspace_id: 'w-1' }),
      expect.objectContaining({ removed_by: 'u-partant' }),
    )
  })

  it('ne touche jamais les équipes d’un autre espace : le filtre workspace_id est sur chaque archivage', async () => {
    const { manager, update } = build()
    await releaseMemberWork(manager, 'w-1', 'u-partant', 'u-manager')
    const teamCalls = update.mock.calls.filter(c => c[0] === AccountTeamMemberEntity || c[0] === AccountTeamScopeEntity)
    expect(teamCalls).toHaveLength(2)
    expect(teamCalls.every(c => c[1].workspace_id === 'w-1')).toBe(true)
  })
})

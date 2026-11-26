import type { Repository } from 'typeorm'
import type { AnalysisAttackAngle } from '@bellum/contracts'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { AttackAnglesService } from './attack-angles.service'

function makeRepo() {
  const saved: Partial<AttackAngleEntity>[] = []
  return {
    create: jest.fn((x: Partial<AttackAngleEntity>) => x),
    save: jest.fn((rows: Partial<AttackAngleEntity>[]) => {
      saved.push(...rows)
      return Promise.resolve(rows)
    }),
    saved: () => saved,
  }
}

function makeAngle(overrides: Partial<AnalysisAttackAngle> = {}): AnalysisAttackAngle {
  return { title: 'Cloud', description: '', strategy: '', entry_contact_persona: '', ...overrides }
}

describe('AttackAnglesService.bulkInsert', () => {
  it('stamps every row with the active workspace + created-by user, ranked', async () => {
    const repo = makeRepo()
    const svc = new AttackAnglesService(repo as unknown as Repository<AttackAngleEntity>)
    await svc.bulkInsert('acc-1', 'user-1', 'ws-1', [makeAngle({ title: 'Cloud' }), makeAngle({ title: 'Data' })])
    const rows = repo.saved()
    expect(rows).toHaveLength(2)
    // Multi-user Phase 2: rows the pipeline creates MUST carry workspace_id or
    // the (now workspace-scoped) team reads can't see them. user_id stays as
    // created-by attribution.
    for (const row of rows) {
      expect(row.workspace_id).toBe('ws-1')
      expect(row.user_id).toBe('user-1')
      expect(row.account_id).toBe('acc-1')
    }
    expect(rows[0].is_recommended).toBe(true) // first angle recommended
    expect(rows[0].rank).toBe(1)
    expect(rows[1].is_recommended).toBe(false)
    expect(rows[1].rank).toBe(2)
  })

  it('is a no-op on an empty angle list', async () => {
    const repo = makeRepo()
    const svc = new AttackAnglesService(repo as unknown as Repository<AttackAngleEntity>)
    await svc.bulkInsert('acc-1', 'user-1', 'ws-1', [])
    expect(repo.save).not.toHaveBeenCalled()
  })
})

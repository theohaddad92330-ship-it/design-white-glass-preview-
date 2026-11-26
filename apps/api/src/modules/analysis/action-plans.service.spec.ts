import type { Repository } from 'typeorm'
import type { AnalysisActionPlanBody } from '@bellum/contracts'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ActionPlansService } from './action-plans.service'

function makeRepo(rows: Partial<ActionPlanEntity>[] = []) {
  const saved: Partial<ActionPlanEntity>[] = []
  return {
    find: jest.fn().mockResolvedValue(rows),
    create: jest.fn((x: Partial<ActionPlanEntity>) => x),
    save: jest.fn((row: Partial<ActionPlanEntity>) => {
      saved.push(row)
      return Promise.resolve(row)
    }),
    saved: () => saved,
  }
}

const body: AnalysisActionPlanBody = { strategy: 'Bottom-up', justification: 'Quick wins', phases: [] }

describe('ActionPlansService', () => {
  describe('create', () => {
    it('stamps the row with the active workspace + created-by user', async () => {
      const repo = makeRepo()
      const svc = new ActionPlansService(repo as unknown as Repository<ActionPlanEntity>)
      await svc.create('acc-1', 'user-1', 'ws-1', body)
      const row = repo.saved()[0]
      // Multi-user Phase 2: the pipeline-created action plan carries workspace_id
      // so team-scoped reads see it; user_id stays as created-by attribution.
      expect(row.workspace_id).toBe('ws-1')
      expect(row.user_id).toBe('user-1')
      expect(row.account_id).toBe('acc-1')
      expect(row.strategy_type).toBe('Bottom-up')
    })
  })
})

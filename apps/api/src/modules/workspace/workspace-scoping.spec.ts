import { applyWorkspaceScope, WORKSPACE_SCOPE_COLUMN, workspaceScopeWhere } from './workspace-scoping'
import { createMockQueryBuilder } from '../../database/test-utils'

describe('workspace-scoping helpers', () => {
  describe('workspaceScopeWhere (Pattern A)', () => {
    it('produces a { workspace_id } where fragment', () => {
      expect(workspaceScopeWhere('ws-1')).toEqual({ workspace_id: 'ws-1' })
    })

    it('composes with extra predicates via spread', () => {
      expect({ ...workspaceScopeWhere('ws-1'), category: 'sales' }).toEqual({
        workspace_id: 'ws-1',
        category: 'sales',
      })
    })
  })

  describe('applyWorkspaceScope (Pattern B)', () => {
    it('appends "<alias>.workspace_id = :workspaceId" via andWhere and returns the builder', () => {
      const qb = createMockQueryBuilder()
      const returned = applyWorkspaceScope(qb as never, 'doc', 'ws-1')
      expect(qb.andWhere).toHaveBeenCalledWith('doc.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(returned).toBe(qb)
    })
  })

  it('exposes the scope column name as a single source of truth', () => {
    expect(WORKSPACE_SCOPE_COLUMN).toBe('workspace_id')
  })
})

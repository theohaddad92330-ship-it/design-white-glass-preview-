import { ActionPlanItemsService } from './action-plan-items.service'
import { createMockRepository } from '../../database/test-utils'

/**
 * Lectures MCP du plan (relances dues, appartenance à l'espace) — l'écriture
 * d'une étape par un assistant ne doit jamais atteindre un autre espace.
 */
function build() {
  const items = createMockRepository()
  const plans = createMockRepository()
  const actions = createMockRepository()
  const accounts = createMockRepository()
  const contacts = createMockRepository()
  const workspace = { resolveActiveWorkspace: jest.fn(), getMembership: jest.fn() }
  const service = new ActionPlanItemsService(
    items as never,
    plans as never,
    actions as never,
    accounts as never,
    workspace as never,
    contacts as never,
  )
  return { service, items, accounts }
}

describe('ActionPlanItemsService — surface MCP', () => {
  describe('listOpenForUser(..., dueUpToToday)', () => {
    it('borne les échéances à aujourd’hui inclus (<=), jamais seulement le passé', async () => {
      const { service, items } = build()
      await service.listOpenForUser('user-1', 'ws-1', 50, false, true)
      const clauses = items._qb.andWhere.mock.calls.map(call => String(call[0]))
      expect(clauses).toContain('item.due_date <= :today')
      expect(items._qb.andWhere).toHaveBeenCalledWith('item.due_date <= :today', { today: expect.any(String) })
    })

    it('sans le drapeau, aucune borne d’échéance (comportement inchangé)', async () => {
      const { service, items } = build()
      await service.listOpenForUser('user-1', 'ws-1')
      const clauses = items._qb.andWhere.mock.calls.map(call => String(call[0]))
      expect(clauses.some(clause => clause.includes('due_date'))).toBe(false)
    })
  })

  describe('itemInWorkspace', () => {
    it('ligne persistée : vraie seulement si son compte est dans CET espace', async () => {
      const { service, items } = build()
      items._qb.getCount.mockResolvedValueOnce(1)
      await expect(service.itemInWorkspace('11111111-1111-4111-8111-111111111111', 'ws-1')).resolves.toBe(true)
      expect(items._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
    })

    it('ligne persistée d’un autre espace : faux', async () => {
      const { service, items } = build()
      items._qb.getCount.mockResolvedValueOnce(0)
      await expect(service.itemInWorkspace('11111111-1111-4111-8111-111111111111', 'ws-1')).resolves.toBe(false)
    })

    it('étape virtuelle : le compte visé doit être de l’espace', async () => {
      const { service, accounts } = build()
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1' })
      await expect(service.itemInWorkspace('plan:acc-1:0:2', 'ws-1')).resolves.toBe(true)
      expect(accounts.findOne).toHaveBeenCalledWith({
        where: { id: 'acc-1', workspace_id: 'ws-1' },
        select: { id: true },
      })
      accounts.findOne.mockResolvedValueOnce(null)
      await expect(service.itemInWorkspace('plan:acc-9:0:2', 'ws-1')).resolves.toBe(false)
    })

    it('identifiant mal formé : faux, sans requête', async () => {
      const { service, items, accounts } = build()
      await expect(service.itemInWorkspace('plan:nope', 'ws-1')).resolves.toBe(false)
      expect(items.createQueryBuilder).not.toHaveBeenCalled()
      expect(accounts.findOne).not.toHaveBeenCalled()
    })
  })
})

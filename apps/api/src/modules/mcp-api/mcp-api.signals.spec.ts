import { NotFoundException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { McpApiController } from './mcp-api.controller'
import { mcpDueActionsQuerySchema, mcpSignalsQuerySchema, mcpUpdatePlanItemSchema } from './dto/mcp-tools.dto'
import { MCP_SCOPE_KEY } from './mcp-scope.guard'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload
const ITEM = '11111111-1111-4111-8111-111111111111'

function build() {
  const planItems = {
    listOpenForUser: jest.fn().mockResolvedValue([]),
    itemInWorkspace: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue({ id: ITEM, label: 'Relancer', done: true, due_date: null }),
  }
  const signals = {
    findOpportunities: jest.fn().mockResolvedValue({ items: [], market_memory: 'ok' }),
    marketSignals: jest.fn().mockResolvedValue({ status: 'ok', covered: false }),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }
  const controller = new McpApiController(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    planItems as never,
    undefined as never,
    workspaceContext as never,
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    undefined,
    businessUnits as never,
    signals as never,
  )
  return { controller, planItems, signals, workspaceContext }
}

describe('McpApiController — signaux → opportunités', () => {
  it('GET signals : résout l’espace de la personne, jamais un identifiant du client', async () => {
    const { controller, signals } = build()
    const query = mcpSignalsQuerySchema.parse({ q: 'ac', skills: 'data, Python', in_portfolio: 'true', limit: '10' })
    await controller.findOpportunities(user, query as never)
    expect(signals.findOpportunities).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }), {
      q: 'ac',
      skills: 'data, Python',
      inPortfolio: true,
      limit: 10,
    })
  })

  it('GET market/:nom : délègue avec le nom décodé et l’espace', async () => {
    const { controller, signals } = build()
    await controller.getMarketSignals('Soci%C3%A9t%C3%A9%20G', user)
    expect(signals.marketSignals).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }), 'Société G')
  })

  it('GET actions/due : dues aujourd’hui ou en retard, sortie compacte', async () => {
    const { controller, planItems } = build()
    planItems.listOpenForUser.mockResolvedValue([
      {
        id: ITEM,
        account_id: 'acc-1',
        company_name: 'Acme',
        label: 'Relancer le DSI',
        due_date: '2020-01-01',
        execution_status: 'todo',
        owner_name: 'Moi',
        history: { exchanges: [] },
        target: { kind: 'contact', id: 'c1', label: 'Jeanne' },
      },
    ])
    const out = await controller.listDueActions(user, mcpDueActionsQuerySchema.parse({ limit: '5' }) as never)
    expect(planItems.listOpenForUser).toHaveBeenCalledWith('user-1', 'ws-1', 5, false, true)
    expect(out).toEqual({
      items: [
        {
          id: ITEM,
          account_id: 'acc-1',
          company_name: 'Acme',
          label: 'Relancer le DSI',
          due_date: '2020-01-01',
          overdue: true,
          execution_status: 'todo',
        },
      ],
    })
  })

  describe('POST plan-items/:id', () => {
    it('refuse (404) une étape hors de l’espace, sans jamais écrire', async () => {
      const { controller, planItems } = build()
      planItems.itemInWorkspace.mockResolvedValue(false)
      await expect(
        controller.updatePlanItem(ITEM, { done: true, outcome: 'positive' } as never, user),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(planItems.itemInWorkspace).toHaveBeenCalledWith(ITEM, 'ws-1')
      expect(planItems.update).not.toHaveBeenCalled()
    })

    it('fait : transmet done + issue; échéance : transmet due_date', async () => {
      const { controller, planItems } = build()
      await controller.updatePlanItem(ITEM, { done: true, outcome: 'positive' } as never, user)
      expect(planItems.update).toHaveBeenCalledWith('user-1', ITEM, { done: true, outcome: 'positive' })
      await controller.updatePlanItem(ITEM, { due_date: '2026-11-02' } as never, user)
      expect(planItems.update).toHaveBeenLastCalledWith('user-1', ITEM, { due_date: '2026-11-02' })
    })

    it('exige le scope mcp:act; les lectures restent sans scope', () => {
      const scopeOf = (handler: (...args: never[]) => unknown): string | undefined =>
        Reflect.getMetadata(MCP_SCOPE_KEY, handler)
      expect(scopeOf(McpApiController.prototype.updatePlanItem)).toBe('mcp:act')
      expect(scopeOf(McpApiController.prototype.findOpportunities)).toBeUndefined()
      expect(scopeOf(McpApiController.prototype.getMarketSignals)).toBeUndefined()
      expect(scopeOf(McpApiController.prototype.listDueActions)).toBeUndefined()
    })

    it('service des signaux absent : 404 net, pas un 500', async () => {
      const { controller } = build()
      const bare = Object.create(controller) as McpApiController
      Object.assign(bare, { signals: undefined })
      await expect(bare.findOpportunities(user, {} as never)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('schémas', () => {
    it('in_portfolio ne se laisse pas lire « false » comme vrai', () => {
      expect(mcpSignalsQuerySchema.parse({ in_portfolio: 'false' }).in_portfolio).toBe(false)
      expect(mcpSignalsQuerySchema.parse({}).in_portfolio).toBeUndefined()
    })
    it('limit plafonné à 50', () => {
      expect(mcpSignalsQuerySchema.safeParse({ limit: '51' }).success).toBe(false)
    })
    it('fait sans issue refusé; corps vide refusé; échéance null acceptée (effacer)', () => {
      expect(mcpUpdatePlanItemSchema.safeParse({ done: true }).success).toBe(false)
      expect(mcpUpdatePlanItemSchema.safeParse({}).success).toBe(false)
      expect(mcpUpdatePlanItemSchema.safeParse({ done: false }).success).toBe(true)
      expect(mcpUpdatePlanItemSchema.safeParse({ due_date: null }).success).toBe(true)
      expect(mcpUpdatePlanItemSchema.safeParse({ due_date: '02/11/2026' }).success).toBe(false)
    })
  })
})

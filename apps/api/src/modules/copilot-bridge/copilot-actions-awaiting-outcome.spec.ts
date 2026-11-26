import { DEMO_PLAN_TASKS } from '../demo/demo-dataset'
import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #3211.9 (épopée #3234) — « une action sans résultat doit demander ou inférer
 * un outcome ». On ne l'INFÈRE jamais (« Fait » ne porte pas de preuve, un
 * résultat inventé serait une donnée fictive) : la route nomme les actions
 * DÉJÀ ÉCHUES de l'utilisateur dont aucun résultat n'a été déclaré, pour que
 * Laura pose la question. Aucun second calcul de « en retard » : c'est
 * `ActionPlanItemsService.listOpenForUser(..., overdueOnly)`, la même portée
 * que la tuile « En retard » du Dashboard.
 */
describe('CopilotBridgeController.actionsAwaitingOutcome (#3211.9)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }

  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    label: 'Relancer Delphine',
    company_name: 'Stelya',
    due_date: '2020-01-01',
    channel: 'email',
    owner_name: null,
    result: null,
    execution_status: 'todo',
    ...overrides,
  })

  function call(listOpenForUser: jest.Mock | null) {
    return CopilotBridgeController.prototype.actionsAwaitingOutcome.call(
      { workspaceContext, actionItems: listOpenForUser ? { listOpenForUser } : undefined } as never,
      { userId: 'u-1' } as never,
    )
  }

  it('lit la portée « en retard » partagée et ne rend que les actions SANS résultat déclaré', async () => {
    const list = jest
      .fn()
      .mockResolvedValue([row('a1'), row('a2', { result: 'Rendez-vous obtenu' }), row('a3', { result: '   ' })])
    const out = (await call(list)) as { actions: { id: string }[]; truncated: boolean }
    expect(list).toHaveBeenCalledWith('u-1', 'w-1', 200, true)
    expect(out.actions.map(a => a.id)).toEqual(['a1', 'a3'])
    expect(out.truncated).toBe(false)
  })

  it('nomme l’action (libellé, compte, échéance, canal) sans jamais inférer un résultat', async () => {
    const out = (await call(jest.fn().mockResolvedValue([row('a1')]))) as { actions: Record<string, unknown>[] }
    expect(out.actions[0]).toEqual({
      id: 'a1',
      label: 'Relancer Delphine',
      companyName: 'Stelya',
      dueDate: '2020-01-01',
      channel: 'email',
      ownerName: null,
    })
    expect(out.actions[0]).not.toHaveProperty('result')
  })

  it('coupe à 20 et le DIT ; ne prétend jamais une troncature qui n’a pas eu lieu', async () => {
    const many = Array.from({ length: 25 }, (_, i) => row(`a${i}`))
    const out = (await call(jest.fn().mockResolvedValue(many))) as { actions: unknown[]; truncated: boolean }
    expect(out.actions).toHaveLength(20)
    expect(out.truncated).toBe(true)
  })

  it('refuse honnêtement quand le service n’est pas câblé — jamais une liste vide qui dirait « rien à clore »', async () => {
    expect(await call(null)).toEqual({ error: 'actions_awaiting_outcome_unavailable' })
  })

  // Craft rule 9 — la démo n'est pas vide : au moins une action OUVERTE, échue,
  // que l'outil nommera (celle de BlaBlaCar, semée sans résultat).
  it('la démonstration porte une action ouverte et échue, sans résultat, que Laura peut nommer', () => {
    const overdue = DEMO_PLAN_TASKS.filter(
      task => task.dueInDays !== null && task.dueInDays < 0 && (task.executionStatus ?? 'todo') === 'todo',
    )
    expect(overdue.length).toBeGreaterThan(0)
  })
})

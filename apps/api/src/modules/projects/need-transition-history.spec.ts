import { ProjectPipelineService } from './project-pipeline.service'

/**
 * #2320.24 (épopée #2967) — Laura peut LIRE l'état de la chaîne commerciale.
 *
 * `CommercialTransitionsService.history()` existait déjà (#2320.23, écrit par
 * `changeNeedStatus`) mais n'avait aucun appelant — aucun controller ne la
 * servait, aucun écran ni outil ne la lisait (`demo-coverage.ts`). Cette porte
 * de service est le PREMIER appelant : le statut actuel d'un besoin, plus son
 * historique de transition complet, scopés à l'espace ACTIF — jamais un besoin
 * d'un autre espace.
 */
describe('ProjectPipelineService.needTransitionHistory (#2320.24)', () => {
  const build = (need: Record<string, unknown> | null, history: unknown[] = []) => {
    const needs = { findOne: jest.fn().mockResolvedValue(need) }
    const commercialTransitions = { history: jest.fn().mockResolvedValue(history) }
    const service = new ProjectPipelineService(
      { findOne: jest.fn() } as never,
      needs as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      commercialTransitions as never,
    )
    return { service, needs, commercialTransitions }
  }

  it("rend le statut ACTUEL et l'historique complet, scopés à l'espace", async () => {
    const entries = [
      {
        id: 't-1',
        subjectType: 'need',
        subjectId: 'n-1',
        fromState: 'to_qualify',
        toState: 'qualified',
        actorId: 'u-1',
        proof: null,
        nextAction: null,
        occurredAt: '2026-09-20T10:00:00.000Z',
      },
    ]
    const { service, needs, commercialTransitions } = build(
      { id: 'n-1', workspace_id: 'w-1', status: 'qualified' },
      entries,
    )
    const result = await service.needTransitionHistory('w-1', 'n-1')
    expect(needs.findOne).toHaveBeenCalledWith({ where: { id: 'n-1', workspace_id: 'w-1' } })
    expect(commercialTransitions.history).toHaveBeenCalledWith('need', 'n-1', 'w-1')
    expect(result).toEqual({ needId: 'n-1', status: 'qualified', transitions: entries })
  })

  it("`null` quand le besoin n'existe pas, ou appartient à un AUTRE espace — jamais l'historique d'un besoin qu'on ne voit pas", async () => {
    const { service, commercialTransitions } = build(null)
    const result = await service.needTransitionHistory('w-1', 'n-inconnu')
    expect(result).toBeNull()
    expect(commercialTransitions.history).not.toHaveBeenCalled()
  })

  it('une liste vide (aucune transition encore enregistrée) reste une liste vide, jamais une erreur', async () => {
    const { service } = build({ id: 'n-1', workspace_id: 'w-1', status: 'to_qualify' }, [])
    const result = await service.needTransitionHistory('w-1', 'n-1')
    expect(result).toEqual({ needId: 'n-1', status: 'to_qualify', transitions: [] })
  })
})

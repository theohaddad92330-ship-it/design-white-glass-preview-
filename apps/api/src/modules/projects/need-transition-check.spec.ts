import { ProjectPipelineService } from './project-pipeline.service'

/**
 * #2320.26 / #2320.27 (épopée #2967) — Laura peut PRÉPARER une transition
 * SANS l'exécuter, et SIGNALER ce qui manque pour transitionner.
 *
 * `changeNeedStatus` calcule déjà ce verdict (ordre des statuts, les deux
 * gates need-level #2323.23/#2323.25, le motif obligatoire) juste avant
 * d'ÉCRIRE. `needTransitionCheck` est la même question posée SANS écrire —
 * même calcul, jamais un second (GA-26) : les deux méthodes partagent
 * `needTransitionVerdict`, testé ici à travers la porte de lecture.
 */
describe('ProjectPipelineService.needTransitionCheck (#2320.26/.27)', () => {
  const build = (need: Record<string, unknown> | null, submissions: Record<string, unknown>[] = []) => {
    const needs = {
      findOne: jest.fn().mockResolvedValue(need),
      manager: { query: jest.fn().mockResolvedValue(submissions) },
    }
    const service = new ProjectPipelineService(
      { findOne: jest.fn() } as never,
      needs as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { history: jest.fn() } as never,
    )
    return { service, needs }
  }

  const need = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    workspace_id: 'w-1',
    status: 'to_qualify',
    ...over,
  })

  it("`null` quand le besoin n'existe pas, ou appartient à un AUTRE espace", async () => {
    const { service } = build(null)
    expect(await service.needTransitionCheck('w-1', 'n-absent', 'qualified')).toBeNull()
  })

  it('signale — jamais ne bloque en silence — un saut de qualification', async () => {
    const { service } = build(need())
    const check = await service.needTransitionCheck('w-1', 'n-1', 'matching')
    expect(check).toMatchObject({
      currentStatus: 'to_qualify',
      allowed: false,
      reason:
        'Ce besoin doit d’abord passer par l’étape précédente — sauter la qualification lance un matching à vide.',
      requiresReason: false,
    })
  })

  it("signale l'absence d'accord consultant avant PRÉSENTER — aucun positionnement à présenter", async () => {
    const { service } = build(need({ status: 'submitted' }), [])
    const check = await service.needTransitionCheck('w-1', 'n-1', 'client_review')
    expect(check?.allowed).toBe(false)
    expect(check?.reason).toContain('accord consultant')
  })

  it("signale l'absence de consultant engagé avant GAGNÉ", async () => {
    const { service } = build(need({ status: 'negotiation' }), [{ stage: 'presented', substatus: 'presented' }])
    const check = await service.needTransitionCheck('w-1', 'n-1', 'won')
    expect(check?.allowed).toBe(false)
    expect(check?.reason).toContain('consultant engagé')
  })

  it('une transition permise dit VRAI, et nomme si un motif sera exigé', async () => {
    const { service } = build(need({ status: 'to_qualify' }))
    const check = await service.needTransitionCheck('w-1', 'n-1', 'qualified')
    expect(check).toMatchObject({ currentStatus: 'to_qualify', allowed: true, reason: null, requiresReason: false })
  })

  it('une clôture permise nomme que le motif sera exigé', async () => {
    const { service } = build(need({ status: 'client_review' }))
    const check = await service.needTransitionCheck('w-1', 'n-1', 'lost')
    expect(check).toMatchObject({ currentStatus: 'client_review', allowed: true, reason: null, requiresReason: true })
  })

  // #2967 (lot V39) — la même transition lue dans la machine CANONIQUE.
  it('nomme les stades canoniques et les preuves que les gardes traversées exigent (#2320.27)', async () => {
    const { service } = build(need({ status: 'matching' }))
    const check = await service.needTransitionCheck('w-1', 'n-1', 'shortlist_ready')
    expect(check?.canonical).toEqual({
      fromStage: 'match',
      toStage: 'shortlist',
      missingEvidence: ['criteria_review', 'unknowns_review'],
      requiresHumanValidation: true,
    })
  })

  it('une proposition de Laura exige TOUJOURS une validation humaine, même sans garde (#2320.28)', async () => {
    const { service } = build(need({ status: 'to_qualify' }))
    const check = await service.needTransitionCheck('w-1', 'n-1', 'on_hold')
    expect(check?.canonical).toMatchObject({ toStage: 'en_veille', missingEvidence: [], requiresHumanValidation: true })
  })

  it("ne fait AUCUNE écriture — c'est une lecture, jamais une exécution", async () => {
    const { service, needs } = build(need())
    const saveSpy = jest.fn()
    ;(needs as unknown as { save: typeof saveSpy }).save = saveSpy
    await service.needTransitionCheck('w-1', 'n-1', 'qualified')
    expect(saveSpy).not.toHaveBeenCalled()
  })
})

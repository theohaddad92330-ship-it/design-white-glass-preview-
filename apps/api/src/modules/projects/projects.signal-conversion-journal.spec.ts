import { ProjectsService } from './projects.service'

/**
 * #2320.14 (épopée #2967) — Signal→Piste rejoint le journal APPEND-ONLY sous
 * le sixième sujet `'signal'` (migration `1796340800001`) : `applyConversion`
 * ("LA CONVERSION D'UNE PISTE", #2172.36→.40) faisait déjà le geste — poser
 * un porteur et un objectif sur une opportunité encore `detected`/`potential`
 * (INTAKE_STAGES) — sans jamais l'écrire dans le journal. L'objectif saisi
 * EST l'interprétation explicable que #2320.14 demande : jamais une seconde
 * donnée à inventer.
 */
describe('ProjectsService — Signal→Piste rejoint le journal (#2320.14)', () => {
  const row = { id: 'p-1', account_id: 'acc-1', label: 'Migration Cloud', stage: 'qualified' }

  const build = (overrides: { selectRows?: unknown[]; updateRows?: unknown[]; record?: jest.Mock } = {}) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(overrides.selectRows ?? [{ stage: 'detected' }])
      .mockResolvedValueOnce(overrides.updateRows ?? [row])
    const repo = { manager: { query } }
    const record = overrides.record ?? jest.fn().mockResolvedValue(undefined)
    const commercialTransitions = { history: jest.fn().mockResolvedValue([]), record }
    const service = new ProjectsService(repo as never, undefined, commercialTransitions as never)
    return { service, query, commercialTransitions, record }
  }

  it('journalise la conversion sous le sujet `signal`, `proof` = objectif saisi', async () => {
    const { service, commercialTransitions } = build()

    await service.applyConversion(
      'p-1',
      'w-1',
      { stage: 'qualified', ownerId: 'u-2', objective: 'Cadrer le RFP Q4' },
      'u-1',
    )

    expect(commercialTransitions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w-1',
        subjectType: 'signal',
        subjectId: 'p-1',
        fromState: 'detected',
        toState: 'piste',
        actorId: 'u-1',
        proof: 'Cadrer le RFP Q4',
      }),
    )
  })

  it('`fromState` reflète l’étape RÉELLE avant conversion, jamais devinée', async () => {
    const { service, commercialTransitions } = build({ selectRows: [{ stage: 'potential' }] })

    await service.applyConversion('p-1', 'w-1', { stage: 'confirmed', ownerId: 'u-2', objective: 'Brief reçu' }, 'u-1')

    expect(commercialTransitions.record).toHaveBeenCalledWith(expect.objectContaining({ fromState: 'potential' }))
  })

  it('best-effort : une erreur de journal ne fait pas échouer la conversion', async () => {
    const record = jest.fn().mockRejectedValue(new Error('db down'))
    const { service } = build({ record })

    const result = await service.applyConversion(
      'p-1',
      'w-1',
      { stage: 'qualified', ownerId: 'u-2', objective: 'Cadrer le RFP Q4' },
      'u-1',
    )

    expect(result).toEqual(row)
  })

  it('sans acteur identifié, `actorId` est `null` — jamais deviné', async () => {
    const { service, commercialTransitions } = build()

    await service.applyConversion('p-1', 'w-1', { stage: 'qualified', ownerId: 'u-2', objective: 'Cadrer le RFP Q4' })

    expect(commercialTransitions.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }))
  })

  it('sans lecture préalable de l’étape (ligne absente), ne journalise rien', async () => {
    const { service, commercialTransitions } = build({ selectRows: [] })

    await service.applyConversion(
      'p-1',
      'w-1',
      { stage: 'qualified', ownerId: 'u-2', objective: 'Cadrer le RFP Q4' },
      'u-1',
    )

    expect(commercialTransitions.record).not.toHaveBeenCalled()
  })
})

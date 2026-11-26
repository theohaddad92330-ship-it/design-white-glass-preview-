import { BadRequestException } from '@nestjs/common'
import { ProjectsController } from './projects.controller'

/**
 * #4195 (lot L4) — retenir un positionnement passe le besoin à « pourvu » quand
 * l'effectif est atteint. L'orchestration vit au contrôleur : `ConsultantsModule`
 * n'importe jamais `ProjectsModule`.
 */
describe('ProjectsController — retenir un positionnement (#4195)', () => {
  const build = (opts: { status: string; headcount: number; retained: number; refuse?: string }) => {
    const need = { id: 'n-1', project_id: 'p-1', status: opts.status, headcount: opts.headcount }
    const pipeline = {
      getNeed: jest.fn().mockResolvedValue(need),
      changeNeedStatus: jest.fn().mockImplementation(() => {
        if (opts.refuse) throw new BadRequestException(opts.refuse)
        return Promise.resolve({ ...need, status: 'won' })
      }),
    }
    const submissions = {
      advance: jest.fn().mockResolvedValue({ id: 's-1', stage: 'accepted', consultantName: 'Alice Martin' }),
      acceptedForOpportunity: jest
        .fn()
        .mockResolvedValue(Array.from({ length: opts.retained }, (_, i) => ({ id: `s-${i + 1}`, needId: 'n-1' }))),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const none = {} as never
    const controller = new ProjectsController(
      none,
      pipeline as never,
      none,
      workspaceContext as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      undefined,
      undefined,
      undefined,
      undefined,
      submissions as never,
    )
    return { controller, pipeline, submissions }
  }
  const user = { userId: 'u-1' } as never
  const retain = (c: ProjectsController) => c.retainSubmission('n-1', 's-1', {} as never, user)

  it('effectif 1, un retenu → le besoin passe à « pourvu » avec le nom du retenu', async () => {
    const { controller, pipeline, submissions } = build({ status: 'negotiation', headcount: 1, retained: 1 })

    const result = await retain(controller)

    expect(submissions.advance).toHaveBeenCalledWith('u-1', 's-1', expect.objectContaining({ stage: 'accepted' }))
    expect(pipeline.changeNeedStatus).toHaveBeenCalledWith(
      'w-1',
      'n-1',
      'won',
      'Pourvu : Alice Martin retenu',
      'u-1',
      'human',
    )
    expect(result.need).toMatchObject({ status: 'won', changed: true })
  })

  it('effectif 2, un seul retenu → le besoin reste inchangé', async () => {
    const { controller, pipeline } = build({ status: 'negotiation', headcount: 2, retained: 1 })

    const result = await retain(controller)

    expect(pipeline.changeNeedStatus).not.toHaveBeenCalled()
    expect(result.need).toMatchObject({ status: 'negotiation', changed: false })
  })

  it.each(['on_hold', 'to_reactivate', 'won', 'lost', 'cancelled'])('statut « %s » → jamais touché', async status => {
    const { controller, pipeline } = build({ status, headcount: 1, retained: 1 })

    const result = await retain(controller)

    expect(pipeline.changeNeedStatus).not.toHaveBeenCalled()
    expect(result.need.changed).toBe(false)
  })

  it('transition refusée → besoin inchangé, la réponse dit pourquoi', async () => {
    const { controller } = build({ status: 'matching', headcount: 1, retained: 1, refuse: 'Étape précédente d’abord.' })

    const result = await retain(controller)

    expect(result.submission).toMatchObject({ stage: 'accepted' })
    expect(result.need).toMatchObject({ status: 'matching', changed: false, reason: 'Étape précédente d’abord.' })
  })
})

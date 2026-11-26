import { LockedEmailCatchupController } from './locked-email-catchup.controller'

describe('LockedEmailCatchupController', () => {
  const outcome = { dry_run: true, concerned: 4, estimated_credits: 4, enqueued: 0, skipped: 0 }
  const build = () => {
    const catchup = { run: jest.fn().mockResolvedValue(outcome) }
    return { controller: new LockedEmailCatchupController(catchup as never), catchup }
  }

  it('appelle le rattrapage pour UN espace, en simulation par défaut', async () => {
    const { controller, catchup } = build()
    const result = await controller.run({ workspaceId: 'ws-1', dryRun: true } as never)
    expect(catchup.run).toHaveBeenCalledWith({ workspaceId: 'ws-1', dryRun: true, limit: undefined })
    expect(result).toEqual(outcome)
  })

  it('le mode réel se DEMANDE : `dryRun: false` et la borne sont transmis tels quels', async () => {
    const { controller, catchup } = build()
    await controller.run({ workspaceId: 'ws-1', dryRun: false, limit: 25 } as never)
    expect(catchup.run).toHaveBeenCalledWith({ workspaceId: 'ws-1', dryRun: false, limit: 25 })
  })

  it('est gardée par le secret interne (jamais publique)', () => {
    const guards = Reflect.getMetadata('__guards__', LockedEmailCatchupController) as { name: string }[]
    expect(guards.map(g => g.name)).toContain('InternalSecretGuard')
  })
})

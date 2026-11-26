import { PlaceholderEmailCatchupController } from './placeholder-email-catchup.controller'

// #4599 — le service de rattrapage existait SANS appelant. Cette porte est le seul chemin d'opérateur vers lui.
describe('PlaceholderEmailCatchupController (#4599)', () => {
  const outcome = { dry_run: true, examined: 10, cleared: 2, skipped: 0 }
  const build = () => {
    const catchup = { run: jest.fn().mockResolvedValue(outcome) }
    return { controller: new PlaceholderEmailCatchupController(catchup as never), catchup }
  }

  it('appelle le rattrapage pour UN espace, en simulation par défaut', async () => {
    const { controller, catchup } = build()
    const result = await controller.run({ workspaceId: 'ws-1', dryRun: true })
    expect(catchup.run).toHaveBeenCalledWith({ workspaceId: 'ws-1', dryRun: true })
    expect(result).toEqual(outcome)
  })

  it('le mode réel se DEMANDE : `dryRun: false` est transmis tel quel', async () => {
    const { controller, catchup } = build()
    await controller.run({ workspaceId: 'ws-1', dryRun: false })
    expect(catchup.run).toHaveBeenCalledWith({ workspaceId: 'ws-1', dryRun: false })
  })

  it('est gardée par le secret interne (jamais publique)', () => {
    const guards = Reflect.getMetadata('__guards__', PlaceholderEmailCatchupController) as { name: string }[]
    expect(guards.map(g => g.name)).toContain('InternalSecretGuard')
  })
})

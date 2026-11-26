import { ForbiddenException } from '@nestjs/common'
import { ChatEvalSamplingController } from './chat-eval-sampling.controller'

/** #2899 — qui peut lire et poser le réglage : tout membre lit, propriétaire/admin pose, jamais la démo. */
function build(opts: { role?: string; demo?: boolean; enabled?: boolean } = {}) {
  const sampling = {
    isEnabled: jest.fn().mockResolvedValue(opts.enabled ?? false),
    set: jest.fn().mockResolvedValue(undefined),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: opts.role ?? 'owner' }),
    assertRole: jest.fn().mockImplementation(async (_u: string, _w: string, roles: string[]) => {
      if (!roles.includes(opts.role ?? 'owner')) throw new ForbiddenException()
    }),
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
  }
  return { controller: new ChatEvalSamplingController(sampling as never, workspaceContext as never), sampling }
}
const USER = { userId: 'u-1' } as never

describe('ChatEvalSamplingController', () => {
  it('tout membre LIT le réglage ; seul propriétaire/admin le change (canEdit)', async () => {
    expect(await build({ role: 'member' }).controller.get(USER)).toEqual({ enabled: false, canEdit: false })
    expect(await build({ role: 'admin', enabled: true }).controller.get(USER)).toEqual({ enabled: true, canEdit: true })
  })

  it('la salle de démonstration se lit éteinte et non modifiable', async () => {
    expect(await build({ role: 'owner', demo: true }).controller.get(USER)).toEqual({ enabled: false, canEdit: false })
  })

  it('le propriétaire pose le réglage', async () => {
    const { controller, sampling } = build()
    expect(await controller.update(USER, { enabled: true })).toEqual({ enabled: true, canEdit: true })
    expect(sampling.set).toHaveBeenCalledWith('ws-1', true)
  })

  it('sait dire NON : un membre ordinaire ne peut pas cocher, la démo non plus', async () => {
    const member = build({ role: 'member' })
    await expect(member.controller.update(USER, { enabled: true })).rejects.toBeInstanceOf(ForbiddenException)
    expect(member.sampling.set).not.toHaveBeenCalled()
    const demo = build({ demo: true })
    await expect(demo.controller.update(USER, { enabled: true })).rejects.toBeInstanceOf(ForbiddenException)
    expect(demo.sampling.set).not.toHaveBeenCalled()
  })
})

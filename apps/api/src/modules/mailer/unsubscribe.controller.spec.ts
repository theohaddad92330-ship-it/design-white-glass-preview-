import { UnsubscribeController } from './unsubscribe.controller'
import { signUnsubscribeToken } from './unsubscribe-token'

const SECRET = 'test-secret-0123456789'

describe('UnsubscribeController', () => {
  let suppression: { isSuppressed: jest.Mock; suppress: jest.Mock }
  let config: { get: jest.Mock }
  let controller: UnsubscribeController

  beforeEach(() => {
    suppression = { isSuppressed: jest.fn(), suppress: jest.fn().mockResolvedValue(undefined) }
    config = { get: jest.fn().mockReturnValue(SECRET) }
    controller = new UnsubscribeController(suppression as never, config as never)
  })

  it('suppresses on a valid token (POST one-click)', async () => {
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'p@corp.fr' }, SECRET)
    expect(await controller.unsubscribePost(token)).toEqual({ ok: true })
    expect(suppression.suppress).toHaveBeenCalledWith('ws-1', 'p@corp.fr', 'unsubscribe')
  })

  it('does not suppress on an invalid/forged token', async () => {
    expect(await controller.unsubscribePost('garbage')).toEqual({ ok: false })
    expect(await controller.unsubscribePost(undefined)).toEqual({ ok: false })
    expect(suppression.suppress).not.toHaveBeenCalled()
  })

  it('GET returns an HTML confirmation and suppresses on a valid token', async () => {
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'p@corp.fr' }, SECRET)
    const html = await controller.unsubscribeGet(token)
    expect(html).toContain('Désabonnement confirmé')
    expect(suppression.suppress).toHaveBeenCalledTimes(1)
  })

  it('GET on an invalid token shows the invalid page and does not suppress', async () => {
    const html = await controller.unsubscribeGet('nope')
    expect(html).toContain('Lien invalide')
    expect(suppression.suppress).not.toHaveBeenCalled()
  })

  it('does not suppress when no signing secret is configured', async () => {
    config.get.mockReturnValue(undefined)
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'p@corp.fr' }, SECRET)
    expect(await controller.unsubscribePost(token)).toEqual({ ok: false })
    expect(suppression.suppress).not.toHaveBeenCalled()
  })
})

import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token'

const SECRET = 'test-internal-secret-0123456789'

describe('unsubscribe-token', () => {
  it('round-trips workspace + lower-cased email', () => {
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'Prospect@Corp.FR' }, SECRET)
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ workspaceId: 'ws-1', email: 'prospect@corp.fr' })
  })

  it('rejects a tampered signature', () => {
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'p@corp.fr' }, SECRET)
    const [payload] = token.split('.')
    expect(verifyUnsubscribeToken(`${payload}.deadbeef`, SECRET)).toBeNull()
  })

  it('rejects a tampered payload (signature no longer matches)', () => {
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'p@corp.fr' }, SECRET)
    const forged = signUnsubscribeToken({ workspaceId: 'ws-2', email: 'p@corp.fr' }, SECRET).split('.')[0]
    const sig = token.split('.')[1]
    expect(verifyUnsubscribeToken(`${forged}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken({ workspaceId: 'ws-1', email: 'p@corp.fr' }, SECRET)
    expect(verifyUnsubscribeToken(token, 'another-secret')).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('nodot', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('a.b.c', SECRET)).toBeNull()
  })
})

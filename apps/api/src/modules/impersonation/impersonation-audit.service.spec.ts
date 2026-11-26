import { ImpersonationAuditService } from './impersonation-audit.service'

function makeRepo(rows: unknown[]) {
  return { find: jest.fn().mockResolvedValue(rows), insert: jest.fn() } as never
}

describe('ImpersonationAuditService#listSessions — #1665.2', () => {
  it('joint start/stop et rend des sessions', async () => {
    const rows = [
      {
        jti: 'a',
        impersonator_actor: 'louis@bellum-it.com',
        target_user_id: 'u1',
        target_email: 'client@esn.test',
        reason: 'Reproduire un bug',
        reason_code: 'incident_constate',
        action: 'start',
        ip: '1.2.3.4',
        correlation_id: null,
        expires_at: new Date(Date.now() + 60_000),
        created_at: new Date(Date.now() - 60_000),
      },
    ]
    const service = new ImpersonationAuditService(makeRepo(rows))
    const sessions = await service.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.actor).toBe('louis@bellum-it.com')
  })

  it('borne la limite entre 1 et 500', async () => {
    const repo = makeRepo([]) as { find: jest.Mock }
    const service = new ImpersonationAuditService(repo as never)
    await service.listSessions(999999)
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }))
    await service.listSessions(-5)
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  })
})

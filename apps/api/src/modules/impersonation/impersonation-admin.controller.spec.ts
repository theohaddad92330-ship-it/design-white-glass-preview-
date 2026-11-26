import { ImpersonationAdminController } from './impersonation-admin.controller'

describe('ImpersonationAdminController#listSessions — #1665.2', () => {
  it('délègue à ImpersonationAuditService#listSessions et enveloppe le résultat', async () => {
    const sessions = [{ jti: 'a' }]
    const audit = { listSessions: jest.fn().mockResolvedValue(sessions) }
    const controller = new ImpersonationAdminController({} as never, audit as never)

    const result = await controller.listSessions(undefined)

    expect(result).toEqual({ sessions })
    expect(audit.listSessions).toHaveBeenCalledWith(undefined)
  })

  it('transmet une limite numérique explicite', async () => {
    const audit = { listSessions: jest.fn().mockResolvedValue([]) }
    const controller = new ImpersonationAdminController({} as never, audit as never)

    await controller.listSessions('50')

    expect(audit.listSessions).toHaveBeenCalledWith(50)
  })
})

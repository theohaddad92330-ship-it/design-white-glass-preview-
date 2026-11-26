import 'reflect-metadata'
import { LemlistController } from './lemlist.controller'

/** #4427 — l'APPELANT des gestes Lemlist : chaque route délègue, avec la bonne permission. */
describe('LemlistController (#4427)', () => {
  const service = {
    status: jest.fn().mockResolvedValue({ connected: false, connectedAt: null }),
    connect: jest.fn(),
    disconnect: jest.fn(),
    campaigns: jest.fn().mockResolvedValue([]),
    pushContact: jest.fn(),
    leadsForContact: jest.fn().mockResolvedValue([]),
  }
  const controller = new LemlistController(service as never)
  const user = { userId: 'u-1' } as never

  it('délègue chaque route au service', async () => {
    await controller.status(user)
    await controller.connect(user, { apiKey: 'k' } as never)
    await controller.disconnect(user)
    await controller.campaigns(user)
    await controller.push(user, { contactId: 'ct-1', campaignId: 'cam_1' } as never)
    await controller.contactLeads(user, 'ct-1')
    expect(service.connect).toHaveBeenCalledWith('u-1', { apiKey: 'k' })
    expect(service.pushContact).toHaveBeenCalledWith('u-1', { contactId: 'ct-1', campaignId: 'cam_1' })
    expect(service.leadsForContact).toHaveBeenCalledWith('u-1', 'ct-1')
  })

  it('connecter = gestion des intégrations ; pousser = export de données', () => {
    const permission = (method: keyof LemlistController) =>
      Reflect.getMetadataKeys(LemlistController.prototype[method])
        .map(key => Reflect.getMetadata(key, LemlistController.prototype[method]))
        .flat()
    expect(permission('connect')).toContain('integrations:manage')
    expect(permission('disconnect')).toContain('integrations:manage')
    expect(permission('push')).toContain('data:export')
  })
})

import { GUARDS_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalLauraUnroutedIntentsController } from './internal-laura-unrouted-intents.controller'

describe('InternalLauraUnroutedIntentsController — #1949.23', () => {
  function make() {
    const intents = { report: jest.fn().mockResolvedValue({ groups: [], withheldGroups: 0 }) }
    return { intents, controller: new InternalLauraUnroutedIntentsController(intents as never) }
  }

  it('est derrière InternalSecretGuard — la seule chose qui protège une lecture cross-tenant', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InternalLauraUnroutedIntentsController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('délègue au service avec la fenêtre lue', async () => {
    const { intents, controller } = make()
    await controller.getReport('30')
    expect(intents.report).toHaveBeenCalledWith(30)
  })

  it('une fenêtre absente ou illisible laisse le service choisir, jamais NaN', async () => {
    const { intents, controller } = make()
    await controller.getReport(undefined)
    await controller.getReport('abc')
    expect(intents.report).toHaveBeenNthCalledWith(1, undefined)
    expect(intents.report).toHaveBeenNthCalledWith(2, undefined)
  })
})

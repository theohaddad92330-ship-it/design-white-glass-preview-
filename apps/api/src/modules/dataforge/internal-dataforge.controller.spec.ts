import { NotFoundException } from '@nestjs/common'
import { InternalDataforgeController } from './internal-dataforge.controller'

describe('InternalDataforgeController', () => {
  function build() {
    const dataforge = { coverage: jest.fn().mockResolvedValue({ accounts: 0 }) }
    const orionAccountsService = {
      coverage: jest.fn().mockResolvedValue({ accounts: 1195 }),
      statusFor: jest.fn(),
    }
    const orionAnomaliesService = {
      list: jest.fn().mockResolvedValue([]),
      coverage: jest.fn().mockResolvedValue({ anomalies: 20 }),
    }
    const orionRagChunksService = { coverage: jest.fn().mockResolvedValue({ chunks: 3849 }) }
    const controller = new InternalDataforgeController(
      dataforge as never,
      orionAccountsService as never,
      orionAnomaliesService as never,
      orionRagChunksService as never,
    )
    return { controller, dataforge, orionAccountsService, orionAnomaliesService, orionRagChunksService }
  }

  it('délègue la couverture DATAFORGE V10', async () => {
    const { controller, dataforge } = build()
    await controller.coverage()
    expect(dataforge.coverage).toHaveBeenCalled()
  })

  it('délègue la couverture ORION (comptes, anomalies, chunks RAG)', async () => {
    const { controller, orionAccountsService, orionAnomaliesService, orionRagChunksService } = build()
    await controller.orionAccountsCoverage()
    await controller.orionAnomaliesCoverage()
    await controller.orionRagChunksCoverage()
    expect(orionAccountsService.coverage).toHaveBeenCalled()
    expect(orionAnomaliesService.coverage).toHaveBeenCalled()
    expect(orionRagChunksService.coverage).toHaveBeenCalled()
  })

  it('rend 404 sur un compte ORION inconnu — jamais une valeur devinée', async () => {
    const { controller, orionAccountsService } = build()
    orionAccountsService.statusFor.mockResolvedValue(null)
    await expect(controller.orionAccountStatus('DF-9999')).rejects.toThrow(NotFoundException)
  })

  it('rend le statut quand le compte existe', async () => {
    const { controller, orionAccountsService } = build()
    orionAccountsService.statusFor.mockResolvedValue({ sourceId: 'DF-0001' })
    await expect(controller.orionAccountStatus('DF-0001')).resolves.toEqual({ sourceId: 'DF-0001' })
  })
})

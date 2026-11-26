import { GUARDS_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalChatEvalSamplesController } from './internal-chat-eval-samples.controller'

/** #2899 / #2443.10 — la porte interne du rejeu : secret interne seul, aucune identité. */
describe('InternalChatEvalSamplesController', () => {
  it('est protégé par le secret interne', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InternalChatEvalSamplesController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('rend les échantillons sous « samples » et transmet la limite', async () => {
    const listForReplay = jest.fn().mockResolvedValue([{ text: 'x', sampledAt: '2026-10-10T00:00:00.000Z' }])
    const controller = new InternalChatEvalSamplesController({ listForReplay } as never)
    await expect(controller.list('25')).resolves.toEqual({
      samples: [{ text: 'x', sampledAt: '2026-10-10T00:00:00.000Z' }],
    })
    expect(listForReplay).toHaveBeenCalledWith(25)
  })

  it('sans limite : le défaut du service', async () => {
    const listForReplay = jest.fn().mockResolvedValue([])
    const controller = new InternalChatEvalSamplesController({ listForReplay } as never)
    await controller.list(undefined)
    expect(listForReplay).toHaveBeenCalledWith(undefined)
  })
})
